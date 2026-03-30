import { supabase } from './supabaseClient';
import {
  STAGE_IDS,
  CUSTOM_FIELDS,
  PIPELINE_FUNNELS,
  FUNNEL_LABELS,
  getFunnelKey,
  parseCustomFields,
} from '@/config/pipedrive';
import { fetchAll } from './fetchService';
import { classifyLead } from './classificationService';

/**
 * Data Service for Dash AwSales
 * Orchestrates data fetching and metric aggregation.
 *
 * Supports two view modes:
 *   - "performance": metrics attributed to when the event happened
 *   - "criacao": metrics attributed to when the lead/deal was created (cohort view)
 */

// Re-export for consumers that import from dataService
export { PIPELINE_FUNNELS, FUNNEL_LABELS };

// Active funnel configuration (FR11, FR26, FR27, AD-4)
export const FUNNEL_CONFIG = {
  inbound:        { label: 'Inbound',          pipelines: PIPELINE_FUNNELS.inbound,        hasSpending: true },
  indicacao:      { label: 'Indicação',        pipelines: PIPELINE_FUNNELS.indicacao,      hasSpending: false },
  wordwild:       { label: 'Word Wild',        pipelines: PIPELINE_FUNNELS.wordwild,       hasSpending: false },
  revenueleakage: { label: 'Revenue Leakage',  pipelines: PIPELINE_FUNNELS.revenueleakage, hasSpending: false },
};

