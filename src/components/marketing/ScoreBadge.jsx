import { useState } from 'react'
import { F } from '@/utils/formatters'

// UX-DR11: Score badge reutilizável — verde/amarelo/vermelho
// Thresholds: >=5.0 verde, >=2.0 amarelo, <2.0 vermelho (AD-V3-9)
// Formula: (SQL × 0.4 + Vendas × 0.6) / Spend × 1000 (FR106)

const TIER_STYLES = {
  green: 'bg-positive/15 text-positive',
  yellow: 'bg-[#FFD60A]/15 text-[#FFD60A]',
  red: 'bg-negative/15 text-negative',
}

const TIER_LABELS = {
  green: 'Excelente',
  yellow: 'Bom',
  red: 'Baixo',
}

function getTier(score) {
  if (score == null) return null
  if (score >= 5.0) return 'green'
  if (score >= 2.0) return 'yellow'
  return 'red'
}

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
}

export default function ScoreBadge({
  score,
  tier,
  sql,
  vendas,
  spend,
  label,
  showTooltip = true,
  size = 'sm',
}) {
  const [hovered, setHovered] = useState(false)

  // Sem score ou valor inválido → badge N/A
  if (!Number.isFinite(score)) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-pill bg-content-tertiary/10 text-content-tertiary ${SIZE_CLASSES[size] || SIZE_CLASSES.sm}`}
        aria-label="Score indisponível"
      >
        N/A
      </span>
    )
  }

  const resolvedTier = tier || getTier(score)
  const classification = TIER_LABELS[resolvedTier] || 'Baixo'
  const colorClasses = TIER_STYLES[resolvedTier] || TIER_STYLES.red
  const hasTooltipData = showTooltip && sql != null && vendas != null && spend != null

  return (
    <span
      className={`relative inline-flex items-center gap-1.5 rounded-pill font-medium ${colorClasses} ${SIZE_CLASSES[size] || SIZE_CLASSES.sm}`}
      aria-label={`Score ${score.toFixed(1)} — ${classification}`}
      tabIndex={hasTooltipData ? 0 : undefined}
      onMouseEnter={() => hasTooltipData && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => hasTooltipData && setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {score.toFixed(1)}
      {label && <span className="text-[10px] opacity-70">{label}</span>}

      {/* Tooltip com cálculo detalhado — FR106 */}
      {hovered && hasTooltipData && (
        <span role="tooltip" className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded-lg bg-surface-primary border border-border-subtle/30 shadow-lg p-3 text-xs text-content-secondary pointer-events-none">
          <span className="block font-medium text-content-primary mb-1">Score de Eficiência</span>
          <span className="block font-mono text-[11px] mb-2 text-content-tertiary">
            (SQL × 0.4 + Vendas × 0.6) / Spend × 1000
          </span>
          <span className="block">SQL: {F.n(sql)}</span>
          <span className="block">Vendas: {F.n(vendas)}</span>
          <span className="block">Spend: {F.ri(spend)}</span>
          <span className="block mt-1 font-medium text-content-primary">
            = ({F.n(sql)} × 0.4 + {F.n(vendas)} × 0.6) / {F.ri(spend)} × 1000 = {score.toFixed(1)}
          </span>
        </span>
      )}
    </span>
  )
}
