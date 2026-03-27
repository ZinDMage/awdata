import { useMemo } from 'react';
import { useMetrics } from '../contexts/MetricsContext';
import { dlt } from '../utils/formatters';
import { mergeFunnelData, agr, prevM, prevPeriod, prevPeriodLabel } from '../utils/calculations';

const MESES_FULL_PT = {
  jan: "Janeiro", fev: "Fevereiro", mar: "Março",
  abr: "Abril",  mai: "Maio",     jun: "Junho",
  jul: "Julho",  ago: "Agosto",   set: "Setembro",
  out: "Outubro", nov: "Novembro", dez: "Dezembro",
};

/**
 * HealthSummary (UX-DR5) — displays "X/7 KPIs melhoraram vs {mês anterior}"
 * Counts how many of the 7 main KPIs improved compared to the previous period.
 */
export default function HealthSummary() {
  const { rawData, viewMode, selectedFunnels, ALL_FUNNELS, mode, sM, mM, wM, year, MESES } = useMetrics();

  const data = useMemo(() => {
    if (!rawData) return null;
    const source = rawData[viewMode];
    if (!source) return null;
    if (selectedFunnels.length === ALL_FUNNELS.length) return source.all;
    const datasets = selectedFunnels.map(k => source.funnels?.[k]).filter(Boolean);
    if (!datasets.length) return source.all;
    if (datasets.length === 1) return datasets[0];
    return mergeFunnelData(datasets);
  }, [rawData, viewMode, selectedFunnels, ALL_FUNNELS]);

  const { improved, total, compLabel } = useMemo(() => {
    if (!data) return { improved: 0, total: 7, compLabel: "" };

    let curAgg, prevAgg, label;

    if (mode === "multi") {
      const colKeys = [...mM].sort((a, b) =>
        MESES.findIndex(m => m.key === a) - MESES.findIndex(m => m.key === b)
      ).map(m => `${year}-${m}`);
      const prevKeys = prevPeriod(colKeys, year);
      curAgg = agr(colKeys, data);
      prevAgg = agr(prevKeys, data);
      label = prevPeriodLabel(prevKeys, mode);
    } else {
      const lastK = mode === "single" ? `${year}-${sM}` : `${year}-${wM}`;
      const pm = prevM(lastK, year);
      curAgg = data[lastK];
      prevAgg = pm ? data[pm] : null;
      const prevShortKey = pm ? (pm.includes("-") ? pm.split("-")[1] : pm) : null;
      label = prevShortKey ? `vs ${MESES_FULL_PT[prevShortKey] ?? prevShortKey}` : "";
    }

    const kpiDeltas = [
      { d: dlt(curAgg?.g?.rec,   prevAgg?.g?.rec),   inv: false },
      { d: dlt(curAgg?.g?.gAds,  prevAgg?.g?.gAds),  inv: true  },
      { d: dlt(curAgg?.g?.roi,   prevAgg?.g?.roi),   inv: false },
      { d: dlt(curAgg?.g?.mc,    prevAgg?.g?.mc),    inv: false },
      { d: dlt(curAgg?.g?.pipe,  prevAgg?.g?.pipe),  inv: false },
      { d: dlt(curAgg?.g?.vendas,prevAgg?.g?.vendas),inv: false },
      { d: dlt(curAgg?.g?.tmf,   prevAgg?.g?.tmf),   inv: false },
    ];

    const count = kpiDeltas.filter(({ d, inv }) => {
      if (d == null) return false;
      return inv ? d < 0 : d > 0;
    }).length;

    return { improved: count, total: 7, compLabel: label };
  }, [data, mode, sM, mM, wM, year, MESES]);

  const majority = improved >= Math.ceil(total / 2); // >= 4

  if (!data) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span
        style={{
          fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums",
          color: majority ? "#34C759" : "#FF453A",
          transition: "color 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {improved}/{total}
      </span>
      <span
        style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}
      >
        KPIs melhoraram
        {compLabel ? (
          <>
            {" "}
            <span style={{ color: "var(--color-text-secondary)" }}>
              {compLabel}
            </span>
          </>
        ) : null}
      </span>
    </div>
  );
}
