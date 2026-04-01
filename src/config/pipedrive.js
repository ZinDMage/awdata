/**
 * Pipedrive Configuration — Centralized
 * Stage IDs, Pipeline IDs, Custom Field keys.
 * Changes in Pipedrive require editing only this file.
 */

// ── Stage IDs do Pipedrive ─────────────────────────────────────
export const STAGE_IDS = {
  MQL: [1, 49],
  SQL: [19, 50, 53, 35],
  REUNIAO_AGENDADA: [3, 11, 45, 51, 37, 55, 58, 64, 65],
  REAGENDAMENTO_PENDENTE: [6, 38, 48, 56],
  PROPOSTA: [4, 46, 39, 59, 66],
  CONTRATO_ENVIADO: [41, 47, 40, 60, 67],
};
// Derivado automaticamente para evitar divergência manual
STAGE_IDS.PIPELINE_TOTAL = [
  ...STAGE_IDS.PROPOSTA,
];

// ── Custom Fields do Pipedrive ─────────────────────────────────
export const CUSTOM_FIELDS = {
  SQL_FLAG: {
    key: '2e17191cfb8e6f4a58359adc42a08965a068e8bc',
    values: { SIM: '75', NAO: '76', A_REVISAR: '79' }
  },
  DATA_REUNIAO: {
    key: '8eff24b00226da8dfb871caaf638b62af68bf16b'
  },
  REUNIAO_REALIZADA: {
    key: 'baf2724fcbeec84a36e90f9dc3299431fe1b0dd3',
    values: { SIM: '47', NAO: '59' }
  },
  DATA_QUALIFICACAO: {
    key: '99ce1624c66efcf108dbf99f06fcbb7bd79570f7'
  },
  // v2: Aba Gerencial
  PROPOSTA_FEITA: {          // FR73
    key: '26c88933a05e407979e117dfed02c95e8e781770'
  },
  DATA_PROPOSTA: {
    key: 'fd1fa603cc3094f12eba1ecc42161fbb94800771'
  },
  OBJECOES_POS_CONTATO: {    // FR74
    key: 'e9d84f444976c291b76f78c941a266f8d760bd0c',
    labels: {
      '49': 'Sem Orçamento',
      '50': 'Não é o Tomador de Decisão Final',
      '51': 'Já Usa uma Solução Similar',
      '52': 'Experiência Ruim no Passado',
      '53': 'Aguardando Prioridade de Projeto',
      '54': 'Vai Manter o Fornecedor Atual',
      '55': 'Não é o Momento Ideal',
      '56': 'Concorrente com Melhor Custo-Benefício',
      '57': 'Falta de integrações com sistemas do cliente',
      '58': 'Cliente não Toma Decisão na Reunião',
      '71': 'Cliente está realizando pesquisa de Mercado',
      '81': 'Avaliação técnica com o time interno',
      '82': 'Avaliação com o Conselho para verificar prioridade',
      '87': 'Não é o ICP',
      '102': 'Não teve Percepção de valor / preço com a Entrega',
    }
  },
};

// ── Mapeamento de Funis por Pipeline ID ────────────────────────
// AD-4: 3 funis ativos. Eventos (pipeline 4) mergeado em Indicação.
// Clínicas despriorizado/removido.
export const PIPELINE_FUNNELS = {
  inbound:         [1, 3, 7, 8, 9],
  indicacao:       [10],
  wordwild:        [6],
  revenueleakage:  [11],
};

// ── Funnel Labels ──────────────────────────────────────────────
export const FUNNEL_LABELS = {
  inbound: '🔽 Inbound',
  indicacao: '🙋‍♂️ Indicação',
  wordwild: '🇺🇸 WD',
  revenueleakage: '🚰 Revenue Leakage',
};

/**
 * Resolve pipeline_id to funnel key.
 * Returns null for unknown pipeline IDs (logged, not crashed — FR40).
 */
export const getFunnelKey = (pipelineId) => {
  const key = Object.keys(PIPELINE_FUNNELS).find(k => PIPELINE_FUNNELS[k].includes(pipelineId));
  if (!key && pipelineId != null) {
    console.warn(`[pipedrive] Unknown pipeline_id: ${pipelineId}`);
  }
  return key ?? null;
};

/**
 * Parse custom_fields JSON from Pipedrive deal.
 * Handles string, object, null gracefully (FR22).
 */
export const parseCustomFields = (cf) => {
  if (!cf) return {};
  if (typeof cf === 'string') {
    try { return JSON.parse(cf); } catch { return {}; }
  }
  return cf;
};

// ── v2: Stage Tabs — Mapeamento stage_id → sub-aba lógica (AD-V2-7) ──
// Alinhado com STAGE_IDS. CONTRATO_ENVIADO mergeado em proposta.
export const STAGE_TABS = {
  mql:       { stageIds: [1, 49],                              label: 'MQL',       icon: '📨' },
  sql:       { stageIds: [19, 50, 53, 35],                     label: 'SQL',       icon: '✅' },
  reuniao:   { stageIds: [3, 11, 45, 51, 37, 55, 58, 64, 65],       label: 'Reunião',   icon: '📅' },
  proposta:  { stageIds: [4, 46, 39, 59, 66, 41, 47, 40, 60, 67], label: 'Proposta',  icon: '📝' },
  perda:     { stageIds: [],                                    label: 'Perda',     icon: '❌' },
  resultado: { stageIds: [],                                    label: 'Resultado', icon: '🏆' },
};
