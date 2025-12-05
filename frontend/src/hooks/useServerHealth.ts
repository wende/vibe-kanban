import { useState, useEffect, useCallback } from 'react';
import { healthApi } from '@/lib/api';

interface UseServerHealthOptions {
  pollInterval?: number;
  maxRetries?: number;
}

interface UseServerHealthResult {
  isServerReady: boolean;
  isChecking: boolean;
  hasTimedOut: boolean;
}

/**
 * Hook that polls the server health endpoint until the server is ready.
 * Returns isServerReady=true once the server responds successfully.
 */
export function useServerHealth(
  options: UseServerHealthOptions = {}
): UseServerHealthResult {
  const { pollInterval = 1000, maxRetries = 60 } = options;
  const [isServerReady, setIsServerReady] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const checkHealth = useCallback(async () => {
    const healthy = await healthApi.check();
    if (healthy) {
      setIsServerReady(true);
      setIsChecking(false);
    } else {
      setRetryCount((prev) => prev + 1);
    }
  }, []);

  useEffect(() => {
    if (isServerReady) return;
    if (retryCount >= maxRetries) {
      setIsChecking(false);
      setHasTimedOut(true);
      return;
    }

    const timer = setTimeout(checkHealth, retryCount === 0 ? 0 : pollInterval);
    return () => clearTimeout(timer);
  }, [isServerReady, retryCount, maxRetries, pollInterval, checkHealth]);

  return { isServerReady, isChecking, hasTimedOut };
}
