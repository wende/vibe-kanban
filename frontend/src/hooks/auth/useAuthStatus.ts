import { useQuery } from '@tanstack/react-query';
import { oauthApi } from '@/lib/api';

interface UseAuthStatusOptions {
  enabled: boolean;
}

export function useAuthStatus(options: UseAuthStatusOptions) {
  return useQuery({
    queryKey: ['auth', 'status'],
    queryFn: () => oauthApi.status(),
    enabled: options.enabled,
    refetchInterval: options.enabled ? 2000 : false, // Poll every 2 seconds during OAuth flow
    retry: 1, // Reduce retries to avoid flooding on errors
    staleTime: 0, // Always fetch fresh data when enabled
  });
}
