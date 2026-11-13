import {
  AlertCircle,
  Layers,
  Play,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { useEffect, useState, lazy, Suspense } from 'react';
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
  loadState,
} from '../shared/storage';
import type { Profile, ThemeMode } from '../shared/types';
import { hasSpecificScope } from '../shared/validators';
import { CookieRow } from './components/CookieRow';
import { HeaderRow } from './components/HeaderRow';
import { ProfileRail } from './components/ProfileRail';
import { QueryParamRow } from './components/QueryParamRow';
import { RedirectRow } from './components/RedirectRow';
import { RuleSection } from './components/RuleSection';
import { TopBar } from './components/TopBar';
import { useExtensionState } from './hooks/useExtensionState';

const ImportModal = lazy(() =>
  import('./components/ImportModal').then((m) => ({ default: m.ImportModal }))
);
const SecurityModal = lazy(() =>
  import('./components/SecurityModal').then((m) => ({ default: m.SecurityModal }))
);

interface AppProps {
  readonly surface: 'popup' | 'sidepanel' | 'options';
}

function resolveCurrentTheme(theme: ThemeMode, systemDark: boolean): 'dark' | 'light' {
  if (theme === 'system') {
    return systemDark ? 'dark' : 'light';
  }
  return theme;
}

function getTabOriginPattern(url: string): string | null {
  try {
    if (url.startsWith('http')) {
      return `*://${new URL(url).hostname}/*`;
    }
  } catch {
    // ignore invalid URLs
  }
  return null;
}

function computeStatusEcho(
  syncStatus: string | undefined,
  isPaused: boolean,
  totalActiveRules: number
): { tone: string; text: string } {
  if (syncStatus === 'error') {
    return { tone: 'error', text: 'Sync failed — rules may be out of date' };
  }
  if (isPaused) {
    return {
      tone: 'paused',
      text: 'Paused manually',
    };
  }
  return {
    tone: 'ok',
    text: `Active (${totalActiveRules} rules)`,
  };
}

interface EmptyRulesNoticeProps {
  readonly hasAnySection: boolean;
  readonly readOnly: boolean;
  readonly onAddRule: (
    kind: 'requestHeader' | 'responseHeader' | 'cookie' | 'queryParam' | 'redirect'
  ) => void;
}

function EmptyRulesNotice({
  hasAnySection,
  readOnly,
  onAddRule,
}: EmptyRulesNoticeProps) {
  if (!hasAnySection) {
    return (
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
              onClick={() => onAddRule('requestHeader')}
            >
              <Plus size={13} /> Request header
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onAddRule('responseHeader')}
            >
              <Plus size={13} /> Response header
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onAddRule('cookie')}
            >
              <Plus size={13} /> Add cookie
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onAddRule('queryParam')}
            >
              <Plus size={13} /> Query param
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onAddRule('redirect')}
            >
              <Plus size={13} /> Redirect
            </button>
          </div>
        )}
      </div>
    );
  }
  return null;
}

interface AppBannersProps {
  readonly syncHealth: { status: string; errorMessage?: string | null } | null;
  readonly recoveryNotice: string | null;
  readonly saveError: string | null;
  readonly isPaused: boolean;
  readonly profileWarnings: ReadonlyArray<{ ruleId?: string; message: string }>;
  readonly onRetrySync: () => void;
  readonly onDismissRecoveryNotice: () => void;
  readonly onRetrySave: () => void;
  readonly onResume: () => void;
}

