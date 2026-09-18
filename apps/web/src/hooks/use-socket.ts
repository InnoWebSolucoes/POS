import { useEffect, useRef, useState } from 'react';
import { connectSocket, getSocket } from '@/lib/socket';

/**
 * Subscribes to a realtime event for the lifetime of a component.
 *
 * The handler is kept in a ref so passing an inline arrow function does not
 * tear down and rebuild the listener on every render - which, on the KDS,
 * would mean missing tickets.
 */
export function useSocketEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void,
  enabled = true,
): void {
  const ref = useRef(handler);

  useEffect(() => {
    ref.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket() ?? connectSocket();
    const listener = (payload: T) => ref.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [event, enabled]);
}

/** Live connection state, for the "offline" badge in the POS header. */
export function useSocketStatus(): { connected: boolean } {
  const [connected, setConnected] = useState(() => getSocket()?.connected ?? false);

  useEffect(() => {
    const socket = getSocket() ?? connectSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    setConnected(socket.connected);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return { connected };
}

/** Browser-level connectivity, which is what the offline sale queue watches. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
