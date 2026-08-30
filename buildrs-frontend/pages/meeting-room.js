import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { getAvatarUrl } from '../lib/utils';
import {
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Send, Users, MessageSquare, Clock
} from 'lucide-react';

export default function MeetingRoom() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const { meetingId } = router.query;

  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [joining, setJoining] = useState(false);

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [showParticipants, setShowParticipants] = useState(true);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);
  const chatEndRef = useRef(null);

  const fetchMeeting = useCallback(async () => {
    if (!meetingId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch(`/api/meetings/${meetingId}`);
      if (data.success) {
        setMeeting(data.meeting);
      }
    } catch (err) {
      setError(err.message || 'Failed to load meeting');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  const joinMeeting = useCallback(async () => {
    if (!meetingId || joining) return;
    try {
      setJoining(true);
      setError(null);
      const data = await apiFetch(`/api/meetings/${meetingId}/join`, { method: 'POST' });
      if (data.success) {
        setMeeting(data.meeting);
        setConnected(true);
        setElapsedSeconds(0);
        timerRef.current = setInterval(() => {
          setElapsedSeconds((s) => s + 1);
        }, 1000);
      }
    } catch (err) {
      setError(err.message || 'Failed to join meeting');
    } finally {
      setJoining(false);
    }
  }, [meetingId, joining]);

  const leaveMeeting = useCallback(async () => {
    if (!meetingId) return;
    try {
      await apiFetch(`/api/meetings/${meetingId}/leave`, { method: 'POST' });
    } catch {
      // proceed with local cleanup even if API fails
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setConnected(false);
      setMeeting(null);
      setElapsedSeconds(0);
      router.push('/meetings');
    }
  }, [meetingId, router]);

  useEffect(() => {
    fetchMeeting();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchMeeting]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const formatTime = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const parts = [];
    if (hrs > 0) parts.push(String(hrs).padStart(2, '0'));
    parts.push(String(mins).padStart(2, '0'));
    parts.push(String(secs).padStart(2, '0'));
    return parts.join(':');
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        sender: user?.fullName || user?.name || 'You',
        text: chatInput.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isOwn: true,
      },
    ]);
    setChatInput('');
  };

  if (loading) {
    return (
      <AuthGuard>
        <Head>
          <title>Meeting Room - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="min-h-screen bg-navy flex">
          <Sidebar user={user} subscription={subscription} />
          <main className="workspace-main flex-1 ml-64">
            <header className="workspace-header">
              <h1 className="text-xl font-bold">Meeting Room</h1>
            </header>
            <div className="p-6">
              <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">Loading meeting...</div>
              </div>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <Head>
        <title>{meeting?.title ? `${meeting.title} - BuildrsHQ` : 'Meeting Room - BuildrsHQ'}</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-navy flex">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main flex-1 ml-64">
          <header className="workspace-header">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold">{meeting?.title || 'Meeting Room'}</h1>
              {connected && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="status-indicator status-online" />
                  <span className="text-green-400">Connected</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {connected && (
                <div className="flex items-center gap-2 text-gray-300 text-sm font-mono">
                  <Clock className="w-4 h-4" />
                  <span>{formatTime(elapsedSeconds)}</span>
                </div>
              )}
              <button
                type="button"
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                onClick={leaveMeeting}
              >
                <PhoneOff className="w-4 h-4" />
                <span>Leave Meeting</span>
              </button>
            </div>
          </header>

          <div className="workspace-content">
            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            {!connected && !meeting && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="text-gray-400 mb-4">Meeting not found or unavailable.</div>
                <button
                  type="button"
                  className="cta-button"
                  onClick={() => router.push('/meetings')}
                >
                  Back to Meetings
                </button>
              </div>
            )}

            {!connected && meeting && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="workspace-card max-w-md w-full text-center">
                  <div className="workspace-card-header">
                    <h2 className="workspace-card-title">{meeting.title}</h2>
                  </div>
                  <div className="workspace-card-body flex flex-col items-center gap-4">
                    <div className="text-gray-400 text-sm">
                      Room ID: <span className="text-gray-200 font-mono">{meeting.roomId}</span>
                    </div>
                    {meeting.participants && (
                      <div className="text-gray-400 text-sm">
                        {meeting.participants.length} participant{meeting.participants.length !== 1 ? 's' : ''} in lobby
                      </div>
                    )}
                    <button
                      type="button"
                      className="cta-button mt-2"
                      onClick={joinMeeting}
                      disabled={joining}
                    >
                      {joining ? 'Joining...' : 'Join Meeting'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {connected && (
              <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
                <div className="flex-1 flex flex-col gap-4">
                  <div className="flex-1 bg-navy-light rounded-lg border border-gray-700 flex items-center justify-center relative min-h-[400px]">
                    <div className="text-gray-500 text-lg">Video feed</div>
                    <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-lg">
                      <div className="w-2 h-2 bg-green-400 rounded-full" />
                      <span className="text-xs text-gray-300">
                        {user?.fullName || user?.name || 'You'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-3 py-3">
                    <button
                      type="button"
                      className={`p-3 rounded-full transition-colors ${
                        isMuted
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                      }`}
                      onClick={() => setIsMuted(!isMuted)}
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>

                    <button
                      type="button"
                      className={`p-3 rounded-full transition-colors ${
                        !isCameraOn
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                      }`}
                      onClick={() => setIsCameraOn(!isCameraOn)}
                      title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
                    >
                      {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                    </button>

                    <button
                      type="button"
                      className={`p-3 rounded-full transition-colors ${
                        isScreenSharing
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                      }`}
                      onClick={() => setIsScreenSharing(!isScreenSharing)}
                      title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
                    >
                      <Monitor className="w-5 h-5" />
                    </button>

                    <button
                      type="button"
                      className="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors"
                      onClick={leaveMeeting}
                      title="Leave meeting"
                    >
                      <PhoneOff className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="w-80 flex flex-col gap-4">
                  <div className="flex bg-navy-light rounded-lg border border-gray-700 overflow-hidden">
                    <button
                      type="button"
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                        showParticipants
                          ? 'bg-gray-700 text-white'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                      onClick={() => { setShowParticipants(true); setShowChat(false); }}
                    >
                      <Users className="w-4 h-4" />
                      People
                    </button>
                    <button
                      type="button"
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                        showChat
                          ? 'bg-gray-700 text-white'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                      onClick={() => { setShowChat(true); setShowParticipants(false); }}
                    >
                      <MessageSquare className="w-4 h-4" />
                      Chat
                    </button>
                  </div>

                  {showParticipants && (
                    <div className="flex-1 bg-navy-light rounded-lg border border-gray-700 flex flex-col overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-200">
                          Participants ({meeting?.participants?.length || 0})
                        </h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2">
                        {meeting?.participants?.length > 0 ? (
                          meeting.participants.map((p, idx) => (
                            <div key={p._id || idx} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800/50">
                              <img
                                className="w-8 h-8 rounded-full"
                                src={getAvatarUrl(p, p?.fullName || p?.name || 'User')}
                                alt={p.fullName || p.name || 'User'}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-200 truncate">
                                  {p.fullName || p.name || 'User'}
                                </div>
                                {p._id === meeting?.host && (
                                  <div className="text-xs text-yellow-400">Host</div>
                                )}
                              </div>
                              <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0" />
                            </div>
                          ))
                        ) : (
                          <div className="text-center text-gray-500 text-sm py-4">No participants yet</div>
                        )}
                      </div>
                    </div>
                  )}

                  {showChat && (
                    <div className="flex-1 bg-navy-light rounded-lg border border-gray-700 flex flex-col overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-200">Meeting Chat</h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {chatMessages.length === 0 && (
                          <div className="text-center text-gray-500 text-sm py-4">
                            No messages yet. Start the conversation!
                          </div>
                        )}
                        {chatMessages.map((msg) => (
                          <div key={msg.id} className={`flex flex-col ${msg.isOwn ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-gray-400">{msg.sender}</span>
                              <span className="text-xs text-gray-600">{msg.time}</span>
                            </div>
                            <div
                              className={`px-3 py-2 rounded-lg text-sm max-w-[85%] ${
                                msg.isOwn
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700 text-gray-200'
                              }`}
                            >
                              {msg.text}
                            </div>
                          </div>
                        ))}
                        <div ref={chatEndRef} />
                      </div>
                      <form onSubmit={handleSendChat} className="p-3 border-t border-gray-700">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                            placeholder="Type a message..."
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                          />
                          <button
                            type="submit"
                            className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
                            disabled={!chatInput.trim()}
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
