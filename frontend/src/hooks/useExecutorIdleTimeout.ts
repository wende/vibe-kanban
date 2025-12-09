import { useState, useEffect, useCallback, useRef } from 'react';

const DEFAULT_TIMEOUT_SECONDS = 5 * 60; // 5 minutes

export interface UseExecutorIdleTimeoutOptions {
  timeoutSeconds?: number;
  enabled?: boolean;
  /** ISO timestamp of the last activity. Timer counts down from this point. */
  lastActivityAt?: string | null;
}

export interface UseExecutorIdleTimeoutResult {
  timeLeft: number;
  percent: number;
  reset: () => void;
  formattedTime: string;
}

/**
 * Calculate time left from a given activity timestamp or manual reset time
 */
function calculateTimeLeft(
  lastActivityAt: string | null | undefined,
  manualResetTime: number | null,
  timeoutSeconds: number
): number {
  // Manual reset takes precedence
  if (manualResetTime !== null) {
    const elapsed = Math.floor((Date.now() - manualResetTime) / 1000);
    return Math.max(0, timeoutSeconds - elapsed);
  }

  // Calculate from lastActivityAt
  if (!lastActivityAt) {
    return timeoutSeconds;
  }
  const activityTime = new Date(lastActivityAt).getTime();
  const elapsed = Math.floor((Date.now() - activityTime) / 1000);
  return Math.max(0, timeoutSeconds - elapsed);
}

/**
 * Hook to track idle time for an executor, counting down from a specified timeout.
 */
export function useExecutorIdleTimeout(
  options: UseExecutorIdleTimeoutOptions = {}
): UseExecutorIdleTimeoutResult {
  const {
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
    lastActivityAt,
  } = options;

  // Track manual reset time - when user triggers reset(), we use current time
  const [manualResetTime, setManualResetTime] = useState<number | null>(null);

  // Track the lastActivityAt value to detect changes and clear manual reset
  const lastActivityAtRef = useRef<string | null | undefined>(undefined);

  // State for the displayed time - initialized to 0, will be set properly in effect
  const [timeLeft, setTimeLeft] = useState<number>(timeoutSeconds);

  // Tick counter to force recalculation
  const [tick, setTick] = useState(0);

  // Reset function - uses current time as new activity time
  const reset = useCallback(() => {
    setManualResetTime(Date.now());
  }, []);

  // Clear manual reset when lastActivityAt changes to a NEW non-null value
  useEffect(() => {
    if (lastActivityAt !== lastActivityAtRef.current && lastActivityAt !== null) {
      lastActivityAtRef.current = lastActivityAt;
      setManualResetTime(null);
    }
  }, [lastActivityAt]);

  // Update timeLeft whenever dependencies change or tick updates
  useEffect(() => {
    const newTimeLeft = calculateTimeLeft(lastActivityAt, manualResetTime, timeoutSeconds);
    setTimeLeft(newTimeLeft);
  }, [lastActivityAt, manualResetTime, timeoutSeconds, tick]);

  // Run the countdown interval
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTick(t => t + 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // Calculate percentage remaining
  const percent = Math.max(0, Math.min(100, Math.round((timeLeft / timeoutSeconds) * 100)));

  // Format time as MM:SS
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return { timeLeft, percent, reset, formattedTime };
}
