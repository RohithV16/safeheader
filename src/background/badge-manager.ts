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

export async function updateBadge(
  state: ExtensionState,
  health?: SyncHealth
): Promise<void> {
  if (health?.status === 'error') {
    await Promise.all([
      chrome.action.setBadgeText({ text: '!' }),
      chrome.action.setBadgeBackgroundColor({ color: '#d93025' }),
      chrome.action.setTitle({
        title: `SafeHeader — SYNC ERROR: ${health.errorMessage ?? 'Check popup'}`,
      }),
    ]);
    return;
  }

  const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId);
  const enabledProfiles = state.multiProfileMode
    ? state.profiles.filter((p) => p.enabled)
    : activeProfile && activeProfile.enabled
      ? [activeProfile]
      : [];

  if (state.isPaused || enabledProfiles.length === 0) {
    const pauseLabel =
      state.isPaused && state.pausedReason === 'auto' ? 'Auto-paused (idle)' : 'Paused';
    await Promise.all([
      chrome.action.setBadgeText({ text: state.isPaused ? 'OFF' : '' }),
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
        title: state.isPaused
          ? `SafeHeader (${pauseLabel})`
          : 'SafeHeader (Inactive)',
      }),
    ]);
    return;
  }

  const ruleCount = enabledProfiles.reduce((sum, p) => sum + countActiveEntries(p), 0);
  const displayProfile = activeProfile ?? enabledProfiles[0];
  const badgeText =
    health?.status === 'degraded'
      ? '!'
      : ruleCount > 0
        ? state.multiProfileMode && enabledProfiles.length > 1
          ? String(ruleCount).slice(0, 4)
          : (displayProfile.shortTitle.trim() || String(ruleCount)).slice(0, 4)
        : '';

  const badgeColor =
    health?.status === 'degraded' ? '#f9ab00' : displayProfile.color || '#2e7d32';

  const titleLabel =
    state.multiProfileMode && enabledProfiles.length > 1
      ? `${enabledProfiles.length} active profiles (${ruleCount} active rules)`
      : `${displayProfile.title} (${ruleCount} active rules)${
          displayProfile.tabLockId !== null ? ` [Tab #${displayProfile.tabLockId}]` : ''
        }`;

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
