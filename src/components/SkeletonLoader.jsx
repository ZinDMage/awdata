/**
 * SkeletonLoader — Story 3.4
 * Mimics dashboard layout during loading: row of 4 cards + row of 3 + table.
 * Uses shimmer animation on surface-tertiary blocks. (UX-DR12)
 */

const shimmerStyle = {
  background: 'linear-gradient(90deg, var(--color-surface-tertiary, #2a2a2e) 25%, var(--color-surface-secondary, #3a3a3e) 50%, var(--color-surface-tertiary, #2a2a2e) 75%)',
  backgroundSize: '200% 100%',
  animation: 'awdata-shimmer 1.6s ease-in-out infinite',
  borderRadius: 8,
};

const SHIMMER_KEYFRAMES = `
@keyframes awdata-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

function SkeletonCard({ height = 100 }) {
  return (
    <div
      style={{
        ...shimmerStyle,
        borderRadius: 16,
        height,
        flex: 1,
        minWidth: 0,
      }}
    />
  );
}

function SkeletonRow({ count, height = 100, gap = 16 }) {
  return (
    <div style={{ display: 'flex', gap, marginBottom: gap }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} height={height} />
      ))}
    </div>
  );
}

function SkeletonTableRow() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
      {/* Label column */}
      <div style={{ ...shimmerStyle, width: 120, height: 14, borderRadius: 6, flexShrink: 0 }} />
      {/* Data columns */}
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{ ...shimmerStyle, flex: 1, height: 14, borderRadius: 6 }} />
      ))}
    </div>
  );
}

export default function SkeletonLoader() {
  return (
    <div style={{ padding: '0 0 24px' }}>
      <style>{SHIMMER_KEYFRAMES}</style>

      {/* Row of 4 KPI cards */}
      <SkeletonRow count={4} height={108} gap={16} />

      {/* Row of 3 KPI cards */}
      <SkeletonRow count={3} height={108} gap={16} />

      {/* Table header skeleton */}
      <div
        style={{
          ...shimmerStyle,
          borderRadius: 16,
          padding: '20px 20px 16px',
          marginTop: 8,
          background: 'var(--color-surface-secondary, #2a2a2e)',
          animation: 'none',
        }}
      >
        {/* Table title bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <div style={{ ...shimmerStyle, width: 160, height: 16, borderRadius: 6 }} />
          <div style={{ ...shimmerStyle, width: 80, height: 16, borderRadius: 6 }} />
        </div>

        {/* Column headers */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ ...shimmerStyle, width: 120, height: 10, borderRadius: 4, flexShrink: 0 }} />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} style={{ ...shimmerStyle, flex: 1, height: 10, borderRadius: 4 }} />
          ))}
        </div>

        {/* 5 data rows */}
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonTableRow key={i} />
        ))}
      </div>
    </div>
  );
}
