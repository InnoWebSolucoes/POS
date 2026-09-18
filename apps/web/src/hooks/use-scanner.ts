import { useEffect, useRef } from 'react';
import { looksLikeScan, SCANNER_DEFAULTS } from '@pos/shared';

/**
 * Barcode scanner capture.
 *
 * A USB/Bluetooth scanner in HID mode is just a very fast keyboard: it types
 * the barcode and presses Enter. We listen globally rather than relying on an
 * input keeping focus, because in practice focus wanders the moment a cashier
 * touches anything. Human typing is filtered out by timing - nobody types a
 * dozen characters with under 35ms between every keystroke.
 */

export interface UseScannerOptions {
  onScan: (code: string) => void;
  enabled?: boolean;
  /** Max gap between keystrokes to still count as one burst. */
  maxKeyIntervalMs?: number;
  minLength?: number;
  /**
   * When true, a burst typed while a text field has focus is still captured.
   * Leave false so a manager typing into a search box is never hijacked.
   */
  captureInInputs?: boolean;
}

function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  if (tag !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(type);
}

export function useScanner({
  onScan,
  enabled = true,
  maxKeyIntervalMs = SCANNER_DEFAULTS.maxKeyIntervalMs,
  minLength = SCANNER_DEFAULTS.minLength,
  captureInInputs = false,
}: UseScannerOptions): void {
  const buffer = useRef('');
  const intervals = useRef<number[]>([]);
  const lastKeyAt = useRef(0);
  const handler = useRef(onScan);

  // Keep the callback fresh without re-binding the listener on every render.
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const reset = () => {
      buffer.current = '';
      intervals.current = [];
      lastKeyAt.current = 0;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const now = performance.now();
      const gap = lastKeyAt.current ? now - lastKeyAt.current : 0;

      // A long pause means the previous burst was abandoned mid-way.
      if (lastKeyAt.current && gap > 500) reset();

      if (event.key === 'Enter') {
        const code = buffer.current;
        const gaps = intervals.current;
        reset();

        if (!code) return;
        if (!captureInInputs && isTextEntry(event.target) && !looksLikeScan(code, gaps, { maxKeyIntervalMs, minLength })) {
          return;
        }
        if (looksLikeScan(code, gaps, { maxKeyIntervalMs, minLength })) {
          // Stop the Enter from also submitting whatever form has focus.
          event.preventDefault();
          event.stopPropagation();
          handler.current(code);
        }
        return;
      }

      // Only single printable characters belong in a barcode.
      if (event.key.length !== 1) return;

      if (lastKeyAt.current) intervals.current.push(gap);
      lastKeyAt.current = now;
      buffer.current += event.key;

      // Barcodes are short; anything longer is someone leaning on the keyboard.
      if (buffer.current.length > 64) reset();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, maxKeyIntervalMs, minLength, captureInInputs]);
}

/**
 * Keeps the hidden barcode field focused, which is what makes a scanner "just
 * work" on a tablet where there is no keyboard to steal focus back from.
 * Re-focuses after any tap that did not land on a real input.
 */
export function useKeepFocus(
  ref: React.RefObject<HTMLInputElement>,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    const refocus = () => {
      const active = document.activeElement;
      if (active && isTextEntry(active)) return;
      // A dialog is open: leave focus alone or we trap the user.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      ref.current?.focus();
    };

    refocus();
    const timer = window.setInterval(refocus, 1000);
    document.addEventListener('pointerup', refocus);
    window.addEventListener('focus', refocus);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('pointerup', refocus);
      window.removeEventListener('focus', refocus);
    };
  }, [ref, enabled]);
}
