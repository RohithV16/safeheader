import {
  APPENDABLE_REQUEST_HEADERS,
  RESTRICTED_REQUEST_HEADERS,
} from './constants';
import type {
  CookieRule,
  HeaderRule,
  QueryParamRule,
  RedirectRule,
  UrlFilterRule,
} from './types';

// RFC 7230 HTTP header token characters
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// Cookie name cannot contain whitespace, separators, CR/LF, '=', or ';'
const COOKIE_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// Sensitive header names whose values should be masked & scoped in corporate mode
const SENSITIVE_HEADER_RE =
  /^(authorization|proxy-authorization|cookie|set-cookie)$|auth|token|secret|key|session|cookie|jwt|bearer|credential|pass/i;

const HOST_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function isValidHeaderName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && HEADER_NAME_RE.test(trimmed);
}

export function hasControlChars(value: string): boolean {
  return /[\r\n\0]/.test(value);
}

export function isAppendAllowedOnRequestHeader(name: string): boolean {
  return APPENDABLE_REQUEST_HEADERS.has(name.trim().toLowerCase());
}

export function isRestrictedRequestHeader(name: string): boolean {
  return RESTRICTED_REQUEST_HEADERS.has(name.trim().toLowerCase());
}

export function isSensitiveHeaderName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && SENSITIVE_HEADER_RE.test(trimmed);
}

export function isValidCookieName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && COOKIE_NAME_RE.test(trimmed);
}

function isConcreteHostname(rawHost: string): string | null {
  const host = rawHost.trim().toLowerCase();
  if (!host || host.includes('*') || host.includes('?')) return null;

  if (host === 'localhost') return host;
  if (IPV4_RE.test(host)) {
    const octets = host.split('.').map(Number);
    return octets.every((n) => n >= 0 && n <= 255) ? host : null;
  }

  const labels = host.split('.');
  // Require at least 2 domain labels (rejects bare TLDs like ".com" or "com")
  if (labels.length < 2) return null;
  if (!labels.every((l) => HOST_LABEL_RE.test(l))) return null;
  return host;
}

/**
 * Positive domain specificity check (fixes H-1 denylist bypass).
 * Returns the concrete domain/host if and only if the pattern pins requests
 * to a specific registrable domain, localhost, or IPv4 address.
 */
export function extractRegistrableDomain(
  pattern: string,
  matchType: 'wildcard' | 'regex'
): string | null {
  const trimmed = pattern.trim();
  if (!trimmed) return null;

  if (matchType === 'wildcard') {
    // Support DNR domain anchor (||example.com/) or scheme-prefixed patterns (*://corp.internal/*)
    let rest = trimmed;
    if (rest.startsWith('||')) {
      rest = rest.slice(2);
    } else if (/^(\*|https?):\/\//i.test(rest)) {
      rest = rest.replace(/^(\*|https?):\/\//i, '');
    } else {
      return null;
    }

    const hostAndPort = rest.split('/')[0]?.split('^')[0] ?? '';
    const hostOnly = hostAndPort.split(':')[0] ?? '';
    const cleaned = hostOnly.replace(/^\*\./, '');
    return isConcreteHostname(cleaned);
  }

  // Regex: require explicit scheme + concrete escaped/literal hostname before path/end
  const hostRegex = /^\^?(?:https?|https\?|\(\?:https\?\)|\(http\|https\)):\/\/([^/\s$]+)/i;
  const regexMatch = hostRegex.exec(trimmed);
  if (!regexMatch) return null;

  let hostExpr = regexMatch[1]
    .split(':')[0]
    .replaceAll('\\.', '.')
    .replace(/^\(\?:[^)]*\*\)\./, '')
    .replace(/^\[\^\/\]+[*+]?\./, '')
    .replace(/^\.\*\./, '');

  // Reject regex metacharacters remaining in host
  if (/[\\[\](){}*+?|^$]/.test(hostExpr)) {
    return null;
  }
  return isConcreteHostname(hostExpr);
}

/**
 * Returns true when a URL filter pattern does NOT pin requests to a concrete domain.
 */
export function isOverlyBroadUrlPattern(
  pattern: string,
  matchType: 'wildcard' | 'regex'
): boolean {
  return extractRegistrableDomain(pattern, matchType) === null;
}

export function hasConcreteDomainScope(urlFilters: UrlFilterRule[]): boolean {
  return urlFilters.some(
    (f) =>
      f.enabled &&
      !f.exclude &&
      f.pattern.trim().length > 0 &&
      extractRegistrableDomain(f.pattern, f.matchType) !== null
  );
}

