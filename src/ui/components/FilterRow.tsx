import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UrlFilterRule, UrlMatchType } from '../../shared/types';
import { extractDomainFromPattern } from '../../shared/validators';

interface FilterRowProps {
  rule: UrlFilterRule;
  hideComment: boolean;
  readOnly?: boolean;
  onChange: (next: UrlFilterRule) => void;
  onDelete: () => void;
}

export function FilterRow({
  rule,
  hideComment,
  readOnly = false,
  onChange,
  onDelete,
}: FilterRowProps) {
  const [regexError, setRegexError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!rule.enabled || rule.matchType !== 'regex' || !rule.pattern.trim() || rule.exclude) {
      setRegexError(null);
      return;
    }

    if (chrome.declarativeNetRequest?.isRegexSupported) {
      void chrome.declarativeNetRequest
        .isRegexSupported({ regex: rule.pattern.trim(), isCaseSensitive: false })
        .then((res) => {
          if (active) {
            setRegexError(
              res.isSupported ? null : `Unsupported RE2 regex (${res.reason ?? 'invalid'})`
            );
          }
        })
        .catch(() => {
          if (active) setRegexError(null);
        });
    }

    return () => {
      active = false;
    };
  }, [rule.enabled, rule.matchType, rule.pattern, rule.exclude]);

  const excludeWarning =
    rule.enabled &&
    rule.exclude &&
    rule.pattern.trim() &&
    !extractDomainFromPattern(rule.pattern)
      ? 'Exclude filters map to DNR excludedRequestDomains and need a domain (e.g. *://example.com/*).'
      : null;

  const warning = regexError ?? excludeWarning;

  return (
    <div className={`rule-row ${!rule.enabled ? 'dimmed' : ''}`}>
      <input
        type="checkbox"
        className="rule-checkbox"
        checked={rule.enabled}
        disabled={readOnly}
        aria-label="Enable URL filter"
        onChange={(e) => onChange({ ...rule, enabled: e.target.checked })}
      />

      <select
        className="field-select field-op"
        value={rule.matchType}
        disabled={readOnly}
        aria-label="Filter match type"
        onChange={(e) =>
          onChange({ ...rule, matchType: e.target.value as UrlMatchType })
        }
      >
        <option value="wildcard">Wildcard</option>
        <option value="regex">Regex</option>
      </select>

      <input
        type="text"
        className="field-input field-value"
        disabled={readOnly}
        placeholder={
          rule.matchType === 'regex'
            ? '^https://api\\.example\\.com/.*'
            : '*://*.example.com/*'
        }
        value={rule.pattern}
        onChange={(e) => onChange({ ...rule, pattern: e.target.value })}
      />

      <select
        className="field-select"
        style={{ width: 84 }}
        value={rule.exclude ? 'exclude' : 'include'}
        disabled={readOnly}
        aria-label="Include or exclude"
        onChange={(e) =>
          onChange({ ...rule, exclude: e.target.value === 'exclude' })
        }
      >
        <option value="include">Include</option>
        <option value="exclude">Exclude</option>
      </select>

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
        <button
          type="button"
          className="row-del-btn"
          title="Delete filter"
          onClick={onDelete}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
