import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

interface RuleSectionProps {
  title: string;
  activeCount: number;
  totalCount: number;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  readOnly?: boolean;
  onAdd: () => void;
  children: ReactNode;
}

export function RuleSection({
  title,
  activeCount,
  totalCount,
  defaultOpen = true,
  forceOpen = false,
  readOnly = false,
  onAdd,
  children,
}: RuleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <section className="rule-section">
      <div className={`section-header ${!open ? 'collapsed' : ''}`}>
        <button
          type="button"
          className="section-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{title}</span>
          <span className="count-pill">
            {activeCount}/{totalCount}
          </span>
        </button>

        {!readOnly && (
          <button type="button" className="section-add-btn" onClick={onAdd}>
            <Plus size={13} /> Add
          </button>
        )}
      </div>

      {open && <div className="section-body">{children}</div>}
    </section>
  );
}
