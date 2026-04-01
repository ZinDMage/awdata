export default function Pill({ active, accent, disabled, onClick, children, style }) {
  const isAccent = accent && active;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      aria-selected={active}
      aria-disabled={disabled || undefined}
      role="tab"
      disabled={disabled}
      style={{
        padding: "5px 14px", fontSize: 12, borderRadius: 20, cursor: disabled ? "default" : "pointer",
        fontWeight: active ? 600 : 400, border: "none",
        background: isAccent ? "#007AFF" : active ? "var(--color-text-primary)" : "var(--color-background-secondary)",
        color: isAccent ? "#fff" : active ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
        opacity: disabled ? 0.3 : 1,
        pointerEvents: disabled ? "none" : "auto",
        transition: "all 300ms cubic-bezier(0.4,0,0.2,1)",
        ...style,
      }}
    >{children}</button>
  );
}
