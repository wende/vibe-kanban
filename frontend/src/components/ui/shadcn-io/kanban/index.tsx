'use client';

import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DragEndEvent, Modifier } from '@dnd-kit/core';
import {
  DndContext,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { type ReactNode, type Ref, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Plus, X, AlertTriangle } from 'lucide-react';
import type { ClientRect } from '@dnd-kit/core';
import type { Transform } from '@dnd-kit/utilities';
import { Button } from '../../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../dialog';
import { useState } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
export type { DragEndEvent } from '@dnd-kit/core';

export type Status = {
  id: string;
  name: string;
  color: string;
};

export type Feature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: Status;
};

export type KanbanBoardProps = {
  id: Status['id'];
  children: ReactNode;
  className?: string;
};

export const KanbanBoard = ({ id, children, className }: KanbanBoardProps) => {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      className={cn(
        'flex flex-col',
        // Mobile: each column section with reasonable height
        'min-h-0',
        // Desktop: original min height
        'xl:min-h-40',
        isOver ? 'outline-primary' : 'outline-black',
        className
      )}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
};

export type KanbanCardProps = Pick<Feature, 'id' | 'name'> & {
  index: number;
  parent: string;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  tabIndex?: number;
  forwardedRef?: Ref<HTMLDivElement>;
  onKeyDown?: (e: KeyboardEvent) => void;
  isOpen?: boolean;
  dragDisabled?: boolean;
  hasUnread?: boolean;
};

export const KanbanCard = ({
  id,
  name,
  index,
  parent,
  children,
  className,
  onClick,
  tabIndex,
  forwardedRef,
  onKeyDown,
  isOpen,
  dragDisabled = false,
  hasUnread = false,
}: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data: { index, parent },
      disabled: dragDisabled,
    });

  // Combine DnD ref and forwarded ref
  const combinedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef && typeof forwardedRef === 'object') {
      (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
    }
  };

  return (
    <Card
      className={cn(
        'p-3 outline-none border-b flex-col space-y-2',
        isDragging && 'cursor-grabbing',
        isOpen && 'shadow-[inset_0_0_0_1px_#0869DA] bg-[#DEF3FF]',
        hasUnread &&
          !isOpen &&
          'shadow-[0_0_12px_2px_rgba(251,146,60,0.5)] ring-1 ring-orange-400/50',
        className
      )}
      {...listeners}
      {...attributes}
      ref={combinedRef}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={{
        zIndex: isDragging ? 1000 : 1,
        transform: transform
          ? `translateX(${transform.x}px) translateY(${transform.y}px)`
          : 'none',
      }}
    >
      {children ?? <p className="m-0 font-medium text-sm">{name}</p>}
    </Card>
  );
};

export type KanbanCardsProps = {
  children: ReactNode;
  className?: string;
};

export const KanbanCards = ({ children, className }: KanbanCardsProps) => (
  <div className={cn('flex flex-1 flex-col relative', className)}>
    {children}
  </div>
);

export type KanbanHeaderAction =
  | { type: 'add'; onAdd: () => void }
  | { type: 'clear'; onClear: () => void; itemCount: number }
  | { type: 'none' };

export type KanbanHeaderProps =
  | {
      children: ReactNode;
    }
  | {
      name: Status['name'];
      color: Status['color'];
      className?: string;
      action?: KanbanHeaderAction;
      /** @deprecated Use action prop instead */
      onAddTask?: () => void;
      /** Whether to use neutral background instead of colored */
      neutralBackground?: boolean;
    };

