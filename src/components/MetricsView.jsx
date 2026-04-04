import { useMemo, useCallback } from 'react';
import { useMetrics } from '../contexts/MetricsContext';
import { F, res, dlt } from '../utils/formatters';
import { mergeFunnelData, agr, prevM, prevPeriod, prevPeriodLabel } from '../utils/calculations';
import MetricsNavBar from './MetricsNavBar';
import KpiCards from './KpiCards';
import MetricsTable from './MetricsTable';
import LossCharts from './LossCharts';

export default function MetricsView({ dk }) {
  const { rawData, viewMode, selectedFunnels, ALL_FUNNELS, mode, sM, mM, wM, sW, year, years, MESES, SEMANAS } = useMetrics();

  const data = useMemo(() => {
    if (!rawData) return null;
    const source = rawData[viewMode];
    if (!source) return null;
    if (selectedFunnels.length === ALL_FUNNELS.length) return source.all;
    const datasets = selectedFunnels.map(k => source.funnels?.[k]).filter(Boolean);
    if (!datasets.length) return source.all;
    if (datasets.length === 1) return datasets[0];
    return mergeFunnelData(datasets);
  }, [rawData, selectedFunnels, viewMode, ALL_FUNNELS]);

  const isMultiYear = years.length > 1;
  const colKeys = useMemo(() => {
    if (mode === "single") return [sM.includes('-') ? sM : `${year}-${sM}`];
    if (mode === "semanas") return SEMANAS.filter(s => sW.includes(s.key)).map(s => s.key);
    // Normalize: ensure all keys are composite "year-month" format
    const normalized = mM.map(m => m.includes('-') ? m : `${year}-${m}`);
    // Sort chronologically: by year first, then by month index
    return [...normalized].sort((a, b) => {
      const [yA, mA] = a.split('-');
      const [yB, mB] = b.split('-');
      if (yA !== yB) return yA.localeCompare(yB);
      return MESES.findIndex(m => m.key === mA) - MESES.findIndex(m => m.key === mB);
    });
  }, [mode, sM, mM, sW, year, MESES, SEMANAS]);

  const colLabels = useMemo(() => {
    if (mode === "semanas") return SEMANAS.filter(s => sW.includes(s.key)).map(s => s.label);
    return colKeys.map(k => {
      // colKeys are always "year-month" format after normalization
      const [yr, monthKey] = k.split('-');
      const monthLabel = MESES.find(m => m.key === monthKey)?.label || monthKey;
      return isMultiYear ? monthLabel + '/' + yr.slice(-2) : monthLabel;
    });
  }, [mode, colKeys, sW, MESES, SEMANAS, isMultiYear]);

  const aggKeys = useMemo(() => {
    if (mode === "semanas") {
      // wM may be composite "2026-abr" in multi-year or plain "abr" in single-year
      return [wM.includes('-') ? wM : `${year}-${wM}`];
    }
    return colKeys;
  }, [mode, colKeys, wM, year]);
  const aggData = useMemo(() => agr(aggKeys, data), [aggKeys, data]);

  const getCV = useCallback((ck, pt) => {
    if (!data) return null;
    if (mode === "semanas") {
      const curM = wM.includes('-') ? wM : `${year}-${wM}`;
      return res(data[curM]?.wk?.[ck], pt);
    }
    return res(data[ck], pt);
  }, [mode, wM, data, year]);

  const kpis = useMemo(() => {
    let curAgg, prevAgg, compLabel;
    if (mode === "multi") {
      const prevKeys = prevPeriod(colKeys, year);
      curAgg = aggData;
      prevAgg = agr(prevKeys, data);
      compLabel = prevPeriodLabel(prevKeys, mode);
    } else {
      const lastK = mode === "single" ? (sM.includes('-') ? sM : `${year}-${sM}`) : (wM.includes('-') ? wM : `${year}-${wM}`);
      const pm = prevM(lastK, year);
      curAgg = data ? data[lastK] : null;
      prevAgg = (data && pm) ? data[pm] : null;
      compLabel = mode === "semanas" ? "vs mês anterior" : prevPeriodLabel(pm ? [pm] : [], mode);
    }
    const d = (field) => dlt(curAgg?.g?.[field], prevAgg?.g?.[field]);
    const pv = (field) => prevAgg?.g?.[field] ?? null; // Story 8.1 AC#4: previous raw value
    return {
      compLabel,
      row1: [
        { l: "R$ Receita gerada", v: F.ri(aggData.g.rec), d: d("rec"), prevVal: pv("rec"), fmt: F.ri, sub: "Cash collected", ico: "R$" },
        { l: "R$ Gasto em Ads", v: F.ri(aggData.g.gAds), d: d("gAds"), inv: 1, prevVal: pv("gAds"), fmt: F.ri, sub: "Investimento em mídia", ico: "📢" },
        { l: "ROI", v: F.x(aggData.g.roi), d: d("roi"), prevVal: pv("roi"), fmt: F.x, sub: "Receita / Gasto Ads", ico: "×" },
        { l: "R$ Margem de contribuição", v: F.ri(aggData.g.mc), d: d("mc"), prevVal: pv("mc"), fmt: F.ri, sub: "Tirando imposto, gateway e churn", ico: "%" },
      ],
      row2pipe: {
        l: "R$ Pipeline total", v: F.ri(aggData.g.pipe), d: d("pipe"), prevVal: pv("pipe"), fmt: F.ri, sub: "Etapa em negociação", ico: "◎",
        children: [
          { l: "Fat. projetado do PIPE em R$", v: F.ri(aggData.g.fatP), d: d("fatP") },
          { l: "Receita projetada com o Pipe", v: F.ri(aggData.g.recP), d: d("recP") },
        ],
      },
      row2rest: [
        { l: "Vendas", v: F.n(aggData.g.vendas), d: d("vendas"), prevVal: pv("vendas"), fmt: F.n, sub: "Fechamentos do período", ico: "#" },
        { l: "Ticket Médio", v: F.ri(aggData.g.tmf), d: d("tmf"), prevVal: pv("tmf"), fmt: F.ri, sub: "Ticket médio", ico: "💰" },
      ],
    };
  }, [aggData, mode, sM, wM, colKeys, data, year]);

  return (
    <>
      <MetricsNavBar dk={dk} />
      <KpiCards kpis={kpis} dk={dk} compLabel={kpis.compLabel} />
      <MetricsTable
        data={data}
        aggData={aggData}
        colKeys={colKeys}
        colLabels={colLabels}
        mode={mode}
        sM={sM}
        year={year}
        dk={dk}
        getCV={getCV}
        prevM={prevM}
      />
      <LossCharts aggData={aggData} dk={dk} />
    </>
  );
}
