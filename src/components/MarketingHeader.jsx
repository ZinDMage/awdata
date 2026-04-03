import { useCallback } from 'react';
import SyncIndicator from '@/components/marketing/SyncIndicator';

// FR93, FR100, UX-DR2, UX-DR8, UX-DR19, UX-DR20
// AD-V3-6: recebe TUDO via props — NÃO consome context diretamente
export default function MarketingHeader({ title, toggle, tabs, syncStatus, onSettingsClick }) {
  // FR130: transforma syncStatus object → array para SyncIndicator // UX-DR12
  const syncSources = [
    { name: 'Meta', lastSync: syncStatus?.meta ?? null },
    { name: 'Google', lastSync: syncStatus?.google ?? null },
    { name: 'LinkedIn', lastSync: syncStatus?.linkedin ?? null },
  ];
  return (
    <header
      className="sticky top-0 z-20 bg-surface-primary/80 backdrop-blur-md px-6 py-2.5 flex items-center justify-between border-b border-border-subtle/20 h-12"
      aria-label="Marketing navigation header"
    >
      {/* Lado esquerdo — título */}
      <h2 className="text-lg font-medium text-content-primary">
        {title}
      </h2>

      {/* Centro — controles contextuais */}
      <div className="flex items-center gap-6">
        {toggle && <ToggleSegmented mode={toggle.mode} onChange={toggle.onChange} />}
        {tabs && <TabBar active={tabs.active} items={tabs.items} onChange={tabs.onChange} />}
      </div>

      {/* Lado direito — settings + sync indicators (FR125, FR130, AD-V3-10) */}
      <div className="flex items-center gap-2">
        {onSettingsClick && (
          <button
            type="button"
            aria-label="Configurações de Source Mapping"
            onClick={onSettingsClick}
            className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors duration-150"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-content-tertiary hover:text-content-primary transition-colors duration-150">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        )}
        <SyncIndicator sources={syncSources} />
      </div>
    </header>
  );
}

// ── Toggle Segmented Control (KPIs ADS) ── UX-DR19
function ToggleSegmented({ mode, onChange }) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(mode === 'analysis' ? 'charts' : 'analysis');
    }
  }, [mode, onChange]);

  return (
    <div
      className="bg-surface-secondary rounded-full p-0.5 flex"
      role="tablist"
      onKeyDown={handleKeyDown}
    >
      <button
        role="tab"
        aria-selected={mode === 'analysis'}
        tabIndex={mode === 'analysis' ? 0 : -1}
        onClick={() => onChange('analysis')}
        className={`px-4 py-1 text-sm font-medium rounded-full transition-colors duration-150 ${
          mode === 'analysis'
            ? 'bg-[var(--color-marketing)] text-white'
            : 'text-content-secondary cursor-pointer'
        }`}
      >
        Análise
      </button>
      <button
        role="tab"
        aria-selected={mode === 'charts'}
        tabIndex={mode === 'charts' ? 0 : -1}
        onClick={() => onChange('charts')}
        className={`px-4 py-1 text-sm font-medium rounded-full transition-colors duration-150 ${
          mode === 'charts'
            ? 'bg-[var(--color-marketing)] text-white'
            : 'text-content-secondary cursor-pointer'
        }`}
      >
        Gráficos
      </button>
    </div>
  );
}

// ── Tab Bar (Performance ADS) ── UX-DR8, UX-DR19
function TabBar({ active, items, onChange }) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const currentIndex = items.findIndex(t => t.id === active);
      const next = e.key === 'ArrowRight'
        ? (currentIndex + 1) % items.length
        : (currentIndex - 1 + items.length) % items.length;
      onChange(items[next].id);
    }
  }, [active, items, onChange]);

  return (
    <nav
      className="flex gap-6 items-center"
      role="tablist"
      onKeyDown={handleKeyDown}
    >
      {items.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          className={`text-sm pb-1 transition-colors duration-150 ${
            active === tab.id
              ? 'text-[var(--color-marketing)] font-medium border-b-2 border-[var(--color-marketing)]'
              : 'text-content-tertiary hover:text-content-secondary cursor-pointer'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

