import { useState } from 'react';
import { F } from '@/utils/formatters';
import EmptyState from './EmptyState';

/**
 * BowtieChart — Funnel pirâmide invertida (glassmorphism)
 * Largura decresce uniformemente. SVG trapézios + HTML overlay.
 */

const ROW_H = 48;
const ROW_GAP = 0;
const CONNECTOR_H = 32;
const CANVAS_W = 680;
const TOP_PCT = 98;
const SHRINK = 10;

export default function BowtieChart({ stages = [], conversions = [], avgTimes = [], onStageClick }) {
  const [hovered, setHovered] = useState(null);

  if (!stages.length) {
    return <EmptyState message="Sem dados para este período" />;
  }

  const rows = stages.map((_, i) => {
    const wPct = Math.max(22, TOP_PCT - i * SHRINK);
    const nPct = Math.max(22, TOP_PCT - (i + 1) * SHRINK);
    const topW = (wPct / 100) * CANVAS_W;
    const botW = i < stages.length - 1 ? (nPct / 100) * CANVAS_W : topW * 0.88;
    const topX = (CANVAS_W - topW) / 2;
    const botX = (CANVAS_W - botW) / 2;
    const y = i * (ROW_H + ROW_GAP + CONNECTOR_H);
    return { y, topX, topW, botX, botW, wPct };
  });

  const totalH = rows.length ? rows[rows.length - 1].y + ROW_H : 0;

  return (
    <div
      className="rounded-2xl border border-white/[0.06] overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0c111d 0%, #070a12 100%)' }}
    >
      <div className="px-4 py-10 lg:px-8">
        <div className="relative mx-auto" style={{ maxWidth: CANVAS_W, height: totalH }}>

          {/* SVG Layer */}
          <svg
            viewBox={`0 0 ${CANVAS_W} ${totalH}`}
            className="absolute inset-0 w-full h-full"
            aria-hidden="true"
          >
            <defs>
              {stages.map((_, i) => {
                const a1 = 0.32 - i * 0.03;
                const a2 = Math.max(0.06, a1 - 0.14);
                return (
                  <linearGradient key={i} id={`fg${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`rgba(50,130,255,${a1})`} />
                    <stop offset="100%" stopColor={`rgba(40,110,240,${a2})`} />
                  </linearGradient>
                );
              })}
              <linearGradient id="sh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.07)" />
                <stop offset="35%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
              <filter id="gw">
                <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
              </filter>
            </defs>

            {rows.map((r, i) => {
              const pts = `${r.topX},${r.y} ${r.topX + r.topW},${r.y} ${r.botX + r.botW},${r.y + ROW_H} ${r.botX},${r.y + ROW_H}`;
              const isH = hovered === i;
              const bOp = isH ? 0.5 : 0.18 - i * 0.015;
              return (
                <g key={i}>
                  {isH && <polygon points={pts} fill="rgba(50,140,255,0.12)" filter="url(#gw)" />}
                  <polygon points={pts} fill={`url(#fg${i})`} />
                  <polygon points={pts} fill="url(#sh)" />
                  <polygon points={pts} fill="none" stroke={`rgba(80,160,255,${bOp})`} strokeWidth={isH ? 1 : 0.6} />
                </g>
              );
            })}

            {/* Connector lines */}
            {rows.slice(0, -1).map((r, i) => {
              const nextR = rows[i + 1];
              const cx = CANVAS_W / 2;
              const y1 = r.y + ROW_H;
              const y2 = nextR.y;
              return (
                <line key={`cl${i}`} x1={cx} y1={y1 + 4} x2={cx} y2={y2 - 4}
                  stroke="rgba(80,160,255,0.12)" strokeWidth="1" strokeDasharray="3 3" />
              );
            })}
          </svg>

          {/* HTML Layer */}
          {stages.map((stage, i) => {
            const r = rows[i];
            const count = stage.count ?? 0;
            const centerX = CANVAS_W / 2;
            const halfTop = r.topW / 2;

            return (
              <div key={stage.name}>
                {/* Stage row */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onStageClick?.(stage.name)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStageClick?.(stage.name); } }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className="absolute inset-x-0 flex items-center justify-center cursor-pointer"
                  style={{ top: r.y, height: ROW_H }}
                  aria-label={`${stage.name}: ${F.n(count)}`}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">
                      {stage.name}
                    </span>
                    <span className="text-[22px] font-bold text-white tabular-nums leading-none">
                      {F.n(count)}
                    </span>
                  </div>
                </div>

                {/* Connector badge */}
                {i < stages.length - 1 && (
                  <div
                    className="absolute inset-x-0 flex items-center justify-center"
                    style={{ top: r.y + ROW_H + ROW_GAP, height: CONNECTOR_H }}
                  >
                    <div className="flex items-center gap-2 px-3 py-0.5 rounded-full bg-white/[0.03]">
                      {conversions[i] != null && (
                        <span className="text-[10px] font-semibold tabular-nums text-positive/80">
                          {F.p(conversions[i] / 100)}
                        </span>
                      )}
                      {avgTimes?.[i] != null && avgTimes[i] > 0 && (
                        <>
                          <span className="w-px h-2.5 bg-white/10" />
                          <span className="text-[10px] tabular-nums text-white/30">
                            {F.d(avgTimes[i])}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
