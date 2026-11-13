import { ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  importProfilesFromJson,
  inspectImportedProfiles,
} from '../../shared/modheader-compat';
import type { Profile } from '../../shared/types';

interface ImportModalProps {
  readonly existingCount: number;
  readonly onClose: () => void;
  readonly onImport: (imported: Profile[]) => void;
}

export function ImportModal({
  existingCount,
  onClose,
  onImport,
}: ImportModalProps) {
  const [text, setText] = useState('');
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const inspection = useMemo(() => {
    if (!text.trim()) {
      return { profiles: null as Profile[] | null, report: null, error: null as string | null };
    }
    try {
      const parsed = importProfilesFromJson(text, existingCount);
      const report = inspectImportedProfiles(parsed);
      return { profiles: parsed, report, error: null };
    } catch (err) {
      return {
        profiles: null,
        report: null,
        error: err instanceof Error ? err.message : 'Invalid JSON payload',
      };
    }
  }, [text, existingCount]);

  useEffect(() => {
    setAcknowledgedRisk(false);
  }, [text]);

  const needsAck = Boolean(inspection.report?.hasUnscopedSensitiveRules);

  const handleImport = () => {
    if (!inspection.profiles) return;
    if (needsAck && !acknowledgedRisk) return;

    if (chrome.runtime?.sendMessage) {
      void chrome.runtime.sendMessage({
        type: 'LOG_AUDIT',
        eventType: 'PROFILE_IMPORTED',
        detail: `Imported ${inspection.profiles.length} profile(s)${
          needsAck ? ' (with unscoped sensitive rules gated)' : ''
        }`,
      });
    }

    onImport(inspection.profiles);
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <dialog
        open
        className="modal-card"
        aria-labelledby="import-modal-title"
      >
        <div id="import-modal-title" style={{ fontWeight: 700, fontSize: 14 }}>
          Import Profiles (Local Security Gate)
        </div>

        <div className="cookie-jar-note">
          Profiles are parsed locally and saved only to <code>chrome.storage.local</code>.
          Export is disabled. Never paste untrusted JSON from external sites.
        </div>

        <textarea
          className="modal-textarea"
          placeholder="Paste ModHeader JSON export array or profile JSON here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {inspection.error && <div className="warning-banner">{inspection.error}</div>}

        {inspection.report?.hasUnscopedSensitiveRules && (
          <div className="warning-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <ShieldAlert size={14} /> Security Gate: Unscoped Sensitive Rules Detected
            </div>
            <div>
              Profiles ({inspection.report.riskyProfileTitles.join(', ')}) contain sensitive
              headers/cookies ({inspection.report.unscopedSensitiveRuleNames.join(', ')}) without a
              concrete domain filter. They will stay <strong>blocked</strong> by Strict Scope Guard
              until you add a domain filter.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                className="rule-checkbox"
                checked={acknowledgedRisk}
                onChange={(e) => setAcknowledgedRisk(e.target.checked)}
              />
              <span>I understand and want to import these profiles locally</span>
            </label>
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="icon-btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="icon-btn primary"
            disabled={!inspection.profiles || (needsAck && !acknowledgedRisk)}
            onClick={handleImport}
          >
            Import Profiles
          </button>
        </div>
      </dialog>
    </div>
  );
}
