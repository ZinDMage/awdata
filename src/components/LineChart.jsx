import { useState, useMemo } from 'react';

// FR101, FR103: SVG puro — polyline + circle + tooltip hover + overlay período anterior
const safeNum = (v) => (v != null && isFinite(v)) ? v : 0;

export default function LineChart({ series, xLabels = [], overlay, yFormat = String, height = 200, yMax: yMaxProp }) {
  const [hovered, setHovered] = useState(null); // { seriesIdx, pointIdx }

  const { yMin, yMax, yTicks } = useMemo(() => {
    const allValues = [...series, ...(overlay || [])].flatMap(s => s.data).filter(v => v != null && isFinite(v));
    const max = yMaxProp || Math.max(...allValues, 0);
    return { yMin: 0, yMax: max || 1, yTicks: 4 };
  }, [series, overlay, yMaxProp]);

  const PAD = { top: 10, right: 20, bottom: 30, left: 60 };
  const W = 400;
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const toX = (i) => PAD.left + (i / Math.max(xLabels.length - 1, 1)) * plotW;
  const toY = (v) => PAD.top + plotH - ((safeNum(v) - yMin) / (yMax - yMin)) * plotH;
  const pts = (data) => data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');

  const hoveredPoint = hovered ? { x: toX(hovered.pointIdx), y: toY(series[hovered.seriesIdx]?.data[hovered.pointIdx] ?? 0) } : null;

  const ariaLabel = 'Gráfico de linha: ' + series.map(s => s.label).join(', ');

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full" role="img" aria-label={ariaLabel}>
        {/* Y axis labels */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = yMin + (yMax - yMin) * (i / yTicks);
          const y = toY(val);
          return (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--color-border-subtle)" strokeOpacity={0.2} />
              <text x={PAD.left - 8} y={y + 3} textAnchor="end" className="text-[9px] fill-content-tertiary">{yFormat(val)}</text>
            </g>
          );
        })}
        {/* X axis labels */}
        {xLabels.map((label, i) => (
          <text key={i} x={toX(i)} y={height - 6} textAnchor="middle" className="text-[9px] fill-content-tertiary">{label}</text>
        ))}
        {/* Overlay — período anterior (dashed) */}
        {overlay?.map((o, si) => (
          <polyline key={`ov-${si}`} points={pts(o.data)} fill="none" stroke={o.color}
            strokeWidth={1.5} strokeDasharray="4 4" opacity={0.5} />
        ))}
        {/* Series */}
        {series.map((s, si) => (
          <g key={si}>
            <polyline points={pts(s.data)} fill="none" stroke={s.color} strokeWidth={2} />
            {s.data.map((v, pi) => (
              <circle key={pi} cx={toX(pi)} cy={toY(v)} r={hovered?.seriesIdx === si && hovered?.pointIdx === pi ? 5 : 3}
                fill={s.color} className="cursor-pointer transition-[r] duration-150"
                onMouseEnter={() => setHovered({ seriesIdx: si, pointIdx: pi })}
                onMouseLeave={() => setHovered(null)} />
            ))}
          </g>
        ))}
      </svg>
      {/* Tooltip */}
      {hovered && hoveredPoint && (
        <div role="tooltip" aria-live="polite" className="absolute pointer-events-none bg-surface-secondary border border-border-subtle/20 rounded-control p-3 shadow-lg text-sm z-10"
          style={{ left: `${(hoveredPoint.x / W) * 100}%`, top: `${(hoveredPoint.y / height) * 100}%`, transform: 'translate(-50%, -120%)' }}>
          <p className="text-content-tertiary text-xs mb-1">{xLabels[hovered.pointIdx]}</p>
          {series.map((s, si) => (
            <p key={si} className="font-medium text-content-primary">
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: s.color }} />
              {s.label}: {yFormat(s.data[hovered.pointIdx])}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
