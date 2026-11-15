import { useState, type DragEvent } from 'react';

interface UseRowDragAndDropOptions {
  readonly index: number;
  readonly type: string;
  readonly disabled?: boolean;
  readonly onMoveRule?: (fromIndex: number, toIndex: number) => void;
}

export function useRowDragAndDrop({
  index,
  type,
  disabled = false,
  onMoveRule,
}: UseRowDragAndDropOptions) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: DragEvent) => {
    if (disabled) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/safeheader-row-type', type);
    e.dataTransfer.setData('text/plain', String(index));
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent) => {
    if (disabled) return;
    if (e.dataTransfer.types.includes('application/safeheader-row-type')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragEnter = (e: DragEvent) => {
    if (disabled) return;
    if (e.dataTransfer.types.includes('application/safeheader-row-type')) {
      e.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragOver(false);

    const rowType = e.dataTransfer.getData('application/safeheader-row-type');
    if (rowType && rowType !== type) {
      return;
    }

    const raw = e.dataTransfer.getData('text/plain');
    const fromIdx = Number.parseInt(raw, 10);
    if (!Number.isNaN(fromIdx) && fromIdx !== index) {
      onMoveRule?.(fromIdx, index);
    }
  };

  return {
    isDragOver,
    isDragging,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  };
}
