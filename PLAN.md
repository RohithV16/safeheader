
---

## 5. Audit Remediation & Hardening Plan (`.docs/AGENT_DISCUSSION.md`)

### Implemented Waves
- **Wave 0 (Trust the Truth):**
  - `SyncHealth` post-sync read-back verification, quota pre-flight (`getAvailableDynamicRuleCount`), red `!` badge on mismatch/error, error banner with Retry Sync (`FORCE_SYNC`).
  - Positive domain specificity check (`extractRegistrableDomain`) closing `.`, `[\s\S]*`, `h.*`, and `*://*.com/*` bypasses.
  - Inline blocked-rule remediation chips (`+ Add URL filter`, `Lock to tab`) on sensitive rows.
  - Enum validation (`VALID_RESOURCE_TYPES`, `VALID_HTTP_METHODS`) at sanitize boundary.
- **Wave 1 (Enterprise Anchor):**
  - `chrome.storage.managed` (`public/managed_schema.json`, `src/shared/policy.ts`) clamping security controls and seeding read-only `POLICY` profiles.
  - Import-time dry-run security gate (`inspectImportedProfiles`) requiring explicit acknowledgment for unscoped sensitive rules.
  - Tab Lock hardening: persistent cross-navigation warning when no domain URL filter is paired + `clearDeadTabLocks` on startup.
  - Idle auto-pause using persisted `lastActivityAt` + remaining-time alarm re-arm + idle HUD countdown + distinct auto-paused banner.
- **Wave 2 (No Hiccups):**
  - Local `.bak` backup ring (`extensionState.bak`) + quarantine (`extensionState.quarantine`) + migration chain (`migrateRawState`).
  - Service Worker as sole writer (`SET_STATE` serialized write queue + optimistic revert on failure) + `sender.id` verification on `onMessage` + dropped redundant `declarativeNetRequest` permission.
- **Wave 3 (Corporate Polish):**
  - Scope Preview + Test URL simulator (`ScopePreview.tsx`) powered by the real compiler (`simulateProfileForUrl`).
  - Local append-only metadata-only Audit Ring-Buffer (`auditLog`, 200-entry cap) in Security Modal.
  - 30s/blur auto-re-mask + Presentation Mode force-mask.
  - Two-step Delete Profile confirmation, `Cmd/Ctrl+F` rule search, stateful tab echo, Escape-to-close, `:focus-visible`, `aria-expanded`.
- **Wave 4 (Release Hardening):**
  - `minimum_chrome_version: "113"` in `manifest.json`.
  - Storage & SyncHealth/Policy Vitest suites (`storage.test.ts`, `sync-and-policy.test.ts`).
  - `package-extension.mjs` enforces manifest/package version sync, clean `dist/` assertions (no `.map`/scripts), and outputs `release/SHA256SUMS.txt`.

### Rejected / Deferred Items & Rationale
1. **Profile Export (disk / clipboard / download)** — **Rejected permanently:** exfiltration risk for corporate tokens and cookies.
2. **Cloud Sync / Telemetry / Crash Reporting SDKs** — **Rejected permanently:** violates `connect-src 'none'` zero-egress CSP.
3. **`onRuleMatchedDebug` Hit Counters in UI** — **Rejected for v1:** Chrome restricts `onRuleMatchedDebug` to unpacked developer extensions; replaced by the local Test URL simulator.
4. **Secrets Stored Exclusively in `chrome.storage.session`** — **Rejected:** `storage.session` clears on every browser restart, causing unacceptable rule loss for daily corporate workflows; mitigated instead via OS disk encryption, UI masking + 30s auto-re-mask, strict scope guard, and idle auto-pause.
5. **Per-Profile `${var}` Interpolation & Environment Presets** — **Deferred to Phase 2:** keeps the v1 ModHeader header/cookie row UI clean and minimal.
6. **Playwright E2E & GitHub CI Workflows** — **Deferred:** avoids adding heavy browser-automation dependencies to this local repo; covered logic via Vitest suites and manual `echo-server.mjs` testing.
