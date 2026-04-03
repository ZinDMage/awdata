import { F } from '@/utils/formatters';

// UX-DR12, FR130: Sync indicator por fonte — dots coloridos
// Verde <6h, Amarelo 6-24h, Vermelho >24h

// ── Thresholds (horas) ──
const SYNC_FRESH_HOURS = 6;
const SYNC_STALE_HOURS = 24;

// ── Tailwind color map por tier ──
const TIER_CLASSES = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
  gray: 'bg-content-tertiary/40',
};

/** Classifica freshness da sync baseado em horas desde a última sync */
function getSyncTier(lastSync) {
  if (!lastSync) return 'gray';
  const hoursAgo = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
  if (hoursAgo < SYNC_FRESH_HOURS) return 'green';
  if (hoursAgo < SYNC_STALE_HOURS) return 'yellow';
  return 'red';
}

/** Gera tooltip text para cada source // FR130 */
function getTooltip(name, lastSync) {
  if (lastSync === null && name === 'LinkedIn') return `${name} — Em breve`; // FR122
  if (!lastSync) return `${name} — Sync indisponível`;
  return `${name} — Última sync: ${F.date(lastSync)}`;
}

/** @param {{ sources: Array<{ name: string, lastSync: Date|null }> }} props */
export default function SyncIndicator({ sources }) {
  return (
    <div className="flex items-center gap-3 text-xs text-content-tertiary">
      {sources.map((src) => {
        const tier = getSyncTier(src.lastSync);
        return (
          <span
            key={src.name}
            className="flex items-center gap-1"
            title={getTooltip(src.name, src.lastSync)}
          >
            <span
              className={`w-2 h-2 rounded-full transition-colors duration-150 ${TIER_CLASSES[tier]}`}
            />
            {src.name}
          </span>
        );
      })}
    </div>
  );
}
