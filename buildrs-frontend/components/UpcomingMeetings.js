import { useRouter } from 'next/router';
import { Video, Calendar, Clock, Users, ChevronRight } from 'lucide-react';

const STATUS_STYLES = {
  scheduled: { bg: 'rgba(47,214,230,0.1)', text: '#2fd6e6', label: 'Scheduled' },
  ongoing: { bg: 'rgba(52,211,153,0.12)', text: '#34d399', label: 'Ongoing' },
  completed: { bg: 'rgba(255,255,255,0.06)', text: '#9aa1ae', label: 'Completed' },
  cancelled: { bg: 'rgba(248,113,113,0.1)', text: '#f87171', label: 'Cancelled' },
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

  if (isToday) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` · ${time}`;
}

export default function UpcomingMeetings({ meetings = [] }) {
  const router = useRouter();
  const upcoming = meetings.slice(0, 4);

  if (upcoming.length === 0) {
    return (
      <div className="dash-empty">
        <div className="dash-empty-ico">
          <Calendar className="w-5 h-5" />
        </div>
        <p className="dash-empty-title">No upcoming meetings</p>
        <p className="dash-empty-sub">Schedule one to keep the team aligned.</p>
        <button
          type="button"
          onClick={() => router.push('/meetings')}
          className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm no-underline font-medium"
        >
          Schedule Meeting
        </button>
      </div>
    );
  }

  return (
    <div>
      {upcoming.map((meeting) => {
        const isJoinable = meeting.status === 'scheduled' || meeting.status === 'ongoing';
        const status = STATUS_STYLES[meeting.status] || STATUS_STYLES.scheduled;
        const hostName = typeof meeting.host === 'string' ? meeting.host : meeting.host?.fullName || meeting.host?.email || 'Host';

        return (
          <div
            key={meeting._id || meeting.id}
            className="queue-row"
            onClick={() => router.push(`/meetings`)}
          >
            <div className="queue-main">
              <div className="flex items-center gap-2">
                <p className="queue-title">{meeting.title}</p>
              </div>
              <div className="queue-meta">
                <span className="pill" style={{ background: status.bg, color: status.text }}>
                  {status.label}
                </span>
                <span className="queue-due">
                  <Calendar className="w-3 h-3 inline mr-1 align-text-top" style={{ color: '#565d6b' }} />
                  {formatMeetingTime(meeting.scheduledAt)}
                </span>
                <span className="queue-due">{meeting.duration || 30} min</span>
                <span className="queue-due">
                  <Users className="w-3 h-3 inline mr-1 align-text-top" style={{ color: '#565d6b' }} />
                  {meeting.participants?.length || 0}
                </span>
              </div>
              <div className="queue-hint mt-1">Host — {hostName}</div>
            </div>
            {isJoinable ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/meeting-room/${meeting.roomId || meeting._id}`);
                }}
                className="join-btn"
              >
                <Video className="w-3.5 h-3.5" />
                Join
              </button>
            ) : (
              <ChevronRight className="queue-chevron" />
            )}
          </div>
        );
      })}
    </div>
  );
}