import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getAllMappingsFlat,
  addMapping,
  removeMapping,
  updateMapping,
  resetToDefaults,
} from '@/config/sourceMapping';

// FR125: Grupos válidos para o select de plataforma
const GROUP_NAMES = ['Meta', 'Google', 'LinkedIn', 'Orgânico', 'S/Track'];

// F3: Valores sistema do S/Track — non-removable/non-editable
const SYSTEM_STRACK_VALUES = new Set(['', 'none', '(direct)', 'awsales']);

// Cores por plataforma — design system (project-context.md)
const GROUP_COLORS = {
  Meta: 'text-[#007AFF]',
  Google: 'text-[#34C759]',
  LinkedIn: 'text-[#0A66C2]',
  'Orgânico': 'text-[#AF52DE]',
  'S/Track': 'text-content-tertiary',
};

// ── SourceMappingPanel ────────────────────────────────────────────
// FR125: Painel CRUD de source mapping — slide-in lateral
// AC: #1, #2, #3, #4

export default function SourceMappingPanel({ open, onClose, onMappingChange }) {
  const [mappings, setMappings] = useState(() => getAllMappingsFlat());
  const [newUtm, setNewUtm] = useState('');
  const [newGroup, setNewGroup] = useState('Meta');
  const [editingUtm, setEditingUtm] = useState(null);
  const [editGroup, setEditGroup] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const refreshMappings = useCallback(() => {
    setMappings(getAllMappingsFlat());
  }, []);

  const notifyChange = useCallback(() => {
    refreshMappings();
    if (onMappingChange) onMappingChange();
  }, [refreshMappings, onMappingChange]);

  // ── Add ──
  const handleAdd = useCallback(() => {
    setError('');
    const result = addMapping(newUtm, newGroup);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNewUtm('');
    setNewGroup('Meta');
    notifyChange();
  }, [newUtm, newGroup, notifyChange]);

  // ── Edit ──
  const editingRef = useRef(null); // tracks editingUtm for native event handlers (avoids stale closures)

  const handleEditStart = useCallback((utmSource, group) => {
    setEditingUtm(utmSource);
    editingRef.current = utmSource;
    setEditGroup(group);
    setError('');
  }, []);

  const handleEditSave = useCallback(() => {
    updateMapping(editingUtm, editGroup);
    setEditingUtm(null);
    editingRef.current = null;
    setEditGroup('');
    notifyChange();
  }, [editingUtm, editGroup, notifyChange]);

  const handleEditCancel = useCallback(() => {
    setEditingUtm(null);
    editingRef.current = null;
    setEditGroup('');
  }, []);

  // ── Remove ──
  const handleRemoveConfirm = useCallback(() => {
    if (confirmRemove === null) return; // F4: '' is falsy but valid
    removeMapping(confirmRemove);
    setConfirmRemove(null);
    notifyChange();
  }, [confirmRemove, notifyChange]);

  // ── Reset ──
  const handleReset = useCallback(() => {
    resetToDefaults();
    setConfirmReset(false);
    notifyChange();
  }, [notifyChange]);

  // ── Keyboard: Enter submits add form ──
  const handleAddKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleAdd();
  }, [handleAdd]);

  // ── Keyboard: Enter/Escape on edit ──
  const handleEditKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleEditSave();
    if (e.key === 'Escape') {
      e.nativeEvent.stopImmediatePropagation(); // prevent F9 global handler from closing panel
      handleEditCancel();
    }
  }, [handleEditSave, handleEditCancel]);

  // F7: Refresh mappings when panel opens (may be stale if SOURCE_GROUPS changed externally)
  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) refreshMappings();
    prevOpen.current = open;
  }, [open, refreshMappings]);

  // F9: Escape key closes panel (aria-modal requirement)
  // Skip close when editing — editingRef avoids stale closure with native listener
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape' && editingRef.current === null) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Agrupar por plataforma para exibição
  const grouped = {};
  for (const m of mappings) {
    if (!grouped[m.group]) grouped[m.group] = [];
    grouped[m.group].push(m.utmSource);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in Panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-[400px] max-w-[90vw] bg-surface-primary border-l border-border-subtle/20 shadow-2xl transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-label="Configuração de Fontes"
        aria-modal="true"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle/20">
            <h3 className="text-base font-semibold text-content-primary">
              Configuração de Fontes
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors duration-150"
              aria-label="Fechar painel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-content-tertiary">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          {/* Content — scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Error banner */}
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Grouped mappings */}
            {GROUP_NAMES.map((groupName) => {
              const items = grouped[groupName];
              if (!items || items.length === 0) return null;
              return (
                <div key={groupName}>
                  <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${GROUP_COLORS[groupName] || 'text-content-secondary'}`}>
                    {groupName}
                  </h4>
                  <div className="rounded-xl bg-surface-secondary/50 divide-y divide-border-subtle/10">
                    {items.map((utmSource) => (
                      <MappingRow
                        key={`${groupName}-${utmSource}`}
                        utmSource={utmSource}
                        group={groupName}
                        isEditing={editingUtm === utmSource}
                        editGroup={editGroup}
                        onEditGroupChange={setEditGroup}
                        onEditStart={handleEditStart}
                        onEditSave={handleEditSave}
                        onEditCancel={handleEditCancel}
                        onEditKeyDown={handleEditKeyDown}
                        onRemoveClick={setConfirmRemove}
                        isSystemValue={SYSTEM_STRACK_VALUES.has(utmSource)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Add mapping form */}
            <div className="pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-content-secondary mb-2">
                Adicionar Mapeamento
              </h4>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newUtm}
                  onChange={(e) => { setNewUtm(e.target.value); setError(''); }}
                  onKeyDown={handleAddKeyDown}
                  placeholder="utm_source"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-surface-secondary text-sm text-content-primary placeholder:text-content-tertiary border border-border-subtle/20 focus:outline-none focus:ring-1 focus:ring-[#007AFF]/50"
                  aria-label="Novo utm_source"
                />
                <select
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-surface-secondary text-sm text-content-primary border border-border-subtle/20 focus:outline-none focus:ring-1 focus:ring-[#007AFF]/50"
                  aria-label="Plataforma"
                >
                  {GROUP_NAMES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAdd}
                  className="px-3 py-1.5 rounded-lg bg-[#007AFF] text-white text-sm font-medium hover:bg-[#0066DD] transition-colors duration-150"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Footer — Reset */}
          <div className="px-5 py-3 border-t border-border-subtle/20">
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="text-sm text-content-tertiary hover:text-red-400 transition-colors duration-150"
              >
                Resetar Padrões
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-red-400">Restaurar mapeamentos originais?</span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors duration-150"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-2.5 py-1 rounded-lg text-content-tertiary text-xs hover:text-content-secondary transition-colors duration-150"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Remove confirmation overlay — F4: use !== null ('' is falsy but valid) */}
      {confirmRemove !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-surface-primary rounded-2xl p-5 shadow-2xl max-w-sm mx-4 space-y-3">
            <p className="text-sm text-content-primary">
              Remover <span className="font-semibold">"{confirmRemove}"</span>?
            </p>
            <p className="text-xs text-content-tertiary">
              UTMs sem mapeamento caem em S/Track.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="px-3 py-1.5 rounded-lg text-sm text-content-secondary hover:text-content-primary transition-colors duration-150"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRemoveConfirm}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors duration-150"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── MappingRow ────────────────────────────────────────────────────

function MappingRow({
  utmSource,
  group,
  isEditing,
  editGroup,
  onEditGroupChange,
  onEditStart,
  onEditSave,
  onEditCancel,
  onEditKeyDown,
  onRemoveClick,
  isSystemValue,
}) {
  if (isEditing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex-1 text-sm text-content-primary font-mono truncate">
          {utmSource}
        </span>
        <select
          value={editGroup}
          onChange={(e) => onEditGroupChange(e.target.value)}
          onKeyDown={onEditKeyDown}
          className="px-2 py-1 rounded-lg bg-surface-primary text-sm text-content-primary border border-border-subtle/20 focus:outline-none focus:ring-1 focus:ring-[#007AFF]/50"
          aria-label="Novo grupo"
          autoFocus
        >
          {GROUP_NAMES.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onEditSave}
          className="px-2 py-1 rounded-lg bg-[#34C759]/20 text-[#34C759] text-xs font-medium hover:bg-[#34C759]/30 transition-colors duration-150"
          aria-label="Salvar edição"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={onEditCancel}
          className="px-2 py-1 rounded-lg text-content-tertiary text-xs hover:text-content-secondary transition-colors duration-150"
          aria-label="Cancelar edição"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 group/row">
      <span className="flex-1 text-sm text-content-primary font-mono truncate">
        {utmSource || '(vazio)'}
      </span>
      {/* F3: hide edit/remove for system S/Track values */}
      {!isSystemValue && (
        <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity duration-150">
          <button
            type="button"
            onClick={() => onEditStart(utmSource, group)}
            className="p-1 rounded hover:bg-surface-primary transition-colors duration-150"
            aria-label={`Editar ${utmSource}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-content-tertiary hover:text-content-primary">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onRemoveClick(utmSource)}
            className="p-1 rounded hover:bg-red-500/10 transition-colors duration-150"
            aria-label={`Remover ${utmSource}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-content-tertiary hover:text-red-400">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
