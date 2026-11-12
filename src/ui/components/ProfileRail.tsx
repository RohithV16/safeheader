import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import type { Profile } from '../../shared/types';

interface ProfileRailProps {
  profiles: Profile[];
  activeProfileId: string;
  multiProfileMode: boolean;
  isPaused: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onMoveProfile: (id: string, direction: 'up' | 'down') => void;
}

export function ProfileRail({
  profiles,
  activeProfileId,
  multiProfileMode,
  isPaused,
  onSelect,
  onAdd,
  onMoveProfile,
}: ProfileRailProps) {
  const userProfiles = profiles.filter((p) => !p.isManaged);
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const activeUserIdx =
    activeProfile && !activeProfile.isManaged
      ? userProfiles.findIndex((p) => p.id === activeProfile.id)
      : -1;

  return (
    <aside className="profile-rail" aria-label="Profiles">
      {profiles.map((profile, index) => {
        const isActive = profile.id === activeProfileId;
        const label = (profile.shortTitle || String(index + 1)).slice(0, 3);
        const showEnabledDot =
          !isPaused && (multiProfileMode ? profile.enabled : isActive && profile.enabled);

        return (
          <button
            key={profile.id}
            type="button"
            className={`rail-pill ${isActive ? 'active' : ''} ${
              !profile.enabled ? 'disabled-profile' : ''
            }`}
            style={{ backgroundColor: profile.color }}
            title={`${profile.title}${multiProfileMode && profile.enabled ? ` [Priority #${index + 1}]` : ''}${
              profile.tabLockId ? ` (Locked to Tab #${profile.tabLockId})` : ''
            }`}
            onClick={() => onSelect(profile.id)}
          >
            {label}
            {multiProfileMode && profile.enabled && (
              <span className="rail-rank" title={`Priority #${index + 1}`}>
                {index + 1}
              </span>
            )}
            {showEnabledDot && <span className="rail-dot" />}
          </button>
        );
      })}
      <button
        type="button"
        className="rail-add-btn"
        title="New Profile"
        onClick={onAdd}
      >
        <Plus size={16} />
      </button>

      {activeProfile && !activeProfile.isManaged && userProfiles.length > 1 && (
        <div className="rail-reorder-group">
          <button
            type="button"
            className="rail-reorder-btn"
            disabled={activeUserIdx <= 0}
            title="Move active profile up (higher priority)"
            onClick={() => onMoveProfile(activeProfile.id, 'up')}
          >
            <ArrowUp size={11} />
          </button>
          <button
            type="button"
            className="rail-reorder-btn"
            disabled={activeUserIdx < 0 || activeUserIdx >= userProfiles.length - 1}
            title="Move active profile down (lower priority)"
            onClick={() => onMoveProfile(activeProfile.id, 'down')}
          >
            <ArrowDown size={11} />
          </button>
        </div>
      )}
    </aside>
  );
}
