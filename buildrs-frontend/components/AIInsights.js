import { useRouter } from 'next/router';
import { Sparkles, ArrowUpRight } from 'lucide-react';

const TONES = {
  warning: { iconBg: 'rgba(229,184,74,0.1)', iconColor: '#e5b84a', accent: 'rgba(229,184,74,0.4)' },
  info: { iconBg: 'rgba(47,214,230,0.1)', iconColor: '#2fd6e6', accent: 'rgba(47,214,230,0.4)' },
  positive: { iconBg: 'rgba(52,211,153,0.1)', iconColor: '#34d399', accent: 'rgba(52,211,153,0.4)' },
};

export default function AIInsights({ stats = {}, tasks = [], projects = [], meetings = [], integrations = [] }) {
  const router = useRouter();
  const insights = [];

  const pendingCount = (stats.pendingTasks || tasks.filter((t) => t.status !== 'completed').length || 0);
  const completedCount = stats.totalCompleted || 0;
  const totalProjects = stats.activeProjects || projects.length || 0;
  const connectedIntegrations = integrations.filter((i) => i.connected).length || stats.integrations || 0;
  const upcomingMeetings = meetings?.length || 0;

  if (pendingCount > 0) {
    insights.push({
      id: 'pending-tasks',
      tone: 'warning',
      title: 'Open work waiting on you',
      body: `You have ${pendingCount} pending or in-progress task${pendingCount === 1 ? '' : 's'}. Consider triaging them before starting new work.`,
      action: '/tasks',
      actionLabel: 'Open tasks',
    });
  }

  if (upcomingMeetings > 0) {
    insights.push({
      id: 'upcoming-meeting',
      tone: 'info',
      title: 'Meeting coming up soon',
      body: `You have ${upcomingMeetings} upcoming meeting${upcomingMeetings === 1 ? '' : 's'}. Check your calendar before deep work.`,
      action: '/meetings',
      actionLabel: 'View meetings',
    });
  }

  if (connectedIntegrations === 0 && totalProjects === 0) {
    insights.push({
      id: 'onboarding',
      tone: 'info',
      title: 'Get more from BuildrsHQ',
      body: 'Connect GitHub or create your first project to unlock smarter insights.',
      action: '/integrations',
      actionLabel: 'Connect integrations',
    });
  }

  if (completedCount > 0 && pendingCount === 0) {
    insights.push({
      id: 'clean-state',
      tone: 'positive',
      title: 'Great momentum',
      body: `You’ve completed ${completedCount} task${completedCount === 1 ? '' : 's'}. Keep the streak going.`,
      action: '/tasks',
      actionLabel: 'Review completed',
    });
  }

  if (insights.length === 0) {
    return (
      <div className="dash-empty">
        <div className="dash-empty-ico">
          <Sparkles className="w-5 h-5" />
        </div>
        <p className="dash-empty-title">No insights yet</p>
        <p className="dash-empty-sub">Add tasks, projects, or meetings to get personalized suggestions.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {insights.map((insight) => {
        const tone = TONES[insight.tone] || TONES.info;

        return (
          <div key={insight.id} className="insight-row">
            <div className="insight-ico" style={{ background: tone.iconBg, color: tone.iconColor }}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="insight-title">{insight.title}</p>
              <p className="insight-body">{insight.body}</p>
              <button type="button" onClick={() => router.push(insight.action)} className="insight-action">
                {insight.actionLabel}
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}