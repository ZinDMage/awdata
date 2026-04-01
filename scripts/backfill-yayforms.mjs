#!/usr/bin/env node
/**
 * Backfill yayforms_responses no Supabase a partir do CSV exportado do YayForms.
 *
 * USO:
 *   node scripts/backfill-yayforms.mjs [--dry-run] [--month 2026-03]
 *
 * Flags:
 *   --dry-run   Apenas mostra o que seria inserido, sem alterar o banco
 *   --month     Filtra apenas respostas do mês especificado (YYYY-MM)
 *
 * Env vars (lidas do .env na raiz do projeto):
 *   SUPABASE_URL          — URL do projeto Supabase
 *   SUPABASE_SERVICE_KEY  — Service role key (bypassa RLS)
 *
 * O script:
 *   1. Lê o CSV do YayForms (caminho hardcoded abaixo, altere se necessário)
 *   2. Mapeia as colunas do CSV para as colunas do Supabase
 *   3. Busca emails já existentes no Supabase para o período
 *   4. Insere apenas registros ausentes (upsert por email+submitted_at)
 *   5. Pula duplicatas dentro de janela de 5 minutos (mesma lógica do app)
 */

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
  console.warn('⚠️  Não encontrou .env — usando variáveis de ambiente do sistema');
}

// ─── Config ────────────────────────────────────────────────────────────────
const CSV_PATH = process.argv.find((_, i, a) => a[i - 1] === '--csv') || process.argv[2] || '/Users/lucaskurt/Downloads/responses-awsales qualificação-20260330 (1).csv';
if (CSV_PATH.startsWith('/Users/') && !process.argv.includes('--csv') && !process.argv[2]) {
  console.warn('⚠️  Usando CSV path hardcoded. Passe o caminho como argumento: node scripts/backfill-yayforms.mjs <path>');
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios.');
  console.error('   Configure no .env ou como variáveis de ambiente.');
  process.exit(1);
}

