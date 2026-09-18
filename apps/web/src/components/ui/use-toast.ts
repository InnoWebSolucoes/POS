import { create } from 'zustand';

/**
 * Minimal toast store. Kept outside React so any module - including the offline
 * sync loop and the socket listeners - can raise a message without a hook.
 */
export type ToastVariant = 'default' | 'success' | 'destructive' | 'warning';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id' | 'variant' | 'durationMs'> & Partial<Pick<ToastItem, 'variant' | 'durationMs'>>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push(input) {
    const id = `t_${Math.random().toString(36).slice(2, 9)}`;
    const item: ToastItem = {
      id,
      variant: 'default',
      durationMs: 4500,
      ...input,
    };
    set((state) => ({ toasts: [...state.toasts, item].slice(-4) }));

    if (item.durationMs > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, item.durationMs);
    }
    return id;
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  clear() {
    set({ toasts: [] });
  },
}));

/** Imperative API: toast.success('Venda concluida') */
export const toast = {
  show: (title: string, description?: string) => useToastStore.getState().push({ title, description }),
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, variant: 'success' }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, variant: 'destructive', durationMs: 7000 }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, variant: 'warning' }),
  action: (title: string, label: string, onClick: () => void, description?: string) =>
    useToastStore.getState().push({ title, description, action: { label, onClick }, durationMs: 9000 }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
};

export function useToast() {
  return { toast, toasts: useToastStore((s) => s.toasts), dismiss: useToastStore((s) => s.dismiss) };
}
