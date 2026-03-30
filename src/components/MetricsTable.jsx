import { useState, useEffect, useMemo } from 'react';
import { useMetrics } from '../contexts/MetricsContext';
import { F, res, dlt } from '../utils/formatters';
import { hBg } from '../utils/helpers';
import Arrow from './Arrow';


const COLORS = { mkt: "#007AFF", sdr: "#FF9500", closer: "#34C759", fin: "#FF453A", finMkt: "#007AFF", finCom: "#34C759", delta: "#AF52DE", tabela: "#5856D6" };
const EASE_APPLE = "300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)";

const SECTIONS = [
  { id: "principal", t: "Principal", c: "#007AFF", rows: [
    { l: "R$ Receita gerada", pt: "g.rec", fmt: F.ri, kpi: 1 },
    { l: "R$ Gasto em Ads", pt: "g.gAds", fmt: F.ri, inv: 1 },
    { l: "ROI", sub: "Receita / Gasto Ads", pt: "g.roi", fmt: F.x, kpi: 1 },
    { l: "R$ Margem de contribuição", pt: "g.mc", fmt: F.ri },
    { l: "R$ Pipeline total", sub: "Etapa em negociação", pt: "g.pipe", fmt: F.ri },
    { l: "Fat. projetado do Pipe em R$", pt: "g.fatP", fmt: F.ri, indent: 1 },
    { l: "Receita projetada com o Pipe", pt: "g.recP", fmt: F.ri, indent: 1 },
    { l: "Vendas", pt: "g.vendas", wk: "v", fmt: F.n, kpi: 1 },
    { l: "Ticket Médio", sub: "Ticket médio", pt: "g.tmf", fmt: F.ri },
  ]},
  { id: "premissas", t: "Premissas", c: "#007AFF", rows: [
    { blockHeader: "Marketing", blockColor: COLORS.mkt },
    { l: "% CTR", pt: "p.ctr", fmt: F.p },
    { l: "% Connect rate", sub: "View Page / Cliques", pt: "p.cr", fmt: F.p },
    { l: "% Conversão pág. captura", sub: "Lead / View Page", pt: "p.cc", fmt: F.p },
    { l: "% Qualified marketing", sub: "MQL / Lead", pt: "p.qm", fmt: F.p },
    { l: "% Qualified sales", sub: "SQL / MQL", pt: "p.qs", fmt: F.p },
    { blockHeader: "SDR", blockColor: COLORS.sdr },
    { l: "% Agendamento", sub: "Reunião Agendada / SQL", pt: "p.ag", fmt: F.p },
    { l: "% Show-up", sub: "Reuniões Realizadas / Reunião Agendadas", pt: "p.su", fmt: F.p },
    { blockHeader: "Closer", blockColor: COLORS.closer },
    { l: "% Fechamentos call", sub: "Venda / Reunião Realizadas", pt: "p.fc", fmt: F.p },
    { l: "% Fechamentos SQL", sub: "Vendas / SQL", pt: "p.fs", fmt: F.p, kpi: 1 },
  ]},
  { id: "numeros", t: "Números", c: "#FF9500", rows: [
    { blockHeader: "Marketing", blockColor: COLORS.mkt },
    { l: "# Impressões", pt: "n.imp", wk: "imp", fmt: F.n },
    { l: "# Cliques saída única", pt: "n.cli", wk: "cli", fmt: F.n },
    { l: "# View page", pt: "n.vp", wk: "vp", fmt: F.n },
    { l: "# Lead", pt: "n.ld", wk: "ld", fmt: F.n },
    { l: "# MQL", pt: "n.mql", wk: "mql", fmt: F.n },
    { l: "# SQL", pt: "n.sql", wk: "sql", fmt: F.n },
    { blockHeader: "SDR / Closer", blockColor: COLORS.sdr },
    { l: "# Reuniões agendadas", pt: "n.rAg", wk: "rAg", fmt: F.n },
    { l: "# Reuniões realizadas", pt: "n.rRe", wk: "rRe", fmt: F.n },
    { l: "# Vendas", pt: "n.v", wk: "v", fmt: F.n, kpi: 1 },
  ]},
  { id: "financeiro", t: "Financeiro", c: "#FF453A", rows: [
    { blockHeader: "Marketing", blockColor: COLORS.mkt },
    { l: "# Gastos em ADS", pt: "f.gAds", fmt: F.ri, kpi: 1, inv: 1 },
    { l: "R$ C.P. Lead", pt: "f.cpL", fmt: F.r2, inv: 1 },
    { l: "R$ C.P. MQL", pt: "f.cpM", fmt: F.r2, inv: 1 },
    { l: "R$ C.P. SQL", pt: "f.cpS", fmt: F.r2, inv: 1 },
    { blockHeader: "Comercial", blockColor: COLORS.closer },
    { l: "R$ C.P. Reunião agendada", pt: "f.cpRA", fmt: F.r2, inv: 1 },
    { l: "R$ C.P. Reunião realizada", pt: "f.cpRR", fmt: F.r2, inv: 1 },
    { l: "R$ C.P. Venda", pt: "f.cpV", fmt: F.r2, kpi: 1, inv: 1 },
  ]},
  { id: "dt", t: "Δ Deltas — Velocidade do funil", c: COLORS.delta, rows: [
    { l: "Tempo médio MQL até SQL", pt: "dt.ms", fmt: F.d, inv: 1 },
    { l: "Tempo médio SQL até reunião agendada", pt: "dt.sr", fmt: F.d, inv: 1 },
    { l: "Tempo médio reunião até venda", pt: "dt.rv", fmt: F.d, inv: 1 },
    { l: "Tempo médio da criação do lead até venda", pt: "dt.lv", fmt: F.d, kpi: 1, inv: 1 },
  ]},
];

