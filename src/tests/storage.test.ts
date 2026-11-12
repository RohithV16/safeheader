import { describe, expect, it } from 'vitest';
import {
  EPHEMERAL_SECRETS_SESSION_KEY,
  STORAGE_BACKUP_KEY,
  STORAGE_KEY,
  STORAGE_QUARANTINE_KEY,
} from '../shared/constants';
import {
  extractEphemeralSecretsMap,
  saveEphemeralSecrets,
} from '../shared/ephemeral';
import {
  createDefaultState,
  loadStateWithRecovery,
  normalizeState,
  saveState,
} from '../shared/storage';

function installMemoryChromeStorage(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  const sessionStore: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        async get(keys?: string | string[]) {
          if (!keys) return { ...store };
          const list = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of list) {
            if (k in store) out[k] = store[k];
          }
          return out;
        },
        async set(items: Record<string, unknown>) {
          Object.assign(store, items);
        },
        async remove(keys: string | string[]) {
          for (const k of Array.isArray(keys) ? keys : [keys]) {
            delete store[k];
          }
        },
        async clear() {
          for (const k of Object.keys(store)) delete store[k];
        },
      },
      session: {
        async get(keys?: string | string[]) {
          if (!keys) return { ...sessionStore };
          const list = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of list) {
            if (k in sessionStore) out[k] = sessionStore[k];
          }
          return out;
        },
        async set(items: Record<string, unknown>) {
          Object.assign(sessionStore, items);
        },
        async remove(keys: string | string[]) {
          for (const k of Array.isArray(keys) ? keys : [keys]) {
            delete sessionStore[k];
          }
        },
      },
    },
  };
  return { store, sessionStore };
}

describe('storage normalization, backup ring & recovery', () => {
  it('filters invalid resourceTypes and requestMethods at sanitize boundary (M-2)', () => {
    const normalized = normalizeState({
      schemaVersion: 1,
      profiles: [
        {
          id: 'p1',
          title: 'Test',
          resourceTypes: ['main_frame', 'bogus_type', 123],
          requestMethods: ['GET', 'INVALID_METHOD'],
          tabLockId: -5,
        },
      ],
    });

    expect(normalized.profiles[0].resourceTypes).toEqual(['main_frame']);
    expect(normalized.profiles[0].requestMethods).toEqual(['get']);
    expect(normalized.profiles[0].tabLockId).toBeNull();
  });

  it('migrates legacy v0 state cleanly', () => {
    const normalized = normalizeState({
      isPaused: true,
      profiles: [{ id: 'p1', title: 'Legacy' }],
    });
    expect(normalized.schemaVersion).toBe(1);
    expect(normalized.pausedReason).toBe('manual');
    expect(normalized.profiles[0].title).toBe('Legacy');
  });

  it('maintains .bak backup ring and recovers corrupt main state into quarantine', async () => {
    const healthy = createDefaultState();
    healthy.profiles[0].title = 'Corporate Dev';
    const { store } = installMemoryChromeStorage({ [STORAGE_KEY]: healthy });

    const next = { ...healthy, isPaused: true, pausedReason: 'manual' as const };
    await saveState(next);
    expect((store[STORAGE_BACKUP_KEY] as { isPaused: boolean }).isPaused).toBe(false);

    // Corrupt main key
    store[STORAGE_KEY] = 'CORRUPT_BLOB';
    const recovered = await loadStateWithRecovery();

    expect(recovered.recoveredFromBackup).toBe(true);
    expect(recovered.state.profiles[0].title).toBe('Corporate Dev');
    expect(store[STORAGE_QUARANTINE_KEY]).toBe('CORRUPT_BLOB');
  });

  it('strips ephemeral rule values from disk storage and hydrates them only from session RAM', async () => {
    const { store, sessionStore } = installMemoryChromeStorage();
    const state = createDefaultState();
    state.profiles[0].requestHeaders = [
      {
        id: 'hdr-ram',
        enabled: true,
        name: 'Authorization',
        value: 'Bearer super-secret-ram-token',
        operation: 'set',
        ephemeral: true,
      },
    ];
    state.profiles[0].cookies = [
      {
        id: 'ck-disk',
        enabled: true,
        name: 'env',
        value: 'staging',
        mode: 'append',
      },
    ];

    await saveEphemeralSecrets(extractEphemeralSecretsMap(state));
    await saveState(state);

    // Local disk JSON must never contain the ephemeral token value
    const diskState = store[STORAGE_KEY] as {
      profiles: Array<{ requestHeaders: Array<{ value: string }>; cookies: Array<{ value: string }> }>;
    };
    expect(diskState.profiles[0].requestHeaders[0].value).toBe('');
    expect(diskState.profiles[0].cookies[0].value).toBe('staging');
    expect(JSON.stringify(store)).not.toContain('super-secret-ram-token');

    // Hydrated state recovers RAM secret when session exists
    const loadedWithRam = await loadStateWithRecovery();
    expect(loadedWithRam.state.profiles[0].requestHeaders[0].value).toBe(
      'Bearer super-secret-ram-token'
    );

    // Simulating browser restart (session cleared): value comes back empty
    delete sessionStore[EPHEMERAL_SECRETS_SESSION_KEY];
    const afterRestart = await loadStateWithRecovery();
    expect(afterRestart.state.profiles[0].requestHeaders[0].value).toBe('');
  });
});
