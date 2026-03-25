import { useState, useMemo, useCallback, useEffect } from "react";
import { fetchMonthlyMetrics } from "./dataService";
import { supabase } from "./supabaseClient";

const MESES = [
  { key: "jan", label: "Jan" }, { key: "fev", label: "Fev" }, { key: "mar", label: "Mar" },
  { key: "abr", label: "Abr" }, { key: "mai", label: "Mai" }, { key: "jun", label: "Jun" },
  { key: "jul", label: "Jul" }, { key: "ago", label: "Ago" }, { key: "set", label: "Set" },
  { key: "out", label: "Out" }, { key: "nov", label: "Nov" }, { key: "dez", label: "Dez" },
];
const SEMANAS = [
  { key: "s1", label: "S1" }, { key: "s2", label: "S2" }, { key: "s3", label: "S3" },
  { key: "s4", label: "S4" },
];

// The ALL constant is now replaced by the 'data' state within the Dashboard component.

function agr(keys, data) {
  const a = { g: { rec: 0, gAds: 0, mc: 0, pipe: 0, fatP: 0, recP: 0, vendas: 0, tmf: 0 }, n: { imp: 0, cli: 0, vp: 0, ld: 0, mql: 0, sql: 0, rAg: 0, rRe: 0, v: 0 }, f: { gAds: 0 }, dt: { ms: 0, sr: 0, rv: 0, lv: 0 } };
  if (!data) return a;
  keys.forEach(k => { const d = data[k]; if (!d) return; Object.keys(a.g).forEach(f => a.g[f] += (d.g[f] || 0)); Object.keys(a.n).forEach(f => a.n[f] += (d.n[f] || 0)); a.f.gAds += d.f.gAds; Object.keys(a.dt).forEach(f => a.dt[f] += d.dt[f]); });
  const c = keys.length || 1;
  Object.keys(a.dt).forEach(f => a.dt[f] = +(a.dt[f] / c).toFixed(1));
  a.g.roi = a.g.gAds > 0 ? a.g.rec / a.g.gAds : 0;
  a.g.tmf = a.g.vendas > 0 ? a.g.rec / a.g.vendas : 0;
  const nm = a.n;
  a.p = { ctr: nm.imp > 0 ? nm.cli / nm.imp : 0, cr: nm.cli > 0 ? nm.vp / nm.cli : 0, cc: nm.vp > 0 ? nm.ld / nm.vp : 0, qm: nm.ld > 0 ? nm.mql / nm.ld : 0, qs: nm.mql > 0 ? nm.sql / nm.mql : 0, ag: nm.sql > 0 ? nm.rAg / nm.sql : 0, su: nm.rAg > 0 ? nm.rRe / nm.rAg : 0, fc: nm.rRe > 0 ? nm.v / nm.rRe : 0, fs: nm.sql > 0 ? nm.v / nm.sql : 0 };
  a.f.cpL = nm.ld > 0 ? a.f.gAds / nm.ld : 0; a.f.cpM = nm.mql > 0 ? a.f.gAds / nm.mql : 0;
  a.f.cpS = nm.sql > 0 ? a.f.gAds / nm.sql : 0; a.f.cpRA = nm.rAg > 0 ? a.f.gAds / nm.rAg : 0;
  a.f.cpRR = nm.rRe > 0 ? a.f.gAds / nm.rRe : 0; a.f.cpV = nm.v > 0 ? a.f.gAds / nm.v : 0;
  // aggregate perdas from last key
  a.perdas = data[keys[keys.length - 1]]?.perdas || { mql: [], sql: [], proposta: [] };
  return a;
}

const F = {
  n: v => v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
  ri: v => v == null ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
  r2: v => v == null ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  p: v => v == null ? "—" : (v * 100).toFixed(2) + "%",
  x: v => v == null ? "—" : Number(v).toFixed(2) + "x",
  d: v => v == null ? "—" : v + " dias",
};

