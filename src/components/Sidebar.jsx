import { useState, useEffect, useCallback, useRef } from 'react';
import { useMarketing } from '@/contexts/MarketingContext'; // D2: read sub-view from context

const Icons = {
  grid: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  chart: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  zap: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  megaphone: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-5v12L3 13v-2z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>,
  settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  chevronLeft: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  chevronRight: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
};

const NAV_ITEMS = [
  { id: "gerencial", label: "Gerencial", icon: Icons.grid },
  { id: "metricas", label: "Métricas", icon: Icons.chart },
  { id: "marketing", label: "Marketing", icon: Icons.megaphone, hasAccordion: true },
  { id: "sprint", label: "Sprint de Otimizações", icon: Icons.zap },
];

const EASE_APPLE = "all 300ms cubic-bezier(0.4, 0, 0.2, 1)";
const EXPANDED_W = 220;
const COLLAPSED_W = 56;

export default function Sidebar({ sidebarState, tabletOpen, onTabletToggle, onManualToggle, currentView, onViewChange }) {
  const { activeSubView, setActiveSubView } = useMarketing(); // D2: single owner
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const marketingExpanded = currentView === "marketing"; // derived — no desync
  const navRef = useRef(null);
  const overlayRef = useRef(null);
  const wasOverlayVisible = useRef(false);

  // sidebarState: "expanded" | "collapsed" | "hidden" — declared before hooks that reference them
  const isExpanded = sidebarState === "expanded";
  const isCollapsed = sidebarState === "collapsed";
  const isHidden = sidebarState === "hidden";

  const showLabels = isExpanded || (isCollapsed && hovered);
  const baseWidth = isExpanded ? EXPANDED_W : isCollapsed ? COLLAPSED_W : 0;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Track overlay visibility to only restore focus when overlay actually unmounted
  const overlayVisible = isCollapsed && hovered;
  useEffect(() => {
    if (overlayVisible) {
      wasOverlayVisible.current = true;
    } else if (wasOverlayVisible.current) {
      wasOverlayVisible.current = false;
      // Return focus to collapsed nav when hover overlay unmounts
      if (navRef.current) {
        const active = document.activeElement;
        if (!active || active === document.body || !navRef.current.contains(active)) {
          const btn = navRef.current.querySelector('[role="button"]');
          if (btn) btn.focus();
        }
      }
    }
  }, [overlayVisible]);

  // #9: Reset hovered when sidebarState changes away from collapsed
  useEffect(() => {
    if (sidebarState !== "collapsed") setHovered(false);
  }, [sidebarState]);

  const transition = reducedMotion ? "none" : EASE_APPLE;
  const bdrLight = "rgba(255,255,255,0.04)";

  // #4: tabletOpen lifted to Dashboard — use props

  const handleNavClick = useCallback((id) => {
    onViewChange(id);
    if (isHidden && onTabletToggle) onTabletToggle(false);
  }, [onViewChange, isHidden, onTabletToggle]);

  // #11: preventDefault for Space key on nav items
  const handleNavKeyDown = useCallback((e, id) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleNavClick(id);
    }
  }, [handleNavClick]);

  // Tablet overlay sidebar
  if (isHidden) {
    return (
      <>
        {tabletOpen && (
          <div
            onClick={() => onTabletToggle(false)}
            style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.5)", zIndex: 49,
              transition,
            }}
          />
        )}
        <nav
          aria-label="Menu principal"
          style={{
            position: "fixed", top: 0, left: 0, bottom: 0,
            width: EXPANDED_W, zIndex: 50,
            transform: tabletOpen ? "translateX(0)" : `translateX(-${EXPANDED_W}px)`,
            display: "flex", flexDirection: "column",
            background: "#030816", color: "#fff",
            borderRight: `1px solid ${bdrLight}`,
            transition,
          }}
        >
          {renderContent(true)}
        </nav>
      </>
    );
  }

  function renderNavItem(item, { labels: labelsOverride } = {}) {
    const active = currentView === item.id;
    const effectiveLabels = labelsOverride ?? showLabels;

    // Accordion item (Marketing)
    if (item.hasAccordion) {
      const expanded = marketingExpanded;
      return (
        <div key={item.id}>
          <div
            onClick={() => {
              if (currentView === "marketing") return; // AC: accordion always open on Marketing view
              onViewChange("marketing"); // marketingExpanded is derived from currentView
              if (isHidden && onTabletToggle) onTabletToggle(false); // W2: close tablet overlay
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (currentView === "marketing") return;
                onViewChange("marketing");
                if (isHidden && onTabletToggle) onTabletToggle(false);
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (isCollapsed && !hovered) {
                  // Deferred fix 1: collapsed mode — open overlay for keyboard sub-item access
                  setHovered(true);
                  requestAnimationFrame(() => {
                    const group = document.getElementById(`${item.id}-subitems`);
                    const first = group?.querySelector("[role='button']");
                    if (first) first.focus();
                  });
                } else if (expanded) {
                  const group = document.getElementById(`${item.id}-subitems`);
                  const first = group?.querySelector("[role='button']");
                  if (first) first.focus();
                }
              }
              // Deferred fix 2: Escape closes hover overlay in collapsed mode
              if (e.key === "Escape" && isCollapsed && hovered) {
                e.preventDefault();
                setHovered(false);
              }
            }}
            aria-expanded={expanded}
            aria-controls={`${item.id}-subitems`}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: effectiveLabels ? "10px 14px" : "10px 0",
              justifyContent: effectiveLabels ? "flex-start" : "center",
              borderRadius: 12, cursor: "pointer",
              background: expanded ? "rgba(255,255,255,0.08)" : active ? "rgba(255,255,255,0.1)" : "transparent",
              color: active ? "#fff" : "rgba(255,255,255,0.7)",
              fontWeight: active ? 600 : 500, fontSize: 14,
              transition,
              outline: "none",
              position: "relative",
            }}
            className="sidebar-nav-item"
          >
            <span aria-hidden="true" style={{ opacity: active ? 1 : 0.7, flexShrink: 0, display: "flex", alignItems: "center" }}>{item.icon}</span>
            {effectiveLabels && <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden" }}>{item.label}</span>}
            {effectiveLabels && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{
                  color: "rgba(255,255,255,0.4)",
                  transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                  transition: reducedMotion ? "none" : "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                  flexShrink: 0,
                }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
            {/* Tooltip for collapsed mode */}
            {isCollapsed && !hovered && (
              <div style={{
                position: "absolute", left: COLLAPSED_W + 8, top: "50%", transform: "translateY(-50%)",
                background: "rgba(0,0,0,0.85)", color: "#fff", padding: "6px 12px",
                borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                pointerEvents: "none", opacity: 0, transition: "opacity 150ms ease",
                zIndex: 100,
              }} className="sidebar-tooltip">
                {item.label}
              </div>
            )}
          </div>

          {/* Sub-items with animation */}
          {effectiveLabels && (
            <div
              id={`${item.id}-subitems`}
              role="group"
              aria-label="Sub-itens Marketing"
              style={{
                maxHeight: expanded ? 200 : 0,
                overflow: "hidden",
                transition: `max-height 300ms cubic-bezier(0.4, 0, 0.2, 1)`,
              }}
            >
              {[
                { id: "marketing-kpis", label: "KPIs ADS" },
                { id: "marketing-performance", label: "Performance ADS" },
              ].map(sub => {
                const subActive = activeSubView === sub.id;
                return (
                  <div
                    key={sub.id}
                    onClick={() => { onViewChange("marketing"); setActiveSubView(sub.id); if (isHidden && onTabletToggle) onTabletToggle(false); }}
                    role="button"
                    tabIndex={expanded ? 0 : -1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onViewChange("marketing");
                        setActiveSubView(sub.id);
                        if (isHidden && onTabletToggle) onTabletToggle(false);
                      }
                      // Deferred fix 2: Escape returns focus to parent accordion button
                      if (e.key === "Escape") {
                        e.preventDefault();
                        const parent = e.currentTarget.closest(`[id='${item.id}-subitems']`)?.previousElementSibling;
                        if (parent) parent.focus();
                        if (isCollapsed && hovered) setHovered(false);
                      }
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        const group = document.getElementById(`${item.id}-subitems`);
                        const items = group?.querySelectorAll("[role='button']");
                        if (!items) return;
                        const idx = Array.from(items).indexOf(e.currentTarget);
                        const next = e.key === "ArrowDown" ? items[idx + 1] : items[idx - 1];
                        if (next) next.focus();
                        else if (e.key === "ArrowUp") {
                          e.currentTarget.closest(`[id='${item.id}-subitems']`)?.previousElementSibling?.focus();
                        } else if (e.key === "ArrowDown") {
                          // Deferred fix 3: focus next nav item after accordion group
                          e.currentTarget.closest(`[id='${item.id}-subitems']`)?.parentElement?.nextElementSibling?.querySelector("[role='button']")?.focus();
                        }
                      }
                    }}
                    aria-current={subActive ? "page" : undefined}
                    style={{
                      paddingLeft: 44, paddingTop: 8, paddingBottom: 8,
                      fontSize: 13, cursor: "pointer",
                      color: subActive ? "#fff" : "rgba(255,255,255,0.5)",
                      fontWeight: subActive ? 600 : 400,
                      transition,
                      outline: "none",
                      borderRadius: 8,
                    }}
                    className="sidebar-nav-item sidebar-sub-item"
                  >
                    {sub.label}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Regular nav item
    return (
      <div
        key={item.id}
        onClick={() => handleNavClick(item.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => handleNavKeyDown(e, item.id)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: effectiveLabels ? "10px 14px" : "10px 0",
          justifyContent: effectiveLabels ? "flex-start" : "center",
          borderRadius: 12, cursor: "pointer",
          background: active ? "rgba(255,255,255,0.1)" : "transparent",
          color: active ? "#fff" : "rgba(255,255,255,0.7)",
          fontWeight: active ? 600 : 500, fontSize: 14,
          transition,
          outline: "none",
          position: "relative",
        }}
        className="sidebar-nav-item"
      >
        <span aria-hidden="true" style={{ opacity: active ? 1 : 0.7, flexShrink: 0, display: "flex", alignItems: "center" }}>{item.icon}</span>
        {effectiveLabels && <span style={{ whiteSpace: "nowrap", overflow: "hidden" }}>{item.label}</span>}
        {/* #6: Tooltip for collapsed mode */}
        {isCollapsed && !hovered && (
          <div style={{
            position: "absolute", left: COLLAPSED_W + 8, top: "50%", transform: "translateY(-50%)",
            background: "rgba(0,0,0,0.85)", color: "#fff", padding: "6px 12px",
            borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
            pointerEvents: "none", opacity: 0, transition: "opacity 150ms ease",
            zIndex: 100,
          }} className="sidebar-tooltip">
            {item.label}
          </div>
        )}
      </div>
    );
  }

  function renderContent(forceLabels = false) {
    const labels = forceLabels || showLabels;
    return (
      <>
        <div style={{ padding: labels ? "24px" : "24px 0", display: "flex", alignItems: "center", gap: 12, justifyContent: labels ? "flex-start" : "center", minWidth: labels ? EXPANDED_W : COLLAPSED_W }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #007AFF, #5856D6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-0.03em", flexShrink: 0 }}>Aw</div>
          {labels && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>AwData</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Dashboard</div>
            </div>
          )}
        </div>
        {labels && (
          <div style={{ padding: "24px 16px 8px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}>PAINEIS</div>
        )}
        <div style={{ flex: 1, padding: labels ? "0 12px" : "0 6px", display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV_ITEMS.map(item => renderNavItem(item, { labels }))}
        </div>
        <div style={{ padding: labels ? "16px 12px" : "16px 6px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div
            onClick={() => handleNavClick("config")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => handleNavKeyDown(e, "config")}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: labels ? "10px 14px" : "10px 0",
              justifyContent: labels ? "flex-start" : "center",
              borderRadius: 12, cursor: "pointer",
              background: currentView === "config" ? "rgba(255,255,255,0.1)" : "transparent",
              color: currentView === "config" ? "#fff" : "rgba(255,255,255,0.7)",
              fontWeight: currentView === "config" ? 600 : 500, fontSize: 14,
              transition, outline: "none",
              position: "relative",
            }}
            className="sidebar-nav-item"
          >
            <span aria-hidden="true" style={{ opacity: currentView === "config" ? 1 : 0.7, flexShrink: 0, display: "flex", alignItems: "center" }}>{Icons.settings}</span>
            {labels && <span>Configurações</span>}
            {isCollapsed && !hovered && (
              <div style={{
                position: "absolute", left: COLLAPSED_W + 8, top: "50%", transform: "translateY(-50%)",
                background: "rgba(0,0,0,0.85)", color: "#fff", padding: "6px 12px",
                borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                pointerEvents: "none", opacity: 0, transition: "opacity 150ms ease",
                zIndex: 100,
              }} className="sidebar-tooltip">
                Configurações
              </div>
            )}
          </div>
          {labels && (
            <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 16 }}>v1.0.0</div>
          )}
        </div>

        {/* #5: Toggle button for expand/collapse */}
        {!forceLabels && (
          <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <div
              onClick={onManualToggle}
              role="button"
              tabIndex={0}
              aria-label={isExpanded ? "Colapsar menu" : "Expandir menu"}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onManualToggle(); } }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "8px", borderRadius: 8, cursor: "pointer",
                color: "rgba(255,255,255,0.5)", transition,
                outline: "none",
              }}
              className="sidebar-nav-item"
            >
              <span aria-hidden="true">{isExpanded ? Icons.chevronLeft : Icons.chevronRight}</span>
              {labels && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500 }}>{isExpanded ? "Colapsar" : "Expandir"}</span>}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <nav
      ref={navRef}
      aria-label="Menu principal"
      onMouseEnter={isCollapsed ? () => setHovered(true) : undefined}
      onMouseLeave={isCollapsed ? () => setHovered(false) : undefined}
      style={{
        width: baseWidth,
        position: "relative",
        display: "flex", flexDirection: "column",
        background: "#030816", color: "#fff",
        borderRight: `1px solid ${bdrLight}`,
        transition,
        overflow: "visible",
        zIndex: 50,
        flexShrink: 0,
      }}
    >
      {/* Collapsed hover overlay */}
      {isCollapsed && hovered && (
        <div ref={overlayRef} style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: EXPANDED_W,
          background: "#030816",
          borderRight: `1px solid ${bdrLight}`,
          display: "flex", flexDirection: "column",
          zIndex: 51,
          boxShadow: "4px 0 24px rgba(0,0,0,0.3)",
          transition,
        }}>
          {renderContent(true)}
        </div>
      )}

      {/* Normal content (expanded or collapsed without hover) */}
      {!(isCollapsed && hovered) && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          {renderContent()}
        </div>
      )}

      <style>{`
        .sidebar-nav-item:focus-visible {
          outline: 2px solid #007AFF !important;
          outline-offset: -2px;
        }
        .sidebar-nav-item:hover .sidebar-tooltip {
          opacity: 1 !important;
        }
        .sidebar-sub-item:hover {
          color: rgba(255,255,255,0.8) !important;
        }
      `}</style>
    </nav>
  );
}

export { Icons };
