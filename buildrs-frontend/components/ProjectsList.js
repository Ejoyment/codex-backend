import { Github, Users, FolderKanban, FileText, ExternalLink } from 'lucide-react';

const STATUS_STYLES = {
  active: { bg: '#1e3a5f', text: '#60a5fa', label: 'Active' },
  planning: { bg: '#3d2f0f', text: '#fbbf24', label: 'Planning' },
  'on-hold': { bg: '#3d1f1a', text: '#f87171', label: 'On Hold' },
  completed: { bg: '#0f3d2e', text: '#34d399', label: 'Completed' },
  archived: { bg: '#111827', text: '#9ca3af', label: 'Archived' },
};

function ProjectIcon({ type }) {
  if (type === 'github') return <Github className="w-6 h-6" />;
  if (type === 'team') return <Users className="w-6 h-6" />;
  return <FolderKanban className="w-6 h-6" />;
}

function ProgressBar({ value }) {
  const safe = Number(value) || 0;
  const width = `${Math.min(Math.max(safe, 0), 100)}%`;

  return (
    <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
      <div className="h-full bg-blue-500 rounded-full" style={{ width }} />
    </div>
  );
}

export default function ProjectsList({ projects, onViewAll }) {
  if (projects === null) {
    return <p className="text-muted text-sm">Loading projects...</p>;
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-8 px-4 bg-navy rounded-lg border border-dashed border-gray-600">
        <FileText className="w-12 h-12 text-gray-500 mx-auto mb-4" />
        <p className="text-gray-400 text-sm mb-4">No projects yet</p>
        <button
          type="button"
          onClick={onViewAll}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium"
        >
          Create Your First Project
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {projects.map((project, idx) => {
        const status = STATUS_STYLES[project.status] || STATUS_STYLES.active;
        const iconColor = project.type === 'github' ? '#e2e8f0' : project.type === 'local' ? '#3b82f6' : '#8b5cf6';
        const iconBg = project.type === 'github' ? '#111827' : '#2a1f4d';
        const progress = project.stats?.progress || 0;

        return (
          <div
            key={`${project.name}-${idx}`}
            className="flex gap-4 p-4 border border-gray-700 rounded-lg transition hover:border-gray-500 cursor-pointer"
            onClick={() => (project.url ? window.open(project.url, '_blank') : onViewAll?.())}
          >
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: iconBg, color: iconColor }}
            >
              <ProjectIcon type={project.type} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-sm text-white truncate">{project.name}</h3>
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0"
                  style={{ background: status.bg, color: status.text }}
                >
                  {status.label}
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-2 truncate">{project.description}</p>
              <ProgressBar value={progress} />
              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-3 text-[11px] text-gray-500">
                  {project.type === 'github' && (
                    <>
                      <span>⭐ {project.stats?.stars || 0}</span>
                      <span>🔱 {project.stats?.forks || 0}</span>
                      {project.stats?.language && <span>• {project.stats.language}</span>}
                    </>
                  )}
                  {project.type === 'local' && (
                    <>
                      <span>📊 {progress}%</span>
                      <span>🎯 {project.stats?.priority || 'medium'}</span>
                    </>
                  )}
                  {project.type === 'team' && (
                    <>
                      <span>📊 {progress}%</span>
                      <span>👥 {project.stats?.members || 0}</span>
                      <span>🎯 {project.stats?.priority || 'medium'}</span>
                    </>
                  )}
                </div>
                {project.url && (
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