/** Story 5-3: detect delta alerts in both directions.
 *  Returns "worsening" (>2x slower), "improving" (<0.5x, much faster), or null. */
function getDeltaAlert(secId, curVal, prevVal) {
  if (secId !== "dt") return null;
  if (curVal == null || prevVal == null || prevVal === 0) return null;
  const ratio = curVal / prevVal;
  if (ratio > 2) return "worsening";
  if (ratio < 0.5) return "improving";
  return null;
}

export default function MetricsTable({ data, aggData, colKeys, colLabels, mode, sM, year, dk, getCV, prevM }) {
  const { coll, toggleColl, heat, heatConfig, heatSections } = useMetrics();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const sL = { position: "sticky", left: 0, zIndex: 3, background: "var(--color-background-primary)" };
  const bdr = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const bdrLight = dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const aggBg = dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.018)";
  const hoverBg = dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)";

  const cellTransition = reducedMotion ? "none" : `background-color ${EASE_APPLE}`;

  // Memoize heatmap backgrounds — Story 5-4 + 7-1 (filtro por seção + suporte semanas)
  const heatBgMap = useMemo(() => {
    if (!heat) return null;
    const map = {};
    SECTIONS.forEach(sec => {
      if (!heatSections[sec.id]) return; // Story 7-1: skip seções desativadas
      sec.rows.forEach((row, ri) => {
        if (row.blockHeader) return;
        const vals = colKeys.map(ck => getCV(ck, row.pt));
        vals.forEach((val, ci) => {
          let prev = null;
          if ((mode === "multi" || mode === "semanas") && ci > 0) prev = vals[ci - 1]; // Story 7-1: semanas compara com semana anterior
          else if (mode === "single") {
            const pk = prevM(sM, year);
            if (pk && data) prev = res(data[pk], row.pt);
          }
          const d = dlt(val, prev);
          map[`${sec.id}-${ri}-${ci}`] = hBg(d, row.inv, dk, heatConfig);
        });
      });
    });
    return map;
  }, [heat, heatConfig, heatSections, dk, colKeys, mode, sM, year, data, getCV, prevM]);

  return (
    <div role="table" style={{ overflowX: "auto", borderRadius: 14, border: `0.5px solid ${bdr}`, background: "var(--color-background-primary)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
        {/* Sticky header — Story 5-1 */}
        <thead style={{
          position: "sticky", top: 0, zIndex: 10,
          background: dk ? "rgba(3,8,22,0.85)" : "rgba(255,255,255,0.85)",
          backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        }}>
          <tr>
            <th scope="col" style={{ ...sL, padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `0.5px solid ${bdr}`, zIndex: 11, background: dk ? "rgba(3,8,22,0.85)" : "rgba(255,255,255,0.85)", backdropFilter: "blur(4px)" }}>Métrica</th>
            <th scope="col" style={{ padding: "10px 14px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `0.5px solid ${bdr}`, whiteSpace: "nowrap", background: aggBg }}>Agregado</th>
            {colLabels.map((l, i) => <th scope="col" key={i} style={{ padding: "10px 14px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `0.5px solid ${bdr}`, whiteSpace: "nowrap" }}>{l}</th>)}
          </tr>
        </thead>

        {SECTIONS.map(sec => {
          const sectionOpen = !coll[sec.id];

          return [
            /* Section header — NOT sticky */
            <tbody key={`sh-${sec.id}`}>
              <tr
                role="button"
                tabIndex={0}
                onClick={() => toggleColl(sec.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleColl(sec.id); } }}
                style={{ cursor: "pointer", userSelect: "none" }}
                aria-expanded={sectionOpen}
                aria-controls={`section-${sec.id}`}
              >
                <td colSpan={colKeys.length + 2} style={{ padding: "14px 14px 5px", borderBottom: `0.5px solid ${bdrLight}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", background: sec.c, flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 9, color: sec.c, fontWeight: 700,
                      display: "inline-block",
                      transition: reducedMotion ? "none" : `transform ${EASE_APPLE}`,
                      transform: sectionOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    }}>▾</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: sec.c, letterSpacing: "0.02em" }}>{sec.t}</span>
                  </div>
                </td>
              </tr>
            </tbody>,

            /* Section content — collapsible */
            <tbody
              key={`sc-${sec.id}`}
              id={`section-${sec.id}`}
              style={reducedMotion
                ? { display: sectionOpen ? "table-row-group" : "none" }
                : {
                    opacity: sectionOpen ? 1 : 0,
                    visibility: sectionOpen ? "visible" : "collapse",
                    transition: sectionOpen
                      ? `opacity ${EASE_APPLE}, visibility 0s 0s`
                      : `opacity ${EASE_APPLE}, visibility 0s 300ms`,
                  }
              }
            >
              {(() => {
                let currentBlock = null;
                return sec.rows.map((row, ri) => {
                  if (row.blockHeader) {
                    currentBlock = `${sec.id}__${row.blockHeader}`;
                    const blockKey = currentBlock;
                    const subOpen = !coll[blockKey];
                    return (
                      <tr key={`bh-${sec.id}-${ri}`} role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); toggleColl(blockKey); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggleColl(blockKey); } }} style={{ cursor: "pointer", userSelect: "none" }} aria-expanded={subOpen} aria-controls={`block-${blockKey}`}>
                        <td colSpan={colKeys.length + 2} style={{ padding: "10px 14px 4px 28px", borderBottom: `0.5px solid ${bdrLight}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{
                              fontSize: 8, color: row.blockColor, display: "inline-block",
                              transition: reducedMotion ? "none" : `transform ${EASE_APPLE}`,
                              transform: subOpen ? "rotate(0deg)" : "rotate(-90deg)",
                            }}>▾</span>
                            <div style={{ width: 6, height: 6, borderRadius: 2, background: row.blockColor, opacity: 0.7, flexShrink: 0 }} />
                            <span style={{ fontSize: 10, fontWeight: 600, color: row.blockColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>{row.blockHeader}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  if (currentBlock && coll[currentBlock]) return null;

                  const rowKey = `r-${sec.id}-${ri}`;
                  const aggVal = res(aggData, row.pt);
                  const vals = colKeys.map(ck => getCV(ck, row.pt));
                  const isHovered = hoveredRow === rowKey;

                  return (
                    <tr
                      key={rowKey}
                      onMouseEnter={() => setHoveredRow(rowKey)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{ transition: cellTransition }}
                    >
                      <td style={{
                        ...sL, padding: `5px 14px 5px ${row.indent ? 42 : 28}px`,
                        fontSize: 14, fontVariantNumeric: "tabular-nums",
                        fontWeight: row.kpi ? 600 : 400, color: "var(--color-text-primary)", letterSpacing: "-0.01em",
                        borderBottom: `0.5px solid ${bdrLight}`,
                        background: isHovered ? hoverBg : (row.kpi ? (dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)") : "var(--color-background-primary)"),
                        transition: cellTransition,
                      }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          {row.kpi && <div style={{ width: 3, height: 14, borderRadius: 2, background: sec.c, marginRight: 8, flexShrink: 0, opacity: 0.6 }} />}
                          {row.indent && <span style={{ color: "var(--color-text-tertiary)", marginRight: 4, fontSize: 11 }}>↳</span>}
                          <span>{row.l}</span>

                        </div>
                        {row.sub && <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 400, marginLeft: row.kpi ? 11 : 0 }}>{row.sub}</div>}
                      </td>
                      <td style={{
                        padding: "5px 14px", textAlign: "right", fontSize: 14, fontVariantNumeric: "tabular-nums",
                        fontWeight: row.kpi ? 600 : 500, color: aggVal == null ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                        whiteSpace: "nowrap", letterSpacing: "-0.01em",
                        borderBottom: `0.5px solid ${bdrLight}`,
                        background: isHovered ? hoverBg : aggBg,
                        transition: cellTransition,
                      }}>
                        <span title={aggVal == null ? "Dado não disponível para este período" : undefined}>{row.fmt(aggVal)}</span>
                      </td>
                      {vals.map((val, ci) => {
                        let prev = null;
                        if ((mode === "multi" || mode === "semanas") && ci > 0) prev = vals[ci - 1];
                        else if (mode === "single") {
                          const pk = prevM(sM, year);
                          if (pk && data) prev = res(data[pk], row.pt);
                        }
                        const d = dlt(val, prev);
                        const heatBg = heatBgMap?.[`${sec.id}-${ri}-${ci}`] || "transparent";

                        // Story 5-3 + 8-1 AC#2: Delta alert governed by heatmap toggle
                        const alertType = (heat && heatSections.dt) ? getDeltaAlert(sec.id, val, prev) : null;
                        const alertBg = alertType === "worsening"
                          ? "color-mix(in srgb, var(--color-negative) 12%, transparent)"
                          : alertType === "improving"
                            ? "color-mix(in srgb, var(--color-positive) 12%, transparent)"
                            : null;

                        const cellBg = isHovered ? hoverBg : (alertBg || heatBg);

                        // Story 5-3 D3: numeric delta variation in days for dt section
                        const deltaVarDays = sec.id === "dt" && val != null && prev != null
                          ? +(val - prev).toFixed(2)
                          : null;

                        return (
                          <td key={ci} style={{
                            padding: "5px 14px", textAlign: "right", fontSize: 14, fontVariantNumeric: "tabular-nums",
                            fontWeight: alertType ? 600 : (row.kpi ? 500 : 400),
                            color: val == null ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                            whiteSpace: "nowrap", letterSpacing: "-0.01em",
                            borderBottom: `0.5px solid ${bdrLight}`,
                            background: cellBg,
                            transition: cellTransition,
                          }}>
                            <span title={val == null ? "Dado não disponível para este período" : undefined}>{row.fmt(val)}</span>
                            {deltaVarDays !== null && deltaVarDays !== 0 && (
                              <span style={{ fontSize: 10, marginLeft: 4, color: deltaVarDays > 0 ? "var(--color-negative)" : "var(--color-positive)", fontWeight: 500 }}>
                                {deltaVarDays > 0 ? `+${deltaVarDays.toFixed(2)}d` : `${deltaVarDays.toFixed(2)}d`}
                              </span>
                            )}
                            <Arrow val={d} inv={row.inv} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                }).filter(Boolean);
              })()}
            </tbody>,
          ];
        })}
      </table>
    </div>
  );
}
