/**
 * ModeBadge — Story 3.4
 * Displays current viewMode (PERFORMANCE or CRIAÇÃO) as a pill badge.
 * Always visible, updates when mode changes. (UX-DR6)
 */

import { useMetrics } from '@/contexts/MetricsContext';

const LABEL = {
  performance: 'PERFORMANCE',
  criacao: 'CRIAÇÃO',
};

export default function ModeBadge() {
  const { viewMode } = useMetrics();
  const label = LABEL[viewMode] ?? (viewMode ? viewMode.toUpperCase() : 'PERFORMANCE');

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: viewMode === 'performance'
          ? 'color-mix(in srgb, #007AFF 15%, #2D3648)'
          : 'color-mix(in srgb, #34C759 15%, #2D3648)',
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        borderRadius: 20,
        padding: '4px 12px',
        transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}
