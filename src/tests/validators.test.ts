import { describe, expect, it } from 'vitest';
import {
  extractDomainFromPattern,
  extractRegistrableDomain,
  getCookieRuleWarning,
  getHeaderRuleWarning,
  hasSpecificScope,
  isAppendAllowedOnRequestHeader,
  isOverlyBroadUrlPattern,
  isRestrictedRequestHeader,
  isSensitiveHeaderName,
  isValidCookieName,
  isValidHeaderName,
} from '../shared/validators';

describe('validators & positive domain specificity', () => {
  it('validates HTTP header names', () => {
    expect(isValidHeaderName('Authorization')).toBe(true);
    expect(isValidHeaderName('X-Custom-123')).toBe(true);
    expect(isValidHeaderName('Bad Header')).toBe(false);
    expect(isValidHeaderName('Bad:Header')).toBe(false);
    expect(isValidHeaderName('')).toBe(false);
  });

  it('rejects broad regex/wildcard bypasses via positive domain extraction (H-1)', () => {
    expect(isSensitiveHeaderName('Authorization')).toBe(true);
    expect(isSensitiveHeaderName('X-API-Key')).toBe(true);
    expect(isSensitiveHeaderName('Cookie')).toBe(true);
    expect(isSensitiveHeaderName('X-Custom-Session')).toBe(true);
    expect(isSensitiveHeaderName('Accept-Language')).toBe(false);

    // Broad wildcards & bare TLDs must be rejected
    expect(isOverlyBroadUrlPattern('*', 'wildcard')).toBe(true);
    expect(isOverlyBroadUrlPattern('*://*/*', 'wildcard')).toBe(true);
    expect(isOverlyBroadUrlPattern('https://*/*', 'wildcard')).toBe(true);
    expect(isOverlyBroadUrlPattern('*://*.com/*', 'wildcard')).toBe(true);

    // H-1 regex bypass attempts must be rejected
    expect(isOverlyBroadUrlPattern('.', 'regex')).toBe(true);
    expect(isOverlyBroadUrlPattern('[\\s\\S]*', 'regex')).toBe(true);
    expect(isOverlyBroadUrlPattern('h.*', 'regex')).toBe(true);
    expect(isOverlyBroadUrlPattern('^https?://.*$', 'regex')).toBe(true);
    expect(isOverlyBroadUrlPattern('^https://[^/]+\\.com/.*', 'regex')).toBe(true);

    // Concrete domains / localhost / IPv4 pass
    expect(extractRegistrableDomain('*://*.corp.internal/*', 'wildcard')).toBe('corp.internal');
    expect(extractRegistrableDomain('*://localhost:*/*', 'wildcard')).toBe('localhost');
    expect(extractRegistrableDomain('*://127.0.0.1:4321/*', 'wildcard')).toBe('127.0.0.1');
    expect(extractRegistrableDomain('^https://api\\.corp\\.internal/.*', 'regex')).toBe('api.corp.internal');
  });

  it('checks specific scope via concrete URL filter or Tab Lock', () => {
    expect(hasSpecificScope([], null)).toBe(false);
    expect(hasSpecificScope([], 99)).toBe(true);
    expect(
      hasSpecificScope(
        [{ id: '1', enabled: true, matchType: 'regex', pattern: '.', exclude: false }],
        null
      )
    ).toBe(false);
    expect(
      hasSpecificScope(
        [{ id: '1', enabled: true, matchType: 'wildcard', pattern: '*://localhost:*/*', exclude: false }],
        null
      )
    ).toBe(true);
  });

  it('checks Chromium append allowlist and restricted headers', () => {
    expect(isAppendAllowedOnRequestHeader('Cookie')).toBe(true);
    expect(isAppendAllowedOnRequestHeader('Accept')).toBe(true);
    expect(isAppendAllowedOnRequestHeader('Authorization')).toBe(false);
    expect(isAppendAllowedOnRequestHeader('X-Custom')).toBe(false);

    expect(isRestrictedRequestHeader('Host')).toBe(true);
    expect(isRestrictedRequestHeader('Content-Length')).toBe(true);
    expect(isRestrictedRequestHeader('Authorization')).toBe(false);
  });

  it('reports header rule warnings accurately', () => {
    expect(
      getHeaderRuleWarning(
        { id: '1', enabled: true, name: 'Host', value: 'evil.com', operation: 'set' },
        'request'
      )
    ).toContain('network stack');

    expect(
      getHeaderRuleWarning(
        { id: '2', enabled: true, name: 'Authorization', value: 'Bearer x', operation: 'append' },
        'request'
      )
    ).toContain('does not allow "append"');

    expect(
      getHeaderRuleWarning(
        { id: '3', enabled: true, name: 'Set-Cookie', value: 'a=1', operation: 'append' },
        'response'
      )
    ).toBeNull();
  });

  it('validates cookie names and semicolon warnings', () => {
    expect(isValidCookieName('session_id')).toBe(true);
    expect(isValidCookieName('bad=name')).toBe(false);
    expect(isValidCookieName('bad;name')).toBe(false);

    expect(
      getCookieRuleWarning({
        id: '1',
        enabled: true,
        name: 'token',
        value: 'abc; Path=/',
        mode: 'append',
      })
    ).toContain('";"');
  });

  it('extracts domains from wildcard URL patterns', () => {
    expect(extractDomainFromPattern('*://*.example.com/*')).toBe('example.com');
    expect(extractDomainFromPattern('https://api.localhost:3000/v1/*')).toBe('api.localhost');
    expect(extractDomainFromPattern('^https://foo.*/bar')).toBeNull();
  });
});
