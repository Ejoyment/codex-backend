import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, isDemoTourActive } from './api';

/**
 * Live deployment events.
 *
 * The backend emits `deployment:update` on the /collab namespace to a room
 * every signed-in socket already joins (`agent:<userId>`). Events carry either
 * a partial deployment document (status, steps, URLs, errors) or a raw
 * `logChunk` straight from the build stream, so the UI can update before the
 * next poll.
 *
 * Polling remains as a fallback (missed events, reconnects, older backends).
 */
export default function useDeploymentRealtime(onUpdate) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    if (!token || isDemoTourActive()) return undefined;

    const socket = io(`${SOCKET_URL}/collab`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    const handle = (payload) => {
      if (payload && payload.deploymentId) callbackRef.current?.(payload);
    };

    // Server-side room membership is not restored across transport reconnects.
    socket.on('connect', () => socket.emit('agent:join'));
    socket.on('deployment:update', handle);

    return () => {
      socket.off('deployment:update', handle);
      socket.disconnect();
    };
  }, []);
}

/**
 * Merge a realtime patch into a deployment-shaped object. Keeps list items
 * small (logs are only applied when `buildLogs` is explicitly supplied or a
 * chunk arrives) and appends streamed log chunks in order.
 */
export function applyDeploymentPatch(current, update) {
  if (!current) return current;
  const patch = update?.deployment || {};
  const next = { ...current, ...patch };
  if (typeof update?.buildLogs === 'string') {
    next.buildLogs = update.buildLogs;
  } else if (typeof update?.logChunk === 'string') {
    next.buildLogs = `${next.buildLogs || ''}${update.logChunk}`;
  }
  if (typeof update?.runtimeLogs === 'string') {
    next.runtimeLogs = update.runtimeLogs;
  }
  return next;
}
