import { describe, expect, it } from 'vitest';
import { compileStateToDnrRules, simulateProfileForUrl } from '../background/dnr-compiler';
import { createDefaultProfile, createDefaultState } from '../shared/storage';
import type { ExtensionState } from '../shared/types';

describe('compileStateToDnrRules', () => {
  it('returns empty rules when paused', async () => {
    const state = createDefaultState();
    state.isPaused = true;
    state.profiles[0].requestHeaders = [
      { id: 'h1', enabled: true, name: 'X-Test', value: '1', operation: 'set' },
    ];

    const compiled = await compileStateToDnrRules(state);
    expect(compiled.dynamicRules).toHaveLength(0);
    expect(compiled.sessionRules).toHaveLength(0);
  });

  it('blocks unscoped sensitive headers and cookies when Strict Scope Guard is enabled', async () => {
    const state = createDefaultState();
    state.security.requireScopeForSensitive = true;
    state.profiles[0].requestHeaders = [
      { id: 'h1', enabled: true, name: 'Authorization', value: 'Bearer secret', operation: 'set' },
      { id: 'h2', enabled: true, name: 'X-Debug', value: 'on', operation: 'set' },
    ];
    state.profiles[0].cookies = [
      { id: 'c1', enabled: true, name: 'session', value: 'secret-cookie', mode: 'append' },
    ];

    const compiled = await compileStateToDnrRules(state);
    expect(compiled.dynamicRules).toHaveLength(1);
    expect(compiled.dynamicRules[0].action.requestHeaders).toEqual([
      { header: 'X-Debug', operation: 'set', value: 'on' },
    ]);
    // Ensure warnings never leak secret values
    const joinedWarnings = compiled.warnings.map((w) => w.message).join('\n');
    expect(joinedWarnings).toContain('Security Guard');
    expect(joinedWarnings).not.toContain('Bearer secret');
    expect(joinedWarnings).not.toContain('secret-cookie');
  });

  it('allows sensitive headers and cookies once scoped with a specific URL filter', async () => {
    const state = createDefaultState();
    state.profiles[0].requestHeaders = [
      { id: 'h1', enabled: true, name: 'Authorization', value: 'Bearer 123', operation: 'set' },
      { id: 'h2', enabled: true, name: 'X-Custom', value: 'abc', operation: 'append' },
      { id: 'h3', enabled: true, name: 'Host', value: 'blocked.example', operation: 'set' },
      { id: 'h4', enabled: false, name: 'X-Off', value: 'no', operation: 'set' },
    ];
    state.profiles[0].responseHeaders = [
      { id: 'r1', enabled: true, name: 'Access-Control-Allow-Origin', value: '*', operation: 'set' },
      { id: 'r2', enabled: true, name: 'X-Frame-Options', value: '', operation: 'remove' },
    ];
    state.profiles[0].cookies = [
      { id: 'c1', enabled: true, name: 'env', value: 'staging', mode: 'append' },
      { id: 'c2', enabled: true, name: 'ab', value: 'on', mode: 'append' },
    ];
    state.profiles[0].urlFilters = [
      { id: 'f1', enabled: true, matchType: 'wildcard', pattern: '*://api.corp.internal/*', exclude: false },
    ];

    const compiled = await compileStateToDnrRules(state);
    expect(compiled.sessionRules).toHaveLength(0);
    expect(compiled.dynamicRules).toHaveLength(1);

    const rule = compiled.dynamicRules[0];
    expect(rule.id).toBe(1);
    expect(rule.action.requestHeaders).toEqual([
      { header: 'Authorization', operation: 'set', value: 'Bearer 123' },
      { header: 'X-Custom', operation: 'set', value: 'abc' },
      { header: 'Cookie', operation: 'append', value: 'env=staging; ab=on' },
    ]);
    expect(rule.action.responseHeaders).toEqual([
      { header: 'Access-Control-Allow-Origin', operation: 'set', value: '*' },
      { header: 'X-Frame-Options', operation: 'remove' },
    ]);
  });

  it('uses replace mode for cookies when any replace cookie is enabled', async () => {
    const state = createDefaultState();
    state.profiles[0].requestHeaders = [];
    state.profiles[0].cookies = [
      { id: 'c1', enabled: true, name: 'session', value: 'xyz', mode: 'replace' },
      { id: 'c2', enabled: true, name: 'flag', value: 'true', mode: 'append' },
    ];

    const compiled = await compileStateToDnrRules(state);
    expect(compiled.dynamicRules).toHaveLength(1);
    expect(compiled.dynamicRules[0].action.requestHeaders).toEqual([
      { header: 'Cookie', operation: 'set', value: 'session=xyz; flag=true' },
    ]);
  });

  it('supports multi-profile mode ordering and separates colliding Cookie header rules', async () => {
    const p1 = createDefaultProfile(1);
    p1.urlFilters = [
      { id: 'f1', enabled: true, matchType: 'wildcard', pattern: '*://localhost:*/*', exclude: false },
    ];
    p1.requestHeaders = [
      { id: 'h1', enabled: true, name: 'Cookie', value: 'manual=1', operation: 'append' },
    ];
    p1.cookies = [
      { id: 'c1', enabled: true, name: 'extra', value: '2', mode: 'append' },
    ];

    const p2 = createDefaultProfile(2);
    p2.requestHeaders = [
      { id: 'h2', enabled: true, name: 'X-Second', value: 'yes', operation: 'set' },
    ];

    const state: ExtensionState = {
      schemaVersion: 1,
      isPaused: false,
      pausedReason: null,
      lastActivityAt: Date.now(),
      activeProfileId: p1.id,
      multiProfileMode: true,
      theme: 'system',
      compactDensity: true,
      security: {
        requireScopeForSensitive: true,
        maskSecrets: true,
        presentationMode: false,
      },
      profiles: [p1, p2],
    };

    const compiled = await compileStateToDnrRules(state);
    expect(compiled.dynamicRules).toHaveLength(3);
    expect(compiled.dynamicRules[0].priority).toBe(1000);
    expect(compiled.dynamicRules[1].priority).toBe(1001);
    expect(compiled.dynamicRules[2].priority).toBe(990);
  });

  it('explicitly includes main_frame (Doc) and all resourceTypes when no filter type is selected', async () => {
    const state = createDefaultState();
    state.profiles[0].urlFilters = [
      { id: 'f1', enabled: true, matchType: 'wildcard', pattern: '*://example.com/*', exclude: false },
    ];
    state.profiles[0].cookies = [
      { id: 'c1', enabled: true, name: 'session_override', value: '123', mode: 'append' },
    ];

    const compiled = await compileStateToDnrRules(state);
    expect(compiled.dynamicRules).toHaveLength(1);
    const types = compiled.dynamicRules[0].condition.resourceTypes;
    expect(types).toContain('main_frame');
    expect(types).toContain('sub_frame');
    expect(types).toContain('xmlhttprequest');
    expect(types).toContain('script');
    expect(types).toContain('other');
  });

  it('compiles queryParams and enforces Strict Scope Guard on sensitive params & broad redirects', async () => {
    const state = createDefaultState();
    state.security.requireScopeForSensitive = true;
    state.profiles[0].queryParams = [
      { id: 'q1', enabled: true, name: 'debug', value: '1', operation: 'set' },
      { id: 'q2', enabled: true, name: 'utm_source', value: '', operation: 'remove' },
      { id: 'q3', enabled: true, name: 'api_token', value: 'secret-tok', operation: 'set' },
    ];
    state.profiles[0].redirects = [
      {
        id: 'rd-broad',
        enabled: true,
        matchType: 'wildcard',
        fromPattern: '*',
        mode: 'url',
        toUrl: 'https://attacker.example/',
      },
      {
        id: 'rd-swap',
        enabled: true,
        matchType: 'wildcard',
        fromPattern: '*://api.corp.internal/*',
        mode: 'transform',
        toUrl: '127.0.0.1:8080',
      },
    ];

    const unscopedCompiled = await compileStateToDnrRules(state);
    // Broad redirect skipped; sensitive query param skipped; non-sensitive queryParams + scoped transform compiled
    expect(unscopedCompiled.dynamicRules).toHaveLength(2);
    const qtRule = unscopedCompiled.dynamicRules.find(
      (r) => r.action.redirect?.transform?.queryTransform
    );
    expect(qtRule?.action.redirect?.transform?.queryTransform).toEqual({
      addOrReplaceParams: [{ key: 'debug', value: '1' }],
      removeParams: ['utm_source'],
    });
    const swapRule = unscopedCompiled.dynamicRules.find(
      (r) => r.action.redirect?.transform?.host === '127.0.0.1'
    );
    expect(swapRule?.action.redirect?.transform?.port).toBe('8080');
    expect(unscopedCompiled.warnings.map((w) => w.message).join('\n')).not.toContain('secret-tok');

    // Now scope profile and simulate URL
    state.profiles[0].urlFilters = [
      { id: 'f1', enabled: true, matchType: 'wildcard', pattern: '*://api.corp.internal/*', exclude: false },
    ];
    const sim = await simulateProfileForUrl(
      state.profiles[0],
      'https://api.corp.internal/v1/items',
      true
    );
    expect(sim.matches).toBe(true);
    expect(sim.queryParamNames).toContain('api_token');
    expect(sim.queryParamNames).toContain('-utm_source');
    expect(sim.redirectSummary).toContain('127.0.0.1:8080');
  });
});
