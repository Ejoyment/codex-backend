import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { getAvatarUrl } from '../lib/utils';
import {
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Send, Users, MessageSquare,
  Clock, Copy, Check, ShieldCheck, Minus, ArrowLeft, Loader2,
} from 'lucide-react';

const getInitials = (name) =>
  String(name || 'U').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function MeetingRoom() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { roomId, meetingId, id } = router.query;

  const [meeting, setMeeting] = useState(null);
  const [meetingDocId, setMeetingDocId] = useState(null);
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
  const [copied, setCopied] = useState(false);
  const autoJoinedRef = useRef(false);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);
  const chatEndRef = useRef(null);

  const lookupKey = roomId || meetingId || id;

  const resolveMeeting = useCallback(async () => {
    if (!lookupKey) return;
    try {
      setLoading(true);
      setError(null);
      const path = roomId ? `/api/meetings/room/${encodeURIComponent(roomId)}` : `/api/meetings/${encodeURIComponent(lookupKey)}`;
      const data = await apiFetch(path);
      if (data.success && data.meeting) {
        setMeeting(data.meeting);
        setMeetingDocId(data.meeting._id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load meeting');
    } finally {
      setLoading(false);
    }
  }, [lookupKey, roomId]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
  }, []);

  const joinMeeting = useCallback(async () => {
    if (!meetingDocId || joining) return;
    try {
      setJoining(true);
      setError(null);
      const data = await apiFetch(`/api/meetings/${meetingDocId}/join`, { method: 'POST' });
      if (data.success) {
        setMeeting(data.meeting || meeting);
        setConnected(true);
        setElapsedSeconds(0);
        startTimer();
      }
    } catch (err) {
      setError(err.message || 'Failed to join meeting');
    } finally {
      setJoining(false);
    }
  }, [meetingDocId, joining, meeting, startTimer]);

  useEffect(() => {
    if (meeting && meetingDocId && !connected && !autoJoinedRef.current) {
      autoJoinedRef.current = true;
      joinMeeting();
    }
  }, [meeting, meetingDocId, connected, joinMeeting]);

  useEffect(() => {
    resolveMeeting();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resolveMeeting]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const leaveMeeting = useCallback(async () => {
    try {
      if (meetingDocId) await apiFetch(`/api/meetings/${meetingDocId}/leave`, { method: 'POST' });
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
  }, [meetingDocId, router]);

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

  const handleCopyRoom = async () => {
    try {
      await navigator.clipboard.writeText(meeting?.roomId || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

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

  const remainParticipants = (meeting?.participants || []).filter((p) => {
    const uid = p?.user?._id || p?._id;
    return uid !== user?._id;
  });

  if (loading) {
    return (
      <AuthGuard>
        <Head>
          <title>Meeting Room - BuildrsHQ</title>
          <link rel="icon" href="/buildrs.png" />
        </Head>
        <div className="mrr-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div className="flex items-center gap-3 text-[#8b93a1]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Entering meeting room...</span>
          </div>
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

      <div className="mrr-page">
        <div className="mrr-topbar">
          <button type="button" className="mrr-brand" onClick={() => router.push('/dashboard')} title="Back to Dashboard">
            <span className="mrr-dot" />
            <span>Buildrs <em>HQ</em></span>
          </button>

          <div className="mrr-title-wrap">
            <h1 className="mrr-title">{meeting?.title || 'Meeting Room'}</h1>
            <span className={`mrr-live ${connected ? '' : 'is-idle'}`}>
              <span className="mrr-pulse" />
              {connected ? 'Live' : 'Idle'}
            </span>
          </div>

          <div className="mrr-top-right">
            <span className="mrr-enc"><ShieldCheck className="w-3.5 h-3.5" /> Encrypted</span>
            {connected && (
              <span className="mrr-timer">
                <Clock className="w-3.5 h-3.5" />
                <b>{formatTime(elapsedSeconds)}</b>
              </span>
            )}
            {connected && (
              <button type="button" className="mrr-leave" onClick={leaveMeeting}>
                <PhoneOff className="w-3.5 h-3.5" />
                Leave
              </button>
            )}
          </div>
        </div>

        <div className="mrr-body">
          {error && (
            <div style={{ position: 'absolute', top: '4.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 20, width: 'min(520px, 90vw)' }}>
              <div className="mrr-error">
                <Minus className="w-4 h-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            </div>
          )}

          {!connected && meeting && (
            <div className="mrr-lobby">
              <div className="mrr-lobby-card">
                <h2 className="mrr-lobby-title">{meeting.title || 'Meeting Room'}</h2>
                <p className="mrr-lobby-sub">
                  by {meeting.host?.fullName || meeting.host?.name || 'Host'}
                  {meeting.scheduledAt ? ` · ${new Date(meeting.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
                <div className="mrr-lobby-row">
                  {meeting.roomId}
                  <button type="button" className="mrr-lobby-copy" onClick={handleCopyRoom} title="Copy room code">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="mrr-lobby-count">
                  {(meeting.participants || []).length || 1} participant{(meeting.participants || []).length !== 1 ? 's' : ''} · join to enter the room
                </div>
                <button type="button" className="mrr-join" onClick={joinMeeting} disabled={joining}>
                  {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                  {joining ? 'Joining...' : 'Join Meeting'}
                </button>
                <button type="button" className="mrr-back" onClick={() => router.push('/meetings')}>
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Meetings
                </button>
              </div>
            </div>
          )}

          {!connected && !meeting && (
            <div className="mrr-lobby">
              <div className="mrr-lobby-card">
                <h2 className="mrr-lobby-title">Meeting unavailable</h2>
                <p className="mrr-lobby-sub">The meeting could not be loaded or has already ended.</p>
                <button type="button" className="mrr-back" onClick={() => router.push('/meetings')}>
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Meetings
                </button>
              </div>
            </div>
          )}

          {connected && (
            <>
              <div className="mrr-stage">
                <div className="mrr-grid">
                  <div className="mrr-tile is-self">
                    <div className="mrr-avatar" style={{ position: 'relative', zIndex: 1 }}>
                      {user?.profilePicture ? (
                        <img src={getAvatarUrl(user, user?.fullName || user?.name)} alt={user?.fullName || 'You'} />
                      ) : (
                        getInitials(user?.fullName || user?.name)
                      )}
                    </div>
                    <span className="mrr-tile-label">
                      <span className="mrr-status-dot" />
                      {user?.fullName || user?.name || 'You'} <span className="mrr-role">· You</span>
                    </span>
                    <span className="mrr-mute-chip" title={isMuted ? 'Muted' : 'Mic on'}>
                      {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    </span>
                  </div>

                  {remainParticipants.map((p) => {
                    const pUser = p?.user || p;
                    const name = pUser?.fullName || pUser?.name || 'Participant';
                    const isHost = String(pUser?._id || pUser?.id || '') === String(meeting?.host?._id || meeting?.host || '');
                    const pfp = pUser?.profilePicture || pUser?.avatar || p?.profilePicture;
                    return (
                      <div key={pUser?._id || p?._id || name} className="mrr-tile">
                        <div className="mrr-avatar" style={{ position: 'relative', zIndex: 1 }}>
                          {pfp ? (
                            <img src={getAvatarUrl(pUser, name)} alt={name} />
                          ) : (
                            getInitials(name)
                          )}
                        </div>
                        <span className="mrr-tile-label">
                          <span className="mrr-status-dot" />
                          {name} {isHost && <span className="mrr-role">· Host</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mrr-controls">
                  <button
                    type="button"
                    className={`mrr-ctrl ${isMuted ? 'is-muted' : ''}`}
                    onClick={() => setIsMuted((v) => !v)}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    className={`mrr-ctrl ${!isCameraOn ? 'is-muted' : ''}`}
                    onClick={() => setIsCameraOn((v) => !v)}
                    title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
                  >
                    {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    className={`mrr-ctrl ${isScreenSharing ? 'is-brand' : ''}`}
                    onClick={() => setIsScreenSharing((v) => !v)}
                    title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
                  >
                    <Monitor className="w-4 h-4" />
                  </button>
                  <button type="button" className="mrr-ctrl is-danger" onClick={leaveMeeting} title="Leave meeting">
                    <PhoneOff className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mrr-panel">
                <div className="mrr-panel-head">
                  <div className="mrr-tabs">
                    <button
                      type="button"
                      className={`mrr-tab ${showParticipants && !showChat ? 'is-on' : ''}`}
                      onClick={() => { setShowParticipants(true); setShowChat(false); }}
                    >
                      <Users className="w-3.5 h-3.5" />
                      People
                      <span className="mrr-tab-count">{(meeting?.participants?.length || 0) + 1}</span>
                    </button>
                    <button
                      type="button"
                      className={`mrr-tab ${showChat ? 'is-on' : ''}`}
                      onClick={() => { setShowChat(true); setShowParticipants(false); }}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Chat
                      <span className="mrr-tab-count">{chatMessages.length}</span>
                    </button>
                  </div>
                </div>

                {showParticipants && !showChat && (
                  <div className="mrr-panel-body">
                    <div className="mrr-panel-list">
                      <div className="mrr-person">
                        <div className="mrr-avatar" style={{ width: 34, height: 34, fontSize: '0.8rem' }}>
                          {user?.profilePicture ? (
                            <img src={getAvatarUrl(user, user?.fullName || user?.name)} alt={user?.fullName || 'You'} />
                          ) : (
                            getInitials(user?.fullName || user?.name)
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="mrr-person-name">{user?.fullName || user?.name || 'You'} (You)</div>
                          {String(meeting?.host?._id || meeting?.host || '') === String(user?._id || '') && (
                            <div className="mrr-person-role">Host</div>
                          )}
                        </div>
                        <span className="mrr-person-status" />
                      </div>

                      {(meeting?.participants || []).map((p) => {
                        const pUser = p?.user || p;
                        const name = pUser?.fullName || pUser?.name || 'Participant';
                        const isHost = String(pUser?._id || pUser?.id || '') === String(meeting?.host?._id || meeting?.host || '');
                        const pfp = pUser?.profilePicture || pUser?.avatar || p?.profilePicture;
                        return (
                          <div key={pUser?._id || p?._id || name} className="mrr-person">
                            <div className="mrr-avatar" style={{ width: 34, height: 34, fontSize: '0.8rem' }}>
                              {pfp ? (
                                <img src={getAvatarUrl(pUser, name)} alt={name} />
                              ) : (
                                getInitials(name)
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="mrr-person-name">{name}</div>
                              {isHost && <div className="mrr-person-role">Host</div>}
                            </div>
                            <span className="mrr-person-status" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showChat && (
                  <div className="mrr-chat">
                    <div className="mrr-chat-list">
                      {chatMessages.length === 0 && (
                        <div className="mrr-chat-empty">No messages yet. Start the conversation.</div>
                      )}
                      {chatMessages.map((msg) => (
                        <div key={msg.id} className={`mrr-msg ${msg.isOwn ? 'is-own' : ''}`}>
                          <div className="mrr-msg-meta">
                            <span>{msg.sender}</span>
                            <span>{msg.time}</span>
                          </div>
                          <div className="mrr-msg-bubble">{msg.text}</div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={handleSendChat} className="mrr-chat-form">
                      <input
                        type="text"
                        className="mrr-chat-input"
                        placeholder="Type a message..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                      />
                      <button type="submit" className="mrr-chat-send" disabled={!chatInput.trim()}>
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}