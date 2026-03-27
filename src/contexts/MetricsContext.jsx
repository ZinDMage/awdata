import { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { fetchMonthlyMetrics, PIPELINE_FUNNELS } from '@/services/dataService';
import { FUNNEL_LABELS } from '@/config/pipedrive';

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

const FUNNELS = Object.entries(PIPELINE_FUNNELS)
  .filter(([, ids]) => ids.length > 0)
  .map(([key]) => ({ key, label: FUNNEL_LABELS[key] ?? key }));
const ALL_FUNNELS = FUNNELS.map(f => f.key);

function getInitialMonth() {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  // UX-DR21: fallback to previous month if < 5 business days
  if (day <= 7) {
    const prev = month === 0 ? 11 : month - 1;
    return MESES[prev].key;
  }
  return MESES[month].key;
}

function getInitialYear() {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  if (day <= 7 && month === 0) return String(now.getFullYear() - 1);
  return String(now.getFullYear());
}

const HEAT_SECTIONS_DEFAULT = { principal: false, premissas: true, numeros: false, financeiro: true, dt: false };

const MetricsContext = createContext(null);

export function MetricsProvider({ children }) {
  // ── Raw data from Supabase ──
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetchTimestamp, setFetchTimestamp] = useState(null);
  const [partialData, setPartialData] = useState(false);

  // ── Safe storage access (Safari private browsing guard) ──
  const safeGet = (storage, key, fallback) => {
    try { if (typeof window !== 'undefined') return storage.getItem(key) || fallback; } catch { /* ignore */ }
    return fallback;
  };
  const safeSet = (storage, key, val) => {
    try { if (typeof window !== 'undefined') storage.setItem(key, val); } catch { /* ignore */ }
  };

  // ── View mode (UX-DR21: persisted in localStorage) ──
  const [viewMode, setViewMode] = useState(() => safeGet(localStorage, 'awdata-viewMode', 'performance'));

  // ── Temporal controls (UX-DR21: persisted in sessionStorage) ──
  const [year, setYear] = useState(() => safeGet(sessionStorage, 'awdata-year', getInitialYear()));
  // Patch #9: validate mode against allowlist
  const VALID_MODES = ['single', 'multi', 'semanas'];
  const [mode, setMode] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-mode', 'multi');
    return VALID_MODES.includes(stored) ? stored : 'multi';
  });
  const initMonth = getInitialMonth();
  // Patch #10: validate sM against MESES keys
  const [sM, setSM] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-sM', initMonth);
    return MESES.some(m => m.key === stored) ? stored : initMonth;
  });
  // Patch #8: validate mM as array with valid keys
  const [mM, setMM] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-mM', null);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(k => MESES.some(m => m.key === k))) return parsed;
      } catch { /* fallback */ }
    }
    const idx = MESES.findIndex(m => m.key === initMonth);
    const start = Math.max(0, idx - 2);
    return MESES.slice(start, idx + 1).map(m => m.key);
  });
  // Patch #10: validate wM against MESES keys
  const [wM, setWM] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-wM', initMonth);
    return MESES.some(m => m.key === stored) ? stored : initMonth;
  });
  // Decision #1: selectedWeeks state for week pill selection
  const [sW, setSW] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-sW', null);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(k => SEMANAS.some(s => s.key === k))) return parsed;
      } catch { /* fallback */ }
    }
    return SEMANAS.map(s => s.key);
  });

  // ── UI state — Story 8.1 AC#8: persisted selectedFunnels (session) + heat (local) ──
  const [selectedFunnels, setSelectedFunnels] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-funnels', null);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(k => ALL_FUNNELS.includes(k))) return parsed;
      } catch { /* fallback */ }
    }
    return ALL_FUNNELS;
  });
  const [heat, setHeat] = useState(() => safeGet(localStorage, 'awdata-heat', 'true') === 'true');
  const [heatConfig, setHeatConfig] = useState({
    maxPct: 35,
    baseOpacity: 0.05,
    opacityRange: 0.17,
    colorGood: "#34C759",
    colorBad: "#FF453A"
  });
  const [heatSections, setHeatSections] = useState(HEAT_SECTIONS_DEFAULT);
  const [coll, setColl] = useState({ premissas: true, numeros: true, financeiro: true, dt: true, tabelas: false });

  // ── Persist viewMode + heat to localStorage ──
  useEffect(() => { safeSet(localStorage, 'awdata-viewMode', viewMode); }, [viewMode]);
  useEffect(() => { safeSet(localStorage, 'awdata-heat', String(heat)); }, [heat]);

  // ── Persist temporal controls to sessionStorage ──
  useEffect(() => { safeSet(sessionStorage, 'awdata-year', year); }, [year]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-mode', mode); }, [mode]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-sM', sM); }, [sM]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-mM', JSON.stringify(mM)); }, [mM]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-wM', wM); }, [wM]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-sW', JSON.stringify(sW)); }, [sW]);
  // Story 8.1 AC#8: persist selectedFunnels to sessionStorage
  useEffect(() => { safeSet(sessionStorage, 'awdata-funnels', JSON.stringify(selectedFunnels)); }, [selectedFunnels]);

  // ── Fetch data on mount ──
  useEffect(() => {
    fetchMonthlyMetrics()
      .then(res => {
        setRawData(res);
        setFetchTimestamp(new Date());
        setPartialData(!!res._partialData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching metrics:", err);
        setError(err);
        setLoading(false);
      });
  }, []);

  // ── Retry fetch ──
  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setPartialData(false);
    fetchMonthlyMetrics()
      .then(res => { setRawData(res); setFetchTimestamp(new Date()); setPartialData(!!res._partialData); setLoading(false); })
      .catch(err => { console.error("Error fetching metrics:", err); setError(err); setPartialData(false); setLoading(false); });
  }, []);

  // ── Callbacks ──
  const toggleFunnel = useCallback(k =>
    setSelectedFunnels(p =>
      p.includes(k) ? (p.length > 1 ? p.filter(f => f !== k) : p) : [...p, k]
    ), []);

  const toggleColl = useCallback(id =>
    setColl(p => ({ ...p, [id]: !p[id] })), []);

  const toggleMultiMonth = useCallback(k =>
    setMM(p => p.includes(k) ? (p.length > 1 ? p.filter(m => m !== k) : p) : [...p, k]), []);

  const toggleHeatSection = useCallback(id =>
    setHeatSections(p => ({ ...p, [id]: !p[id] })), []);

  const toggleWeek = useCallback(k =>
    setSW(p => p.includes(k) ? (p.length > 1 ? p.filter(w => w !== k) : p) : [...p, k]), []);

  const value = useMemo(() => ({
    // Data
    rawData,
    loading,
    error,
    retry,
    fetchTimestamp,
    partialData,
    // View mode
    viewMode, setViewMode,
    // Temporal
    year, setYear,
    mode, setMode,
    sM, setSM,
    mM, setMM,
    wM, setWM,
    sW, setSW, toggleWeek,
    // Funnels
    selectedFunnels, setSelectedFunnels, toggleFunnel,
    // Heatmap
    heat, setHeat,
    heatConfig, setHeatConfig,
    heatSections, setHeatSections, toggleHeatSection, HEAT_SECTIONS_DEFAULT,
    // Collapse
    coll, toggleColl,
    // Helpers
    toggleMultiMonth,
    // Constants
    MESES, SEMANAS, FUNNELS, ALL_FUNNELS, PIPELINE_FUNNELS,
  }), [rawData, loading, error, retry, fetchTimestamp, partialData, viewMode, year, mode, sM, mM, wM, sW, selectedFunnels, heat, heatConfig, heatSections, coll,
       toggleFunnel, toggleColl, toggleMultiMonth, toggleWeek, toggleHeatSection]);

  return (
    <MetricsContext.Provider value={value}>
      {children}
    </MetricsContext.Provider>
  );
}

export function useMetrics() {
  const ctx = useContext(MetricsContext);
  if (!ctx) throw new Error('useMetrics must be used within MetricsProvider');
  return ctx;
}

export { MESES, SEMANAS, FUNNELS, ALL_FUNNELS };
