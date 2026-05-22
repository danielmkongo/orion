import { useEffect, useId, useRef, useState, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: ReactNode;
  /** Optional short label shown in the trigger (defaults to `label` if a string, otherwise stringified value). */
  triggerLabel?: ReactNode;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Inline style applied to the trigger button. Lets callers match existing layout. */
  style?: React.CSSProperties;
  /** Width override for the dropdown menu (defaults to trigger width). */
  menuMinWidth?: number;
  /** Optional id for label association. */
  id?: string;
  /** Title attribute applied to the trigger. */
  title?: string;
  /** Compact = smaller height for use in toolbars. */
  size?: 'default' | 'sm';
}

/**
 * Orion-styled custom <select> replacement.
 * - Renders the trigger as a button styled like `.select` (or `.select` + smaller padding for sm).
 * - Opens a portal popover for the menu — works above z-stacked content, doesn't get clipped by overflow.
 * - On mobile, the menu uses the same Orion styling instead of the native OS picker.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  className,
  style,
  menuMinWidth,
  id,
  title,
  size = 'default',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);
  const reactId = useId();
  const listboxId = id ?? `sel-${reactId}`;
  const [activeIdx, setActiveIdx] = useState(-1);

  const selected = options.find(o => o.value === value);
  const triggerText: ReactNode = selected
    ? (selected.triggerLabel ?? selected.label)
    : <span style={{ color: 'hsl(var(--muted-fg))' }}>{placeholder}</span>;

  // Position the menu relative to trigger using viewport coords (portal renders to document.body).
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const compute = () => {
      const r = trigger.getBoundingClientRect();
      const vh = window.innerHeight;
      // Estimated menu height — clamp to 280px or available space
      const wanted = Math.min(280, options.length * 34 + 8);
      const spaceBelow = vh - r.bottom - 12;
      const spaceAbove = r.top - 12;
      const openUp = spaceBelow < wanted && spaceAbove > spaceBelow;
      setPos({
        top: openUp ? r.top - wanted - 4 : r.bottom + 4,
        left: r.left,
        width: r.width,
        openUp,
      });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open, options.length]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(options.length - 1, (i < 0 ? -1 : i) + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(0, (i < 0 ? options.length : i) - 1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (activeIdx >= 0 && !options[activeIdx].disabled) {
          e.preventDefault();
          onChange(options[activeIdx].value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIdx(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIdx(options.length - 1);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, options, activeIdx, onChange]);

  // When opening, set active to current value
  useEffect(() => {
    if (open) {
      const i = options.findIndex(o => o.value === value);
      setActiveIdx(i);
    }
  }, [open, value, options]);

  const triggerHeight = size === 'sm' ? 30 : 38;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={listboxId + '-trigger'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        title={title}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={className}
        style={{
          width: '100%',
          minHeight: triggerHeight,
          height: triggerHeight,
          padding: size === 'sm' ? '0 28px 0 10px' : '0 32px 0 12px',
          background: 'hsl(var(--surface))',
          color: 'hsl(var(--fg))',
          border: '1px solid hsl(var(--border))',
          borderColor: open ? 'hsl(var(--fg))' : 'hsl(var(--border))',
          fontFamily: 'var(--font-sans)',
          fontSize: size === 'sm' ? 12 : 13.5,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'border-color 0.12s',
          outline: 'none',
          ...style,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {triggerText}
        </span>
        <ChevronDown size={14} style={{
          position: 'absolute',
          right: size === 'sm' ? 8 : 10,
          color: 'hsl(var(--muted-fg))',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
          flexShrink: 0,
        }} />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            minWidth: menuMinWidth ?? pos.width,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 280,
            overflowY: 'auto',
            background: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border-strong, var(--border)))',
            boxShadow: '0 12px 32px hsl(0 0% 0% / 0.18), 0 2px 6px hsl(0 0% 0% / 0.08)',
            zIndex: 9999,
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            padding: 4,
          }}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isActive = idx === activeIdx;
            return (
              <button
                key={opt.value + idx}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange(opt.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  color: opt.disabled ? 'hsl(var(--muted-fg))' : 'hsl(var(--fg))',
                  background: isActive ? 'hsl(var(--primary) / 0.10)' : 'transparent',
                  border: 'none',
                  borderLeft: isSelected ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                  textAlign: 'left',
                  cursor: opt.disabled ? 'not-allowed' : 'pointer',
                  transition: 'background 0.08s',
                  opacity: opt.disabled ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <Check size={12} style={{ flexShrink: 0, opacity: isSelected ? 1 : 0, color: 'hsl(var(--primary))' }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
