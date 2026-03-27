/**
 * KpiCards — Story 3.1
 * Apple-style KPI cards with accent bar, variation arrow, and micro-context.
 * Consumes kpis prop built in MetricsView (row1, row2pipe, row2rest).
 */

// Accent bar color per KPI area (matches funnel color tokens)
const ACCENT = {
  rec:  "var(--color-closer)",    // green  — Receita
  gAds: "var(--color-marketing)", // blue   — Gasto Ads
  roi:  "var(--color-marketing)", // blue   — ROI
  mc:   "var(--color-financeiro)",// red    — Margem de Contribuição
  pipe: "var(--color-sdr)",       // orange — Pipeline
  vnd:  "var(--color-closer)",    // green  — Vendas
  tmf:  "var(--color-deltas)",    // purple — Ticket Médio
};

// Micro-context message shown on negative variation cards
const MICRO_CTX = {
  rec:  "puxado por queda no Inbound",
  gAds: "custo de mídia acima do planejado",
  roi:  "retorno abaixo do mês anterior",
  mc:   "margem pressionada por churn ou impostos",
  pipe: "pipeline em queda — revisar prospecção",
  vnd:  "fechamentos abaixo do esperado",
  tmf:  "ticket médio em compressão",
};

/**
 * Returns variation state: "positive" | "negative" | "neutral"
 * inv=1 means lower is better (e.g. Gasto Ads)
 */
function varState(d, inv) {
  if (d == null) return "neutral";
  if (inv) {
    if (d < 0) return "positive";
    if (d > 5) return "negative";
    return "neutral";
  }
  if (d > 0) return "positive";
  if (d < -5) return "negative";
  return "neutral";
}

const STATE_COLOR = {
  positive: "var(--color-positive)",
  negative: "var(--color-negative)",
  neutral:  "var(--color-content-tertiary)",
};

const STATE_BG = {
  positive: "rgba(52,199,89,0.13)",
  negative: "rgba(255,69,58,0.13)",
  neutral:  "transparent",
};

function DeltaBadge({ d, inv }) {
  if (d == null || Math.abs(d) < 1) return null;
  const state = varState(d, inv);
  const arrow = d > 0 ? "\u25B2" : "\u25BC"; // Story 8.1 AC#5: solid triangles for accessibility
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 10,
        background: STATE_BG[state],
        color: STATE_COLOR[state],
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {arrow}{Math.abs(d).toFixed(1)}%
    </span>
  );
}

function KpiCard({ k, accentKey, compLabel }) {
  const state = varState(k.d, k.inv);
  const isNegative = state === "negative";
  const isPositive = state === "positive";
  const isNeutral  = !isNegative && !isPositive;
  const accent = ACCENT[accentKey] ?? "var(--color-border-subtle)";

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        padding: 24,
        position: "relative",
        overflow: "hidden",
        background: "var(--color-surface-secondary)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        border: "1px solid rgba(255,255,255,0.08)",
        transition: "border-color 300ms cubic-bezier(0.4,0,0.2,1), transform 300ms cubic-bezier(0.4,0,0.2,1)",
        cursor: "default",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          borderRadius: "var(--radius-card) var(--radius-card) 0 0",
          background: accent,
          opacity: 0.85,
        }}
      />

      {/* Label row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--color-content-tertiary)",
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          {k.l}
        </div>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 600,
            background: "rgba(255,255,255,0.06)",
            color: "var(--color-content-tertiary)",
          }}
        >
          {k.ico}
        </div>
      </div>

      {/* Main value */}
      <div
        title={k.v === "—" ? "Dado não disponível para este período" : undefined}
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: "var(--color-content-primary)",
          lineHeight: 1.05,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
        }}
      >
        {k.v}
      </div>

      {/* Bottom row: sub-label + badge */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginTop: 8,
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Previous period comparison — Story 8.1 AC#4: show absolute previous value */}
          {k.d != null && Math.abs(k.d) >= 1 ? (
            <div
              style={{
                fontSize: 10,
                color: "var(--color-content-tertiary)",
                marginBottom: isNegative && MICRO_CTX[accentKey] ? 3 : 0,
              }}
            >
              {`${k.d > 0 ? "+" : ""}${k.d.toFixed(1)}%${k.prevVal != null && k.fmt ? ` vs ${k.fmt(k.prevVal)}` : ""}${compLabel ? ` ${compLabel}` : ""}`}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: "var(--color-content-tertiary)" }}>
              {k.sub}
            </div>
          )}

          {/* Micro-context for negative cards (UX-DR22) */}
          {isNegative && MICRO_CTX[accentKey] && (
            <div
              style={{
                fontSize: 9,
                color: "var(--color-negative)",
                opacity: 0.75,
                marginTop: 1,
              }}
            >
              {MICRO_CTX[accentKey]}
            </div>
          )}
        </div>

        {/* Delta badge */}
        <DeltaBadge d={k.d} inv={k.inv} />
      </div>
    </div>
  );
}

