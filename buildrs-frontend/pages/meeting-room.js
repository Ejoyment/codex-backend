import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { io } from 'socket.io-client';
import AuthGuard from '../components/AuthGuard';
import useAuthStore from '../store/authStore';
import { apiFetch } from '../lib/api';
import { getAvatarUrl } from '../lib/utils';
import {
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Send, Users, MessageSquare,
  Clock, Copy, Check, ShieldCheck, Minus, ArrowLeft, Loader2, MonitorDown,
} from 'lucide-react';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const getInitials = (name) =>
  String(name || 'U').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function Avatar({ user, name, size = 'md' }) {
  const pfp = user?.profilePicture || user?.avatar;
  const style = size === 'lg'
    ? { width: 72, height: 72, fontSize: '1.6rem' }
    : size === 'sm' ? { width: 34, height: 34, fontSize: '0.8rem' } : {};
  return (
    <div className="mrr-avatar" style={style}>
      {pfp ? <img src={getAvatarUrl(user, name)} alt={name} /> : getInitials(name)}
    </div>
  );
}

function RemoteVideo({ userId, stream, muted }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream, userId]);
  useEffect(() => () => { if (ref.current) ref.current.srcObject = null; }, [userId]);
  return <video ref={ref} autoPlay playsInline muted={muted} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />;
}

