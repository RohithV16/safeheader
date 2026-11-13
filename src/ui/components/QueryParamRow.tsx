import { AlertTriangle, Eye, EyeOff, ShieldAlert, Zap } from 'lucide-react';
import type { QueryParamRule } from '../../shared/types';
import { getQueryParamWarning, isSensitiveHeaderName } from '../../shared/validators';
import { useAutoHideReveal } from '../hooks/useAutoHideReveal';
import { RowActions } from './RowActions';

interface QueryParamRowProps {
  readonly rule: QueryParamRule;
  readonly hideComment: boolean;
  readonly maskSecrets: boolean;
  readonly presentationMode: boolean;
  readonly isScoped: boolean;
  readonly requireScopeForSensitive: boolean;
  readonly readOnly?: boolean;
  readonly onMoveUp?: () => void;
  readonly onMoveDown?: () => void;
  readonly canMoveUp?: boolean;
  readonly canMoveDown?: boolean;
  readonly onChange: (next: QueryParamRule) => void;
  readonly onDelete: () => void;
}

function resolveValuePlaceholder(
  isRemove: boolean,
  ephemeral?: boolean,
  value?: string
): string {
  if (isRemove) return '(removed)';
  if (ephemeral && !value) return 'RAM session value (cleared)';
  return 'Value';
}

function checkBlockedByGuard(
  rule: QueryParamRule,
  sensitive: boolean,
  requireScopeForSensitive: boolean,
  isScoped: boolean
): boolean {
  return (
    rule.enabled &&
    rule.name.trim().length > 0 &&
    rule.operation !== 'remove' &&
    sensitive &&
    requireScopeForSensitive &&
    !isScoped
  );
}

export function QueryParamRow({
  rule,
  hideComment,
  maskSecrets,
  presentationMode,
  isScoped,
  requireScopeForSensitive,
  readOnly = false,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onChange,
  onDelete,
}: QueryParamRowProps) {
  const [revealed, setRevealed] = useAutoHideReveal(presentationMode);

  const warning = getQueryParamWarning(rule);
  const sensitive = isSensitiveHeaderName(rule.name);
  const isSecret = (maskSecrets || presentationMode) && sensitive && rule.operation !== 'remove';
  const isBlockedByGuard = checkBlockedByGuard(
    rule,
    sensitive,
    requireScopeForSensitive,
    isScoped
  );

  const isRemove = rule.operation === 'remove';
  const placeholder = resolveValuePlaceholder(isRemove, rule.ephemeral, rule.value);

  return (
    <div className={`rule-row-wrap ${isBlockedByGuard ? 'row-blocked' : ''}`}>
      <div className={`rule-row ${!rule.enabled ? 'dimmed' : ''}`}>
        <input
          type="checkbox"
          className="rule-checkbox"
          checked={rule.enabled}
          disabled={readOnly}
          aria-label="Enable query parameter rule"
          onChange={(e) => onChange({ ...rule, enabled: e.target.checked })}
        />

        <button
          type="button"
          disabled={readOnly}
          className={`op-pill ${isRemove ? 'op-remove' : ''}`}
          title="Click to toggle Set / Remove query parameter"
          onClick={() =>
            onChange({ ...rule, operation: isRemove ? 'set' : 'remove' })
          }
        >
          {isRemove ? 'DEL' : 'SET'}
        </button>

        <input
          type="text"
          className="field-input field-name"
          placeholder="Param key"
          disabled={readOnly}
          value={rule.name}
          onChange={(e) => onChange({ ...rule, name: e.target.value })}
        />

        <input
          type={isSecret && (!revealed || presentationMode) ? 'password' : 'text'}
          autoComplete="off"
          spellCheck={false}
          className="field-input field-value"
          placeholder={placeholder}
          disabled={readOnly || isRemove}
          value={isRemove ? '' : rule.value}
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

        {!readOnly && !isRemove && (
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
            deleteTitle="Delete query parameter rule"
            deleteAriaLabel="Delete query parameter rule"
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
