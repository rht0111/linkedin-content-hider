(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.LFHClassifier = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const AI_HYPE = [
        /\bai (?:will|is going to) change everything\b/i,
        /\bthe future is ai\b/i,
        /\bai is the future\b/i,
        /\bthe ai revolution is here\b/i,
        /\bunlock the power of ai\b/i,
        /\bsupercharge (?:your|our) productivity with ai\b/i,
        /\bai (?:is )?a game[- ]changer\b/i,
        /\b10x (?:your )?productivity with ai\b/i,
        /\bai will replace (?:all|most|every) (?:jobs|workers|employees)\b/i,
        /\b(?:must|need to) use ai or (?:you(?:'ll| will) be left behind|risk being left behind)\b/i,
        /\bai is no longer optional\b/i,
        /\b(?:buy|book|sign up for|try) our ai (?:course|bootcamp|masterclass|tool)\b/i
    ];
    const HR = [
        /\bwe(?:'|’)re hiring\b/i, /\bwe are hiring\b/i, /\bnow hiring\b/i,
        /\bjoin our team\b/i, /\bopen positions? (?:available|at|with)\b/i,
        /\btalent acquisition (?:strategy|trends|tips)\b/i,
        /\bemployer branding (?:strategy|tips|trends)\b/i,
        /\b(?:recruitment|hiring) (?:strategy|strategies|tips|trends)\b/i,
        /\bjob search (?:tips|advice|strategies)\b/i, /\b(?:resume|cv) tips\b/i,
        /\binterview (?:tips|advice|preparation)\b/i,
        /\bhow to prepare for (?:a|your) interview\b/i,
        /\b(?:hr|human resources) (?:trends|strategy|strategies|advice)\b/i
    ];
    const MANAGEMENT = [
        /\bleadership (?:lessons?|advice|tips|principles)\b/i,
        /\bmanagement (?:lessons?|advice|tips|philosoph(?:y|ies))\b/i,
        /\bhow to (?:be|become) a better (?:leader|manager)\b/i,
        /\bexecutive coaching (?:tips|advice|principles)\b/i,
        /\bleadership coaching (?:tips|advice|principles)\b/i,
        /\bmy leadership journey (?:taught|shows|reminded)\b/i,
        /\bcorporate leadership advice\b/i,
        /\bworkplace productivity (?:tips|hacks|advice)\b/i,
        /\b(?:3|5|7|10) (?:lessons|habits|rules) of (?:great )?(?:leadership|management)\b/i
    ];
    const CRITICAL_CONTEXT = /\b(?:not|never|isn't|aren't|don't|doesn't|didn't|false|myth|misconception|debunk\w*|criticiz\w*|disagree\w*|overstated|untrue)\b/i;

    function normalizeText(value) {
        return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    }

    function matchesTopic(text, topic) {
        const normalizedTopic = normalizeText(topic);
        if (!normalizedTopic) return false;
        const escaped = normalizedTopic.split(" ").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
        try {
            return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(normalizeText(text));
        } catch (_) {
            return new RegExp(`(^|\\W)${escaped}(?=$|\\W)`, "i").test(normalizeText(text));
        }
    }

    function hasTechnicalContext(text) {
        return /\b(?:research|paper|benchmark|architecture|model training|inference|dataset|implementation|engineering|engineer|code|source code|open source|api|latency|evaluation|deployment pipeline|technical report|reproducib(?:le|ility)|weights|compiler|gpu|kernel)\b/i.test(text);
    }

    function hasAssertiveMatch(text, patterns) {
        return String(text).split(/[.!?]\s+|\n+/).some(sentence =>
            !CRITICAL_CONTEXT.test(sentence) && patterns.some(pattern => pattern.test(sentence))
        );
    }

    function classifyBuiltIn(text, filters) {
        if (!text) return null;
        if (filters.aiHype && !hasTechnicalContext(text) && hasAssertiveMatch(text, AI_HYPE)) return "Generic AI hype";
        if (filters.hrRecruitment && hasAssertiveMatch(text, HR)) return "HR / recruitment";
        if (filters.management && hasAssertiveMatch(text, MANAGEMENT)) return "Management / leadership";
        return null;
    }

    function getHideReason(text, isSponsored, settings) {
        if (!settings.enabled) return null;
        if (settings.filters.sponsored && isSponsored) return "Sponsored / advertisement";
        const normalized = normalizeText(text);
        const rules = settings.customRules.filter(rule => rule.enabled);
        if (rules.some(rule => rule.action === "allow" && matchesTopic(normalized, rule.topic))) return null;
        const blocked = rules.find(rule => rule.action === "block" && matchesTopic(normalized, rule.topic));
        if (blocked) return `Custom block: ${blocked.topic}`;
        return classifyBuiltIn(normalized, settings.filters);
    }

    return { normalizeText, matchesTopic, hasTechnicalContext, classifyBuiltIn, getHideReason };
});
