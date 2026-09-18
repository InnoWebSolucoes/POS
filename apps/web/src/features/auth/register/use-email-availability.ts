import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

/**
 * Warns about a taken email before the owner fills in the rest and hits submit.
 *
 * The typing is debounced so one keystroke is not one request, and the answer
 * is only trusted once the debounced value has caught up with what is in the
 * field - otherwise the form would flash "disponivel" for the previous address.
 *
 * The key is local because qk has no entry for this public route and
 * lib/query.ts is not ours to extend.
 */

const DEBOUNCE_MS = 450;

export const emailAvailabilityKey = (email: string) =>
  ['auth', 'email-available', email] as const;

interface EmailAvailabilityResponse {
  available: boolean;
  /** The server answers `available: false, reason: 'invalid'` for junk input. */
  reason?: string;
}

/** Deliberately permissive: the server is the authority on what an email is. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export interface EmailAvailability {
  /** There is already an account with this address. */
  taken: boolean;
  /** Checked and free. */
  available: boolean;
  /** A request is in flight, or one is about to be. */
  checking: boolean;
}

export function useEmailAvailability(email: string, enabled: boolean): EmailAvailability {
  const normalized = email.trim().toLowerCase();
  const [debounced, setDebounced] = React.useState(normalized);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(normalized), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [normalized]);

  const settled = debounced === normalized;
  const active = enabled && isEmail(normalized);

  const query = useQuery({
    queryKey: emailAvailabilityKey(debounced),
    queryFn: () =>
      api.get<EmailAvailabilityResponse>(
        '/api/auth/email-available',
        { email: debounced },
        { anonymous: true },
      ),
    enabled: active && settled,
    staleTime: 60_000,
    retry: false,
  });

  const data = settled ? query.data : undefined;

  return {
    // 'invalid' is the server rejecting the string, not a collision.
    taken: Boolean(data && !data.available && data.reason !== 'invalid'),
    available: Boolean(data?.available),
    checking: active && (!settled || query.isFetching),
  };
}
