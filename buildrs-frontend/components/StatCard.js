export default function StatCard({ value, label, color }) {
  return (
    <div className={`stat-card stat-card-${color}`}>
      <div className="stat-card-value">{value ?? 0}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}
