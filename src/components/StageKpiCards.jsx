const ICON_STYLES = {
  info: 'bg-info/20 text-info',
  warning: 'bg-warning/20 text-warning',
  positive: 'bg-positive/20 text-positive',
  negative: 'bg-negative/20 text-negative',
  'content-tertiary': 'bg-content-tertiary/20 text-content-secondary',
};

const DEFAULT_ICON_STYLE = 'bg-surface-tertiary/20 text-content-tertiary';

export default function StageKpiCards({ cards = [] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => {
        const iconClass = ICON_STYLES[card.iconColor] ?? DEFAULT_ICON_STYLE;

        return (
          <div
            key={card.label}
            className="bg-surface-secondary rounded-card p-6 border border-border-subtle/20 hover:border-border-subtle/40 hover:-translate-y-px transition-all duration-apple"
            aria-label={`${card.label ?? ''}: ${card.value ?? ''} — ${card.detail ?? ''}`}
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center text-xl mb-4 ${iconClass}`}
              aria-hidden="true"
            >
              {card.icon}
            </div>
            <p className="text-xs uppercase tracking-wider text-content-tertiary">
              {card.label}
            </p>
            <p className="text-3xl font-bold text-content-primary tabular-nums">
              {card.value}
            </p>
            <p className="text-sm text-content-secondary">{card.detail}</p>
            <p className="text-xs text-content-tertiary">{card.description}</p>
          </div>
        );
      })}
    </div>
  );
}