export function hasSpecificScope(
  urlFilters: UrlFilterRule[],
  tabLockId?: number | null
): boolean {
  if (tabLockId !== null && tabLockId !== undefined) return true;
  return hasConcreteDomainScope(urlFilters);
}

export function getHeaderRuleWarning(
  rule: HeaderRule,
  target: 'request' | 'response'
): string | null {
  const name = rule.name.trim();
  if (!name) return null;

  if (!isValidHeaderName(name)) {
    return 'Invalid header name (contains disallowed characters or spaces).';
  }
  if (hasControlChars(rule.value)) {
    return 'Header value must not contain newline or null characters.';
  }
  if (target === 'request') {
    if (isRestrictedRequestHeader(name)) {
      return `"${name}" is managed by Chrome's network stack and cannot be modified by declarativeNetRequest.`;
    }
    if (rule.operation === 'append' && !isAppendAllowedOnRequestHeader(name)) {
      return `Chrome DNR does not allow "append" on request header "${name}". Compiler will use "set" instead.`;
    }
  }
  return null;
}

export function getCookieRuleWarning(rule: CookieRule): string | null {
  const name = rule.name.trim();
  if (!name) return null;
  if (!isValidCookieName(name)) {
    return 'Invalid cookie name (no spaces, "=", or ";" allowed).';
  }
  if (hasControlChars(rule.value) || rule.value.includes(';')) {
    return 'Cookie value should not contain ";" or newline characters.';
  }
  return null;
}

/**
 * Extracts a bare hostname from common URL/wildcard patterns so exclude filters
 * can map to DNR `excludedRequestDomains` where possible.
 */
export function extractDomainFromPattern(pattern: string): string | null {
  return extractRegistrableDomain(pattern, 'wildcard');
}

export function getQueryParamWarning(rule: QueryParamRule): string | null {
  const name = rule.name.trim();
  if (!name) return null;
  if (hasControlChars(name) || hasControlChars(rule.value) || /[\s&=]/.test(name)) {
    return 'Query parameter name cannot contain whitespace, "&", "=", or control characters.';
  }
  return null;
}

export interface ParsedTransformTarget {
  scheme?: 'http' | 'https';
  host?: string;
  port?: string;
  path?: string;
}

/**
 * Parses a host-swap target such as `127.0.0.1:8080`, `http://localhost:3000`,
 * or `https://staging.example.com/v2` into Chrome DNR URLTransform fields.
 */
export function parseTransformTarget(rawTarget: string): ParsedTransformTarget | null {
  const trimmed = rawTarget.trim();
  if (!trimmed || hasControlChars(trimmed)) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? trimmed : `http://${trimmed}`);
  } catch {
    return null;
  }

  if (!parsed.hostname) return null;

  const out: ParsedTransformTarget = {
    host: parsed.hostname,
    port: parsed.port || '',
  };
  if (hasScheme) {
    out.scheme = parsed.protocol === 'https:' ? 'https' : 'http';
  }
  if (parsed.pathname && parsed.pathname !== '/') {
    out.path = parsed.pathname;
  }
  return out;
}

export function getRedirectRuleWarning(
  rule: RedirectRule,
  requireScope: boolean
): string | null {
  const from = rule.fromPattern.trim();
  if (!from && !rule.toUrl.trim()) return null;
  if (!from) {
    return 'Source URL pattern is required.';
  }
  if (hasControlChars(from) || hasControlChars(rule.toUrl)) {
    return 'Redirect patterns and destinations cannot contain control characters.';
  }
  if (requireScope && isOverlyBroadUrlPattern(from, rule.matchType)) {
    return 'Security Guard: Redirect/Block requires a concrete domain pattern (e.g. *://api.corp.internal/*) or Tab Lock.';
  }
  if (rule.mode === 'block') {
    return null;
  }

  const dest = rule.toUrl.trim();
  if (!dest) {
    return 'Destination URL or host is required.';
  }
  if (rule.mode === 'transform') {
    if (!parseTransformTarget(dest)) {
      return 'Invalid transform target. Use e.g. 127.0.0.1:8080 or http://localhost:3000.';
    }
    return null;
  }
  if (!/^https?:\/\//i.test(dest)) {
    return 'Redirect destination must start with http:// or https://.';
  }
  return null;
}
