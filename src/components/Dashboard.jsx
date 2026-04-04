import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { supabase } from '@/services/supabaseClient';
import { useMetrics } from '@/contexts/MetricsContext';
import Sidebar from './Sidebar';
import Header from './Header';
import MetricsView from './MetricsView';
import ConfigPanel from './ConfigPanel';
import SkeletonLoader from './SkeletonLoader';
import { GerencialProvider } from '@/contexts/GerencialContext';
import { MarketingProvider } from '@/contexts/MarketingContext'; // D2: provider lifted

const GerencialView = lazy(() => import('./GerencialView'));
const MarketingView = lazy(() => import('./MarketingView')); // P3: lazy like GerencialView

function useDarkMode() {
  const [dk, setDk] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setDk(e.matches);
    setDk(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return dk;
}

function useScreenSize() {
  const [screenSize, setScreenSize] = useState(() => {
    if (typeof window === "undefined") return "xl";
    if (window.innerWidth >= 1440) return "xl";
    if (window.innerWidth >= 1024) return "desktop";
    return "tablet";
  });

  useEffect(() => {
    const xl = window.matchMedia("(min-width: 1440px)");
    const desktop = window.matchMedia("(min-width: 1024px)");

    const update = () => {
      if (xl.matches) setScreenSize("xl");
      else if (desktop.matches) setScreenSize("desktop");
      else setScreenSize("tablet");
    };

    update();
    xl.addEventListener("change", update);
    desktop.addEventListener("change", update);
    return () => {
      xl.removeEventListener("change", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  return screenSize;
}

export default function Dashboard({ session }) {
  const screenSize = useScreenSize();
  const [manualOverride, setManualOverride] = useState(null);
  const [currentView, setCurrentView] = useState("metricas");
  const { loading, error, retry, fetchTimestamp, partialData } = useMetrics();
  const handleLogout = useCallback(() => supabase.auth.signOut(), []);

  // #4: tabletOpen lifted from Sidebar to Dashboard (owner of all sidebar state)
  const [tabletOpen, setTabletOpen] = useState(false);

  // Sidebar state: auto from breakpoint, manual override
  const autoState = screenSize === "xl" ? "expanded" : screenSize === "desktop" ? "collapsed" : "hidden";
  const sidebarState = manualOverride ?? autoState;

  // Reset manual override and tablet overlay when screen size changes (#14)
  useEffect(() => {
    setManualOverride(null);
    setTabletOpen(false);
  }, [screenSize]);

  const handleManualToggle = useCallback(() => {
    setManualOverride(prev => {
      if (prev === null) {
        // First toggle: opposite of auto
        return autoState === "expanded" ? "collapsed" : "expanded";
      }
      // Subsequent toggles
      return prev === "expanded" ? "collapsed" : "expanded";
    });
  }, [autoState]);

  // #8: Separate handler for tablet toggle — Header calls this when hidden
  const handleTabletToggle = useCallback((open) => {
    if (typeof open === "boolean") {
      setTabletOpen(open);
    } else {
      setTabletOpen(prev => !prev);
    }
  }, []);

  // #3 + #8: Correct toggle handler for Header based on sidebar state
  const handleHeaderToggle = useCallback(() => {
    if (sidebarState === "hidden") {
      handleTabletToggle();
    } else {
      handleManualToggle();
    }
  }, [sidebarState, handleTabletToggle, handleManualToggle]);

  const dk = useDarkMode();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-primary)", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#007AFF", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ fontSize: 14 }}>Carregando métricas...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-primary)", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>Erro ao carregar dados</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Não foi possível conectar ao banco de dados.</div>
          <button onClick={retry} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: "#007AFF", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Tentar novamente</button>
        </div>
      </div>
    );
  }

  return (
    <MarketingProvider>
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", fontFamily: "var(--font-sans)", WebkitFontSmoothing: "antialiased", background: "var(--color-background-primary)" }}>
      <Sidebar
        sidebarState={sidebarState}
        tabletOpen={tabletOpen}
        onTabletToggle={handleTabletToggle}
        onManualToggle={handleManualToggle}
        currentView={currentView}
        onViewChange={setCurrentView}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <Header session={session} onToggleSidebar={handleHeaderToggle} onLogout={handleLogout} />

        <div style={{ flex: 1, overflowY: "auto", padding: "24px", boxSizing: "border-box" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 40 }}>

            {currentView === "gerencial" && (
              <Suspense fallback={<SkeletonLoader />}>
                <GerencialProvider>
                  <GerencialView />
                </GerencialProvider>
              </Suspense>
            )}

            {currentView === "marketing" && (
              <Suspense fallback={<SkeletonLoader />}>
                <MarketingView dk={dk} />
              </Suspense>
            )}

            {currentView !== "metricas" && currentView !== "config" && currentView !== "gerencial" && currentView !== "marketing" && (
              <div style={{ textAlign: "center", padding: "100px 0", color: "var(--color-text-tertiary)" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}>Em construção</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Esta visão estará disponível em breve.</div>
              </div>
            )}

            {/* #1: Fix — only render ConfigPanel OR MetricsView, not both */}
            {currentView === "config" && <ConfigPanel dk={dk} />}

            {currentView === "metricas" && (
              <MetricsView dk={dk} />
            )}

            <div style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "var(--color-text-tertiary)", borderTop: "0.5px solid rgba(255,255,255,0.04)", paddingTop: 12, gap: 8, flexWrap: "wrap" }}>
              <span>AwData — Painel executivo de marketing e comercial</span>
              {fetchTimestamp && (
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {partialData ? (
                    <span style={{ color: "var(--color-warning, #FF9500)" }}>Dados parciais — algumas fontes indisponíveis · </span>
                  ) : null}
                  Dados carregados às {fetchTimestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <span style={{ fontVariantNumeric: "tabular-nums" }}>↑↓ variação vs. período anterior</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </MarketingProvider>
  );
}
