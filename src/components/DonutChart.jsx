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

export default function DonutChart({ segments, title, subtitle, onSegmentClick, selectedIndex }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Story 3.6: keyboard handler for segments (UX-DR19)
  const handleKeyDown = (e, label, i) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSegmentClick?.(label, i);
    }
  };

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
          {displaySegments.map((seg, i) => {
            // Story 3.6: selectedIndex takes priority over hoveredIndex for opacity/stroke
            const isSelected = selectedIndex != null && selectedIndex === i;
            const hasSelection = selectedIndex != null;
            const sw = isSelected ? STROKE_WIDTH + 6 : hoveredIndex === i ? STROKE_WIDTH + 4 : STROKE_WIDTH;
            const op = hasSelection
              ? (isSelected ? 1 : 0.3)
              : (hoveredIndex === null || hoveredIndex === i ? 1 : 0.4);

            return (
              <circle
                key={seg.label}
                cx="100"
                cy="100"
                r={RADIUS}
                fill="none"
                stroke={seg.color}
                strokeWidth={sw}
                strokeDasharray={`${arcs[i].dash} ${arcs[i].gap}`}
                strokeDashoffset={-arcs[i].offset}
                transform="rotate(-90 100 100)"
                style={{
                  opacity: op,
                  filter: isSelected ? `drop-shadow(0 0 4px ${seg.color})` : undefined,
                }}
                className={`transition-all duration-200${onSegmentClick ? ' cursor-pointer' : ''}`}
                role={onSegmentClick ? 'button' : undefined}
                aria-label={onSegmentClick ? seg.label : undefined}
                tabIndex={onSegmentClick ? 0 : undefined}
                aria-pressed={onSegmentClick ? isSelected : undefined}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => onSegmentClick?.(seg.label, i)}
                onKeyDown={(e) => handleKeyDown(e, seg.label, i)}
              />
            );
          })}
        </svg>

        {/* Central total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-bold text-content-primary">{total}</span>
          <span className="text-[10px] text-content-tertiary uppercase tracking-widest">Total</span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6">
        {displaySegments.map((seg, i) => {
          const isSelected = selectedIndex != null && selectedIndex === i;
          const hasSelection = selectedIndex != null;
          const op = hasSelection
            ? (isSelected ? 1 : 0.3)
            : (hoveredIndex === null || hoveredIndex === i ? 1 : 0.4);
          const bg = isSelected
            ? 'rgba(255,255,255,0.08)'
            : hoveredIndex === i ? 'rgba(255,255,255,0.04)' : 'transparent';

          return (
          <div
            key={seg.label}
            className={`flex items-center justify-between py-2 px-2 -mx-2 rounded-lg transition-all duration-200${onSegmentClick ? ' cursor-pointer' : ''}`}
            style={{ opacity: op, backgroundColor: bg }}
            role={onSegmentClick ? 'button' : undefined}
            tabIndex={onSegmentClick ? 0 : undefined}
            aria-label={`${seg.label}: ${seg.value} (${pct(seg.value, total)}%)`}
            aria-pressed={onSegmentClick ? isSelected : undefined}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            onClick={() => onSegmentClick?.(seg.label, i)}
            onKeyDown={(e) => { if (onSegmentClick) handleKeyDown(e, seg.label, i); }}
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
          );
        })}
      </div>
    </div>
  );
}
