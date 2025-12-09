import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KanbanCard } from '@/components/ui/shadcn-io/kanban';
import { CheckCircle, Link, Loader2, Play, XCircle } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '@/components/ui/actions-dropdown';
import { Button } from '@/components/ui/button';
import { useNavigateWithSearch } from '@/hooks';
import { paths } from '@/lib/paths';
import { attemptsApi } from '@/lib/api';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { TaskCardHeader } from './TaskCardHeader';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks';
import { useTaskReadStatus } from '@/contexts/TaskReadStatusContext';
import { useBranchStatusFromContext } from '@/contexts/BranchStatusContext';
import { useDevServerStatusFromContext } from '@/contexts/DevServerStatusContext';
import { useIdleTimeoutForAttempt } from '@/stores/idleTimeoutStore';
import { cn } from '@/lib/utils';

type Task = TaskWithAttemptStatus;

interface TaskCardProps {
  task: Task;
  index: number;
  status: string;
  onViewDetails: (task: Task) => void;
  isOpen?: boolean;
  projectId: string;
  sharedTask?: SharedTaskRecord;
}

type GitIndicator = {
  symbol: string;
  className: string;
  label: string;
};

const IDLE_TIMEOUT_SECONDS = 5 * 60; // 5 minutes

const DevServerIndicator = memo(function DevServerIndicator({
  attemptId,
}: {
  attemptId?: string | null;
}) {
  const devServerStatus = useDevServerStatusFromContext(attemptId);

  if (!devServerStatus) {
    return null;
  }

  return (
    <Play
      className="h-3.5 w-3.5 text-green-500"
      aria-label="Dev server is running"
    />
  );
});

const GitStatusIndicators = memo(function GitStatusIndicators({
  attemptId,
}: {
  attemptId?: string | null;
}) {
  // Use batch-fetched branch status from context instead of individual API calls
  const branchStatus = useBranchStatusFromContext(attemptId);
  const [sticky, setSticky] = useState({
    uncommitted: false,
    untracked: false,
    commitsAhead: false,
  });

  useEffect(() => {
    if (!branchStatus) return;

    const nextUncommitted =
      (branchStatus.uncommitted_count ?? 0) > 0 ||
      branchStatus.has_uncommitted_changes === true ||
      (branchStatus.conflicted_files?.length ?? 0) > 0;
    const nextUntracked =
      (branchStatus.untracked_count ?? 0) > 0 ||
      (branchStatus.has_uncommitted_changes === true &&
        branchStatus.untracked_count === null);
    const nextCommitsAhead =
      (branchStatus.remote_commits_ahead ?? 0) > 0 ||
      (branchStatus.commits_ahead ?? 0) > 0;

    // Only clear sticky flag when we have EXPLICIT confirmation of zero changes.
    // Using === 0 (not ?? 0) ensures null/undefined doesn't trigger a clear.
    const cleanUncommitted =
      branchStatus.uncommitted_count === 0 &&
      branchStatus.has_uncommitted_changes === false &&
      (branchStatus.conflicted_files?.length ?? 0) === 0;
    const cleanUntracked = branchStatus.untracked_count === 0;
    // Only clear commitsAhead when we have explicit confirmation of 0 commits ahead
    const cleanCommitsAhead =
      branchStatus.remote_commits_ahead === 0 &&
      branchStatus.commits_ahead === 0;

    setSticky((prev) => ({
      uncommitted: nextUncommitted
        ? true
        : cleanUncommitted
          ? false
          : prev.uncommitted,
      untracked: nextUntracked ? true : cleanUntracked ? false : prev.untracked,
      commitsAhead: nextCommitsAhead
        ? true
        : cleanCommitsAhead
          ? false
          : prev.commitsAhead,
    }));
  }, [branchStatus]);

  const indicators = useMemo((): GitIndicator[] => {
    const hasUncommitted = sticky.uncommitted;
    const hasUntracked = sticky.untracked;
    const hasCommitsAhead = sticky.commitsAhead;

    const items: GitIndicator[] = [];
    if (hasUncommitted) {
      items.push({
        symbol: '●',
        className: 'text-amber-500',
        label: 'Uncommitted changes in worktree',
      });
    }
    if (hasUntracked) {
      items.push({
        symbol: '?',
        className: 'text-purple-500',
        label: 'Untracked files present',
      });
    }
    if (hasCommitsAhead) {
      items.push({
        symbol: '↑',
        className: 'text-sky-500',
        label: 'Local commits not pushed to origin',
      });
    }
    return items;
  }, [sticky.uncommitted, sticky.untracked, sticky.commitsAhead]);

  if (!indicators.length) {
    return null;
  }

  return (
    <div className="flex items-center gap-1" aria-label="Git status indicators">
      {indicators.map((item, idx) => (
        <span
          key={`${item.symbol}-${idx}`}
          className={`text-xs ${item.className}`}
          title={item.label}
          aria-label={item.label}
        >
          {item.symbol}
        </span>
      ))}
    </div>
  );
});

