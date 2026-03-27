/**
 * Data aggregation and merge utilities.
 * Used by MetricsView to compute derived data from raw metrics.
 */

const MESES_KEYS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function mergeMonthSlice(contrib, getSlice) {
  const calcP = (num, den) => den > 0 ? num / den : 0;
  const m = {
    g: { rec: 0, gAds: 0, roi: 0, mc: 0, pipe: 0, fatP: 0, recP: 0, vendas: 0, tmf: 0 },
    n: { imp: 0, cli: 0, vp: 0, ld: 0, mql: 0, sql: 0, rAg: 0, rRe: 0, v: 0 },
    p: {}, f: { gAds: 0, cpL: 0, cpM: 0, cpS: 0, cpRA: 0, cpRR: 0, cpV: 0 },
    dt: { ms: 0, sr: 0, rv: 0, lv: 0 },
    perdas: { mql: [], sql: [], proposta: [] },
    _churnTemp: 0, wk: {}
  };
  const dtCounts = { ms: 0, sr: 0, rv: 0, lv: 0 };
  contrib.forEach(ds => {
    const d = getSlice(ds);
    if (!d) return;
    ['rec', 'gAds', 'pipe', 'vendas'].forEach(k => m.g[k] += d.g?.[k] || 0);
    Object.keys(m.n).forEach(k => m.n[k] += d.n?.[k] || 0);
    m._churnTemp += d._churnTemp || 0;
    ['ms', 'sr', 'rv', 'lv'].forEach(k => { if (d.dt?.[k] > 0) { m.dt[k] += d.dt[k]; dtCounts[k]++; } });
    ['mql', 'sql', 'proposta'].forEach(stage => {
      if (d.perdas?.[stage]?.length) m.perdas[stage].push(...d.perdas[stage]);
    });
  });
  ['ms', 'sr', 'rv', 'lv'].forEach(k => { m.dt[k] = dtCounts[k] > 0 ? Math.round(m.dt[k] / dtCounts[k]) : 0; });
  m.g.roi = calcP(m.g.rec, m.g.gAds);
  m.g.mc = m.g.rec - (m.g.rec * 0.095) - m._churnTemp;
  m.g.fatP = m.g.pipe * 0.2; m.g.recP = m.g.rec + m.g.fatP;
  m.g.tmf = calcP(m.g.rec, m.g.vendas); m.f.gAds = m.g.gAds;
  m.p = {
    ctr: calcP(m.n.cli, m.n.imp), cr: calcP(m.n.vp, m.n.cli), cc: calcP(m.n.ld, m.n.vp),
    qm: calcP(m.n.mql, m.n.ld), qs: calcP(m.n.sql, m.n.mql),
    ag: calcP(m.n.rAg, m.n.sql), su: calcP(m.n.rRe, m.n.rAg),
    fc: calcP(m.n.v, m.n.rRe), fs: calcP(m.n.v, m.n.sql)
  };
  m.f.cpL = calcP(m.f.gAds, m.n.ld); m.f.cpM = calcP(m.f.gAds, m.n.mql);
  m.f.cpS = calcP(m.f.gAds, m.n.sql); m.f.cpRA = calcP(m.f.gAds, m.n.rAg);
  m.f.cpRR = calcP(m.f.gAds, m.n.rRe); m.f.cpV = calcP(m.f.gAds, m.n.v);
  return m;
}

export function mergeFunnelData(datasets) {
  const allKeys = [...new Set(datasets.flatMap(ds => Object.keys(ds)))];
  const merged = {};
  allKeys.forEach(mk => {
    const contrib = datasets.filter(ds => ds[mk]);
    if (!contrib.length) return;
    const m = mergeMonthSlice(contrib, ds => ds[mk]);
    ['s1', 's2', 's3', 's4'].forEach(wk => {
      m.wk[wk] = mergeMonthSlice(contrib, ds => ds[mk]?.wk?.[wk]);
    });
    merged[mk] = m;
  });
  return merged;
}

