import {
  MAX_IMPORT_BYTES,
  MAX_PROFILES,
  MAX_RULES_PER_SECTION,
  PROFILE_COLORS,
  VALID_HTTP_METHODS,
  VALID_RESOURCE_TYPES,
} from './constants';
import { generateId } from './storage';
import type {
  CookieRule,
  HeaderOperation,
  HeaderRule,
  Profile,
  UrlFilterRule,
} from './types';
import {
  hasConcreteDomainScope,
  isAppendAllowedOnRequestHeader,
  isSensitiveHeaderName,
} from './validators';

interface ModHeaderLegacyHeader {
  enabled?: boolean;
  name?: string;
  value?: string;
  operation?: HeaderOperation;
  comment?: string;
}

interface ModHeaderLegacyFilter {
  enabled?: boolean;
  type?: string;
  matchType?: 'wildcard' | 'regex';
  urlPattern?: string;
  pattern?: string;
  exclude?: boolean;
  comment?: string;
}

interface ModHeaderLegacyCookie {
  enabled?: boolean;
  name?: string;
  value?: string;
  mode?: 'append' | 'replace';
  comment?: string;
}

interface ModHeaderLegacyProfile {
  title?: string;
  shortTitle?: string;
  color?: string;
  enabled?: boolean;
  hideComment?: boolean;
  appendMode?: boolean;
  headers?: ModHeaderLegacyHeader[];
  requestHeaders?: ModHeaderLegacyHeader[];
  respHeaders?: ModHeaderLegacyHeader[];
  responseHeaders?: ModHeaderLegacyHeader[];
  cookies?: ModHeaderLegacyCookie[];
  filters?: ModHeaderLegacyFilter[];
  urlFilters?: ModHeaderLegacyFilter[];
  resourceTypes?: chrome.declarativeNetRequest.ResourceType[];
  requestMethods?: string[];
}

export interface ImportSecurityReport {
  riskyProfileTitles: string[];
  unscopedSensitiveRuleNames: string[];
  hasUnscopedSensitiveRules: boolean;
}

const DISALLOWED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function safeJsonParse(jsonText: string): unknown {
  if (jsonText.length > MAX_IMPORT_BYTES) {
    throw new Error(`Import payload exceeds ${MAX_IMPORT_BYTES / 1024} KB limit.`);
  }
  return JSON.parse(jsonText, (key, value) => {
    if (DISALLOWED_KEYS.has(key)) {
      return undefined;
    }
    return value;
  });
}

function resolveHeaderOperation(
  operation: unknown,
  defaultAppend: boolean
): HeaderOperation {
  if (operation === 'set' || operation === 'append' || operation === 'remove') {
    return operation;
  }
  return defaultAppend ? 'append' : 'set';
}

function normalizeHeaderList(
  list: ModHeaderLegacyHeader[] | undefined,
  defaultAppend: boolean,
  target: 'request' | 'response'
): HeaderRule[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_RULES_PER_SECTION).map((item) => {
    const name = String(item?.name ?? '').trim().slice(0, 256);
    let operation = resolveHeaderOperation(item?.operation, defaultAppend);
    if (
      target === 'request' &&
      operation === 'append' &&
      name &&
      !isAppendAllowedOnRequestHeader(name)
    ) {
      operation = 'set';
    }
    return {
      id: generateId(),
      enabled: item?.enabled !== false,
      name,
      value: String(item?.value ?? '').slice(0, 8192),
      operation,
      comment: item?.comment ? String(item.comment).slice(0, 512) : '',
    };
  });
}

function normalizeCookieList(list: ModHeaderLegacyCookie[] | undefined): CookieRule[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_RULES_PER_SECTION).map((item) => ({
    id: generateId(),
    enabled: item?.enabled !== false,
    name: String(item?.name ?? '').trim().slice(0, 256),
    value: String(item?.value ?? '').slice(0, 4096),
    mode: item?.mode === 'replace' ? 'replace' : 'append',
    comment: item?.comment ? String(item.comment).slice(0, 512) : '',
  }));
}

