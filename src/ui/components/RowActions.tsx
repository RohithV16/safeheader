import { X } from 'lucide-react';

export interface RowActionsProps {
  readonly onDelete: () => void;
  readonly deleteTitle?: string;
  readonly deleteAriaLabel?: string;
}

export function RowActions({
  onDelete,
  deleteTitle = 'Delete row',
  deleteAriaLabel = 'Delete row',
}: RowActionsProps) {
  return (
    <div className="row-actions">
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
