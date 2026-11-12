import { EyeOff, History, Lock, RefreshCw, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadAuditLog } from '../../shared/audit-log';
import type { AuditEvent, ManagedPolicy, SecuritySettings, SyncHealth } from '../../shared/types';

interface SecurityModalProps {
  security: SecuritySettings;
  policy: ManagedPolicy;
  syncHealth: SyncHealth | null;
  ephemeralCount: number;
  onChange: (next: SecuritySettings) => void;
  onForceSync: () => Promise<void>;
  onWipeEphemeral: () => Promise<void>;
  onWipeAll: () => Promise<void>;
  onClose: () => void;
}

export function SecurityModal({
  security,
  policy,
  syncHealth,
  ephemeralCount,
  onChange,
  onForceSync,
  onWipeEphemeral,
  onWipeAll,
  onClose,
}: SecurityModalProps) {
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<'controls' | 'audit'>('controls');
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditFilter, setAuditFilter] = useState<string>('ALL');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (tab === 'audit') {
      void loadAuditLog().then(setAuditEvents);
    }
  }, [tab]);

  const handleWipe = async () => {
    setWiping(true);
    try {
      await onWipeAll();
      onClose();
    } finally {
      setWiping(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await onForceSync();
    } finally {
      setSyncing(false);
    }
  };

  const baseTimeouts =
    policy.maxAutoPauseMinutes !== null
      ? [5, 10, 15, 30, 60, 120, policy.maxAutoPauseMinutes, 0]
      : [15, 30, 60, 120, 0];
  const allowedTimeoutOptions = Array.from(new Set(baseTimeouts))
    .filter((min) => {
      if (policy.maxAutoPauseMinutes === null) return true;
      return min > 0 && min <= policy.maxAutoPauseMinutes;
    })
    .sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));

  const auditTypes = Array.from(new Set(auditEvents.map((e) => e.type)));
  const visibleAuditEvents =
    auditFilter === 'ALL' ? auditEvents : auditEvents.filter((e) => e.type === auditFilter);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
            <ShieldCheck size={16} color="#2e7d32" />
            Corporate Security Controls
          </div>
          <div className="tab-group">
            <button
              type="button"
              className={`tab-btn ${tab === 'controls' ? 'active' : ''}`}
              onClick={() => setTab('controls')}
            >
              Controls
            </button>
            <button
              type="button"
              className={`tab-btn ${tab === 'audit' ? 'active' : ''}`}
              onClick={() => setTab('audit')}
            >
              <History size={12} /> Audit Log
            </button>
          </div>
        </div>

        {tab === 'audit' ? (
          <div style={{ maxHeight: 290, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="audit-toolbar">
              <select
                className="field-select"
                aria-label="Filter audit events"
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
              >
                <option value="ALL">All events ({auditEvents.length})</option>
                {auditTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="icon-btn"
                title="Refresh audit log"
                onClick={() => void loadAuditLog().then(setAuditEvents)}
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
            <div className="info-banner-muted">
              Append-only local security event log (capped at 200 entries). Secret header, cookie,
              and query parameter values are never recorded.
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visibleAuditEvents.length === 0 ? (
                <div className="empty-hint">No matching audit events recorded yet.</div>
              ) : (
                visibleAuditEvents.map((ev) => (
                  <div key={ev.id} className="audit-row">
                    <span className="audit-type">{ev.type}</span>
                    <span className="audit-detail">{ev.detail}</span>
                    <span className="audit-time">
                      {new Date(ev.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="security-posture-grid">
              <span className="security-badge">Local Storage + .bak</span>
              <span className="security-badge">Export Disabled</span>
              <span className="security-badge">CSP connect-src: none</span>
              {policy.hasPolicy && (
                <span className="security-badge">Enterprise Policy Active</span>
              )}
            </div>

            <label className="security-option">
              <input
                type="checkbox"
                className="rule-checkbox"
                checked={security.requireScopeForSensitive}
                disabled={policy.enforceScopeForSensitive}
                onChange={(e) =>
                  onChange({ ...security, requireScopeForSensitive: e.target.checked })
                }
              />
              <div>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Strict Scope Guard (Anti-Leakage)
                  {policy.enforceScopeForSensitive && (
                    <span className="policy-tag">
                      <Lock size={10} /> Policy locked
                    </span>
                  )}
                </div>
                <div className="security-desc">
                  Hard-blocks sensitive headers (<code>Authorization</code>, <code>Cookie</code>,{' '}
                  <code>*token*</code>, <code>*key*</code>) and cookies unless pinned to a concrete
                  domain URL filter or Tab Lock.
                </div>
              </div>
            </label>

            <label className="security-option">
              <input
                type="checkbox"
                className="rule-checkbox"
                checked={security.maskSecrets}
                disabled={policy.enforceMaskSecrets}
                onChange={(e) =>
                  onChange({ ...security, maskSecrets: e.target.checked })
                }
              />
              <div>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Mask Secret Values (30s Auto-Hide)
                  {policy.enforceMaskSecrets && (
                    <span className="policy-tag">
                      <Lock size={10} /> Policy locked
                    </span>
                  )}
                </div>
                <div className="security-desc">
                  Masks sensitive headers and all cookies by default; temporary reveals auto-hide
                  after 30 seconds or window blur.
                </div>
              </div>
            </label>

            <label className="security-option">
              <input
                type="checkbox"
                className="rule-checkbox"
                checked={security.presentationMode}
                onChange={(e) =>
                  onChange({ ...security, presentationMode: e.target.checked })
                }
              />
              <div>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <EyeOff size={12} /> Presentation Mode (Screen-Share Safe)
                </div>
                <div className="security-desc">
                  Force-masks all secrets and disables reveal toggles during screen sharing.
                </div>
              </div>
            </label>

            <div className="security-option" style={{ justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Auto-Pause Idle Timeout
                  {policy.maxAutoPauseMinutes !== null && (
                    <span className="policy-tag">
                      <Lock size={10} /> Max {policy.maxAutoPauseMinutes}m
                    </span>
                  )}
                </div>
                <div className="security-desc">
                  Measures elapsed time since last edit/resume via <code>chrome.alarms</code>.
                </div>
              </div>
              <select
                className="field-select"
                value={security.autoPauseMinutes}
                onChange={(e) =>
                  onChange({ ...security, autoPauseMinutes: Number(e.target.value) })
                }
              >
                {allowedTimeoutOptions.map((min) => (
                  <option key={min} value={min}>
                    {min === 0 ? 'Off' : `${min} min`}
                  </option>
                ))}
              </select>
            </div>

            {syncHealth && (
              <div className="sync-health-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>
                    DNR Sync Telemetry ({syncHealth.status.toUpperCase()})
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={syncing}
                    onClick={() => void handleSyncNow()}
                  >
                    <RefreshCw size={11} /> {syncing ? 'Syncing...' : 'Force Sync'}
                  </button>
                </div>
                <div className="security-desc" style={{ marginTop: 4 }}>
                  Dynamic: <strong>{syncHealth.actualDynamicCount}</strong> /{' '}
                  {syncHealth.quotaAvailableDynamic ?? 5000} · Session:{' '}
                  <strong>{syncHealth.actualSessionCount}</strong> · Regex:{' '}
                  <strong>{syncHealth.regexRuleCount ?? 0}</strong> /{' '}
                  {syncHealth.quotaAvailableRegex ?? 1000}
                  {syncHealth.lastSyncedAt > 0 && (
                    <> · Synced {new Date(syncHealth.lastSyncedAt).toLocaleTimeString()}</>
                  )}
                </div>
              </div>
            )}

            <div className="dropdown-divider" />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {ephemeralCount > 0 && (
                  <button
                    type="button"
                    className="icon-btn"
                    title="Clear RAM-only ephemeral secret values while keeping rule rows"
                    onClick={() => void onWipeEphemeral()}
                  >
                    <Zap size={13} /> Clear RAM Secrets ({ephemeralCount})
                  </button>
                )}
                {!confirmWipe ? (
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => setConfirmWipe(true)}
                  >
                    <Trash2 size={13} /> Wipe All Local Data
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
                      Confirm wipe?
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={wiping}
                      style={{ background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' }}
                      onClick={() => void handleWipe()}
                    >
                      Yes, Wipe Everything
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setConfirmWipe(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <button type="button" className="icon-btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}

        {tab === 'audit' && (
          <div className="modal-footer">
            <button type="button" className="icon-btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
