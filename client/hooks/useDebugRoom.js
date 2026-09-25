/**
 * Phase 3 — useDebugRoom hook.
 * Flow: avatar tap → consent (JoinPrompt shows exactly what is shared) → room
 * opens showing host's terminal, stack trace, files. Non-blocking: local
 * editing state is untouched.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TerminalMirror } from '../lib/terminalStream';

const API = process.env.NEXT_PUBLIC_API_URL || '';

async function api(path, { token, ...opts } = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
  return body.data;
}

export function useDebugRoom({ token, socket } = {}) {
  const [room, setRoom] = useState(null);
  const [role, setRole] = useState(null);
  const [terminalChunks, setTerminalChunks] = useState([]);
  const [joinRequest, setJoinRequest] = useState(null); // host-side consent prompt
  const [controlRequest, setControlRequest] = useState(null); // host-side control toast
  const mirrorRef = useRef(null);

  const openRoom = useCallback(async ({ workspaceId, taskRef } = {}) => {
    const data = await api('/api/v1/rooms', { token, method: 'POST', body: JSON.stringify({ workspaceId, taskRef }) });
    setRoom(data);
    setRole('host');
    socket?.emit?.('room:join', { roomId: data.id });
    return data;
  }, [token, socket]);

  // Avatar tap → request join (guest). Host sees JoinPrompt with share manifest.
  const requestJoin = useCallback(async (roomId) => {
    const data = await api('/api/v1/rooms', { token, method: 'POST', body: JSON.stringify({ joinRoomId: roomId }) });
    if (!data.pending) {
      setRoom(data);
      socket?.emit?.('room:join', { roomId: data.id });
    }
    return data;
  }, [token, socket]);

  const respond = useCallback(async (roomId, userId, approve) => {
    const data = await api(`/api/v1/rooms/${roomId}/respond`, { token, method: 'POST', body: JSON.stringify({ userId, approve }) });
    setRoom(data);
    setJoinRequest(null);
    return data;
  }, [token]);

  const setControl = useCallback(async (roomId, userId, grant) => {
    const data = await api(`/api/v1/rooms/${roomId}/control`, { token, method: 'POST', body: JSON.stringify({ userId, grant }) });
    setRoom(data);
    setControlRequest(null);
    return data;
  }, [token]);

  const requestControl = useCallback((roomId) => {
    socket?.emit?.('room:control-request', { roomId });
  }, [socket]);

  const closeRoom = useCallback(async (roomId) => {
    if (!roomId) return;
    await api(`/api/v1/rooms/${roomId}`, { token, method: 'DELETE' }).catch(() => {});
    mirrorRef.current?.destroy();
    mirrorRef.current = null;
    setRoom(null);
    setRole(null);
    setTerminalChunks([]);
  }, [token]);

  useEffect(() => {
    if (!socket || !room) return;
    mirrorRef.current = new TerminalMirror({
      socket,
      roomId: room.id,
      onUpdate: (chunks) => setTerminalChunks([...chunks]),
    });
    mirrorRef.current.requestResync();
    const onClosed = ({ roomId }) => {
      if (roomId === room.id) {
        mirrorRef.current?.destroy();
        mirrorRef.current = null;
        setRoom(null);
        setTerminalChunks([]);
      }
    };
    const onControlRequest = (req) => setControlRequest(req);
    socket.on?.('room:closed', onClosed);
    socket.on?.('room:control-request', onControlRequest);
    return () => {
      socket.off?.('room:closed', onClosed);
      socket.off?.('room:control-request', onControlRequest);
      mirrorRef.current?.destroy();
      mirrorRef.current = null;
    };
  }, [socket, room?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    room, role, terminalChunks, joinRequest, controlRequest,
    setJoinRequest, openRoom, requestJoin, respond, setControl, requestControl, closeRoom,
  };
}
