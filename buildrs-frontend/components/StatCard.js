export default function StatCard({ value, label, color, onClick, trend, subtext }) {
  return (
    <div
      className={`stat-card stat-card-${color} ${onClick ? 'cursor-pointer hover:border-gray-400 transition-colors' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="stat-card-value">{value ?? 0}</div>
          <div className="stat-card-label">{label}</div>
          {subtext && <div className="text-xs text-gray-400 mt-1">{subtext}</div>}
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '•'}
          </span>
        )}
      </div>
    </div>
  );
}
