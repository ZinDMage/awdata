import { supabase } from './supabaseClient';

/**
 * Data Service for Dash AwSales
 * Handles aggregation of business metrics from Supabase tables.
 */

// ── Regras de Qualificação MQL ─────────────────────────────────
const disqualifiedRanges = [
  'Zero até o momento',
  'Menos de R$100 mil',
  'Entre R$100 mil e R$500 mil',
  'Entre R$500 mil e R$1 milhão'
];

const qualifiedRanges = [
  'Entre R$1 milhão a R$5 milhões',
  'Entre R$5 milhões a R$10 milhões',
  'Entre R$10 milhões a R$25 milhões',
  'Entre R$25 milhões a R$50 milhões',
  'Acima de R$50 milhões',
  'Acima de R$10 milhões'
];

const disqualifiedTicketVolumes = [
  'Menos de 1.000 por mês',
  'Entre 1.000 e 3.000 por mês',
  'Entre 1.000 e 5.000 por mês'
];

const disqualifiedSegments = [
  '🩺 Clínica / consultório',
  '⚖️ Escritório de advocacia'
];

function classifyLead(fat, vol, seg) {
  if (disqualifiedRanges.includes(fat)) return 'Lead';
  if (seg && disqualifiedSegments.includes(seg)) return 'Lead';
  if (vol && disqualifiedTicketVolumes.includes(vol)) return 'Lead';
  if (qualifiedRanges.includes(fat)) return 'MQL';
  return 'Lead';
}

