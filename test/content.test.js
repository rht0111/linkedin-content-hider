"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Dom = require("../linkedin-dom.js");
const Classifier = require("../classifier.js");
const { normalizeSettings } = require("../settings.js");

// Tiny fixture DOM: supports the semantic selectors used by linkedin-dom.js without third-party packages.
class FixtureElement {
    constructor(tag, attributes = {}, parent = null) {
        this.tagName = tag.toLowerCase();
        this.attributes = attributes;
        this.parentElement = parent;
        this.children = [];
        this.parts = [];
        if (parent) {
            parent.children.push(this);
            parent.parts.push(this);
        }
    }
    getAttribute(name) { return this.attributes[name] ?? null; }
    get textContent() { return this.parts.map(part => typeof part === "string" ? part : part.textContent).join(""); }
    get innerText() { return this.textContent; }
    matches(selector) { return matchesOne(this, selector); }
    closest(selector) {
        for (let current = this; current; current = current.parentElement) {
            if (selector.split(",").some(part => matchesOne(current, part.trim()))) return current;
        }
        return null;
    }
    querySelectorAll(selector) {
        const selectors = selector.split(",").map(part => part.trim());
        const all = [];
        const visit = node => node.children.forEach(child => { all.push(child); visit(child); });
        visit(this);
        return all.filter(node => selectors.some(part => matchesOne(node, part)));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function matchesOne(node, selector) {
    const ignoreCase = /\s+i(?=\])/.test(selector);
    selector = selector.trim().replace(/\s+i(?=\])/g, "");
    const chain = [];
    let part = "";
    let bracketDepth = 0;
    for (const character of selector) {
        if (character === "[") bracketDepth += 1;
        if (/\s/.test(character) && bracketDepth === 0) {
            if (part) chain.push(part);
            part = "";
        } else {
            part += character;
        }
        if (character === "]") bracketDepth -= 1;
    }
    if (part) chain.push(part);
    if (chain.length > 1) {
        if (!matchesOne(node, chain.at(-1))) return false;
        let parent = node.parentElement;
        for (let index = chain.length - 2; index >= 0; index -= 1) {
            while (parent && !matchesOne(parent, chain[index])) parent = parent.parentElement;
            if (!parent) return false;
            parent = parent.parentElement;
        }
        return true;
    }
    if (selector === "*") return true;
    const tag = selector.match(/^[a-z][a-z0-9-]*/i);
    if (tag && node.tagName !== tag[0].toLowerCase()) return false;
    for (const match of selector.matchAll(/\[([^\]=~*^$]+)(?:([*^$]?=)["']?([^\]"']*)["']?)?\]/g)) {
        const [, name, operator, value] = match;
        let actual = node.getAttribute(name.trim());
        if (actual === null) return false;
        let expected = value;
        if (ignoreCase) {
            actual = actual.toLowerCase();
            expected = expected.toLowerCase();
        }
        if (operator === "=" && actual !== expected) return false;
        if (operator === "*=" && !actual.includes(expected)) return false;
    }
    return true;
}

function parseFixture(source) {
    const root = new FixtureElement("document");
    const stack = [root];
    for (const token of source.matchAll(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g)) {
        const value = token[0];
        if (value.startsWith("<!--")) continue;
        if (value.startsWith("</")) { if (stack.length > 1) stack.pop(); continue; }
        if (value.startsWith("<")) {
            const tag = value.match(/^<([a-zA-Z][\w-]*)/)[1];
            const attributes = {};
            for (const match of value.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
                if (match[1] !== tag) attributes[match[1]] = match[2] || "";
            }
            const element = new FixtureElement(tag, attributes, stack.at(-1));
            if (!/\/$/.test(value) && !["br", "img", "input", "meta", "link"].includes(tag)) stack.push(element);
        } else stack.at(-1).parts.push(value.replace(/&amp;/g, "&"));
    }
    return root;
}

const fixtureSource = fs.readFileSync(path.join(__dirname, "fixtures/linkedin-feed.html"), "utf8");
const documentFixture = parseFixture(fixtureSource);
const feed = Dom.findFeed(documentFixture);
const cards = Dom.collectPosts(documentFixture);
const byFixture = name => cards.find(card => card.getAttribute("data-fixture") === name);

test("verified primary content structure detects only Feed post listitems", () => {
    assert.ok(feed);
    assert.equal(cards.length, 3);
    assert.equal(byFixture("composer"), undefined);
    assert.equal(byFixture("control"), undefined);
});

test("unrecognized pages stay untouched and a semantic feed fallback is supported", () => {
    const emptyPage = new FixtureElement("main");
    assert.deepEqual(Dom.collectPosts(emptyPage), []);
    const main = new FixtureElement("main");
    const fallbackFeed = new FixtureElement("div", { role: "feed" }, main);
    const post = new FixtureElement("div", { role: "listitem" }, fallbackFeed);
    new FixtureElement("h2", {}, post).parts.push("Feed post");
    assert.deepEqual(Dom.collectPosts(main), [post]);
});

test("multiple posts are detected and the verified AI-company example is extracted", () => {
    const text = Dom.extractPostText(byFixture("technical"));
    assert.match(text, /Significant capital is flowing into AI deployment/);
    assert.match(text, /Anthropic/);
    assert.doesNotMatch(text, /We are hiring/);
    assert.doesNotMatch(text, /Like/);
});

test("newly inserted post nodes are recognized inside the verified feed", () => {
    assert.deepEqual(Dom.collectPosts(byFixture("technical")), [byFixture("technical")]);
});

test("standalone accessible sponsored label is detected", () => {
    assert.equal(Dom.isSponsored(byFixture("sponsored")), true);
});

