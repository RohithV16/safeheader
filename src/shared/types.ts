export type HeaderOperation = 'set' | 'append' | 'remove';
export type CookieInjectMode = 'append' | 'replace';
export type QueryParamOperation = 'set' | 'remove';
export type RedirectMode = 'transform' | 'url' | 'regexSubstitution' | 'block';
export type UrlMatchType = 'wildcard' | 'regex';
export type ThemeMode = 'system' | 'light' | 'dark';
export type PausedReason = 'manual' | 'auto' | null;

export interface SecuritySettings {
  /** Block sensitive headers/cookies from running globally without a specific URL filter or Tab Lock. */
  requireScopeForSensitive: boolean;
  /** Mask sensitive header values and all cookie values in the UI by default. */
  maskSecrets: boolean;
  /** Force-mask all values and block reveal during screen sharing. */
  presentationMode: boolean;
}

export interface HeaderRule {
  id: string;
  enabled: boolean;
  name: string;
  value: string;
  operation: HeaderOperation;
  ephemeral?: boolean;
  comment?: string;
}

export interface CookieRule {
  id: string;
  enabled: boolean;
  name: string;
  value: string;
  mode: CookieInjectMode;
  ephemeral?: boolean;
  comment?: string;
}

export interface QueryParamRule {
  id: string;
  enabled: boolean;
  name: string;
  value: string;
  operation: QueryParamOperation;
  replaceOnly?: boolean;
  ephemeral?: boolean;
  comment?: string;
}

export interface RedirectRule {
  id: string;
  enabled: boolean;
  matchType: UrlMatchType;
  fromPattern: string;
  mode: RedirectMode;
  toUrl: string;
  comment?: string;
}

export interface UrlFilterRule {
  id: string;
  enabled: boolean;
  matchType: UrlMatchType;
  pattern: string;
  exclude: boolean;
  comment?: string;
}

export interface Profile {
  id: string;
  title: string;
  shortTitle: string;
  color: string;
  enabled: boolean;
  order: number;
  hideComment: boolean;
  isManaged?: boolean;
  requestHeaders: HeaderRule[];
  responseHeaders: HeaderRule[];
  cookies: CookieRule[];
  urlFilters: UrlFilterRule[];
  resourceTypes: chrome.declarativeNetRequest.ResourceType[];
  requestMethods: string[];
  tabLockId: number | null;
  queryParams: QueryParamRule[];
  redirects: RedirectRule[];
  variables?: Record<string, string>;
}

export interface ExtensionState {
  schemaVersion: 1;
  isPaused: boolean;
  pausedReason: PausedReason;
  lastActivityAt: number;
  activeProfileId: string;
  multiProfileMode: boolean;
  theme: ThemeMode;
  compactDensity: boolean;
  security: SecuritySettings;
  profiles: Profile[];
}

export interface CompileWarning {
  profileId: string;
  ruleId?: string;
  message: string;
}

export interface CompiledRuleSet {
  dynamicRules: chrome.declarativeNetRequest.Rule[];
  sessionRules: chrome.declarativeNetRequest.Rule[];
  warnings: CompileWarning[];
}

export interface SyncHealth {
  status: 'ok' | 'degraded' | 'error';
  lastSyncedAt: number;
  expectedDynamicCount: number;
  actualDynamicCount: number;
  expectedSessionCount: number;
  actualSessionCount: number;
  quotaAvailableDynamic?: number;
  regexRuleCount?: number;
  quotaAvailableRegex?: number;
  quotaTruncatedCount: number;
  errorMessage: string | null;
}

export interface ManagedPolicy {
  hasPolicy: boolean;
  enforceScopeForSensitive: boolean;
  enforceMaskSecrets: boolean;
  managedProfiles: Profile[];
}

export type AuditEventType =
  | 'SYNC_OK'
  | 'SYNC_DEGRADED'
  | 'SYNC_ERROR'
  | 'MANUAL_PAUSE'
  | 'AUTO_PAUSE'
  | 'RESUMED'
  | 'PROFILE_IMPORTED'
  | 'BACKUP_RESTORED'
  | 'WIPED_ALL_DATA'
  | 'EPHEMERAL_WIPED'
  | 'SECURITY_CHANGED';

export interface AuditEvent {
  id: string;
  timestamp: number;
  type: AuditEventType;
  detail: string;
}
