import { describe, expect, it } from 'vitest';
import manifest from '../../public/manifest.json';
import managedSchema from '../../public/managed_schema.json';
import { simulateProfileForUrl, syncDnrRules } from '../background/dnr-compiler';
import { appendAuditEvent, loadAuditLog } from '../shared/audit-log';
import { applyManagedPolicyToState, parseManagedPolicy } from '../shared/policy';
import { createDefaultState } from '../shared/storage';

describe('SyncHealth verification, quota truncation, policy clamping & audit log', () => {
  it('simulates compiled rules accurately for Test URL preview', async () => {
    const state = createDefaultState();
    const profile = state.profiles[0];
    profile.requestHeaders = [
      { id: 'h1', enabled: true, name: 'Authorization', value: 'Bearer xyz', operation: 'set' },
    ];
    profile.cookies = [
      { id: 'c1', enabled: true, name: 'env', value: 'stage', mode: 'append' },
    ];
    profile.urlFilters = [
      { id: 'f1', enabled: true, matchType: 'wildcard', pattern: '*://api.corp.internal/*', exclude: false },
    ];

    const matchRes = await simulateProfileForUrl(
      profile,
      'https://api.corp.internal/v1/me',
      true
    );
    expect(matchRes.validUrl).toBe(true);
    expect(matchRes.matches).toBe(true);
    expect(matchRes.requestHeaderNames).toEqual(['Authorization']);
    expect(matchRes.hasCookies).toBe(true);

    const noMatchRes = await simulateProfileForUrl(profile, 'https://evil.example.com/', true);
    expect(noMatchRes.matches).toBe(false);
  });

  it('clamps security controls and injects read-only managed profiles from enterprise policy', () => {
    const policy = parseManagedPolicy({
      enforceScopeForSensitive: true,
      enforceMaskSecrets: true,
      managedProfiles: [
        {
          title: 'Corp SSO Headers',
          shortTitle: 'SSO',
          headers: [{ name: 'X-Corp-Debug', value: '1' }],
        },
      ],
    });

    const state = createDefaultState();
    state.security.requireScopeForSensitive = false;
    state.security.maskSecrets = false;

    const effective = applyManagedPolicyToState(state, policy);
    expect(effective.security.requireScopeForSensitive).toBe(true);
    expect(effective.security.maskSecrets).toBe(true);
    expect(effective.profiles[0].isManaged).toBe(true);
    expect(effective.profiles[0].title).toBe('Corp SSO Headers');
  });

  it('verifies DNR read-back counts and detects quota truncation & mismatches', async () => {
    let dynamicRules: chrome.declarativeNetRequest.Rule[] = [];
    let sessionRules: chrome.declarativeNetRequest.Rule[] = [];
    const sessionStore: Record<string, unknown> = {};
    let forceMismatch = false;

    (globalThis as unknown as { chrome: unknown }).chrome = {
      declarativeNetRequest: {
        MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES: 1,
        MAX_NUMBER_OF_UNSAFE_SESSION_RULES: 1,
        async getDynamicRules() {
          return forceMismatch ? [] : dynamicRules;
        },
        async getSessionRules() {
          return sessionRules;
        },
        async updateDynamicRules(opts: { removeRuleIds: number[]; addRules: chrome.declarativeNetRequest.Rule[] }) {
          dynamicRules = opts.addRules;
        },
        async updateSessionRules(opts: { removeRuleIds: number[]; addRules: chrome.declarativeNetRequest.Rule[] }) {
          sessionRules = opts.addRules;
        },
      },
      storage: {
        session: {
          async set(items: Record<string, unknown>) {
            Object.assign(sessionStore, items);
          },
        },
      },
    };

    const state = createDefaultState();
    state.profiles[0].requestHeaders = [
      { id: 'h1', enabled: true, name: 'X-Debug', value: '1', operation: 'set' },
    ];
    state.profiles[0].urlFilters = [
      { id: 'f1', enabled: true, matchType: 'wildcard', pattern: '*://a.corp.internal/*', exclude: false },
      { id: 'f2', enabled: true, matchType: 'wildcard', pattern: '*://b.corp.internal/*', exclude: false },
    ];

    const degraded = await syncDnrRules(state);
    expect(degraded.health.status).toBe('degraded');
    expect(degraded.health.quotaTruncatedCount).toBe(1);

    forceMismatch = true;
    const errored = await syncDnrRules(state);
    expect(errored.health.status).toBe('error');
    expect(errored.health.errorMessage).toContain('mismatch');
  });

  it('caps local audit ring-buffer at 200 entries', async () => {
    const localStore: Record<string, unknown> = {};
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: localStore[key] };
          },
          async set(items: Record<string, unknown>) {
            Object.assign(localStore, items);
          },
        },
      },
    };

    for (let i = 0; i < 205; i++) {
      await appendAuditEvent('SYNC_OK', `Event ${i}`);
    }
    const log = await loadAuditLog();
    expect(log).toHaveLength(200);
    expect(log[0].detail).toBe('Event 204');
  });

  it('ensures managed_schema.json defines items on every array schema node', () => {
    function checkNode(node: Record<string, unknown>) {
      if (node.type === 'array') {
        expect(node.items).toBeTypeOf('object');
        expect((node.items as Record<string, unknown>).type).toBeTypeOf('string');
        checkNode(node.items as Record<string, unknown>);
      }
      if (node.properties && typeof node.properties === 'object') {
        for (const prop of Object.values(node.properties as Record<string, Record<string, unknown>>)) {
          checkNode(prop);
        }
      }
    }
    checkNode(managedSchema as Record<string, unknown>);
  });

  it('enforces Chrome Web Store least-privilege manifest permissions & strict CSP', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).not.toContain('tabs');
    expect(manifest.permissions).not.toContain('cookies');
    expect(manifest.permissions).toContain('activeTab');
    expect((manifest as Record<string, unknown>).optional_permissions).toBeUndefined();
    expect(manifest.content_security_policy.extension_pages).toContain("connect-src 'none'");
    expect((manifest as Record<string, unknown>).content_scripts).toBeUndefined();
    expect((manifest as Record<string, unknown>).web_accessible_resources).toBeUndefined();
  });
});
