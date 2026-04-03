import { useState, useCallback, useRef, useMemo } from 'react'

// FR107: LineChart SVG puro reutilizavel — zero dependencias externas
// AD-V3 spec: props { series, xLabels, yFormat?, height?, overlay? }

const PADDING = { top: 12, right: 12, bottom: 24, left: 40 }
const TICK_COUNT = 5

function buildYTicks(series, overlay) {
  const allData = [...series, ...(overlay || [])].flatMap(s => s.data)
  const max = Math.max(0, ...allData.filter(Number.isFinite))
  if (max === 0) return { max: 1, ticks: [0] }
  // Nice round ticks
  const step = Math.ceil(max / (TICK_COUNT - 1))
  const niceMax = step * (TICK_COUNT - 1)
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => niceMax - i * step)
  return { max: niceMax, ticks }
}

export default function LineChart({ series, xLabels, yFormat, height = 240, overlay }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const svgRef = useRef(null)

  const dataLen = series[0]?.data?.length || 0

  // Normalizar cada serie independentemente (disparidade de escala) — Dev Notes
  const { max: yMax, ticks: yTicks } = useMemo(
    () => buildYTicks(series, overlay),
    [series, overlay],
  )

  // Pre-compute max per series — avoids O(n²) recalculation in getPoint
  const seriesMaxMap = useMemo(
    () => new Map([...series, ...(overlay || [])].map(s => [
      s.data,
      s.data.reduce((m, v) => Number.isFinite(v) ? Math.max(m, v) : m, 0),
    ])),
    [series, overlay],
  )

  // SVG viewBox dimensions
  const viewW = 600
  const viewH = height
  const plotW = viewW - PADDING.left - PADDING.right
  const plotH = viewH - PADDING.top - PADDING.bottom

  // X position helper — safe for dataLen <= 1 (avoids 0/0 NaN)
  const xForIndex = useCallback(
    (i) => PADDING.left + (dataLen <= 1 ? plotW / 2 : (i / (dataLen - 1)) * plotW),
    [dataLen, plotW],
  )

  // Calcula ponto X,Y para um valor numa serie (normalizada individualmente)
  const getPoint = useCallback(
    (seriesData, i) => {
      const seriesMax = seriesMaxMap.get(seriesData) ?? 0
      if (seriesMax === 0 || dataLen <= 1) {
        return { x: xForIndex(i), y: PADDING.top + plotH }
      }
      return {
        x: xForIndex(i),
        y: PADDING.top + (1 - (Number.isFinite(seriesData[i]) ? seriesData[i] : 0) / seriesMax) * plotH,
      }
    },
    [dataLen, plotH, xForIndex, seriesMaxMap],
  )

  // Gera path d="M...L..." para uma serie
  const buildPath = useCallback(
    (data) => {
      if (!data || data.length === 0) return ''
      return data
        .map((_, i) => {
          const { x, y } = getPoint(data, i)
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(' ')
    },
    [getPoint],
  )

  // Mouse tracking — calcula indice mais proximo
  const handleMouseMove = useCallback(
    (e) => {
      if (!svgRef.current || dataLen === 0) return
      const rect = svgRef.current.getBoundingClientRect()
      const mouseX = ((e.clientX - rect.left) / rect.width) * viewW
      const relX = mouseX - PADDING.left
      const idx = Math.round((relX / plotW) * (dataLen - 1))
      setHoverIdx(Math.max(0, Math.min(dataLen - 1, idx)))
    },
    [dataLen, plotW, viewW],
  )

  const handleMouseLeave = useCallback(() => setHoverIdx(null), [])

  if (!series || series.length === 0 || dataLen === 0) return null

  // X label step — evitar sobreposicao
  const xStep = dataLen <= 10 ? 1 : dataLen <= 20 ? 2 : Math.ceil(dataLen / 10)

  return (
    <div className="relative w-full">
      {/* SVG Chart */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewW} ${viewH}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible"
        role="img"
        aria-label="Grafico de evolucao diaria"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Grid lines horizontais */}
        {yTicks.map((tick, i) => {
          const y = PADDING.top + (1 - tick / yMax) * plotH
          return (
            <line
              key={`grid-${i}`}
              x1={PADDING.left}
              y1={y}
              x2={viewW - PADDING.right}
              y2={y}
              className="stroke-border-subtle"
              strokeOpacity="0.2"
              strokeWidth="1"
            />
          )
        })}

        {/* Y axis labels omitted — per-series normalization makes single Y scale misleading */}

        {/* X axis labels */}
        {xLabels.map((label, i) => {
          if (i % xStep !== 0 && !(i === dataLen - 1 && (dataLen - 1) % xStep >= Math.ceil(xStep / 2))) return null
          const x = xForIndex(i)
          return (
            <text
              key={`x-${i}`}
              x={x}
              y={viewH - 4}
              textAnchor="middle"
              className="fill-content-tertiary text-[10px]"
            >
              {label}
            </text>
          )
        })}

        {/* Overlay series (dashed) */}
        {overlay?.map((s, si) => (
          <path
            key={`overlay-${si}`}
            d={buildPath(s.data)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeDasharray={s.dashed ? '4 4' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Main series */}
        {series.map((s, si) => (
          <path
            key={`series-${si}`}
            d={buildPath(s.data)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Hover: vertical guideline + circles */}
        {hoverIdx != null && (
          <>
            <line
              x1={xForIndex(hoverIdx)}
              y1={PADDING.top}
              x2={xForIndex(hoverIdx)}
              y2={PADDING.top + plotH}
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {series.map((s, si) => {
              const { x, y } = getPoint(s.data, hoverIdx)
              return (
                <circle
                  key={`dot-${si}`}
                  cx={x}
                  cy={y}
                  r="4"
                  fill={s.color}
                  stroke="var(--color-surface-secondary)"
                  strokeWidth="2"
                />
              )
            })}
          </>
        )}
      </svg>

      {/* Tooltip HTML overlay — UX spec */}
      {hoverIdx != null && (
        <div
          className="absolute pointer-events-none z-10 bg-surface-secondary border border-border-subtle/20 rounded-control p-3 shadow-lg text-sm"
          style={{
            left: `${(xForIndex(hoverIdx) / viewW) * 100}%`,
            top: 0,
            transform: (xForIndex(hoverIdx) / viewW) < 0.15 ? 'translateX(0%)' : (xForIndex(hoverIdx) / viewW) > 0.85 ? 'translateX(-100%)' : 'translateX(-50%)',
          }}
        >
          <p className="text-content-primary font-medium mb-1">{xLabels[hoverIdx] ?? '—'}</p>
          {series.map((s, si) => (
            <div key={si} className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-content-secondary">{s.label}:</span>
              <span className="text-content-primary tabular-nums font-medium">
                {s.formatValue ? s.formatValue(s.data[hoverIdx]) : (Number.isFinite(s.data[hoverIdx]) ? s.data[hoverIdx] : '—')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Legenda — AC #1, Task 1.9 (UX spec line 2125-2126) */}
      <div className="flex items-center gap-4 mt-3 text-xs text-content-tertiary">
        {series.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
