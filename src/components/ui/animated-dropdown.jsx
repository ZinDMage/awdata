import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const EASE = "all 300ms cubic-bezier(0.4, 0, 0.2, 1)";

function useClickOutside(ref, handler) {
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) handler();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, handler]);
}

/**
 * AnimatedDropdown — adapted from emerald-ui for AwSales design system.
 *
 * @param {Object[]} items        - Array of { id, label }
 * @param {string}   text         - Dropdown label
 * @param {string|string[]} selected - Current selection (string for single, array for multi)
 * @param {Function} onSelect     - Called with (id) on selection
 * @param {boolean}  multiSelect  - If true, keeps dropdown open on click and shows checkmarks
 */
export default function AnimatedDropdown({
  items = [],
  text = 'Selecionar',
  selected,
  onSelect,
  multiSelect = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const close = useCallback(() => setIsOpen(false), []);
  useClickOutside(wrapperRef, close);

  const isSelected = (id) =>
    multiSelect ? (Array.isArray(selected) && selected.includes(id)) : selected === id;

  const handleClick = (id) => {
    onSelect?.(id);
    if (!multiSelect) setIsOpen(false);
  };

  const handleListKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const options = e.currentTarget.querySelectorAll('[role="option"]');
      if (!options.length) return;
      const idx = Array.from(options).indexOf(document.activeElement);
      const next = e.key === 'ArrowDown'
        ? (idx + 1) % options.length
        : (idx - 1 + options.length) % options.length;
      options[next]?.focus();
    }
  }, []);

  // Build display label from selection
  const displayLabel = (() => {
    if (multiSelect && Array.isArray(selected)) {
      if (selected.length === 0) return text;
      if (selected.length === items.length) return 'Todos';
      const labels = items.filter(i => selected.includes(i.id)).map(i => i.label);
      return labels.length <= 2 ? labels.join(', ') : `${labels.length} selecionados`;
    }
    const found = items.find(i => i.id === selected);
    return found ? found.label : text;
  })();

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          borderRadius: 12,
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 600,
          border: '1px solid var(--color-border-subtle)',
          cursor: 'pointer',
          userSelect: 'none',
          transition: EASE,
          background: isOpen ? 'rgba(0,122,255,0.15)' : 'var(--color-surface-primary)',
          color: isOpen ? 'var(--color-accent, #007AFF)' : 'var(--color-content-secondary)',
        }}
      >
        <span style={{ whiteSpace: 'nowrap' }}>{displayLabel}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <ChevronDown size={14} />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="listbox"
            onKeyDown={handleListKeyDown}
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 50,
              minWidth: '100%',
              width: 'max-content',
              overflow: 'hidden',
              borderRadius: 12,
              background: 'var(--color-surface-secondary)',
              border: '1px solid var(--color-border-subtle)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
          >
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.025 } },
              }}
            >
              {items.map((item, index) => {
                const active = isSelected(item.id);
                return (
                  <motion.button
                    key={item.id}
                    role="option"
                    aria-selected={active}
                    variants={{
                      hidden: { opacity: 0, x: -12 },
                      visible: { opacity: 1, x: 0 },
                    }}
                    onClick={() => handleClick(item.id)}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      fontSize: 11,
                      border: 'none',
                      borderBottom: index < items.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 150ms, color 150ms',
                      background: active ? 'rgba(0,122,255,0.1)' : 'var(--color-surface-secondary)',
                      color: active ? 'var(--color-accent, #007AFF)' : 'var(--color-content-secondary)',
                      fontWeight: active ? 600 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = 'var(--color-surface-tertiary)';
                        e.currentTarget.style.color = 'var(--color-content-primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = active ? 'rgba(0,122,255,0.1)' : 'var(--color-surface-secondary)';
                      e.currentTarget.style.color = active ? 'var(--color-accent, #007AFF)' : 'var(--color-content-secondary)';
                    }}
                  >
                    {multiSelect && (
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        border: active ? '1px solid var(--color-accent, #007AFF)' : '1px solid var(--color-border-subtle)',
                        background: active ? 'var(--color-accent, #007AFF)' : 'transparent',
                        color: '#fff',
                        fontSize: 9,
                        flexShrink: 0,
                      }}>
                        {active && '✓'}
                      </span>
                    )}
                    <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
                  </motion.button>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
