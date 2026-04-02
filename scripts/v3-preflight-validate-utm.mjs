#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Load .env ─────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch (e) {
  // console.warn('⚠️  Não encontrou .env');
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL e SUPABASE_KEY são obrigatórios.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('🔍 Preflight V3: Validando UTM Mapping no Supabase\n');

  // 1. Check yayforms_responses columns
  console.log('--- [1] yayforms_responses ---');
  const { data: yayData, error: yayError } = await supabase
    .from('yayforms_responses')
    .select('utm_source, utm_campaign, utm_medium, utm_content')
    .limit(10);

  if (yayError) {
    console.error('❌ Erro ao ler yayforms_responses:', yayError.message);
  } else {
    console.log('✅ yayforms_responses tem colunas UTM.');
    console.log('   Exemplos de utm_campaign:', [...new Set(yayData.map(d => d.utm_campaign).filter(Boolean))].slice(0, 3));
  }

  // 2. Check crm_deals columns
  console.log('\n--- [2] crm_deals ---');
  const { data: dealData, error: dealError } = await supabase
    .from('crm_deals')
    .select('custom_fields')
    .limit(5);

  if (dealError) {
    console.error('❌ Erro ao ler crm_deals:', dealError.message);
  } else {
    console.log('✅ crm_deals lido.');
    if (dealData?.[0]?.custom_fields) {
      const keys = Object.keys(dealData[0].custom_fields);
      console.log('   Exemplo de chaves em custom_fields:', keys.slice(0, 10));
      const utmKeys = keys.filter(k => k.toLowerCase().includes('utm') || k.length > 30); // UTMs ou hashes
      console.log('   Possíveis chaves UTM/Custom:', utmKeys);
    } else {
      console.log('   Nenhum custom_fields encontrado nos primeiros 5 deals.');
    }
  }

  // 3. Check Meta Ads Campaigns
  console.log('\n--- [3] Meta Ads (meta_ads_costs) ---');
  const { count: metaCount, error: metaCountError } = await supabase
    .from('meta_ads_costs')
    .select('*', { count: 'exact', head: true });

  if (metaCountError) {
    console.error('❌ Erro ao contar meta_ads_costs:', metaCountError.message);
  } else {
    console.log(`✅ meta_ads_costs tem ${metaCount} registros.`);
  }

  // 4. Check Google Ads Campaigns
  console.log('\n--- [4] Google Ads (google_ads_costs) ---');
  const { count: googleCount, error: googleCountError } = await supabase
    .from('google_ads_costs')
    .select('*', { count: 'exact', head: true });

  if (googleCountError) {
    console.error('❌ Erro ao contar google_ads_costs:', googleCountError.message);
  } else {
    console.log(`✅ google_ads_costs tem ${googleCount} registros.`);
  }

  // 5. Validar formato utm_campaign Meta vs campaign_id
  console.log('\n--- [5] Validação de Formato (Meta) ---');
  const { data: metaUTMs, error: metaUTMError } = await supabase
    .from('yayforms_responses')
    .select('utm_campaign')
    .not('utm_campaign', 'is', null)
    .limit(100);

  if (!metaUTMError && metaUTMs.length > 0) {
    const examples = metaUTMs.map(d => d.utm_campaign).filter(Boolean);
    const withPipe = examples.filter(e => e.includes('|'));
    console.log(`📊 Meta UTMs: ${withPipe.length}/${examples.length} contêm "|"`);
    if (withPipe.length > 0) {
      console.log('   Exemplos:', withPipe.slice(0, 3));
    }
  }

  console.log('\n🏁 Preflight completo.');
}

main();