export default function KpiCards({ kpis, compLabel }) {
  const pipe = kpis.row2pipe;
  const pState = varState(pipe.d, pipe.inv);

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Row 1: Receita | Gasto Ads | ROI | Margem de Contribuição */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 8,
          marginBottom: 8,
          alignItems: "stretch",
        }}
      >
        <KpiCard k={kpis.row1[0]} accentKey="rec" compLabel={compLabel} />
        <KpiCard k={kpis.row1[1]} accentKey="gAds" compLabel={compLabel} />
        <KpiCard k={kpis.row1[2]} accentKey="roi" compLabel={compLabel} />
        <KpiCard k={kpis.row1[3]} accentKey="mc" compLabel={compLabel} />
      </div>

      {/* Row 2: Pipeline (2 cols wide) | Vendas | Ticket Médio */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: 8,
          alignItems: "stretch",
        }}
      >
        {/* Pipeline card — wide, with children breakdown */}
        <div
          style={{
            borderRadius: "var(--radius-card)",
            padding: 24,
            position: "relative",
            overflow: "hidden",
            background: "var(--color-surface-secondary)",
            display: "flex",
            flexDirection: "column",
            border: "1px solid rgba(255,255,255,0.08)",
            transition: "border-color 300ms cubic-bezier(0.4,0,0.2,1), transform 300ms cubic-bezier(0.4,0,0.2,1)",
            cursor: "default",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          {/* Accent bar — SDR orange */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              borderRadius: "var(--radius-card) var(--radius-card) 0 0",
              background: ACCENT.pipe,
              opacity: 0.85,
            }}
          />

          {/* Label + badge row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--color-content-tertiary)",
                fontWeight: 500,
                letterSpacing: "0.02em",
              }}
            >
              {pipe.l}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <DeltaBadge d={pipe.d} inv={pipe.inv} />
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 600,
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--color-content-tertiary)",
                }}
              >
                {pipe.ico}
              </div>
            </div>
          </div>

          {/* Main value */}
          <div
            title={pipe.v === "—" ? "Dado não disponível para este período" : undefined}
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "var(--color-content-primary)",
              lineHeight: 1.05,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
          >
            {pipe.v}
          </div>

          {/* Comparison text */}
          {/* Story 8.1 AC#4: show absolute previous value for pipeline */}
          {pipe.d != null && Math.abs(pipe.d) >= 1 && (
            <div style={{ fontSize: 10, color: "var(--color-content-tertiary)", marginTop: 4 }}>
              {`${pipe.d > 0 ? "+" : ""}${pipe.d.toFixed(1)}%${pipe.prevVal != null && pipe.fmt ? ` vs ${pipe.fmt(pipe.prevVal)}` : ""}${compLabel ? ` ${compLabel}` : ""}`}
            </div>
          )}

          {/* Micro-context for negative pipeline */}
          {pState === "negative" && (
            <div
              style={{
                fontSize: 9,
                color: "var(--color-negative)",
                opacity: 0.75,
                marginTop: 2,
              }}
            >
              {MICRO_CTX.pipe}
            </div>
          )}

          {/* Sub-label */}
          <div
            style={{
              fontSize: 10,
              color: "var(--color-content-tertiary)",
              marginTop: 4,
              marginBottom: 12,
            }}
          >
            {pipe.sub}
          </div>

          {/* Children breakdown */}
          <div
            style={{
              display: "flex",
              gap: 12,
              borderTop: "0.5px solid rgba(255,255,255,0.06)",
              paddingTop: 12,
              marginTop: "auto",
            }}
          >
            {pipe.children.map((ch, ci) => {
              const chState = varState(ch.d, ch.inv);
              return (
                <div key={ci} style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--color-content-tertiary)",
                      marginBottom: 3,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 9 }}>↳</span> {ch.l}
                  </div>
                  <div
                    title={ch.v === "—" ? "Dado não disponível para este período" : undefined}
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--color-content-primary)",
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.02em",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {ch.v}
                    {ch.d != null && Math.abs(ch.d) >= 1 && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          color: STATE_COLOR[chState],
                        }}
                      >
                        {ch.d > 0 ? "\u25B2" : "\u25BC"}{Math.abs(ch.d).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Vendas | Ticket Médio */}
        <KpiCard k={kpis.row2rest[0]} accentKey="vnd" compLabel={compLabel} />
        <KpiCard k={kpis.row2rest[1]} accentKey="tmf" compLabel={compLabel} />
      </div>
    </div>
  );
}
