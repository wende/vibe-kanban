import { memo, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks';
import {
  type DragEndEvent,
  type KanbanHeaderAction,
  KanbanBoard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from '@/components/ui/shadcn-io/kanban';
import { TaskCard } from './TaskCard';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';
import { statusBoardColors, statusLabels } from '@/utils/statusLabels';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { SharedTaskCard } from './SharedTaskCard';
import { BranchStatusProvider } from '@/contexts/BranchStatusContext';

export type KanbanColumnItem =
  | {
      type: 'task';
      task: TaskWithAttemptStatus;
      sharedTask?: SharedTaskRecord;
    }
  | {
      type: 'shared';
      task: SharedTaskRecord;
    };

export type KanbanColumns = Record<TaskStatus, KanbanColumnItem[]>;

interface TaskKanbanBoardProps {
  columns: KanbanColumns;
  onDragEnd: (event: DragEndEvent) => void;
  onViewTaskDetails: (task: TaskWithAttemptStatus) => void;
  onViewSharedTask?: (task: SharedTaskRecord) => void;
  selectedTaskId?: string;
  selectedSharedTaskId?: string | null;
  onCreateTask?: (defaultAutoStart?: boolean) => void;
  onClearColumn?: (status: TaskStatus, taskIds: string[]) => void;
  projectId: string;
}

function TaskKanbanBoard({
  columns,
  onDragEnd,
  onViewTaskDetails,
  onViewSharedTask,
  selectedTaskId,
  selectedSharedTaskId,
  onCreateTask,
  onClearColumn,
  projectId,
}: TaskKanbanBoardProps) {
  const { userId } = useAuth();

  // Collect all attempt IDs for batch branch status fetching
  const attemptIds = useMemo(() => {
    const ids: string[] = [];
    Object.values(columns).forEach((items) => {
      items.forEach((item) => {
        if (item.type === 'task' && item.task.latest_task_attempt_id) {
          ids.push(item.task.latest_task_attempt_id);
        }
      });
    });
    return ids;
  }, [columns]);

  // Get task IDs from column items (only own tasks, not shared-only)
  const getTaskIdsFromColumn = useCallback(
    (items: KanbanColumnItem[]): string[] => {
      return items
        .filter(
          (item): item is KanbanColumnItem & { type: 'task' } =>
            item.type === 'task'
        )
        .map((item) => item.task.id);
    },
    []
  );

  // Determine header action based on column status
  const getHeaderAction = useCallback(
    (statusKey: TaskStatus, items: KanbanColumnItem[]): KanbanHeaderAction => {
      switch (statusKey) {
        case 'todo':
          // To Do: Add task with autoStart defaulting to OFF
          return onCreateTask
            ? { type: 'add', onAdd: () => onCreateTask(false) }
            : { type: 'none' };

        case 'inprogress':
          // In Progress: Add task with autoStart defaulting to ON
          return onCreateTask
            ? { type: 'add', onAdd: () => onCreateTask(true) }
            : { type: 'none' };

        case 'inreview':
          // In Review: No action
          return { type: 'none' };

        case 'done':
        case 'cancelled': {
          // Done & Cancelled: Clear column (X button)
          const taskIds = getTaskIdsFromColumn(items);
          return taskIds.length > 0 && onClearColumn
            ? {
                type: 'clear',
                onClear: () => onClearColumn(statusKey, taskIds),
                itemCount: taskIds.length,
              }
            : { type: 'none' };
        }

        default:
          return { type: 'none' };
      }
    },
    [onCreateTask, onClearColumn, getTaskIdsFromColumn]
  );

  return (
    <BranchStatusProvider attemptIds={attemptIds}>
      <KanbanProvider onDragEnd={onDragEnd}>
        {Object.entries(columns).map(([status, items]) => {
          const statusKey = status as TaskStatus;
          const action = getHeaderAction(statusKey, items);
          return (
            <KanbanBoard key={status} id={statusKey}>
              <KanbanHeader
                name={statusLabels[statusKey]}
                color={statusBoardColors[statusKey]}
                action={action}
                neutralBackground={
                  statusKey === 'inprogress' ||
                  statusKey === 'inreview' ||
                  statusKey === 'done' ||
                  statusKey === 'cancelled'
                }
              />
              <KanbanCards>
                {items.map((item, index) => {
                  const isOwnTask =
                    item.type === 'task' &&
                    (!item.sharedTask?.assignee_user_id ||
                      !userId ||
                      item.sharedTask?.assignee_user_id === userId);

                  if (isOwnTask) {
                    return (
                      <TaskCard
                        key={item.task.id}
                        task={item.task}
                        index={index}
                        status={statusKey}
                        onViewDetails={onViewTaskDetails}
                        isOpen={selectedTaskId === item.task.id}
                        projectId={projectId}
                        sharedTask={item.sharedTask}
                      />
                    );
                  }

                  const sharedTask =
                    item.type === 'shared' ? item.task : item.sharedTask!;

                  return (
                    <SharedTaskCard
                      key={`shared-${item.task.id}`}
                      task={sharedTask}
                      index={index}
                      status={statusKey}
                      isSelected={selectedSharedTaskId === item.task.id}
                      onViewDetails={onViewSharedTask}
                    />
                  );
                })}
              </KanbanCards>
            </KanbanBoard>
          );
        })}
      </KanbanProvider>
    </BranchStatusProvider>
  );
}

export default memo(TaskKanbanBoard);