export const fetchMonthlyMetrics = async () => {
  try {
    const TABLE_NAMES = ['sales', 'meta_ads_costs', 'google_ads_costs', 'meta_ads_actions', 'yayforms_responses', 'crm_deals', 'crm_stage_transitions'];
    const settled = await Promise.allSettled([
      fetchAll('sales', 'id, receita_gerada, data_fechamento, status, email_pipedrive, email_stripe'),
      fetchAll('meta_ads_costs', 'spend, impressions, date_start'),
      fetchAll('google_ads_costs', 'spend, impressions, clicks, conversions, date'),
      fetchAll('meta_ads_actions', 'action_type, value, date_start'),
      fetchAll('yayforms_responses', 'submitted_at, lead_email, lead_revenue_range, lead_monthly_volume, lead_segment, lead_market'),
      fetchAll('crm_deals', 'deal_created_at, stage_id, pipeline_id, status, value, custom_fields, person_email, won_time, deal_id, lost_reason'),
      fetchAll('crm_stage_transitions', 'deal_id, to_stage_id, time_in_previous_stage_sec')
    ]);

    let _partialData = false;
    const results = settled.map((result, i) => {
      if (result.status === 'fulfilled') {
        if (result.value.error) {
          console.warn(`[dataService] Tabela "${TABLE_NAMES[i]}" retornou com erro — usando dados parciais`);
          _partialData = true;
        }
        return result.value;
      }
      console.warn(`[dataService] Fetch da tabela "${TABLE_NAMES[i]}" falhou:`, result.reason);
      _partialData = true;
      return { data: [], error: true };
    });

    const [
      { data: salesRaw },
      { data: metaAds },
      { data: googleAds },
      { data: metaActions },
      { data: leads },
      { data: dealsRaw },
      { data: stageTransitions }
    ] = results;

    // ── Pre-compute shared lookup maps (used by both modes) ─────

    const dealDateByEmail = {};
    const dealFunnelByEmail = {};
    if (dealsRaw) {
      dealsRaw.forEach(d => {
        if (d.person_email && d.deal_created_at) {
          const emailKey = d.person_email.toLowerCase().trim();
          if (!dealDateByEmail[emailKey]) dealDateByEmail[emailKey] = d.deal_created_at;
          // Funnel assignment: specific funnels (indicacao, wordwild) take priority over inbound
          const fk = getFunnelKey(d.pipeline_id) || 'inbound';
          const existing = dealFunnelByEmail[emailKey];
          if (!existing || (existing === 'inbound' && fk !== 'inbound')) {
            dealFunnelByEmail[emailKey] = fk;
          }
        }
      });
    }

    const saleDateByEmail = {};
    if (salesRaw) {
      salesRaw.forEach(s => {
        const ep = s.email_pipedrive?.toLowerCase().trim();
        const es = s.email_stripe?.toLowerCase().trim();
        if (ep && s.data_fechamento) saleDateByEmail[ep] = s.data_fechamento;
        if (es && s.data_fechamento) saleDateByEmail[es] = s.data_fechamento;
      });
    }

    const transitionsByDeal = {};
    if (stageTransitions) {
      stageTransitions.forEach(t => {
        if (!transitionsByDeal[t.deal_id]) transitionsByDeal[t.deal_id] = [];
        transitionsByDeal[t.deal_id].push(t);
      });
    }

    const leadDateByEmail = {};
    if (leads) {
      leads.forEach(l => {
        if (l.lead_email) {
          const emailKey = l.lead_email.toLowerCase().trim();
          if (!leadDateByEmail[emailKey]) leadDateByEmail[emailKey] = l.submitted_at;
        }
      });
    }

    // ── Process metrics for a given view mode ───────────────────
    const processMode = (mode) => {
      const metricsByMonth = {};
      const metricsByMonthByFunnel = Object.fromEntries(
        Object.keys(PIPELINE_FUNNELS).map(k => [k, {}])
      );

      const getMonthKey = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
        return `${d.getUTCFullYear()}-${months[d.getUTCMonth()]}`;
      };

      const getWeekKey = (dateStr) => {
        if (!dateStr) return null;
        const day = new Date(dateStr).getUTCDate();
        if (isNaN(day)) return null;
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

      const initMonthInMap = (map, key) => {
        if (!map[key]) {
          map[key] = {
            ...initMetrics(),
            wk: { s1: initMetrics(), s2: initMetrics(), s3: initMetrics(), s4: initMetrics() }
          };
        }
        return map[key];
      };

      const initMonth = (key) => initMonthInMap(metricsByMonth, key);

      const updateMetrics = (m, row, val, type, field, wkKey) => {
        const v = Number(val || 0);
        m[type][field] += v;
        if (wkKey && m.wk[wkKey]) m.wk[wkKey][type][field] += v;
      };

      // ── Process salesRaw (mode-aware) ──────────────────────────
      if (salesRaw) {
        salesRaw.forEach(s => {
          const emailPipe = s.email_pipedrive?.toLowerCase().trim();
          const emailStripe = s.email_stripe?.toLowerCase().trim();

          // Date for g.rec, g.vendas (revenue cards)
          let recDate;
          if (mode === 'criacao') {
            // Criação: use deal_created_at (cohort view); skip sale if no CRM match
            recDate = (emailPipe && dealDateByEmail[emailPipe])
              || (emailStripe && dealDateByEmail[emailStripe]);
            if (!recDate) return;
          } else {
            recDate = s.data_fechamento;
          }

          // Resolve funnel from deal lookup (FR26, FR27, AD-4)
          const saleFunnel = (emailPipe && dealFunnelByEmail[emailPipe])
            || (emailStripe && dealFunnelByEmail[emailStripe])
            || 'inbound';

          const mk = getMonthKey(recDate);
          const wk = getWeekKey(recDate);
          if (!mk) return;
          const m = initMonth(mk);
          const mi = initMonthInMap(metricsByMonthByFunnel[saleFunnel], mk);

          updateMetrics(m, s, s.receita_gerada, 'g', 'rec', wk);
          updateMetrics(m, s, 1, 'g', 'vendas', wk);
          updateMetrics(mi, s, s.receita_gerada, 'g', 'rec', wk);
          updateMetrics(mi, s, 1, 'g', 'vendas', wk);

          // Date for n.v (# Vendas in Números)
          // Criação: attribute to deal_created_at (cohort); Performance: data_fechamento
          let nvDate;
          if (mode === 'criacao') {
            nvDate = (emailPipe && dealDateByEmail[emailPipe])
              || (emailStripe && dealDateByEmail[emailStripe]);
            // No CRM match → skip n.v only (cards already counted above)
          } else {
            nvDate = s.data_fechamento;
          }

          if (nvDate) {
            const nMk = getMonthKey(nvDate);
            const nWk = getWeekKey(nvDate);
            if (nMk) {
              const nM = initMonth(nMk);
              const nMi = initMonthInMap(metricsByMonthByFunnel[saleFunnel], nMk);
              updateMetrics(nM, s, 1, 'n', 'v', nWk);
              updateMetrics(nMi, s, 1, 'n', 'v', nWk);
            }
          }

          // Churn follows same date as g.rec for mc consistency
          if (s.status === 'Churn') {
            m._churnTemp += Number(s.receita_gerada || 0);
            if (wk) m.wk[wk]._churnTemp += Number(s.receita_gerada || 0);
            mi._churnTemp += Number(s.receita_gerada || 0);
            if (wk) mi.wk[wk]._churnTemp += Number(s.receita_gerada || 0);
          }
        });
      }

      // ── Process Meta Ads (same for both modes) ─────────────────
      if (metaAds) {
        metaAds.forEach(row => {
          const mk = getMonthKey(row.date_start);
          const wk = getWeekKey(row.date_start);
          if (!mk) return;
          const m = initMonth(mk);
          const mi = initMonthInMap(metricsByMonthByFunnel['inbound'], mk);
          updateMetrics(m, row, row.spend, 'g', 'gAds', wk);
          updateMetrics(m, row, row.impressions, 'n', 'imp', wk);
          updateMetrics(mi, row, row.spend, 'g', 'gAds', wk);
          updateMetrics(mi, row, row.impressions, 'n', 'imp', wk);
        });
      }

      // ── Process Google Ads (same for both modes) ───────────────
      if (googleAds) {
        googleAds.forEach(row => {
          const mk = getMonthKey(row.date);
          const wk = getWeekKey(row.date);
          if (!mk) return;
          const m = initMonth(mk);
          const mi = initMonthInMap(metricsByMonthByFunnel['inbound'], mk);
          updateMetrics(m, row, row.spend, 'g', 'gAds', wk);
          updateMetrics(m, row, row.impressions, 'n', 'imp', wk);
          updateMetrics(m, row, row.clicks, 'n', 'cli', wk);
          updateMetrics(m, row, row.conversions, 'n', 'vp', wk);
          updateMetrics(mi, row, row.spend, 'g', 'gAds', wk);
          updateMetrics(mi, row, row.impressions, 'n', 'imp', wk);
          updateMetrics(mi, row, row.clicks, 'n', 'cli', wk);
          updateMetrics(mi, row, row.conversions, 'n', 'vp', wk);
        });
      }

      // ── Process Meta Actions (same for both modes) ─────────────
      if (metaActions) {
        metaActions.forEach(act => {
          const mk = getMonthKey(act.date_start);
          const wk = getWeekKey(act.date_start);
          if (!mk) return;
          const m = initMonth(mk);
          const mi = initMonthInMap(metricsByMonthByFunnel['inbound'], mk);
          if (act.action_type === 'unique_outbound_outbound_click') {
            updateMetrics(m, act, act.value, 'n', 'cli', wk);
            updateMetrics(mi, act, act.value, 'n', 'cli', wk);
          }
          if (act.action_type === 'landing_page_view') {
            updateMetrics(m, act, act.value, 'n', 'vp', wk);
            updateMetrics(mi, act, act.value, 'n', 'vp', wk);
          }
        });
      }

      // ── Process Leads / YayForms (same for both modes) ─────────
      if (leads) {
        leads.forEach(l => {
          const mk = getMonthKey(l.submitted_at);
          const wk = getWeekKey(l.submitted_at);
          if (!mk) return;
          const m = initMonth(mk);
          // YayForms only contains Inbound leads; Indicação/WD leads come from CRM only
          const leadFunnel = 'inbound';
          const mi = initMonthInMap(metricsByMonthByFunnel[leadFunnel], mk);
          updateMetrics(m, l, 1, 'n', 'ld', wk);
          updateMetrics(mi, l, 1, 'n', 'ld', wk);

          const classification = classifyLead(
            l.lead_revenue_range,
            l.lead_monthly_volume,
            l.lead_segment,
            l.lead_market
          );
          if (classification === 'MQL') {
            updateMetrics(m, l, 1, 'n', 'mql', wk);
            updateMetrics(mi, l, 1, 'n', 'mql', wk);
          }
        });
      }

      // ── Process CRM Deals (mode-aware for SQL/reunião dates) ───
      if (dealsRaw) {
        dealsRaw.forEach(d => {
          const baseMk = getMonthKey(d.deal_created_at);
          const baseWk = getWeekKey(d.deal_created_at);
          if (!baseMk) return;
          const m = initMonth(baseMk);
          const fk = getFunnelKey(d.pipeline_id);
          const mf = fk ? initMonthInMap(metricsByMonthByFunnel[fk], baseMk) : null;

          // Pipeline Total: always by deal_created_at
          if (STAGE_IDS.PIPELINE_TOTAL.includes(d.stage_id)) {
            updateMetrics(m, d, d.value, 'g', 'pipe', baseWk);
            if (mf) updateMetrics(mf, d, d.value, 'g', 'pipe', baseWk);
          }

          // Motivos de perda: always by deal_created_at
          if (d.status === 'lost' && d.lost_reason) {
            if (STAGE_IDS.MQL.includes(d.stage_id)) {
              m.perdas.mql.push(d.lost_reason);
              if (baseWk && m.wk[baseWk]) m.wk[baseWk].perdas.mql.push(d.lost_reason);
              if (mf) { mf.perdas.mql.push(d.lost_reason); if (baseWk && mf.wk[baseWk]) mf.wk[baseWk].perdas.mql.push(d.lost_reason); }
            }
            else if (STAGE_IDS.SQL.includes(d.stage_id) || STAGE_IDS.REUNIAO_AGENDADA.includes(d.stage_id)) {
              m.perdas.sql.push(d.lost_reason);
              if (baseWk && m.wk[baseWk]) m.wk[baseWk].perdas.sql.push(d.lost_reason);
              if (mf) { mf.perdas.sql.push(d.lost_reason); if (baseWk && mf.wk[baseWk]) mf.wk[baseWk].perdas.sql.push(d.lost_reason); }
            }
            else if (STAGE_IDS.PROPOSTA.includes(d.stage_id) || STAGE_IDS.CONTRATO_ENVIADO.includes(d.stage_id)) {
              m.perdas.proposta.push(d.lost_reason);
              if (baseWk && m.wk[baseWk]) m.wk[baseWk].perdas.proposta.push(d.lost_reason);
              if (mf) { mf.perdas.proposta.push(d.lost_reason); if (baseWk && mf.wk[baseWk]) mf.wk[baseWk].perdas.proposta.push(d.lost_reason); }
            }
          }

          // FR22: parseCustomFields always returns {} for null/invalid — safe to index
          const cj = parseCustomFields(d.custom_fields);
          // AC2: SQL_FLAG absent/null/undefined => isSQL defaults to false (no false positive)
          const isSQL = (cj[CUSTOM_FIELDS.SQL_FLAG.key] ?? null) == CUSTOM_FIELDS.SQL_FLAG.values.SIM;

          if (isSQL) {
            // ── SQL date (mode-aware) ──
            let sqlMk, sqlWk;
            if (mode === 'performance') {
              const dataQual = cj[CUSTOM_FIELDS.DATA_QUALIFICACAO.key];
              sqlMk = (dataQual && getMonthKey(dataQual)) || baseMk;
              sqlWk = (dataQual && getWeekKey(dataQual)) || baseWk;
            } else {
              sqlMk = baseMk;
              sqlWk = baseWk;
            }

            const sqlM = initMonth(sqlMk);
            const sqlMf = fk ? initMonthInMap(metricsByMonthByFunnel[fk], sqlMk) : null;

            updateMetrics(sqlM, d, 1, 'n', 'sql', sqlWk);
            if (sqlMf) updateMetrics(sqlMf, d, 1, 'n', 'sql', sqlWk);

            // ── Reunião agendada (mode-aware) ──
            const agendamentoDate = cj[CUSTOM_FIELDS.DATA_REUNIAO.key];
            if (agendamentoDate && agendamentoDate !== '') {
              let rAgMk, rAgWk;
              if (mode === 'performance') {
                rAgMk = getMonthKey(agendamentoDate) || sqlMk;
                rAgWk = getWeekKey(agendamentoDate) || sqlWk;
              } else {
                rAgMk = baseMk;
                rAgWk = baseWk;
              }
              const rAgM = initMonth(rAgMk);
              const rAgMf = fk ? initMonthInMap(metricsByMonthByFunnel[fk], rAgMk) : null;
              updateMetrics(rAgM, d, 1, 'n', 'rAg', rAgWk);
              if (rAgMf) updateMetrics(rAgMf, d, 1, 'n', 'rAg', rAgWk);
            }

            // ── Reunião realizada (mode-aware) ──
            // AC5: REUNIAO_REALIZADA absent/null/undefined => reuniaoRealizada defaults to false
            const reuniaoRealizada = (cj[CUSTOM_FIELDS.REUNIAO_REALIZADA.key] ?? null) == CUSTOM_FIELDS.REUNIAO_REALIZADA.values.SIM;
            if (reuniaoRealizada) {
              let rReMk, rReWk;
              if (mode === 'performance') {
                rReMk = (agendamentoDate && getMonthKey(agendamentoDate)) || sqlMk;
                rReWk = (agendamentoDate && getWeekKey(agendamentoDate)) || sqlWk;
              } else {
                rReMk = baseMk;
                rReWk = baseWk;
              }
              const rReM = initMonth(rReMk);
              const rReMf = fk ? initMonthInMap(metricsByMonthByFunnel[fk], rReMk) : null;
              updateMetrics(rReM, d, 1, 'n', 'rRe', rReWk);
              if (rReMf) updateMetrics(rReMf, d, 1, 'n', 'rRe', rReWk);
            }

            // ── Delta Calculations (always by deal_created_at) ──
            const daysDiff = (d1, d2) => {
              if (!d1 || !d2) return null;
              const a = new Date(d1), b = new Date(d2);
              if (isNaN(a) || isNaN(b)) return null;
              return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
            };

            const deltaM = initMonth(baseMk);
            const deltaMf = fk ? initMonthInMap(metricsByMonthByFunnel[fk], baseMk) : null;
            const dealTransitions = transitionsByDeal[d.deal_id] || [];
            const dealEmail = d.person_email?.toLowerCase().trim();
            const saleDate = dealEmail ? saleDateByEmail[dealEmail] : null;

            // 1. MQL → SQL
            const dataQualificacao = cj[CUSTOM_FIELDS.DATA_QUALIFICACAO.key];
            if (dataQualificacao && d.deal_created_at) {
              const dMs = daysDiff(d.deal_created_at, dataQualificacao);
              if (dMs !== null) {
                deltaM._deltas.ms.push(dMs);
                if (baseWk && deltaM.wk[baseWk]) deltaM.wk[baseWk]._deltas.ms.push(dMs);
                if (deltaMf) { deltaMf._deltas.ms.push(dMs); if (baseWk && deltaMf.wk[baseWk]) deltaMf.wk[baseWk]._deltas.ms.push(dMs); }
              }
            }

            const sqlTransition = dealTransitions.find(t =>
              STAGE_IDS.SQL.includes(t.to_stage_id) && t.time_in_previous_stage_sec
            );

            // 2. Data Qualificação → Reunião Agendada (para SQLs)
            if (dataQualificacao && agendamentoDate) {
              const dSr = daysDiff(dataQualificacao, agendamentoDate);
              if (dSr !== null) {
                deltaM._deltas.sr.push(dSr);
                if (baseWk && deltaM.wk[baseWk]) deltaM.wk[baseWk]._deltas.sr.push(dSr);
                if (deltaMf) { deltaMf._deltas.sr.push(dSr); if (baseWk && deltaMf.wk[baseWk]) deltaMf.wk[baseWk]._deltas.sr.push(dSr); }
              }
            }

            // 3. Reunião Agendada → Venda (FR14: Reunião→Venda)
            if (agendamentoDate && saleDate) {
              const dRv = daysDiff(agendamentoDate, saleDate);
              if (dRv !== null) {
                deltaM._deltas.rv.push(dRv);
                if (baseWk && deltaM.wk[baseWk]) deltaM.wk[baseWk]._deltas.rv.push(dRv);
                if (deltaMf) { deltaMf._deltas.rv.push(dRv); if (baseWk && deltaMf.wk[baseWk]) deltaMf.wk[baseWk]._deltas.rv.push(dRv); }
              }
            }

            // 4. Criação do lead → Venda
            if (d.deal_created_at && saleDate) {
              const dLv = daysDiff(d.deal_created_at, saleDate);
              if (dLv !== null) {
                deltaM._deltas.lv.push(dLv);
                if (baseWk && deltaM.wk[baseWk]) deltaM.wk[baseWk]._deltas.lv.push(dLv);
                if (deltaMf) { deltaMf._deltas.lv.push(dLv); if (baseWk && deltaMf.wk[baseWk]) deltaMf.wk[baseWk]._deltas.lv.push(dLv); }
              }
            }
          }
        });
      }

      // ── Finalize ───────────────────────────────────────────────
      const finalize = (m) => {
        const { g, n, p, f } = m;
        g.roi = g.gAds > 0 ? g.rec / g.gAds : 0;
        g.mc = g.rec - (g.rec * 0.095) - m._churnTemp;
        g.fatP = g.pipe * 0.2;
        g.recP = g.rec + g.fatP;
        g.tmf = g.vendas > 0 ? g.rec / g.vendas : 0;
        f.gAds = g.gAds;

        const calcP = (num, den) => den > 0 ? num / den : (num === 0 ? null : 0);
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

        const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
        if (m._deltas) {
          m.dt.ms = avg(m._deltas.ms);
          m.dt.sr = avg(m._deltas.sr);
          m.dt.rv = avg(m._deltas.rv);
          m.dt.lv = avg(m._deltas.lv);
        }

        const summarizePerdas = (arr) => {
          if (!arr || arr.length === 0) return [];
          const counts = {};
          arr.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
          const total = arr.length;
          return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([r, c]) => ({ m: r, p: Math.round((c / total) * 100), c }));
        };

        if (m.perdas) {
          m.perdas.mql = summarizePerdas(m.perdas.mql);
          m.perdas.sql = summarizePerdas(m.perdas.sql);
          m.perdas.proposta = summarizePerdas(m.perdas.proposta);
        }
      };

      const finalizeMap = (map) => {
        Object.keys(map).forEach(mk => {
          const m = map[mk];
          finalize(m);
          Object.keys(m.wk).forEach(wkKey => finalize(m.wk[wkKey]));
        });
      };
      finalizeMap(metricsByMonth);
      Object.values(metricsByMonthByFunnel).forEach(finalizeMap);

      return { all: metricsByMonth, funnels: metricsByMonthByFunnel };
    };

    return {
      performance: processMode('performance'),
      criacao: processMode('criacao'),
      _partialData
    };
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
