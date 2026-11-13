import {
  ALL_DNR_RESOURCE_TYPES,
  SYNC_HEALTH_SESSION_KEY,
  WARNINGS_SESSION_KEY,
} from '../shared/constants';
import type {
  CompiledRuleSet,
  CompileWarning,
  ExtensionState,
  HeaderRule,
  Profile,
  QueryParamRule,
  RedirectRule,
  SyncHealth,
  UrlFilterRule,
} from '../shared/types';
import {
  extractDomainFromPattern,
  extractRegistrableDomain,
  getCookieRuleWarning,
  getHeaderRuleWarning,
  getQueryParamWarning,
  getRedirectRuleWarning,
  hasControlChars,
  hasSpecificScope,
  isAppendAllowedOnRequestHeader,
  isOverlyBroadUrlPattern,
  isRestrictedRequestHeader,
  isSensitiveHeaderName,
  isValidCookieName,
  isValidHeaderName,
  parseTransformTarget,
} from '../shared/validators';

export type RegexSupportChecker = (regex: string) => Promise<boolean>;

const regexSupportCache = new Map<string, boolean>();

const defaultRegexChecker: RegexSupportChecker = async (regex: string) => {
  if (regexSupportCache.has(regex)) {
    return regexSupportCache.get(regex)!;
  }

  let supported = false;
  if (
    typeof chrome !== 'undefined' &&
    chrome.declarativeNetRequest &&
    typeof chrome.declarativeNetRequest.isRegexSupported === 'function'
  ) {
    try {
      const res = await chrome.declarativeNetRequest.isRegexSupported({
        regex,
        isCaseSensitive: false,
      });
      supported = res.isSupported;
    } catch {
      supported = false;
    }
  } else {
    try {
      new RegExp(regex);
      supported = true;
    } catch {
      supported = false;
    }
  }

  if (regexSupportCache.size > 500) {
    regexSupportCache.clear();
  }
  regexSupportCache.set(regex, supported);
  return supported;
};

