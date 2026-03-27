export default function EmptyState({ icon = '📭', message = 'Sem dados para este período' }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-content-tertiary"
      role="status"
      aria-label={message}
    >
      <span className="text-3xl mb-3" aria-hidden="true">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}
