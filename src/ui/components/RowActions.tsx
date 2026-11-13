import { ChevronDown, ChevronUp, X } from 'lucide-react';

export interface RowActionsProps {
  readonly onMoveUp?: () => void;
  readonly onMoveDown?: () => void;
  readonly canMoveUp?: boolean;
  readonly canMoveDown?: boolean;
  readonly onDelete: () => void;
  readonly deleteTitle?: string;
  readonly deleteAriaLabel?: string;
}

export function RowActions({
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onDelete,
  deleteTitle = 'Delete row',
  deleteAriaLabel = 'Delete row',
}: RowActionsProps) {
  return (
    <div className="row-actions">
      {onMoveUp && (
        <button
          type="button"
          className="row-action-btn"
          title="Move up"
          aria-label="Move rule up"
          disabled={!canMoveUp}
          onClick={onMoveUp}
        >
          <ChevronUp size={13} />
        </button>
      )}
      {onMoveDown && (
        <button
          type="button"
          className="row-action-btn"
          title="Move down"
          aria-label="Move rule down"
          disabled={!canMoveDown}
          onClick={onMoveDown}
        >
          <ChevronDown size={13} />
        </button>
      )}
      <button
        type="button"
        className="row-del-btn"
        title={deleteTitle}
        aria-label={deleteAriaLabel}
        onClick={onDelete}
      >
        <X size={14} />
      </button>
    </div>
  );
}
