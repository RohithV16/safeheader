# SafeHeader (Corporate Security Edition)

[![Documentation](https://img.shields.io/badge/Documentation-rohithv16.github.io%2Fsafeheader-10b981?style=flat&logo=github)](https://rohithv16.github.io/safeheader/)
[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm_Noncommercial_1.0.0-10b981.svg)](LICENSE)

A **100% local, zero-export, security-hardened** browser extension for modifying HTTP request headers, response headers, request cookies, query parameters, and redirects/blocks — built for corporate and local development workflows.

📖 **Official Documentation & Live Guide:** [https://rohithv16.github.io/safeheader/](https://rohithv16.github.io/safeheader/)

> **No backend or local server required.** Once installed in Chrome or Firefox, everything runs locally inside the browser's native `declarativeNetRequest` engine.

---

## Table of Contents
- [Documentation & Visual Guide](https://rohithv16.github.io/safeheader/)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [What You Can Do](#what-you-can-do)
- [Understanding Filter & Scope](#understanding-filter--scope)
- [Corporate Security Controls](#corporate-security-controls)
- [Profiles & Modes](#profiles--modes)
- [Keyboard Shortcuts & Power Features](#keyboard-shortcuts--power-features)
- [Troubleshooting](#troubleshooting)
- [For Maintainers & Chrome Web Store](#for-maintainers--chrome-web-store)

---

## Installation

> 💡 **Visual Installation Guide & Downloads:** See the step-by-step walkthrough at [rohithv16.github.io/safeheader/#installation](https://rohithv16.github.io/safeheader/#installation).

### Option 1: Install from GitHub Releases (Recommended for End Users)
1. Go to the repository's **Releases** page on GitHub and download `safeheader-v<version>.zip`.
2. Unzip the downloaded `.zip` into a folder on your computer.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the unzipped folder (it contains `manifest.json` at the root).
6. Pin **SafeHeader** from the Chrome puzzle-piece Extensions menu for quick access, or open it in the **Side Panel**.

### Option 2: Build Locally from Source
1. Build the extension (`npm install && npm run build`) so `dist/` is generated.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `dist/` folder.

> Requires Chrome 113 or later (`minimum_chrome_version: 113`).

---

## Quick Start

1. Click the **SafeHeader** icon in your Chrome toolbar (or open the Side Panel).
2. Click **`+` (Add rule)** in the top bar and choose a rule type:
   - **Request header** (e.g., `X-Env: staging` or `Authorization: Bearer ...`)
   - **Response header** (e.g., `Access-Control-Allow-Origin: *`)
   - **Add cookie** (e.g., `session_id` = `abc123`)
   - **Query parameter** (add, overwrite, or remove URL query params)
   - **Redirect / Block** (redirect a URL or block matching requests)
   - **URL filter** (restrict where the profile applies)
3. **Scope sensitive rules:** If you add **Add cookie**, `Authorization`, `Cookie`, `*token*`, `*secret*`, `*key*`, `*auth*`, or sensitive query parameters, **Strict Scope Guard** requires either:
   - Clicking **Scope This Site** in the toolbar to auto-add `*://<current-host>/*`, **or**
   - Adding a domain **URL filter** (e.g., `*://*.corp.internal/*`), **or**
   - Clicking **Tab Lock** to lock the profile to the current tab only.
4. Make sure the rule checkbox is checked and the extension is not paused.

---

## What You Can Do

> Rule sections appear automatically as you add rules to keep the workspace clean. Use the **`+`** menu in the top bar to add your first rule in any category.

| Rule Type | What It Does | Example |
|---|---|---|
| **Request headers** | Add, set/overwrite, or remove outgoing HTTP request headers | `X-Debug-User` = `alice` |
| **Response headers** | Add, set/overwrite, or remove incoming HTTP response headers | `Cache-Control` = `no-store` |
| **Add cookies** | Injects `name=value` pairs into outgoing `Cookie` headers across all request types (including `Document` page loads) without touching Chrome's cookie jar | `feature_flag` = `on` |
| **Query parameters** | Append, set, or remove URL query parameters on matching requests | `debug=true` |
| **Redirects & Blocks** | Redirect matching requests to another URL, or block requests (e.g., third-party trackers or mock endpoints) | Block `*://analytics.example.com/*` |
| **Filter** | Control *which* URLs, resource types, and HTTP methods a profile applies to | `*://*.staging.internal/*` |

---

## Understanding Filter & Scope

The **Filter** section controls **where and when** a profile's rules run:

1. **URL Filters (Include / Exclude)**
   - **Include (`Wildcard` or `Regex`):** Only requests matching an enabled Include filter are modified.
     - Wildcard example: `*://*.corp.internal/*` or `*://localhost:3000/*`
     - RE2 Regex example: `^https://api\.example\.com/v[0-9]+/.*`
   - **Exclude:** Skips a domain even if an Include filter (or `*`) matches (e.g., exclude `*://auth.corp.internal/*`).
   - If no Include filter is set, the profile matches **all URLs** (`*`).
2. **Resource Types**
   - Filter by `Document`, `Iframe`, `XHR / Fetch`, `Script`, `Stylesheet`, `Image`, `Font`, `WebSocket`, `Media`, or `Other`.
   - If none are selected, **all** resource types are matched (including `Document` page loads).
   - Tip: Select `XHR / Fetch` if you only want API calls to receive a header.
3. **HTTP Methods**
   - Filter by `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`.
   - If none are selected, **all** HTTP methods are matched.

---

## Corporate Security Controls

SafeHeader is designed so credentials and internal headers never leak across unrelated websites or leave your machine:

- **100% Local Storage & Zero Export:** Profiles and rules stay in `chrome.storage.local`. Profile export, `.json` download, and bulk clipboard export are intentionally disabled. (Local **Import JSON** is supported for migrating existing ModHeader profiles.)
- **Zero Outbound Network Access:** Strict MV3 CSP (`connect-src 'none'`) ensures extension pages cannot make network requests or send telemetry.
- **Strict Scope Guard (On by Default):** Sensitive headers (`Authorization`, `Cookie`, `Set-Cookie`, `*token*`, `*secret*`, `*key*`, `*auth*`), all **Add cookies** rules, and sensitive query parameters are blocked from running globally (`*` or `*://*/*`). Add a domain URL filter to activate them.
- **Secret Masking:** Sensitive header values and all cookie values are masked (`••••••`) in the UI with a per-row eye toggle to reveal when needed.
- **Local Audit Log & One-Click Wipe:** View metadata-only rule/security events or wipe all local storage and active DNR rules from the **Security Controls** shield icon.

---

## Profiles & Modes

- **Switch / Create Profiles:** Use the left profile rail to switch profiles or click `+` to create a new one.
- **Edit Badge & Color:** Click the badge chip (e.g., `1`) in the top-left bar to customize the 1–3 character badge label and profile color.
- **Clone Profile:** Open the `⋮` menu -> **Clone profile** to duplicate a profile (automatically assigns the next profile number when cloning numeric badges).
- **Single-Profile vs. Multi-Profile Mode:** Toggle in the `⋮` menu. In Multi-Profile mode, multiple checked profiles run simultaneously.
- **Undo / Redo & Local Backups:** Supports undo/redo for profile edits and local snapshot recovery.

---

## Surfaces & Power Features

- **Side Panel & Full Options Tab:** Open from the popup or Chrome's Side Panel for more space when editing complex profiles.
- **1-Click Scope This Site:** Automatically adds `*://<active-tab-host>/*` as an Include URL filter on the active profile.

---

## Troubleshooting

- **My header or cookie isn't showing up on requests:**
  1. Check if **Strict Scope Guard** is blocking it because there is no domain URL filter enabled — look for a warning banner in the extension UI.
  2. Check that the extension is **not paused** (pause/play button in the top bar) and the rule's checkbox is checked.
  3. Check **Filter -> Resource Types**: if any chips are selected (e.g. `XHR / Fetch`), `Document` page loads won't match unless `Document` is also selected (or no chips are selected).
  4. Note that Chrome DevTools' Network tab can sometimes display cached or pre-DNR headers; verify against your server logs or the dev `echo-server` utility if needed.

---

## Browser Compatibility

SafeHeader supports both **Chromium** and **Firefox** browsers with dedicated manifest packaging:

- **Chrome, Edge, Brave, Arc, Opera, Vivaldi:** Load unpacked from `dist/` or publish `release/safeheader-v<version>-chrome.zip`.
- **Mozilla Firefox (115+ ESR & modern releases):** Load temporary add-on from `dist-firefox/` (`about:debugging#/runtime/this-firefox`) or publish `release/safeheader-v<version>-firefox.zip`.

---

## For Maintainers & Publishing

### Build & Package
```bash
npm install
npm test
npm run package
```
- `npm run build` compiles `dist/` (Chromium MV3) and generates `dist-firefox/` (Firefox MV3 with `sidebar_action` & gecko ID).
- `npm run package` builds and produces release archives in `release/`:
  - `safeheader-v<version>-chrome.zip` (for Chrome Web Store & Edge Add-ons)
  - `safeheader-v<version>-firefox.zip` (for Mozilla Add-ons AMO)
  - `safeheader-v<version>.zip` (default release bundle)
  - `SHA256SUMS.txt` (verification checksums)

### Loading in Firefox (Dev / Testing)
1. Run `npm run build`.
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**
4. Select `dist-firefox/manifest.json`.

### Optional Dev-Only Test Utility (`echo-server`)
End users do **not** run this. It is an optional local test server for developers to verify wire-level headers and cookies during development:
```bash
npm run echo-server
```
Visit `http://127.0.0.1:4321` in Chrome, add a URL filter `*://127.0.0.1:*/*`, and toggle rules in the extension.

### Chrome Web Store Permission Justifications
- **Single Purpose:** Modify HTTP request/response headers, request cookies, query parameters, and redirects/blocks locally in Chrome using declarative network rules, with zero data export or telemetry.
- **`declarativeNetRequestWithHostAccess`:** Compiles user-defined rules into Chrome's native `declarativeNetRequest` dynamic and session rule engine without intercepting response bodies or running background JS listeners on every request.
- **`host_permissions` (`<all_urls>`):** Required by Chromium's `declarativeNetRequest` `modifyHeaders` specification so users can apply rules to arbitrary internal, staging, localhost, or production URLs they configure.
- **`activeTab`:** Replaces the broader `"tabs"` permission so the toolbar can inspect the active tab's URL/ID for **1-Click Scope This Site** without accessing background tab history.
- **`storage`:** Stores profiles, rules, settings, local backup snapshots, and metadata-only audit events exclusively in `chrome.storage.local` (plus `chrome.storage.session` / `chrome.storage.managed` policy clamping). Zero `chrome.storage.sync`.
- **`sidePanel`:** Provides the persistent Side Panel workspace surface alongside the toolbar popup.
- **Data Handling & Privacy Disclosure:** Zero user data collection, zero analytics, zero third-party network requests (`connect-src 'none'`), and zero remotely hosted code.
