import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function — Webhook receptor do YayForms
 *
 * Endpoint: POST /api/webhook/yayforms
 *
 * Aceita dois formatos:
 *   1. Payload direto do YayForms (objeto com campos do formulário)
 *   2. Batch de respostas (array de objetos)
 *
 * Headers:
 *   Authorization: Bearer <WEBHOOK_SECRET>  (obrigatório em produção)
 *
 * Env vars necessárias:
 *   SUPABASE_URL          — URL do projeto Supabase
 *   SUPABASE_SERVICE_KEY  — Service role key (bypassa RLS)
 *   WEBHOOK_SECRET        — Secret para autenticar requests
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) {
  console.error('[webhook/yayforms] SUPABASE_SERVICE_KEY is required — anon key cannot bypass RLS.');
}
const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

// ID do formulário de qualificação no YayForms
const YAYFORMS_FORM_ID = '67dd8ecb3751a8ff2908bc64';

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizeEmail(e) {
  return (e || '').trim().toLowerCase();
}

/**
 * Mapeia payload do YayForms (campos do form) → schema do Supabase.
 * Suporta tanto o formato de webhook (chaves em português com acentos)
 * quanto um formato já normalizado (chaves snake_case).
 */
function mapPayload(raw) {
  // Se já veio no formato Supabase (backfill), aceita direto
  if (raw.lead_email && raw.submitted_at) {
    return {
      external_id: raw.external_id || raw.id || raw._id || undefined,
      form_id: raw.form_id || YAYFORMS_FORM_ID,
      lead_email: normalizeEmail(raw.lead_email),
      submitted_at: raw.submitted_at,
      lead_revenue_range: raw.lead_revenue_range || null,
      lead_monthly_volume: raw.lead_monthly_volume || null,
      lead_segment: raw.lead_segment || null,
      lead_market: raw.lead_market || null,
      lead_phone: raw.lead_phone || null,
      time_to_complete_sec: raw.time_to_complete_sec ?? null,
      raw_payload: raw,
      ingested_at: new Date().toISOString(),
    };
  }

  // Formato YayForms webhook (chaves do CSV / formulário)
  const email = normalizeEmail(
    raw['Melhor E-mail para acesso à plataforma:'] ||
    raw['email'] ||
    raw['lead_email'] ||
    ''
  );

  const submittedAt =
    raw['Enviado às'] ||
    raw['submitted_at'] ||
    new Date().toISOString();

  const startedAt = raw['Começou às'] || raw['started_at'] || null;

  let timeToComplete = null;
  if (startedAt && submittedAt) {
    const diff = new Date(submittedAt) - new Date(startedAt);
    if (diff > 0) timeToComplete = Math.round(diff / 1000);
  }

  if (!email) return null;

  return {
    // external_id e form_id têm DEFAULT no banco — não precisamos enviar
    external_id: raw.id || raw._id || raw.external_id || undefined,
    form_id: raw.form_id || YAYFORMS_FORM_ID,
    lead_email: email,
    submitted_at: submittedAt,
    started_at: startedAt,
    lead_revenue_range:
      raw['Quanto foi o faturamento da sua empresa nos últimos 12 meses?'] ||
      raw['lead_revenue_range'] ||
      null,
    lead_monthly_volume:
      raw['Quantos novos leads, clientes ou tickets de atendimento você gera, em média, por mês?'] ||
      raw['lead_monthly_volume'] ||
      null,
    lead_segment:
      raw['Qual é o segmento do seu negócio?'] ||
      raw['lead_segment'] ||
      null,
    lead_market:
      raw['Qual mercado você trabalha atualmente?'] ||
      raw['lead_market'] ||
      null,
    lead_phone:
      raw['WhatsApp (para suporte exclusivo e rápido):'] ||
      raw['lead_phone'] ||
      null,
    time_to_complete_sec: timeToComplete,
    raw_payload: raw,
    ingested_at: new Date().toISOString(),
  };
}

/**
 * Remove campos undefined do objeto para que o Supabase use os DEFAULTs.
 */
function cleanUndefined(obj) {
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
}

// ─── Dedup check: existe registro com mesmo email nos últimos 5 min? ───────

async function isDuplicate(email, submittedAt) {
  const ts = new Date(submittedAt);
  const fiveMinBefore = new Date(ts.getTime() - 5 * 60 * 1000).toISOString();
  const fiveMinAfter = new Date(ts.getTime() + 5 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('yayforms_responses')
    .select('lead_email')
    .eq('lead_email', email)
    .gte('submitted_at', fiveMinBefore)
    .lte('submitted_at', fiveMinAfter)
    .limit(1);

  if (error) {
    console.error('[isDuplicate] Supabase error — accepting record to prevent data loss:', error);
    return false;
  }
  return data && data.length > 0;
}

// ─── Handler ───────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS — webhook é server-to-server, restringir origin
  const allowedOrigin = process.env.WEBHOOK_CORS_ORIGIN || '';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Fail fast se Supabase não configurado
  if (!supabase) {
    return res.status(500).json({ error: 'Server misconfiguration: missing SUPABASE_SERVICE_KEY' });
  }

  // Auth check — obrigatório em produção
  if (!WEBHOOK_SECRET && process.env.VERCEL_ENV === 'production') {
    console.error('[webhook/yayforms] WEBHOOK_SECRET not set in production — rejecting request');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }
  if (WEBHOOK_SECRET) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || token !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const body = req.body;
    if (!body) return res.status(400).json({ error: 'Empty request body' });
    const items = Array.isArray(body) ? body : [body];

    const results = { inserted: 0, skipped_dup: 0, skipped_invalid: 0, errors: [] };

    // Processar em batches de 50 para não estourar timeout
    const BATCH_SIZE = 50;
    const mapped = items.map(mapPayload).filter(Boolean).map(cleanUndefined);
    const toInsert = [];

    // Dedup check contra Supabase
    for (const record of mapped) {
      const dup = await isDuplicate(record.lead_email, record.submitted_at);
      if (dup) {
        results.skipped_dup++;
      } else {
        toInsert.push(record);
      }
    }

    results.skipped_invalid = items.length - mapped.length;

    // Insert em batches
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('yayforms_responses')
        .insert(batch);

      if (error) {
        console.error('Insert error:', error);
        results.errors.push(error.message);
      } else {
        results.inserted += batch.length;
      }
    }

    const status = results.errors.length > 0 ? 207 : 200;
    return res.status(status).json({
      ok: results.errors.length === 0,
      total_received: items.length,
      ...results,
    });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
