-- ============================================================================
-- Normalização de custom_fields: string-encoded → JSONB object
-- Story 5.4 — Fix para extração JSONB funcionar em RPCs e PostgREST
-- ============================================================================
-- PROBLEMA: ~96% dos deals tinham custom_fields armazenado como string JSON
-- escaped (jsonb_typeof = 'string'). A extração ->> retorna NULL para esses
-- registros, quebrando tanto as RPCs quanto as queries PostgREST com JSONB_FIELDS.
--
-- SOLUÇÃO: Converter string-encoded para JSONB object usando #>>'{}'::jsonb.
-- Isso é o equivalente SQL do parseCustomFields() do JS.
--
-- NOTA: Este script é idempotente — só atualiza registros que ainda são string.
-- Executar após cada sync do Pipedrive se o sync criar string-encoded data.
-- ============================================================================

-- Normalizar custom_fields string-encoded para JSONB object
UPDATE crm_deals
SET custom_fields = (custom_fields #>> '{}')::jsonb
WHERE jsonb_typeof(custom_fields) = 'string';
