import { useMemo, useCallback, useState, useRef } from 'react';
import { useGerencial } from '@/contexts/GerencialContext';
import { STAGE_TABS, STAGE_IDS, FUNNEL_LABELS } from '@/config/pipedrive';
import { getTabColumns } from '@/config/gerencialTabs';
import { computeStageData } from '@/utils/stageMetrics';
import BowtieChart from './BowtieChart';
import StageTabBar from './StageTabBar';
import StageView from './StageView';
import EmptyState from './EmptyState';
import SkeletonLoader from './SkeletonLoader';

// Mapeamento de activeTab (STAGE_TABS key) → TAB_CONFIG key (gerencialTabs)
const TAB_TO_CONFIG = {
  mql: 'mql',
  sql: 'sql',
  reuniao: 'reuniao_agendada',
  proposta: 'proposta',
  perda: 'perda',
  resultado: 'resultado',
};

// ── Constantes ──
const FUNNEL_OPTIONS = [
  { key: 'todos', label: 'Todos' },
  ...Object.entries(FUNNEL_LABELS).map(([key, label]) => ({ key, label })),
];

const TAB_DEFS = [
  { id: 'bowtie', label: 'Funil', icon: '🏠' },
  ...Object.entries(STAGE_TABS).map(([id, cfg]) => ({
    id,
    label: cfg.label,
    icon: cfg.icon,
  })),
];