function normalizeFilterList(list: ModHeaderLegacyFilter[] | undefined): UrlFilterRule[] {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_RULES_PER_SECTION)
    .map((item) => {
      const pattern = String(item?.pattern ?? item?.urlPattern ?? '')
        .trim()
        .slice(0, 1024);
      const matchType: 'wildcard' | 'regex' =
        item?.matchType === 'regex' || item?.type === 'regex' ? 'regex' : 'wildcard';
      return {
        id: generateId(),
        enabled: item?.enabled !== false,
        matchType,
        pattern,
        exclude: Boolean(item?.exclude),
        comment: item?.comment ? String(item.comment).slice(0, 512) : '',
      };
    })
    .filter((f) => f.pattern.length > 0);
}

function extractRawProfileList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === 'object') {
    const candidate = parsed as { profiles?: unknown };
    if (Array.isArray(candidate.profiles)) {
      return candidate.profiles;
    }
    return [parsed];
  }
  return [];
}

/**
 * Local-only hardened importer for migrating existing ModHeader JSON configurations.
 * Export is intentionally disabled in this corporate build to prevent secret exfiltration.
 */
export function importProfilesFromJson(jsonText: string, startOrder = 0): Profile[] {
  const parsed = safeJsonParse(jsonText);
  const rawList = extractRawProfileList(parsed);

  if (rawList.length === 0) {
    throw new Error('JSON must contain a profile object or an array of profiles.');
  }

  return rawList.slice(0, MAX_PROFILES).map((raw, idx) => {
    const item = (raw && typeof raw === 'object' ? raw : {}) as ModHeaderLegacyProfile;
    const appendMode = Boolean(item.appendMode);
    const reqList = item.requestHeaders ?? item.headers;
    const respList = item.responseHeaders ?? item.respHeaders;
    const filterList = item.urlFilters ?? item.filters;
    const color =
      typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color)
        ? item.color
        : PROFILE_COLORS[(startOrder + idx) % PROFILE_COLORS.length];

    return {
      id: generateId(),
      title: String(item.title ?? `Imported Profile ${idx + 1}`).slice(0, 80),
      shortTitle: String(item.shortTitle ?? String(startOrder + idx + 1)).slice(0, 3),
      color,
      enabled: item.enabled !== false,
      order: startOrder + idx,
      hideComment: Boolean(item.hideComment),
      requestHeaders: normalizeHeaderList(reqList, appendMode, 'request'),
      responseHeaders: normalizeHeaderList(respList, false, 'response'),
      cookies: normalizeCookieList(item.cookies),
      urlFilters: normalizeFilterList(filterList),
      resourceTypes: Array.isArray(item.resourceTypes)
        ? item.resourceTypes.filter(
            (rt): rt is chrome.declarativeNetRequest.ResourceType =>
              typeof rt === 'string' && VALID_RESOURCE_TYPES.has(rt)
          )
        : [],
      requestMethods: Array.isArray(item.requestMethods)
        ? item.requestMethods
            .filter((m): m is string => typeof m === 'string')
            .map((m) => m.toLowerCase())
            .filter((m) => VALID_HTTP_METHODS.has(m))
        : [],
      tabLockId: null,
      queryParams: [],
      redirects: [],
    };
  });
}

/**
 * Dry-run security gate for imported profiles: flags any enabled sensitive header
 * or cookie rules that lack concrete domain pinning (never leaks secret values).
 */
export function inspectImportedProfiles(profiles: Profile[]): ImportSecurityReport {
  const riskyProfileTitles: string[] = [];
  const unscopedSensitiveRuleNames: string[] = [];

  for (const p of profiles) {
    if (hasConcreteDomainScope(p.urlFilters)) continue;

    const sensitiveHeaders = [...p.requestHeaders, ...p.responseHeaders]
      .filter((h) => h.enabled && h.name.trim() && h.operation !== 'remove' && isSensitiveHeaderName(h.name))
      .map((h) => h.name.trim());
    const cookies = p.cookies
      .filter((c) => c.enabled && c.name.trim())
      .map((c) => `Cookie:${c.name.trim()}`);

    const combined = [...sensitiveHeaders, ...cookies];
    if (combined.length > 0) {
      riskyProfileTitles.push(p.title);
      unscopedSensitiveRuleNames.push(...combined);
    }
  }

  return {
    riskyProfileTitles,
    unscopedSensitiveRuleNames,
    hasUnscopedSensitiveRules: unscopedSensitiveRuleNames.length > 0,
  };
}
