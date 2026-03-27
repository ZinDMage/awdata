import { useState, useEffect } from 'react';
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

export default function BarChart({ bars, title, subtitle, mode = 'default' }) {
  const [mounted, setMounted] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!bars || bars.length === 0) {
    return <EmptyState icon="📊" message="Nenhum dado disponível" />;
  }

  const maxValue = Math.max(...bars.map((b) => b.value));
  const step = Math.ceil(maxValue / 4);
  const yLabels = step > 0
    ? Array.from({ length: 5 }, (_, i) => step * (4 - i))
    : [4, 3, 2, 1, 0];

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
              {label}
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
            <div className="absolute inset-0 flex items-end gap-2 justify-around">
              {bars.map((bar, i) => {
                const heightPercent =
                  maxValue > 0 && bar.value > 0
                    ? Math.max(4, (bar.value / maxValue) * 100)
                    : 0;

                return (
                  <div
                    key={bar.label}
                    className="relative flex flex-col items-center"
                    style={{ flex: 1 }}
                  >
                    {/* Tooltip */}
                    {hoveredIndex === i && (
                      <div className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 z-10 bg-surface-primary text-content-primary rounded-control px-3 py-2 text-sm shadow-lg whitespace-nowrap tabular-nums pointer-events-none">
                        {bar.label}: {bar.value}
                      </div>
                    )}

                    {/* Bar */}
                    <div
                      className="w-full min-w-[40px] rounded-t-sm transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] cursor-pointer"
                      style={{
                        backgroundColor: getBarColor(bar, mode),
                        height: mounted ? `${heightPercent}%` : '0%',
                      }}
                      aria-label={`${bar.label}: ${bar.value}`}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* X axis labels */}
          <div className="flex gap-2 justify-around mt-2">
            {bars.map((bar) => (
              <span
                key={bar.label}
                className="text-xs text-content-tertiary uppercase text-center"
                style={{ flex: 1 }}
              >
                {bar.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
