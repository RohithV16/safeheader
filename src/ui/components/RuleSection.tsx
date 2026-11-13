import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';

interface RuleSectionProps {
  readonly title: string;
  readonly activeCount: number;
  readonly totalCount: number;
  readonly defaultOpen?: boolean;
  readonly readOnly?: boolean;
  readonly onAdd: () => void;
  readonly children: ReactNode;
}

export function RuleSection({
  title,
  activeCount,
  totalCount,
  defaultOpen = true,
  readOnly = false,
  onAdd,
  children,
}: RuleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

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
