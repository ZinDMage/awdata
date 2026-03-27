export default function LossBar({ pct, color }) {
  return (
    <div className="h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
      <div
        className="h-full rounded-full opacity-70 transition-all duration-apple ease-apple motion-reduce:transition-none"
        style={{ width: `${Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0}%`, background: color }}
      />
    </div>
  );
}
