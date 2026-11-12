import { AlertTriangle, ArrowRight, Lock, ShieldAlert, X } from 'lucide-react';
import type { RedirectRule } from '../../shared/types';
import { getRedirectRuleWarning, isOverlyBroadUrlPattern } from '../../shared/validators';

interface RedirectRowProps {
  rule: RedirectRule;
  hideComment: boolean;
  tabLocked: boolean;
  requireScopeForSensitive: boolean;
  readOnly?: boolean;
  currentTabOriginPattern: string | null;
  onChange: (next: RedirectRule) => void;
  onDelete: () => void;
  onLockTab: () => void;
}

export function RedirectRow({
  rule,
  hideComment,
  tabLocked,
  requireScopeForSensitive,
  readOnly = false,
  currentTabOriginPattern,
  onChange,
  onDelete,
  onLockTab,
}: RedirectRowProps) {
  const normalizedRule: RedirectRule = {
    ...rule,
    mode: 'url',
    matchType: 'wildcard',
  };
  const enforceScope = requireScopeForSensitive && !tabLocked;
  const warning = getRedirectRuleWarning(normalizedRule, enforceScope);

  const isBroadBlocked =
    normalizedRule.enabled &&
    normalizedRule.fromPattern.trim().length > 0 &&
    enforceScope &&
    isOverlyBroadUrlPattern(normalizedRule.fromPattern, 'wildcard');

  return (
    <div className={`rule-row-wrap ${isBroadBlocked ? 'row-blocked' : ''}`}>
      <div className={`rule-row ${!normalizedRule.enabled ? 'dimmed' : ''}`}>
        <input
          type="checkbox"
          className="rule-checkbox"
          checked={normalizedRule.enabled}
          disabled={readOnly}
          aria-label="Enable redirect rule"
          onChange={(e) => onChange({ ...normalizedRule, enabled: e.target.checked })}
        />

        <input
          type="text"
          className="field-input field-name"
          placeholder="From URL (e.g. https://example.com/*)"
          disabled={readOnly}
          value={normalizedRule.fromPattern}
          onChange={(e) => onChange({ ...normalizedRule, fromPattern: e.target.value })}
        />

        <ArrowRight size={13} style={{ flexShrink: 0, opacity: 0.6 }} aria-hidden="true" />

        <input
          type="text"
          className="field-input field-value"
          placeholder="To URL (e.g. https://www.google.com)"
          disabled={readOnly}
          value={normalizedRule.toUrl}
          onChange={(e) => onChange({ ...normalizedRule, toUrl: e.target.value })}
        />

        {!hideComment && (
          <input
            type="text"
            className="field-input field-comment"
            placeholder="Comment"
            disabled={readOnly}
            value={normalizedRule.comment ?? ''}
            onChange={(e) => onChange({ ...normalizedRule, comment: e.target.value })}
          />
        )}

        {warning && !isBroadBlocked && (
          <span className="row-warn-icon" title={warning}>
            <AlertTriangle size={14} />
          </span>
        )}

        {!readOnly && (
          <button
            type="button"
            className="row-del-btn"
            title="Delete redirect rule"
            onClick={onDelete}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isBroadBlocked && (
        <div className="remediation-strip">
          <span className="remediation-text">
            <ShieldAlert size={12} /> From URL needs a concrete domain or Tab Lock
          </span>
          {!readOnly && (
            <span className="remediation-actions">
              {currentTabOriginPattern && (
                <button
                  type="button"
                  className="remediation-btn"
                  onClick={() =>
                    onChange({
                      ...normalizedRule,
                      fromPattern: currentTabOriginPattern,
                    })
                  }
                >
                  Use current site
                </button>
              )}
              <button type="button" className="remediation-btn" onClick={onLockTab}>
                <Lock size={10} /> Lock to tab
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
