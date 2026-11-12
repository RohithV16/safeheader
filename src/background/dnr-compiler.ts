import {
  ALL_DNR_RESOURCE_TYPES,
  SYNC_HEALTH_SESSION_KEY,
  WARNINGS_SESSION_KEY,
} from '../shared/constants';
import type {
  CompiledRuleSet,
  CompileWarning,
  ExtensionState,
  Profile,
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
  hasConcreteDomainScope,
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
  const requestHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [];
  const seenReqHeaders = new Set<string>();
  let hasSensitiveCompiled = false;

  for (const rule of profile.requestHeaders) {
    if (!rule.enabled || !rule.name.trim()) continue;
    const name = rule.name.trim();
    const lower = name.toLowerCase();

    const warningMsg = getHeaderRuleWarning(rule, 'request');
    if (warningMsg) {
      warnings.push({ profileId: profile.id, ruleId: rule.id, message: warningMsg });
    }

    if (!isValidHeaderName(name) || hasControlChars(rule.value)) continue;
    if (isRestrictedRequestHeader(name)) continue;

    if (
      requireScopeForSensitive &&
      !profileHasSpecificScope &&
      rule.operation !== 'remove' &&
      isSensitiveHeaderName(name)
    ) {
      warnings.push({
        profileId: profile.id,
        ruleId: rule.id,
        message: `Security Guard: Sensitive header "${name}" blocked without a concrete domain URL filter or Tab Lock.`,
      });
      continue;
    }

    let operation = rule.operation;
    if (operation === 'append' && !isAppendAllowedOnRequestHeader(name)) {
      operation = 'set';
    }

    if (seenReqHeaders.has(lower)) {
      warnings.push({
        profileId: profile.id,
        ruleId: rule.id,
        message: `Duplicate request header "${name}" in profile "${profile.title}" — later rule skipped.`,
      });
      continue;
    }
    seenReqHeaders.add(lower);

    if (operation !== 'remove' && isSensitiveHeaderName(name)) {
      hasSensitiveCompiled = true;
    }

    if (operation === 'remove') {
      requestHeaders.push({
        header: name,
        operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation,
      });
    } else {
      requestHeaders.push({
        header: name,
        operation: operation as chrome.declarativeNetRequest.HeaderOperation,
        value: rule.value,
      });
    }
  }

  // Compile dedicated Cookies section into Cookie header operations
  const cookieHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [];
  const enabledCookies = profile.cookies.filter((c) => c.enabled && c.name.trim());

  if (requireScopeForSensitive && !profileHasSpecificScope && enabledCookies.length > 0) {
    warnings.push({
      profileId: profile.id,
      message:
        'Security Guard: Request cookies blocked without a concrete domain URL filter or Tab Lock.',
    });
  } else {
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
      hasSensitiveCompiled = true;
      const combined = [...replacePairs, ...appendPairs].join('; ');
      cookieHeaders.push({
        header: 'Cookie',
        operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
        value: combined,
      });
    } else if (appendPairs.length > 0) {
      hasSensitiveCompiled = true;
      cookieHeaders.push({
        header: 'Cookie',
        operation: 'append' as chrome.declarativeNetRequest.HeaderOperation,
        value: appendPairs.join('; '),
      });
    }
  }

  const responseHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [];
  const seenRespHeaders = new Set<string>();

  for (const rule of profile.responseHeaders) {
    if (!rule.enabled || !rule.name.trim()) continue;
    const name = rule.name.trim();
    const lower = name.toLowerCase();

    const warningMsg = getHeaderRuleWarning(rule, 'response');
    if (warningMsg) {
      warnings.push({ profileId: profile.id, ruleId: rule.id, message: warningMsg });
    }
    if (!isValidHeaderName(name) || hasControlChars(rule.value)) continue;

    if (
      requireScopeForSensitive &&
      !profileHasSpecificScope &&
      rule.operation !== 'remove' &&
      isSensitiveHeaderName(name)
    ) {
      warnings.push({
        profileId: profile.id,
        ruleId: rule.id,
        message: `Security Guard: Sensitive response header "${name}" blocked without a concrete domain URL filter or Tab Lock.`,
      });
      continue;
    }

    if (lower !== 'set-cookie' && seenRespHeaders.has(lower)) {
      warnings.push({
        profileId: profile.id,
        ruleId: rule.id,
        message: `Duplicate response header "${name}" in profile "${profile.title}" — later rule skipped.`,
      });
      continue;
    }
    seenRespHeaders.add(lower);

    if (rule.operation !== 'remove' && isSensitiveHeaderName(name)) {
      hasSensitiveCompiled = true;
    }

    if (rule.operation === 'remove') {
      responseHeaders.push({
        header: name,
        operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation,
      });
    } else {
      responseHeaders.push({
        header: name,
        operation: rule.operation as chrome.declarativeNetRequest.HeaderOperation,
        value: rule.value,
      });
    }
  }

  return { requestHeaders, cookieHeaders, responseHeaders, hasSensitiveCompiled };
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
    if (!q.enabled || !q.name.trim()) continue;
    const key = q.name.trim();
    const warningMsg = getQueryParamWarning(q);
    if (warningMsg) {
      warnings.push({ profileId: profile.id, ruleId: q.id, message: warningMsg });
      continue;
    }

    const sensitive = q.operation !== 'remove' && isSensitiveHeaderName(key);
    if (requireScopeForSensitive && !profileHasSpecificScope && sensitive) {
      warnings.push({
        profileId: profile.id,
        ruleId: q.id,
        message: `Security Guard: Sensitive query parameter "${key}" blocked without a concrete domain URL filter or Tab Lock.`,
      });
      continue;
    }

    if (seenKeys.has(key)) {
      warnings.push({
        profileId: profile.id,
        ruleId: q.id,
        message: `Duplicate query parameter "${key}" in profile "${profile.title}" — later rule skipped.`,
      });
      continue;
    }
    seenKeys.add(key);

    if (sensitive) hasSensitiveQuery = true;

    if (q.operation === 'remove') {
      removeParams.push(key);
    } else {
      addOrReplaceParams.push({
        key,
        value: q.value,
        ...(q.replaceOnly ? { replaceOnly: true } : {}),
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
  if (profile.tabLockId !== null) {
    baseCondition.tabIds = [profile.tabLockId];
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

  for (const r of profile.redirects ?? []) {
    if (!r.enabled || !r.fromPattern.trim()) continue;
    const enforceDomainOnFrom = requireScopeForSensitive && profile.tabLockId === null;
    const warningMsg = getRedirectRuleWarning(r, enforceDomainOnFrom);
    if (warningMsg) {
      warnings.push({ profileId: profile.id, ruleId: r.id, message: warningMsg });
      continue;
    }

    const from = r.fromPattern.trim();
    let condition: chrome.declarativeNetRequest.RuleCondition;
    if (r.matchType === 'regex') {
      const ok =
        r.mode === 'regexSubstitution'
          ? await isCaptureRegexSupported(from, isRegexSupported)
          : await isRegexSupported(from);
      if (!ok) {
        warnings.push({
          profileId: profile.id,
          ruleId: r.id,
          message: `Invalid or unsupported RE2 regex redirect filter: "${from}"`,
        });
        continue;
      }
      condition = {
        ...baseCondition,
        regexFilter: from,
        isUrlFilterCaseSensitive: false,
      };
    } else {
      condition = {
        ...baseCondition,
        urlFilter: from,
        isUrlFilterCaseSensitive: false,
      };
    }

    if (r.mode === 'block') {
      out.push({
        priority,
        action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
        condition,
      });
    } else if (r.mode === 'url') {
      out.push({
        priority,
        action: {
          type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
          redirect: { url: r.toUrl.trim() },
        },
        condition,
      });
    } else if (r.mode === 'regexSubstitution') {
      out.push({
        priority,
        action: {
          type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
          redirect: { regexSubstitution: r.toUrl.trim() },
        },
        condition,
      });
    } else if (r.mode === 'transform') {
      const parsed = parseTransformTarget(r.toUrl);
      if (!parsed) continue;
      out.push({
        priority,
        action: {
          type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
          redirect: {
            transform: {
              ...(parsed.scheme ? { scheme: parsed.scheme } : {}),
              ...(parsed.host ? { host: parsed.host } : {}),
              ...(parsed.port !== undefined ? { port: parsed.port } : {}),
              ...(parsed.path ? { path: parsed.path } : {}),
            },
          },
        },
        condition,
      });
    }
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
      profile.tabLockId === null &&
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

  // Warn if Tab Lock is protecting sensitive rules without an explicit domain URL filter
  if (
    requireScopeForSensitive &&
    hasSensitiveRules &&
    profile.tabLockId !== null &&
    !hasConcreteDomainScope(profile.urlFilters)
  ) {
    warnings.push({
      profileId: profile.id,
      message:
        'Tab Lock scopes by tab only — consider adding a domain URL filter (e.g. *://*.corp.internal/*) so redirects on this tab do not receive sensitive headers.',
    });
  }

  const baseCondition = buildBaseCondition(profile, excludedRequestDomains);

  if (includeFilters.length === 0) {
    return [{ ...baseCondition, urlFilter: '*' }];
  }

  const conditions: chrome.declarativeNetRequest.RuleCondition[] = [];
  for (const f of includeFilters) {
    const pattern = f.pattern.trim();
    if (f.matchType === 'regex') {
      const supported = await isRegexSupported(pattern);
      if (!supported) {
        warnings.push({
          profileId: profile.id,
          ruleId: f.id,
          message: `Invalid or unsupported RE2 regex filter: "${pattern}"`,
        });
        continue;
      }
      conditions.push({
        ...baseCondition,
        regexFilter: pattern,
        isUrlFilterCaseSensitive: false,
      });
    } else {
      conditions.push({
        ...baseCondition,
        urlFilter: pattern,
        isUrlFilterCaseSensitive: false,
      });
    }
  }

  return conditions;
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

  const dynamicRules: chrome.declarativeNetRequest.Rule[] = [];
  const sessionRules: chrome.declarativeNetRequest.Rule[] = [];

  let nextDynamicId = 1;
  let nextSessionId = 1;

  for (let idx = 0; idx < activeProfiles.length; idx++) {
    const profile = activeProfiles[idx];
    const priority = Math.max(1, 1000 - idx * 10);
    const scoped = hasSpecificScope(profile.urlFilters, profile.tabLockId);

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

    if (
      mergedReqHeaders.length === 0 &&
      responseHeaders.length === 0 &&
      !separateCookieRuleNeeded &&
      !queryTransform &&
      compiledRedirects.length === 0
    ) {
      continue;
    }

    const isSession = profile.tabLockId !== null;
    const targetList = isSession ? sessionRules : dynamicRules;

    if (
      mergedReqHeaders.length > 0 ||
      responseHeaders.length > 0 ||
      separateCookieRuleNeeded ||
      queryTransform
    ) {
      const conditions = await buildConditions(
        profile,
        includeFilters,
        excludedRequestDomains,
        hasSensitiveCompiled || hasSensitiveQuery,
        requireScope,
        warnings,
        isRegexSupported
      );

      for (const condition of conditions) {
        if (mergedReqHeaders.length > 0 || responseHeaders.length > 0) {
          const action: chrome.declarativeNetRequest.RuleAction = {
            type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
            ...(mergedReqHeaders.length > 0 ? { requestHeaders: mergedReqHeaders } : {}),
            ...(responseHeaders.length > 0 ? { responseHeaders } : {}),
          };
          targetList.push({
            id: isSession ? nextSessionId++ : nextDynamicId++,
            priority,
            action,
            condition,
          });
        }

        if (separateCookieRuleNeeded) {
          targetList.push({
            id: isSession ? nextSessionId++ : nextDynamicId++,
            priority: priority + 1,
            action: {
              type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
              requestHeaders: cookieHeaders,
            },
            condition,
          });
        }

        if (queryTransform) {
          targetList.push({
            id: isSession ? nextSessionId++ : nextDynamicId++,
            priority: priority + 2,
            action: {
              type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
              redirect: { transform: { queryTransform } },
            },
            condition,
          });
        }
      }
    }

    for (const redirRule of compiledRedirects) {
      targetList.push({
        id: isSession ? nextSessionId++ : nextDynamicId++,
        ...redirRule,
      });
    }
  }

  return { dynamicRules, sessionRules, warnings };
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
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

/**
 * Simulates the real DNR compiler output against a sample URL for the Scope Preview UI.
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
      autoPauseMinutes: 60,
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
        const t = r.action.redirect.transform;
        redirectSummary = `Host swap -> ${t.scheme ? `${t.scheme}://` : ''}${t.host ?? ''}${t.port ? `:${t.port}` : ''}${t.path ?? ''}`;
      }
    }
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
      status: countMismatch
        ? 'error'
        : quotaTruncatedCount > 0
          ? 'degraded'
          : 'ok',
      lastSyncedAt: Date.now(),
      expectedDynamicCount: dynamicToAdd.length,
      actualDynamicCount: verifyDynamic.length,
      expectedSessionCount: sessionToAdd.length,
      actualSessionCount: verifySession.length,
      quotaAvailableDynamic: maxUnsafeDynamic,
      regexRuleCount,
      quotaAvailableRegex: maxRegexRules,
      quotaTruncatedCount,
      errorMessage: countMismatch
        ? `Rule verification mismatch (expected ${dynamicToAdd.length}/${sessionToAdd.length}, active ${verifyDynamic.length}/${verifySession.length}).`
        : quotaTruncatedCount > 0
          ? `${quotaTruncatedCount} rule(s) skipped due to Chrome DNR quota.`
          : null,
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
