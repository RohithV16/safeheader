import { appendAuditEvent, clearAuditLog } from '../shared/audit-log';
import {
  RECOVERY_NOTICE_SESSION_KEY,
  STORAGE_KEY,
} from '../shared/constants';
import {
  clearEphemeralSecrets,
  extractEphemeralSecretsMap,
  hydrateEphemeralSecrets,
  loadEphemeralSecrets,
  saveEphemeralSecrets,
  stripEphemeralValues,
} from '../shared/ephemeral';
import { applyManagedPolicyToState, loadManagedPolicy } from '../shared/policy';
import {
  createDefaultState,
  loadStateWithRecovery,
  normalizeState,
  saveState,
} from '../shared/storage';
import type { AuditEventType, ExtensionState, SyncHealth } from '../shared/types';
import { updateBadge } from './badge-manager';
import { syncDnrRules } from './dnr-compiler';

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();
let lastSwPersistedSignature = '';

const ALLOWED_AUDIT_EVENT_TYPES = new Set<AuditEventType>([
  'SYNC_OK',
  'SYNC_DEGRADED',
  'SYNC_ERROR',
  'MANUAL_PAUSE',
  'AUTO_PAUSE',
  'RESUMED',
  'PROFILE_IMPORTED',
  'BACKUP_RESTORED',
  'WIPED_ALL_DATA',
  'EPHEMERAL_WIPED',
  'SECURITY_CHANGED',
]);

function computeLocalSignature(state: ExtensionState): string {
  try {
    return JSON.stringify(
      stripEphemeralValues({
        ...state,
        profiles: state.profiles.filter((p) => !p.isManaged),
      })
    );
  } catch {
    return '';
  }
}

async function persistFromSw(state: ExtensionState): Promise<void> {
  lastSwPersistedSignature = computeLocalSignature(state);
  await saveState(state);
}

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const task = writeQueue.then(fn, fn);
  writeQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

function computeDnrSignature(state: ExtensionState): string {
  if (state.isPaused) {
    return 'paused';
  }
  const activeProfiles = state.multiProfileMode
    ? state.profiles.filter((p) => p.enabled).sort((a, b) => a.order - b.order)
    : state.profiles.filter((p) => p.id === state.activeProfileId && p.enabled);

  const parts: string[] = [
    String(state.isPaused),
    String(state.multiProfileMode),
    String(state.security?.requireScopeForSensitive),
  ];

  for (const p of activeProfiles) {
    parts.push(`p:${p.id}:${p.order}:${p.enabled}`);
    parts.push(`types:${p.resourceTypes.join(',')}`);
    parts.push(`methods:${p.requestMethods.join(',')}`);
    for (const f of p.urlFilters) {
      if (f.enabled) parts.push(`f:${f.pattern}:${f.matchType}:${f.exclude}`);
    }
    for (const h of p.requestHeaders) {
      if (h.enabled) parts.push(`req:${h.name}:${h.operation}:${h.value}`);
    }
    for (const h of p.responseHeaders) {
      if (h.enabled) parts.push(`resp:${h.name}:${h.operation}:${h.value}`);
    }
    for (const c of p.cookies) {
      if (c.enabled) parts.push(`c:${c.name}:${c.mode}:${c.value}`);
    }
    for (const q of p.queryParams ?? []) {
      if (q.enabled) parts.push(`q:${q.name}:${q.operation}:${q.value}:${q.replaceOnly}`);
    }
    for (const r of p.redirects ?? []) {
      if (r.enabled) parts.push(`r:${r.fromPattern}:${r.toUrl}:${r.mode}:${r.matchType}`);
    }
  }

  return parts.join('|');
}

let lastDnrSignature = '';
let lastSyncHealth: SyncHealth | undefined;

async function syncState(rawState: ExtensionState, forceDnr = false): Promise<void> {
  const policy = await loadManagedPolicy();
  const effectiveState = applyManagedPolicyToState(rawState, policy);

  const currentSignature = computeDnrSignature(effectiveState);
  if (!forceDnr && currentSignature === lastDnrSignature && lastSyncHealth) {
    await updateBadge(effectiveState, lastSyncHealth);
    return;
  }

  const { health } = await syncDnrRules(effectiveState);
  lastDnrSignature = currentSignature;
  lastSyncHealth = health;
  await updateBadge(effectiveState, health);

  if (health.status === 'error') {
    await appendAuditEvent('SYNC_ERROR', health.errorMessage ?? 'DNR sync failed');
  } else if (health.status === 'degraded') {
    await appendAuditEvent('SYNC_DEGRADED', health.errorMessage ?? 'DNR quota degraded');
  }
}

