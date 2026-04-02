import { useMemo, useCallback } from 'react';
import { useMetrics } from '@/contexts/MetricsContext';
import { SOURCE_OPTIONS } from '@/config/sourceMapping';
import { getInitialYear } from '@/utils/helpers';

export default function ActiveFilterBadge() {
  const { years, sourceFilter, setYears, setSourceFilter } = useMetrics();

  const isDefault = useMemo(() => {
    const dy = getInitialYear();
    return sourceFilter.length === 1 && sourceFilter[0] === 'todos'
      && years.length === 1 && years[0] === dy;
  }, [sourceFilter, years]);

  const label = useMemo(() => {
    if (isDefault) return '';
    const parts = [];
    const dy = getInitialYear();

    // Source part
    if (!sourceFilter.includes('todos')) {
      const labels = sourceFilter
        .map(id => SOURCE_OPTIONS.find(o => o.id === id)?.label)
        .filter(Boolean);
      if (labels.length > 3) {
        parts.push(`${labels.length} fontes`);
      } else if (labels.length) {
        parts.push(labels.join('+'));
      }
    }

    // Years part
    if (years.length !== 1 || years[0] !== dy) {
      parts.push([...years].sort().join('+'));
    }

    return parts.join(' \u00b7 ');
  }, [sourceFilter, years, isDefault]);

  const handleReset = useCallback(() => {
    setYears([getInitialYear()]);
    setSourceFilter(['todos']);
  }, [setYears, setSourceFilter]);

  if (isDefault) return null;

  return (
    <div
      onClick={handleReset}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleReset(); } }}
      tabIndex={0}
      role="button"
      title="Resetar filtros"
      aria-label={`Filtros ativos: ${label}. Clique para resetar.`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: 20,
        background: 'rgba(13,110,253,0.1)',
        color: '#0D6EFD',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background 0.2s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(13,110,253,0.15)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(13,110,253,0.1)'}
      onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px rgba(13,110,253,0.5)'}
      onBlur={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <span>{label}</span>
      <span style={{ fontSize: 14, opacity: 0.6, lineHeight: 1 }}>&times;</span>
    </div>
  );
}
