import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { SOCKET_EVENTS, type Role } from '@pos/shared';
import { env } from './env.js';
import { verifyToken } from './auth.js';

let io: SocketServer | null = null;

/**
 * Rooms are the whole access-control story for realtime:
 *   entity:<id>          every authenticated member of a tenant
 *   entity:<id>:kds      kitchen screens only
 *   entity:<id>:role:<r> role-targeted notifications
 *   public:<entityId>    storefront visitors (stock availability only)
 */
export function entityRoom(entityId: string): string {
  return `entity:${entityId}`;
}
export function kdsRoom(entityId: string, station?: string | null): string {
  return station ? `entity:${entityId}:kds:${station}` : `entity:${entityId}:kds`;
}
export function roleRoom(entityId: string, role: Role): string {
  return `entity:${entityId}:role:${role}`;
}
export function publicRoom(entityId: string): string {
  return `public:${entityId}`;
}

export function initRealtime(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: { origin: env.corsOrigin, credentials: true },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket: Socket) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const publicEntityId = socket.handshake.auth?.publicEntityId as string | undefined;

    if (token) {
      try {
        const payload = verifyToken(token, 'access');
        const entityId = (socket.handshake.auth?.entityId as string) || payload.entityId;

        if (entityId) {
          socket.join(entityRoom(entityId));
          socket.join(roleRoom(entityId, payload.role));
          socket.data.entityId = entityId;
          socket.data.role = payload.role;

          if (payload.role === 'kitchen') socket.join(kdsRoom(entityId));
        }
      } catch {
        socket.emit('auth_error', { message: 'Sessao invalida.' });
        socket.disconnect(true);
        return;
      }
    } else if (publicEntityId) {
      // Storefront visitors get stock availability and nothing else.
      socket.join(publicRoom(publicEntityId));
    }

    socket.on('kds:subscribe', (station: string | null) => {
      const entityId = socket.data.entityId as string | undefined;
      if (!entityId) return;
      socket.join(kdsRoom(entityId, station));
    });

    socket.on('kds:unsubscribe', (station: string | null) => {
      const entityId = socket.data.entityId as string | undefined;
      if (!entityId) return;
      socket.leave(kdsRoom(entityId, station));
    });
  });

  return io;
}

export function getIo(): SocketServer | null {
  return io;
}

/** Broadcast to everyone signed into a tenant. */
export function emitToEntity(entityId: string, event: string, payload: unknown): void {
  io?.to(entityRoom(entityId)).emit(event, payload);
}

export function emitToRole(entityId: string, role: Role, event: string, payload: unknown): void {
  io?.to(roleRoom(entityId, role)).emit(event, payload);
}

export function emitToKds(
  entityId: string,
  station: string | null | undefined,
  event: string,
  payload: unknown,
): void {
  if (!io) return;
  io.to(kdsRoom(entityId)).emit(event, payload);
  if (station) io.to(kdsRoom(entityId, station)).emit(event, payload);
}

/**
 * Stock changes go to staff AND to the storefront, which is what keeps the
 * physical register and the online shop in sync in both directions.
 */
export function emitInventoryUpdate(
  entityId: string,
  payload: { productId: string; variantId?: string | null; stockQuantity: number; available: boolean },
): void {
  const body = { entityId, ...payload };
  emitToEntity(entityId, SOCKET_EVENTS.INVENTORY_UPDATED, body);
  io?.to(publicRoom(entityId)).emit(SOCKET_EVENTS.INVENTORY_UPDATED, body);
}
