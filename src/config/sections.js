/**
 * Seções da tabela de métricas — fonte única de verdade.
 * Usado por MetricsTable (dados) e ConfigPanel (toggles).
 */

const COLORS = {
  mkt: "#007AFF",
  sdr: "#FF9500",
  closer: "#34C759",
  fin: "#FF453A",
  delta: "#AF52DE",
};

export const SECTION_META = [
  { id: "principal", label: "Principal", color: "#007AFF" },
  { id: "premissas", label: "Premissas", color: "#007AFF" },
  { id: "numeros", label: "Números", color: "#FF9500" },
  { id: "financeiro", label: "Financeiro", color: "#FF453A" },
  { id: "dt", label: "Deltas", color: COLORS.delta },
];

export { COLORS as SECTION_COLORS };
