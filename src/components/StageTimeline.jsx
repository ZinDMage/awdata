import { F } from '@/utils/formatters';

/**
 * StageTimeline — Story 4.4
 * Timeline horizontal de transições de stages do deal.
 * Props-only, display only. (FR68, FR69, FR72)
 */

export default function StageTimeline({ transitions = [], activeStageIndex }) {
  if (!transitions?.length) {
    return (
      <div className="py-6">
        <div className="h-0.5 bg-border-subtle w-full mb-4" />
        <p className="text-sm text-content-tertiary text-center">
          Sem histórico de transições
        </p>
      </div>
    );
  }

  const lastIndex = activeStageIndex ?? transitions.length - 1;

  return (
    <div
      className="flex items-start w-full overflow-x-auto py-4"
      aria-label={`Histórico de ${transitions.length} transições de stage`}
    >
      {transitions.map((t, i) => {
        const isActive = i === lastIndex;

        return (
          <div key={i} className="flex items-start flex-1 min-w-0">
            {/* Connector line before dot (except first) */}
            {i > 0 && (
              <div className="h-0.5 bg-border-subtle flex-1 mt-1.5 min-w-[24px]" />
            )}

            {/* Stage dot + info */}
            <div
              className="flex flex-col items-center shrink-0"
              aria-label={`Stage ${t.stageName}, ${F.datetime(t.dateTime)}`}
            >
              {/* Dot */}
              <div
                className={
                  isActive
                    ? 'w-3 h-3 rounded-full bg-info ring-4 ring-info/20'
                    : 'w-3 h-3 rounded-full bg-content-tertiary'
                }
              />

              {/* Stage name */}
              <span
                className={`text-xs mt-2 text-center leading-tight max-w-[80px] ${
                  isActive
                    ? 'font-bold text-info uppercase'
                    : 'font-medium text-content-primary uppercase'
                }`}
              >
                {t.stageName}
              </span>

              {/* Date/time */}
              <span className="text-xs text-content-tertiary tabular mt-0.5 text-center">
                {F.datetime(t.dateTime)}
              </span>

              {/* Time to next stage */}
              {t.timeToNext && (
                <span className="text-xs text-info font-medium mt-0.5">
                  {t.timeToNext}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Formatação centralizada em utils/formatters.js — F.datetime
