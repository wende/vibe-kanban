import { useQuery } from '@tanstack/react-query';
import { getSharedTaskAssignees } from '@/lib/remoteApi';
import { useAuth } from '@/hooks';
import type { SharedTask, UserData } from 'shared/types';
import { useMemo } from 'react';

interface UseAssigneeUserNamesOptions {
  projectId: string | undefined;
  sharedTasks?: SharedTask[];
}

export function useAssigneeUserNames(options: UseAssigneeUserNamesOptions) {
  const { projectId, sharedTasks } = options;
  const { isSignedIn } = useAuth();

  // Only fetch when signed in and have a project ID
  const { data: assignees, refetch } = useQuery<UserData[], Error>({
    queryKey: ['project', 'assignees', projectId],
    queryFn: () => getSharedTaskAssignees(projectId!),
    enabled: Boolean(projectId) && isSignedIn,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const assignedUserIds = useMemo(() => {
    if (!sharedTasks) return null;
    return Array.from(
      new Set(sharedTasks.map((task) => task.assignee_user_id))
    );
  }, [sharedTasks]);

  // Note: Removed useEffect that called refetch on assignedUserIds change
  // React Query will automatically refetch when the query key changes
  // The assignedUserIds was causing unnecessary refetches

  return {
    assignees,
    refetchAssignees: refetch,
    assignedUserIds,
  };
}
