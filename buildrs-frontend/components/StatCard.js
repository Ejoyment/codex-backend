import { FolderKanban, CheckCircle2, AlertTriangle, UserPlus } from 'lucide-react';

const DEFAULT_ICONS = {
  blue: FolderKanban,
  green: CheckCircle2,
  orange: AlertTriangle,
  purple: UserPlus,
};

const TINTS = {
  blue: '#2fd6e6',
  green: '#34d399',
  orange: '#e5b84a',
  purple: '#a78bfa',
};

export default function StatCard({ value, label, color = 'blue', icon, trend, subtext, onClick }) {
  const Icon = icon || DEFAULT_ICONS[color] || DEFAULT_ICONS.blue;
  const tint = TINTS[color] || TINTS.blue;

  return (
    <div
      className={`dash-kpi dash-kpi-${color} ${onClick ? 'dash-kpi-link' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <div className="dash-kpi-head">
        <span className="dash-kpi-eyebrow">{label}</span>
        <span className="dash-kpi-ico">
          <Icon className="w-4 h-4" style={{ color: tint }} />
        </span>
      </div>
      <div className="dash-kpi-value">{value ?? 0}</div>
      <div className="dash-kpi-meta-row">
        <div className="dash-kpi-meta">{subtext || '\u00A0'}</div>
        {trend && (
          <span className={`dash-kpi-trend ${trend === 'up' ? 'up' : trend === 'down' ? 'down' : ''}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '•'}
          </span>
        )}
      </div>
    </div>
  );
}