test("visible French advertising label is detected", () => {
    const card = new FixtureElement("div", { role: "listitem" });
    new FixtureElement("span", {}, card).parts.push("Publicité");
    assert.equal(Dom.isSponsored(card), true);
});

test("explicit ad DOM attributes are recognized", () => {
    const ad = new FixtureElement("div", { role: "listitem", "data-sponsored": "true" });
    assert.equal(Dom.isSponsored(ad), true);
});

test("word sponsored inside ordinary post body is not ad proof", () => {
    assert.equal(Dom.isSponsored(byFixture("ordinary-word")), false);
    const card = new FixtureElement("div", { role: "listitem" });
    const paragraph = new FixtureElement("p", {}, card);
    new FixtureElement("span", { "aria-label": "Sponsored", title: "Sponsored" }, paragraph).parts.push("Sponsored");
    assert.equal(Dom.isSponsored(card), false);
});

test("AI hype phrases are classified conservatively", () => {
    assert.equal(Classifier.classifyBuiltIn("The future is AI. Unlock the power of AI today.", normalizeSettings().filters), "Generic AI hype");
    assert.equal(Classifier.classifyBuiltIn("The claim that AI will change everything is false.", normalizeSettings().filters), null);
});

test("technical AI research and the verified company discussion remain visible", () => {
    const example = Dom.extractPostText(byFixture("technical"));
    assert.equal(Classifier.getHideReason(example, false, normalizeSettings()), null);
    assert.equal(Classifier.classifyBuiltIn("Our research paper benchmarks AI inference latency.", normalizeSettings().filters), null);
    assert.equal(Classifier.classifyBuiltIn("We released an open source implementation and API.", normalizeSettings().filters), null);
});

test("a mention of AI, OpenAI, Anthropic, ChatGPT, or Claude alone is not a classifier", () => {
    for (const word of ["AI", "OpenAI", "Anthropic", "ChatGPT", "Claude"]) {
        assert.equal(Classifier.classifyBuiltIn(`Discussion: ${word}`, normalizeSettings().filters), null);
    }
});

test("recruitment calls and advice are classified", () => {
    assert.equal(Classifier.classifyBuiltIn("We're hiring: join our team as a product designer.", normalizeSettings().filters), "HR / recruitment");
    assert.equal(Classifier.classifyBuiltIn("Interview tips for your next role.", normalizeSettings().filters), "HR / recruitment");
    assert.equal(Classifier.classifyBuiltIn("We are looking for a solution to this problem.", normalizeSettings().filters), null);
});

test("management advice is classified while an ambiguous mention is preserved", () => {
    assert.equal(Classifier.classifyBuiltIn("Leadership lessons from 20 years in management.", normalizeSettings().filters), "Management / leadership");
    assert.equal(Classifier.classifyBuiltIn("Our manager reviewed the leadership report.", normalizeSettings().filters), null);
});

test("custom topic matching is case-insensitive and respects phrase boundaries", () => {
    assert.equal(Classifier.matchesTopic("We use Climate Policy today", "climate policy"), true);
    assert.equal(Classifier.matchesTopic("climate policymakers met", "climate policy"), false);
});

test("custom Block hides matching topics", () => {
    const settings = normalizeSettings({ customRules: [{ id: "b", topic: "cryptocurrency", action: "block" }] });
    assert.equal(Classifier.getHideReason("A cryptocurrency update", false, settings), "Custom block: cryptocurrency");
});

test("custom Allow overrides custom Block and built-in topic classifiers", () => {
    const settings = normalizeSettings({ customRules: [
        { id: "b", topic: "AI", action: "block" },
        { id: "a", topic: "AI", action: "allow" }
    ] });
    assert.equal(Classifier.getHideReason("The future is AI", false, settings), null);
});

test("Allow cannot override independently enabled sponsored filtering", () => {
    const settings = normalizeSettings({ customRules: [{ id: "a", topic: "product", action: "allow" }] });
    assert.equal(Classifier.getHideReason("A product post", true, settings), "Sponsored / advertisement");
    settings.filters.sponsored = false;
    assert.equal(Classifier.getHideReason("A product post", true, settings), null);
});

test("disabling/removing a rule restores a previously blocked post on re-evaluation", () => {
    const blocked = normalizeSettings({ customRules: [{ id: "b", topic: "climate policy", action: "block" }] });
    const restored = normalizeSettings({ customRules: [{ id: "b", topic: "climate policy", action: "block", enabled: false }] });
    assert.equal(Classifier.getHideReason("Climate policy update", false, blocked), "Custom block: climate policy");
    assert.equal(Classifier.getHideReason("Climate policy update", false, restored), null);
    assert.equal(Classifier.getHideReason("Climate policy update", false, normalizeSettings()), null);
});

test("disabled custom rules are ignored", () => {
    const settings = normalizeSettings({ customRules: [{ id: "b", topic: "private equity", action: "block", enabled: false }] });
    assert.equal(Classifier.getHideReason("Private equity update", false, settings), null);
});

test("disabled master setting restores every category", () => {
    const settings = normalizeSettings({ enabled: false });
    assert.equal(Classifier.getHideReason("The future is AI", false, settings), null);
    assert.equal(Classifier.getHideReason("Post", true, settings), null);
});

test("settings normalization preserves saved toggles and custom rules", () => {
    const saved = {
        enabled: true,
        filters: { sponsored: false, aiHype: false, hrRecruitment: true, management: false },
        customRules: [{ id: "saved", topic: "Climate Policy", action: "allow", enabled: false }]
    };
    assert.deepEqual(normalizeSettings(saved), saved);
});
