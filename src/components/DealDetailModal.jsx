import { useEffect, useRef, useCallback } from 'react';
import { F } from '@/utils/formatters';
import StageTimeline from './StageTimeline';

/**
 * DealDetailModal — Story 4.3 + 4.5
 * Modal com 3 seções: StageTimeline, Ligações, Tasks.
 * Props-only, lazy loading via useDealModal. (FR67, FR70, FR71, NFR18, UX-DR25)
 */
export default function DealDetailModal({ dealId, transitions = [], calls = [], tasks = [], loading, onClose }) {
  const modalRef = useRef(null);
  const triggerRef = useRef(null);

  // Capture the element that triggered the modal
  useEffect(() => {
    triggerRef.current = document.activeElement;
  }, []);

  // Focus trap + Escape handler
  useEffect(() => {
    if (!modalRef.current) return;
    const modal = modalRef.current;

    const getFocusable = () =>
      modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable();
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    modal.addEventListener('keydown', handleKeyDown);
    // Focus first focusable element (close button)
    const focusable = getFocusable();
    focusable?.[0]?.focus();

    return () => modal.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Return focus to trigger on close
  useEffect(() => {
    return () => {
      triggerRef.current?.focus();
    };
  }, []);

  // Close on overlay click
  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose?.();
    }
  }, [onClose]);

  const activeStageIndex = transitions?.length ? transitions.length - 1 : 0;

  // Transform transitions for StageTimeline format
  const timelineTransitions = transitions?.map((t, i) => ({
    stageName: t.to_stage_name || t.stageName || '—',
    dateTime: t.transitioned_at || t.dateTime || null,
    timeToNext: t.timeToNext || F.timeBetween(t.time_in_previous_stage_sec),
  })) || [];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes do Deal #${dealId}`}
        className="bg-surface-secondary rounded-card border border-border-subtle/20 w-[720px] max-h-[80vh] overflow-y-auto p-8 shadow-2xl relative animate-modal-in"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-content-tertiary hover:text-content-primary transition-colors"
          aria-label="Fechar modal"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {loading ? (
          <ModalSkeleton />
        ) : (
          <>
            {/* Section 1: Stage Timeline */}
            <SectionHeader
              title="Histórico de Stages"
              count={timelineTransitions.length}
              suffix="transições"
            />
            <StageTimeline
              transitions={timelineTransitions}
              activeStageIndex={activeStageIndex}
            />

            {/* Divider */}
            <div className="border-t border-border-subtle/20 my-6" />

            {/* Sections 2 & 3: Calls + Tasks side by side */}
            <div className="grid grid-cols-2 gap-8">
              <CallsSection calls={calls} />
              <TasksSection tasks={tasks} />
            </div>
          </>
        )}
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-modal-in {
          animation: modal-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

// ── Section Header ──

function SectionHeader({ title, count, suffix = '' }) {
  return (
    <h4 className="text-xs font-medium text-content-tertiary uppercase tracking-wider mb-4">
      {title} {count != null && `(${count}${suffix ? ` ${suffix}` : ''})`}
    </h4>
  );
}

// ── Calls Section (Story 4.5, Task 1) ──

function CallsSection({ calls = [] }) {
  if (!calls?.length) {
    return (
      <div>
        <SectionHeader title="Ligações" count={0} />
        <p className="text-sm text-content-tertiary">Sem ligações registradas</p>
      </div>
    );
  }

  const contatos = calls.filter(c => c.done === true || c.status === 'Atendida').length;
  const tentativas = calls.length;

  return (
    <div>
      <SectionHeader title="Ligações" count={tentativas} />
      <p className="text-sm text-content-secondary mb-3">
        {contatos} contato{contatos !== 1 ? 's' : ''} / {tentativas} tentativa{tentativas !== 1 ? 's' : ''}
      </p>

      <div className="space-y-3">
        {calls.map((call, i) => {
          const isAnswered = call.done === true || call.status === 'Atendida';
          return (
            <div key={call.activity_id || i} className="flex items-start gap-2">
              <span className="text-sm" aria-hidden="true">📞</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-content-primary">
                    {F.date(call.due_date)}
                  </span>
                  <span
                    className={
                      isAnswered
                        ? 'text-positive text-sm font-medium'
                        : 'text-negative text-sm'
                    }
                  >
                    {isAnswered ? 'Atendida' : 'Sem resposta'}
                  </span>
                </div>
                {call.duration && isAnswered && (
                  <span className="text-sm text-content-tertiary tabular">
                    {F.duration(call.duration)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tasks Section (Story 4.5, Task 2) ──

function TasksSection({ tasks = [] }) {
  if (!tasks?.length) {
    return (
      <div>
        <SectionHeader title="Tasks" count={0} />
        <p className="text-sm text-content-tertiary">Sem tasks registradas</p>
      </div>
    );
  }

  const abertas = tasks.filter(t => !t.done).length;
  const concluidas = tasks.filter(t => t.done).length;

  return (
    <div>
      <SectionHeader title="Tasks" count={tasks.length} />
      <p className="text-sm text-content-secondary mb-3">
        {abertas} aberta{abertas !== 1 ? 's' : ''} / {concluidas} concluída{concluidas !== 1 ? 's' : ''}
      </p>

      <div className="space-y-3">
        {tasks.map((task, i) => (
          <div
            key={task.activity_id || i}
            className={`border-l-2 pl-3 ${
              task.done
                ? 'border-positive'
                : 'border-content-tertiary'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className={task.done ? 'text-positive text-sm' : 'text-sm text-content-tertiary'}>
                {task.done ? '✓' : '○'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-content-primary">{task.subject || task.description || '—'}</p>
                <p className="text-xs text-content-tertiary">
                  {F.date(task.due_date)} {task.owner_name ? `- ${task.owner_name}` : task.assignee ? `- ${task.assignee}` : ''}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Modal Skeleton ──

function ModalSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Timeline skeleton */}
      <div>
        <div className="h-3 bg-surface-tertiary rounded w-48 mb-4" />
        <div className="flex items-center gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center flex-1">
              {i > 0 && <div className="h-0.5 bg-surface-tertiary flex-1" />}
              <div className="w-3 h-3 rounded-full bg-surface-tertiary" />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-2 bg-surface-tertiary rounded w-16" />
          ))}
        </div>
      </div>

      <div className="border-t border-border-subtle/20" />

      {/* Calls + Tasks skeleton */}
      <div className="grid grid-cols-2 gap-8">
        {Array.from({ length: 2 }, (_, s) => (
          <div key={s} className="space-y-3">
            <div className="h-3 bg-surface-tertiary rounded w-24" />
            <div className="h-2 bg-surface-tertiary rounded w-40" />
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="h-4 bg-surface-tertiary rounded w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers (formatação centralizada em utils/formatters.js — F.date, F.duration, F.timeBetween) ──
