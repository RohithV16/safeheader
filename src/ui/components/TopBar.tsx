import {
  Copy,
  Lock,
  MessageSquare,
  MoreVertical,
  PanelRight,
  Pause,
  Play,
  Plus,
  Settings,
  ShieldCheck,
  SunMoon,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PROFILE_COLORS } from '../../shared/constants';
import type { Profile, ThemeMode } from '../../shared/types';

interface TopBarProps {
  profile: Profile;
  isPaused: boolean;
  multiProfileMode: boolean;
  theme: ThemeMode;
  surface: 'popup' | 'sidepanel' | 'options';
  onUpdateProfile: (updater: (p: Profile) => Profile) => void;
  onTogglePause: () => void;
  onToggleTabLock: () => void;
  onAddRule: (
    kind: 'requestHeader' | 'responseHeader' | 'cookie' | 'queryParam' | 'redirect'
  ) => void;
  onCloneProfile: () => void;
  onDeleteProfile: () => void;
  onOpenImport: () => void;
  onOpenSecurity: () => void;
  compactDensity: boolean;
  onToggleCompactDensity: () => void;
  onToggleMultiProfile: () => void;
  onCycleTheme: () => void;
  onOpenSidePanel: () => void;
  onOpenOptions: () => void;
}

export function TopBar({
  profile,
  isPaused,
  multiProfileMode,
  theme,
  surface,
  onUpdateProfile,
  onTogglePause,
  onToggleTabLock,
  onAddRule,
  onCloneProfile,
  onDeleteProfile,
  onOpenImport,
  onOpenSecurity,
  compactDensity,
  onToggleCompactDensity,
  onToggleMultiProfile,
  onCycleTheme,
  onOpenSidePanel,
  onOpenOptions,
}: TopBarProps) {
  const [showBadgeEdit, setShowBadgeEdit] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowBadgeEdit(false);
        setShowAddMenu(false);
        setShowMoreMenu(false);
        setConfirmDelete(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowBadgeEdit(false);
        setShowAddMenu(false);
        setShowMoreMenu(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const appBarColor = isPaused ? '#546e7a' : profile.color || '#2e7d32';
  const readOnly = Boolean(profile.isManaged);

  return (
    <header className="top-bar" ref={containerRef} style={{ backgroundColor: appBarColor }}>
      <div className="top-bar-left">
        <button
          type="button"
          className="badge-chip-btn"
          disabled={readOnly}
          title={readOnly ? 'Managed policy profile' : 'Edit profile badge & color'}
          onClick={() => {
            setShowBadgeEdit((v) => !v);
            setShowAddMenu(false);
            setShowMoreMenu(false);
          }}
        >
          {profile.shortTitle || '1'}
        </button>

        <input
          type="text"
          className="profile-title-input"
          value={profile.title}
          disabled={readOnly}
          aria-label="Profile name"
          onChange={(e) =>
            onUpdateProfile((p) => ({ ...p, title: e.target.value }))
          }
        />

        {readOnly && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.22)',
              color: '#fff',
            }}
          >
            POLICY
          </span>
        )}

        {multiProfileMode && !readOnly && (
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: '#fff',
              cursor: 'pointer',
            }}
            title="Enable this profile in Multi-Profile mode"
          >
            <input
              type="checkbox"
              className="rule-checkbox"
              checked={profile.enabled}
              onChange={(e) =>
                onUpdateProfile((p) => ({ ...p, enabled: e.target.checked }))
              }
            />
            Enabled
          </label>
        )}
      </div>

      {showBadgeEdit && !readOnly && (
        <div className="badge-popover">
          <label style={{ fontSize: 11, fontWeight: 600 }}>
            Badge Text (1–3 chars)
            <input
              type="text"
              className="field-input"
              style={{ width: '100%', marginTop: 4 }}
              maxLength={3}
              value={profile.shortTitle}
              onChange={(e) =>
                onUpdateProfile((p) => ({
                  ...p,
                  shortTitle: e.target.value.toUpperCase(),
                }))
              }
            />
          </label>
          <div style={{ fontSize: 11, fontWeight: 600 }}>Profile Color</div>
          <div className="color-swatches">
            {PROFILE_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                className={`color-swatch ${profile.color === hex ? 'selected' : ''}`}
                style={{ backgroundColor: hex }}
                aria-label={`Select color ${hex}`}
                onClick={() => onUpdateProfile((p) => ({ ...p, color: hex }))}
              />
            ))}
          </div>
        </div>
      )}

      <div className="top-bar-actions">
        {!readOnly && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="appbar-icon-btn"
              title="Add rule"
              aria-expanded={showAddMenu}
              onClick={() => {
                setShowAddMenu((v) => !v);
                setShowMoreMenu(false);
                setShowBadgeEdit(false);
              }}
            >
              <Plus size={18} />
            </button>

            {showAddMenu && (
              <div className="dropdown-menu">
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    onAddRule('requestHeader');
                    setShowAddMenu(false);
                  }}
                >
                  <Plus size={14} /> Request header
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    onAddRule('responseHeader');
                    setShowAddMenu(false);
                  }}
                >
                  <Plus size={14} /> Response header
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    onAddRule('cookie');
                    setShowAddMenu(false);
                  }}
                >
                  <Plus size={14} /> Add cookie
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    onAddRule('queryParam');
                    setShowAddMenu(false);
                  }}
                >
                  <Plus size={14} /> Query parameter
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    onAddRule('redirect');
                    setShowAddMenu(false);
                  }}
                >
                  <Plus size={14} /> Redirect
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className={`appbar-icon-btn ${isPaused ? 'active-state' : ''}`}
          title={isPaused ? 'Resume SafeHeader' : 'Pause SafeHeader'}
          onClick={onTogglePause}
        >
          {isPaused ? <Play size={17} /> : <Pause size={17} />}
        </button>

        {!readOnly && (
          <button
            type="button"
            className={`appbar-icon-btn ${profile.tabLockId !== null ? 'active-state' : ''}`}
            title={
              profile.tabLockId !== null
                ? `Locked to Tab #${profile.tabLockId} (click to unlock)`
                : 'Lock this profile to current tab'
            }
            onClick={onToggleTabLock}
          >
            {profile.tabLockId !== null ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        )}

        <button
          type="button"
          className="appbar-icon-btn"
          title="Corporate Security Controls & Audit Log"
          onClick={() => {
            setShowBadgeEdit(false);
            setShowAddMenu(false);
            setShowMoreMenu(false);
            onOpenSecurity();
          }}
        >
          <ShieldCheck size={17} />
        </button>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="appbar-icon-btn"
            aria-label="Profile options"
            aria-expanded={showMoreMenu}
            onClick={() => {
              setShowMoreMenu((v) => !v);
              setConfirmDelete(false);
              setShowAddMenu(false);
              setShowBadgeEdit(false);
            }}
          >
            <MoreVertical size={17} />
          </button>

          {showMoreMenu && (
            <div className="dropdown-menu">
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  onCloneProfile();
                  setShowMoreMenu(false);
                }}
              >
                <Copy size={14} /> Clone profile
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    onUpdateProfile((p) => ({ ...p, hideComment: !p.hideComment }));
                    setShowMoreMenu(false);
                  }}
                >
                  <MessageSquare size={14} />{' '}
                  {profile.hideComment ? 'Show comments' : 'Hide comments'}
                </button>
              )}
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  onToggleMultiProfile();
                  setShowMoreMenu(false);
                }}
              >
                <Settings size={14} />{' '}
                {multiProfileMode ? 'Single-profile mode' : 'Multi-profile mode'}
              </button>
              <div className="dropdown-divider" />
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  onOpenImport();
                  setShowMoreMenu(false);
                }}
              >
                <Upload size={14} /> Import JSON (Local)
              </button>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  onOpenSecurity();
                  setShowMoreMenu(false);
                }}
              >
                <ShieldCheck size={14} /> Security &amp; Audit Log
              </button>
              <div className="dropdown-divider" />
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  onToggleCompactDensity();
                }}
              >
                <Settings size={14} />{' '}
                {compactDensity ? 'Comfortable density' : 'Compact density'}
              </button>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  onCycleTheme();
                }}
              >
                <SunMoon size={14} /> Theme: {theme}
              </button>
              {surface === 'popup' && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    onOpenSidePanel();
                    setShowMoreMenu(false);
                  }}
                >
                  <PanelRight size={14} /> Open side panel
                </button>
              )}
              {surface !== 'options' && (
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    onOpenOptions();
                    setShowMoreMenu(false);
                  }}
                >
                  <Settings size={14} /> Open in full tab
                </button>
              )}
              {!readOnly && (
                <>
                  <div className="dropdown-divider" />
                  {!confirmDelete ? (
                    <button
                      type="button"
                      className="dropdown-item danger"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 size={14} /> Delete profile
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="dropdown-item danger"
                      style={{ fontWeight: 700 }}
                      onClick={() => {
                        onDeleteProfile();
                        setConfirmDelete(false);
                        setShowMoreMenu(false);
                      }}
                    >
                      <Trash2 size={14} /> Confirm delete profile?
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
