export default function Arrow({ val, inv }) {
  if (val == null || Math.abs(val) < 0.5) return null;
  const up = val > 0, good = inv ? !up : up;
  return <span style={{ fontSize: 9, fontWeight: 600, marginLeft: 5, color: good ? "#34C759" : "#FF453A" }}>{up ? "\u25B2" : "\u25BC"}{Math.abs(val).toFixed(0)}%</span>;
}