function compileSingleRequestHeader(
  rule: HeaderRule,
  profile: Profile,
  requireScope: boolean,
  hasScope: boolean,
  seen: Set<string>,
  warnings: CompileWarning[]
): { info: chrome.declarativeNetRequest.ModifyHeaderInfo; sensitive: boolean } | null {
  if (!rule.enabled || !rule.name.trim()) return null;
  const name = rule.name.trim();
  const lower = name.toLowerCase();

  const warningMsg = getHeaderRuleWarning(rule, 'request');
  if (warningMsg) {
    warnings.push({ profileId: profile.id, ruleId: rule.id, message: warningMsg });
  }

  if (!isValidHeaderName(name) || hasControlChars(rule.value)) return null;
  if (isRestrictedRequestHeader(name)) return null;

  if (requireScope && !hasScope && rule.operation !== 'remove' && isSensitiveHeaderName(name)) {
    warnings.push({
      profileId: profile.id,
      ruleId: rule.id,
      message: `Security Guard: Sensitive header "${name}" blocked without a concrete domain URL filter.`,
    });
    return null;
  }

  let operation = rule.operation;
  if (operation === 'append' && !isAppendAllowedOnRequestHeader(name)) {
    operation = 'set';
  }

  if (seen.has(lower)) {
    warnings.push({
      profileId: profile.id,
      ruleId: rule.id,
      message: `Duplicate request header "${name}" in profile "${profile.title}" — later rule skipped.`,
    });
    return null;
  }
  seen.add(lower);

  const sensitive = operation !== 'remove' && isSensitiveHeaderName(name);
  if (operation === 'remove') {
    return {
      info: { header: name, operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
      sensitive,
    };
  }

  return {
    info: {
      header: name,
      operation: operation as chrome.declarativeNetRequest.HeaderOperation,
      value: rule.value,
    },
    sensitive,
  };
}

function compileRequestHeaders(
  profile: Profile,
  requireScope: boolean,
  hasScope: boolean,
  warnings: CompileWarning[]
): { headers: chrome.declarativeNetRequest.ModifyHeaderInfo[]; hasSensitive: boolean } {
  const headers: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [];
  const seen = new Set<string>();
  let hasSensitive = false;

  for (const rule of profile.requestHeaders) {
    const res = compileSingleRequestHeader(rule, profile, requireScope, hasScope, seen, warnings);
    if (res) {
      headers.push(res.info);
      if (res.sensitive) hasSensitive = true;
    }
  }

  return { headers, hasSensitive };
}

function compileCookieHeaders(
  profile: Profile,
  requireScope: boolean,
  hasScope: boolean,
  warnings: CompileWarning[]
): { headers: chrome.declarativeNetRequest.ModifyHeaderInfo[]; hasSensitive: boolean } {
  const headers: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [];
  const enabledCookies = profile.cookies.filter((c) => c.enabled && c.name.trim());
  let hasSensitive = false;

  if (requireScope && !hasScope && enabledCookies.length > 0) {
    warnings.push({
      profileId: profile.id,
      message:
        'Security Guard: Request cookies blocked without a concrete domain URL filter.',
    });
    return { headers, hasSensitive: false };
  }

  const replacePairs: string[] = [];
  const appendPairs: string[] = [];

  for (const c of enabledCookies) {
    const warningMsg = getCookieRuleWarning(c);
    if (warningMsg) {
      warnings.push({ profileId: profile.id, ruleId: c.id, message: warningMsg });
    }
    if (!isValidCookieName(c.name) || hasControlChars(c.value) || c.value.includes(';')) {
      continue;
    }
    const pair = `${c.name.trim()}=${c.value}`;
    if (c.mode === 'replace') {
      replacePairs.push(pair);
    } else {
      appendPairs.push(pair);
    }
  }

  if (replacePairs.length > 0) {
    hasSensitive = true;
    const combined = [...replacePairs, ...appendPairs].join('; ');
    headers.push({
      header: 'Cookie',
      operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
      value: combined,
    });
  } else if (appendPairs.length > 0) {
    hasSensitive = true;
    headers.push({
      header: 'Cookie',
      operation: 'append' as chrome.declarativeNetRequest.HeaderOperation,
      value: appendPairs.join('; '),
    });
  }

  return { headers, hasSensitive };
}

function compileSingleResponseHeader(
  rule: HeaderRule,
  profile: Profile,
  requireScope: boolean,
  hasScope: boolean,
  seen: Set<string>,
  warnings: CompileWarning[]
): { info: chrome.declarativeNetRequest.ModifyHeaderInfo; sensitive: boolean } | null {
  if (!rule.enabled || !rule.name.trim()) return null;
  const name = rule.name.trim();
  const lower = name.toLowerCase();

  const warningMsg = getHeaderRuleWarning(rule, 'response');
  if (warningMsg) {
    warnings.push({ profileId: profile.id, ruleId: rule.id, message: warningMsg });
  }
  if (!isValidHeaderName(name) || hasControlChars(rule.value)) return null;

  if (requireScope && !hasScope && rule.operation !== 'remove' && isSensitiveHeaderName(name)) {
    warnings.push({
      profileId: profile.id,
      ruleId: rule.id,
      message: `Security Guard: Sensitive response header "${name}" blocked without a concrete domain URL filter.`,
    });
    return null;
  }

  if (lower !== 'set-cookie' && seen.has(lower)) {
    warnings.push({
      profileId: profile.id,
      ruleId: rule.id,
      message: `Duplicate response header "${name}" in profile "${profile.title}" — later rule skipped.`,
    });
    return null;
  }
  seen.add(lower);

  const sensitive = rule.operation !== 'remove' && isSensitiveHeaderName(name);
  if (rule.operation === 'remove') {
    return {
      info: { header: name, operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
      sensitive,
    };
  }

  return {
    info: {
      header: name,
      operation: rule.operation as chrome.declarativeNetRequest.HeaderOperation,
      value: rule.value,
    },
    sensitive,
  };
}

function compileResponseHeaders(
  profile: Profile,
  requireScope: boolean,
  hasScope: boolean,
  warnings: CompileWarning[]
): { headers: chrome.declarativeNetRequest.ModifyHeaderInfo[]; hasSensitive: boolean } {
  const headers: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [];
  const seen = new Set<string>();
  let hasSensitive = false;

  for (const rule of profile.responseHeaders) {
    const res = compileSingleResponseHeader(rule, profile, requireScope, hasScope, seen, warnings);
    if (res) {
      headers.push(res.info);
      if (res.sensitive) hasSensitive = true;
    }
  }

  return { headers, hasSensitive };
}

function buildModifyHeaderInfos(
  profile: Profile,
  requireScopeForSensitive: boolean,
  profileHasSpecificScope: boolean,
  warnings: CompileWarning[]
): {
  requestHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[];
  cookieHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[];
  responseHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[];
  hasSensitiveCompiled: boolean;
} {
  const req = compileRequestHeaders(profile, requireScopeForSensitive, profileHasSpecificScope, warnings);
  const cookie = compileCookieHeaders(profile, requireScopeForSensitive, profileHasSpecificScope, warnings);
  const resp = compileResponseHeaders(profile, requireScopeForSensitive, profileHasSpecificScope, warnings);

  return {
    requestHeaders: req.headers,
    cookieHeaders: cookie.headers,
    responseHeaders: resp.headers,
    hasSensitiveCompiled: req.hasSensitive || cookie.hasSensitive || resp.hasSensitive,
  };
}

function compileSingleQueryParam(
  q: QueryParamRule,
  profile: Profile,
  requireScope: boolean,
  hasScope: boolean,
  seenKeys: Set<string>,
  warnings: CompileWarning[]
): { action: 'add' | 'remove'; key: string; value?: string; replaceOnly?: boolean; sensitive: boolean } | null {
  if (!q.enabled || !q.name.trim()) return null;
  const key = q.name.trim();

  const warningMsg = getQueryParamWarning(q);
  if (warningMsg) {
    warnings.push({ profileId: profile.id, ruleId: q.id, message: warningMsg });
    return null;
  }

  const sensitive = q.operation !== 'remove' && isSensitiveHeaderName(key);
  if (requireScope && !hasScope && sensitive) {
    warnings.push({
      profileId: profile.id,
      ruleId: q.id,
      message: `Security Guard: Sensitive query parameter "${key}" blocked without a concrete domain URL filter.`,
    });
    return null;
  }

  if (seenKeys.has(key)) {
    warnings.push({
      profileId: profile.id,
      ruleId: q.id,
      message: `Duplicate query parameter "${key}" in profile "${profile.title}" — later rule skipped.`,
    });
    return null;
  }
  seenKeys.add(key);

  if (q.operation === 'remove') {
    return { action: 'remove', key, sensitive };
  }

  return {
    action: 'add',
    key,
    value: q.value,
    replaceOnly: q.replaceOnly,
    sensitive,
  };
}

function buildQueryTransform(
  profile: Profile,
  requireScopeForSensitive: boolean,
  profileHasSpecificScope: boolean,
  warnings: CompileWarning[]
): {
  queryTransform: chrome.declarativeNetRequest.QueryTransform | null;
  hasSensitiveQuery: boolean;
} {
  const addOrReplaceParams: chrome.declarativeNetRequest.QueryKeyValue[] = [];
  const removeParams: string[] = [];
  const seenKeys = new Set<string>();
  let hasSensitiveQuery = false;

  for (const q of profile.queryParams ?? []) {
    const res = compileSingleQueryParam(
      q,
      profile,
      requireScopeForSensitive,
      profileHasSpecificScope,
      seenKeys,
      warnings
    );
    if (!res) continue;

    if (res.sensitive) hasSensitiveQuery = true;
    if (res.action === 'remove') {
      removeParams.push(res.key);
    } else {
      addOrReplaceParams.push({
        key: res.key,
        value: res.value ?? '',
        ...(res.replaceOnly ? { replaceOnly: true } : {}),
      });
    }
  }

  if (addOrReplaceParams.length === 0 && removeParams.length === 0) {
    return { queryTransform: null, hasSensitiveQuery };
  }

  return {
    queryTransform: {
      ...(addOrReplaceParams.length > 0 ? { addOrReplaceParams } : {}),
      ...(removeParams.length > 0 ? { removeParams } : {}),
    },
    hasSensitiveQuery,
  };
}

function collectExcludedDomains(
  profile: Profile,
  warnings: CompileWarning[]
): { includeFilters: UrlFilterRule[]; excludedRequestDomains: string[] } {
  const includeFilters: UrlFilterRule[] = [];
  const excludedRequestDomains: string[] = [];

  for (const f of profile.urlFilters) {
    if (!f.enabled || !f.pattern.trim()) continue;
    if (f.exclude) {
      const domain = extractDomainFromPattern(f.pattern);
      if (domain) {
        excludedRequestDomains.push(domain);
      } else {
        warnings.push({
          profileId: profile.id,
          ruleId: f.id,
          message: `Exclude filter "${f.pattern}" must specify a domain (e.g. *://example.com/*) to map to DNR excludedRequestDomains.`,
        });
      }
    } else {
      includeFilters.push(f);
    }
  }

  return { includeFilters, excludedRequestDomains };
}

function buildBaseCondition(
  profile: Profile,
  excludedRequestDomains: string[]
): Partial<chrome.declarativeNetRequest.RuleCondition> {
  const baseCondition: Partial<chrome.declarativeNetRequest.RuleCondition> = {
    resourceTypes:
      profile.resourceTypes.length > 0 ? profile.resourceTypes : ALL_DNR_RESOURCE_TYPES,
  };
  if (profile.requestMethods.length > 0) {
    baseCondition.requestMethods = profile.requestMethods.map(
      (m) => m.toLowerCase() as chrome.declarativeNetRequest.RequestMethod
    );
  }
  if (excludedRequestDomains.length > 0) {
    baseCondition.excludedRequestDomains = excludedRequestDomains;
  }
  return baseCondition;
}

async function isCaptureRegexSupported(
  regex: string,
  defaultChecker: RegexSupportChecker
): Promise<boolean> {
  if (
    typeof chrome !== 'undefined' &&
    chrome.declarativeNetRequest &&
    typeof chrome.declarativeNetRequest.isRegexSupported === 'function'
  ) {
    try {
      const res = await chrome.declarativeNetRequest.isRegexSupported({
        regex,
        isCaseSensitive: false,
        requireCapturing: true,
      });
      return res.isSupported;
    } catch {
      return false;
    }
  }
  return defaultChecker(regex);
}

function createRedirectAction(r: RedirectRule): chrome.declarativeNetRequest.RuleAction | null {
  if (r.mode === 'block') {
    return { type: 'block' as chrome.declarativeNetRequest.RuleActionType };
  }
  if (r.mode === 'url') {
    return {
      type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
      redirect: { url: r.toUrl.trim() },
    };
  }
  if (r.mode === 'regexSubstitution') {
    return {
      type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
      redirect: { regexSubstitution: r.toUrl.trim() },
    };
  }
  if (r.mode === 'transform') {
    const parsed = parseTransformTarget(r.toUrl);
    if (!parsed) return null;
    return {
      type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
      redirect: {
        transform: {
          ...(parsed.scheme ? { scheme: parsed.scheme } : {}),
          ...(parsed.host ? { host: parsed.host } : {}),
          ...(parsed.port !== undefined ? { port: parsed.port } : {}),
          ...(parsed.path ? { path: parsed.path } : {}),
        },
      },
    };
  }
  return null;
}

async function compileRedirectRulesForProfile(
  profile: Profile,
  excludedRequestDomains: string[],
  requireScopeForSensitive: boolean,
  priority: number,
  warnings: CompileWarning[],
  isRegexSupported: RegexSupportChecker
): Promise<Array<Omit<chrome.declarativeNetRequest.Rule, 'id'>>> {
  const out: Array<Omit<chrome.declarativeNetRequest.Rule, 'id'>> = [];
  const baseCondition = buildBaseCondition(profile, excludedRequestDomains);
  const enabledRedirects = (profile.redirects ?? []).filter((r) => r.enabled && r.fromPattern.trim());

  const regexChecks = await Promise.all(
    enabledRedirects.map((r) => {
      if (r.matchType !== 'regex') return Promise.resolve(true);
      const from = r.fromPattern.trim();
      return r.mode === 'regexSubstitution'
        ? isCaptureRegexSupported(from, isRegexSupported)
        : isRegexSupported(from);
    })
  );

  for (let i = 0; i < enabledRedirects.length; i++) {
    const r = enabledRedirects[i];
    const warningMsg = getRedirectRuleWarning(r, requireScopeForSensitive);
    if (warningMsg) {
      warnings.push({ profileId: profile.id, ruleId: r.id, message: warningMsg });
      continue;
    }

    const from = r.fromPattern.trim();
    if (r.matchType === 'regex' && !regexChecks[i]) {
      warnings.push({
        profileId: profile.id,
        ruleId: r.id,
        message: `Invalid or unsupported RE2 regex redirect filter: "${from}"`,
      });
      continue;
    }

    const action = createRedirectAction(r);
    if (!action) continue;

    const condition: chrome.declarativeNetRequest.RuleCondition =
      r.matchType === 'regex'
        ? { ...baseCondition, regexFilter: from, isUrlFilterCaseSensitive: false }
        : { ...baseCondition, urlFilter: from, isUrlFilterCaseSensitive: false };

    out.push({ priority, action, condition });
  }

  return out;
}

async function buildConditions(
  profile: Profile,
  rawIncludeFilters: UrlFilterRule[],
  excludedRequestDomains: string[],
  hasSensitiveRules: boolean,
  requireScopeForSensitive: boolean,
  warnings: CompileWarning[],
  isRegexSupported: RegexSupportChecker
): Promise<chrome.declarativeNetRequest.RuleCondition[]> {
  const includeFilters: UrlFilterRule[] = [];

  for (const f of rawIncludeFilters) {
    if (
      requireScopeForSensitive &&
      hasSensitiveRules &&
      isOverlyBroadUrlPattern(f.pattern, f.matchType)
    ) {
      warnings.push({
        profileId: profile.id,
        ruleId: f.id,
        message: `Security Guard: Non-domain URL filter "${f.pattern}" skipped because this profile contains sensitive headers, cookies, or params.`,
      });
      continue;
    }
    includeFilters.push(f);
  }

  const baseCondition = buildBaseCondition(profile, excludedRequestDomains);
  if (includeFilters.length === 0) {
    return [{ ...baseCondition, urlFilter: '*' }];
  }

  const regexChecks = await Promise.all(
    includeFilters.map((f) =>
      f.matchType === 'regex' ? isRegexSupported(f.pattern.trim()) : Promise.resolve(true)
    )
  );

  const conditions: chrome.declarativeNetRequest.RuleCondition[] = [];
  for (let i = 0; i < includeFilters.length; i++) {
    const f = includeFilters[i];
    const pattern = f.pattern.trim();
    if (f.matchType === 'regex') {
      if (!regexChecks[i]) {
        warnings.push({
          profileId: profile.id,
          ruleId: f.id,
          message: `Invalid or unsupported RE2 regex filter: "${pattern}"`,
        });
        continue;
      }
      conditions.push({ ...baseCondition, regexFilter: pattern, isUrlFilterCaseSensitive: false });
    } else {
      conditions.push({ ...baseCondition, urlFilter: pattern, isUrlFilterCaseSensitive: false });
    }
  }

  return conditions;
}

interface CompiledProfileIntermediate {
  priority: number;
  mergedReqHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[];
  responseHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[];
  cookieHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[];
  separateCookieRuleNeeded: boolean;
  queryTransform: chrome.declarativeNetRequest.QueryTransform | null;
  conditions: chrome.declarativeNetRequest.RuleCondition[];
  compiledRedirects: Array<Omit<chrome.declarativeNetRequest.Rule, 'id'>>;
}

async function compileProfileIntermediate(
  profile: Profile,
  priority: number,
  requireScope: boolean,
  isRegexSupported: RegexSupportChecker,
  warnings: CompileWarning[]
): Promise<CompiledProfileIntermediate | null> {
  const scoped = hasSpecificScope(profile.urlFilters);
  const { requestHeaders, cookieHeaders, responseHeaders, hasSensitiveCompiled } =
    buildModifyHeaderInfos(profile, requireScope, scoped, warnings);
  const { queryTransform, hasSensitiveQuery } = buildQueryTransform(
    profile,
    requireScope,
    scoped,
    warnings
  );
  const { includeFilters, excludedRequestDomains } = collectExcludedDomains(profile, warnings);

  const hasCookieHeaderInReq = requestHeaders.some(
    (h) => h.header.toLowerCase() === 'cookie'
  );

  const mergedReqHeaders =
    !hasCookieHeaderInReq && cookieHeaders.length > 0
      ? [...requestHeaders, ...cookieHeaders]
      : requestHeaders;

  const separateCookieRuleNeeded = hasCookieHeaderInReq && cookieHeaders.length > 0;
  const compiledRedirects = await compileRedirectRulesForProfile(
    profile,
    excludedRequestDomains,
    requireScope,
    priority + 3,
    warnings,
    isRegexSupported
  );

  const hasRules =
    mergedReqHeaders.length > 0 ||
    responseHeaders.length > 0 ||
    separateCookieRuleNeeded ||
    queryTransform ||
    compiledRedirects.length > 0;

  if (!hasRules) return null;

  let conditions: chrome.declarativeNetRequest.RuleCondition[] = [];
  if (mergedReqHeaders.length > 0 || responseHeaders.length > 0 || separateCookieRuleNeeded || queryTransform) {
    conditions = await buildConditions(
      profile,
      includeFilters,
      excludedRequestDomains,
      hasSensitiveCompiled || hasSensitiveQuery,
      requireScope,
      warnings,
      isRegexSupported
    );
  }

  return {
    priority,
    mergedReqHeaders,
    responseHeaders,
    cookieHeaders,
    separateCookieRuleNeeded,
    queryTransform,
    conditions,
    compiledRedirects,
  };
}

function expandIntermediateRules(
  item: CompiledProfileIntermediate,
  getId: () => number,
  outRules: chrome.declarativeNetRequest.Rule[]
): void {
  for (const condition of item.conditions) {
    if (item.mergedReqHeaders.length > 0 || item.responseHeaders.length > 0) {
      outRules.push({
        id: getId(),
        priority: item.priority,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          ...(item.mergedReqHeaders.length > 0 ? { requestHeaders: item.mergedReqHeaders } : {}),
          ...(item.responseHeaders.length > 0 ? { responseHeaders: item.responseHeaders } : {}),
        },
        condition,
      });
    }

    if (item.separateCookieRuleNeeded) {
      outRules.push({
        id: getId(),
        priority: item.priority + 1,
        action: {
          type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
          requestHeaders: item.cookieHeaders,
        },
        condition,
      });
    }

    if (item.queryTransform) {
      outRules.push({
        id: getId(),
        priority: item.priority + 2,
        action: {
          type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
          redirect: { transform: { queryTransform: item.queryTransform } },
        },
        condition,
      });
    }
  }

  for (const redirRule of item.compiledRedirects) {
    outRules.push({ id: getId(), ...redirRule });
  }
}

export async function compileStateToDnrRules(
  state: ExtensionState,
  isRegexSupported: RegexSupportChecker = defaultRegexChecker
): Promise<CompiledRuleSet> {
  const warnings: CompileWarning[] = [];
  if (state.isPaused) {
    return { dynamicRules: [], sessionRules: [], warnings };
  }

  const requireScope = state.security?.requireScopeForSensitive ?? true;
  const activeProfiles = state.multiProfileMode
    ? state.profiles.filter((p) => p.enabled).sort((a, b) => a.order - b.order)
    : state.profiles.filter((p) => p.id === state.activeProfileId && p.enabled);

  const intermediates = await Promise.all(
    activeProfiles.map((p, idx) => {
      const priority = Math.max(1, 1000 - idx * 10);
      return compileProfileIntermediate(p, priority, requireScope, isRegexSupported, warnings);
    })
  );

  const dynamicRules: chrome.declarativeNetRequest.Rule[] = [];
  let nextDynamicId = 1;
  const getId = () => nextDynamicId++;

  for (const item of intermediates) {
    if (item) {
      expandIntermediateRules(item, getId, dynamicRules);
    }
  }

  return { dynamicRules, sessionRules: [], warnings };
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, String.raw`\$&`)
    .replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesDnrCondition(
  condition: chrome.declarativeNetRequest.RuleCondition,
  testUrl: URL
): boolean {
  const href = testUrl.href;
  const hostname = testUrl.hostname.toLowerCase();

  if (condition.excludedRequestDomains?.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
    return false;
  }
  if (condition.regexFilter) {
    try {
      return new RegExp(condition.regexFilter, 'i').test(href);
    } catch {
      return false;
    }
  }
  if (condition.urlFilter) {
    if (condition.urlFilter === '*') return true;
    if (condition.urlFilter.startsWith('||')) {
      const domain = extractRegistrableDomain(condition.urlFilter, 'wildcard');
      return domain ? hostname === domain || hostname.endsWith(`.${domain}`) : false;
    }
    return wildcardToRegExp(condition.urlFilter).test(href);
  }
  return true;
}

function formatTransformSummary(t: chrome.declarativeNetRequest.URLTransform): string {
  const schemePart = t.scheme ? t.scheme + '://' : '';
  const hostPart = t.host ?? '';
  const portPart = t.port ? ':' + t.port : '';
  const pathPart = t.path ?? '';
  return `Host swap -> ${schemePart}${hostPart}${portPart}${pathPart}`;
}

function inspectMatchedRuleAction(
  r: chrome.declarativeNetRequest.Rule,
  reqSet: Set<string>,
  respSet: Set<string>,
  querySet: Set<string>
): { hasCookies: boolean; redirectSummary: string | null } {
  let hasCookies = false;
  let redirectSummary: string | null = null;

  for (const h of r.action.requestHeaders ?? []) {
    if (h.header.toLowerCase() === 'cookie') hasCookies = true;
    else reqSet.add(h.header);
  }
  for (const h of r.action.responseHeaders ?? []) {
    respSet.add(h.header);
  }

  if (r.action.type === 'block') {
    redirectSummary = 'Blocked request';
  } else if (r.action.type === 'redirect' && r.action.redirect) {
    const qt = r.action.redirect.transform?.queryTransform;
    if (qt) {
      for (const p of qt.addOrReplaceParams ?? []) querySet.add(p.key);
      for (const k of qt.removeParams ?? []) querySet.add(`-${k}`);
    } else if (r.action.redirect.url) {
      redirectSummary = `Redirect -> ${r.action.redirect.url}`;
    } else if (r.action.redirect.regexSubstitution) {
      redirectSummary = `Regex redirect -> ${r.action.redirect.regexSubstitution}`;
    } else if (r.action.redirect.transform) {
      redirectSummary = formatTransformSummary(r.action.redirect.transform);
    }
  }

  return { hasCookies, redirectSummary };
}

/**
 * Simulates the real DNR compiler output against a sample URL.
 */
export async function simulateProfileForUrl(
  profile: Profile,
  rawUrl: string,
  requireScope: boolean
): Promise<{
  validUrl: boolean;
  matches: boolean;
  requestHeaderNames: string[];
  responseHeaderNames: string[];
  hasCookies: boolean;
  queryParamNames: string[];
  redirectSummary: string | null;
  warnings: CompileWarning[];
}> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('HTTP/HTTPS only');
    }
  } catch {
    return {
      validUrl: false,
      matches: false,
      requestHeaderNames: [],
      responseHeaderNames: [],
      hasCookies: false,
      queryParamNames: [],
      redirectSummary: null,
      warnings: [],
    };
  }

  const fakeState: ExtensionState = {
    schemaVersion: 1,
    isPaused: false,
    pausedReason: null,
    lastActivityAt: Date.now(),
    activeProfileId: profile.id,
    multiProfileMode: false,
    theme: 'system',
    compactDensity: true,
    security: {
      requireScopeForSensitive: requireScope,
      maskSecrets: true,
      presentationMode: false,
    },
    profiles: [profile],
  };

  const compiled = await compileStateToDnrRules(fakeState);
  const rules = [...compiled.dynamicRules, ...compiled.sessionRules];
  const matched = rules.filter((r) => matchesDnrCondition(r.condition, parsed));

  const reqSet = new Set<string>();
  const respSet = new Set<string>();
  const querySet = new Set<string>();
  let hasCookies = false;
  let redirectSummary: string | null = null;

  for (const r of matched) {
    const res = inspectMatchedRuleAction(r, reqSet, respSet, querySet);
    if (res.hasCookies) hasCookies = true;
    if (res.redirectSummary) redirectSummary = res.redirectSummary;
  }

  return {
    validUrl: true,
    matches: matched.length > 0,
    requestHeaderNames: Array.from(reqSet),
    responseHeaderNames: Array.from(respSet),
    hasCookies,
    queryParamNames: Array.from(querySet),
    redirectSummary,
    warnings: compiled.warnings,
  };
}

