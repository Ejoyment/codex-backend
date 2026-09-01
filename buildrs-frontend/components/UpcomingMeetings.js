import { useRouter } from 'next/router';
import { Video, Calendar, Clock, Users, Loader2 } from 'lucide-react';

const STATUS_STYLES = {
  scheduled: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  ongoing: 'bg-green-500/20 text-green-400 border-green-500/30',
  completed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function formatMeetingTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (isToday) return `Today • ${time}`;
  if (isTomorrow) return `Tomorrow • ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` • ${time}`;
}

export default function UpcomingMeetings({ meetings = [] }) {
  const router = useRouter();
  const upcoming = meetings.slice(0, 4);

  if (upcoming.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-600" />
        <p className="text-sm font-medium text-gray-400">No upcoming meetings</p>
        <p className="text-xs text-gray-500">Schedule one to keep the team aligned.</p>
        <button
          type="button"
          onClick={() => router.push('/meetings')}
          className="mt-3 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium"
        >
          Schedule Meeting
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {upcoming.map((meeting) => {
        const isJoinable = meeting.status === 'scheduled' || meeting.status === 'ongoing';
        const hostName = typeof meeting.host === 'string' ? meeting.host : meeting.host?.fullName || meeting.host?.email || 'Host';

        return (
          <div
            key={meeting._id || meeting.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-700 hover:border-gray-500 transition"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-white truncate">{meeting.title}</p>
                <span className={`text-[11px] px-2 py-0.5 rounded border ${STATUS_STYLES[meeting.status] || STATUS_STYLES.scheduled}`}>
                  {meeting.status || 'scheduled'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatMeetingTime(meeting.scheduledAt)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {meeting.duration || 30} min
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {meeting.participants?.length || 0}
                </span>
                <span className="text-gray-500 truncate">Host: {hostName}</span>
              </div>
            </div>
            {isJoinable && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/meeting-room/${meeting.roomId || meeting._id}`);
                }}
                className="flex-shrink-0 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Video className="w-3.5 h-3.5" />
                Join
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
