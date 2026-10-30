(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.LFHSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const STORAGE_KEY = "lfhSettings";
    const MAX_RULES = 40;
    const DEFAULT_SETTINGS = Object.freeze({
        enabled: true,
        filters: Object.freeze({ sponsored: true, aiHype: true, hrRecruitment: true, management: true }),
        customRules: Object.freeze([])
    });

    function normalizeSettings(raw) {
        const value = raw && typeof raw === "object" ? raw : {};
        const filters = value.filters && typeof value.filters === "object" ? value.filters : {};
        const customRules = Array.isArray(value.customRules)
            ? value.customRules.filter(rule => rule && typeof rule.topic === "string" && ["allow", "block"].includes(rule.action))
                .slice(0, MAX_RULES)
                .map((rule, index) => ({
                    id: String(rule.id || `rule-${index}`),
                    topic: rule.topic.trim().replace(/\s+/g, " ").slice(0, 80),
                    action: rule.action,
                    enabled: rule.enabled !== false
                })).filter(rule => rule.topic.length > 0)
            : [];

        return {
            enabled: value.enabled !== false,
            filters: {
                sponsored: filters.sponsored !== false,
                aiHype: filters.aiHype !== false,
                hrRecruitment: filters.hrRecruitment !== false,
                management: filters.management !== false
            },
            customRules
        };
    }

    return { STORAGE_KEY, MAX_RULES, DEFAULT_SETTINGS, normalizeSettings };
});
