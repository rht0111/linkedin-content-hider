# LinkedIn Content Hider

A local-only Chrome Manifest V3 extension that hides only sponsored posts and explicitly matched AI hype, HR/recruitment, management advice, or user-defined blocked topics. Custom Allow rules override custom blocks and built-in topic filters. Sponsored filtering has its own toggle and cannot be overridden by an Allow rule. Ambiguous content stays visible.

## Install in Windows Chrome

1. Download or clone this repository to a local folder.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the repository folder containing `manifest.json`.
5. Open or refresh `https://www.linkedin.com/feed/`.
6. Use the extension toolbar popup to configure filters and custom topics.

After changing extension files, return to `chrome://extensions`, press the extension's **Reload** button, then refresh the LinkedIn tab. The extension uses `chrome.storage.sync` and does not send feed content to a service.

## Development and tests

There is no build step or third-party dependency. Run the Node.js built-in test suite with:

```sh
npm test
# or
node --test
```

Tests use synthetic markup based on the inspected LinkedIn feed structure. They validate the local adapter and classifier behavior, but do not prove that LinkedIn's live DOM remains unchanged. Confirm live behavior in the authenticated Chrome session after loading the unpacked extension.

## Structure

- `manifest.json`: MV3 permissions, matching URLs, and content-script order.
- `linkedin-dom.js`: semantic feed/post selection, text extraction, and sponsored labels.
- `classifier.js`: conservative built-in classifiers, custom topic matching, and priority rules.
- `settings.js`: shared defaults and migration-safe settings normalization.
- `content.js` / `content.css`: dynamic feed observer, per-post hiding, and restoration.
- `popup.html`, `popup.js`, `popup.css`: controls, rules, and local post counts.
- `test/`: dependency-free Node.js tests and representative fixture markup.