const res = (o, p) => { const k = p.split("."); let v = o; for (const s of k) v = v?.[s]; return v ?? null; };
function dlt(c, p) { if (c == null || p == null || p === 0) return null; return ((c - p) / Math.abs(p)) * 100; }

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}` : "0,0,0";
}

function hBg(pct, inv, dk, cfg) {
  if (pct == null || Math.abs(pct) < 1) return "transparent";
  const good = inv ? pct < 0 : pct > 0;
  
  const maxPct = cfg?.maxPct || 35;
  const baseOp = cfg?.baseOpacity ?? (dk ? 0.05 : 0.04);
  const rangeOp = cfg?.opacityRange ?? (dk ? 0.12 : 0.1);
  const colorHex = good ? (cfg?.colorGood || "#34C759") : (cfg?.colorBad || "#FF453A");
  
  const i = Math.min(Math.abs(pct) / maxPct, 1);
  const opacity = baseOp + (i * rangeOp);
  return `rgba(${hexToRgb(colorHex)},${opacity})`;
}

function Spark({ path, currentKey, data, year }) {
  if (!data) return null;
  const pts = MESES.map(m => res(data[`${year}-${m.key}`], path)).filter(v => v != null);
  if (pts.length < 3) return null;
  const ci = MESES.findIndex(m => m.key === (currentKey.includes("-") ? currentKey.split("-")[1] : currentKey));
  const mn = Math.min(...pts), mx = Math.max(...pts), range = mx - mn || 1;
  const w = 48, h = 16;
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i / (pts.length - 1)) * w},${h - 1 - ((v - mn) / range) * (h - 2)}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 8, opacity: 0.4 }}>
      <path d={d} fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      {ci >= 0 && ci < pts.length && <circle cx={(ci / (pts.length - 1)) * w} cy={h - 1 - ((pts[ci] - mn) / range) * (h - 2)} r="1.8" fill="var(--color-text-primary)" />}
    </svg>
  );
}

function Arrow({ val, inv }) {
  if (val == null || Math.abs(val) < 0.5) return null;
  const up = val > 0, good = inv ? !up : up;
  return <span style={{ fontSize: 9, fontWeight: 600, marginLeft: 5, color: good ? "#34C759" : "#FF453A" }}>{up ? "↑" : "↓"}{Math.abs(val).toFixed(0)}%</span>;
}

const COLORS = { mkt: "#007AFF", sdr: "#FF9500", closer: "#34C759", fin: "#FF453A", finMkt: "#007AFF", finCom: "#34C759", delta: "#AF52DE", tabela: "#5856D6" };

const SECTIONS = [
  // ─── PRINCIPAL ───
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
  // ─── PREMISSAS (unified) ───
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
  // ─── NÚMEROS (unified) ───
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
  // ─── FINANCEIRO (unified) ───
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
  // ─── DELTAS ───
  { id: "dt", t: "Δ Deltas — Velocidade do funil", c: COLORS.delta, rows: [
    { l: "Tempo médio MQL até SQL", pt: "dt.ms", fmt: F.d, inv: 1 },
    { l: "Tempo médio SQL até reunião agendada", pt: "dt.sr", fmt: F.d, inv: 1 },
    { l: "Tempo médio reunião até venda", pt: "dt.rv", fmt: F.d, inv: 1 },
    { l: "Tempo médio da criação do lead até venda", pt: "dt.lv", fmt: F.d, kpi: 1, inv: 1 },
  ]},
];

const Icons = {
  grid: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  chart: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  zap: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  sidebar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
  logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
};

function LossBar({ pct, color, dk }) {
  return (
    <div style={{ flex: 1, height: 6, borderRadius: 3, background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: color, opacity: 0.7, transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)" }} />
    </div>
  );
}

export default function Dashboard({ session }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState("metricas");

  const [dk] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [mode, setMode] = useState("multi");
  const [year, setYear] = useState("2026");
  const [sM, setSM] = useState("mar");
  const [mM, setMM] = useState(["jan", "fev", "mar"]);
  const [wM, setWM] = useState("mar");
  const [coll, setColl] = useState({});
  const [heat, setHeat] = useState(true);
  const [heatConfig, setHeatConfig] = useState({
    maxPct: 35,
    baseOpacity: 0.05,
    opacityRange: 0.12,
    colorGood: "#34C759",
    colorBad: "#FF453A"
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMonthlyMetrics()
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching metrics:", err);
        setLoading(false);
      });
  }, []);

  const togC = useCallback(id => setColl(p => ({ ...p, [id]: !p[id] })), []);
  const togMM = useCallback(k => setMM(p => p.includes(k) ? (p.length > 1 ? p.filter(m => m !== k) : p) : [...p, k]), []);

  const colKeys = useMemo(() => {
    if (mode === "single") return [`${year}-${sM}`];
    if (mode === "semanas") return SEMANAS.map(s => s.key);
    return [...mM].sort((a, b) => MESES.findIndex(m => m.key === a) - MESES.findIndex(m => m.key === b)).map(m => `${year}-${m}`);
  }, [mode, sM, mM, year]);
  const colLabels = useMemo(() => mode === "semanas" ? SEMANAS.map(s => s.label) : colKeys.map(k => MESES.find(m => m.key === (k.includes("-") ? k.split("-")[1] : k))?.label), [mode, colKeys]);
  const aggKeys = useMemo(() => mode === "semanas" ? [`${year}-${wM}`] : colKeys, [mode, colKeys, wM, year]);
  const aggData = useMemo(() => agr(aggKeys, data), [aggKeys, data]);
  const getCV = useCallback((ck, pt) => {
    if (!data) return null;
    if (mode === "semanas") {
      const curM = `${year}-${wM}`;
      return res(data[curM]?.wk?.[ck], pt);
    }
    return res(data[ck], pt);
  }, [mode, wM, data, year]);
  const prevM = mk => { 
    const isYearKey = mk.includes("-");
    const mkBase = isYearKey ? mk.split("-")[1] : mk;
    const curY = isYearKey ? parseInt(mk.split("-")[0]) : parseInt(year);
    const i = MESES.findIndex(m => m.key === mkBase);
    if (i > 0) return `${curY}-${MESES[i - 1].key}`;
    if (i === 0) return `${curY - 1}-dez`; // Wrap around to previous year
    return null; 
  };

  const kpis = useMemo(() => {
    const lastK = mode === "single" ? sM : (mode === "semanas" ? wM : colKeys[colKeys.length - 1]);
    const pm = prevM(lastK); 
    const cur = data ? data[lastK] : null; 
    const prev = (data && pm) ? data[pm] : null;
    return {
      row1: [
        { l: "R$ Receita gerada", v: F.ri(aggData.g.rec), d: dlt(cur?.g.rec, prev?.g.rec), sub: "Cash collected", ico: "R$" },
        { l: "R$ Gasto em Ads", v: F.ri(aggData.g.gAds), d: dlt(cur?.g.gAds, prev?.g.gAds), inv: 1, sub: "Investimento em mídia", ico: "📢" },
        { l: "ROI", v: F.x(aggData.g.roi), d: dlt(cur?.g.roi, prev?.g.roi), sub: "Receita / Gasto Ads", ico: "×" },
        { l: "R$ Margem de contribuição", v: F.ri(aggData.g.mc), d: dlt(cur?.g.mc, prev?.g.mc), sub: "Tirando imposto, gateway e churn", ico: "%" },
      ],
      row2pipe: {
        l: "R$ Pipeline total", v: F.ri(aggData.g.pipe), d: dlt(cur?.g.pipe, prev?.g.pipe), sub: "Etapa em negociação", ico: "◎",
        children: [
          { l: "Fat. projetado do PIPE em R$", v: F.ri(aggData.g.fatP), d: dlt(cur?.g.fatP, prev?.g.fatP) },
          { l: "Receita projetada com o Pipe", v: F.ri(aggData.g.recP), d: dlt(cur?.g.recP, prev?.g.recP) },
        ],
      },
      row2rest: [
        { l: "Vendas", v: F.n(aggData.n.v), d: dlt(cur?.n.v, prev?.n.v), sub: "Fechamentos do período", ico: "#" },
        { l: "Ticket Médio", v: F.ri(aggData.g.tmf), d: dlt(cur?.g.tmf, prev?.g.tmf), sub: "Ticket médio", ico: "💰" },
      ],
    };
  }, [aggData, mode, sM, wM, colKeys, data]);

  const Pill = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
      padding: "5px 14px", fontSize: 12, borderRadius: 20, cursor: "pointer",
      fontWeight: active ? 600 : 400, border: "none",
      background: active ? "var(--color-text-primary)" : "transparent",
      color: active ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
      transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
    }}>{children}</button>
  );

  const sL = { position: "sticky", left: 0, zIndex: 3, background: "var(--color-background-primary)" };
  const bdr = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const bdrLight = dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const aggBg = dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.018)";

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", fontFamily: "var(--font-sans)", WebkitFontSmoothing: "antialiased", background: "var(--color-background-primary)" }}>
      {/* ═══ Sidebar ═══ */}
      <div style={{ width: sidebarOpen ? 260 : 0, opacity: sidebarOpen ? 1 : 0, overflow: "hidden", display: "flex", flexDirection: "column", background: "#030816", color: "#fff", transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)", borderRight: sidebarOpen ? `1px solid ${bdrLight}` : "none", zIndex: 50, position: "relative" }}>
        <div style={{ padding: "24px", display: "flex", alignItems: "center", gap: 12, minWidth: 260 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #007AFF, #5856D6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-0.03em" }}>Aw</div>
          <div><div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>AwSales</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Dashboard</div></div>
        </div>
        <div style={{ padding: "24px 16px 8px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", minWidth: 260 }}>PAINEIS</div>
        <div style={{ flex: 1, padding: "0 12px", display: "flex", flexDirection: "column", gap: 4, minWidth: 260 }}>
          {[
            { id: "gerencial", label: "Gerencial", icon: Icons.grid },
            { id: "metricas", label: "Métricas", icon: Icons.chart },
            { id: "sprint", label: "Sprint de Otimizações", icon: Icons.zap }
          ].map(item => (
            <div key={item.id} onClick={() => setCurrentView(item.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, cursor: "pointer", background: currentView === item.id ? "rgba(255,255,255,0.1)" : "transparent", color: currentView === item.id ? "#fff" : "rgba(255,255,255,0.7)", fontWeight: currentView === item.id ? 600 : 500, fontSize: 14, transition: "all 0.2s" }}>
              <span style={{ opacity: currentView === item.id ? 1 : 0.7 }}>{item.icon}</span>{item.label}
            </div>
          ))}
        </div>
        <div style={{ padding: "16px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", minWidth: 260 }}>
          <div onClick={() => setCurrentView("config")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, cursor: "pointer", background: currentView === "config" ? "rgba(255,255,255,0.1)" : "transparent", color: currentView === "config" ? "#fff" : "rgba(255,255,255,0.7)", fontWeight: currentView === "config" ? 600 : 500, fontSize: 14, transition: "all 0.2s" }}>
            <span style={{ opacity: currentView === "config" ? 1 : 0.7 }}>{Icons.settings}</span>Configurações
          </div>
          <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 16 }}>v1.0.0</div>
        </div>
      </div>

      {/* ═══ Main Content Area ═══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        
        {/* ═══ Header Global ═══ */}
        <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", borderBottom: `1px solid ${bdrLight}`, background: "var(--color-background-primary)", zIndex: 10 }}>
          <div onClick={() => setSidebarOpen(!sidebarOpen)} style={{ cursor: "pointer", color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = bdrLight} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{Icons.sidebar}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingRight: 16, borderRight: `1px solid ${bdrLight}` }}>
               <div style={{ textAlign: "right" }}>
                 <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-text-tertiary)", letterSpacing: "0.05em" }}>LOGADO COMO</div>
                 <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{session?.user?.email || "usuario@fyntrainc.com"}</div>
               </div>
               <div style={{ width: 32, height: 32, borderRadius: 16, background: "#0D6EFD", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>{session?.user?.email ? session.user.email.substring(0, 2).toUpperCase() : "AW"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div onClick={() => supabase.auth.signOut()} style={{ cursor: "pointer", color: "var(--color-text-primary)", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 18, transition: "background 0.2s" }} title="Sair" onMouseEnter={e => e.currentTarget.style.background = "rgba(255,69,58,0.1)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{Icons.logout}</div>
            </div>
          </div>
        </div>

        {/* ═══ Scrollable Container ═══ */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px", boxSizing: "border-box" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 40 }}>

            {currentView !== "metricas" && currentView !== "config" && (
              <div style={{ textAlign: "center", padding: "100px 0", color: "var(--color-text-tertiary)" }}>
                 <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
                 <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>Em construção</div>
                 <div style={{ fontSize: 13, marginTop: 8 }}>Esta visão estará disponível em breve.</div>
              </div>
            )}

            {(currentView === "metricas" || currentView === "config") && (
              <>
                {/* ═══ Dashboard Topbar ═══ */}
                <div style={{ display: currentView === "metricas" ? "flex" : "none", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>Métricas</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", background: "var(--color-background-secondary)", borderRadius: 20, padding: 2, marginRight: 10 }}>
            {["2025", "2026"].map(y => (
              <Pill key={y} active={year === y} onClick={() => setYear(y)}>{y}</Pill>
            ))}
          </div>
          <div onClick={() => setHeat(!heat)} style={{
            display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none",
            padding: "5px 12px", borderRadius: 20,
            background: heat ? (dk ? "rgba(52,199,89,0.15)" : "rgba(52,199,89,0.1)") : "var(--color-background-secondary)",
            transition: "all 0.2s",
          }}>
            <div style={{ width: 28, height: 16, borderRadius: 8, position: "relative", background: heat ? "#34C759" : "var(--color-border-secondary)", transition: "background 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
              <div style={{ width: 12, height: 12, borderRadius: 6, background: "#fff", position: "absolute", top: 2, left: heat ? 14 : 2, transition: "left 0.25s cubic-bezier(0.4,0,0.2,1)" }} />
            </div>
            <span style={{ fontSize: 11, color: heat ? "#34C759" : "var(--color-text-tertiary)", fontWeight: 500 }}>Heatmap</span>
          </div>
          <div style={{ display: "inline-flex", borderRadius: 20, padding: 2, background: "var(--color-background-secondary)" }}>
            {[{ k: "single", l: "1 Mês" }, { k: "multi", l: "Multi-mês" }, { k: "semanas", l: "Semanas" }].map(m => (
              <button key={m.k} onClick={() => setMode(m.k)} style={{
                padding: "5px 16px", fontSize: 12, borderRadius: 18, border: "none", cursor: "pointer",
                fontWeight: mode === m.k ? 600 : 400,
                background: mode === m.k ? "var(--color-background-primary)" : "transparent",
                color: mode === m.k ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                boxShadow: mode === m.k ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
              }}>{m.l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Month selectors ═══ */}
      {currentView === "metricas" && (
        <div style={{ marginBottom: 18 }}>
          {mode === "single" && <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{MESES.map(m => <Pill key={m.key} active={sM === m.key} onClick={() => setSM(m.key)}>{m.label}</Pill>)}</div>}
          {mode === "multi" && <div><div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6, fontWeight: 500 }}>Clique para alternar meses</div><div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{MESES.map(m => <Pill key={m.key} active={mM.includes(m.key)} onClick={() => togMM(m.key)}>{m.label}</Pill>)}</div></div>}
          {mode === "semanas" && <div><div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6, fontWeight: 500 }}>Semanas do mês selecionado</div><div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{MESES.map(m => <Pill key={m.key} active={wM === m.key} onClick={() => setWM(m.key)}>{m.label}</Pill>)}</div></div>}
        </div>
      )}

      {/* ═══ KPI Cards ou Settings Panel ═══ */}
      {(() => {
        if (currentView === "config") {
          return (
            <div style={{ marginBottom: 24, borderRadius: 16, padding: "24px", background: "var(--color-background-secondary)", border: `1px solid ${bdrLight}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>Configurações do Heatmap</div>
                <button 
                  onClick={() => setHeatConfig({ maxPct: 35, baseOpacity: 0.05, opacityRange: 0.12, colorGood: "#34C759", colorBad: "#FF453A" })} 
                  style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid var(--color-border-secondary)`, background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  Resetar Padrões
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
                
                {/* Max Pct (Sensitivity) */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Sensibilidade (%)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <input type="range" min="2" max="100" value={heatConfig.maxPct} onChange={(e) => setHeatConfig(p => ({ ...p, maxPct: parseInt(e.target.value) }))} style={{ flex: 1, accentColor: "var(--color-text-primary)", cursor: "pointer" }} />
                    <div style={{ fontSize: 14, fontWeight: 600, width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{heatConfig.maxPct}%</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>Variação necessária para a cor atingir opacidade máxima.</div>
                </div>

                {/* Base Opacity */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Opacidade Mínima</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <input type="range" min="0" max="0.5" step="0.01" value={heatConfig.baseOpacity} onChange={(e) => setHeatConfig(p => ({ ...p, baseOpacity: parseFloat(e.target.value) }))} style={{ flex: 1, accentColor: "var(--color-text-primary)", cursor: "pointer" }} />
                    <div style={{ fontSize: 14, fontWeight: 600, width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{(heatConfig.baseOpacity * 100).toFixed(0)}%</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>Intensidade da cor inicial ao atingir variação mínima (1%).</div>
                </div>

                {/* Opacity Range (Max Intensity) */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Opacidade Máxima</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <input type="range" min="0.05" max="1.0" step="0.01" value={(heatConfig.baseOpacity + heatConfig.opacityRange).toFixed(2)} onChange={(e) => setHeatConfig(p => ({ ...p, opacityRange: Math.max(0, parseFloat(e.target.value) - p.baseOpacity) }))} style={{ flex: 1, accentColor: "var(--color-text-primary)", cursor: "pointer" }} />
                    <div style={{ fontSize: 14, fontWeight: 600, width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.min(((heatConfig.baseOpacity + heatConfig.opacityRange)*100), 100).toFixed(0)}%</div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>Intensidade máxima limitante do fundo nas células da tabela.</div>
                </div>

                {/* Colors */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Cores Hexadecimal</label>
                  <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="color" value={heatConfig.colorGood} onChange={(e) => setHeatConfig(p => ({ ...p, colorGood: e.target.value }))} style={{ width: 28, height: 28, padding: 0, border: "none", borderRadius: 6, overflow: "hidden", cursor: "pointer", background: "transparent" }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>Positivo</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="color" value={heatConfig.colorBad} onChange={(e) => setHeatConfig(p => ({ ...p, colorBad: e.target.value }))} style={{ width: 28, height: 28, padding: 0, border: "none", borderRadius: 6, overflow: "hidden", cursor: "pointer", background: "transparent" }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>Negativo</span>
                    </label>
                  </div>
                </div>

                {/* --- SEÇÃO PERÍODO --- */}
                <div style={{ gridColumn: "1 / -1", marginTop: 24, paddingTop: 24, borderTop: `1px solid ${bdrLight}` }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em", marginBottom: 20 }}>Período de Comparação</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
                    
                    {/* Ano e Escala */}
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Ano Analisado</label>
                      <div style={{ display: "inline-flex", background: "var(--color-background-primary)", borderRadius: 20, padding: 4, border: `1px solid ${bdrLight}` }}>
                        {["2025", "2026"].map(y => (
                          <Pill key={y} active={year === y} onClick={() => setYear(y)}>{y}</Pill>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Escala de Comparação</label>
                      <div style={{ display: "inline-flex", background: "var(--color-background-primary)", borderRadius: 20, padding: 4, border: `1px solid ${bdrLight}` }}>
                        {[{ k: "single", l: "1 Mês" }, { k: "multi", l: "Multi-mês" }, { k: "semanas", l: "Semanas" }].map(m => (
                          <button key={m.k} onClick={() => setMode(m.k)} style={{ padding: "5px 16px", fontSize: 12, borderRadius: 18, border: "none", cursor: "pointer", fontWeight: mode === m.k ? 600 : 400, background: mode === m.k ? "var(--color-text-primary)" : "transparent", color: mode === m.k ? "var(--color-background-primary)" : "var(--color-text-tertiary)", transition: "all 0.2s" }}>{m.l}</button>
                        ))}
                      </div>
                    </div>

                    {/* Meses/Semanas Selecionados */}
                    <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {mode === "multi" ? "Selecione os meses para comparar" : (mode === "semanas" ? "Selecione o mês para visualizar as semanas" : "Mês Analisado")}
                      </label>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", background: "var(--color-background-primary)", padding: 8, borderRadius: 16, border: `1px solid ${bdrLight}` }}>
                        {mode === "single" && MESES.map(m => <Pill key={m.key} active={sM === m.key} onClick={() => setSM(m.key)}>{m.label}</Pill>)}
                        {mode === "multi" && MESES.map(m => <Pill key={m.key} active={mM.includes(m.key)} onClick={() => togMM(m.key)}>{m.label}</Pill>)}
                        {mode === "semanas" && MESES.map(m => <Pill key={m.key} active={wM === m.key} onClick={() => setWM(m.key)}>{m.label}</Pill>)}
                      </div>
                    </div>

                  </div>
                </div>

              </div>
              <div style={{ marginTop: 24, fontSize: 13, color: "var(--color-text-tertiary)", fontWeight: 500 }}>
                Abaixo você vê a tabela atualizada em tempo real com as suas novas configurações!
              </div>
            </div>
          );
        }

        const KpiCard = ({ k, style: sx }) => {
          const good = k.inv ? (k.d != null && k.d < 0) : (k.d != null && k.d > 0);
          const bad = k.inv ? (k.d != null && k.d > 5) : (k.d != null && k.d < -5);
          return (
            <div style={{ borderRadius: 16, padding: "16px 16px 14px", position: "relative", overflow: "hidden", background: "var(--color-background-secondary)", display: "flex", flexDirection: "column", justifyContent: "space-between", ...sx }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "16px 16px 0 0", background: k.d == null ? "var(--color-border-tertiary)" : good ? "#34C759" : bad ? "#FF453A" : "var(--color-border-secondary)", opacity: 0.8 }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 500, letterSpacing: "0.02em" }}>{k.l}</div>
                <div style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: "var(--color-text-tertiary)" }}>{k.ico}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{k.v}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{k.sub}</div>
                {k.d != null && Math.abs(k.d) >= 1 && (
                  <div style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: good ? (dk ? "rgba(52,199,89,0.15)" : "rgba(52,199,89,0.1)") : bad ? (dk ? "rgba(255,69,58,0.15)" : "rgba(255,69,58,0.1)") : "transparent", color: good ? "#34C759" : "#FF453A" }}>
                    {k.d > 0 ? "+" : ""}{k.d.toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          );
        };
        const pipe = kpis.row2pipe;
        const pGood = pipe.d != null && pipe.d > 0;
        const pBad = pipe.d != null && pipe.d < -5;
        return (
          <div style={{ marginBottom: 24 }}>
            {/* Row 1: Receita, Gasto Ads, ROI, MC */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 8, alignItems: "stretch" }}>
              {kpis.row1.map((k, i) => <KpiCard key={i} k={k} />)}
            </div>
            {/* Row 2: Pipeline (wide with children) | Vendas | TMF */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, alignItems: "stretch" }}>
              {/* Pipeline card — wider, with sub-items */}
              <div style={{ borderRadius: 16, padding: "16px 16px 14px", position: "relative", overflow: "hidden", background: "var(--color-background-secondary)", display: "flex", flexDirection: "column" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, borderRadius: "16px 16px 0 0", background: pipe.d == null ? "var(--color-border-tertiary)" : pGood ? "#34C759" : pBad ? "#FF453A" : "var(--color-border-secondary)", opacity: 0.8 }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 500, letterSpacing: "0.02em" }}>{pipe.l}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {pipe.d != null && Math.abs(pipe.d) >= 1 && (
                      <div style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: pGood ? (dk ? "rgba(52,199,89,0.15)" : "rgba(52,199,89,0.1)") : pBad ? (dk ? "rgba(255,69,58,0.15)" : "rgba(255,69,58,0.1)") : "transparent", color: pGood ? "#34C759" : "#FF453A" }}>
                        {pipe.d > 0 ? "+" : ""}{pipe.d.toFixed(1)}%
                      </div>
                    )}
                    <div style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: "var(--color-text-tertiary)" }}>{pipe.ico}</div>
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{pipe.v}</div>
                <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4, marginBottom: 10 }}>{pipe.sub}</div>
                {/* Sub-items */}
                <div style={{ display: "flex", gap: 12, borderTop: `0.5px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`, paddingTop: 10, marginTop: "auto" }}>
                  {pipe.children.map((ch, ci) => {
                    const cGood = ch.d != null && ch.d > 0;
                    return (
                      <div key={ci} style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ color: "var(--color-text-tertiary)", fontSize: 9 }}>↳</span> {ch.l}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 5 }}>
                          {ch.v}
                          {ch.d != null && Math.abs(ch.d) >= 1 && (
                            <span style={{ fontSize: 9, fontWeight: 600, color: cGood ? "#34C759" : "#FF453A" }}>
                              {ch.d > 0 ? "↑" : "↓"}{Math.abs(ch.d).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Vendas & TMF */}
              {kpis.row2rest.map((k, i) => <KpiCard key={i} k={k} />)}
            </div>
          </div>
        );
      })()}

      {/* ═══ Main data table ═══ */}
      <div style={{ overflowX: "auto", borderRadius: 14, border: `0.5px solid ${bdr}`, background: "var(--color-background-primary)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...sL, padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `0.5px solid ${bdr}`, minWidth: 220, zIndex: 6 }}>Métrica</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `0.5px solid ${bdr}`, whiteSpace: "nowrap", background: aggBg }}>Agregado</th>
              {colLabels.map((l, i) => <th key={i} style={{ padding: "10px 14px", textAlign: "center", fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `0.5px solid ${bdr}`, whiteSpace: "nowrap" }}>{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map(sec => {
              const closed = coll[sec.id];
              return [
                <tr key={`h-${sec.id}`} onClick={() => togC(sec.id)} style={{ cursor: "pointer", userSelect: "none" }}>
                  <td colSpan={colKeys.length + 2} style={{ padding: "14px 14px 5px", borderBottom: `0.5px solid ${bdrLight}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: sec.c, fontWeight: 700, background: sec.c + (dk ? "22" : "14"), transition: "transform 0.2s cubic-bezier(0.4,0,0.2,1)", transform: closed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: sec.c, letterSpacing: "0.02em" }}>{sec.t}</span>
                    </div>
                  </td>
                </tr>,
                ...(!closed ? (() => {
                  let currentBlock = null;
                  return sec.rows.map((row, ri) => {
                    if (row.blockHeader) {
                      currentBlock = `${sec.id}__${row.blockHeader}`;
                      const blockKey = currentBlock;
                      const subClosed = coll[blockKey];
                      return (
                        <tr key={`bh-${sec.id}-${ri}`} onClick={(e) => { e.stopPropagation(); togC(blockKey); }} style={{ cursor: "pointer", userSelect: "none" }}>
                          <td colSpan={colKeys.length + 2} style={{ padding: "10px 14px 4px 28px", borderBottom: `0.5px solid ${bdrLight}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 8, color: row.blockColor, display: "inline-block", transition: "transform 0.2s cubic-bezier(0.4,0,0.2,1)", transform: subClosed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
                              <div style={{ width: 6, height: 6, borderRadius: 2, background: row.blockColor, opacity: 0.7, flexShrink: 0 }} />
                              <span style={{ fontSize: 10, fontWeight: 600, color: row.blockColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>{row.blockHeader}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    if (currentBlock && coll[currentBlock]) return null;
                    const aggVal = res(aggData, row.pt);
                    const vals = colKeys.map(ck => getCV(ck, row.pt));
                    return (
                      <tr key={`r-${sec.id}-${ri}`}>
                        <td style={{
                          ...sL, padding: `5px 14px 5px ${row.indent ? 42 : 28}px`, fontSize: 13,
                          fontWeight: row.kpi ? 600 : 400, color: "var(--color-text-primary)", letterSpacing: "-0.01em",
                          borderBottom: `0.5px solid ${bdrLight}`,
                          background: row.kpi ? (dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)") : "var(--color-background-primary)",
                        }}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            {row.kpi && <div style={{ width: 3, height: 14, borderRadius: 2, background: sec.c, marginRight: 8, flexShrink: 0, opacity: 0.6 }} />}
                            {row.indent && <span style={{ color: "var(--color-text-tertiary)", marginRight: 4, fontSize: 11 }}>↳</span>}
                            <span>{row.l}</span>
                            {mode === "single" && <Spark path={row.pt} currentKey={sM} data={data} year={year} />}
                          </div>
                          {row.sub && <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 400, marginLeft: row.kpi ? 11 : 0 }}>{row.sub}</div>}
                        </td>
                        <td style={{ padding: "5px 14px", textAlign: "right", fontSize: 13, fontWeight: row.kpi ? 600 : 500, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", letterSpacing: "-0.01em", borderBottom: `0.5px solid ${bdrLight}`, background: aggBg }}>{row.fmt(aggVal)}</td>
                        {vals.map((val, ci) => {
                          let prev = null;
                          if (mode === "multi" && ci > 0) prev = vals[ci - 1];
                          else if (mode === "single") { 
                            const pk = prevM(sM); 
                            if (pk && data) prev = res(data[pk], row.pt); 
                          }
                          const d = dlt(val, prev);
                          const bg = heat ? hBg(d, row.inv, dk, heatConfig) : "transparent";
                          return (
                            <td key={ci} style={{ padding: "5px 14px", textAlign: "right", fontSize: 13, fontWeight: row.kpi ? 500 : 400, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", letterSpacing: "-0.01em", borderBottom: `0.5px solid ${bdrLight}`, background: bg, transition: "background 0.3s cubic-bezier(0.4,0,0.2,1)" }}>
                              {row.fmt(val)}
                              {mode !== "semanas" && <Arrow val={d} inv={row.inv} />}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }).filter(Boolean);
                })() : []),
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* ═══ TABELAS — Motivo de perda por etapa ═══ */}
      <div style={{ marginTop: 24 }}>
        <div onClick={() => togC("tabelas")} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: coll["tabelas"] ? 0 : 14, cursor: "pointer", userSelect: "none" }}>
          <div style={{ width: 18, height: 18, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: COLORS.tabela, fontWeight: 700, background: COLORS.tabela + (dk ? "22" : "14"), transition: "transform 0.2s cubic-bezier(0.4,0,0.2,1)", transform: coll["tabelas"] ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</div>
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.tabela, letterSpacing: "0.02em" }}>Tabelas — Motivo de perda por etapa</span>
        </div>
        {!coll["tabelas"] && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {[
            { key: "mql", label: "Perdas MQL", color: "#007AFF" },
            { key: "sql", label: "Perdas SQL", color: "#FF9500" },
            { key: "proposta", label: "Perdas Proposta Realizada", color: "#FF453A" },
          ].map(etapa => (
            <div key={etapa.key} style={{
              borderRadius: 14, padding: "16px 18px", overflow: "hidden", position: "relative",
              border: `0.5px solid ${bdr}`, background: "var(--color-background-primary)",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: etapa.color, opacity: 0.5, borderRadius: "14px 14px 0 0" }} />
              <div style={{ fontSize: 11, fontWeight: 600, color: etapa.color, marginBottom: 14, letterSpacing: "0.02em" }}>{etapa.label}</div>
              {(aggData.perdas?.[etapa.key] || []).map((item, i) => (
                <div key={i} style={{ marginBottom: i < (aggData.perdas?.[etapa.key]?.length || 0) - 1 ? 10 : 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{item.m}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>{item.p}%</span>
                  </div>
                  <LossBar pct={item.p} color={etapa.color} dk={dk} />
                </div>
              ))}
            </div>
          ))}
        </div>
        )}
      </div>

              </>
            )}

            {/* Footer */}
            <div style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "var(--color-text-tertiary)", borderTop: `0.5px solid ${bdrLight}`, paddingTop: 12 }}>
              <span>Awsales — Painel executivo de marketing e comercial</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>↑↓ variação vs. período anterior</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
