import {
  MAX_PROFILES,
  MAX_RULES_PER_SECTION,
  PROFILE_COLORS,
  STORAGE_BACKUP_KEY,
  STORAGE_KEY,
  STORAGE_QUARANTINE_KEY,
  VALID_HTTP_METHODS,
  VALID_RESOURCE_TYPES,
} from './constants';
import {
  hydrateEphemeralSecrets,
  loadEphemeralSecrets,
  stripEphemeralValues,
} from './ephemeral';
import type {
  CookieRule,
  ExtensionState,
  HeaderRule,
  Profile,
  QueryParamRule,
  RedirectRule,
  SecuritySettings,
  UrlFilterRule,
} from './types';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultSecuritySettings(): SecuritySettings {
  return {
    requireScopeForSensitive: false,
    maskSecrets: true,
    presentationMode: false,
    autoPauseMinutes: 60,
  };
}

export function createEmptyHeaderRule(): HeaderRule {
  return {
    id: generateId(),
    enabled: true,
    name: '',
    value: '',
    operation: 'set',
    comment: '',
  };
}

export function createEmptyCookieRule(): CookieRule {
  return {
    id: generateId(),
    enabled: true,
    name: '',
    value: '',
    mode: 'append',
    comment: '',
  };
}

export function createEmptyUrlFilterRule(): UrlFilterRule {
  return {
    id: generateId(),
    enabled: true,
    matchType: 'wildcard',
    pattern: '',
    exclude: false,
    comment: '',
  };
}

export function createEmptyQueryParamRule(): QueryParamRule {
  return {
    id: generateId(),
    enabled: true,
    name: '',
    value: '',
    operation: 'set',
    comment: '',
  };
}

export function createEmptyRedirectRule(): RedirectRule {
  return {
    id: generateId(),
    enabled: true,
    matchType: 'wildcard',
    fromPattern: '',
    mode: 'url',
    toUrl: '',
    comment: '',
  };
}

export function createDefaultProfile(index = 1): Profile {
  const color = PROFILE_COLORS[(index - 1) % PROFILE_COLORS.length];
  return {
    id: generateId(),
    title: `Profile ${index}`,
    shortTitle: String(index),
    color,
    enabled: true,
    order: index - 1,
    hideComment: false,
    requestHeaders: [],
    responseHeaders: [],
    cookies: [],
    urlFilters: [],
    resourceTypes: [],
    requestMethods: [],
    tabLockId: null,
    queryParams: [],
    redirects: [],
  };
}

export function createDefaultState(): ExtensionState {
  const firstProfile = createDefaultProfile(1);
  return {
    schemaVersion: 1,
    isPaused: false,
    pausedReason: null,
    lastActivityAt: Date.now(),
    activeProfileId: firstProfile.id,
    multiProfileMode: false,
    theme: 'system',
    compactDensity: true,
    security: createDefaultSecuritySettings(),
    profiles: [firstProfile],
  };
}

function sanitizeHeaderRules(raw: unknown): HeaderRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_RULES_PER_SECTION).map((item) => {
    const r = (item && typeof item === 'object' ? item : {}) as Partial<HeaderRule>;
    return {
      id: typeof r.id === 'string' && r.id ? r.id : generateId(),
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      name: typeof r.name === 'string' ? r.name.slice(0, 256) : '',
      value: typeof r.value === 'string' ? r.value.slice(0, 8192) : '',
      operation:
        r.operation === 'set' || r.operation === 'append' || r.operation === 'remove'
          ? r.operation
          : 'set',
      ...(r.ephemeral ? { ephemeral: true } : {}),
      comment: typeof r.comment === 'string' ? r.comment.slice(0, 512) : '',
    };
  });
}

function sanitizeCookieRules(raw: unknown): CookieRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_RULES_PER_SECTION).map((item) => {
    const c = (item && typeof item === 'object' ? item : {}) as Partial<CookieRule>;
    return {
      id: typeof c.id === 'string' && c.id ? c.id : generateId(),
      enabled: typeof c.enabled === 'boolean' ? c.enabled : true,
      name: typeof c.name === 'string' ? c.name.slice(0, 256) : '',
      value: typeof c.value === 'string' ? c.value.slice(0, 4096) : '',
      mode: c.mode === 'replace' ? 'replace' : 'append',
      ...(c.ephemeral ? { ephemeral: true } : {}),
      comment: typeof c.comment === 'string' ? c.comment.slice(0, 512) : '',
    };
  });
}

function sanitizeQueryParamRules(raw: unknown): QueryParamRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_RULES_PER_SECTION).map((item) => {
    const q = (item && typeof item === 'object' ? item : {}) as Partial<QueryParamRule>;
    return {
      id: typeof q.id === 'string' && q.id ? q.id : generateId(),
      enabled: typeof q.enabled === 'boolean' ? q.enabled : true,
      name: typeof q.name === 'string' ? q.name.slice(0, 256) : '',
      value: typeof q.value === 'string' ? q.value.slice(0, 4096) : '',
      operation: q.operation === 'remove' ? 'remove' : 'set',
      ...(q.replaceOnly ? { replaceOnly: true } : {}),
      ...(q.ephemeral ? { ephemeral: true } : {}),
      comment: typeof q.comment === 'string' ? q.comment.slice(0, 512) : '',
    };
  });
}

