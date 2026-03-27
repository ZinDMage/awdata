import { useCallback, useRef } from 'react';

function PillBadge({ count, isActive }) {
  if (count === undefined) return null;

  const text = count === null ? '–' : String(count);
  const cls = isActive
    ? 'bg-white/20 text-white text-xs rounded-full px-1.5 min-w-[20px] text-center'
    : 'bg-surface-tertiary/50 text-content-secondary text-xs rounded-full px-1.5 min-w-[20px] text-center';

  return <span className={cls}>{text}</span>;
}

export default function StageTabBar({ tabs = [], activeTab, onTabChange }) {
  const containerRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    const focusable = containerRef.current?.querySelectorAll('[role="tab"]');
    if (!focusable?.length) return;

    const items = Array.from(focusable);
    const currentIndex = items.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex;
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % items.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const tabId = items[currentIndex].dataset.tabId;
      if (tabId) onTabChange(tabId);
      return;
    } else {
      return;
    }

    e.preventDefault();
    items[nextIndex].focus();
  }, [onTabChange]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Navegação de etapas"
      className="flex items-center gap-2 px-6 py-3 border-b border-border-subtle/20 overflow-x-auto sticky top-0 z-10 bg-surface-primary"
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const cls = isActive
          ? 'bg-info text-white rounded-full px-4 py-1.5 text-sm font-medium flex items-center gap-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-info'
          : 'bg-surface-secondary text-content-secondary rounded-full px-4 py-1.5 text-sm flex items-center gap-2 hover:bg-surface-tertiary cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-info';

        return (
          <button
            key={tab.id}
            role="tab"
            data-tab-id={tab.id}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            className={cls}
          >
            <span aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
            <PillBadge count={tab.count} isActive={isActive} />
          </button>
        );
      })}
    </div>
  );
}