import { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { fetchMonthlyMetrics, PIPELINE_FUNNELS } from '@/services/dataService';
import { FUNNEL_LABELS } from '@/config/pipedrive';
import { SOURCE_OPTIONS } from '@/config/sourceMapping';
import { getInitialYear } from '@/utils/helpers';

const VALID_SOURCE_IDS = SOURCE_OPTIONS.map(o => o.id);

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


const HEAT_SECTIONS_DEFAULT = { principal: false, premissas: true, numeros: false, financeiro: true, dt: false };

const MetricsContext = createContext(null);

export function MetricsProvider({ children }) {
  // ── Raw data from Supabase ──
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetchTimestamp, setFetchTimestamp] = useState(null);
  const [partialData, setPartialData] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false); // AD-V3-2: distinguishes mount vs re-fetch
  const isInitialMount = useRef(true);

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
  // V3: years[] replaces year — multi-year support (AD-V3-2)
  const [years, setYearsRaw] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-years', null);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(y => /^\d{4}$/.test(y))) return parsed;
      } catch { /* fallback */ }
    }
    // Migration path: read legacy key
    const legacyYear = safeGet(sessionStorage, 'awdata-year', null);
    if (legacyYear && /^\d{4}$/.test(legacyYear)) {
      try { sessionStorage.removeItem('awdata-year'); } catch { /* ignore */ }
      return [legacyYear];
    }
    return [getInitialYear()];
  });
  // Adapter: derived year for legacy V1/V2 code
  const year = useMemo(() => years[0], [years]);
  // Stable callbacks
  const setYears = useCallback(arr => setYearsRaw([...arr].sort().reverse()), []);
  const setYear = useCallback(y => setYearsRaw([y]), []);
  const toggleYear = useCallback(y =>
    setYearsRaw(p => {
      const next = p.includes(y) ? (p.length > 1 ? p.filter(v => v !== y) : p) : [...p, y];
      return next.sort().reverse();
    }), []);
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

  // ── V3: Source filter (AD-V3-2) ──
  const [sourceFilter, setSourceFilterRaw] = useState(() => {
    const stored = safeGet(sessionStorage, 'awdata-source', null);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(id => VALID_SOURCE_IDS.includes(id))) return parsed;
      } catch { /* fallback */ }
    }
    return ['todos'];
  });
  const setSourceFilter = useCallback(arr => {
    if (arr.includes('todos')) return setSourceFilterRaw(['todos']);
    const specific = VALID_SOURCE_IDS.filter(x => x !== 'todos');
    if (specific.every(s => arr.includes(s))) return setSourceFilterRaw(['todos']);
    setSourceFilterRaw([...arr]);
  }, []);
  const toggleSource = useCallback(id => {
    setSourceFilterRaw(prev => {
      if (id === 'todos') return ['todos'];
      if (prev.includes('todos')) return [id];
      if (prev.includes(id)) {
        const next = prev.filter(s => s !== id);
        return next.length === 0 ? ['todos'] : next;
      }
      const next = [...prev, id];
      // Auto-collapse: all specific sources selected → 'todos'
      const specificIds = VALID_SOURCE_IDS.filter(x => x !== 'todos');
      if (specificIds.every(s => next.includes(s))) return ['todos'];
      return next;
    });
  }, []);

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
  useEffect(() => { safeSet(sessionStorage, 'awdata-years', JSON.stringify(years)); }, [years]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-mode', mode); }, [mode]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-sM', sM); }, [sM]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-mM', JSON.stringify(mM)); }, [mM]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-wM', wM); }, [wM]);
  useEffect(() => { safeSet(sessionStorage, 'awdata-sW', JSON.stringify(sW)); }, [sW]);
  // Story 8.1 AC#8: persist selectedFunnels to sessionStorage
  useEffect(() => { safeSet(sessionStorage, 'awdata-funnels', JSON.stringify(selectedFunnels)); }, [selectedFunnels]);
  // V3: persist sourceFilter
  useEffect(() => { safeSet(sessionStorage, 'awdata-source', JSON.stringify(sourceFilter)); }, [sourceFilter]);

  // ── Migrate temporal keys when multi-year changes ──
  // mM/sM/wM use plain keys ("abr") in single-year but composite ("2026-abr") in multi-year.
  // When toggling years, migrate to avoid stale keys that don't match pills.
  const isMultiYear = years.length > 1;
  useEffect(() => {
    if (isMultiYear) {
      // Single→Multi: convert plain keys to composite using current primary year
      const yr = years[0]; // most recent year (sorted reverse)
      setMM(prev => {
        if (prev.length > 0 && !prev[0].includes('-')) {
          return prev.map(m => `${yr}-${m}`);
        }
        return prev;
      });
      setSM(prev => prev.includes('-') ? prev : `${yr}-${prev}`);
      setWM(prev => prev.includes('-') ? prev : `${yr}-${prev}`);
    } else {
      // Multi→Single: strip year prefix
      const stripYear = k => k.includes('-') ? k.split('-')[1] : k;
      setMM(prev => {
        if (prev.length > 0 && prev[0].includes('-')) {
          // Keep only unique month parts
          const unique = [...new Set(prev.map(stripYear))];
          return unique;
        }
        return prev;
      });
      setSM(prev => stripYear(prev));
      setWM(prev => stripYear(prev));
    }
  }, [isMultiYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch data on mount + re-fetch when years/sourceFilter change (AD-V3-2) ──
  const yearsKey = JSON.stringify(years);
  const sourceKey = JSON.stringify(sourceFilter);
  useEffect(() => {
    const isMount = isInitialMount.current;
    isInitialMount.current = false;

    if (isMount) {
      setLoading(true);
    } else {
      setIsRefetching(true); // stale-while-revalidate: keep old data visible
    }

    fetchMonthlyMetrics(years, sourceFilter)
      .then(res => {
        setRawData(res);
        setFetchTimestamp(new Date());
        setPartialData(!!res._partialData);
        setLoading(false);
        setIsRefetching(false);
      })
      .catch(err => {
        console.error("Error fetching metrics:", err);
        if (isMount) {
          setError(err); // Only clobber data on initial mount failure
        } else {
          console.warn("[MetricsContext] Re-fetch failed — keeping previous data (stale-while-revalidate)");
        }
        setLoading(false);
        setIsRefetching(false);
      });
  }, [yearsKey, sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Retry fetch (AD-V3-2: passes current years/sourceFilter) ──
  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setPartialData(false);
    fetchMonthlyMetrics(years, sourceFilter)
      .then(res => { setRawData(res); setFetchTimestamp(new Date()); setPartialData(!!res._partialData); setLoading(false); })
      .catch(err => { console.error("Error fetching metrics:", err); setError(err); setPartialData(false); setLoading(false); });
  }, [yearsKey, sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    isRefetching,
    error,
    retry,
    fetchTimestamp,
    partialData,
    // View mode
    viewMode, setViewMode,
    // Temporal — V3: years[] + legacy adapter year
    years, setYears, toggleYear,
    year, setYear,
    mode, setMode,
    sM, setSM,
    mM, setMM,
    wM, setWM,
    sW, setSW, toggleWeek,
    // V3: Source filter
    sourceFilter, setSourceFilter, toggleSource,
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
  }), [rawData, loading, isRefetching, error, retry, fetchTimestamp, partialData, viewMode, years, year, sourceFilter, mode, sM, mM, wM, sW, selectedFunnels, heat, heatConfig, heatSections, coll,
       setYears, toggleYear, setYear, setSourceFilter, toggleSource, toggleFunnel, toggleColl, toggleMultiMonth, toggleWeek, toggleHeatSection]);

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

export { MESES, SEMANAS, FUNNELS, ALL_FUNNELS, SOURCE_OPTIONS };