function sanitizeRedirectRules(raw: unknown): RedirectRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_RULES_PER_SECTION).map((item) => {
    const r = (item && typeof item === 'object' ? item : {}) as Partial<RedirectRule>;
    const mode =
      r.mode === 'url' || r.mode === 'regexSubstitution' || r.mode === 'transform' || r.mode === 'block'
        ? r.mode
        : 'transform';
    return {
      id: typeof r.id === 'string' && r.id ? r.id : generateId(),
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      matchType: r.matchType === 'regex' ? 'regex' : 'wildcard',
      fromPattern: typeof r.fromPattern === 'string' ? r.fromPattern.slice(0, 1024) : '',
      mode,
      toUrl: typeof r.toUrl === 'string' ? r.toUrl.slice(0, 2048) : '',
      comment: typeof r.comment === 'string' ? r.comment.slice(0, 512) : '',
    };
  });
}

function sanitizeUrlFilters(raw: unknown): UrlFilterRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_RULES_PER_SECTION).map((item) => {
    const f = (item && typeof item === 'object' ? item : {}) as Partial<UrlFilterRule>;
    return {
      id: typeof f.id === 'string' && f.id ? f.id : generateId(),
      enabled: typeof f.enabled === 'boolean' ? f.enabled : true,
      matchType: f.matchType === 'regex' ? 'regex' : 'wildcard',
      pattern: typeof f.pattern === 'string' ? f.pattern.slice(0, 1024) : '',
      exclude: Boolean(f.exclude),
      comment: typeof f.comment === 'string' ? f.comment.slice(0, 512) : '',
    };
  });
}

function sanitizeSecuritySettings(raw: unknown): SecuritySettings {
  const defaults = createDefaultSecuritySettings();
  if (!raw || typeof raw !== 'object') return defaults;
  const s = raw as Partial<SecuritySettings>;
  const autoPause =
    typeof s.autoPauseMinutes === 'number' &&
    Number.isFinite(s.autoPauseMinutes) &&
    s.autoPauseMinutes >= 0 &&
    s.autoPauseMinutes <= 1440
      ? Math.round(s.autoPauseMinutes)
      : defaults.autoPauseMinutes;

  return {
    requireScopeForSensitive:
      typeof s.requireScopeForSensitive === 'boolean'
        ? s.requireScopeForSensitive
        : defaults.requireScopeForSensitive,
    maskSecrets:
      typeof s.maskSecrets === 'boolean' ? s.maskSecrets : defaults.maskSecrets,
    presentationMode: Boolean(s.presentationMode),
    autoPauseMinutes: autoPause,
  };
}

/**
 * Migration chain keyed by stored schemaVersion.
 */
function migrateRawState(raw: Record<string, unknown>): Record<string, unknown> {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  let current = { ...raw };

  if (version < 1) {
    current = {
      ...current,
      schemaVersion: 1,
      pausedReason: current.isPaused ? 'manual' : null,
      lastActivityAt: Date.now(),
      compactDensity: true,
    };
  }

  return current;
}

export function normalizeState(raw: unknown): ExtensionState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultState();
  }

  const migrated = migrateRawState(raw as Record<string, unknown>);
  const candidate = migrated as Partial<ExtensionState>;

  const profiles =
    Array.isArray(candidate.profiles) && candidate.profiles.length > 0
      ? candidate.profiles
          .slice(0, MAX_PROFILES)
          .filter((p) => !p?.isManaged)
          .map((p, idx) => ({
            id: typeof p.id === 'string' && p.id ? p.id : generateId(),
            title:
              typeof p.title === 'string' && p.title
                ? p.title.slice(0, 80)
                : `Profile ${idx + 1}`,
            shortTitle:
              typeof p.shortTitle === 'string' && p.shortTitle
                ? p.shortTitle.slice(0, 3)
                : String(idx + 1),
            color:
              typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color)
                ? p.color
                : PROFILE_COLORS[idx % PROFILE_COLORS.length],
            enabled: typeof p.enabled === 'boolean' ? p.enabled : true,
            order: typeof p.order === 'number' ? p.order : idx,
            hideComment: Boolean(p.hideComment),
            requestHeaders: sanitizeHeaderRules(p.requestHeaders),
            responseHeaders: sanitizeHeaderRules(p.responseHeaders),
            cookies: sanitizeCookieRules(p.cookies),
            urlFilters: sanitizeUrlFilters(p.urlFilters),
            resourceTypes: Array.isArray(p.resourceTypes)
              ? p.resourceTypes.filter(
                  (rt): rt is chrome.declarativeNetRequest.ResourceType =>
                    typeof rt === 'string' && VALID_RESOURCE_TYPES.has(rt)
                )
              : [],
            requestMethods: Array.isArray(p.requestMethods)
              ? p.requestMethods
                  .filter((m): m is string => typeof m === 'string')
                  .map((m) => m.toLowerCase())
                  .filter((m) => VALID_HTTP_METHODS.has(m))
              : [],
            tabLockId:
              typeof p.tabLockId === 'number' && Number.isInteger(p.tabLockId) && p.tabLockId > 0
                ? p.tabLockId
                : null,
            queryParams: sanitizeQueryParamRules(p.queryParams),
            redirects: sanitizeRedirectRules(p.redirects),
          }))
      : [createDefaultProfile(1)];

  const safeProfiles = profiles.length > 0 ? profiles : [createDefaultProfile(1)];
  const activeExists = safeProfiles.some((p) => p.id === candidate.activeProfileId);

  return {
    schemaVersion: 1,
    isPaused: Boolean(candidate.isPaused),
    pausedReason:
      candidate.isPaused
        ? candidate.pausedReason === 'auto'
          ? 'auto'
          : 'manual'
        : null,
    lastActivityAt:
      typeof candidate.lastActivityAt === 'number' &&
      Number.isFinite(candidate.lastActivityAt) &&
      candidate.lastActivityAt > 0
        ? candidate.lastActivityAt
        : Date.now(),
    activeProfileId: activeExists
      ? (candidate.activeProfileId as string)
      : safeProfiles[0].id,
    multiProfileMode: Boolean(candidate.multiProfileMode),
    theme:
      candidate.theme === 'light' || candidate.theme === 'dark' || candidate.theme === 'system'
        ? candidate.theme
        : 'system',
    compactDensity:
      typeof candidate.compactDensity === 'boolean' ? candidate.compactDensity : true,
    security: sanitizeSecuritySettings(candidate.security),
    profiles: safeProfiles,
  };
}

