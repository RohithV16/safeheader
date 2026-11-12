import { AUDIT_LOG_KEY, MAX_AUDIT_ENTRIES } from './constants';
import { generateId } from './storage';
import type { AuditEvent, AuditEventType } from './types';

export async function loadAuditLog(): Promise<AuditEvent[]> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return [];
  const res = await chrome.storage.local.get(AUDIT_LOG_KEY);
  const raw = res[AUDIT_LOG_KEY];
  return Array.isArray(raw) ? (raw as AuditEvent[]) : [];
}

/**
 * Append a security-relevant metadata event (never log header/cookie values).
 */
export async function appendAuditEvent(
  type: AuditEventType,
  detail: string
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const existing = await loadAuditLog();
  const next: AuditEvent[] = [
    {
      id: generateId(),
      timestamp: Date.now(),
      type,
      detail: detail.slice(0, 240),
    },
    ...existing,
  ].slice(0, MAX_AUDIT_ENTRIES);

  await chrome.storage.local.set({ [AUDIT_LOG_KEY]: next });
}

export async function clearAuditLog(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.remove(AUDIT_LOG_KEY);
}
