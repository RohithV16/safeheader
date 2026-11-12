import { PROFILE_COLORS } from './constants';
import { importProfilesFromJson } from './modheader-compat';
import type { ExtensionState, ManagedPolicy, Profile, SecuritySettings } from './types';

export function createEmptyManagedPolicy(): ManagedPolicy {
  return {
    hasPolicy: false,
    enforceScopeForSensitive: false,
    enforceMaskSecrets: false,
    maxAutoPauseMinutes: null,
    managedProfiles: [],
  };
}

export function parseManagedPolicy(raw: unknown): ManagedPolicy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createEmptyManagedPolicy();
  }

  const obj = raw as Record<string, unknown>;
  const hasAnyKey =
    'enforceScopeForSensitive' in obj ||
    'enforceMaskSecrets' in obj ||
    'maxAutoPauseMinutes' in obj ||
    'managedProfiles' in obj;

  let managedProfiles: Profile[] = [];
  if (Array.isArray(obj.managedProfiles) && obj.managedProfiles.length > 0) {
    try {
      managedProfiles = importProfilesFromJson(JSON.stringify(obj.managedProfiles), 0).map(
        (p, idx) => ({
          ...p,
          id: `managed-${idx + 1}`,
          shortTitle: p.shortTitle || `M${idx + 1}`,
          color: p.color || PROFILE_COLORS[idx % PROFILE_COLORS.length],
          isManaged: true,
          tabLockId: null,
        })
      );
    } catch {
      managedProfiles = [];
    }
  }

  const maxAutoPauseMinutes =
    typeof obj.maxAutoPauseMinutes === 'number' &&
    Number.isFinite(obj.maxAutoPauseMinutes) &&
    obj.maxAutoPauseMinutes >= 1 &&
    obj.maxAutoPauseMinutes <= 1440
      ? Math.round(obj.maxAutoPauseMinutes)
      : null;

  return {
    hasPolicy: hasAnyKey,
    enforceScopeForSensitive: Boolean(obj.enforceScopeForSensitive),
    enforceMaskSecrets: Boolean(obj.enforceMaskSecrets),
    maxAutoPauseMinutes,
    managedProfiles,
  };
}

export async function loadManagedPolicy(): Promise<ManagedPolicy> {
  if (typeof chrome === 'undefined' || !chrome.storage?.managed) {
    return createEmptyManagedPolicy();
  }
  try {
    const raw = await chrome.storage.managed.get([
      'enforceScopeForSensitive',
      'enforceMaskSecrets',
      'maxAutoPauseMinutes',
      'managedProfiles',
    ]);
    return parseManagedPolicy(raw);
  } catch {
    return createEmptyManagedPolicy();
  }
}

export function clampSecurityWithPolicy(
  security: SecuritySettings,
  policy: ManagedPolicy
): SecuritySettings {
  const autoPauseMinutes =
    policy.maxAutoPauseMinutes !== null
      ? security.autoPauseMinutes === 0 || security.autoPauseMinutes > policy.maxAutoPauseMinutes
        ? policy.maxAutoPauseMinutes
        : security.autoPauseMinutes
      : security.autoPauseMinutes;

  return {
    requireScopeForSensitive: policy.enforceScopeForSensitive
      ? true
      : security.requireScopeForSensitive,
    maskSecrets: policy.enforceMaskSecrets ? true : security.maskSecrets,
    presentationMode: security.presentationMode,
    autoPauseMinutes,
  };
}

export function applyManagedPolicyToState(
  state: ExtensionState,
  policy: ManagedPolicy
): ExtensionState {
  const clampedSecurity = clampSecurityWithPolicy(state.security, policy);
  const userProfiles = state.profiles.filter((p) => !p.isManaged);
  const combinedProfiles =
    policy.managedProfiles.length > 0
      ? [...policy.managedProfiles, ...userProfiles]
      : userProfiles;

  const activeExists = combinedProfiles.some((p) => p.id === state.activeProfileId);

  return {
    ...state,
    security: clampedSecurity,
    activeProfileId: activeExists ? state.activeProfileId : (combinedProfiles[0]?.id ?? ''),
    profiles: combinedProfiles,
  };
}
