import {
  AlertCircle,
  Clock,
  Layers,
  Play,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  COMMON_REQUEST_HEADERS,
  COMMON_RESPONSE_HEADERS,
} from '../shared/constants';
import { countEphemeralRules } from '../shared/ephemeral';
import {
  createEmptyCookieRule,
  createEmptyHeaderRule,
  createEmptyQueryParamRule,
  createEmptyRedirectRule,
  createEmptyUrlFilterRule,
  loadState,
} from '../shared/storage';
import type { Profile, ThemeMode } from '../shared/types';
import { hasSpecificScope } from '../shared/validators';
import { CookieRow } from './components/CookieRow';
import { HeaderRow } from './components/HeaderRow';
import { ImportModal } from './components/ImportModal';
import { ProfileRail } from './components/ProfileRail';
import { QueryParamRow } from './components/QueryParamRow';
import { RedirectRow } from './components/RedirectRow';
import { RuleSection } from './components/RuleSection';
import { SecurityModal } from './components/SecurityModal';
import { TopBar } from './components/TopBar';
import { useExtensionState } from './hooks/useExtensionState';

interface AppProps {
  surface: 'popup' | 'sidepanel' | 'options';
}

export function App({ surface }: AppProps) {
  const {
    state,
    policy,
    loaded,
    warnings,
    syncHealth,
    recoveryNotice,
    saveError,
    activeProfile,
    commit,
    updateActiveProfile,
    addProfile,
    cloneActiveProfile,
    deleteActiveProfile,
    moveProfile,
    retrySync,
    wipeEphemeralSecrets,
    dismissRecoveryNotice,
  } = useExtensionState();

  const [showImport, setShowImport] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [currentTabInfo, setCurrentTabInfo] = useState<{
    id: number | null;
    url: string;
    title: string;
  }>({ id: null, url: '', title: '' });
  const [lockedTabTitle, setLockedTabTitle] = useState<string>('');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme =
    state.theme === 'system' ? (systemDark ? 'dark' : 'light') : state.theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  // Query active tab for status echo & remediation helpers
  useEffect(() => {
    if (!chrome.tabs?.query) return;
    void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const t = tabs[0];
      setCurrentTabInfo({
        id: t?.id ?? null,
        url: t?.url ?? '',
        title: t?.title ?? '',
      });
    });
  }, []);

  // Resolve locked tab title when locked to a different tab
  useEffect(() => {
    const lockId = activeProfile?.tabLockId;
    if (lockId === null || lockId === undefined) {
      setLockedTabTitle('');
      return;
    }
    if (lockId === currentTabInfo.id) {
      setLockedTabTitle(currentTabInfo.title || 'this tab');
      return;
    }
    if (chrome.tabs?.get) {
      void chrome.tabs
        .get(lockId)
        .then((t) => setLockedTabTitle(t.title || t.url || `Tab #${lockId}`))
        .catch(() => setLockedTabTitle(`Tab #${lockId} (closed)`));
    }
  }, [activeProfile?.tabLockId, currentTabInfo.id, currentTabInfo.title]);

  // Update idle countdown every 30s
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Cmd/Ctrl+F rule search shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!loaded || !activeProfile) {
    return (
      <div className={`app-shell surface-${surface}`}>
        <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    );
  }

  const readOnly = Boolean(activeProfile.isManaged);
  const isScoped = hasSpecificScope(activeProfile.urlFilters, activeProfile.tabLockId);

  const handleAddRule = (
    kind: 'requestHeader' | 'responseHeader' | 'cookie' | 'queryParam' | 'redirect'
  ) => {
    if (readOnly) return;
    updateActiveProfile((p) => {
      if (kind === 'requestHeader') {
        return { ...p, requestHeaders: [...p.requestHeaders, createEmptyHeaderRule()] };
      }
      if (kind === 'responseHeader') {
        return {
          ...p,
          responseHeaders: [...p.responseHeaders, createEmptyHeaderRule()],
        };
      }
      if (kind === 'cookie') {
        return { ...p, cookies: [...p.cookies, createEmptyCookieRule()] };
      }
      if (kind === 'queryParam') {
        return { ...p, queryParams: [...(p.queryParams ?? []), createEmptyQueryParamRule()] };
      }
      return { ...p, redirects: [...(p.redirects ?? []), createEmptyRedirectRule()] };
    });
  };

  const handleToggleTabLock = async () => {
    if (readOnly) return;
    if (activeProfile.tabLockId !== null) {
      updateActiveProfile((p) => ({ ...p, tabLockId: null }));
      return;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTabId = tabs[0]?.id ?? null;
    if (currentTabId !== null) {
      updateActiveProfile((p) => ({ ...p, tabLockId: currentTabId }));
    }
  };

  const handleAddCurrentSiteFilter = () => {
    if (readOnly) return;
    let pattern = '';
    try {
      if (currentTabInfo.url.startsWith('http')) {
        const u = new URL(currentTabInfo.url);
        pattern = `*://${u.hostname}/*`;
      }
    } catch {
      pattern = '';
    }
    updateActiveProfile((p) => ({
      ...p,
      urlFilters: [
        ...p.urlFilters,
        {
          ...createEmptyUrlFilterRule(),
          pattern,
        },
      ],
    }));
  };

  const handleOpenSidePanel = async () => {
    try {
      const win = await chrome.windows.getCurrent();
      if (win.id !== undefined && chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: win.id });
        if (surface === 'popup') {
          window.close();
        }
      }
    } catch (err) {
      console.error('Unable to open side panel:', err);
    }
  };

  const handleOpenOptions = () => {
    void chrome.runtime.openOptionsPage();
  };

  const handleCycleTheme = () => {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(state.theme) + 1) % order.length];
    commit((prev) => ({ ...prev, theme: next }));
  };

  const handleWipeAll = async () => {
    await chrome.runtime.sendMessage({ type: 'WIPE_ALL_DATA' });
    const fresh = await loadState();
    commit(() => fresh);
  };

  const q = searchQuery.trim().toLowerCase();
  const matchesQuery = (...parts: Array<string | undefined>) =>
    !q || parts.some((s) => (s ?? '').toLowerCase().includes(q));

  const filteredReqHeaders = activeProfile.requestHeaders.filter((r) =>
    matchesQuery(r.name, r.value, r.comment)
  );
  const filteredRespHeaders = activeProfile.responseHeaders.filter((r) =>
    matchesQuery(r.name, r.value, r.comment)
  );
  const filteredCookies = activeProfile.cookies.filter((c) =>
    matchesQuery(c.name, c.value, c.comment)
  );
  const filteredQueryParams = (activeProfile.queryParams ?? []).filter((qp) =>
    matchesQuery(qp.name, qp.value, qp.comment)
  );
  const filteredRedirects = (activeProfile.redirects ?? []).filter((rd) =>
    matchesQuery(rd.fromPattern, rd.toUrl, rd.comment)
  );

  const profileWarnings = warnings.filter((w) => w.profileId === activeProfile.id);

  const reqActive = activeProfile.requestHeaders.filter(
    (h) => h.enabled && h.name.trim()
  ).length;
  const respActive = activeProfile.responseHeaders.filter(
    (h) => h.enabled && h.name.trim()
  ).length;
  const cookieActive = activeProfile.cookies.filter(
    (c) => c.enabled && c.name.trim()
  ).length;
  const queryActive = (activeProfile.queryParams ?? []).filter(
    (qp) => qp.enabled && qp.name.trim()
  ).length;
  const redirectActive = (activeProfile.redirects ?? []).filter(
    (rd) => rd.enabled && rd.fromPattern.trim()
  ).length;
  const totalActiveRules = reqActive + respActive + cookieActive + queryActive + redirectActive;

  const hasReqHeaders = activeProfile.requestHeaders.length > 0;
  const hasRespHeaders = activeProfile.responseHeaders.length > 0;
  const hasCookies = activeProfile.cookies.length > 0;
  const hasQueryParams = (activeProfile.queryParams ?? []).length > 0;
  const hasRedirects = (activeProfile.redirects ?? []).length > 0;
  const hasAnySection =
    hasReqHeaders || hasRespHeaders || hasCookies || hasQueryParams || hasRedirects;
  const hasSearchMatches =
    !q ||
    filteredReqHeaders.length > 0 ||
    filteredRespHeaders.length > 0 ||
    filteredCookies.length > 0 ||
    filteredQueryParams.length > 0 ||
    filteredRedirects.length > 0;

  let currentTabOriginPattern: string | null = null;
  try {
    if (currentTabInfo.url.startsWith('http')) {
      currentTabOriginPattern = `*://${new URL(currentTabInfo.url).hostname}/*`;
    }
  } catch {
    currentTabOriginPattern = null;
  }

  // Idle countdown calculation
  const remainingMinutes =
    !state.isPaused && state.security.autoPauseMinutes > 0
      ? Math.max(
          1,
          Math.ceil(
            (state.lastActivityAt +
              state.security.autoPauseMinutes * 60_000 -
              nowTick) /
              60_000
          )
        )
      : null;

  // Stateful status echo
  const statusEcho = (() => {
    if (syncHealth?.status === 'error') {
      return { tone: 'error', text: 'Sync failed — rules may be out of date' };
    }
    if (state.isPaused) {
      return {
        tone: 'paused',
        text:
          state.pausedReason === 'auto'
            ? `Auto-paused after ${state.security.autoPauseMinutes}m idle`
            : 'Paused manually',
      };
    }
    if (activeProfile.tabLockId !== null) {
      if (activeProfile.tabLockId === currentTabInfo.id) {
        return { tone: 'ok', text: `Active on this tab (#${activeProfile.tabLockId})` };
      }
      return {
        tone: 'muted',
        text: `Not applying here (locked to ${lockedTabTitle || `Tab #${activeProfile.tabLockId}`})`,
      };
    }
    return {
      tone: 'ok',
      text: `Active (${totalActiveRules} rules)`,
    };
  })();

  return (
    <div
      className={`app-shell surface-${surface} density-${
        state.compactDensity ? 'compact' : 'comfort'
      }`}
    >
      <datalist id="req-header-suggestions">
        {COMMON_REQUEST_HEADERS.map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>
      <datalist id="resp-header-suggestions">
        {COMMON_RESPONSE_HEADERS.map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>

      <ProfileRail
        profiles={state.profiles}
        activeProfileId={activeProfile.id}
        multiProfileMode={state.multiProfileMode}
        isPaused={state.isPaused}
        onSelect={(id) => commit((prev) => ({ ...prev, activeProfileId: id }))}
        onAdd={addProfile}
        onMoveProfile={moveProfile}
      />

      <div className="main-pane">
        <TopBar
          profile={activeProfile}
          isPaused={state.isPaused}
          multiProfileMode={state.multiProfileMode}
          theme={state.theme}
          surface={surface}
          onUpdateProfile={updateActiveProfile}
          onTogglePause={() =>
            commit((prev) => ({
              ...prev,
              isPaused: !prev.isPaused,
              pausedReason: !prev.isPaused ? 'manual' : null,
            }))
          }
          onToggleTabLock={() => void handleToggleTabLock()}
          onAddRule={handleAddRule}
          onCloneProfile={cloneActiveProfile}
          onDeleteProfile={deleteActiveProfile}
          onOpenImport={() => setShowImport(true)}
          onOpenSecurity={() => setShowSecurity(true)}
          compactDensity={state.compactDensity}
          onToggleCompactDensity={() =>
            commit((prev) => ({ ...prev, compactDensity: !prev.compactDensity }))
          }
          onToggleMultiProfile={() =>
            commit((prev) => ({ ...prev, multiProfileMode: !prev.multiProfileMode }))
          }
          onCycleTheme={handleCycleTheme}
          onOpenSidePanel={() => void handleOpenSidePanel()}
          onOpenOptions={handleOpenOptions}
        />

        <nav className="sub-nav">
          <div className="tab-group">
            <span className="tab-btn active" style={{ cursor: 'default' }}>
              <Layers size={13} />
              Rules ({totalActiveRules})
            </span>
          </div>

          <div className="status-pill" aria-live="polite">
            <span className={`status-dot ${statusEcho.tone}`} />
            <span>{statusEcho.text}</span>
            {remainingMinutes !== null && (
              <span title="Time until idle auto-pause" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                · <Clock size={10} /> {remainingMinutes}m
              </span>
            )}
            <button
              type="button"
              className="row-del-btn"
              title="Search rules (Cmd/Ctrl+F)"
              onClick={() => {
                setShowSearch((v) => !v);
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }}
            >
              <Search size={13} />
            </button>
          </div>
        </nav>

        <div className="content-scroll">
            {syncHealth && syncHealth.status !== 'ok' && (
              <div className="error-banner" role="alert">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={14} />
                  <span>{syncHealth.errorMessage}</span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void retrySync()}
                >
                  <RefreshCw size={12} /> Retry Sync
                </button>
              </div>
            )}

            {recoveryNotice && (
              <div className="warning-banner">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{recoveryNotice}</span>
                  <button
                    type="button"
                    className="row-del-btn"
                    onClick={() => void dismissRecoveryNotice()}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            )}

            {saveError && (
              <div className="error-banner" role="alert">
                <span>Save failed and changes were reverted: {saveError}</span>
              </div>
            )}

            {state.isPaused && (
              <div className="paused-banner">
                <span>
                  {state.pausedReason === 'auto' ? (
                    <>
                      <strong>Auto-paused</strong> after {state.security.autoPauseMinutes}m of
                      inactivity.
                    </>
                  ) : (
                    <>
                      Modifications are currently <strong>paused</strong>.
                    </>
                  )}{' '}
                  All profile rules are preserved locally.
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() =>
                    commit((prev) => ({
                      ...prev,
                      isPaused: false,
                      pausedReason: null,
                    }))
                  }
                >
                  <Play size={12} /> Resume
                </button>
              </div>
            )}

            {showSearch && (
              <div className="search-bar">
                <Search size={13} color="var(--text-muted)" />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="field-input"
                  style={{ flex: 1, borderBottom: 'none' }}
                  placeholder="Filter rules by name, value, pattern, or comment..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="row-del-btn"
                    onClick={() => setSearchQuery('')}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            {profileWarnings.length > 0 && (
              <div className="warning-banner">
                {profileWarnings.map((w, i) => (
                  <div key={`${w.ruleId ?? 'global'}-${i}`}>• {w.message}</div>
                ))}
              </div>
            )}

            {!hasAnySection ? (
              <div className="empty-state">
                <p style={{ marginBottom: 12 }}>
                  {readOnly
                    ? 'No rules configured in this managed profile.'
                    : 'No rules added yet. Click + in the toolbar or choose one below to start:'}
                </p>
                {!readOnly && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="icon-btn primary"
                      onClick={() => handleAddRule('requestHeader')}
                    >
                      <Plus size={13} /> Request header
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleAddRule('responseHeader')}
                    >
                      <Plus size={13} /> Response header
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleAddRule('cookie')}
                    >
                      <Plus size={13} /> Add cookie
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleAddRule('queryParam')}
                    >
                      <Plus size={13} /> Query param
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleAddRule('redirect')}
                    >
                      <Plus size={13} /> Redirect
                    </button>
                  </div>
                )}
              </div>
            ) : !hasSearchMatches ? (
              <div className="empty-hint">No rules match &ldquo;{searchQuery}&rdquo;.</div>
            ) : null}

            {hasReqHeaders && (!q || filteredReqHeaders.length > 0) && (
              <RuleSection
                title="Request headers"
                activeCount={reqActive}
                totalCount={activeProfile.requestHeaders.length}
                forceOpen={Boolean(q && filteredReqHeaders.length > 0)}
                readOnly={readOnly}
                onAdd={() => handleAddRule('requestHeader')}
              >
                {filteredReqHeaders.map((rule) => (
                  <HeaderRow
                    key={rule.id}
                    rule={rule}
                    target="request"
                    hideComment={activeProfile.hideComment}
                    maskSecrets={state.security.maskSecrets}
                    presentationMode={state.security.presentationMode}
                    isScoped={isScoped}
                    requireScopeForSensitive={state.security.requireScopeForSensitive}
                    readOnly={readOnly}
                    datalistId="req-header-suggestions"
                    onChange={(next) =>
                      updateActiveProfile((p) => ({
                        ...p,
                        requestHeaders: p.requestHeaders.map((r) =>
                          r.id === rule.id ? next : r
                        ),
                      }))
                    }
                    onDelete={() =>
                      updateActiveProfile((p) => ({
                        ...p,
                        requestHeaders: p.requestHeaders.filter((r) => r.id !== rule.id),
                      }))
                    }
                    onLockTab={() => void handleToggleTabLock()}
                    onAddCurrentSiteFilter={handleAddCurrentSiteFilter}
                  />
                ))}
              </RuleSection>
            )}

            {hasRespHeaders && (!q || filteredRespHeaders.length > 0) && (
              <RuleSection
                title="Response headers"
                activeCount={respActive}
                totalCount={activeProfile.responseHeaders.length}
                forceOpen={Boolean(q && filteredRespHeaders.length > 0)}
                readOnly={readOnly}
                onAdd={() => handleAddRule('responseHeader')}
              >
                {filteredRespHeaders.map((rule) => (
                  <HeaderRow
                    key={rule.id}
                    rule={rule}
                    target="response"
                    hideComment={activeProfile.hideComment}
                    maskSecrets={state.security.maskSecrets}
                    presentationMode={state.security.presentationMode}
                    isScoped={isScoped}
                    requireScopeForSensitive={state.security.requireScopeForSensitive}
                    readOnly={readOnly}
                    datalistId="resp-header-suggestions"
                    onChange={(next) =>
                      updateActiveProfile((p) => ({
                        ...p,
                        responseHeaders: p.responseHeaders.map((r) =>
                          r.id === rule.id ? next : r
                        ),
                      }))
                    }
                    onDelete={() =>
                      updateActiveProfile((p) => ({
                        ...p,
                        responseHeaders: p.responseHeaders.filter(
                          (r) => r.id !== rule.id
                        ),
                      }))
                    }
                    onLockTab={() => void handleToggleTabLock()}
                    onAddCurrentSiteFilter={handleAddCurrentSiteFilter}
                  />
                ))}
              </RuleSection>
            )}

            {hasCookies && (!q || filteredCookies.length > 0) && (
              <RuleSection
                title="Add cookies"
                activeCount={cookieActive}
                totalCount={activeProfile.cookies.length}
                forceOpen={Boolean(q && filteredCookies.length > 0)}
                readOnly={readOnly}
                onAdd={() => handleAddRule('cookie')}
              >
                {filteredCookies.map((rule) => (
                  <CookieRow
                    key={rule.id}
                    rule={rule}
                    hideComment={activeProfile.hideComment}
                    maskSecrets={state.security.maskSecrets}
                    presentationMode={state.security.presentationMode}
                    isScoped={isScoped}
                    requireScopeForSensitive={state.security.requireScopeForSensitive}
                    readOnly={readOnly}
                    onChange={(next) =>
                      updateActiveProfile((p) => ({
                        ...p,
                        cookies: p.cookies.map((c) => (c.id === rule.id ? next : c)),
                      }))
                    }
                    onDelete={() =>
                      updateActiveProfile((p) => ({
                        ...p,
                        cookies: p.cookies.filter((c) => c.id !== rule.id),
                      }))
                    }
                    onLockTab={() => void handleToggleTabLock()}
                    onAddCurrentSiteFilter={handleAddCurrentSiteFilter}
                  />
                ))}
              </RuleSection>
            )}

            {hasQueryParams && (!q || filteredQueryParams.length > 0) && (
              <RuleSection
                title="Query parameters"
                activeCount={queryActive}
                totalCount={(activeProfile.queryParams ?? []).length}
                forceOpen={Boolean(q && filteredQueryParams.length > 0)}
                readOnly={readOnly}
                onAdd={() => handleAddRule('queryParam')}
              >
                {filteredQueryParams.map((rule) => (
                  <QueryParamRow
                    key={rule.id}
                    rule={rule}
                    hideComment={activeProfile.hideComment}
                    maskSecrets={state.security.maskSecrets}
                    presentationMode={state.security.presentationMode}
                    isScoped={isScoped}
                    requireScopeForSensitive={state.security.requireScopeForSensitive}
                    readOnly={readOnly}
                    onChange={(next) =>
                      updateActiveProfile((p) => ({
                        ...p,
                        queryParams: (p.queryParams ?? []).map((qp) =>
                          qp.id === rule.id ? next : qp
                        ),
                      }))
                    }
                    onDelete={() =>
                      updateActiveProfile((p) => ({
                        ...p,
                        queryParams: (p.queryParams ?? []).filter((qp) => qp.id !== rule.id),
                      }))
                    }
                    onLockTab={() => void handleToggleTabLock()}
                    onAddCurrentSiteFilter={handleAddCurrentSiteFilter}
                  />
                ))}
              </RuleSection>
            )}

            {hasRedirects && (!q || filteredRedirects.length > 0) && (
              <RuleSection
                title="Redirects"
                activeCount={redirectActive}
                totalCount={(activeProfile.redirects ?? []).length}
                forceOpen={Boolean(q && filteredRedirects.length > 0)}
                readOnly={readOnly}
                onAdd={() => handleAddRule('redirect')}
              >
                {filteredRedirects.map((rule) => (
                  <RedirectRow
                    key={rule.id}
                    rule={rule}
                    hideComment={activeProfile.hideComment}
                    tabLocked={activeProfile.tabLockId !== null}
                    requireScopeForSensitive={state.security.requireScopeForSensitive}
                    readOnly={readOnly}
                    currentTabOriginPattern={currentTabOriginPattern}
                    onChange={(next) =>
                      updateActiveProfile((p) => ({
                        ...p,
                        redirects: (p.redirects ?? []).map((rd) =>
                          rd.id === rule.id ? next : rd
                        ),
                      }))
                    }
                    onDelete={() =>
                      updateActiveProfile((p) => ({
                        ...p,
                        redirects: (p.redirects ?? []).filter((rd) => rd.id !== rule.id),
                      }))
                    }
                    onLockTab={() => void handleToggleTabLock()}
                  />
                ))}
              </RuleSection>
            )}
        </div>
      </div>

      {showImport && (
        <ImportModal
          existingCount={state.profiles.length}
          onClose={() => setShowImport(false)}
          onImport={(imported: Profile[]) => {
            commit((prev) => ({
              ...prev,
              activeProfileId: imported[0].id,
              profiles: [...prev.profiles, ...imported],
            }));
          }}
        />
      )}

      {showSecurity && (
        <SecurityModal
          security={state.security}
          policy={policy}
          syncHealth={syncHealth}
          ephemeralCount={countEphemeralRules(state)}
          onChange={(nextSecurity) =>
            commit((prev) => ({ ...prev, security: nextSecurity }))
          }
          onForceSync={retrySync}
          onWipeEphemeral={wipeEphemeralSecrets}
          onWipeAll={handleWipeAll}
          onClose={() => setShowSecurity(false)}
        />
      )}
    </div>
  );
}
