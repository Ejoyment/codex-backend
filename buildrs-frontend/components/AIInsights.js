import { useRouter } from 'next/router';
import { Sparkles, ArrowUpRight, AlertCircle } from 'lucide-react';

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
      actionLabel: 'Open Tasks',
    });
  }

  if (upcomingMeetings > 0) {
    insights.push({
      id: 'upcoming-meeting',
      tone: 'info',
      title: 'Meeting coming up soon',
      body: `You have ${upcomingMeetings} upcoming meeting${upcomingMeetings === 1 ? '' : 's'}. Check your calendar before deep work.`,
      action: '/meetings',
      actionLabel: 'View Meetings',
    });
  }

  if (connectedIntegrations === 0 && totalProjects === 0) {
    insights.push({
      id: 'onboarding',
      tone: 'info',
      title: 'Get more from BuildrsHQ',
      body: 'Connect GitHub or create your first project to unlock smarter insights.',
      action: '/integrations',
      actionLabel: 'Connect Integrations',
    });
  }

  if (completedCount > 0 && pendingCount === 0) {
    insights.push({
      id: 'clean-state',
      tone: 'positive',
      title: 'Great momentum',
      body: `You’ve completed ${completedCount} task${completedCount === 1 ? '' : 's'}. Keep the streak going.`,
      action: '/tasks',
      actionLabel: 'Review Completed',
    });
  }

  if (insights.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm font-medium text-gray-400">No insights yet</p>
        <p className="text-xs text-gray-500">Add tasks, projects, or meetings to get personalized suggestions.</p>
      </div>
    );
  }

  const toneStyles = {
    warning: { border: 'border-yellow-500/30', icon: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    info: { border: 'border-blue-500/30', icon: 'text-blue-400', bg: 'bg-blue-500/10' },
    positive: { border: 'border-green-500/30', icon: 'text-green-400', bg: 'bg-green-500/10' },
  };

  return (
    <div className="flex flex-col gap-2">
      {insights.map((insight) => {
        const style = toneStyles[insight.tone] || toneStyles.info;

        return (
          <div
            key={insight.id}
            className={`flex items-start gap-3 p-3 rounded-lg border ${style.border} ${style.bg}`}
          >
            <Sparkles className={`w-4 h-4 mt-0.5 ${style.icon}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{insight.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{insight.body}</p>
            </div>
            <button
              type="button"
              onClick={() => router.push(insight.action)}
              className="flex-shrink-0 text-xs font-medium text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
            >
              {insight.actionLabel}
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
