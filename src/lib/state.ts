import type { CurrencyCode } from './settlement';

export interface DraftMember {
  id: string;
  name: string;
  amount: string;
}

/** Mutable input data belongs only to the lifetime of the current page. */
export interface Draft {
  currency: CurrencyCode;
  members: DraftMember[];
}

/** Delete the app's v0.1 draft without reading it or saving any new data. */
export function discardLegacyDraft(): void {
  try {
    localStorage.removeItem('how-much-should-i-pay:draft:v1');
  } catch {
    // Browser storage restrictions cannot prevent a fresh in-memory session.
  }
}