export default function MeetingRoom() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { roomId, meetingId, id } = router.query;

  const myId = String(user?._id || user?.id || user?.userId || '');
  const myName = user?.fullName || user?.name || 'You';

  const [meeting, setMeeting] = useState(null);
  const [meetingDocId, setMeetingDocId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [socketStatus, setSocketStatus] = useState('idle');

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({});

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [showParticipants, setShowParticipants] = useState(true);
  const [copied, setCopied] = useState(false);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);
  const chatEndRef = useRef(null);

  const socketRef = useRef(null);
  const socketRetryRef = useRef(0);
  const bufferedCandidatesRef = useRef({});
  const negotiateTimersRef = useRef({});
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const pcsRef = useRef({});
  const peersRef = useRef({});
  const joinedRef = useRef(false);
  const roomIdRef = useRef(null);

  const lookupKey = roomId || meetingId || id;

  const syncPeers = useCallback(() => {
    setPeers({ ...peersRef.current });
  }, []);

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
        roomIdRef.current = data.meeting.roomId;
      }
    } catch (err) {
      setError(err.message || 'Failed to load meeting');
    } finally {
      setLoading(false);
    }
  }, [lookupKey, roomId]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
  }, []);

  const ensurePeer = useCallback((peerId, userName, profilePicture) => {
    let peer = peersRef.current[peerId];
    const now = Date.now();
    if (!peer) {
      peer = {
        stream: null,
        joinedAt: now,
        connected: false,
        muted: false,
        cameraOn: true,
        sharing: false,
        userName: userName || 'User',
        profilePicture: profilePicture || null,
      };
      peersRef.current[peerId] = peer;
    }
    if (userName) peer.userName = userName;
    if (profilePicture) peer.profilePicture = profilePicture;
    syncPeers();
    return peer;
  }, [syncPeers]);

  const createPeerConnection = useCallback((peerId, userName, profilePicture) => {
    if (pcsRef.current[peerId] && pcsRef.current[peerId].signalingState !== 'closed') {
      return pcsRef.current[peerId];
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcsRef.current[peerId] = pc;
    const peer = ensurePeer(peerId, userName, profilePicture);

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current && roomIdRef.current) {
        socketRef.current.emit('ice-candidate', { candidate: e.candidate, to: peerId, roomId: roomIdRef.current });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        peer.stream = event.streams[0];
        peer.connected = true;
      } else if (event.track) {
        if (!peer.stream) {
          peer.stream = new MediaStream();
          peer.connected = true;
        }
        peer.stream.addTrack(event.track);
      }
      syncPeers();
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        peer.connected = true;
        syncPeers();
      } else if (state === 'disconnected' || state === 'failed') {
        peer.connected = false;
        syncPeers();
      } else if (state === 'closed') {
        delete peersRef.current[peerId];
        syncPeers();
      }
    };

    const local = localStreamRef.current;
    if (local) {
      local.getTracks().forEach((track) => {
        try { pc.addTrack(track, local); } catch { /* ignore */ }
      });
    }
    return pc;
  }, [ensurePeer, syncPeers]);

  const flushIce = useCallback((peerId, pc) => {
    const buf = bufferedCandidatesRef.current[peerId] || [];
    bufferedCandidatesRef.current[peerId] = [];
    buf.forEach((c) => {
      try { pc && pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}); } catch { /* ignore */ }
    });
  }, []);

  // Deterministic negotiation: the joiner who receives the roster offers immediately;
  // anyone who sees a peer join schedules a backup offer in case the first is lost.
  const negotiate = useCallback(async (peerId, userName, profilePicture) => {
    if (!localStreamRef.current) return;
    const pc = createPeerConnection(peerId, userName, profilePicture);
    if (pc.connectionState === 'connected' || pc.signalingState !== 'stable') return;
    try {
      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable') return;
      await pc.setLocalDescription(offer);
      if (socketRef.current && roomIdRef.current) {
        socketRef.current.emit('offer', { offer: pc.localDescription, to: peerId, roomId: roomIdRef.current, userName: myName });
      }
    } catch (err) {
      console.error('Offer error for', peerId, err);
    }
  }, [createPeerConnection, myName]);

  const scheduleNegotiate = useCallback((peerId, userName, profilePicture) => {
    if (negotiateTimersRef.current[peerId]) clearTimeout(negotiateTimersRef.current[peerId]);
    negotiateTimersRef.current[peerId] = setTimeout(() => {
      delete negotiateTimersRef.current[peerId];
      const pc = pcsRef.current[peerId];
      if (!pc || pc.connectionState !== 'connected') {
        negotiate(peerId, userName, profilePicture);
      }
    }, 3500);
  }, [negotiate]);

  const answerOffer = useCallback(async (peerId, offer, userName, profilePicture) => {
    let pc = pcsRef.current[peerId];
    if (pc && pc.signalingState !== 'stable') {
      try { pc.close(); } catch { /* ignore */ }
      delete pcsRef.current[peerId];
    }
    pc = createPeerConnection(peerId, userName, profilePicture);
    try {
      await pc.setRemoteDescription(offer);
      flushIce(peerId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (socketRef.current && roomIdRef.current) {
        socketRef.current.emit('answer', { answer: pc.localDescription, to: peerId, roomId: roomIdRef.current });
      }
    } catch (err) {
      console.error('Answer error for', peerId, err);
    }
  }, [createPeerConnection, flushIce]);

  const acceptAnswer = useCallback(async (peerId, answer) => {
    const pc = pcsRef.current[peerId];
    if (!pc || pc.signalingState !== 'have-local-offer') return;
    try {
      await pc.setRemoteDescription(answer);
      flushIce(peerId, pc);
    } catch (err) {
      console.error('Set remote answer failed for', peerId, err);
    }
  }, [flushIce]);

  const bufferIce = useCallback((peerId, candidate) => {
    const pc = pcsRef.current[peerId];
    if (pc && pc.remoteDescription) {
      try { pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {}); } catch { /* ignore */ }
    } else {
      bufferedCandidatesRef.current[peerId] = bufferedCandidatesRef.current[peerId] || [];
      bufferedCandidatesRef.current[peerId].push(candidate);
    }
  }, []);

  const disconnectPeer = useCallback((peerId) => {
    if (negotiateTimersRef.current[peerId]) {
      clearTimeout(negotiateTimersRef.current[peerId]);
      delete negotiateTimersRef.current[peerId];
    }
    delete bufferedCandidatesRef.current[peerId];
    if (pcsRef.current[peerId]) {
      try { pcsRef.current[peerId].close(); } catch { /* ignore */ }
      delete pcsRef.current[peerId];
    }
    delete peersRef.current[peerId];
    syncPeers();
  }, [syncPeers]);

  const attachSocket = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    if (!token) return;

    const socket = io(`${SOCKET_URL}/meeting`, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    setSocketStatus('connecting');

    socket.on('connect', () => {
      setSocketStatus('connected');
      if (roomIdRef.current) {
        socket.emit('join-room', { roomId: roomIdRef.current, userId: myId });
      }
    });

    socket.on('connect_error', (err) => {
      console.error('Meeting socket connect error:', err.message);
      const attempts = socketRetryRef.current + 1;
      socketRetryRef.current = attempts;
      setSocketStatus('error');
      if (attempts <= 5) {
        setError(`Realtime connection lost. Reconnecting... (attempt ${attempts}/5)`);
        setTimeout(() => {
          if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
          attachSocket();
        }, 2500 * attempts);
      } else {
        setError('Cannot reach the realtime server. Check your connection and rejoin the meeting.');
      }
    });

    socket.on('room-users', ({ users }) => {
      (users || []).forEach((u) => {
        if (String(u.userId) !== myId) {
          negotiate(u.userId, u.userName, u.profilePicture);
        }
      });
    });

    socket.on('user-connected', ({ userId, userName, profilePicture }) => {
      if (String(userId) === myId) return;
      const pc = pcsRef.current[userId];
      if (!pc || pc.connectionState !== 'connected') {
        scheduleNegotiate(userId, userName, profilePicture);
      }
    });

    socket.on('user-disconnected', ({ userId }) => {
      if (String(userId) !== myId) disconnectPeer(userId);
    });

    socket.on('offer', ({ offer, userId, userName }) => {
      if (String(userId) === myId) return;
      answerOffer(userId, offer, userName, null);
    });

    socket.on('answer', ({ answer, userId }) => {
      if (String(userId) === myId) return;
      acceptAnswer(userId, answer);
    });

    socket.on('ice-candidate', ({ candidate, userId }) => {
      if (!candidate || String(userId) === myId) return;
      bufferIce(userId, candidate);
    });

    socket.on('chat-message', ({ userId, userName, message, timestamp }) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === `${userId}-${timestamp}`)) return prev;
        return [
          ...prev,
          {
            id: `${userId}-${new Date(timestamp).getTime()}`,
            sender: String(userId) === myId ? myName : userName || 'User',
            text: message,
            time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isOwn: String(userId) === myId,
          },
        ];
      });
    });

    socket.on('mic-toggled', ({ userId, isMicOn }) => {
      const peer = peersRef.current[userId];
      if (peer) { peer.muted = !isMicOn; syncPeers(); }
    });

    socket.on('camera-toggled', ({ userId, isCameraOn }) => {
      const peer = peersRef.current[userId];
      if (peer) { peer.cameraOn = isCameraOn; syncPeers(); }
    });

    socket.on('screen-share-started', ({ userId }) => {
      const peer = peersRef.current[userId];
      if (peer) { peer.sharing = true; syncPeers(); }
    });

    socket.on('screen-share-stopped', ({ userId }) => {
      const peer = peersRef.current[userId];
      if (peer) { peer.sharing = false; syncPeers(); }
    });

    socket.on('meeting-ended', () => { router.push('/meetings'); });
  }, [myId, myName, negotiate, scheduleNegotiate, disconnectPeer, answerOffer, acceptAnswer, bufferIce, syncPeers, router]);

  const joinRoom = useCallback(async () => {
    if (!roomIdRef.current || joinedRef.current) return;
    joinedRef.current = true;

    setJoining(true);
    setError(null);
    try {
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        setLocalStream(stream);
      }
      setJoined(true);
      setElapsedSeconds(0);
      startTimer();
      attachSocket();
      setSocketStatus('connecting');
    } catch (err) {
      joinedRef.current = false;
      setJoining(false);
      setError('Unable to access camera/microphone. Check browser permissions.');
      return;
    }
    setJoining(false);
  }, [attachSocket, startTimer]);

  useEffect(() => {
    resolveMeeting();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resolveMeeting]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => () => {
    if (socketRef.current) {
      if (roomIdRef.current) socketRef.current.emit('leave-room', { roomId: roomIdRef.current });
      socketRef.current.disconnect();
    }
    Object.values(negotiateTimersRef.current).forEach((t) => clearTimeout(t));
    negotiateTimersRef.current = {};
    bufferedCandidatesRef.current = {};
    Object.values(pcsRef.current).forEach((pc) => { try { pc.close(); } catch { /* ignore */ } });
    pcsRef.current = {};
    peersRef.current = {};
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop());
  }, []);

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
    }
    if (socketRef.current && roomIdRef.current) {
      socketRef.current.emit('mic-toggle', { roomId: roomIdRef.current, isMicOn: !next });
    }
  };

  const handleToggleCamera = () => {
    const next = !isCameraOn;
    setIsCameraOn(next);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = next; });
    }
    if (socketRef.current && roomIdRef.current) {
      socketRef.current.emit('camera-toggle', { roomId: roomIdRef.current, isCameraOn: next });
    }
  };

  const handleToggleShare = async () => {
    if (isSharing) {
      const screenStream = screenStreamRef.current;
      if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsSharing(false);
      const videoTrack = localStreamRef.current?.getVideoTracks()[0] || null;
      Object.values(pcsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender && videoTrack) sender.replaceTrack(videoTrack).catch(() => {});
      });
      if (socketRef.current && roomIdRef.current) {
        socketRef.current.emit('screen-share-stopped', { roomId: roomIdRef.current });
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      const screenTrack = stream.getVideoTracks()[0];
      setIsSharing(true);
      Object.values(pcsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender && screenTrack) sender.replaceTrack(screenTrack).catch(() => {});
      });
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        setIsSharing(false);
        const videoTrack = localStreamRef.current?.getVideoTracks()[0] || null;
        Object.values(pcsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender && videoTrack) sender.replaceTrack(videoTrack).catch(() => {});
        });
        if (socketRef.current && roomIdRef.current) {
          socketRef.current.emit('screen-share-stopped', { roomId: roomIdRef.current });
        }
      });
      if (socketRef.current && roomIdRef.current) {
        socketRef.current.emit('screen-share-started', { roomId: roomIdRef.current });
      }
    } catch {
      // user cancelled screen share prompt
    }
  };

  const leaveMeeting = useCallback(() => {
    if (socketRef.current && roomIdRef.current) {
      socketRef.current.emit('leave-room', { roomId: roomIdRef.current });
    }
    if (meetingDocId) {
      apiFetch(`/api/meetings/${meetingDocId}/leave`, { method: 'POST' }).catch(() => {});
    }
    Object.values(negotiateTimersRef.current).forEach((t) => clearTimeout(t));
    negotiateTimersRef.current = {};
    bufferedCandidatesRef.current = {};
    Object.values(pcsRef.current).forEach((pc) => { try { pc.close(); } catch { /* ignore */ } });
    pcsRef.current = {};
    peersRef.current = {};
    setPeers({});
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setJoined(false);
    router.push('/meetings');
  }, [meetingDocId, router]);

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    if (socketRef.current && roomIdRef.current) {
      socketRef.current.emit('chat-message', { roomId: roomIdRef.current, message: text, userName: myName });
    }
    setChatMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, sender: myName, text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isOwn: true },
    ]);
    setChatInput('');
  };

  const handleCopyRoom = async () => {
    try {
      await navigator.clipboard.writeText(meeting?.roomId || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
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

  const remotePeers = Object.entries(peers).filter(([pid]) => pid !== myId);
  const isHost = String(meeting?.host?._id || meeting?.host || '') === myId;

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
            <span className={`mrr-live ${joined ? '' : 'is-idle'}`}>
              <span className="mrr-pulse" />
              {joined ? 'Live' : 'Idle'}
            </span>
            {socketStatus === 'error' && (<span className="mrr-live is-idle" style={{ background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.35)', color: '#f87171' }}>Reconnecting</span>)}
          </div>

          <div className="mrr-top-right">
            <span className="mrr-enc"><ShieldCheck className="w-3.5 h-3.5" /> Encrypted</span>
            {joined && (
              <span className="mrr-timer"><Clock className="w-3.5 h-3.5" /><b>{formatTime(elapsedSeconds)}</b></span>
            )}
            {joined && (
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

          {!joined && meeting && (
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
                <button type="button" className="mrr-join" onClick={joinRoom} disabled={joining}>
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

          {!joined && !meeting && (
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

          {joined && (
            <>
              <div className="mrr-stage">
                <div className="mrr-grid">
                  <div className="mrr-tile is-self">
                    {localStream && isCameraOn && (
                      <video autoPlay playsInline muted ref={(el) => { if (el && el.srcObject !== localStream) el.srcObject = localStream; }} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                    )}
                    {(!localStream || !isCameraOn) && (
                      <Avatar user={user} name={myName} size="lg" />
                    )}
                    <span className="mrr-tile-label">
                      <span className="mrr-status-dot" />
                      {myName} <span className="mrr-role">· You</span>
                    </span>
                    <span className="mrr-mute-chip" title={isMuted ? 'Muted' : 'Mic on'}>
                      {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    </span>
                  </div>

                  {remotePeers.map(([pid, peer]) => (
                    <div key={pid} className="mrr-tile">
                      {peer.stream ? (
                        <RemoteVideo userId={pid} stream={peer.stream} muted={peer.muted} />
                      ) : (
                        <Avatar user={{ profilePicture: peer.profilePicture }} name={peer.userName} size="lg" />
                      )}
                      <span className="mrr-tile-label">
                        <span className="mrr-status-dot" />
                        {peer.userName} {peer.connected === false && <span className="mrr-role">· connecting</span>}
                        {peer.sharing && <span className="mrr-role" style={{ color: '#2fd6e6' }}> · sharing</span>}
                      </span>
                      <span className="mrr-mute-chip" title={peer.muted ? 'Muted' : 'Mic on'}>
                        {peer.muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </span>
                    </div>
                  ))}

                  {remotePeers.length === 0 && (
                    <div className="mrr-tile is-empty" style={{ alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                      <span className="mrr-live is-idle"><span className="mrr-pulse" /> Waiting for others to join</span>
                    </div>
                  )}
                </div>

                <div className="mrr-controls">
                  <button
                    type="button"
                    className={`mrr-ctrl ${isMuted ? 'is-muted' : ''}`}
                    onClick={handleToggleMute}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    className={`mrr-ctrl ${!isCameraOn ? 'is-muted' : ''}`}
                    onClick={handleToggleCamera}
                    title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
                  >
                    {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    className={`mrr-ctrl ${isSharing ? 'is-brand' : ''}`}
                    onClick={handleToggleShare}
                    title={isSharing ? 'Stop sharing' : 'Share screen'}
                  >
                    {isSharing ? <MonitorDown className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
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
                      <span className="mrr-tab-count">{remotePeers.length + 1}</span>
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
                        <Avatar user={user} name={myName} size="sm" />
                        <div className="min-w-0">
                          <div className="mrr-person-name">{myName} (You)</div>
                          {isHost && <div className="mrr-person-role">Host</div>}
                        </div>
                        <span className="mrr-person-status" />
                      </div>

                      {remotePeers.map(([pid, peer]) => (
                        <div key={pid} className="mrr-person">
                          <Avatar user={{ profilePicture: peer.profilePicture }} name={peer.userName} size="sm" />
                          <div className="min-w-0">
                            <div className="mrr-person-name">{peer.userName}</div>
                            <div className="mrr-person-role">
                              {peer.connected === false ? 'connecting' : peer.sharing ? 'sharing screen' : 'joined'}
                            </div>
                          </div>
                          {peer.connected === false ? (
                            <span style={{ marginLeft: 'auto', width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)' }} />
                          ) : (
                            <span className="mrr-person-status" />
                          )}
                        </div>
                      ))}

                      {remotePeers.length === 0 && (
                        <div className="mrr-chat-empty">No one else is in the room yet.</div>
                      )}
                    </div>
                  </div>
                )}

                {showChat && (
                  <div className="mrr-chat">
                    <div className="mrr-chat-list">
                      {chatMessages.length === 0 && (
                        <div className="mrr-chat-empty">No messages yet. Everyone in the room sees this chat in real time.</div>
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