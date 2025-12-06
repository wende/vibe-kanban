import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useEffect,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { Project } from 'shared/types';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { useTaskReadStatus } from './TaskReadStatusContext';

interface ProjectContextValue {
  projectId: string | undefined;
  project: Project | undefined;
  isLoading: boolean;
  error: Error | null;
  isError: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

interface ProjectProviderProps {
  children: ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const location = useLocation();

  // Extract projectId from current route path
  const projectId = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/([^/]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname]);

  const query = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getById(projectId!),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const value = useMemo(
    () => ({
      projectId,
      project: query.data,
      isLoading: query.isLoading,
      error: query.error,
      isError: query.isError,
    }),
    [projectId, query.data, query.isLoading, query.error, query.isError]
  );

  // Get tasks for the current project to check for unread notifications
  const { tasks } = useProjectTasks(projectId || '');
  const { hasUnread } = useTaskReadStatus();

  // Check if there are any unread tasks
  const hasUnreadTasks = useMemo(() => {
    return tasks.some((task) => hasUnread(task.id, task.updated_at));
  }, [tasks, hasUnread]);

  // Centralized page title management with unread indicator
  useEffect(() => {
    const unreadIndicator = hasUnreadTasks ? '🟠 ' : '';
    if (query.data) {
      document.title = `${unreadIndicator}${query.data.name}`;
    } else {
      document.title = 'vibe-kanban';
    }
  }, [query.data, hasUnreadTasks]);

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
