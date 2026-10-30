# Repository Guidelines

## Project Structure & Module Organization

This repository is a small, dependency-free Chrome Manifest V3 extension. `manifest.json` and the extension scripts/styles are at the root. `linkedin-dom.js` owns LinkedIn selectors and extraction, `classifier.js` owns local filtering rules, and `settings.js` owns shared settings normalization. Popup files are `popup.html`, `popup.js`, and `popup.css`; Node tests and semantic HTML fixtures live under `test/`.

## Build, Test, and Development Commands

There is no build step or external dependency. Run the built-in suite with `npm test` or `node --test` (Node.js 18 or newer). To develop locally, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository directory. After editing files, reload the extension and refresh the LinkedIn feed tab.

Tests use the Node.js built-in runner and `test/*.test.js` naming. Keep production extension code free of external dependencies unless the project explicitly adopts a build process.

## Coding Style & Naming Conventions

Use four spaces for indentation, semicolons, and double quotes in JavaScript, consistent with the existing files. Use `camelCase` for JavaScript variables and functions, uppercase names for module-level constants, and descriptive kebab-case CSS classes. Keep DOM selectors and filtering patterns narrowly scoped to feed posts. This is a negative filter: only hide content with explicit evidence, and preserve posts when classification is uncertain.

## Testing Guidelines

For filtering changes, cover positive matches, near-miss cases that must remain visible, custom allow-rule precedence, and the independent sponsored-content setting. Prefer deterministic Node.js built-in tests for extracted pure logic. Also load the unpacked extension in Chrome to check the popup and dynamically loaded feed behavior; LinkedIn's DOM may change independently of this code.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout, so no repository-specific commit convention can be confirmed. Use concise imperative commit subjects (for example, `Tighten sponsored post detection`). Pull requests should explain behavior changes, list validation performed, link related issues when applicable, and include screenshots for popup UI changes.

## Security & Configuration

Persist user preferences with `chrome.storage.sync`. Do not add external APIs, LLM services, analytics, or telemetry. Keep permissions limited to what the extension needs and avoid logging feed content or personal data.
