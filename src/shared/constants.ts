export const STORAGE_KEY = 'extensionState';
export const STORAGE_BACKUP_KEY = 'extensionState.bak';
export const STORAGE_QUARANTINE_KEY = 'extensionState.quarantine';
export const AUDIT_LOG_KEY = 'auditLog';
export const WARNINGS_SESSION_KEY = 'compileWarnings';
export const SYNC_HEALTH_SESSION_KEY = 'syncHealth';
export const RECOVERY_NOTICE_SESSION_KEY = 'recoveryNotice';
export const EPHEMERAL_SECRETS_SESSION_KEY = 'ephemeralSecrets';
export const AUTO_PAUSE_ALARM_NAME = 'safeheader-auto-pause';

export const MAX_IMPORT_BYTES = 512 * 1024; // 512 KB cap for pasted JSON
export const MAX_PROFILES = 50;
export const MAX_RULES_PER_SECTION = 200;
export const MAX_AUDIT_ENTRIES = 200;

export const PROFILE_COLORS = [
  '#2e7d32', // ModHeader Green
  '#1976d2', // Material Blue
  '#7b1fa2', // Material Purple
  '#00838f', // Material Cyan
  '#e65100', // Material Deep Orange
  '#c62828', // Material Red
  '#303f9f', // Material Indigo
  '#455a64', // Material Blue Grey
];

export const COMMON_REQUEST_HEADERS = [
  'Authorization',
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Cache-Control',
  'Content-Type',
  'Cookie',
  'Origin',
  'Pragma',
  'Referer',
  'User-Agent',
  'X-API-Key',
  'X-Auth-Token',
  'X-Correlation-ID',
  'X-Custom-Header',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-Real-IP',
  'X-Request-ID',
  'X-Requested-With',
];

export const COMMON_RESPONSE_HEADERS = [
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Methods',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Credentials',
  'Access-Control-Expose-Headers',
  'Cache-Control',
  'Content-Security-Policy',
  'Content-Type',
  'Cross-Origin-Embedder-Policy',
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Resource-Policy',
  'Permissions-Policy',
  'Referrer-Policy',
  'Set-Cookie',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
];

/**
 * Chromium DNR only allows `append` on a specific allowlist of request headers.
 * Other request headers (e.g. Authorization, X-*) must use `set` or `remove`.
 */
export const APPENDABLE_REQUEST_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'access-control-request-headers',
  'cache-control',
  'connection',
  'content-language',
  'cookie',
  'if-match',
  'if-none-match',
  'range',
  'te',
  'upgrade',
  'via',
  'warning',
]);

/**
 * Transport / network-stack managed headers blocked or ignored by Chromium DNR.
 */
export const RESTRICTED_REQUEST_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'proxy-connection',
  'keep-alive',
]);

export const RESOURCE_TYPE_OPTIONS: Array<{
  value: chrome.declarativeNetRequest.ResourceType;
  label: string;
}> = [
  { value: 'main_frame' as chrome.declarativeNetRequest.ResourceType, label: 'Document' },
  { value: 'sub_frame' as chrome.declarativeNetRequest.ResourceType, label: 'Iframe' },
  { value: 'xmlhttprequest' as chrome.declarativeNetRequest.ResourceType, label: 'XHR / Fetch' },
  { value: 'script' as chrome.declarativeNetRequest.ResourceType, label: 'Script' },
  { value: 'stylesheet' as chrome.declarativeNetRequest.ResourceType, label: 'Stylesheet' },
  { value: 'image' as chrome.declarativeNetRequest.ResourceType, label: 'Image' },
  { value: 'font' as chrome.declarativeNetRequest.ResourceType, label: 'Font' },
  { value: 'websocket' as chrome.declarativeNetRequest.ResourceType, label: 'WebSocket' },
  { value: 'media' as chrome.declarativeNetRequest.ResourceType, label: 'Media' },
  { value: 'other' as chrome.declarativeNetRequest.ResourceType, label: 'Other' },
];

export const VALID_RESOURCE_TYPES = new Set<string>(
  RESOURCE_TYPE_OPTIONS.map((o) => o.value)
);

/**
 * Explicit list of all Chrome DNR ResourceTypes.
 * Omitting `resourceTypes` and `excludedResourceTypes` causes Chromium DNR to skip
 * `"main_frame"` (Doc) requests by default, so we explicitly pass this full list
 * whenever no specific resource types are selected.
 */
export const ALL_DNR_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
] as chrome.declarativeNetRequest.ResourceType[];

export const HTTP_METHOD_OPTIONS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
];

export const VALID_HTTP_METHODS = new Set<string>(HTTP_METHOD_OPTIONS);
