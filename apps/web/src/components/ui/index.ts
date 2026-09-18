/**
 * The UI primitive library.
 *
 *   import { Button, Card, MoneyInput } from '@/components/ui';
 *
 * Everything here is touch-first (44px minimum), token-driven (light, dark and
 * the KDS palette come for free) and written in pt-PT without accents.
 */

/* Actions and inputs */
export * from './button';
export * from './input';
export * from './textarea';
export * from './label';
export * from './select';
export * from './checkbox';
export * from './switch';
export * from './radio-group';
export * from './search-input';
export * from './money-input';
export * from './quantity-stepper';
export * from './date-range-picker';

/* Overlays */
export * from './dialog';
export * from './alert-dialog';
export * from './sheet';
export * from './dropdown-menu';
export * from './popover';
export * from './tooltip';

/* Structure and display */
export * from './accordion';
export * from './avatar';
export * from './badge';
export * from './card';
export * from './empty-state';
export * from './progress';
export * from './scroll-area';
export * from './separator';
export * from './skeleton';
export * from './stat-card';
export * from './tabs';
export * from './tile';

/* Data */
export * from './table';
export * from './data-table';
export * from './pagination';

/* Feedback */
export * from './spinner';
export * from './toaster';
export * from './use-toast';
