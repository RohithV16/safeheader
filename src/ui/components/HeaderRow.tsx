import { AlertTriangle, Eye, EyeOff, ShieldAlert, Zap } from 'lucide-react';
import type { HeaderRule } from '../../shared/types';
import { getHeaderRuleWarning, isSensitiveHeaderName } from '../../shared/validators';
import { useAutoHideReveal } from '../hooks/useAutoHideReveal';
import { RowActions } from './RowActions';

interface HeaderRowProps {
  readonly rule: HeaderRule;
  readonly target: 'request' | 'response';
  readonly hideComment: boolean;
  readonly maskSecrets: boolean;
  readonly presentationMode: boolean;
  readonly isScoped: boolean;
  readonly requireScopeForSensitive: boolean;
  readonly readOnly?: boolean;
  readonly datalistId: string;
  readonly onMoveUp?: () => void;
  readonly onMoveDown?: () => void;
  readonly canMoveUp?: boolean;
  readonly canMoveDown?: boolean;
  readonly onChange: (next: HeaderRule) => void;
  readonly onDelete: () => void;
}

export function HeaderRow({
  rule,
  target,
  hideComment,
  maskSecrets,
  presentationMode,
  isScoped,
  requireScopeForSensitive,
  readOnly = false,
  datalistId,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onChange,
  onDelete,
}: HeaderRowProps) {
  const [revealed, setRevealed] = useAutoHideReveal(presentationMode);

  const warning = getHeaderRuleWarning(rule, target);
  const sensitive = isSensitiveHeaderName(rule.name);
  const isSecret = (maskSecrets || presentationMode) && sensitive;
  const isBlockedByGuard =
    rule.enabled &&
    rule.name.trim().length > 0 &&
    rule.operation !== 'remove' &&
    sensitive &&
    requireScopeForSensitive &&
    !isScoped;

  return (
    <div className={`rule-row-wrap ${isBlockedByGuard ? 'row-blocked' : ''}`}>
      <div className={`rule-row ${!rule.enabled ? 'dimmed' : ''}`}>
        <input
          type="checkbox"
          className="rule-checkbox"
          checked={rule.enabled}
          disabled={readOnly}
          aria-label="Enable header rule"
          onChange={(e) => onChange({ ...rule, enabled: e.target.checked })}
        />

        <input
          type="text"
          className="field-input field-name"
          list={datalistId}
          placeholder="Name"
          disabled={readOnly}
          value={rule.name}
          onChange={(e) => onChange({ ...rule, name: e.target.value })}
        />

        <input
          type={isSecret && (!revealed || presentationMode) ? 'password' : 'text'}
          autoComplete="off"
          spellCheck={false}
          className="field-input field-value"
          placeholder={
            rule.ephemeral && !rule.value ? 'RAM session value (cleared)' : 'Value'
          }
          disabled={readOnly}
          value={rule.value}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
        />

        {isSecret && !presentationMode && (
          <button
            type="button"
            className="row-del-btn"
            title={revealed ? 'Hide value (auto-hides in 30s)' : 'Reveal value for 30s'}
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}

        {!readOnly && rule.operation !== 'remove' && (
          <button
            type="button"
            className={`row-del-btn ${rule.ephemeral ? 'ephemeral-active' : ''}`}
            title={
              rule.ephemeral
                ? 'RAM-only session secret (not written to disk). Click to save locally.'
                : 'Store value in RAM only (cleared when Chrome closes)'
            }
            onClick={() => onChange({ ...rule, ephemeral: !rule.ephemeral })}
          >
            <Zap size={13} />
          </button>
        )}

        {!hideComment && (
          <input
            type="text"
            className="field-input field-comment"
            placeholder="Comment"
            disabled={readOnly}
            value={rule.comment ?? ''}
            onChange={(e) => onChange({ ...rule, comment: e.target.value })}
          />
        )}

        {warning && (
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
            deleteTitle="Delete row"
            deleteAriaLabel="Delete header rule"
          />
        )}
      </div>

      {isBlockedByGuard && (
        <div className="remediation-strip">
          <span className="remediation-text">
            <ShieldAlert size={12} /> Blocked globally by Strict Scope Guard
          </span>
        </div>
      )}
    </div>
  );
}
