import { create } from 'zustand';
import { hexToHsl } from './utils';

/**
 * Three surfaces with different needs:
 *   back office - light, information dense
 *   pos         - follows the entity setting, dark by default on long shifts
 *   kds         - always near-black with oversized type
 *
 * `data-surface` on <html> selects the palette; `data-theme` selects light/dark.
 */
export type Theme = 'light' | 'dark' | 'system';
export type Surface = 'app' | 'pos' | 'kds';

const THEME_KEY = 'pos.theme';

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function resolve(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
}

interface ThemeState {
  theme: Theme;
  surface: Surface;
  resolved: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  setSurface: (surface: Surface) => void;
  applyBrand: (accentColor: string | null | undefined) => void;
}

function apply(theme: Theme, surface: Surface): 'light' | 'dark' {
  const resolved = surface === 'kds' ? 'dark' : resolve(theme);
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-surface', surface);
  root.classList.toggle('dark', resolved === 'dark');
  return resolved;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem(THEME_KEY) as Theme) || 'light',
  surface: 'app',
  resolved: 'light',

  setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    set({ theme, resolved: apply(theme, get().surface) });
  },

  setSurface(surface) {
    set({ surface, resolved: apply(get().theme, surface) });
  },

  /** Paints the entity's accent colour into the CSS custom properties. */
  applyBrand(accentColor) {
    if (!accentColor) return;
    try {
      const hsl = hexToHsl(accentColor);
      document.documentElement.style.setProperty('--brand', hsl);
      document.documentElement.style.setProperty('--primary', hsl);
      document.documentElement.style.setProperty('--ring', hsl);
    } catch {
      /* an invalid colour from settings should never break rendering */
    }
  },
}));

/** Call once at startup, before React paints, to avoid a flash of light. */
export function initTheme(): void {
  const state = useTheme.getState();
  const resolved = apply(state.theme, state.surface);
  useTheme.setState({ resolved });

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = useTheme.getState();
    if (current.theme === 'system') {
      useTheme.setState({ resolved: apply(current.theme, current.surface) });
    }
  });
}
