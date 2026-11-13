import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EPHEMERAL_SECRETS_SESSION_KEY,
  PROFILE_COLORS,
  RECOVERY_NOTICE_SESSION_KEY,
  STORAGE_KEY,
  SYNC_HEALTH_SESSION_KEY,
  WARNINGS_SESSION_KEY,
} from '../../shared/constants';
import {
  extractEphemeralSecretsMap,
  hydrateEphemeralSecrets,
  loadEphemeralSecrets,
  saveEphemeralSecrets,
  stripEphemeralValues,
} from '../../shared/ephemeral';
import { applyManagedPolicyToState, createEmptyManagedPolicy, loadManagedPolicy } from '../../shared/policy';
import {
  createDefaultProfile,
  createDefaultState,
  findNextAvailableProfileIndex,
  generateId,
  loadState,
  normalizeState,
  saveState,
} from '../../shared/storage';
import type {
  CompileWarning,
  ExtensionState,
  ManagedPolicy,
  Profile,
  SyncHealth,
} from '../../shared/types';

export function useExtensionState() {
  const [state, setState] = useState<ExtensionState>(() => createDefaultState());
  const [policy, setPolicy] = useState<ManagedPolicy>(() => createEmptyManagedPolicy());
  const [warnings, setWarnings] = useState<CompileWarning[]>([]);
  const [syncHealth, setSyncHealth] = useState<SyncHealth | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const policyRef = useRef(policy);
  policyRef.current = policy;
  const ephemeralRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;

    void Promise.all([loadState(), loadManagedPolicy(), loadEphemeralSecrets()]).then(
      ([initial, loadedPolicy, secrets]) => {
        if (mounted) {
          ephemeralRef.current = secrets;
          setPolicy(loadedPolicy);
          setState(applyManagedPolicyToState(initial, loadedPolicy));
          setLoaded(true);
        }
      }
    );

    if (chrome.storage?.session) {
      void chrome.storage.session
        .get([WARNINGS_SESSION_KEY, SYNC_HEALTH_SESSION_KEY, RECOVERY_NOTICE_SESSION_KEY])
        .then((res) => {
          if (!mounted) return;
          if (Array.isArray(res[WARNINGS_SESSION_KEY])) {
            setWarnings(res[WARNINGS_SESSION_KEY] as CompileWarning[]);
          }
          if (res[SYNC_HEALTH_SESSION_KEY]) {
            setSyncHealth(res[SYNC_HEALTH_SESSION_KEY] as SyncHealth);
          }
          if (typeof res[RECOVERY_NOTICE_SESSION_KEY] === 'string') {
            setRecoveryNotice(res[RECOVERY_NOTICE_SESSION_KEY]);
          }
        });
    }

    const handleSessionChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[EPHEMERAL_SECRETS_SESSION_KEY]) {
        const raw = changes[EPHEMERAL_SECRETS_SESSION_KEY].newValue;
        const nextSecrets =
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, string>)
            : {};
        ephemeralRef.current = nextSecrets;
        setState((prev) =>
          applyManagedPolicyToState(
            hydrateEphemeralSecrets(stripEphemeralValues(prev), nextSecrets),
            policyRef.current
          )
        );
      }
      if (changes[WARNINGS_SESSION_KEY]) {
        const next = changes[WARNINGS_SESSION_KEY].newValue;
        setWarnings(Array.isArray(next) ? (next as CompileWarning[]) : []);
      }
      if (changes[SYNC_HEALTH_SESSION_KEY]) {
        setSyncHealth((changes[SYNC_HEALTH_SESSION_KEY].newValue as SyncHealth) ?? null);
      }
      if (changes[RECOVERY_NOTICE_SESSION_KEY]) {
        const v = changes[RECOVERY_NOTICE_SESSION_KEY].newValue;
        setRecoveryNotice(typeof v === 'string' ? v : null);
      }
    };

    const onStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName === 'local' && changes[STORAGE_KEY]) {
        const normalized = normalizeState(changes[STORAGE_KEY].newValue);
        const hydrated = hydrateEphemeralSecrets(normalized, ephemeralRef.current);
        setState(applyManagedPolicyToState(hydrated, policyRef.current));
        return;
      }
      if (areaName === 'managed') {
        void loadManagedPolicy().then((nextPolicy) => {
          if (!mounted) return;
          setPolicy(nextPolicy);
          setState((prev) => applyManagedPolicyToState(prev, nextPolicy));
        });
        return;
      }
      if (areaName === 'session') {
        handleSessionChange(changes);
      }
    };

    chrome.storage.onChanged.addListener(onStorageChange);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(onStorageChange);
    };
  }, []);

  const persistThroughSw = useCallback(
    (next: ExtensionState, prev: ExtensionState) => {
      setSaveError(null);
      ephemeralRef.current = extractEphemeralSecretsMap(next);
      if (chrome.runtime?.sendMessage) {
        void chrome.runtime
          .sendMessage({ type: 'SET_STATE', state: next })
          .then((res: { ok?: boolean; error?: string } | undefined) => {
            if (res?.ok === false) {
              setSaveError(res.error ?? 'Failed to save changes.');
              setState(prev);
            }
          })
          .catch(() => {
            // Fallback direct save if SW was transiently unavailable
            void Promise.all([
              saveEphemeralSecrets(ephemeralRef.current),
              saveState(next),
            ]).catch((err) => {
              setSaveError(err instanceof Error ? err.message : 'Save failed');
              setState(prev);
            });
          });
      } else {
        void Promise.all([saveEphemeralSecrets(ephemeralRef.current), saveState(next)]);
      }
    },
    []
  );

  const commit = useCallback(
    (updater: (prev: ExtensionState) => ExtensionState) => {
      setState((prev) => {
        const rawNext = updater(prev);
        const clamped = applyManagedPolicyToState(
          { ...rawNext, lastActivityAt: Date.now() },
          policyRef.current
        );
        persistThroughSw(clamped, prev);
        return clamped;
      });
    },
    [persistThroughSw]
  );

  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0];

  const updateActiveProfile = useCallback(
    (updater: (profile: Profile) => Profile) => {
      commit((prev) => ({
        ...prev,
        profiles: prev.profiles.map((p) => {
          if (p.id !== prev.activeProfileId || p.isManaged) return p;
          return updater(p);
        }),
      }));
    },
    [commit]
  );

  const addProfile = useCallback(() => {
    commit((prev) => {
      const nextIndex = findNextAvailableProfileIndex(prev.profiles);
      const newProfile: Profile = {
        ...createDefaultProfile(nextIndex),
        order: prev.profiles.length,
      };
      return {
        ...prev,
        activeProfileId: newProfile.id,
        profiles: [...prev.profiles, newProfile],
      };
    });
  }, [commit]);

  const cloneActiveProfile = useCallback(() => {
    commit((prev) => {
      const current = prev.profiles.find((p) => p.id === prev.activeProfileId);
      if (!current) return prev;
      const existingShortTitles = new Set(
        prev.profiles.map((p) => p.shortTitle.trim().toUpperCase())
      );
      const trimmedShortTitle = current.shortTitle.trim();
      let nextShortTitle = trimmedShortTitle;
      if (!trimmedShortTitle || /^\d+$/.test(trimmedShortTitle)) {
        let candidate = prev.profiles.length + 1;
        while (existingShortTitles.has(String(candidate))) {
          candidate += 1;
        }
        nextShortTitle = String(candidate);
      }

      const cloned: Profile = {
        ...current,
        id: generateId(),
        isManaged: false,
        title: `${current.title} (Copy)`,
        shortTitle: nextShortTitle,
        color: PROFILE_COLORS[prev.profiles.length % PROFILE_COLORS.length],
        order: prev.profiles.length,
        tabLockId: null,
        requestHeaders: current.requestHeaders.map((r) => ({ ...r, id: generateId() })),
        responseHeaders: current.responseHeaders.map((r) => ({ ...r, id: generateId() })),
        cookies: current.cookies.map((c) => ({ ...c, id: generateId() })),
        urlFilters: current.urlFilters.map((f) => ({ ...f, id: generateId() })),
        queryParams: (current.queryParams ?? []).map((q) => ({ ...q, id: generateId() })),
        redirects: (current.redirects ?? []).map((rd) => ({ ...rd, id: generateId() })),
      };
      return {
        ...prev,
        activeProfileId: cloned.id,
        profiles: [...prev.profiles, cloned],
      };
    });
  }, [commit]);

  const deleteActiveProfile = useCallback(() => {
    commit((prev) => {
      const current = prev.profiles.find((p) => p.id === prev.activeProfileId);
      if (current?.isManaged) return prev;

      const userProfiles = prev.profiles.filter((p) => !p.isManaged);
      if (userProfiles.length <= 1) {
        const fresh = createDefaultProfile(1);
        return {
          ...prev,
          activeProfileId: fresh.id,
          profiles: [...prev.profiles.filter((p) => p.isManaged), fresh],
        };
      }
      const remaining = prev.profiles
        .filter((p) => p.id !== prev.activeProfileId)
        .map((p, idx) => ({ ...p, order: idx }));
      return {
        ...prev,
        activeProfileId: remaining[0].id,
        profiles: remaining,
      };
    });
  }, [commit]);

  const moveProfile = useCallback(
    (profileId: string, direction: 'up' | 'down') => {
      commit((prev) => {
        const managed = prev.profiles.filter((p) => p.isManaged);
        const user = prev.profiles.filter((p) => !p.isManaged);
        const idx = user.findIndex((p) => p.id === profileId);
        if (idx === -1) return prev;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= user.length) return prev;

        const reordered = [...user];
        [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
        const withOrders = reordered.map((p, i) => ({ ...p, order: i }));
        return {
          ...prev,
          profiles: [...managed, ...withOrders],
        };
      });
    },
    [commit]
  );

  const retrySync = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: 'FORCE_SYNC' });
  }, []);

  const wipeEphemeralSecrets = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: 'WIPE_EPHEMERAL_SECRETS' });
  }, []);

  const dismissRecoveryNotice = useCallback(async () => {
    setRecoveryNotice(null);
    if (chrome.storage?.session) {
      await chrome.storage.session.remove(RECOVERY_NOTICE_SESSION_KEY);
    }
  }, []);

  return {
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
  };
}
