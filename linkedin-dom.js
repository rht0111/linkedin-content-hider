(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.LFHLinkedInDom = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const PRIMARY_FEED_SELECTOR = 'main section[aria-label="Primary content"]';
    const FALLBACK_FEED_SELECTORS = ['main [role="feed"]', 'main section[role="feed"]'];
    const POST_SELECTOR = '[role="listitem"]';
    const POST_HEADING = "Feed post";
    const LABEL = /^(?:sponsored|promoted|publicit[eé]|sponsoris[eé]e?)(?:\s*[·•|].*)?$/iu;
    const EXPLICIT_AD_SELECTORS = [
        '[data-is-ad="true"]', '[data-promoted="true"]',
        '[data-sponsored="true"]', '[data-ad-preview="true"]'
    ];

    function textOf(element) {
        return String(element && (element.innerText || element.textContent) || "").replace(/\s+/g, " ").trim();
    }

    function findFeed(documentOrElement) {
        if (!documentOrElement || typeof documentOrElement.querySelector !== "function") return null;
        const primary = documentOrElement.querySelector(PRIMARY_FEED_SELECTOR);
        if (primary) return primary;
        for (const selector of FALLBACK_FEED_SELECTORS) {
            const feed = documentOrElement.querySelector(selector);
            if (feed) return feed;
        }
        return null;
    }

    function hasPostHeading(item) {
        if (!item || item.getAttribute("role") !== "listitem") return false;
        return Array.from(item.querySelectorAll("h2")).some(heading => textOf(heading) === POST_HEADING);
    }

    function findContainingFeed(element) {
        if (!element) return null;
        if (typeof element.closest === "function") {
            return element.closest('section[aria-label="Primary content"], [role="feed"]');
        }
        return null;
    }

    function isPostInFeed(element) {
        return Boolean(findContainingFeed(element) && hasPostHeading(element));
    }

    function collectPosts(root) {
        const recognizedRoot = findFeed(root);
        const feed = recognizedRoot || findContainingFeed(root);
        if (!feed) return [];
        const scope = recognizedRoot || root;
        const posts = new Set();
        if (scope.getAttribute && scope.getAttribute("role") === "listitem" && hasPostHeading(scope)) posts.add(scope);
        if (!recognizedRoot && typeof root.closest === "function") {
            const containingPost = root.closest(POST_SELECTOR);
            if (containingPost && isPostInFeed(containingPost)) posts.add(containingPost);
        }
        if (typeof scope.querySelectorAll === "function") {
            for (const item of scope.querySelectorAll(POST_SELECTOR)) {
                if (hasPostHeading(item)) posts.add(item);
            }
        }
        return Array.from(posts);
    }

    function isExcludedParagraph(paragraph, card) {
        if (typeof paragraph.closest !== "function") return false;
        const excluded = paragraph.closest('button, [role="button"], [role="toolbar"], [role="navigation"], nav, header, footer, aside, [aria-label*="comment" i], [aria-label*="reaction" i], [aria-label*="like" i], [aria-label*="share" i], [data-testid*="comment" i]');
        return Boolean(excluded && excluded !== card);
    }

    function extractPostText(card) {
        if (!card || typeof card.querySelectorAll !== "function") return "";
        const paragraphs = Array.from(card.querySelectorAll("p"))
            .filter(paragraph => !isExcludedParagraph(paragraph, card))
            // textContent includes content hidden behind LinkedIn's collapsed “see more” treatment.
            .map(paragraph => String(paragraph.textContent || paragraph.innerText || "").replace(/\s+/g, " ").trim())
            .filter(Boolean);
        return paragraphs.join("\n").slice(0, 12000);
    }

    function isSponsored(card) {
        if (!card) return false;
        for (const selector of EXPLICIT_AD_SELECTORS) {
            if ((typeof card.matches === "function" && card.matches(selector)) || card.querySelector(selector)) return true;
        }

        const candidates = [card, ...Array.from(card.querySelectorAll('[aria-label], [title], [role="label"], span, small'))];
        for (const element of candidates) {
            const role = element.getAttribute && element.getAttribute("role");
            const attributes = element.getAttribute ? [element.getAttribute("aria-label"), element.getAttribute("title")] : [];
            const visibleText = textOf(element);
            // Post copy can contain the same words; only inspect metadata outside body paragraphs and links.
            const insidePostCopy = typeof element.closest === "function" && element.closest('p, a, button, [role="link"], [role="button"]');
            if (insidePostCopy) continue;
            if (attributes.some(value => LABEL.test(String(value || "").trim()))) return true;
            if (visibleText.length <= 48 && LABEL.test(visibleText) && (role === "label" || element.children.length === 0)) return true;
        }
        return false;
    }

    return { PRIMARY_FEED_SELECTOR, POST_SELECTOR, POST_HEADING, findFeed, hasPostHeading, isPostInFeed, collectPosts, extractPostText, isSponsored };
});
