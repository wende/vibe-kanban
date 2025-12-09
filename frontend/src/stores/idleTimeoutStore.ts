/**
 * Global store for idle timeout state per attempt.
 * This allows TaskCard to check if an attempt has time remaining
 * without being inside the IdleTimeoutProvider.
 */

import { useSyncExternalStore } from 'react';

type IdleTimeoutState = {
  timeLeft: number;
  percent: number;
};

const store = new Map<string, IdleTimeoutState>();
const listeners = new Set<() => void>();

export function setIdleTimeoutState(attemptId: string, state: IdleTimeoutState) {
  store.set(attemptId, state);
  listeners.forEach((listener) => listener());
}

export function clearIdleTimeoutState(attemptId: string) {
  store.delete(attemptId);
  listeners.forEach((listener) => listener());
}

export function getIdleTimeoutState(attemptId: string): IdleTimeoutState | undefined {
  return store.get(attemptId);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Hook to get idle timeout state for an attempt from the global store.
 * Returns undefined if the attempt doesn't have an active timer.
 */
export function useIdleTimeoutForAttempt(attemptId: string | null | undefined): IdleTimeoutState | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (attemptId ? store.get(attemptId) : undefined),
    () => undefined
  );
}
