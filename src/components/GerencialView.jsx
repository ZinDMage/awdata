import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useGerencial } from '@/contexts/GerencialContext';
import { STAGE_TABS, STAGE_IDS, FUNNEL_LABELS, CUSTOM_FIELDS, parseCustomFields } from '@/config/pipedrive';
import { getTabColumns } from '@/config/gerencialTabs';
import { computeStageData } from '@/utils/stageMetrics';
import { fetchAdSpend, fetchPropostaCycleData, fetchHistoricalConvRate, fetchMqlContext, fetchSqlContext, fetchForecastData } from '@/services/gerencialService';
import { classifyLead } from '@/services/classificationService';
import BowtieChart from './BowtieChart';
import ForecastPanel from './ForecastPanel';
import NavHeader from './ui/nav-header';
import PillTabs from './ui/pill-tabs';
import StageView from './StageView';
import LossMatrix from './LossMatrix';
import ObjectionMatrix from './ObjectionMatrix';
import CycleBySegmentChart from './CycleBySegmentChart';
import EmptyState from './EmptyState';
import SkeletonLoader from './SkeletonLoader';
import DealDetailModal from './DealDetailModal';
import useDealModal from '@/hooks/useDealModal';

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
    <div className="flex items-center">
      <PillTabs 
        options={FUNNEL_OPTIONS} 
        activeKey={selectedFunnel} 
        onKeyChange={onFunnelChange} 
        size="sm"
      />
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
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
      {/* Seletores de período */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-content-tertiary">Início:</label>
        <select
          value={bowtiePeriod.startMonth}
          onChange={(e) => handlePeriodChange({ ...bowtiePeriod, startMonth: e.target.value })}
          className="bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm text-content-primary border border-border-subtle/20 outline-none focus:ring-2 focus:ring-info transition-all"
        >
          {MONTH_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <label className="text-xs text-content-tertiary">Fim:</label>
        <select
          value={bowtiePeriod.endMonth}
          onChange={(e) => handlePeriodChange({ ...bowtiePeriod, endMonth: e.target.value })}
          className="bg-surface-tertiary rounded-lg px-3 py-1.5 text-sm text-content-primary border border-border-subtle/20 outline-none focus:ring-2 focus:ring-info transition-all"
        >
          {MONTH_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Filtro de funil (pills) — P7: reutiliza FunnelPicker */}
      <div className="flex justify-center">
        <FunnelPicker selectedFunnel={selectedFunnel} onFunnelChange={onFunnelChange} />
      </div>
      
      {/* Espaçador para equilibrar no desktop (opcional, mas ajuda no justify-between) */}
      <div className="hidden md:block w-[200px]" />
    </div>
  );
}