export function countStateRules(state: ExtensionState): number {
  return state.profiles.reduce(
    (sum, p) =>
      sum +
      p.requestHeaders.filter((h) => h.name.trim()).length +
      p.responseHeaders.filter((h) => h.name.trim()).length +
      p.cookies.filter((c) => c.name.trim()).length +
      p.urlFilters.filter((f) => f.pattern.trim()).length +
      p.queryParams.filter((q) => q.name.trim()).length +
      p.redirects.filter((r) => r.fromPattern.trim()).length,
    0
  );
}

function isStructurallyCorrupt(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (typeof raw !== 'object' || Array.isArray(raw)) return true;
  const obj = raw as { profiles?: unknown };
  return !Array.isArray(obj.profiles) || obj.profiles.length === 0;
}

export async function loadStateWithRecovery(): Promise<{
  state: ExtensionState;
  recoveredFromBackup: boolean;
}> {
  const result = await chrome.storage.local.get([STORAGE_KEY, STORAGE_BACKUP_KEY]);
  const rawMain = result[STORAGE_KEY];
  const rawBackup = result[STORAGE_BACKUP_KEY];

  if (!rawMain) {
    if (rawBackup && !isStructurallyCorrupt(rawBackup)) {
      const restored = normalizeState(rawBackup);
      await chrome.storage.local.set({ [STORAGE_KEY]: restored });
      const hydrated = hydrateEphemeralSecrets(restored, await loadEphemeralSecrets());
      return { state: hydrated, recoveredFromBackup: true };
    }
    const fresh = createDefaultState();
    await chrome.storage.local.set({ [STORAGE_KEY]: fresh });
    return { state: fresh, recoveredFromBackup: false };
  }

  if (isStructurallyCorrupt(rawMain)) {
    await chrome.storage.local.set({ [STORAGE_QUARANTINE_KEY]: rawMain });
    if (rawBackup && !isStructurallyCorrupt(rawBackup)) {
      const restored = normalizeState(rawBackup);
      await chrome.storage.local.set({ [STORAGE_KEY]: restored });
      const hydrated = hydrateEphemeralSecrets(restored, await loadEphemeralSecrets());
      return { state: hydrated, recoveredFromBackup: true };
    }
    const fresh = createDefaultState();
    await chrome.storage.local.set({ [STORAGE_KEY]: fresh });
    return { state: fresh, recoveredFromBackup: false };
  }

  const normalized = normalizeState(rawMain);
  const hydrated = hydrateEphemeralSecrets(normalized, await loadEphemeralSecrets());
  return { state: hydrated, recoveredFromBackup: false };
}

export async function loadState(): Promise<ExtensionState> {
  const { state } = await loadStateWithRecovery();
  return state;
}

export async function saveState(state: ExtensionState): Promise<void> {
  const existing = await chrome.storage.local.get(STORAGE_KEY);
  const previous = existing[STORAGE_KEY];

  // Strip managed profiles & RAM-only ephemeral secret values before writing to local disk storage
  const userOnlyState: ExtensionState = stripEphemeralValues({
    ...state,
    profiles: state.profiles.filter((p) => !p.isManaged),
  });

  if (previous && !isStructurallyCorrupt(previous)) {
    await chrome.storage.local.set({
      [STORAGE_BACKUP_KEY]: previous,
      [STORAGE_KEY]: userOnlyState,
    });
  } else {
    await chrome.storage.local.set({ [STORAGE_KEY]: userOnlyState });
  }
}
