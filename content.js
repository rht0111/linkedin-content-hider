(function () {
    "use strict";

    const { STORAGE_KEY, normalizeSettings } = LFHSettings;
    const Dom = LFHLinkedInDom;
    const Classifier = LFHClassifier;
    // Never hide anything until the user's persisted preferences have loaded.
    let settings = normalizeSettings({ enabled: false });
    let settingsVersion = 0;
    let discoveryObserver = null;
    let feedObserver = null;
    let observedFeed = null;
    let framePending = false;
    let discoveryPending = false;
    const pendingCards = new Set();
    const signatures = new WeakMap();
    const previousReasons = new WeakMap();

    function evaluate(card) {
        if (!card || !card.isConnected) return;
        const text = Dom.extractPostText(card);
        const sponsored = Dom.isSponsored(card);
        const signature = `${settingsVersion}\u0000${sponsored}\u0000${text}`;
        if (signatures.get(card) === signature) return;
        signatures.set(card, signature);

        const reason = Classifier.getHideReason(text, sponsored, settings);
        card.classList.toggle("lfh-hidden", Boolean(reason));
        if (reason) card.setAttribute("data-lfh-reason", reason);
        else card.removeAttribute("data-lfh-reason");

        if (reason && previousReasons.get(card) !== reason) {
            console.debug("[LFH] Hidden post classified", { reason });
        }
        previousReasons.set(card, reason || null);
    }

    function schedule() {
        if (framePending) return;
        framePending = true;
        requestAnimationFrame(() => {
            framePending = false;
            for (const card of pendingCards) evaluate(card);
            pendingCards.clear();
        });
    }

    function queue(card) {
        if (!card || !card.isConnected) return;
        pendingCards.add(card);
        schedule();
    }

    function queuePosts(root) {
        for (const card of Dom.collectPosts(root)) queue(card);
    }

    function processAll() {
        const feed = Dom.findFeed(document);
        if (feed) queuePosts(feed);
    }

    function containingPost(node) {
        const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
        if (!element) return null;
        let current = element;
        while (current && current.getAttribute && current.getAttribute("role") !== "listitem") current = current.parentElement;
        return current && Dom.isPostInFeed(current) ? current : null;
    }

    function restoreUnrecognized(root) {
        if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
        const candidates = root.getAttribute("role") === "listitem"
            ? [root]
            : root.matches('[role="list"], [role="feed"]')
                ? Array.from(root.querySelectorAll('[role="listitem"].lfh-hidden'))
                : [];
        for (const candidate of candidates) {
            if (!Dom.isPostInFeed(candidate) && candidate.classList.contains("lfh-hidden")) {
                candidate.classList.remove("lfh-hidden");
                candidate.removeAttribute("data-lfh-reason");
                signatures.delete(candidate);
                previousReasons.delete(candidate);
            }
        }
    }

    function handleFeedMutations(records) {
        for (const record of records) {
            if (record.type === "attributes" && record.target === observedFeed) scheduleFeedDiscovery();
            const post = containingPost(record.target);
            if (post) queue(post);
            else {
                let candidate = record.target && (record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement);
                while (candidate && !(candidate.classList && candidate.classList.contains("lfh-hidden"))) candidate = candidate.parentElement;
                if (candidate && candidate.classList.contains("lfh-hidden")) {
                    candidate.classList.remove("lfh-hidden");
                    candidate.removeAttribute("data-lfh-reason");
                    signatures.delete(candidate);
                    previousReasons.delete(candidate);
                }
            }
            for (const node of record.addedNodes || []) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    restoreUnrecognized(node);
                    queuePosts(node);
                    const insertedPost = containingPost(node);
                    if (insertedPost) queue(insertedPost);
                }
            }
        }
    }

    function restoreFeed(feed) {
        if (!feed) return;
        const cards = [];
        if (feed.getAttribute("role") === "listitem") cards.push(feed);
        cards.push(...feed.querySelectorAll('[role="listitem"].lfh-hidden'));
        for (const card of cards) {
            if (!card.classList.contains("lfh-hidden")) continue;
            card.classList.remove("lfh-hidden");
            card.removeAttribute("data-lfh-reason");
            signatures.delete(card);
            previousReasons.delete(card);
        }
    }

    function bindFeed(feed = Dom.findFeed(document)) {
        if (!feed || (feed === observedFeed && feed.isConnected)) return;
        if (feedObserver) feedObserver.disconnect();
        observedFeed = feed;
        feedObserver = new MutationObserver(handleFeedMutations);
        feedObserver.observe(feed, {
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["aria-label", "title", "data-is-ad", "data-promoted", "data-sponsored", "data-ad-preview", "role"],
            subtree: true
        });
        processAll();
    }

    function scheduleFeedDiscovery() {
        if (discoveryPending) return;
        discoveryPending = true;
        requestAnimationFrame(() => {
            discoveryPending = false;
            const currentFeed = Dom.findFeed(document);
            if (observedFeed && currentFeed !== observedFeed) {
                if (feedObserver) feedObserver.disconnect();
                restoreFeed(observedFeed);
                feedObserver = null;
                observedFeed = null;
            }
            if (currentFeed) bindFeed(currentFeed);
        });
    }

    function observe() {
        if (!document.body || discoveryObserver) return;
        // Watch only document-level insertions to discover/rebind a feed. Expensive text and
        // metadata observation is scoped to the recognized feed itself.
        discoveryObserver = new MutationObserver(scheduleFeedDiscovery);
        discoveryObserver.observe(document.body, { childList: true, subtree: true });
        bindFeed();
    }

    function onSettingsChanged(value) {
        settings = normalizeSettings(value);
        settingsVersion += 1;
        processAll();
    }

    try {
        chrome.storage.sync.get(STORAGE_KEY, result => {
            if (chrome.runtime.lastError) {
                console.warn("[LFH] Settings could not be loaded.");
                return;
            }
            settings = normalizeSettings(result && result[STORAGE_KEY]);
            settingsVersion += 1;
            processAll();
        });
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === "sync" && changes[STORAGE_KEY]) onSettingsChanged(changes[STORAGE_KEY].newValue);
        });
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message && message.type === "LFH_GET_STATS") {
                const cards = Dom.collectPosts(document);
                sendResponse({ detectedCount: cards.length, hiddenCount: cards.filter(card => card.classList.contains("lfh-hidden")).length });
            }
        });
        if (document.body) observe();
        else document.addEventListener("DOMContentLoaded", observe, { once: true });
    } catch (error) {
        console.warn("[LFH] Content filtering could not initialize.", error && error.message);
    }
})();
