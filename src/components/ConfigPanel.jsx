import { useMetrics } from '../contexts/MetricsContext';
import { SECTION_META } from '../config/sections';
import Pill from './Pill';

export default function ConfigPanel({ dk }) {
  const { heatConfig, setHeatConfig, heatSections, toggleHeatSection, setHeatSections, HEAT_SECTIONS_DEFAULT, year, setYear, mode, setMode, sM, setSM, mM, wM, setWM, toggleMultiMonth, MESES } = useMetrics();
  const bdrLight = dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";

  return (
    <div className="mb-6 rounded-[--radius-card] p-6 bg-[--color-background-secondary] border border-[--color-border-secondary]">
      <div className="flex items-center justify-between mb-5">
        <div className="text-lg font-bold text-[--color-text-primary] tracking-tight">Configurações do Heatmap</div>
        <button
          type="button"
          onClick={() => { setHeatConfig({ maxPct: 35, baseOpacity: 0.05, opacityRange: 0.17, colorGood: "#34C759", colorBad: "#FF453A" }); setHeatSections(HEAT_SECTIONS_DEFAULT); }}
          className="px-3 py-1.5 rounded-lg border border-[--color-border-secondary] bg-[--color-background-primary] text-[--color-text-primary] cursor-pointer text-xs font-semibold">
          Resetar Padrões
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
        {/* Sensibilidade */}
        <div>
          <label className="block text-xs font-semibold text-[--color-text-tertiary] mb-2 uppercase tracking-wide">Sensibilidade (%)</label>
          <div className="flex items-center gap-3">
            <input type="range" min="2" max="100" value={heatConfig.maxPct} onChange={(e) => setHeatConfig(p => ({ ...p, maxPct: Number(e.target.value) }))} className="flex-1 accent-[--color-text-primary] cursor-pointer" />
            <div className="text-sm font-semibold w-11 text-right tabular">{heatConfig.maxPct}%</div>
          </div>
          <div className="text-[11px] text-[--color-text-tertiary] mt-1.5">Variação necessária para a cor atingir opacidade máxima.</div>
        </div>

        {/* Opacidade Mínima */}
        <div>
          <label className="block text-xs font-semibold text-[--color-text-tertiary] mb-2 uppercase tracking-wide">Opacidade Mínima</label>
          <div className="flex items-center gap-3">
            <input type="range" min="0" max="0.5" step="0.01" value={heatConfig.baseOpacity} onChange={(e) => setHeatConfig(p => ({ ...p, baseOpacity: Number(e.target.value) }))} className="flex-1 accent-[--color-text-primary] cursor-pointer" />
            <div className="text-sm font-semibold w-11 text-right tabular">{(heatConfig.baseOpacity * 100).toFixed(0)}%</div>
          </div>
          <div className="text-[11px] text-[--color-text-tertiary] mt-1.5">Intensidade da cor inicial ao atingir variação mínima (1%).</div>
        </div>

        {/* Opacidade Máxima */}
        <div>
          <label className="block text-xs font-semibold text-[--color-text-tertiary] mb-2 uppercase tracking-wide">Opacidade Máxima</label>
          <div className="flex items-center gap-3">
            <input type="range" min="0.05" max="0.22" step="0.01" value={Math.min(heatConfig.baseOpacity + heatConfig.opacityRange, 0.22).toFixed(2)} onChange={(e) => setHeatConfig(p => ({ ...p, opacityRange: Math.max(0, Math.min(Number(e.target.value), 0.22) - p.baseOpacity) }))} className="flex-1 accent-[--color-text-primary] cursor-pointer" />
            <div className="text-sm font-semibold w-11 text-right tabular">{Math.min(((heatConfig.baseOpacity + heatConfig.opacityRange) * 100), 22).toFixed(0)}%</div>
          </div>
          <div className="text-[11px] text-[--color-text-tertiary] mt-1.5">Intensidade máxima limitante do fundo nas células da tabela.</div>
        </div>

        {/* Cores */}
        <div>
          <label className="block text-xs font-semibold text-[--color-text-tertiary] mb-2 uppercase tracking-wide">Cores Hexadecimal</label>
          <div className="flex gap-6 items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="color" value={heatConfig.colorGood} onChange={(e) => setHeatConfig(p => ({ ...p, colorGood: e.target.value }))} className="w-7 h-7 p-0 border-none rounded-md overflow-hidden cursor-pointer bg-transparent" />
              <span className="text-sm font-medium text-[--color-text-primary]">Positivo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="color" value={heatConfig.colorBad} onChange={(e) => setHeatConfig(p => ({ ...p, colorBad: e.target.value }))} className="w-7 h-7 p-0 border-none rounded-md overflow-hidden cursor-pointer bg-transparent" />
              <span className="text-sm font-medium text-[--color-text-primary]">Negativo</span>
            </label>
          </div>
        </div>

        {/* Ativação por Seção — Story 7-1 */}
        <div className="col-span-full mt-6 pt-6" style={{ borderTop: `1px solid ${bdrLight}` }}>
          <label className="block text-xs font-semibold text-[--color-text-tertiary] mb-3 uppercase tracking-wide">Heatmap por Seção</label>
          <div className="flex gap-2 flex-wrap">
            {SECTION_META.map(sec => {
              const active = heatSections[sec.id];
              return (
                <button
                  key={sec.id}
                  type="button"
                  role="switch"
                  aria-checked={active}
                  aria-label={`Heatmap na seção ${sec.label}`}
                  onClick={() => toggleHeatSection(sec.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full cursor-pointer transition-all duration-200"
                  style={{
                    border: `1px solid ${active ? sec.color : "var(--color-border-secondary)"}`,
                    background: active ? `color-mix(in srgb, ${sec.color} 12%, transparent)` : "var(--color-background-primary)",
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full transition-all duration-200"
                    style={{
                      background: active ? sec.color : "var(--color-text-tertiary)",
                      boxShadow: active ? `0 0 6px ${sec.color}40` : "none",
                    }}
                  />
                  <span
                    className="text-xs transition-all duration-200"
                    style={{
                      fontWeight: active ? 600 : 400,
                      color: active ? sec.color : "var(--color-text-tertiary)",
                    }}
                  >{sec.label}</span>
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-[--color-text-tertiary] mt-2">Selecione em quais seções da tabela o heatmap deve aparecer.</div>
        </div>

        {/* Período */}
        <div className="col-span-full mt-6 pt-6" style={{ borderTop: `1px solid ${bdrLight}` }}>
          <div className="text-base font-bold text-[--color-text-primary] tracking-tight mb-5">Período de Comparação</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
            <div>
              <label className="block text-xs font-semibold text-[--color-text-tertiary] mb-2 uppercase tracking-wide">Ano Analisado</label>
              <div className="inline-flex bg-[--color-background-primary] rounded-full p-1 border border-[--color-border-secondary]">
                {[String(new Date().getFullYear() - 1), String(new Date().getFullYear())].map(y => <Pill key={y} active={year === y} onClick={() => setYear(y)}>{y}</Pill>)}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[--color-text-tertiary] mb-2 uppercase tracking-wide">Escala de Comparação</label>
              <div className="inline-flex bg-[--color-background-primary] rounded-full p-1 border border-[--color-border-secondary]">
                {[{ k: "single", l: "1 Mês" }, { k: "multi", l: "Multi-mês" }, { k: "semanas", l: "Semanas" }].map(m => (
                  <button key={m.k} type="button" onClick={() => setMode(m.k)} className="px-4 py-1 text-xs rounded-[18px] border-none cursor-pointer transition-all duration-200" style={{ fontWeight: mode === m.k ? 600 : 400, background: mode === m.k ? "var(--color-text-primary)" : "transparent", color: mode === m.k ? "var(--color-background-primary)" : "var(--color-text-tertiary)" }}>{m.l}</button>
                ))}
              </div>
            </div>
            <div className="col-span-full mt-2">
              <label className="block text-xs font-semibold text-[--color-text-tertiary] mb-2 uppercase tracking-wide">
                {mode === "multi" ? "Selecione os meses para comparar" : (mode === "semanas" ? "Selecione o mês para visualizar as semanas" : "Mês Analisado")}
              </label>
              <div className="flex gap-0.5 flex-wrap bg-[--color-background-primary] p-2 rounded-2xl border border-[--color-border-secondary]">
                {mode === "single" && MESES.map(m => <Pill key={m.key} active={sM === m.key} onClick={() => setSM(m.key)}>{m.label}</Pill>)}
                {mode === "multi" && MESES.map(m => <Pill key={m.key} active={mM.includes(m.key)} onClick={() => toggleMultiMonth(m.key)}>{m.label}</Pill>)}
                {mode === "semanas" && MESES.map(m => <Pill key={m.key} active={wM === m.key} onClick={() => setWM(m.key)}>{m.label}</Pill>)}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 text-[13px] text-[--color-text-tertiary] font-medium">
        As configurações são aplicadas na view de Métricas.
      </div>
    </div>
  );
}
