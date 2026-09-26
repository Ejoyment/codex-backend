import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useXterm } from './useXterm';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

export function useAgentSocket(executionId, taskId, isActive = false) {
  const [socket, setSocket] = useState(null);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const terminalRef = useRef(null);

  useEffect(() => {
    if (!isActive || !executionId) return;

    const socket = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('authToken') },
      path: '/socket.io',
    });

    socket.on('connect', () => {
      socket.emit('agent:delegate', { executionId, taskId });
      socket.join(`task:${taskId}`);
      socket.join(`task:${taskId}:logs`);
    });

    socket.on('agent:progress', (data) => {
      setStatus(data.payload?.status || 'running');
      if (data.payload?.message) {
        setLogs(prev => [...prev, { timestamp: new Date(), message: data.payload.message }]);
      }
    });

    socket.on('agent:execution-complete', (data) => {
      setStatus('awaiting_approval');
      setResult(data.result);
    });

    socket.on('agent:execution-error', (data) => {
      setStatus('failed');
      setError(data.error);
    });

    socket.on('agent:approved', (data) => {
      setStatus('completed');
      setResult(data);
    });

    socket.on('agent:rejected', (data) => {
      setStatus('rejected');
      setResult(data);
    });

    socket.on('agent:cancelled', (data) => {
      setStatus('failed');
      setResult(data);
    });

    socket.on('agent:spec-verification', (data) => {
      setResult(prev => ({ ...prev, sddVerification: data }));
    });

    setSocket(socket);

    return () => {
      socket.disconnect();
    };
  }, [isActive, executionId, taskId]);

  const sendAction = useCallback((action) => {
    if (!socket || !executionId) return;
    socket.emit(`agent:${action}`, { executionId, taskId });
  }, [socket, executionId, taskId]);

  const approve = useCallback(() => sendAction('approve'), [sendAction]);
  const reject = useCallback(() => sendAction('reject'), [sendAction]);
  const tweak = useCallback((feedback) => {
    if (!socket || !executionId) return;
    socket.emit('agent:tweak', { executionId, taskId, feedback });
  }, [socket, executionId, taskId]);
  const cancel = useCallback(() => sendAction('cancel'), [sendAction]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    socket,
    logs,
    status,
    result,
    error,
    approve,
    reject,
    tweak,
    cancel,
    clearLogs,
  };
}

export function useAgentSocketNamespace(roomId) {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!roomId) return;

    const socket = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('authToken') },
      path: '/socket.io',
    });

    socket.on('connect', () => {
      socket.join(`agent:${roomId}`);
    });

    socket.on('agent:progress', (data) => {
      setMessages(prev => [...prev, data]);
    });

    setSocket(socket);

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  const emit = useCallback((event, data) => {
    socket?.emit(event, data);
  }, [socket]);

  return { socket, messages, emit };
}
