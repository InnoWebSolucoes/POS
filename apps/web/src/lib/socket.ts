import { io, type Socket } from 'socket.io-client';
import { getEntityId, getToken } from './api';

/**
 * One socket per browser tab, shared by every screen.
 *
 * This connection is what keeps the register, the kitchen display and the
 * online shop describing the same reality: a sale at the till pushes an
 * inventory:updated to everyone, including the storefront, within milliseconds.
 */

const URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || '';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  const token = getToken();
  const entityId = getEntityId();

  if (socket) {
    // Re-authenticate in place when the entity or token changed.
    const auth = socket.auth as Record<string, unknown> | undefined;
    if (auth?.token === token && auth?.entityId === entityId) return socket;
    socket.disconnect();
    socket = null;
  }

  socket = io(URL || undefined, {
    path: '/socket.io',
    auth: { token, entityId },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
    reconnectionAttempts: Number.POSITIVE_INFINITY,
  });

  return socket;
}

/** The storefront connects anonymously, for live stock availability only. */
export function connectPublicSocket(entityId: string): Socket {
  if (socket) return socket;
  socket = io(URL || undefined, {
    path: '/socket.io',
    auth: { publicEntityId: entityId },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
