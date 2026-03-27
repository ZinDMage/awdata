import { useMetrics } from '../contexts/MetricsContext';
import Pill from './Pill';

const EASE_APPLE = "all 300ms cubic-bezier(0.4, 0, 0.2, 1)";

function LayerLabel({ children }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: "var(--color-text-tertiary)",
      letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0,
    }}>{children}</span>
  );
}

function Separator({ dk }) {
  const bdrLight = dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  return <div style={{ width: 1, height: 20, background: bdrLight, margin: "0 4px", flexShrink: 0 }} />;
}

function SegmentedControl({ value, onChange }) {
  const options = [
    { k: "performance", l: "Performance" },
    { k: "criacao", l: "Criação" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Modo de visualização"
      style={{
        display: "inline-flex", borderRadius: 20, padding: 2,
        background: "var(--color-background-secondary)",
      }}
    >
      {options.map(opt => {
        const active = value === opt.k;
        return (
          <button
            key={opt.k}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.k)}
            style={{
              padding: "5px 14px", fontSize: 12, borderRadius: 18,
              border: "none", cursor: "pointer",
              fontWeight: active ? 600 : 400,
              background: active ? "var(--color-background-primary)" : "transparent",
              color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
              boxShadow: active ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
              transition: EASE_APPLE,
            }}
          >{opt.l}</button>
        );
      })}
    </div>
  );
}

function HeatmapDot({ active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={active}
      aria-label="Alternar heatmap"
      style={{
        display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
        userSelect: "none", padding: "4px 8px", borderRadius: 20,
        border: "none", background: "transparent", transition: EASE_APPLE,
      }}
    >
      <div style={{
        width: 8, height: 8, borderRadius: 4,
        background: active ? "#34C759" : "var(--color-text-tertiary)",
        transition: EASE_APPLE,
        boxShadow: active ? "0 0 6px rgba(52,199,89,0.4)" : "none",
      }} />
      <span style={{
        fontSize: 11, fontWeight: 500,
        color: active ? "#34C759" : "var(--color-text-tertiary)",
        transition: EASE_APPLE,
      }}>Heatmap</span>
    </button>
  );
}

export default function FilterBar({ dk }) {
  const {
    year, setYear, viewMode, setViewMode,
    selectedFunnels, setSelectedFunnels, toggleFunnel,
    mode, setMode, heat, setHeat,
    FUNNELS, ALL_FUNNELS,
  } = useMetrics();

  const currentYear = new Date().getFullYear();
  const years = [String(currentYear - 1), String(currentYear)];

  const allSelected = ALL_FUNNELS.length > 0 && ALL_FUNNELS.every(k => selectedFunnels.includes(k));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
      {/* Single inline row: ANO → MODO → FUNIL → PERÍODO → Heatmap */}
      <div
        aria-label="Filtros de métricas"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          flexWrap: "wrap", minHeight: 36,
        }}
      >
        {/* ANO */}
        <LayerLabel>Ano</LayerLabel>
        <div role="tablist" aria-label="Seleção de ano" style={{ display: "flex", background: "var(--color-background-secondary)", borderRadius: 20, padding: 2 }}>
          {years.map(y => (
            <Pill key={y} active={year === y} onClick={() => setYear(y)}>{y}</Pill>
          ))}
        </div>

        <Separator dk={dk} />

        {/* MODO */}
        <LayerLabel>Modo</LayerLabel>
        <SegmentedControl value={viewMode} onChange={setViewMode} />

        <Separator dk={dk} />

        {/* FUNIL */}
        <LayerLabel>Funil</LayerLabel>
        <div role="tablist" aria-label="Funis disponíveis" style={{ display: "flex", background: "var(--color-background-secondary)", borderRadius: 20, padding: 2, gap: 1 }}>
          <Pill accent active={allSelected} onClick={() => setSelectedFunnels(ALL_FUNNELS)}>Todos</Pill>
          {FUNNELS.map(f => (
            <Pill key={f.key} accent active={selectedFunnels.includes(f.key)} onClick={() => toggleFunnel(f.key)}>{f.label}</Pill>
          ))}
        </div>

        <Separator dk={dk} />

        {/* PERÍODO + HEATMAP (AC#1: integrados no mesmo grupo, sem Separator) */}
        <LayerLabel>Período</LayerLabel>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap" }}>
          <div role="tablist" aria-label="Granularidade temporal" style={{ display: "inline-flex", borderRadius: 20, padding: 2, background: "var(--color-background-secondary)" }}>
            {[{ k: "single", l: "1 Mês" }, { k: "multi", l: "Multi-mês" }, { k: "semanas", l: "Semanas" }].map(m => (
              <button
                key={m.k}
                role="tab"
                aria-selected={mode === m.k}
                onClick={() => setMode(m.k)}
                style={{
                  padding: "5px 12px", fontSize: 12, borderRadius: 18, border: "none", cursor: "pointer",
                  fontWeight: mode === m.k ? 600 : 400,
                  background: mode === m.k ? "var(--color-background-primary)" : "transparent",
                  color: mode === m.k ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                  boxShadow: mode === m.k ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: EASE_APPLE,
                }}
              >{m.l}</button>
            ))}
          </div>
          <HeatmapDot active={heat} onClick={() => setHeat(!heat)} />
        </div>
      </div>
    </div>
  );
}
