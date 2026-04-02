import ModeBadge from './ModeBadge';
import HealthSummary from './HealthSummary';
import ActiveFilterBadge from './ActiveFilterBadge';

const SidebarIcon = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>;
const LogoutIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;

export default function Header({ session, onToggleSidebar, onLogout }) {
  const bdrLight = "rgba(255,255,255,0.04)";
  return (
    <div style={{ minHeight: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", borderBottom: `1px solid ${bdrLight}`, background: "var(--color-background-primary)", zIndex: 10, gap: 16 }}>
      <div onClick={onToggleSidebar} style={{ cursor: "pointer", color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8, flexShrink: 0, transition: "background 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = bdrLight} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{SidebarIcon}</div>

      {/* ModeBadge + HealthSummary — center area */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <ModeBadge />
        <HealthSummary />
        <ActiveFilterBadge />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{session?.user?.email || ""}</div>
        </div>
        <div style={{ width: 32, height: 32, borderRadius: 16, background: "#0D6EFD", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>{session?.user?.email ? session.user.email.substring(0, 2).toUpperCase() : "AW"}</div>
        <div onClick={onLogout} style={{ cursor: "pointer", color: "var(--color-text-tertiary)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16, transition: "background 0.2s" }} title="Sair" onMouseEnter={e => e.currentTarget.style.background = "rgba(255,69,58,0.1)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{LogoutIcon}</div>
      </div>
    </div>
  );
}
