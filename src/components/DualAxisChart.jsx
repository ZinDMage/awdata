import { useState, useMemo } from 'react';

// FR101, FR103: SVG puro — bars (eixo Y esquerdo) + line (eixo Y direito) + overlay + tooltip
const safeNum = (v) => (v != null && isFinite(v)) ? v : 0;

export default function DualAxisChart({
  bars, line, xLabels = [], yLeftFormat = String, yRightFormat = String,
  overlay, height = 200, yLeftMax: yLeftMaxProp, yRightMax: yRightMaxProp,
}) {
  const [hovered, setHovered] = useState(null); // { pointIdx }

  const { yLeftMax, yRightMax } = useMemo(() => ({
    yLeftMax: yLeftMaxProp || Math.max(...bars.data.filter(v => v != null && isFinite(v)), 0) || 1,
    yRightMax: yRightMaxProp || Math.max(
      ...line.data.filter(v => v != null && isFinite(v)),
      ...(overlay?.data || []).filter(v => v != null && isFinite(v)),
      0
    ) || 1,
  }), [bars, line, overlay, yLeftMaxProp, yRightMaxProp]);

  const PAD = { top: 10, right: 60, bottom: 30, left: 60 };
  const W = 400;
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const n = Math.max(xLabels.length, 1);
  const barW = (plotW / n) * 0.6;
  const TICKS = 4;

  const toX = (i) => PAD.left + (i + 0.5) * (plotW / n);
  const toYL = (v) => PAD.top + plotH - (safeNum(v) / yLeftMax) * plotH;
  const toYR = (v) => PAD.top + plotH - (safeNum(v) / yRightMax) * plotH;
  const linePts = (data, fn) => data.map((v, i) => `${toX(i)},${fn(v)}`).join(' ');

  const hoveredX = hovered != null ? toX(hovered.pointIdx) : 0;
  const ariaLabel = `Gráfico dual-axis: ${bars.label} (barras) e ${line.label} (linha)`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full" role="img" aria-label={ariaLabel}>
        {/* Grid + Y left labels (bars) */}
        {Array.from({ length: TICKS + 1 }, (_, i) => {
          const val = (yLeftMax / TICKS) * i;
          const y = toYL(val);
          return (
            <g key={`yl-${i}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--color-border-subtle)" strokeOpacity={0.2} />
              <text x={PAD.left - 8} y={y + 3} textAnchor="end" className="text-[9px] fill-content-tertiary">{yLeftFormat(val)}</text>
            </g>
          );
        })}
        {/* Y right labels (line) */}
        {Array.from({ length: TICKS + 1 }, (_, i) => {
          const val = (yRightMax / TICKS) * i;
          return (
            <text key={`yr-${i}`} x={W - PAD.right + 8} y={toYR(val) + 3} textAnchor="start" className="text-[9px] fill-content-tertiary">
              {yRightFormat(val)}
            </text>
          );
        })}
        {/* Bars */}
        {bars.data.map((v, i) => {
          const barH = plotH * (Math.max(0, v ?? 0) / yLeftMax);
          return (
            <rect key={i} x={toX(i) - barW / 2} y={PAD.top + plotH - barH} width={barW} height={barH}
              fill={bars.color} opacity={hovered?.pointIdx === i ? 1 : 0.8} rx={2}
              className="cursor-pointer transition-opacity duration-150"
              onMouseEnter={() => setHovered({ pointIdx: i })}
              onMouseLeave={() => setHovered(null)} />
          );
        })}
        {/* Overlay dashed (right axis) */}
        {overlay && (
          <polyline points={linePts(overlay.data, toYR)} fill="none" stroke={overlay.color}
            strokeWidth={1.5} strokeDasharray="4 4" opacity={0.5} />
        )}
        {/* Line (right axis) */}
        <polyline points={linePts(line.data, toYR)} fill="none" stroke={line.color} strokeWidth={2} />
        {line.data.map((v, i) => (
          <circle key={i} cx={toX(i)} cy={toYR(v)} r={hovered?.pointIdx === i ? 5 : 3}
            fill={line.color} className="cursor-pointer transition-[r] duration-150"
            onMouseEnter={() => setHovered({ pointIdx: i })}
            onMouseLeave={() => setHovered(null)} />
        ))}
        {/* X labels */}
        {xLabels.map((label, i) => (
          <text key={i} x={toX(i)} y={height - 6} textAnchor="middle" className="text-[9px] fill-content-tertiary">{label}</text>
        ))}
      </svg>
      {/* Tooltip */}
      {hovered && (
        <div role="tooltip" aria-live="polite" className="absolute pointer-events-none bg-surface-secondary border border-border-subtle/20 rounded-control p-3 shadow-lg text-sm z-10"
          style={{ left: `${(hoveredX / W) * 100}%`, top: `${(toYR(line.data[hovered.pointIdx]) / height) * 100}%`, transform: 'translate(-50%, -120%)' }}>
          <p className="text-content-tertiary text-xs mb-1">{xLabels[hovered.pointIdx]}</p>
          <p className="font-medium text-content-primary">
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: bars.color }} />
            {bars.label}: {yLeftFormat(bars.data[hovered.pointIdx])}
          </p>
          <p className="font-medium text-content-primary">
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: line.color }} />
            {line.label}: {yRightFormat(line.data[hovered.pointIdx])}
          </p>
        </div>
      )}
    </div>
  );
}
