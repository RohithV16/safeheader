import type { ExtensionState, Profile, SyncHealth } from '../shared/types';

function countActiveEntries(profile: Profile): number {
  const reqCount = profile.requestHeaders.filter((h) => h.enabled && h.name.trim()).length;
  const respCount = profile.responseHeaders.filter((h) => h.enabled && h.name.trim()).length;
  const cookieCount = profile.cookies.filter((c) => c.enabled && c.name.trim()).length;
  const queryCount = (profile.queryParams ?? []).filter((q) => q.enabled && q.name.trim()).length;
  const redirectCount = (profile.redirects ?? []).filter(
    (r) => r.enabled && r.fromPattern.trim()
  ).length;
  return reqCount + respCount + cookieCount + queryCount + redirectCount;
}

function resolveEnabledProfiles(state: ExtensionState, activeProfile?: Profile): Profile[] {
  if (state.multiProfileMode) {
    return state.profiles.filter((p) => p.enabled);
  }
  if (activeProfile?.enabled) {
    return [activeProfile];
  }
  return [];
}

async function setSyncErrorBadge(errorMessage?: string | null): Promise<void> {
  await Promise.all([
    chrome.action.setBadgeText({ text: '!' }),
    chrome.action.setBadgeBackgroundColor({ color: '#d93025' }),
    chrome.action.setTitle({
      title: `SafeHeader — SYNC ERROR: ${errorMessage ?? 'Check popup'}`,
    }),
  ]);
}

async function setInactiveBadge(isPaused: boolean, pausedReason: string | null): Promise<void> {
  const pauseLabel = isPaused && pausedReason === 'auto' ? 'Auto-paused (idle)' : 'Paused';
  await Promise.all([
    chrome.action.setBadgeText({ text: isPaused ? 'OFF' : '' }),
    chrome.action.setBadgeBackgroundColor({ color: '#546e7a' }),
    chrome.action.setIcon({
      path: {
        16: 'icons/icon16-paused.png',
        32: 'icons/icon32-paused.png',
        48: 'icons/icon48-paused.png',
        128: 'icons/icon128-paused.png',
      },
    }),
    chrome.action.setTitle({
      title: isPaused ? `SafeHeader (${pauseLabel})` : 'SafeHeader (Inactive)',
    }),
  ]);
}

function resolveBadgeText(
  isDegraded: boolean,
  ruleCount: number,
  isMultiProfile: boolean,
  shortTitle: string
): string {
  if (isDegraded) return '!';
  if (ruleCount <= 0) return '';
  if (isMultiProfile) {
    return String(ruleCount).slice(0, 4);
  }
  const customTag = shortTitle.trim();
  return (customTag || String(ruleCount)).slice(0, 4);
}

function resolveBadgeColor(
  isDegraded: boolean,
  isManaged?: boolean,
  color?: string
): string {
  if (isDegraded) return '#f9ab00';
  if (isManaged) return '#1565c0';
  return color || '#2e7d32';
}

export async function updateBadge(
  state: ExtensionState,
  health?: SyncHealth
): Promise<void> {
  if (health?.status === 'error') {
    await setSyncErrorBadge(health.errorMessage);
    return;
  }

  const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId);
  const enabledProfiles = resolveEnabledProfiles(state, activeProfile);

  if (state.isPaused || enabledProfiles.length === 0) {
    await setInactiveBadge(state.isPaused, state.pausedReason);
    return;
  }

  const ruleCount = enabledProfiles.reduce((sum, p) => sum + countActiveEntries(p), 0);
  const displayProfile = activeProfile ?? enabledProfiles[0];
  const isMultiProfileActive = state.multiProfileMode && enabledProfiles.length > 1;

  const badgeText = resolveBadgeText(
    health?.status === 'degraded',
    ruleCount,
    isMultiProfileActive,
    displayProfile.shortTitle
  );

  const badgeColor = resolveBadgeColor(
    health?.status === 'degraded',
    displayProfile.isManaged,
    displayProfile.color
  );

  const titleLabel = isMultiProfileActive
    ? `${enabledProfiles.length} active profiles (${ruleCount} active rules)`
    : `${displayProfile.title} (${ruleCount} active rules)`;

  await Promise.all([
    chrome.action.setBadgeText({ text: badgeText }),
    chrome.action.setBadgeBackgroundColor({ color: badgeColor }),
    chrome.action.setIcon({
      path: {
        16: 'icons/icon16.png',
        32: 'icons/icon32.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png',
      },
    }),
    chrome.action.setTitle({
      title: `SafeHeader — ${titleLabel}`,
    }),
  ]);
}
