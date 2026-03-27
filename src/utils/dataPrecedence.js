import { normalizeEmail } from '@/services/fetchService';
import { parseCustomFields } from '@/config/pipedrive';

// ── Campos sobrepostos YayForms ↔ Pipedrive Custom Fields (FR75) ──
const OVERLAPPING_FIELDS = [
  { finalKey: 'mercado',           yayformsKey: 'lead_market',          pipedriveKey: '67379c059698d873059bc47534400700a9ea8e96' },
  { finalKey: 'segmento',          yayformsKey: 'lead_segment',         pipedriveKey: 'b41637438432b538c4e2a4dc64cb8c13ead0adae' },
  { finalKey: 'faturamento_anual', yayformsKey: 'lead_revenue_range',   pipedriveKey: 'bc3000625ae90adf41ab2e6892bb2d471c39c3ea' },
  { finalKey: 'volume_mensal',     yayformsKey: 'lead_monthly_volume',  pipedriveKey: '4c704211101661eebe0a5e86895738a2a2dd325a' },
];

function isFilled(value) {
  if (value == null) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' && trimmed.toLowerCase() !== 'n/a';
  }
  return true;
}

function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/\D/g, '');
}

/**
 * Resolve precedência YayForms/Pipedrive em batch (FR75, AD-V2-2).
 * @param {Array} deals - Array de deals do Pipedrive (com custom_fields, person_email, person_phone)
 * @param {Object} supabaseClient - Instância do Supabase (injetada, não importada)
 * @returns {Promise<Array>} deals enriquecidos com campos resolvidos
 */
export async function resolveBatch(deals, supabaseClient) {
  if (!deals?.length) return deals ?? [];

  try {
    // 1. Extrair emails normalizados de todos os deals
    const emailSet = new Set();
    for (const deal of deals) {
      const email = normalizeEmail(deal.person_email);
      if (email) emailSet.add(email);
    }
    const emails = [...emailSet];

    // 2. Batch query por email
    let submissions = [];
    if (emails.length > 0) {
      const { data, error } = await supabaseClient
        .from('yayforms_responses')
        .select('lead_email, lead_phone, lead_market, lead_segment, lead_revenue_range, lead_monthly_volume, time_to_complete_sec, created_at')
        .in('lead_email', emails);
      if (!error && data) submissions = data;
    }

    // 3. Montar mapa email → submissões (ordenadas por created_at DESC)
    const emailMap = {};
    for (const sub of submissions) {
      const key = normalizeEmail(sub.lead_email);
      if (!key) continue;
      if (!emailMap[key]) emailMap[key] = [];
      emailMap[key].push(sub);
    }
    for (const key of Object.keys(emailMap)) {
      emailMap[key].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    // 4. Extrair telefones de deals sem match por email
    const phoneSet = new Set();
    const dealsNeedPhone = [];
    for (const deal of deals) {
      const email = normalizeEmail(deal.person_email);
      if (!email || !emailMap[email]) {
        const phone = normalizePhone(deal.person_phone);
        if (phone) {
          phoneSet.add(phone);
          dealsNeedPhone.push(deal);
        }
      }
    }

    // 5. Batch query por telefone (se necessário)
    let phoneMap = {};
    const phones = [...phoneSet];
    if (phones.length > 0) {
      const { data, error } = await supabaseClient
        .from('yayforms_responses')
        .select('lead_email, lead_phone, lead_market, lead_segment, lead_revenue_range, lead_monthly_volume, time_to_complete_sec, created_at')
        .in('lead_phone', phones);
      if (!error && data) {
        for (const sub of data) {
          const key = normalizePhone(sub.lead_phone);
          if (!key) continue;
          if (!phoneMap[key]) phoneMap[key] = [];
          phoneMap[key].push(sub);
        }
        for (const key of Object.keys(phoneMap)) {
          phoneMap[key].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        }
      }
    }

    // 6. Para cada deal, resolver cada campo duplicado
    return deals.map(deal => {
      const email = normalizeEmail(deal.person_email);
      const phone = normalizePhone(deal.person_phone);
      const subs = emailMap[email] || phoneMap[phone] || [];
      const cf = parseCustomFields(deal.custom_fields);

      const enriched = { ...deal };

      // Resolver time_to_complete_sec do YayForms (mais recente com valor preenchido)
      for (const sub of subs) {
        if (sub.time_to_complete_sec != null) {
          enriched.time_to_complete_sec = Number(sub.time_to_complete_sec);
          break;
        }
      }

      for (const field of OVERLAPPING_FIELDS) {
        // a. Percorrer submissões (mais recente primeiro)
        let resolved = null;
        for (const sub of subs) {
          if (isFilled(sub[field.yayformsKey])) {
            resolved = sub[field.yayformsKey];
            break;
          }
        }
        // b. Fallback custom field Pipedrive
        if (!isFilled(resolved)) {
          resolved = cf?.[field.pipedriveKey] ?? null;
        }
        // c. Campo final sem sufixo de fonte
        enriched[field.finalKey] = resolved;
      }
      return enriched;
    });
  } catch (err) {
    console.error('[dataPrecedence] resolveBatch error:', err);
    return deals;
  }
}