function resolveSyncStatus(countMismatch: boolean, quotaTruncatedCount: number): 'error' | 'degraded' | 'ok' {
  if (countMismatch) return 'error';
  if (quotaTruncatedCount > 0) return 'degraded';
  return 'ok';
}

function resolveSyncErrorMessage(
  countMismatch: boolean,
  expectedDynamic: number,
  expectedSession: number,
  actualDynamic: number,
  actualSession: number,
  quotaTruncatedCount: number
): string | null {
  if (countMismatch) {
    return `Rule verification mismatch (expected ${expectedDynamic}/${expectedSession}, active ${actualDynamic}/${actualSession}).`;
  }
  if (quotaTruncatedCount > 0) {
    return `${quotaTruncatedCount} rule(s) skipped due to Chrome DNR quota.`;
  }
  return null;
}

export async function syncDnrRules(state: ExtensionState): Promise<{
  compiled: CompiledRuleSet;
  health: SyncHealth;
}> {
  const compiled = await compileStateToDnrRules(state);
  const warnings = [...compiled.warnings];
  let quotaTruncatedCount = 0;

  const maxUnsafeDynamic =
    chrome.declarativeNetRequest.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES ?? 5000;
  const maxUnsafeSession =
    chrome.declarativeNetRequest.MAX_NUMBER_OF_UNSAFE_SESSION_RULES ?? 5000;
  const maxRegexRules =
    chrome.declarativeNetRequest.MAX_NUMBER_OF_REGEX_RULES ?? 1000;

  try {
    const [existingDynamic, existingSession] = await Promise.all([
      chrome.declarativeNetRequest.getDynamicRules(),
      chrome.declarativeNetRequest.getSessionRules(),
    ]);

    let dynamicToAdd = compiled.dynamicRules;
    let sessionToAdd = compiled.sessionRules;

    if (dynamicToAdd.length > maxUnsafeDynamic) {
      quotaTruncatedCount += dynamicToAdd.length - maxUnsafeDynamic;
      dynamicToAdd = dynamicToAdd.slice(0, maxUnsafeDynamic);
      warnings.push({
        profileId: state.activeProfileId,
        message: `DNR dynamic quota limit: ${quotaTruncatedCount} rule(s) truncated (max ${maxUnsafeDynamic}).`,
      });
    }

    if (sessionToAdd.length > maxUnsafeSession) {
      const sessCut = sessionToAdd.length - maxUnsafeSession;
      quotaTruncatedCount += sessCut;
      sessionToAdd = sessionToAdd.slice(0, maxUnsafeSession);
      warnings.push({
        profileId: state.activeProfileId,
        message: `DNR session quota limit: ${sessCut} rule(s) truncated (max ${maxUnsafeSession}).`,
      });
    }

    await Promise.all([
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingDynamic.map((r) => r.id),
        addRules: dynamicToAdd,
      }),
      chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: existingSession.map((r) => r.id),
        addRules: sessionToAdd,
      }),
    ]);

    // Post-sync read-back verification: never trust silent success
    const [verifyDynamic, verifySession] = await Promise.all([
      chrome.declarativeNetRequest.getDynamicRules(),
      chrome.declarativeNetRequest.getSessionRules(),
    ]);

    const countMismatch =
      verifyDynamic.length !== dynamicToAdd.length ||
      verifySession.length !== sessionToAdd.length;
    const regexRuleCount = [...verifyDynamic, ...verifySession].filter((r) =>
      Boolean(r.condition.regexFilter)
    ).length;

    const health: SyncHealth = {
      status: resolveSyncStatus(countMismatch, quotaTruncatedCount),
      lastSyncedAt: Date.now(),
      expectedDynamicCount: dynamicToAdd.length,
      actualDynamicCount: verifyDynamic.length,
      expectedSessionCount: sessionToAdd.length,
      actualSessionCount: verifySession.length,
      quotaAvailableDynamic: maxUnsafeDynamic,
      regexRuleCount,
      quotaAvailableRegex: maxRegexRules,
      quotaTruncatedCount,
      errorMessage: resolveSyncErrorMessage(
        countMismatch,
        dynamicToAdd.length,
        sessionToAdd.length,
        verifyDynamic.length,
        verifySession.length,
        quotaTruncatedCount
      ),
    };

    if (chrome.storage?.session) {
      await chrome.storage.session.set({
        [WARNINGS_SESSION_KEY]: warnings,
        [SYNC_HEALTH_SESSION_KEY]: health,
      });
    }

    return { compiled: { ...compiled, warnings }, health };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const health: SyncHealth = {
      status: 'error',
      lastSyncedAt: Date.now(),
      expectedDynamicCount: compiled.dynamicRules.length,
      actualDynamicCount: -1,
      expectedSessionCount: compiled.sessionRules.length,
      actualSessionCount: -1,
      quotaAvailableDynamic: maxUnsafeDynamic,
      quotaAvailableRegex: maxRegexRules,
      quotaTruncatedCount,
      errorMessage: `DNR sync failed: ${message}`,
    };

    if (chrome.storage?.session) {
      await chrome.storage.session.set({
        [WARNINGS_SESSION_KEY]: warnings,
        [SYNC_HEALTH_SESSION_KEY]: health,
      });
    }

    return { compiled: { ...compiled, warnings }, health };
  }
}
