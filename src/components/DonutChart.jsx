import { useState } from 'react';
import EmptyState from './EmptyState';

const MAX_SEGMENTS = 8;
const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function pct(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

export default function DonutChart({ segments, title, subtitle }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!segments || segments.length === 0) {
    return <EmptyState icon="📊" message="Nenhum dado disponível" />;
  }

  // Group excess segments into "Outros"
  let displaySegments = segments;
  if (segments.length > MAX_SEGMENTS) {
    const main = segments.slice(0, MAX_SEGMENTS - 1);
    const others = segments.slice(MAX_SEGMENTS - 1);
    const othersValue = others.reduce((sum, s) => sum + s.value, 0);
    displaySegments = [...main, { label: 'Outros', value: othersValue, color: '#8E8E93' }];
  }

  const total = displaySegments.reduce((sum, s) => sum + s.value, 0);

  // Build stroke-dasharray / stroke-dashoffset for each segment
  let accOffset = 0;
  const arcs = displaySegments.map((seg, i) => {
    const fraction = total > 0 ? seg.value / total : 0;
    const isLast = i === displaySegments.length - 1;
    const dash = isLast ? CIRCUMFERENCE - accOffset : fraction * CIRCUMFERENCE;
    const gap = CIRCUMFERENCE - dash;
    const currentOffset = accOffset;
    accOffset += dash;
    return { dash, gap, offset: currentOffset };
  });

  const ariaLabel =
    (title ? title + ': ' : '') +
    displaySegments.map(s => `${s.label} ${pct(s.value, total)}%`).join(', ');

  return (
    <div className="bg-surface-secondary rounded-card p-6 border border-border-subtle/20">
      {title && <p className="text-base font-medium text-content-primary">{title}</p>}
      {subtitle && <p className="text-sm text-content-tertiary mb-4">{subtitle}</p>}
      <div className="border-t border-border-subtle/20 mb-6" />

      {/* SVG Donut */}
      <div className="relative w-[200px] h-[200px] mx-auto">
        <svg
          viewBox="0 0 200 200"
          className="w-[200px] h-[200px]"
          role="img"
          aria-label={ariaLabel}
        >
          {displaySegments.map((seg, i) => (
            <circle
              key={seg.label}
              cx="100"
              cy="100"
              r={RADIUS}
              fill="none"
              stroke={seg.color}
              strokeWidth={40}
              strokeDasharray={`${arcs[i].dash} ${arcs[i].gap}`}
              strokeDashoffset={-arcs[i].offset}
              transform="rotate(-90 100 100)"
              style={{
                opacity: hoveredIndex === null || hoveredIndex === i ? 1 : 0.5,
              }}
              className="transition-opacity duration-200 cursor-pointer"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          ))}
        </svg>

        {/* Central total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-bold text-content-primary">{total}</span>
          <span className="text-xs text-content-tertiary uppercase">Total</span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4">
        {displaySegments.map((seg, i) => (
          <div
            key={seg.label}
            className="flex items-center justify-between py-1.5 cursor-pointer transition-opacity duration-200"
            style={{
              opacity: hoveredIndex === null || hoveredIndex === i ? 1 : 0.5,
            }}
            aria-label={`${seg.label}: ${seg.value} (${pct(seg.value, total)}%)`}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-sm text-content-primary flex-1 ml-3">{seg.label}</span>
            <span className="text-sm text-content-tertiary tabular-nums mr-3">
              {pct(seg.value, total)}%
            </span>
            <span className="text-sm font-bold text-content-primary tabular-nums">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
