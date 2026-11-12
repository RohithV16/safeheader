import { loadState, saveState } from '../shared/storage';
import type { ExtensionState } from '../shared/types';

export async function handleTabRemoved(closedTabId: number): Promise<void> {
  const state = await loadState();
  let changed = false;

  const updatedProfiles = state.profiles.map((profile) => {
    if (profile.tabLockId === closedTabId) {
      changed = true;
      return { ...profile, tabLockId: null };
    }
    return profile;
  });

  if (changed) {
    await saveState({ ...state, profiles: updatedProfiles });
  }
}

/**
 * Clears stale or reused tabLockId references after browser restarts because
 * Chrome session rules do not persist across shutdowns and tab IDs can be reused.
 */
export async function clearDeadTabLocks(state: ExtensionState): Promise<ExtensionState> {
  const lockedProfiles = state.profiles.filter((p) => p.tabLockId !== null);
  if (lockedProfiles.length === 0) return state;

  const validTabIds = new Set<number>();
  await Promise.all(
    lockedProfiles.map(async (p) => {
      if (p.tabLockId === null) return;
      try {
        await chrome.tabs.get(p.tabLockId);
        validTabIds.add(p.tabLockId);
      } catch {
        // Tab no longer exists
      }
    })
  );

  let changed = false;
  const profiles = state.profiles.map((p) => {
    if (p.tabLockId !== null && !validTabIds.has(p.tabLockId)) {
      changed = true;
      return { ...p, tabLockId: null };
    }
    return p;
  });

  if (!changed) return state;
  const next = { ...state, profiles };
  await saveState(next);
  return next;
}