export const TaskCard = memo(function TaskCard({
  task,
  index,
  status,
  onViewDetails,
  isOpen,
  projectId,
  sharedTask,
}: TaskCardProps) {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const [isNavigatingToParent, setIsNavigatingToParent] = useState(false);
  const { isSignedIn } = useAuth();
  const { markAsRead, hasUnread } = useTaskReadStatus();

  const taskHasUnread = hasUnread(task.id, task.updated_at);

  // Get idle timeout state for this task's attempt from the global store
  // (synced when the card is open/focused)
  const idleTimeoutState = useIdleTimeoutForAttempt(task.latest_task_attempt_id);

  // Track when the store state was last updated so we can decrement locally
  const lastStoreUpdateRef = useRef<{ timeLeft: number; timestamp: number } | null>(null);

  // Calculate timer from task.updated_at as fallback when no store state exists
  const [calculatedTimeLeft, setCalculatedTimeLeft] = useState(() => {
    if (!task.updated_at) return 0;
    const updatedTime = new Date(task.updated_at).getTime();
    const elapsed = Math.floor((Date.now() - updatedTime) / 1000);
    return Math.max(0, IDLE_TIMEOUT_SECONDS - elapsed);
  });

  // Track the locally decremented time (for when store state is stale)
  const [localTimeLeft, setLocalTimeLeft] = useState<number | null>(null);

  // Update ref when store state changes
  useEffect(() => {
    if (idleTimeoutState) {
      lastStoreUpdateRef.current = {
        timeLeft: idleTimeoutState.timeLeft,
        timestamp: Date.now(),
      };
      // Reset local time tracking when we get fresh store data
      setLocalTimeLeft(null);
    }
  }, [idleTimeoutState]);

  useEffect(() => {
    // Recalculate immediately when updated_at changes
    if (!task.updated_at) {
      setCalculatedTimeLeft(0);
      return;
    }
    const updatedTime = new Date(task.updated_at).getTime();
    const calculateTimeLeft = () => {
      const elapsed = Math.floor((Date.now() - updatedTime) / 1000);
      return Math.max(0, IDLE_TIMEOUT_SECONDS - elapsed);
    };
    setCalculatedTimeLeft(calculateTimeLeft());

    // Only run fallback interval if there's time remaining and no store state
    const initialTimeLeft = calculateTimeLeft();
    if (initialTimeLeft <= 0 || idleTimeoutState) return;

    const interval = setInterval(() => {
      const newTimeLeft = calculateTimeLeft();
      setCalculatedTimeLeft(newTimeLeft);
      if (newTimeLeft <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [task.updated_at, idleTimeoutState]);

  // Run a local countdown when we have store state but the provider is not actively updating
  // This handles the case where the card was focused, timer was synced, then card unfocused
  useEffect(() => {
    // Only needed if we have a stored state snapshot to decrement from
    if (!lastStoreUpdateRef.current || lastStoreUpdateRef.current.timeLeft <= 0) {
      return;
    }

    const interval = setInterval(() => {
      const snapshot = lastStoreUpdateRef.current;
      if (!snapshot) return;

      const elapsedSinceSnapshot = Math.floor((Date.now() - snapshot.timestamp) / 1000);
      const newTimeLeft = Math.max(0, snapshot.timeLeft - elapsedSinceSnapshot);
      setLocalTimeLeft(newTimeLeft);

      if (newTimeLeft <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [idleTimeoutState?.timeLeft]);

  // Determine the effective time left:
  // 1. If store has fresh data (provider is active), use it directly
  // 2. If we have local countdown from stale store data, use that
  // 3. Fall back to calculated time from task.updated_at
  const timeLeft = localTimeLeft ?? idleTimeoutState?.timeLeft ?? calculatedTimeLeft;
  const hasActiveTimer = timeLeft > 0;

  const handleClick = useCallback(() => {
    markAsRead(task.id);
    onViewDetails(task);
  }, [task, onViewDetails, markAsRead]);

  const handleParentClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!task.parent_task_attempt || isNavigatingToParent) return;

      setIsNavigatingToParent(true);
      try {
        const parentAttempt = await attemptsApi.get(task.parent_task_attempt);
        navigate(
          paths.attempt(
            projectId,
            parentAttempt.task_id,
            task.parent_task_attempt
          )
        );
      } catch (error) {
        console.error('Failed to navigate to parent task attempt:', error);
        setIsNavigatingToParent(false);
      }
    },
    [task.parent_task_attempt, projectId, navigate, isNavigatingToParent]
  );

  const localRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !localRef.current) return;
    const el = localRef.current;
    requestAnimationFrame(() => {
      el.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    });
  }, [isOpen]);

  return (
    <KanbanCard
      key={task.id}
      id={task.id}
      name={task.title}
      index={index}
      parent={status}
      onClick={handleClick}
      isOpen={isOpen}
      forwardedRef={localRef}
      dragDisabled={(!!sharedTask || !!task.shared_task_id) && !isSignedIn}
      hasUnread={taskHasUnread}
      className={cn(
        sharedTask || task.shared_task_id
          ? 'relative overflow-hidden pl-5 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-card-foreground before:content-[""]'
          : undefined,
        hasActiveTimer && timeLeft < 60
          ? 'bg-orange-50 dark:bg-orange-950/30'
          : hasActiveTimer && 'bg-green-50 dark:bg-green-950/30'
      )}
    >
      <div className="flex flex-col gap-2">
        <TaskCardHeader
          title={task.title}
          subtitle={task.executor}
          avatar={
            sharedTask
              ? {
                  firstName: sharedTask.assignee_first_name ?? undefined,
                  lastName: sharedTask.assignee_last_name ?? undefined,
                  username: sharedTask.assignee_username ?? undefined,
                }
              : undefined
          }
          right={
            <>
              <DevServerIndicator attemptId={task.latest_task_attempt_id} />
              <GitStatusIndicators attemptId={task.latest_task_attempt_id} />
              {task.has_in_progress_attempt && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              )}
              {task.has_merged_attempt && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              {task.last_attempt_failed && !task.has_merged_attempt && (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              {task.parent_task_attempt && (
                <Button
                  variant="icon"
                  onClick={handleParentClick}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={isNavigatingToParent}
                  title={t('navigateToParent')}
                >
                  <Link className="h-4 w-4" />
                </Button>
              )}
              <ActionsDropdown task={task} sharedTask={sharedTask} />
            </>
          }
        />
        {task.description && (
          <p className="text-sm text-secondary-foreground break-words">
            {task.description.length > 130
              ? `${task.description.substring(0, 130)}...`
              : task.description}
          </p>
        )}
      </div>
    </KanbanCard>
  );
});
