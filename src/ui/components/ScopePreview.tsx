import { CheckCircle2, Globe, Plus, Search, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { simulateProfileForUrl } from '../../background/dnr-compiler';
import type { Profile } from '../../shared/types';
import { extractRegistrableDomain } from '../../shared/validators';

interface ScopePreviewProps {
  profile: Profile;
  isPaused: boolean;
  requireScope: boolean;
  currentTabUrl: string;
  readOnly?: boolean;
  onScopeCurrentSite: () => void;
}

export function ScopePreview({
  profile,
  isPaused,
  requireScope,
  currentTabUrl,
  readOnly = false,
  onScopeCurrentSite,
}: ScopePreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [testUrl, setTestUrl] = useState(currentTabUrl || 'https://api.example.com/');
  const [simResult, setSimResult] = useState<Awaited<
    ReturnType<typeof simulateProfileForUrl>
  > | null>(null);

  useEffect(() => {
    if (currentTabUrl && currentTabUrl.startsWith('http')) {
      setTestUrl(currentTabUrl);
    }
  }, [currentTabUrl]);

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    void simulateProfileForUrl(profile, testUrl, requireScope).then((res) => {
      if (active) setSimResult(res);
    });
    return () => {
      active = false;
    };
  }, [expanded, profile, testUrl, requireScope]);

  const activeFilters = profile.urlFilters.filter((f) => f.enabled && !f.exclude && f.pattern.trim());
  const concreteDomains = activeFilters
    .map((f) => extractRegistrableDomain(f.pattern, f.matchType))
    .filter((d): d is string => Boolean(d));

  let currentHost = '';
  try {
    if (currentTabUrl.startsWith('http')) {
      currentHost = new URL(currentTabUrl).hostname.toLowerCase();
    }
  } catch {
    currentHost = '';
  }
  const alreadyScopedToCurrent =
    Boolean(currentHost) && concreteDomains.some((d) => d.toLowerCase() === currentHost);

  const scopeSummary =
    profile.tabLockId !== null && concreteDomains.length > 0
      ? `Tab #${profile.tabLockId} ∩ ${concreteDomains.join(', ')}`
      : profile.tabLockId !== null
        ? `Tab #${profile.tabLockId} only`
        : concreteDomains.length > 0
          ? concreteDomains.join(', ')
          : activeFilters.length > 0
            ? activeFilters.map((f) => f.pattern).join(', ')
            : 'All sites (*)';

  return (
    <div className="scope-preview-bar">
      <div className="scope-preview-top">
        <span className="scope-summary">
          <Globe size={12} />
          <span>
            Scope: <strong>{scopeSummary}</strong>
          </span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {!readOnly && currentHost && !alreadyScopedToCurrent && (
            <button
              type="button"
              className="section-add-btn"
              title={`Add URL filter for ${currentHost}`}
              onClick={onScopeCurrentSite}
            >
              <Plus size={11} /> Scope this site
            </button>
          )}
          <button
            type="button"
            className="section-add-btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <Search size={12} /> {expanded ? 'Hide Test URL' : 'Test URL'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="scope-test-panel">
          <input
            type="text"
            className="field-input"
            style={{ width: '100%' }}
            placeholder="https://api.corp.internal/v1/profile"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
          />
          {isPaused ? (
            <div className="scope-verdict muted">Extension is paused — 0 rules apply.</div>
          ) : simResult && !simResult.validUrl ? (
            <div className="scope-verdict muted">Enter a valid http:// or https:// URL to test.</div>
          ) : simResult && simResult.matches ? (
            <div className="scope-verdict ok">
              <CheckCircle2 size={13} />
              <span>
                Matches:{' '}
                {[
                  simResult.requestHeaderNames.length > 0
                    ? `${simResult.requestHeaderNames.length} req (${simResult.requestHeaderNames.join(', ')})`
                    : '',
                  simResult.responseHeaderNames.length > 0
                    ? `${simResult.responseHeaderNames.length} resp (${simResult.responseHeaderNames.join(', ')})`
                    : '',
                  simResult.hasCookies ? 'Cookie header' : '',
                  simResult.queryParamNames.length > 0
                    ? `${simResult.queryParamNames.length} param (${simResult.queryParamNames.join(', ')})`
                    : '',
                  simResult.redirectSummary ?? '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          ) : (
            <div className="scope-verdict none">
              <XCircle size={13} />
              <span>No rules will apply to this URL (blocked by filter or Scope Guard).</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
