import { appendAuditEvent, clearAuditLog } from '../shared/audit-log';
import {
  AUTO_PAUSE_ALARM_NAME,
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
import type { AuditEventType, ExtensionState } from '../shared/types';
import { updateBadge } from './badge-manager';
import { syncDnrRules } from './dnr-compiler';
import { clearDeadTabLocks, handleTabRemoved } from './tab-lock-manager';

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

/**
 * Computes remaining idle time from persisted `lastActivityAt` so SW wakes
 * do not reset the idle countdown (fixes P0-3).
 */
export async function reconcileAutoPauseAlarm(state: ExtensionState): Promise<ExtensionState> {
  if (!chrome.alarms) return state;
  await chrome.alarms.clear(AUTO_PAUSE_ALARM_NAME);

  const minutes = state.security?.autoPauseMinutes ?? 0;
  if (state.isPaused || minutes <= 0) {
    return state;
  }

  const thresholdMs = minutes * 60_000;
  const elapsed = Date.now() - (state.lastActivityAt || Date.now());
  const remaining = thresholdMs - elapsed;

  if (remaining <= 0) {
    const pausedState: ExtensionState = {
      ...state,
      isPaused: true,
      pausedReason: 'auto',
    };
    await persistFromSw(pausedState);
    await appendAuditEvent('AUTO_PAUSE', `Auto-paused after ${minutes}m idle`);
    return pausedState;
  }

  chrome.alarms.create(AUTO_PAUSE_ALARM_NAME, {
    when: Date.now() + remaining,
  });
  return state;
}

async function syncState(rawState: ExtensionState): Promise<void> {
  const policy = await loadManagedPolicy();
  const effectiveState = applyManagedPolicyToState(rawState, policy);
  const checkedState = await reconcileAutoPauseAlarm(effectiveState);

  const { health } = await syncDnrRules(checkedState);
  await updateBadge(checkedState, health);

  if (health.status === 'error') {
    await appendAuditEvent('SYNC_ERROR', health.errorMessage ?? 'DNR sync failed');
  } else if (health.status === 'degraded') {
    await appendAuditEvent('SYNC_DEGRADED', health.errorMessage ?? 'DNR quota degraded');
  }
}

async function syncAll(checkDeadTabs = false): Promise<void> {
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
  const cleanState = checkDeadTabs ? await clearDeadTabLocks(state) : state;
  await syncState(cleanState);
}

function scheduleSync(checkDeadTabs = false): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void enqueueWrite(() => syncAll(checkDeadTabs)).catch((err) => {
      console.error('[SafeHeader] Sync error:', err instanceof Error ? err.message : 'unknown');
    });
  }, 40);
}

async function wipeAllLocalData(): Promise<void> {
  if (chrome.alarms) {
    await chrome.alarms.clearAll();
  }
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
  await syncAll(false);
}

chrome.runtime.onInstalled.addListener(() => {
  void enqueueWrite(() => syncAll(true));
});

chrome.runtime.onStartup.addListener(() => {
  void enqueueWrite(() => syncAll(true));
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
    void enqueueWrite(() => syncAll(false));
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_PAUSE_ALARM_NAME) {
    void enqueueWrite(async () => {
      const { state } = await loadStateWithRecovery();
      if (!state.isPaused) {
        const next: ExtensionState = {
          ...state,
          isPaused: true,
          pausedReason: 'auto',
        };
        await persistFromSw(next);
        await appendAuditEvent(
          'AUTO_PAUSE',
          `Auto-paused after ${state.security.autoPauseMinutes}m idle`
        );
        await syncState(next);
      }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void enqueueWrite(() => handleTabRemoved(tabId));
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
        prev.security.presentationMode !== next.security.presentationMode ||
        prev.security.autoPauseMinutes !== next.security.autoPauseMinutes
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
    void enqueueWrite(() => syncAll(false))
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

scheduleSync(false);
