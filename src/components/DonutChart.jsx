import { useState } from 'react';
import EmptyState from './EmptyState';

const MAX_SEGMENTS = 8;
const RADIUS = 80;
const STROKE_WIDTH = 32;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP_DEGREES = 3; // visual gap between segments in degrees
const GAP_PX = (GAP_DEGREES / 360) * CIRCUMFERENCE;

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
  const segCount = displaySegments.length;
  const hasGaps = segCount > 1;
  const totalGapPx = hasGaps ? GAP_PX * segCount : 0;
  const usable = CIRCUMFERENCE - totalGapPx;

  // Build stroke-dasharray / stroke-dashoffset for each segment
  let accOffset = 0;
  const arcs = displaySegments.map((seg) => {
    const fraction = total > 0 ? seg.value / total : 0;
    const dash = Math.max(1, fraction * usable); // min 1px to always be visible
    const offset = accOffset;
    accOffset += dash + (hasGaps ? GAP_PX : 0);
    return { dash, gap: CIRCUMFERENCE - dash, offset };
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
              strokeWidth={hoveredIndex === i ? STROKE_WIDTH + 4 : STROKE_WIDTH}
              strokeDasharray={`${arcs[i].dash} ${arcs[i].gap}`}
              strokeDashoffset={-arcs[i].offset}
              transform="rotate(-90 100 100)"
              style={{
                opacity: hoveredIndex === null || hoveredIndex === i ? 1 : 0.4,
              }}
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          ))}
        </svg>

        {/* Central total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-bold text-content-primary">{total}</span>
          <span className="text-[10px] text-content-tertiary uppercase tracking-widest">Total</span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6">
        {displaySegments.map((seg, i) => (
          <div
            key={seg.label}
            className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg cursor-pointer transition-all duration-200"
            style={{
              opacity: hoveredIndex === null || hoveredIndex === i ? 1 : 0.4,
              backgroundColor: hoveredIndex === i ? 'rgba(255,255,255,0.04)' : 'transparent',
            }}
            aria-label={`${seg.label}: ${seg.value} (${pct(seg.value, total)}%)`}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-sm text-content-primary truncate">{seg.label}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-sm text-content-tertiary tabular-nums w-10 text-right">
                {pct(seg.value, total)}%
              </span>
              <span className="text-sm font-semibold text-content-primary tabular-nums w-8 text-right">
                {seg.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