/** Aggregate multiple month keys into a single metrics object */
export function agr(keys, data) {
  const a = { g: { rec: 0, gAds: 0, mc: 0, pipe: 0, fatP: 0, recP: 0, vendas: 0, tmf: 0 }, n: { imp: 0, cli: 0, vp: 0, ld: 0, mql: 0, sql: 0, rAg: 0, rRe: 0, v: 0 }, f: { gAds: 0 }, dt: { ms: 0, sr: 0, rv: 0, lv: 0 }, perdas: { mql: [], sql: [], proposta: [] }, _churnTemp: 0 };
  if (!data) return a;
  let validKeyCount = 0;
  keys.forEach(k => { const d = data[k]; if (!d) return; validKeyCount++; Object.keys(a.g).forEach(f => a.g[f] += (d.g[f] || 0)); Object.keys(a.n).forEach(f => a.n[f] += (d.n[f] || 0)); a.f.gAds += (d.f?.gAds || 0); Object.keys(a.dt).forEach(f => a.dt[f] += (d.dt?.[f] || 0)); a._churnTemp += (d._churnTemp || 0); });
  const c = validKeyCount || 1;
  Object.keys(a.dt).forEach(f => a.dt[f] = +(a.dt[f] / c).toFixed(1));
  a.g.roi = a.g.gAds > 0 ? a.g.rec / a.g.gAds : 0;
  a.g.mc = a.g.rec - (a.g.rec * 0.095) - a._churnTemp;
  a.g.fatP = a.g.pipe * 0.2; a.g.recP = a.g.rec + a.g.fatP;
  a.g.tmf = a.g.vendas > 0 ? a.g.rec / a.g.vendas : 0;
  const nm = a.n;
  const calcP = (num, den) => den > 0 ? num / den : (num === 0 ? null : 0);
  a.p = { ctr: calcP(nm.cli, nm.imp), cr: calcP(nm.vp, nm.cli), cc: calcP(nm.ld, nm.vp), qm: calcP(nm.mql, nm.ld), qs: calcP(nm.sql, nm.mql), ag: calcP(nm.rAg, nm.sql), su: calcP(nm.rRe, nm.rAg), fc: calcP(nm.v, nm.rRe), fs: calcP(nm.v, nm.sql) };
  a.f.cpL = calcP(a.f.gAds, nm.ld); a.f.cpM = calcP(a.f.gAds, nm.mql);
  a.f.cpS = calcP(a.f.gAds, nm.sql); a.f.cpRA = calcP(a.f.gAds, nm.rAg);
  a.f.cpRR = calcP(a.f.gAds, nm.rRe); a.f.cpV = calcP(a.f.gAds, nm.v);
  // Aggregate perdas from all selected months (not just last)
  const mergedPerdas = { mql: [], sql: [], proposta: [] };
  keys.forEach(k => {
    const d = data[k];
    if (!d?.perdas) return;
    ['mql', 'sql', 'proposta'].forEach(stage => {
      if (d.perdas[stage]?.length) mergedPerdas[stage].push(...d.perdas[stage]);
    });
  });
  const resumePerdas = (items) => {
    if (!items.length) return [];
    const counts = {};
    let total = 0;
    items.forEach(({ m, c: rawC, p }) => { const w = rawC ?? p; counts[m] = (counts[m] || 0) + w; total += w; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([m, sum]) => ({ m, p: total > 0 ? Math.round(sum * 100 / total) : 0 }));
  };
  a.perdas = {
    mql: resumePerdas(mergedPerdas.mql),
    sql: resumePerdas(mergedPerdas.sql),
    proposta: resumePerdas(mergedPerdas.proposta),
  };
  return a;
}

/** Get previous month key: "2026-mar" → "2026-fev" */
export function prevM(mk, year) {
  const isYearKey = mk.includes("-");
  const mkBase = isYearKey ? mk.split("-")[1] : mk;
  const curY = isYearKey ? parseInt(mk.split("-")[0]) : parseInt(year);
  const i = MESES_KEYS.findIndex(m => m === mkBase);
  if (i > 0) return `${curY}-${MESES_KEYS[i - 1]}`;
  if (i === 0) return `${curY - 1}-dez`;
  return null;
}

/** Get N contiguous months before the first month in colKeys (mirrors the selection window) */
export function prevPeriod(colKeys, year) {
  if (!colKeys || colKeys.length === 0) return [];
  const n = colKeys.length;
  const firstKey = colKeys[0];
  const isYearKey = firstKey.includes("-");
  const firstMonth = isYearKey ? firstKey.split("-")[1] : firstKey;
  const firstYear = isYearKey ? parseInt(firstKey.split("-")[0]) : parseInt(year);
  const firstIdx = MESES_KEYS.findIndex(m => m === firstMonth);
  if (firstIdx === -1) return [];
  const result = [];
  for (let i = n; i >= 1; i--) {
    const targetIdx = firstIdx - i;
    if (targetIdx >= 0) {
      result.push(`${firstYear}-${MESES_KEYS[targetIdx]}`);
    } else {
      result.push(`${firstYear - 1}-${MESES_KEYS[12 + targetIdx]}`);
    }
  }
  return result;
}

/** Contextual label for period comparison */
export function prevPeriodLabel(prevKeys, mode) {
  if (mode === "semanas") return "vs mês anterior";
  if (!prevKeys || prevKeys.length === 0) return "";
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  if (prevKeys.length === 1) {
    const month = prevKeys[0].includes("-") ? prevKeys[0].split("-")[1] : prevKeys[0];
    return `vs ${cap(month)}`;
  }
  const first = prevKeys[0];
  const last = prevKeys[prevKeys.length - 1];
  const firstMonth = first.includes("-") ? first.split("-")[1] : first;
  const lastMonth = last.includes("-") ? last.split("-")[1] : last;
  const firstYear = first.includes("-") ? first.split("-")[0] : "";
  return `vs ${cap(firstMonth)}-${cap(lastMonth)} '${firstYear.slice(-2)}`;
}