async function syncAll(forceDnr = false): Promise<void> {
  const { state, recoveredFromBackup } = await loadStateWithRecovery();
  if (recoveredFromBackup) {
    await appendAuditEvent('BACKUP_RESTORED', 'Recovered corrupt state from local .bak');
    if (chrome.storage?.session) {
      await chrome.storage.session.set({
        [RECOVERY_NOTICE_SESSION_KEY]:
          'Corrupted local storage was quarantined and restored from your local .bak backup.',
      });
    }
  }
  await syncState(state, forceDnr);
}

function scheduleSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void enqueueWrite(() => syncAll()).catch((err) => {
      console.error('[SafeHeader] Sync error:', err instanceof Error ? err.message : 'unknown');
    });
  }, 40);
}

async function wipeAllLocalData(): Promise<void> {
  await chrome.storage.local.clear();
  await clearAuditLog();
  if (chrome.storage?.session) {
    await chrome.storage.session.clear();
  }
  const freshState = createDefaultState();
  await persistFromSw(freshState);
  await appendAuditEvent('WIPED_ALL_DATA', 'User wiped all local profiles and rules');
  await syncState(freshState);
}

async function wipeEphemeralSecrets(): Promise<void> {
  await clearEphemeralSecrets();
  await appendAuditEvent('EPHEMERAL_WIPED', 'Cleared RAM-only ephemeral secret values');
  await syncAll();
}

chrome.runtime.onInstalled.addListener(() => {
  void enqueueWrite(() => syncAll());
});

chrome.runtime.onStartup.addListener(() => {
  void enqueueWrite(() => syncAll());
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[STORAGE_KEY]) {
    const rawNew = changes[STORAGE_KEY].newValue;
    const normalized = normalizeState(rawNew);
    if (lastSwPersistedSignature && computeLocalSignature(normalized) === lastSwPersistedSignature) {
      lastSwPersistedSignature = '';
      return;
    }
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      void enqueueWrite(async () => {
        const secrets = await loadEphemeralSecrets();
        await syncState(hydrateEphemeralSecrets(normalized, secrets));
      }).catch((err) => {
        console.error('[SafeHeader] Sync error:', err instanceof Error ? err.message : 'unknown');
      });
    }, 40);
  }
  if (areaName === 'managed') {
    void enqueueWrite(() => syncAll());
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Security L-1: strictly reject messages from external senders/content scripts
  if (sender.id && sender.id !== chrome.runtime.id) {
    return false;
  }
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'SET_STATE' && message.state) {
    void enqueueWrite(async () => {
      const prev = (await loadStateWithRecovery()).state;
      const next = normalizeState(message.state);
      next.lastActivityAt = Date.now();
      await saveEphemeralSecrets(extractEphemeralSecretsMap(next));
      await persistFromSw(next);

      if (!prev.isPaused && next.isPaused) {
        await appendAuditEvent('MANUAL_PAUSE', 'User paused rule modifications');
      } else if (prev.isPaused && !next.isPaused) {
        await appendAuditEvent('RESUMED', 'User resumed rule modifications');
      }
      if (
        prev.security.requireScopeForSensitive !== next.security.requireScopeForSensitive ||
        prev.security.maskSecrets !== next.security.maskSecrets ||
        prev.security.presentationMode !== next.security.presentationMode
      ) {
        await appendAuditEvent('SECURITY_CHANGED', 'Updated local security controls');
      }

      await syncState(next);
    })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (
    message.type === 'LOG_AUDIT' &&
    typeof message.eventType === 'string' &&
    ALLOWED_AUDIT_EVENT_TYPES.has(message.eventType as AuditEventType)
  ) {
    void enqueueWrite(() =>
      appendAuditEvent(
        message.eventType as AuditEventType,
        String(message.detail ?? '')
      )
    )
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'FORCE_SYNC') {
    void enqueueWrite(() => syncAll(true))
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'WIPE_EPHEMERAL_SECRETS') {
    void enqueueWrite(() => wipeEphemeralSecrets())
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'WIPE_ALL_DATA') {
    void enqueueWrite(() => wipeAllLocalData())
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'CHECK_REGEX' && typeof message.regex === 'string') {
    void chrome.declarativeNetRequest
      .isRegexSupported({ regex: message.regex, isCaseSensitive: false })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ isSupported: false, reason: String(err) }));
    return true;
  }

  return false;
});

scheduleSync();
