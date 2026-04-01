import { normalizeEmail } from '@/services/fetchService';
import { parseCustomFields } from '@/config/pipedrive';
import { cachedQuery } from '@/services/queryCache'; // AD-V2-8

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
    // 1. Extrair emails e telefones normalizados de todos os deals
    const emailSet = new Set();
    const phoneSet = new Set();
    for (const deal of deals) {
      const email = normalizeEmail(deal.person_email);
      if (email) emailSet.add(email);
      const phone = normalizePhone(deal.person_phone);
      if (phone) phoneSet.add(phone);
    }
    const emails = [...emailSet];
    const phones = [...phoneSet];

    // Se não há emails nem telefones, bypass cache (nada a enriquecer via YayForms)
    if (!emails.length && !phones.length) return deals;

    // 2. Cache key determinística baseada nos emails e telefones (AD-V2-8)
    const sortedEmails = emails.sort();
    const emailKeyPart = sortedEmails.length > 50
      ? sortedEmails.slice(0, 50).join(',') + `:+${sortedEmails.length}`
      : sortedEmails.join(',');

    const sortedPhones = phones.sort();
    const phoneKeyPart = sortedPhones.length > 50
      ? sortedPhones.slice(0, 50).join(',') + `:+${sortedPhones.length}`
      : sortedPhones.join(',');

    const cacheKey = `resolve:e=${emailKeyPart}|p=${phoneKeyPart}`;

    // 3. Cachear apenas o lookup YayForms (emailMap + phoneMap) — 10 min TTL
    const { emailMap, phoneMap } = await cachedQuery(cacheKey, async () => {
      // Batch query por email
      let submissions = [];
      if (emails.length > 0) {
        const { data, error } = await supabaseClient
          .from('yayforms_responses')
          .select('lead_email, lead_phone, lead_market, lead_segment, lead_revenue_range, lead_monthly_volume, time_to_complete_sec, created_at')
          .in('lead_email', emails);
        if (!error && data) submissions = data;
      }

      // Montar mapa email → submissões (ordenadas por created_at DESC)
      const _emailMap = {};
      for (const sub of submissions) {
        const key = normalizeEmail(sub.lead_email);
        if (!key) continue;
        if (!_emailMap[key]) _emailMap[key] = [];
        _emailMap[key].push(sub);
      }
      for (const key of Object.keys(_emailMap)) {
        _emailMap[key].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      }

      // Extrair telefones de deals sem match por email
      const fallbackPhoneSet = new Set();
      for (const deal of deals) {
        const email = normalizeEmail(deal.person_email);
        if (!email || !_emailMap[email]) {
          const phone = normalizePhone(deal.person_phone);
          if (phone) fallbackPhoneSet.add(phone);
        }
      }

      // Batch query por telefone (se necessário)
      const _phoneMap = {};
      const fallbackPhones = [...fallbackPhoneSet];
      if (fallbackPhones.length > 0) {
        const { data, error } = await supabaseClient
          .from('yayforms_responses')
          .select('lead_email, lead_phone, lead_market, lead_segment, lead_revenue_range, lead_monthly_volume, time_to_complete_sec, created_at')
          .in('lead_phone', fallbackPhones);
        if (!error && data) {
          for (const sub of data) {
            const key = normalizePhone(sub.lead_phone);
            if (!key) continue;
            if (!_phoneMap[key]) _phoneMap[key] = [];
            _phoneMap[key].push(sub);
          }
          for (const key of Object.keys(_phoneMap)) {
            _phoneMap[key].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          }
        }
      }

      return { emailMap: _emailMap, phoneMap: _phoneMap };
    }, 10 * 60 * 1000); // 10 min TTL — AD-V2-8

    // 4. Resolução — sempre roda com deals atuais + maps cacheados
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