export const KanbanHeader = (props: KanbanHeaderProps) => {
  const { t } = useTranslation('tasks');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const isXL = useMediaQuery('(min-width: 1280px)');

  if ('children' in props) {
    return props.children;
  }

  // Support legacy onAddTask prop for backwards compatibility
  const action: KanbanHeaderAction =
    props.action ??
    (props.onAddTask
      ? { type: 'add', onAdd: props.onAddTask }
      : { type: 'none' });

  const handleClearConfirm = () => {
    if (action.type === 'clear') {
      action.onClear();
    }
    setShowConfirmDialog(false);
  };

  const renderAction = () => {
    if (action.type === 'none') {
      return null;
    }

    if (action.type === 'add') {
      const button = (
        <Button
          variant="ghost"
          className="m-0 p-0 h-0 text-foreground/50 hover:text-foreground"
          onClick={action.onAdd}
          aria-label={t('actions.addTask')}
        >
          <Plus className="h-4 w-4" />
        </Button>
      );

      // Skip tooltip on mobile to avoid double-tap issue
      if (!isXL) {
        return button;
      }

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="top">{t('actions.addTask')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (action.type === 'clear') {
      const button = (
        <Button
          variant="ghost"
          className="m-0 p-0 h-0 text-foreground/50 hover:text-destructive"
          onClick={() => setShowConfirmDialog(true)}
          aria-label={t('actions.clearColumn')}
        >
          <X className="h-4 w-4" />
        </Button>
      );

      return (
        <>
          {isXL ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="top">
                  {t('actions.clearColumn')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            button
          )}
          {createPortal(
            <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                    <DialogTitle>
                      {t('actions.clearColumnConfirmTitle')}
                    </DialogTitle>
                  </div>
                  <DialogDescription className="text-left pt-2">
                    {t('actions.clearColumnConfirmDescription', {
                      count: action.itemCount,
                      column: props.name,
                    })}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowConfirmDialog(false)}
                  >
                    {t('actions.cancel')}
                  </Button>
                  <Button variant="destructive" onClick={handleClearConfirm}>
                    {t('actions.clearColumnConfirm')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>,
            document.body
          )}
        </>
      );
    }

    return null;
  };

  return (
    <Card
      className={cn(
        'sticky top-0 z-20 flex shrink-0 items-center gap-2 p-3 border-b border-dashed',
        'bg-background',
        // Mobile: stronger visual distinction between sections
        'py-4 xl:py-3',
        props.className
      )}
      style={{
        backgroundColor: props.neutralBackground ? '#F7F8FA' : undefined,
        backgroundImage: props.neutralBackground
          ? 'none'
          : `linear-gradient(hsl(var(${props.color}) / 0.08), hsl(var(${props.color}) / 0.08))`,
      }}
    >
      <span className="flex-1 flex items-center gap-2">
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: `hsl(var(${props.color}))` }}
        />

        <p className="m-0 text-sm font-medium">{props.name}</p>
      </span>
      {renderAction()}
    </Card>
  );
};

function restrictToBoundingRectWithRightPadding(
  transform: Transform,
  rect: ClientRect,
  boundingRect: ClientRect,
  rightPadding: number
): Transform {
  const value = {
    ...transform,
  };

  if (rect.top + transform.y <= boundingRect.top) {
    value.y = boundingRect.top - rect.top;
  } else if (
    rect.bottom + transform.y >=
    boundingRect.top + boundingRect.height
  ) {
    value.y = boundingRect.top + boundingRect.height - rect.bottom;
  }

  if (rect.left + transform.x <= boundingRect.left) {
    value.x = boundingRect.left - rect.left;
  } else if (
    // branch that checks if the right edge of the dragged element is beyond
    // the right edge of the bounding rectangle
    rect.right + transform.x + rightPadding >=
    boundingRect.left + boundingRect.width
  ) {
    value.x =
      boundingRect.left + boundingRect.width - rect.right - rightPadding;
  }

  return {
    ...value,
    x: value.x,
  };
}

// An alternative to `restrictToFirstScrollableAncestor` from the dnd-kit library
const restrictToFirstScrollableAncestorCustom: Modifier = (args) => {
  const { draggingNodeRect, transform, scrollableAncestorRects } = args;
  const firstScrollableAncestorRect = scrollableAncestorRects[0];

  if (!draggingNodeRect || !firstScrollableAncestorRect) {
    return transform;
  }

  // Inset the right edge that the rect can be dragged to by this amount.
  // This is a workaround for the kanban board where dragging a card too far
  // to the right causes infinite horizontal scrolling if there are also
  // enough cards for vertical scrolling to be enabled.
  const rightPadding = 16;
  return restrictToBoundingRectWithRightPadding(
    transform,
    draggingNodeRect,
    firstScrollableAncestorRect,
    rightPadding
  );
};

export type KanbanProviderProps = {
  children: ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
  className?: string;
};

export const KanbanProvider = ({
  children,
  onDragEnd,
  className,
}: KanbanProviderProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  return (
    <DndContext
      collisionDetection={rectIntersection}
      onDragEnd={onDragEnd}
      sensors={sensors}
      modifiers={[restrictToFirstScrollableAncestorCustom]}
    >
      <div
        className={cn(
          // Mobile: vertical scrollable layout
          'flex flex-col divide-y border-y',
          // Desktop (xl+): horizontal grid layout
          'xl:inline-grid xl:grid-flow-col xl:auto-cols-[minmax(200px,400px)] xl:divide-y-0 xl:divide-x xl:border-y-0 xl:border-x xl:items-stretch xl:min-h-full',
          className
        )}
      >
        {children}
      </div>
    </DndContext>
  );
};
