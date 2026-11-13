import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import type { RedirectRule } from '../../shared/types';
import { getRedirectRuleWarning, isOverlyBroadUrlPattern } from '../../shared/validators';
import { RowActions } from './RowActions';

interface RedirectRowProps {
  readonly rule: RedirectRule;
  readonly hideComment: boolean;
  readonly requireScopeForSensitive: boolean;
  readonly readOnly?: boolean;
  readonly currentTabOriginPattern: string | null;
  readonly onMoveUp?: () => void;
  readonly onMoveDown?: () => void;
  readonly canMoveUp?: boolean;
  readonly canMoveDown?: boolean;
  readonly onChange: (next: RedirectRule) => void;
  readonly onDelete: () => void;
}

export function RedirectRow({
  rule,
  hideComment,
  requireScopeForSensitive,
  readOnly = false,
  currentTabOriginPattern,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onChange,
  onDelete,
}: RedirectRowProps) {
  const normalizedRule: RedirectRule = {
    ...rule,
    mode: 'url',
    matchType: 'wildcard',
  };
  const enforceScope = requireScopeForSensitive;
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
          <RowActions
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onDelete={onDelete}
            deleteTitle="Delete redirect rule"
            deleteAriaLabel="Delete redirect rule"
          />
        )}
      </div>

      {isBroadBlocked && (
        <div className="remediation-strip">
          <span className="remediation-text">
            <ShieldAlert size={12} /> From URL needs a concrete domain filter
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
            </span>
          )}
        </div>
      )}
    </div>
  );
}