// Checa se está usando service role key (necessário para INSERT com RLS)
if (SUPABASE_KEY.includes('"role":"anon"') || (!process.env.SUPABASE_SERVICE_KEY && !SUPABASE_KEY.includes('service_role'))) {
  console.warn('⚠️  ATENÇÃO: Parece que você está usando a anon key.');
  console.warn('   A tabela yayforms_responses tem RLS — apenas service_role pode inserir.');
  console.warn('   Configure SUPABASE_SERVICE_KEY no .env com a service_role key.');
  console.warn('');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ID do formulário de qualificação no YayForms
const YAYFORMS_FORM_ID = '67dd8ecb3751a8ff2908bc64';

// ─── CSV Parser ────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { result.push(current); current = ''; }
      else current += c;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text) {
  const lines = text.split('\n');
  if (lines[0].startsWith('\ufeff')) lines[0] = lines[0].slice(1);
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

function normalizeEmail(e) {
  return (e || '').trim().toLowerCase();
}

// ─── Mapeamento CSV → Supabase ────────────────────────────────────────────
function csvRowToSupabase(row) {
  const email = normalizeEmail(row['Melhor E-mail para acesso à plataforma:'] || '');
  const submittedAt = row['Enviado às'] || '';
  const startedAt = row['Começou às'] || '';

  if (!email || !submittedAt) return null;

  // Calcular time_to_complete_sec
  let timeToComplete = null;
  if (startedAt && submittedAt) {
    const start = new Date(startedAt);
    const end = new Date(submittedAt);
    if (!isNaN(start) && !isNaN(end)) {
      timeToComplete = Math.round((end - start) / 1000);
      if (timeToComplete < 0) timeToComplete = null;
    }
  }

  return {
    // external_id omitido — banco gera automaticamente via gen_random_uuid()
    form_id: YAYFORMS_FORM_ID,
    lead_email: email,
    submitted_at: submittedAt,
    started_at: startedAt || null,
    lead_revenue_range: row['Quanto foi o faturamento da sua empresa nos últimos 12 meses?'] || null,
    lead_monthly_volume: row['Quantos novos leads, clientes ou tickets de atendimento você gera, em média, por mês?'] || null,
    lead_segment: row['Qual é o segmento do seu negócio?'] || null,
    lead_market: row['Qual mercado você trabalha atualmente?'] || null,
    lead_phone: row['WhatsApp (para suporte exclusivo e rápido):'] || null,
    time_to_complete_sec: timeToComplete,
    ingested_at: new Date().toISOString(),
  };
}

// ─── Deduplicação (janela 5 min, mesma lógica do app) ──────────────────────
function deduplicateRows(rows) {
  const FIVE_MIN = 5 * 60 * 1000;
  const byEmail = {};
  for (const r of rows) {
    if (!byEmail[r.lead_email]) byEmail[r.lead_email] = [];
    byEmail[r.lead_email].push(r);
  }
  const result = [];
  for (const email of Object.keys(byEmail)) {
    const group = byEmail[email].sort((a, b) =>
      new Date(a.submitted_at) - new Date(b.submitted_at)
    );
    let lastKept = null;
    for (const r of group) {
      if (!lastKept) {
        result.push(r);
        lastKept = r;
      } else {
        const diff = new Date(r.submitted_at) - new Date(lastKept.submitted_at);
        if (diff > FIVE_MIN) {
          result.push(r);
          lastKept = r;
        }
        // else: skip duplicate within 5-min window
      }
    }
  }
  return result;
}

// ─── Fetch todos os emails existentes no Supabase para o período ───────────
async function fetchExistingEmails(monthFilter) {
  const existing = new Set();
  let from = 0;
  const size = 1000;

  const query = () => {
    let q = supabase.from('yayforms_responses').select('lead_email, submitted_at');
    if (monthFilter) {
      const [y, m] = monthFilter.split('-');
      const nextMonth = parseInt(m) === 12
        ? `${parseInt(y) + 1}-01`
        : `${y}-${String(parseInt(m) + 1).padStart(2, '0')}`;
      q = q.gte('submitted_at', `${monthFilter}-01`).lt('submitted_at', `${nextMonth}-01`);
    }
    return q;
  };

  while (true) {
    const { data, error } = await query().range(from, from + size - 1);
    if (error) { console.error('Erro ao buscar Supabase:', error); break; }
    if (!data || data.length === 0) break;
    for (const r of data) {
      existing.add(`${normalizeEmail(r.lead_email)}||${r.submitted_at}`);
    }
    if (data.length < size) break;
    from += size;
  }
  return existing;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const monthIdx = args.indexOf('--month');
  const monthFilter = monthIdx !== -1 ? args[monthIdx + 1] : null;

  console.log('🔧 Backfill YayForms → Supabase');
  console.log(`   CSV: ${CSV_PATH}`);
  console.log(`   Supabase: ${SUPABASE_URL}`);
  console.log(`   Key type: ${process.env.SUPABASE_SERVICE_KEY ? '🔑 service_role' : '⚠️  anon'}`);
  console.log(`   Modo: ${dryRun ? '🔍 DRY RUN (nada será inserido)' : '🚀 INSERÇÃO REAL'}`);
  if (monthFilter) console.log(`   Filtro: ${monthFilter}`);
  console.log('');

  // 1. Ler CSV
  const csvText = readFileSync(CSV_PATH, 'utf-8');
  const allRows = parseCSV(csvText);
  console.log(`📄 CSV: ${allRows.length} respostas totais`);

  // 2. Converter e filtrar
  let mapped = allRows
    .map(csvRowToSupabase)
    .filter(r => r !== null);

  if (monthFilter) {
    mapped = mapped.filter(r => r.submitted_at.startsWith(monthFilter));
  }
  console.log(`📋 Mapeadas: ${mapped.length} respostas${monthFilter ? ` de ${monthFilter}` : ''}`);

  // 3. Deduplicar (janela 5 min)
  const deduped = deduplicateRows(mapped);
  console.log(`🔄 Após dedup (5 min): ${deduped.length} respostas únicas`);

  // 4. Buscar existentes no Supabase
  console.log('🗄️  Buscando registros existentes no Supabase...');
  const existingKeys = await fetchExistingEmails(monthFilter);
  console.log(`🗄️  Encontrados: ${existingKeys.size} registros no Supabase`);

  // 5. Filtrar apenas os que faltam (por email - mesma lógica simplificada)
  const existingEmails = new Set();
  for (const key of existingKeys) {
    existingEmails.add(key.split('||')[0]);
  }

  const toInsert = deduped.filter(r => !existingEmails.has(r.lead_email));
  console.log(`\n➡️  ${toInsert.length} registros para inserir (ausentes no Supabase)`);

  if (toInsert.length === 0) {
    console.log('\n✅ Nada para inserir. Banco já está completo para o período.');
    return;
  }

  // 6. Mostrar preview
  console.log('\n' + '─'.repeat(100));
  console.log(`${'Email'.padEnd(40)} | ${'Enviado em'.padEnd(20)} | ${'Faturamento'.padEnd(30)}`);
  console.log('─'.repeat(100));
  for (const r of toInsert.slice(0, 50)) {
    console.log(
      `${(r.lead_email || '').slice(0, 39).padEnd(40)} | ${(r.submitted_at || '').padEnd(20)} | ${(r.lead_revenue_range || '').slice(0, 29).padEnd(30)}`
    );
  }
  if (toInsert.length > 50) console.log(`... e mais ${toInsert.length - 50} registros`);
  console.log('─'.repeat(100));

  // 7. Inserir
  if (dryRun) {
    console.log('\n🔍 DRY RUN — nenhum registro foi inserido.');
    console.log('   Remova --dry-run para inserir de verdade.');
    return;
  }

  console.log(`\n🚀 Inserindo ${toInsert.length} registros no Supabase...`);
  const BATCH = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await supabase
      .from('yayforms_responses')
      .insert(batch);

    if (error) {
      console.error(`❌ Erro no batch ${i}-${i + batch.length}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`   ✅ ${inserted}/${toInsert.length}\r`);
    }
  }

  console.log(`\n\n📊 Resultado:`);
  console.log(`   ✅ Inseridos: ${inserted}`);
  if (errors > 0) console.log(`   ❌ Erros: ${errors}`);
  console.log('   Feito!');
}

main().catch(console.error);
