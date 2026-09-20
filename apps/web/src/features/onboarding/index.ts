/**
 * First-run guidance.
 *
 *   import { SetupChecklist, TourButton } from '@/features/onboarding';
 *
 * Three pieces, all opt-out or opt-in, none of which may ever block or nag
 * somebody who already knows what they are doing:
 *
 *  - SetupChecklist  the dashboard card that reads the account and ticks itself
 *                    off, disappears when finished and can be dismissed.
 *  - TourButton      "Como funciona" in the top bar: a reference panel, opened
 *                    on purpose and closed when done.
 *  - GuidedEmpty     an empty state that says what the screen is for and offers
 *                    the one action that fills it. Any screen may adopt it.
 *  - Hint / KeyCap   small factual notes for the keys that genuinely save time.
 */

export { SetupChecklist, type SetupChecklistProps } from './setup-checklist';
export { GuidedEmpty, type GuidedEmptyProps, type GuidedEmptyAction } from './guided-empty';
export { Hint, KeyCap, ScanQuantityHint, SCAN_QUANTITY_HINT, type HintProps } from './hints';
export { TourButton, TourSheet, type TourButtonProps, type TourSheetProps } from './tour';
export { tourSections, type TourCard, type TourSection } from './tour-content';
export { useSetupSteps, type SetupState, type SetupStep } from './setup-steps';
export { StarterOffer, type StarterOfferProps } from './starter-offer';
