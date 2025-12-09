import { useQuery, useQueryClient } from '@tanstack/react-query';
import { oauthApi } from '@/lib/api';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';

export function useCurrentUser() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: () => oauthApi.getCurrentUser(),
    enabled: isSignedIn, // Only fetch when signed in
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Only invalidate when transitioning to signed in state
  useEffect(() => {
    if (isSignedIn) {
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    }
  }, [queryClient, isSignedIn]);

  return query;
}
