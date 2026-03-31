import { useState, useEffect } from 'react';
import { F } from '@/utils/formatters';
import EmptyState from './EmptyState';

const AGING_COLORS = {
  '0-7d': '#34C759',
  '8-14d': '#FFD60A',
  '15-30d': '#FF9500',
  '30d+': '#FF453A',
};

function getBarColor(bar, mode) {
  if (mode === 'aging' && bar.label in AGING_COLORS) {
    return AGING_COLORS[bar.label];
  }
  return bar.color;
}

export default function BarChart({ bars, title, subtitle, mode = 'default', formatValue }) {
  const [mounted, setMounted] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [expandedIndex, setExpandedIndex] = useState(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!bars || bars.length === 0) {
    return <EmptyState icon="📊" message="Nenhum dado disponível" />;
  }

  const maxValue = Math.max(...bars.map((b) => b.value));
  const step = maxValue > 0 ? Math.ceil(maxValue / 4) : 1;
  const yLabels = Array.from({ length: 5 }, (_, i) => step * (4 - i));

  const isForecast = mode === 'forecast';
  const expandedBar = expandedIndex != null ? bars[expandedIndex] : null;

  return (
    <div
      className="bg-surface-secondary rounded-card p-6 border border-border-subtle/20"
      role="img"
      aria-label={`${title}: ${subtitle}`}
    >
      <p className="text-base font-medium text-content-primary">{title}</p>
      <p className="text-sm text-content-tertiary mb-4">{subtitle}</p>

      <div className="flex gap-3">
        {/* Y axis */}
        <div className="flex flex-col justify-between h-[200px] pr-1">
          {yLabels.map((label) => (
            <span
              key={label}
              className="text-xs text-content-tertiary tabular-nums leading-none"
            >
              {formatValue ? formatValue(label) : label}
            </span>
          ))}
        </div>

        {/* Chart area */}
        <div className="flex-1 flex flex-col">
          {/* Grid + bars */}
          <div className="relative h-[200px]">
            {/* Horizontal grid lines */}
            {yLabels.map((label) => (
              <div
                key={label}
                className="absolute w-full border-t border-dashed border-border-subtle/20"
                style={{ top: `${(yLabels.indexOf(label) / (yLabels.length - 1)) * 100}%` }}
              />
            ))}

            {/* Bars row */}
            <div className="absolute inset-0 flex gap-2 justify-around">
              {bars.map((bar, i) => {
                const heightPercent =
                  maxValue > 0 && bar.value > 0
                    ? Math.max(4, (bar.value / maxValue) * 100)
                    : 0;
                const isExpanded = expandedIndex === i;

                return (
                  <div
                    key={bar.label}
                    className="relative h-full flex flex-col justify-end items-center"
                    style={{ flex: 1 }}
                  >
                    {/* Tooltip */}
                    {hoveredIndex === i && !isExpanded && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 bg-surface-primary text-content-primary rounded-control px-3 py-2 text-sm shadow-lg whitespace-nowrap tabular-nums pointer-events-none">
                        {bar.label}: {formatValue ? formatValue(bar.value) : bar.value}
                        {isForecast && bar.deals?.length > 0 && (
                          <span className="text-content-tertiary ml-1">({bar.deals.length} deals)</span>
                        )}
                      </div>
                    )}

                    {/* Bar */}
                    <div
                      className={`w-full min-w-[40px] rounded-t-sm transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                        isForecast && bar.deals?.length > 0
                          ? 'cursor-pointer hover:opacity-80'
                          : 'cursor-default'
                      } ${isExpanded ? 'ring-2 ring-info ring-offset-1 ring-offset-surface-secondary' : ''}`}
                      style={{
                        backgroundColor: getBarColor(bar, mode),
                        height: mounted ? `${heightPercent}%` : '0%',
                      }}
                      aria-label={`${bar.label}: ${bar.value}`}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={() => {
                        if (isForecast && bar.deals?.length > 0) {
                          setExpandedIndex(isExpanded ? null : i);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* X axis labels */}
          <div className="flex gap-2 justify-around mt-2">
            {bars.map((bar, i) => (
              <span
                key={bar.label}
                className={`text-xs uppercase text-center cursor-pointer transition-colors ${
                  expandedIndex === i
                    ? 'text-info font-semibold'
                    : 'text-content-tertiary'
                }`}
                style={{ flex: 1 }}
                onClick={() => {
                  if (isForecast && bar.deals?.length > 0) {
                    setExpandedIndex(expandedIndex === i ? null : i);
                  }
                }}
              >
                {bar.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded deal list */}
      {isForecast && expandedBar && expandedBar.deals?.length > 0 && (
        <div className="mt-4 border-t border-border-subtle/30 pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-content-primary">
              {expandedBar.label} — {expandedBar.deals.length} {expandedBar.deals.length === 1 ? 'deal' : 'deals'}
              <span className="text-content-tertiary font-normal ml-2">
                Total: {F.ri(expandedBar.value)}
              </span>
            </p>
            <button
              onClick={() => setExpandedIndex(null)}
              className="text-xs text-content-tertiary hover:text-content-primary transition-colors"
            >
              ✕ Fechar
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-content-tertiary text-[10px] uppercase tracking-wider border-b border-border-subtle/30">
                  <th className="text-left py-1.5 pr-3 font-medium">Deal</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Email</th>
                  <th className="text-right py-1.5 pr-3 font-medium">Valor</th>
                  <th className="text-right py-1.5 pr-3 font-medium">Receita Prev.</th>
                  <th className="text-right py-1.5 font-medium">Data Proposta</th>
                </tr>
              </thead>
              <tbody>
                {expandedBar.deals.map((deal, di) => (
                  <tr key={di} className="border-b border-border-subtle/10 hover:bg-surface-tertiary/50 transition-colors">
                    <td className="py-2 pr-3 text-content-primary font-medium truncate max-w-[180px]">
                      {deal.title}
                    </td>
                    <td className="py-2 pr-3 text-content-secondary truncate max-w-[180px]">
                      {deal.person_email}
                    </td>
                    <td className="py-2 pr-3 text-right text-content-primary tabular-nums">
                      {F.ri(deal.value)}
                    </td>
                    <td className="py-2 pr-3 text-right text-positive tabular-nums font-medium">
                      {F.ri(deal.expectedValue)}
                    </td>
                    <td className="py-2 text-right text-content-secondary tabular-nums">
                      {deal.data_proposta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
