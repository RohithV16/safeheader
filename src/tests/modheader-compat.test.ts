import { describe, expect, it } from 'vitest';
import * as compat from '../shared/modheader-compat';

describe('modheader-compat (local import only)', () => {
  it('does not expose any profile export function', () => {
    expect('exportProfilesToJson' in compat).toBe(false);
  });

  it('imports legacy ModHeader JSON format gracefully', () => {
    const legacyJson = JSON.stringify([
      {
        title: 'Staging API',
        shortTitle: 'STG',
        appendMode: true,
        hideComment: true,
        headers: [
          { enabled: true, name: 'Cookie', value: 'a=1', comment: 'append ok' },
          { enabled: true, name: 'Authorization', value: 'Bearer xyz' },
        ],
        respHeaders: [
          { enabled: true, name: 'Access-Control-Allow-Origin', value: '*' },
        ],
        filters: [
          { enabled: true, type: 'url', urlPattern: '*://staging.example.com/*' },
        ],
      },
    ]);

    const profiles = compat.importProfilesFromJson(legacyJson, 0);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].title).toBe('Staging API');
    expect(profiles[0].shortTitle).toBe('STG');
    expect(profiles[0].hideComment).toBe(true);
    expect(profiles[0].requestHeaders[0].operation).toBe('append');
    expect(profiles[0].requestHeaders[1].operation).toBe('set');
    expect(profiles[0].responseHeaders).toHaveLength(1);
    expect(profiles[0].urlFilters[0].pattern).toBe('*://staging.example.com/*');
  });

  it('strips __proto__ / prototype pollution keys during import', () => {
    const malicious = '{"__proto__": {"polluted": true}, "title": "Safe", "headers": []}';
    const profiles = compat.importProfilesFromJson(malicious, 0);
    expect(profiles).toHaveLength(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('flags unscoped sensitive rules during import dry-run inspection (H-2)', () => {
    const riskyJson = JSON.stringify([
      {
        title: 'Unscoped Auth',
        headers: [{ name: 'Authorization', value: 'Bearer secret-value' }],
      },
    ]);
    const profiles = compat.importProfilesFromJson(riskyJson, 0);
    const report = compat.inspectImportedProfiles(profiles);
    expect(report.hasUnscopedSensitiveRules).toBe(true);
    expect(report.unscopedSensitiveRuleNames).toEqual(['Authorization']);
  });
});