export const fetchMonthlyMetrics = async () => {
  try {
    const fetchAll = async (table, selectStr) => {
      let all = [];
      let from = 0;
      let size = 1000;
      while (true) {
        const { data, error } = await supabase.from(table).select(selectStr).range(from, from + size - 1);
        if (error) {
          console.error(`Supabase Error on ${table}:`, error);
          break;
        }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < size) break;
        from += size;
      }
      return { data: all };
    };

    const results = await Promise.all([
      fetchAll('sales', 'id, receita_gerada, data_fechamento, status, email_pipedrive, email_stripe'),
      fetchAll('meta_ads_costs', 'spend, impressions, date_start'),
      fetchAll('google_ads_costs', 'spend, impressions, clicks, conversions, date'),
      fetchAll('meta_ads_actions', 'action_type, value, date_start'),
      fetchAll('yayforms_responses', 'submitted_at, lead_email, lead_revenue_range, lead_monthly_volume, lead_segment'),
      fetchAll('crm_deals', 'deal_created_at, stage_id, status, value, custom_fields, person_email, won_time, deal_id, lost_reason'),
      fetchAll('crm_stage_transitions', 'deal_id, to_stage_id, time_in_previous_stage_sec')
    ]);

    const [
      { data: salesRaw },
      { data: metaAds },
      { data: googleAds },
      { data: metaActions },
      { data: leads },
      { data: dealsRaw },
      { data: stageTransitions }
    ] = results;

    const metricsByMonth = {};

    const getMonthKey = (dateStr) => {
      if (!dateStr) return null;
      // Handle different date formats
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        console.warn("Invalid date format:", dateStr);
        return null;
      }
      const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      const y = d.getUTCFullYear();
      const mKey = months[d.getUTCMonth()];
      return `${y}-${mKey}`;
    };

    const getWeekKey = (dateStr) => {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      const day = d.getUTCDate();
      if (day <= 7) return "s1";
      if (day <= 14) return "s2";
      if (day <= 21) return "s3";
      return "s4";
    };

    const initMetrics = () => ({
      g: { rec: 0, gAds: 0, roi: 0, mc: 0, pipe: 0, fatP: 0, recP: 0, vendas: 0, tmf: 0 },
      n: { imp: 0, cli: 0, vp: 0, ld: 0, mql: 0, sql: 0, rAg: 0, rRe: 0, v: 0 },
      p: { ctr: 0, cr: 0, cc: 0, qm: 0, qs: 0, ag: 0, su: 0, fc: 0, fs: 0 },
      f: { gAds: 0, cpL: 0, cpM: 0, cpS: 0, cpRA: 0, cpRR: 0, cpV: 0 },
      dt: { ms: 0, sr: 0, rv: 0, lv: 0 },
      perdas: { mql: [], sql: [], proposta: [] },
      _churnTemp: 0,
      _deltas: { ms: [], sr: [], rv: [], lv: [] }
    });

    const initMonth = (key) => {
      if (!metricsByMonth[key]) {
        metricsByMonth[key] = {
          ...initMetrics(),
          wk: {
            s1: initMetrics(),
            s2: initMetrics(),
            s3: initMetrics(),
            s4: initMetrics()
          }
        };
      }
      return metricsByMonth[key];
    };

    const updateMetrics = (m, row, val, type, field, wkKey) => {
      const v = Number(val || 0);
      m[type][field] += v;
      if (wkKey && m.wk[wkKey]) m.wk[wkKey][type][field] += v;
    };

    if (salesRaw) {
      salesRaw.forEach(s => {
        const mk = getMonthKey(s.data_fechamento);
        const wk = getWeekKey(s.data_fechamento);
        if (!mk) return;
        const m = initMonth(mk);

        // Receita e vendas: todas as vendas do período, sem filtro de email
        updateMetrics(m, s, s.receita_gerada, 'g', 'rec', wk);
        updateMetrics(m, s, 1, 'g', 'vendas', wk);
        updateMetrics(m, s, 1, 'n', 'v', wk);

        if (s.status === 'Churn') {
          m._churnTemp += Number(s.receita_gerada || 0);
          if (wk) m.wk[wk]._churnTemp += Number(s.receita_gerada || 0);
        }
      });
    }

    // Build sale date lookup by email for delta calculations
    const saleDateByEmail = {};
    if (salesRaw) {
      salesRaw.forEach(s => {
        const ep = s.email_pipedrive?.toLowerCase().trim();
        const es = s.email_stripe?.toLowerCase().trim();
        if (ep && s.data_fechamento) saleDateByEmail[ep] = s.data_fechamento;
        if (es && s.data_fechamento) saleDateByEmail[es] = s.data_fechamento;
      });
    }

    // Build stage transitions lookup by deal_id
    const transitionsByDeal = {};
    if (stageTransitions) {
      stageTransitions.forEach(t => {
        if (!transitionsByDeal[t.deal_id]) transitionsByDeal[t.deal_id] = [];
        transitionsByDeal[t.deal_id].push(t);
      });
    }

    if (metaAds) {
      metaAds.forEach(row => {
        const mk = getMonthKey(row.date_start);
        const wk = getWeekKey(row.date_start);
        if (!mk) return;
        const m = initMonth(mk);
        updateMetrics(m, row, row.spend, 'g', 'gAds', wk);
        updateMetrics(m, row, row.impressions, 'n', 'imp', wk);
      });
    }

    if (googleAds) {
      googleAds.forEach(row => {
        const mk = getMonthKey(row.date);
        const wk = getWeekKey(row.date);
        if (!mk) return;
        const m = initMonth(mk);
        updateMetrics(m, row, row.spend, 'g', 'gAds', wk);
        updateMetrics(m, row, row.impressions, 'n', 'imp', wk);
        updateMetrics(m, row, row.clicks, 'n', 'cli', wk);
        updateMetrics(m, row, row.conversions, 'n', 'vp', wk);
      });
    }

    if (metaActions) {
      metaActions.forEach(act => {
        const mk = getMonthKey(act.date_start);
        const wk = getWeekKey(act.date_start);
        if (!mk) return;
        const m = initMonth(mk);
        if (act.action_type === 'unique_outbound_outbound_click') updateMetrics(m, act, act.value, 'n', 'cli', wk);
        if (act.action_type === 'landing_page_view') updateMetrics(m, act, act.value, 'n', 'vp', wk);
      });
    }

    // # Lead = COUNT(*) de yayforms_responses
    // # MQL  = apenas respostas que passam nas regras de qualificação
    // Mapa email → data do lead (para usar como data base do SQL)
    const leadDateByEmail = {};
    if (leads) {
      leads.forEach(l => {
        const mk = getMonthKey(l.submitted_at);
        const wk = getWeekKey(l.submitted_at);
        if (!mk) return;
        const m = initMonth(mk);
        updateMetrics(m, l, 1, 'n', 'ld', wk);

        const classification = classifyLead(
          l.lead_revenue_range,
          l.lead_monthly_volume,
          l.lead_segment
        );
        if (classification === 'MQL') {
          updateMetrics(m, l, 1, 'n', 'mql', wk);
        }

        // Armazena a data do lead por email para uso na contagem de SQL
        if (l.lead_email) {
          const emailKey = l.lead_email.toLowerCase().trim();
          if (!leadDateByEmail[emailKey]) {
            leadDateByEmail[emailKey] = l.submitted_at;
          }
        }
      });
    }

    // Helper: custom_fields pode vir como string JSON ou como objeto.
    // Quando vem como string (sync via webhook), precisa de JSON.parse.
    const parseCustomFields = (cf) => {
      if (!cf) return {};
      if (typeof cf === 'string') {
        try { return JSON.parse(cf); } catch { return {}; }
      }
      return cf;
    };

    if (dealsRaw) {
      dealsRaw.forEach(d => {
        const mk = getMonthKey(d.deal_created_at);
        const wk = getWeekKey(d.deal_created_at);
        if (!mk) return;
        const m = initMonth(mk);

        // Pipeline Total: Sum(crm_deals.value) WHERE stage_id = 46
        if (d.stage_id === 46) updateMetrics(m, d, d.value, 'g', 'pipe', wk);

        // Motivos de perda
        if (d.status === 'lost' && d.lost_reason) {
          if ([1, 3, 49].includes(d.stage_id)) {
            m.perdas.mql.push(d.lost_reason);
            if (wk && m.wk[wk]) m.wk[wk].perdas.mql.push(d.lost_reason);
          } else if ([4, 50].includes(d.stage_id)) {
            m.perdas.sql.push(d.lost_reason);
            if (wk && m.wk[wk]) m.wk[wk].perdas.sql.push(d.lost_reason);
          } else if ([47].includes(d.stage_id)) {
            m.perdas.proposta.push(d.lost_reason);
            if (wk && m.wk[wk]) m.wk[wk].perdas.proposta.push(d.lost_reason);
          }
        }

        // SQL, Reuniões agendadas e realizadas — sem filtro de stage_id
        // Data base: data de criação do lead (fallback: deal_created_at)
        const cj = parseCustomFields(d.custom_fields);
        const isSQL = cj['2e17191cfb8e6f4a58359adc42a08965a068e8bc'] == '75';
        if (isSQL) {
          const dealEmail = d.person_email?.toLowerCase().trim();
          const leadDate = dealEmail ? leadDateByEmail[dealEmail] : null;
          const sqlDate = leadDate || d.deal_created_at;
          const sqlMk = getMonthKey(sqlDate);
          const sqlWk = getWeekKey(sqlDate);
          if (!sqlMk) return;
          const sqlM = initMonth(sqlMk);

          updateMetrics(sqlM, d, 1, 'n', 'sql', sqlWk);

          // Reunião agendada date (actual date stored in custom field)
          const agendamentoDate = cj['8eff24b00226da8dfb871caaf638b62af68bf16b'];
          if (agendamentoDate && agendamentoDate !== '') {
            updateMetrics(sqlM, d, 1, 'n', 'rAg', sqlWk);
          }

          // Reunião realizada: campo = '47'
          if (cj['baf2724fcbeec84a36e90f9dc3299431fe1b0dd3'] == '47') {
            updateMetrics(sqlM, d, 1, 'n', 'rRe', sqlWk);
          }

          // ── Delta Calculations ──
          const daysDiff = (d1, d2) => {
            if (!d1 || !d2) return null;
            const a = new Date(d1), b = new Date(d2);
            if (isNaN(a) || isNaN(b)) return null;
            const diff = Math.abs(b - a) / (1000 * 60 * 60 * 24);
            return Math.round(diff);
          };

          const dealTransitions = transitionsByDeal[d.deal_id] || [];

          // 1. MQL → SQL: transition into SQL stages (4, 50)
          const sqlTransition = dealTransitions.find(t => [4, 50].includes(t.to_stage_id) && t.time_in_previous_stage_sec);
          if (sqlTransition) {
            const dMs = Math.round(Number(sqlTransition.time_in_previous_stage_sec) / (60 * 60 * 24));
            sqlM._deltas.ms.push(dMs);
            if (sqlWk && sqlM.wk[sqlWk]) sqlM.wk[sqlWk]._deltas.ms.push(dMs);
          }

          // 2. SQL → Reunião agendada: transition into Meeting stages (6, 7, 45)
          const meetingTransition = dealTransitions.find(t => [6, 7, 45].includes(t.to_stage_id) && t.time_in_previous_stage_sec);
          if (meetingTransition) {
            const dSr = Math.round(Number(meetingTransition.time_in_previous_stage_sec) / (60 * 60 * 24));
            sqlM._deltas.sr.push(dSr);
            if (sqlWk && sqlM.wk[sqlWk]) sqlM.wk[sqlWk]._deltas.sr.push(dSr);
          }

          // 3. Reunião → Venda (Data Reunião agendada vs sales data_fechamento)
          const saleDate = dealEmail ? saleDateByEmail[dealEmail] : null;
          if (agendamentoDate && saleDate) {
            const dRv = daysDiff(agendamentoDate, saleDate);
            if (dRv !== null) {
              sqlM._deltas.rv.push(dRv);
              if (sqlWk && sqlM.wk[sqlWk]) sqlM.wk[sqlWk]._deltas.rv.push(dRv);
            }
          }

          // 4. Lead criação → Venda (deal_created_at vs sales data_fechamento)
          if (d.deal_created_at && saleDate) {
            const dLv = daysDiff(d.deal_created_at, saleDate);
            if (dLv !== null) {
              sqlM._deltas.lv.push(dLv);
              if (sqlWk && sqlM.wk[sqlWk]) sqlM.wk[sqlWk]._deltas.lv.push(dLv);
            }
          }
        }
      });
    }

    const finalize = (m) => {
      const { g, n, p, f } = m;
      g.roi = g.gAds > 0 ? g.rec / g.gAds : 0;
      g.mc = g.rec - (g.rec * 0.17) - m._churnTemp;
      g.fatP = g.pipe * 0.2;
      g.recP = g.rec + g.fatP;
      g.tmf = g.vendas > 0 ? g.rec / g.vendas : 0;
      f.gAds = g.gAds;
      
      const calcP = (num, den) => den > 0 ? num / den : 0;
      p.ctr = calcP(n.cli, n.imp);
      p.cr = calcP(n.vp, n.cli);
      p.cc = calcP(n.ld, n.vp);
      p.qm = calcP(n.mql, n.ld);
      p.qs = calcP(n.sql, n.mql);
      p.ag = calcP(n.rAg, n.sql);
      p.su = calcP(n.rRe, n.rAg); 
      p.fc = calcP(n.v, n.rRe);
      p.fs = calcP(n.v, n.sql);

      f.cpL = calcP(f.gAds, n.ld);
      f.cpM = calcP(f.gAds, n.mql);
      f.cpS = calcP(f.gAds, n.sql);
      f.cpRA = calcP(f.gAds, n.rAg);
      f.cpRR = calcP(f.gAds, n.rRe);
      f.cpV = calcP(f.gAds, n.v);

      // Average deltas
      const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
      if (m._deltas) {
        m.dt.ms = avg(m._deltas.ms);
        m.dt.sr = avg(m._deltas.sr);
        m.dt.rv = avg(m._deltas.rv);
        m.dt.lv = avg(m._deltas.lv);
      }

      // Top 3 Lost Reasons
      const summarizePerdas = (arr) => {
        if (!arr || arr.length === 0) return [];
        const counts = {};
        arr.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
        const total = arr.length;
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([r, c]) => ({ m: r, p: Math.round((c / total) * 100) }));
      };

      if (m.perdas) {
        m.perdas.mql = summarizePerdas(m.perdas.mql);
        m.perdas.sql = summarizePerdas(m.perdas.sql);
        m.perdas.proposta = summarizePerdas(m.perdas.proposta);
      }
    };

    // Finalize all months and their weeks
    Object.keys(metricsByMonth).forEach(mk => {
      const m = metricsByMonth[mk];
      finalize(m);
      Object.keys(m.wk).forEach(wkKey => finalize(m.wk[wkKey]));
    });

    return metricsByMonth;
  } catch (err) {
    console.error("Critical error in data service:", err);
    throw err;
  }
};

export const fetchLossReasons = async () => {
  const { data, error } = await supabase
    .from('crm_deals')
    .select('lost_reason')
    .not('lost_reason', 'is', null);
  
  if (error) throw error;
  return data;
};
