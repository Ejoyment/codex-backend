/**
 * Phase 3 — peerManager: mesh WebRTC topology (up to 4 peers), Opus audio with
 * echo cancellation / noise suppression, STUN + TURN (short-lived credentials
 * from /api/rtc/ice-servers, env fallback), automatic fallback to the
 * Socket.IO relay if the data channel fails.
 */
import { API_BASE_URL } from '../api';

export const MAX_MESH_PEERS = 4;

// Server-issued ICE config (short-lived TURN credentials, rec 9). Populated
// by fetchIceServers(); getIceServers() prefers it and falls back to the
// legacy env-based static config.
let cachedIceServers = null;

export async function fetchIceServers() {
  try {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('authToken') : null;
    const res = await fetch(`${API_BASE_URL}/api/rtc/ice-servers`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      cachedIceServers = data.iceServers;
      return cachedIceServers;
    }
  } catch {
    // fall through to static config
  }
  return getIceServers();
}

export function getIceServers() {
  if (cachedIceServers) return cachedIceServers;
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL || (typeof window !== 'undefined' && window.__TURN_URL__);
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: turnUser || undefined,
      credential: turnCred || undefined,
    });
  }
  return servers;
}

export class PeerManager {
  constructor({ socket, roomId, onAudioState, onFallback }) {
    this.socket = socket;
    this.roomId = roomId;
    this.onAudioState = onAudioState || (() => {});
    this.onFallback = onFallback || (() => {});
    this.peers = new Map(); // peerId -> { pc, dc, fallback }
    this.localStream = null;
    this.fallbackToRelay = false;
    this._onSignal = this._onSignal.bind(this);
    socket?.on?.('room:signal', this._onSignal);
  }

  async initLocalAudio({ echoCancellation = true, noiseSuppression = true } = {}) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation, noiseSuppression, autoGainControl: true },
      });
      return this.localStream;
    } catch (err) {
      // Degraded: audio-only failure must not break the room.
      this.onAudioState({ error: err.message, audioOnly: false, failed: true });
      return null;
    }
  }

  canAddMore() {
    return this.peers.size < MAX_MESH_PEERS;
  }

  async connectTo(peerId) {
    if (!this.canAddMore()) throw new Error('Mesh is full (max 4 peers)');
    if (this.peers.has(peerId)) return this.peers.get(peerId);
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    const entry = { pc, dc: null, fallback: false };
    this.peers.set(peerId, entry);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.socket?.emit?.('room:signal', {
          roomId: this.roomId,
          to: peerId,
          data: { type: 'ice', candidate: e.candidate },
        });
      }
    };

    pc.ontrack = (e) => {
      this.onAudioState({ peerId, streams: e.streams, event: 'track' });
    };

    // Data channel for low-latency terminal relay; fallback to Socket.IO on failure.
    const dc = pc.createDataChannel('room', { ordered: true });
    entry.dc = dc;
    dc.onopen = () => this.onAudioState({ peerId, dataChannel: 'open' });
    dc.onerror = () => this._enableFallback(peerId, 'datachannel-error');
    dc.onclose = () => this._enableFallback(peerId, 'datachannel-closed');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket?.emit?.('room:signal', {
      roomId: this.roomId,
      to: peerId,
      data: { type: 'offer', sdp: pc.localDescription },
    });
    return entry;
  }

  async _onSignal({ roomId, from, data }) {
    if (roomId !== this.roomId || !data) return;
    try {
      if (data.type === 'offer') {
        if (!this.canAddMore() && !this.peers.has(from)) {
          // Mesh full — stay on Socket.IO relay with this peer.
          return this._enableFallback(from, 'mesh-full');
        }
        let entry = this.peers.get(from);
        if (!entry) {
          const pc = new RTCPeerConnection({ iceServers: getIceServers() });
          entry = { pc, dc: null, fallback: false };
          this.peers.set(from, entry);
          if (this.localStream) {
            for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
          }
          pc.ondatachannel = (e) => {
            entry.dc = e.channel;
            e.channel.onopen = () => this.onAudioState({ peerId: from, dataChannel: 'open' });
            e.channel.onerror = () => this._enableFallback(from, 'datachannel-error');
            e.channel.onclose = () => this._enableFallback(from, 'datachannel-closed');
          };
          pc.onicecandidate = (e) => {
            if (e.candidate) {
              this.socket?.emit?.('room:signal', {
                roomId: this.roomId,
                to: from,
                data: { type: 'ice', candidate: e.candidate },
              });
            }
          };
          pc.ontrack = (e) => this.onAudioState({ peerId: from, streams: e.streams, event: 'track' });
        }
        await entry.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        this.socket?.emit?.('room:signal', {
          roomId: this.roomId,
          to: from,
          data: { type: 'answer', sdp: entry.pc.localDescription },
        });
      } else if (data.type === 'answer') {
        const entry = this.peers.get(from);
        if (entry) await entry.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } else if (data.type === 'ice' && data.candidate) {
        const entry = this.peers.get(from);
        if (entry) {
          try { await entry.pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
        }
      }
    } catch {
      this._enableFallback(from, 'signal-error');
    }
  }

  _enableFallback(peerId, reason) {
    const entry = this.peers.get(peerId);
    if (entry) entry.fallback = true;
    if (!this.fallbackToRelay) {
      this.fallbackToRelay = true;
      this.onFallback({ relay: 'socket.io', reason });
    } else {
      this.onFallback({ peerId, relay: 'socket.io', reason });
    }
  }

  sendViaDataChannel(peerId, message) {
    const entry = this.peers.get(peerId);
    if (entry?.dc?.readyState === 'open') {
      entry.dc.send(message);
      return 'p2p';
    }
    // Automatic fallback to Socket.IO relay.
    this.socket?.emit?.('room:terminal-chunk', { roomId: this.roomId, chunk: message });
    return 'relay';
  }

  setMuted(muted) {
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    this.onAudioState({ muted });
  }

  disconnect(peerId) {
    const entry = this.peers.get(peerId);
    if (entry) {
      try { entry.dc?.close(); } catch {}
      try { entry.pc.close(); } catch {}
      this.peers.delete(peerId);
    }
  }

  destroy() {
    this.socket?.off?.('room:signal', this._onSignal);
    for (const id of [...this.peers.keys()]) this.disconnect(id);
    this.localStream?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    this.localStream = null;
  }
}
