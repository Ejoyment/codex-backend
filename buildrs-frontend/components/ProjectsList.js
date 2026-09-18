import { Github, Users, FolderKanban, FileText } from 'lucide-react';

const STATUS_STYLES = {
  active: { bg: 'rgba(47,214,230,0.12)', text: '#2fd6e6', label: 'Active' },
  planning: { bg: 'rgba(229,184,74,0.12)', text: '#e5b84a', label: 'Planning' },
  'on-hold': { bg: 'rgba(248,113,113,0.1)', text: '#f87171', label: 'On Hold' },
  completed: { bg: 'rgba(52,211,153,0.12)', text: '#34d399', label: 'Completed' },
  archived: { bg: 'rgba(255,255,255,0.06)', text: '#9aa1ae', label: 'Archived' },
};

function ProjectIcon({ type }) {
  if (type === 'github') return <Github className="w-5 h-5" />;
  if (type === 'team') return <Users className="w-5 h-5" />;
  return <FolderKanban className="w-5 h-5" />;
}

export default function ProjectsList({ projects, onViewAll }) {
  if (projects === null) {
    return <p className="text-muted text-sm">Loading projects...</p>;
  }

  if (projects.length === 0) {
    return (
      <div className="dash-empty">
        <div className="dash-empty-ico">
          <FileText className="w-5 h-5" />
        </div>
        <p className="dash-empty-title">No projects yet</p>
        <p className="dash-empty-sub">Create your first project to start tracking work.</p>
        <button
          type="button"
          onClick={onViewAll}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm no-underline font-medium"
        >
          Create Your First Project
        </button>
      </div>
    );
  }

  return (
    <div>
      {projects.map((project, idx) => {
        const status = STATUS_STYLES[project.status] || STATUS_STYLES.active;
        const iconColor = project.type === 'github' ? '#e2e8f0' : project.type === 'local' ? '#2fd6e6' : '#a78bfa';
        const iconBg = project.type === 'github' ? 'rgba(255,255,255,0.06)' : project.type === 'local' ? 'rgba(47,214,230,0.10)' : 'rgba(167,139,250,0.12)';
        const progress = project.stats?.progress || 0;
        const metaParts = [];

        if (project.type === 'github') {
          metaParts.push(`★ ${project.stats?.stars || 0}`);
          metaParts.push(`⑂ ${project.stats?.forks || 0}`);
          if (project.stats?.language) metaParts.push(project.stats.language);
        } else if (project.type === 'local') {
          metaParts.push(`${progress}% done`);
          metaParts.push(project.stats?.priority || 'medium');
        } else if (project.type === 'team') {
          metaParts.push(`${progress}% done`);
          metaParts.push(`${project.stats?.members || 0} members`);
          metaParts.push(project.stats?.priority || 'medium');
        }

        return (
          <div
            key={`${project.name}-${idx}`}
            className="proj-row"
            onClick={() => (project.url ? window.open(project.url, '_blank') : onViewAll?.())}
          >
            <div className="proj-ico" style={{ background: iconBg, color: iconColor }}>
              <ProjectIcon type={project.type} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="proj-title">{project.name}</h3>
                <span
                  className="pill flex-shrink-0"
                  style={{ background: status.bg, color: status.text }}
                >
                  {status.label}
                </span>
              </div>
              <p className="proj-desc">{project.description}</p>
              {(progress > 0 || project.type === 'github') && (
                <div className="prog-track">
                  <div className="prog-fill" style={{ width: `${Math.min(Math.max(Number(progress) || 0, project.type === 'github' ? 100 : 0), 100)}%` }} />
                </div>
              )}
              <div className="proj-meta">
                <span>{metaParts.join(' · ')}</span>
                {project.url && <span>open ↗</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}