function AppBanners({
  syncHealth,
  recoveryNotice,
  saveError,
  isPaused,
  profileWarnings,
  onRetrySync,
  onDismissRecoveryNotice,
  onRetrySave,
  onResume,
}: AppBannersProps) {
  return (
    <>
      {syncHealth && syncHealth.status !== 'ok' && (
        <div
          className={syncHealth.status === 'degraded' ? 'warning-banner' : 'error-banner'}
          role="alert"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={14} />
            <span>{syncHealth.errorMessage}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onRetrySync}
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
              onClick={onDismissRecoveryNotice}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {saveError && (
        <div className="error-banner" role="alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={14} />
            <span>Save failed: {saveError}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onRetrySave}
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {isPaused && (
        <div className="paused-banner">
          <span>
            Modifications are currently <strong>paused</strong>. All profile rules are preserved locally.
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={onResume}
          >
            <Play size={12} /> Resume
          </button>
        </div>
      )}

      {profileWarnings.length > 0 && (
        <div className="warning-banner">
          {profileWarnings.map((w, i) => (
            <div key={`${w.ruleId ?? 'global'}-${i}`}>• {w.message}</div>
          ))}
        </div>
      )}
    </>
  );
}

function reorderRuleInProfile<
  K extends 'requestHeaders' | 'responseHeaders' | 'cookies' | 'queryParams' | 'redirects'
>(
  profile: Profile,
  key: K,
  fromIndex: number,
  offset: number
): Profile {
  const list = profile[key] as unknown[];
  const targetIndex = fromIndex + offset;
  if (!list || targetIndex < 0 || targetIndex >= list.length || fromIndex === targetIndex) {
    return profile;
  }
  const copy = [...list];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(targetIndex, 0, item);
  return { ...profile, [key]: copy };
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
  const [currentTabInfo, setCurrentTabInfo] = useState<{
    id: number | null;
    url: string;
    title: string;
  }>({ id: null, url: '', title: '' });

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

  const resolvedTheme = resolveCurrentTheme(state.theme, systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
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

  if (!loaded || !activeProfile) {
    return (
      <div className={`app-shell surface-${surface}`}>
        <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    );
  }

  const readOnly = Boolean(activeProfile.isManaged);
  const isScoped = hasSpecificScope(activeProfile.urlFilters);

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

  const handleOpenSidePanel = async () => {
    try {
      if (chrome.sidePanel?.open) {
        const win = await chrome.windows.getCurrent();
        if (win.id !== undefined) {
          await chrome.sidePanel.open({ windowId: win.id });
          if (surface === 'popup') {
            window.close();
          }
          return;
        }
      }
      const browserGlobal = (
        globalThis as unknown as {
          browser?: { sidebarAction?: { open?: () => Promise<void> } };
        }
      ).browser;
      if (browserGlobal?.sidebarAction?.open) {
        await browserGlobal.sidebarAction.open();
        if (surface === 'popup') {
          window.close();
        }
      }
    } catch (err) {
      console.error('Unable to open side panel or sidebar:', err);
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

  const reqHeaders = activeProfile.requestHeaders;
  const respHeaders = activeProfile.responseHeaders;
  const cookies = activeProfile.cookies;
  const queryParams = activeProfile.queryParams ?? [];
  const redirects = activeProfile.redirects ?? [];

  const profileWarnings = warnings.filter((w) => w.profileId === activeProfile.id);

  const reqActive = reqHeaders.filter((h) => h.enabled && h.name.trim()).length;
  const respActive = respHeaders.filter((h) => h.enabled && h.name.trim()).length;
  const cookieActive = cookies.filter((c) => c.enabled && c.name.trim()).length;
  const queryActive = queryParams.filter((qp) => qp.enabled && qp.name.trim()).length;
  const redirectActive = redirects.filter((rd) => rd.enabled && rd.fromPattern.trim()).length;
  const totalActiveRules = reqActive + respActive + cookieActive + queryActive + redirectActive;

  const hasReqHeaders = reqHeaders.length > 0;
  const hasRespHeaders = respHeaders.length > 0;
  const hasCookies = cookies.length > 0;
  const hasQueryParams = queryParams.length > 0;
  const hasRedirects = redirects.length > 0;
  const hasAnySection =
    hasReqHeaders || hasRespHeaders || hasCookies || hasQueryParams || hasRedirects;

  const currentTabOriginPattern = getTabOriginPattern(currentTabInfo.url);

  const statusEcho = computeStatusEcho(
    syncHealth?.status,
    state.isPaused,
    totalActiveRules
  );

  const densityClass = state.compactDensity ? 'density-compact' : 'density-comfort';

  return (
    <div className={`app-shell surface-${surface} ${densityClass}`}>
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

        <nav className="status-strip" aria-label="Status & tools">
          <div className="status-strip-left">
            <span className={`status-dot ${statusEcho.tone}`} />
            <span className="status-echo-text">{statusEcho.text}</span>
            {state.multiProfileMode && (
              <span
                className="status-multi-badge"
                title="Multi-Profile Mode active: all enabled profiles apply by rank order"
              >
                <Layers size={11} /> Multi-Profile
              </span>
            )}
          </div>
        </nav>

        <div className="content-scroll">
          <AppBanners
            syncHealth={syncHealth}
            recoveryNotice={recoveryNotice}
            saveError={saveError}
            isPaused={state.isPaused}
            profileWarnings={profileWarnings}
            onRetrySync={() => void retrySync()}
            onDismissRecoveryNotice={() => void dismissRecoveryNotice()}
            onRetrySave={() => commit((prev) => ({ ...prev }))}
            onResume={() =>
              commit((prev) => ({
                ...prev,
                isPaused: false,
                pausedReason: null,
              }))
            }
          />

          <EmptyRulesNotice
            hasAnySection={hasAnySection}
            readOnly={readOnly}
            onAddRule={handleAddRule}
          />

          {hasReqHeaders && (
            <RuleSection
              title="Request headers"
              activeCount={reqActive}
              totalCount={reqHeaders.length}
              readOnly={readOnly}
              onAdd={() => handleAddRule('requestHeader')}
            >
              {reqHeaders.map((rule, idx) => (
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
                  canMoveUp={idx > 0}
                  canMoveDown={idx < reqHeaders.length - 1}
                  onMoveUp={() =>
                    updateActiveProfile((p) => reorderRuleInProfile(p, 'requestHeaders', idx, -1))
                  }
                  onMoveDown={() =>
                    updateActiveProfile((p) => reorderRuleInProfile(p, 'requestHeaders', idx, 1))
                  }
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
                />
              ))}
            </RuleSection>
          )}

          {hasRespHeaders && (
            <RuleSection
              title="Response headers"
              activeCount={respActive}
              totalCount={respHeaders.length}
              readOnly={readOnly}
              onAdd={() => handleAddRule('responseHeader')}
            >
              {respHeaders.map((rule, idx) => (
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
                  canMoveUp={idx > 0}
                  canMoveDown={idx < respHeaders.length - 1}
                  onMoveUp={() =>
                    updateActiveProfile((p) => reorderRuleInProfile(p, 'responseHeaders', idx, -1))
                  }
                  onMoveDown={() =>
                    updateActiveProfile((p) => reorderRuleInProfile(p, 'responseHeaders', idx, 1))
                  }
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
                />
              ))}
            </RuleSection>
          )}

          {hasCookies && (
            <RuleSection
              title="Add cookies"
              activeCount={cookieActive}
              totalCount={cookies.length}
              readOnly={readOnly}
              onAdd={() => handleAddRule('cookie')}
            >
              {cookies.map((rule, idx) => (
                <CookieRow
                  key={rule.id}
                  rule={rule}
                  hideComment={activeProfile.hideComment}
                  maskSecrets={state.security.maskSecrets}
                  presentationMode={state.security.presentationMode}
                  isScoped={isScoped}
                  requireScopeForSensitive={state.security.requireScopeForSensitive}
                  readOnly={readOnly}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < cookies.length - 1}
                  onMoveUp={() =>
                    updateActiveProfile((p) => reorderRuleInProfile(p, 'cookies', idx, -1))
                  }
                  onMoveDown={() =>
                    updateActiveProfile((p) => reorderRuleInProfile(p, 'cookies', idx, 1))
                  }
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
                />
              ))}
            </RuleSection>
          )}

          {hasQueryParams && (
            <RuleSection
              title="Query parameters"
              activeCount={queryActive}
              totalCount={queryParams.length}
              readOnly={readOnly}
              onAdd={() => handleAddRule('queryParam')}
            >
              {queryParams.map((rule, idx) => (
                <QueryParamRow
                  key={rule.id}
                  rule={rule}
                  hideComment={activeProfile.hideComment}
                  maskSecrets={state.security.maskSecrets}
                  presentationMode={state.security.presentationMode}
                  isScoped={isScoped}
                  requireScopeForSensitive={state.security.requireScopeForSensitive}
                  readOnly={readOnly}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < queryParams.length - 1}
                  onMoveUp={() =>
                    updateActiveProfile((p) => reorderRuleInProfile(p, 'queryParams', idx, -1))
                  }
                  onMoveDown={() =>
                    updateActiveProfile((p) => reorderRuleInProfile(p, 'queryParams', idx, 1))
                  }
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
                />
              ))}
            </RuleSection>
          )}

          {hasRedirects && (
            <RuleSection
              title="Redirects"
              activeCount={redirectActive}
              totalCount={redirects.length}
              readOnly={readOnly}
              onAdd={() => handleAddRule('redirect')}
            >
              {redirects.map((rule, idx) => (
                <RedirectRow
                  key={rule.id}
                  rule={rule}
                  hideComment={activeProfile.hideComment}
                  requireScopeForSensitive={state.security.requireScopeForSensitive}
                  readOnly={readOnly}
                  currentTabOriginPattern={currentTabOriginPattern}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < redirects.length - 1}
                  onMoveUp={() =>
                    updateActiveProfile((p) => reorderRuleInProfile(p, 'redirects', idx, -1))
                  }
                  onMoveDown={() =>
                    updateActiveProfile((p) => reorderRuleInProfile(p, 'redirects', idx, 1))
                  }
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
                />
              ))}
            </RuleSection>
          )}
        </div>
      </div>

      {showImport && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {showSecurity && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </div>
  );
}