// ── Helpers para gerar opções de mês/ano ──
function generateMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const value = `${y}-${m}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
}

const MONTH_OPTIONS = generateMonthOptions();

// ── P7: Componente reutilizável de pills de funil ──
function FunnelPicker({ selectedFunnel, onFunnelChange }) {
  return (
    <div className="flex items-center gap-1">
      {FUNNEL_OPTIONS.map(opt => {
        const isActive = selectedFunnel === opt.key;
        const cls = isActive
          ? 'bg-info text-white rounded-full px-3 py-1 text-sm font-medium cursor-pointer'
          : 'bg-surface-secondary text-content-secondary rounded-full px-3 py-1 text-sm hover:bg-surface-tertiary cursor-pointer';
        return (
          <button
            key={opt.key}
            onClick={() => onFunnelChange(opt.key)}
            className={cls}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Componente de Filtros do Bowtie (Story 2.2) ──
function BowtieFilters({ bowtiePeriod, selectedFunnel, onPeriodChange, onFunnelChange }) {
  // P1: Validação — impede período invertido
  const handlePeriodChange = (newPeriod) => {
    if (newPeriod.startMonth > newPeriod.endMonth) {
      // Auto-corrige: se início > fim, ajusta o outro campo
      if (newPeriod.startMonth !== bowtiePeriod.startMonth) {
        onPeriodChange({ startMonth: newPeriod.startMonth, endMonth: newPeriod.startMonth });
      } else {
        onPeriodChange({ startMonth: newPeriod.endMonth, endMonth: newPeriod.endMonth });
      }
      return;
    }
    onPeriodChange(newPeriod);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 mb-4">
      {/* Seletores de período */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-content-tertiary">Início:</label>
        <select
          value={bowtiePeriod.startMonth}
          onChange={(e) => handlePeriodChange({ ...bowtiePeriod, startMonth: e.target.value })}
          className="bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm text-content-primary border border-border-subtle/20 outline-none focus:ring-2 focus:ring-info"
        >
          {MONTH_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <label className="text-xs text-content-tertiary">Fim:</label>
        <select
          value={bowtiePeriod.endMonth}
          onChange={(e) => handlePeriodChange({ ...bowtiePeriod, endMonth: e.target.value })}
          className="bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm text-content-primary border border-border-subtle/20 outline-none focus:ring-2 focus:ring-info"
        >
          {MONTH_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Filtro de funil (pills) — P7: reutiliza FunnelPicker */}
      <FunnelPicker selectedFunnel={selectedFunnel} onFunnelChange={onFunnelChange} />
    </div>
  );
}

// ── StageView com dados computados ──
function StageViewWithData({ activeTab, deals }) {
  const configKey = TAB_TO_CONFIG[activeTab] || activeTab;
  const columns = getTabColumns(configKey);
  const { kpis, charts } = useMemo(() => computeStageData(activeTab, deals), [activeTab, deals]);

  // Reunião: dual sections (Agendada + Confirmada) — FR65
  const sections = useMemo(() => {
    if (activeTab !== 'reuniao') return null;
    const agendadaIds = new Set(STAGE_IDS.REUNIAO_AGENDADA);
    const agendada = deals.filter(d => agendadaIds.has(d.stage_id));
    const confirmada = deals.filter(d => !agendadaIds.has(d.stage_id));
    return [
      { title: 'Reunião Agendada', deals: agendada, columns: getTabColumns('reuniao_agendada') },
      { title: 'Reunião Confirmada', deals: confirmada, columns: getTabColumns('reuniao_confirmada') },
    ];
  }, [activeTab, deals]);

  return (
    <StageView
      kpis={kpis}
      charts={charts}
      columns={columns}
      deals={deals}
      sections={sections}
    />
  );
}

// ── GerencialView (Orquestrador) ──
export default function GerencialView() {
  const {
    activeTab,
    selectedFunnel,
    bowtiePeriod,
    setActiveTab,
    setSelectedFunnel,
    setBowtiePeriod,
    pillCounts,
    bowtieData,
    tabData,
  } = useGerencial();

  // P3: Ref para fade transition entre sub-abas
  const [fadeIn, setFadeIn] = useState(true);
  const prevTabRef = useRef(activeTab);

  // P3: Detectar mudança de tab e disparar fade
  const handleTabChange = useCallback((tabId) => {
    if (tabId === prevTabRef.current) return;
    setFadeIn(false);
    setTimeout(() => {
      setActiveTab(tabId);
      prevTabRef.current = tabId;
      setFadeIn(true);
    }, 200);
  }, [setActiveTab]);

  // Montar array de tabs com contagens
  const tabs = useMemo(() => {
    return TAB_DEFS.map(def => ({
      ...def,
      count: def.id === 'bowtie' ? undefined : (pillCounts.data?.[def.id] ?? null),
    }));
  }, [pillCounts.data]);

  // Callback do Bowtie: click na barra → muda tab
  const handleStageClick = useCallback((stageName) => {
    // Mapear nome da etapa para tab id
    const nameToTab = {
      'Lead': 'bowtie',
      'MQL': 'mql',
      'SQL': 'sql',
      'Reunião Agendada': 'reuniao',
      'R. Agendada': 'reuniao',
      'Reunião Realizada': 'reuniao',
      'R. Realizada': 'reuniao',
      'Reunião': 'reuniao',
      'Pagamentos Realizados': 'resultado',
      'Vendas': 'resultado',
      'Contrato Enviado': 'proposta',
      'Proposta': 'proposta',
      'Perda': 'perda',
      'Resultado': 'resultado',
    };
    const tabId = nameToTab[stageName] ?? 'bowtie';
    handleTabChange(tabId);
  }, [handleTabChange]);

  const isBowtie = activeTab === 'bowtie';

  // P2: Verificar estado de erro
  const error = isBowtie ? bowtieData.error : tabData.error;

  return (
    <div>
      {/* Pill Navigation Bar */}
      <StageTabBar tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />

      {/* P3: Fade transition wrapper */}
      <div
        className="p-6 transition-opacity duration-200"
        style={{ opacity: fadeIn ? 1 : 0, transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)' }}
      >
        {/* P2: Estado de erro */}
        {error ? (
          <EmptyState
            icon="⚠️"
            message="Erro ao carregar dados. Tente novamente."
          />
        ) : isBowtie ? (
          <>
            {/* Filtros do Bowtie (Story 2.2) */}
            <BowtieFilters
              bowtiePeriod={bowtiePeriod}
              selectedFunnel={selectedFunnel}
              onPeriodChange={setBowtiePeriod}
              onFunnelChange={setSelectedFunnel}
            />

            {/* Bowtie Chart */}
            {bowtieData.loading ? (
              <SkeletonLoader />
            ) : (
              <div className={`transition-opacity duration-300 ${bowtieData.isRefetching ? 'opacity-60' : 'opacity-100'}`}>
                <BowtieChart
                  stages={bowtieData.data?.stages ?? []}
                  conversions={bowtieData.data?.conversions ?? []}
                  avgTimes={bowtieData.data?.avgTimes ?? []}
                  onStageClick={handleStageClick}
                />
              </div>
            )}
          </>
        ) : (
          <>
            {/* Filtro de funil nas sub-abas — P7: reutiliza FunnelPicker */}
            <div className="mb-4">
              <FunnelPicker selectedFunnel={selectedFunnel} onFunnelChange={setSelectedFunnel} />
            </div>

            {/* Sub-aba: StageView (KPIs + Charts + DealsTable) */}
            {tabData.loading ? (
              <SkeletonLoader />
            ) : (
              <StageViewWithData
                activeTab={activeTab}
                deals={tabData.data || []}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
