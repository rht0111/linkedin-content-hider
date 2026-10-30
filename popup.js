"use strict";

const { STORAGE_KEY, MAX_RULES, normalizeSettings } = LFHSettings;

let settings = normalizeSettings();

const masterEnabled = document.getElementById("masterEnabled");
const topicForm = document.getElementById("topicForm");
const topicInput = document.getElementById("topicInput");
const topicAction = document.getElementById("topicAction");
const topicList = document.getElementById("topicList");
const topicMessage = document.getElementById("topicMessage");
const hiddenCount = document.getElementById("hiddenCount");
const detectedCount = document.getElementById("detectedCount");
const diagnostics = document.getElementById("diagnostics");

async function loadSettings() {
    const result = await chrome.storage.sync.get(STORAGE_KEY);

    settings = normalizeSettings(result[STORAGE_KEY]);

    renderSettings();
}

async function saveSettings() {
    await chrome.storage.sync.set({
        [STORAGE_KEY]: settings
    });

    refreshStats();
}

function renderSettings() {

    masterEnabled.checked = settings.enabled;

    document.querySelectorAll("[data-filter]").forEach(input => {
        const name = input.dataset.filter;
        input.checked = settings.filters[name];
    });

    renderRules();
}

function renderRules() {

    topicList.replaceChildren();

    if (settings.customRules.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-message";
        empty.textContent = "No custom topics added.";
        topicList.appendChild(empty);
        return;
    }

    settings.customRules.forEach(rule => {

        const row = document.createElement("div");
        row.className = "topic-row";

        const topic = document.createElement("span");
        topic.className = "topic-name";
        topic.textContent = rule.topic;

        const type = document.createElement("span");
        type.className = `rule-badge ${rule.action}`;
        type.textContent = rule.action.toUpperCase();

        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = rule.enabled !== false;
        enabled.title = "Enable or disable this rule";

        enabled.addEventListener("change", async () => {
            rule.enabled = enabled.checked;
            await saveSettings();
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-button";
        remove.textContent = "×";
        remove.title = "Remove topic";

        remove.addEventListener("click", async () => {
            settings.customRules = settings.customRules.filter(
                item => item.id !== rule.id
            );

            await saveSettings();
            renderRules();
        });

        const left = document.createElement("div");
        left.className = "topic-info";

        left.append(topic, type);

        row.append(left, enabled, remove);

        topicList.appendChild(row);
    });
}

function createRuleId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const parts = new Uint32Array(4);
    crypto.getRandomValues(parts);
    return Array.from(parts, part => part.toString(16)).join("-");
}

masterEnabled.addEventListener("change", async () => {
    settings.enabled = masterEnabled.checked;
    await saveSettings();
});

document.querySelectorAll("[data-filter]").forEach(input => {

    input.addEventListener("change", async () => {

        const name = input.dataset.filter;

        settings.filters[name] = input.checked;

        await saveSettings();
    });
});

topicForm.addEventListener("submit", async event => {

    event.preventDefault();

    const topic = topicInput.value
        .trim()
        .replace(/\s+/g, " ");

    const action = topicAction.value;

    topicMessage.textContent = "";

    if (!topic) {
        return;
    }

    if (topic.length > 80) {
        topicMessage.textContent = "Maximum topic length is 80 characters.";
        return;
    }

    if (settings.customRules.length >= MAX_RULES) {
        topicMessage.textContent = "Maximum of 40 custom rules reached.";
        return;
    }

    const duplicate = settings.customRules.some(rule =>
        rule.topic.toLowerCase() === topic.toLowerCase() &&
        rule.action === action
    );

    if (duplicate) {
        topicMessage.textContent = "This rule already exists.";
        return;
    }

    settings.customRules.push({
        id: createRuleId(),
        topic,
        action,
        enabled: true
    });

    await saveSettings();

    topicInput.value = "";

    renderRules();

    topicMessage.textContent = "Rule added.";
});

function refreshStats() {

    chrome.tabs.query(
        {
            active: true,
            currentWindow: true
        },
        tabs => {

            const tabId = tabs[0]?.id;

            if (tabId === undefined) {
                hiddenCount.textContent = "N/A";
                return;
            }

            chrome.tabs.sendMessage(
                tabId,
                { type: "LFH_GET_STATS" },
                response => {

                    if (chrome.runtime.lastError || !response) {
                        hiddenCount.textContent = "Open LinkedIn feed";
                        detectedCount.textContent = "—";
                        diagnostics.textContent = "No recognized LinkedIn feed is available in this tab.";
                        return;
                    }

                    hiddenCount.textContent = response.hiddenCount;
                    detectedCount.textContent = response.detectedCount;
                    diagnostics.textContent = "Feed posts checked locally; post text is not transmitted.";
                }
            );
        }
    );
}

async function initialize() {

    try {
        await loadSettings();
        refreshStats();
    } catch (error) {
        console.error("Unable to initialize extension:", error);
        topicMessage.textContent = "Unable to load settings.";
    }
}

initialize();