// ── StageView com dados computados ──
function StageViewWithData({ activeTab, deals, bowtieStages, onRowClick }) {
  const configKey = TAB_TO_CONFIG[activeTab] || activeTab;
  const columns = getTabColumns(configKey);

  // Flatten custom fields onto deals for table columns (data_qualificacao, data_reuniao, sql_flag_label)
  const SQL_FLAG_LABELS = { [CUSTOM_FIELDS.SQL_FLAG.values.SIM]: 'Sim', [CUSTOM_FIELDS.SQL_FLAG.values.NAO]: 'Não', [CUSTOM_FIELDS.SQL_FLAG.values.A_REVISAR]: 'A Revisar' };
  const enrichedDeals = useMemo(() => deals.map(d => {
    const cf = parseCustomFields(d.custom_fields);
    const sqlFlagVal = cf[CUSTOM_FIELDS.SQL_FLAG.key];
    return {
      ...d,
      _cf: cf,
      data_qualificacao: d.data_qualificacao ?? cf[CUSTOM_FIELDS.DATA_QUALIFICACAO.key] ?? null,
      data_reuniao: d.data_reuniao ?? cf[CUSTOM_FIELDS.DATA_REUNIAO.key] ?? null,
      data_proposta: cf[CUSTOM_FIELDS.DATA_PROPOSTA.key] ?? null,
      sql_flag_label: SQL_FLAG_LABELS[sqlFlagVal] ?? '—',
      reuniao_realizada_label: cf[CUSTOM_FIELDS.REUNIAO_REALIZADA.key] == CUSTOM_FIELDS.REUNIAO_REALIZADA.values.SIM ? 'Sim' : 'Não',
      tem_reuniao: (d.data_reuniao ?? cf[CUSTOM_FIELDS.DATA_REUNIAO.key]) ? 'Sim' : 'Não',
      cf_objecoes: cf[CUSTOM_FIELDS.OBJECOES_POS_CONTATO.key] ?? null,
    };
  }), [deals]);

  // Filtros por aba
  const filteredDeals = useMemo(() => {
    // MQL: filtrar apenas deals que passam na classificação
    if (activeTab === 'mql') {
      return enrichedDeals.filter(d =>
        classifyLead(d.faturamento_anual, d.volume_mensal, d.segmento, d.mercado) === 'MQL'
      );
    }
    // SQL/Reunião/Proposta: SQL_FLAG=SIM
    if (activeTab === 'sql' || activeTab === 'reuniao' || activeTab === 'proposta') {
      const sqlKey = CUSTOM_FIELDS.SQL_FLAG.key;
      const sqlSim = CUSTOM_FIELDS.SQL_FLAG.values.SIM;
      return enrichedDeals.filter(d => d._cf?.[sqlKey] == sqlSim);
    }
    return enrichedDeals;
  }, [activeTab, enrichedDeals]);

  // Proposta: fetch adSpend, cycleData e conversão histórica
  const [propostaContext, setPropostaContext] = useState({ adSpend: null, cycleData: [], histConv: null });
  useEffect(() => {
    if (activeTab !== 'proposta') return;
    let cancelled = false;
    Promise.all([fetchAdSpend(), fetchPropostaCycleData(), fetchHistoricalConvRate()]).then(([adSpend, cycleData, histConv]) => {
      if (!cancelled) setPropostaContext({ adSpend, cycleData, histConv });
    }).catch(err => {
      console.error('[GerencialView] proposta context fetch error:', err);
      if (!cancelled) setPropostaContext({ adSpend: null, cycleData: [], histConv: null });
    });
    return () => { cancelled = true; };
  }, [activeTab]);

  // MQL: fetch contagens all-time do yayforms (paginado)
  const [mqlContext, setMqlContext] = useState({ totalLeads: null, totalMql: null, mqlsNotInPipe: null });
  useEffect(() => {
    if (activeTab !== 'mql') return;
    let cancelled = false;
    fetchMqlContext().then(ctx => {
      if (!cancelled) setMqlContext(ctx);
    }).catch(err => {
      console.error('[GerencialView] mql context fetch error:', err);
    });
    return () => { cancelled = true; };
  }, [activeTab]);

  // SQL: fetch contagens all-time (MQLs yayforms + SQLs CRM)
  const [sqlContext, setSqlContext] = useState({ totalMql: null, totalSql: null });
  useEffect(() => {
    if (activeTab !== 'sql') return;
    let cancelled = false;
    fetchSqlContext().then(ctx => {
      if (!cancelled) setSqlContext(ctx);
    }).catch(err => {
      console.error('[GerencialView] sql context fetch error:', err);
    });
    return () => { cancelled = true; };
  }, [activeTab]);

  // Context cross-tab: contagens do Bowtie (Lead, MQL) para KPIs de %
  const context = useMemo(() => ({
    leadCount: bowtieStages?.[0]?.count ?? null,
    mqlCount:  bowtieStages?.[1]?.count ?? null,
    sqlCount:  bowtieStages?.[2]?.count ?? null,
    reuniaoRealizadaCount: bowtieStages?.[4]?.count ?? null,
    vendasCount:           bowtieStages?.[5]?.count ?? null,
    ...(activeTab === 'proposta' ? propostaContext : {}),
    ...(activeTab === 'mql' ? mqlContext : {}),
    ...(activeTab === 'sql' ? sqlContext : {}),
  }), [bowtieStages, activeTab, propostaContext, mqlContext, sqlContext]);

  const { kpis, charts } = useMemo(() => computeStageData(activeTab, filteredDeals, context), [activeTab, filteredDeals, context]);

  // Reunião: dual sections (Agendada + Confirmada) — FR65
  const sections = useMemo(() => {
    if (activeTab !== 'reuniao') return null;
    const agendadaIds = new Set(STAGE_IDS.REUNIAO_AGENDADA);
    const agendada = filteredDeals.filter(d => agendadaIds.has(d.stage_id));
    const confirmada = filteredDeals.filter(d => !agendadaIds.has(d.stage_id));
    return [
      { title: 'Reunião Agendada', deals: agendada, columns: getTabColumns('reuniao_agendada') },
      { title: 'Reunião Confirmada', deals: confirmada, columns: getTabColumns('reuniao_confirmada') },
    ];
  }, [activeTab, filteredDeals]);

  return (
    <StageView
      kpis={kpis}
      charts={charts}
      columns={columns}
      deals={filteredDeals}
      sections={sections}
      onRowClick={onRowClick}
      afterCharts={
        activeTab === 'perda' ? <LossMatrix deals={filteredDeals} /> :
        activeTab === 'proposta' ? <ObjectionMatrix deals={filteredDeals} /> :
        activeTab === 'resultado' ? <CycleBySegmentChart deals={filteredDeals} /> :
        undefined
      }
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

  const {
    selectedDealId,
    data: dealData,
    loading: dealLoading,
    openModal,
    closeModal
  } = useDealModal();

  // Forecast: previsibilidade de receita (carrega no bowtie)
  const [forecastData, setForecastData] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastPeriod, setForecastPeriod] = useState({ startMonth: null, endMonth: null }); // null = all-time
  useEffect(() => {
    let cancelled = false;
    setForecastLoading(true);
    fetchForecastData(selectedFunnel, forecastPeriod.startMonth, forecastPeriod.endMonth).then(data => {
      if (!cancelled) { setForecastData(data); setForecastLoading(false); }
    }).catch(err => {
      console.error('[GerencialView] forecast fetch error:', err);
      if (!cancelled) { setForecastData(null); setForecastLoading(false); }
    });
    return () => { cancelled = true; };
  }, [selectedFunnel, forecastPeriod.startMonth, forecastPeriod.endMonth]);

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

  // Montar array de tabs com contagens (mesmos números do ForecastPanel)
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
      <NavHeader tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />

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

                {/* Previsibilidade de Receita */}
                <ForecastPanel data={forecastData} loading={forecastLoading} selectedFunnel={selectedFunnel} period={forecastPeriod} onPeriodChange={setForecastPeriod} />
              </div>
            )}
          </>
        ) : (
          <>
            {/* Filtro de funil nas sub-abas — P7: reutiliza FunnelPicker */}
            <div className="mb-6 flex justify-center">
              <FunnelPicker selectedFunnel={selectedFunnel} onFunnelChange={setSelectedFunnel} />
            </div>

            {/* Sub-aba: StageView (KPIs + Charts + DealsTable) */}
            {tabData.loading ? (
              <SkeletonLoader />
            ) : (
              <StageViewWithData
                activeTab={activeTab}
                deals={tabData.data || []}
                bowtieStages={bowtieData.data?.stages}
                onRowClick={openModal}
              />
            )}
          </>
        )}
      </div>

      {/* Deal Detail Modal */}
      {selectedDealId && (
        <DealDetailModal
          dealId={selectedDealId}
          transitions={dealData?.transitions}
          calls={dealData?.calls}
          tasks={dealData?.tasks}
          loading={dealLoading}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
