import { create } from 'zustand';
import {
  hasPermission as sharedHasPermission,
  type AuthResponse,
  type AuthUser,
  type EntityDto,
  type Permission,
} from '@pos/shared';
import { api, clearSession, getToken, onUnauthorized, setEntityId, setTokens } from './api';

interface AuthState {
  user: AuthUser | null;
  entity: EntityDto | null;
  status: 'loading' | 'authenticated' | 'anonymous';

  login: (email: string, password: string) => Promise<AuthUser>;
  pinLogin: (entityId: string, pin: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  switchEntity: (entityId: string) => Promise<void>;
  setUser: (user: AuthUser) => void;
  setEntity: (entity: EntityDto | null) => void;

  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
}

function applySession(response: AuthResponse): void {
  setTokens(response.token, response.refreshToken);
  setEntityId(response.entity?.id ?? response.user.entityId ?? null);
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  entity: null,
  status: 'loading',

  async login(email, password) {
    const response = await api.post<AuthResponse>('/api/auth/login', { email, password }, { anonymous: true });
    applySession(response);
    set({ user: response.user, entity: response.entity, status: 'authenticated' });
    return response.user;
  },

  async pinLogin(entityId, pin) {
    const response = await api.post<AuthResponse>('/api/auth/pin-login', { entityId, pin }, { anonymous: true });
    applySession(response);
    set({ user: response.user, entity: response.entity, status: 'authenticated' });
    return response.user;
  },

  async logout() {
    try {
      await api.post('/api/auth/logout', { refreshToken: localStorage.getItem('pos.refreshToken') });
    } catch {
      /* logging out locally matters more than telling the server */
    }
    clearSession();
    set({ user: null, entity: null, status: 'anonymous' });
  },

  /** Restores a session on page load before the first render decides anything. */
  async bootstrap() {
    if (!getToken()) {
      set({ status: 'anonymous', user: null, entity: null });
      return;
    }
    try {
      const response = await api.get<{ user: AuthUser; entity: EntityDto | null }>('/api/auth/me');
      if (response.entity?.id) setEntityId(response.entity.id);
      set({ user: response.user, entity: response.entity, status: 'authenticated' });
    } catch {
      clearSession();
      set({ status: 'anonymous', user: null, entity: null });
    }
  },

  /** Super-admin only: act inside another tenant. */
  async switchEntity(entityId) {
    setEntityId(entityId);
    const entity = await api.get<EntityDto>(`/api/entities/${entityId}`);
    set({ entity });
  },

  setUser: (user) => set({ user }),
  setEntity: (entity) => set({ entity }),

  can: (permission) => sharedHasPermission(get().user?.permissions, permission),
  canAny: (...permissions) => permissions.some((p) => sharedHasPermission(get().user?.permissions, p)),
}));

// A refresh failure anywhere in the app ends the session exactly once.
onUnauthorized(() => {
  useAuth.setState({ user: null, entity: null, status: 'anonymous' });
});

/** Convenience hooks so components do not re-render on unrelated state. */
export const useUser = () => useAuth((s) => s.user);
export const useEntity = () => useAuth((s) => s.entity);
export const useCan = () => useAuth((s) => s.can);
