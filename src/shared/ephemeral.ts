import { EPHEMERAL_SECRETS_SESSION_KEY } from './constants';
import type { ExtensionState, Profile } from './types';

function collectEphemeralFromList(
  items: ReadonlyArray<{ id: string; ephemeral?: boolean; value?: string }>,
  out: Record<string, string>
): void {
  for (const item of items) {
    if (item.ephemeral && item.value) {
      out[item.id] = item.value;
    }
  }
}

function collectProfileEphemeralSecrets(profile: Profile, out: Record<string, string>): void {
  collectEphemeralFromList(profile.requestHeaders, out);
  collectEphemeralFromList(profile.responseHeaders, out);
  collectEphemeralFromList(profile.cookies, out);
  collectEphemeralFromList(profile.queryParams, out);
}

export function extractEphemeralSecretsMap(state: ExtensionState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const profile of state.profiles) {
    collectProfileEphemeralSecrets(profile, out);
  }
  return out;
}

export function countEphemeralRules(state: ExtensionState): number {
  let count = 0;
  for (const p of state.profiles) {
    count += p.requestHeaders.filter((r) => r.ephemeral).length;
    count += p.responseHeaders.filter((r) => r.ephemeral).length;
    count += p.cookies.filter((c) => c.ephemeral).length;
    count += p.queryParams.filter((q) => q.ephemeral).length;
  }
  return count;
}

/**
 * Strips values from rules marked `ephemeral: true` before persisting to
 * `chrome.storage.local` (or `.bak`), guaranteeing RAM-only secrets never hit disk.
 */
export function stripEphemeralValues(state: ExtensionState): ExtensionState {
  return {
    ...state,
    profiles: state.profiles.map((p) => ({
      ...p,
      requestHeaders: p.requestHeaders.map((r) => (r.ephemeral ? { ...r, value: '' } : r)),
      responseHeaders: p.responseHeaders.map((r) => (r.ephemeral ? { ...r, value: '' } : r)),
      cookies: p.cookies.map((c) => (c.ephemeral ? { ...c, value: '' } : c)),
      queryParams: p.queryParams.map((q) => (q.ephemeral ? { ...q, value: '' } : q)),
    })),
  };
}

export function hydrateEphemeralSecrets(
  state: ExtensionState,
  secrets: Record<string, string>
): ExtensionState {
  if (!secrets || Object.keys(secrets).length === 0) return state;
  return {
    ...state,
    profiles: state.profiles.map((p) => ({
      ...p,
      requestHeaders: p.requestHeaders.map((r) =>
        r.ephemeral ? { ...r, value: secrets[r.id] ?? r.value ?? '' } : r
      ),
      responseHeaders: p.responseHeaders.map((r) =>
        r.ephemeral ? { ...r, value: secrets[r.id] ?? r.value ?? '' } : r
      ),
      cookies: p.cookies.map((c) =>
        c.ephemeral ? { ...c, value: secrets[c.id] ?? c.value ?? '' } : c
      ),
      queryParams: p.queryParams.map((q) =>
        q.ephemeral ? { ...q, value: secrets[q.id] ?? q.value ?? '' } : q
      ),
    })),
  };
}

export async function loadEphemeralSecrets(): Promise<Record<string, string>> {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return {};
  const res = await chrome.storage.session.get(EPHEMERAL_SECRETS_SESSION_KEY);
  const raw = res[EPHEMERAL_SECRETS_SESSION_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') clean[k] = v;
  }
  return clean;
}

export async function saveEphemeralSecrets(secrets: Record<string, string>): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return;
  if (Object.keys(secrets).length === 0) {
    await chrome.storage.session.remove(EPHEMERAL_SECRETS_SESSION_KEY);
    return;
  }
  await chrome.storage.session.set({ [EPHEMERAL_SECRETS_SESSION_KEY]: secrets });
}

export async function clearEphemeralSecrets(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return;
  await chrome.storage.session.remove(EPHEMERAL_SECRETS_SESSION_KEY);
}
