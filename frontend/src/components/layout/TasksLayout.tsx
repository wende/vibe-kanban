import { ReactNode, useState, useRef, useEffect, useCallback } from 'react';
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  type ImperativePanelGroupHandle,
} from 'react-resizable-panels';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type LayoutMode = 'preview' | 'diffs' | null;

// Swipe gesture hook for mobile
function useSwipeGesture(
  onSwipeRight: () => void,
  options: { threshold?: number; enabled?: boolean } = {}
) {
  const { threshold = 100, enabled = true } = options;
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || touchStartX.current === null || touchStartY.current === null) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX.current;
      const deltaY = Math.abs(touchEndY - touchStartY.current);

      // Only trigger if horizontal swipe is dominant and exceeds threshold
      if (deltaX > threshold && deltaX > deltaY * 2) {
        onSwipeRight();
      }

      touchStartX.current = null;
      touchStartY.current = null;
    },
    [enabled, threshold, onSwipeRight]
  );

  return { handleTouchStart, handleTouchEnd };
}

interface TasksLayoutProps {
  kanban: ReactNode;
  attempt: ReactNode;
  aux: ReactNode;
  isPanelOpen: boolean;
  mode: LayoutMode;
  isMobile?: boolean;
  rightHeader?: ReactNode;
  onClose?: () => void;
}

type SplitSizes = [number, number];

const MIN_PANEL_SIZE = 20;
const DEFAULT_KANBAN_ATTEMPT: SplitSizes = [66, 34];
const DEFAULT_ATTEMPT_AUX: SplitSizes = [34, 66];

const STORAGE_KEYS = {
  KANBAN_ATTEMPT: 'tasksLayout.desktop.v2.kanbanAttempt',
  ATTEMPT_AUX: 'tasksLayout.desktop.v2.attemptAux',
} as const;

function loadSizes(key: string, fallback: SplitSizes): SplitSizes {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.length === 2)
      return parsed as SplitSizes;
    return fallback;
  } catch {
    return fallback;
  }
}

function saveSizes(key: string, sizes: SplitSizes): void {
  try {
    localStorage.setItem(key, JSON.stringify(sizes));
  } catch {
    // Ignore errors
  }
}

/**
 * AuxRouter - Handles nested AnimatePresence for preview/diffs transitions.
 */
function AuxRouter({ mode, aux }: { mode: LayoutMode; aux: ReactNode }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {mode && (
        <motion.div
          key={mode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="h-full min-h-0"
        >
          {aux}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * RightWorkArea - Contains header and Attempt/Aux content.
 * Shows just Attempt when mode === null, or Attempt | Aux split when mode !== null.
 */
function RightWorkArea({
  attempt,
  aux,
  mode,
  rightHeader,
}: {
  attempt: ReactNode;
  aux: ReactNode;
  mode: LayoutMode;
  rightHeader?: ReactNode;
}) {
  const [innerSizes] = useState<SplitSizes>(() =>
    loadSizes(STORAGE_KEYS.ATTEMPT_AUX, DEFAULT_ATTEMPT_AUX)
  );
  const [isAttemptCollapsed, setIsAttemptCollapsed] = useState(false);

  return (
    <div className="h-full min-h-0 flex flex-col">
      {rightHeader && (
        <div className="shrink-0 sticky top-0 z-20 bg-background border-b">
          {rightHeader}
        </div>
      )}
      <div className="flex-1 min-h-0">
        {mode === null ? (
          attempt
        ) : (
          <PanelGroup
            direction="horizontal"
            className="h-full min-h-0"
            onLayout={(layout) => {
              if (layout.length === 2) {
                saveSizes(STORAGE_KEYS.ATTEMPT_AUX, [layout[0], layout[1]]);
              }
            }}
          >
            <Panel
              id="attempt"
              order={1}
              defaultSize={innerSizes[0]}
              minSize={MIN_PANEL_SIZE}
              collapsible
              collapsedSize={0}
              onCollapse={() => setIsAttemptCollapsed(true)}
              onExpand={() => setIsAttemptCollapsed(false)}
              className="min-w-0 min-h-0 overflow-hidden"
              role="region"
              aria-label="Details"
            >
              {attempt}
            </Panel>

            <PanelResizeHandle
              id="handle-aa"
              className={cn(
                'relative z-30 bg-border cursor-col-resize group touch-none',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                'focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                'transition-all',
                isAttemptCollapsed ? 'w-6' : 'w-1'
              )}
              aria-label="Resize panels"
              role="separator"
              aria-orientation="vertical"
            >
              <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />
              <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-muted/90 border border-border rounded-full px-1.5 py-3 opacity-70 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shadow-sm">
                <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              </div>
            </PanelResizeHandle>

            <Panel
              id="aux"
              order={2}
              defaultSize={innerSizes[1]}
              minSize={MIN_PANEL_SIZE}
              collapsible={false}
              className="min-w-0 min-h-0 overflow-hidden"
              role="region"
              aria-label={mode === 'preview' ? 'Preview' : 'Diffs'}
            >
              <AuxRouter mode={mode} aux={aux} />
            </Panel>
          </PanelGroup>
        )}
      </div>
    </div>
  );
}

/**
 * DesktopSimple - Conditionally renders layout based on mode.
 * When mode === null: Shows Kanban | Attempt
 * When mode !== null: Hides Kanban, shows only RightWorkArea with Attempt | Aux
 */
function DesktopSimple({
  kanban,
  attempt,
  aux,
  mode,
  rightHeader,
  showRightArea,
}: {
  kanban: ReactNode;
  attempt: ReactNode;
  aux: ReactNode;
  mode: LayoutMode;
  rightHeader?: ReactNode;
  showRightArea: boolean;
}) {
  const [outerSizes, setOuterSizes] = useState<SplitSizes>(() =>
    loadSizes(STORAGE_KEYS.KANBAN_ATTEMPT, DEFAULT_KANBAN_ATTEMPT)
  );
  const [isKanbanCollapsed, setIsKanbanCollapsed] = useState(false);
  const panelGroupRef = useRef<ImperativePanelGroupHandle | null>(null);

  // Track if we need to animate the panel opening
  const prevShowRightAreaRef = useRef(showRightArea);

  // Animate panel sizes when showRightArea changes
  useEffect(() => {
    const wasOpen = prevShowRightAreaRef.current;
    prevShowRightAreaRef.current = showRightArea;

    if (panelGroupRef.current && wasOpen !== showRightArea) {
      if (showRightArea) {
        // Panel is opening - animate from kanban-only to split view
        panelGroupRef.current.setLayout([outerSizes[0], outerSizes[1]]);
      } else {
        // Panel is closing - animate to kanban-only
        panelGroupRef.current.setLayout([100, 0]);
      }
    }
  }, [showRightArea, outerSizes]);

  // When preview/diffs is open, hide Kanban entirely and render only RightWorkArea
  if (mode !== null) {
    return (
      <RightWorkArea
        attempt={attempt}
        aux={aux}
        mode={mode}
        rightHeader={rightHeader}
      />
    );
  }

  // When only viewing attempt logs, show Kanban | Attempt (no aux)
  return (
    <PanelGroup
      ref={panelGroupRef}
      direction="horizontal"
      className="h-full min-h-0"
      onLayout={(layout) => {
        // Only save sizes when both panels are visible and have reasonable values
        if (layout.length === 2 && showRightArea && layout[0] > 5 && layout[1] > 5) {
          setOuterSizes([layout[0], layout[1]]);
          saveSizes(STORAGE_KEYS.KANBAN_ATTEMPT, [layout[0], layout[1]]);
        }
      }}
    >
      <Panel
        id="kanban"
        order={1}
        defaultSize={showRightArea ? outerSizes[0] : 100}
        minSize={showRightArea ? MIN_PANEL_SIZE : 100}
        collapsible={showRightArea}
        collapsedSize={0}
        onCollapse={() => setIsKanbanCollapsed(true)}
        onExpand={() => setIsKanbanCollapsed(false)}
        className="min-w-0 min-h-0 overflow-hidden"
        role="region"
        aria-label="Kanban board"
      >
        {kanban}
      </Panel>

      <PanelResizeHandle
        id="handle-kr"
        className={cn(
          'relative z-30 bg-border cursor-col-resize group touch-none',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          'focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          'transition-all',
          !showRightArea && 'hidden',
          isKanbanCollapsed ? 'w-6' : 'w-1'
        )}
        aria-label="Resize panels"
        role="separator"
        aria-orientation="vertical"
      >
        <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-muted/90 border border-border rounded-full px-1.5 py-3 opacity-70 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shadow-sm">
          <span className="w-1 h-1 rounded-full bg-muted-foreground" />
          <span className="w-1 h-1 rounded-full bg-muted-foreground" />
          <span className="w-1 h-1 rounded-full bg-muted-foreground" />
        </div>
      </PanelResizeHandle>

      <Panel
        id="right"
        order={2}
        defaultSize={showRightArea ? outerSizes[1] : 0}
        minSize={showRightArea ? MIN_PANEL_SIZE : 0}
        collapsible={false}
        className={cn(
          'min-w-0 min-h-0 overflow-hidden transition-opacity duration-200',
          !showRightArea && 'opacity-0 pointer-events-none'
        )}
      >
        <RightWorkArea
          attempt={attempt}
          aux={aux}
          mode={mode}
          rightHeader={rightHeader}
        />
      </Panel>
    </PanelGroup>
  );
}

export function TasksLayout({
  kanban,
  attempt,
  aux,
  isPanelOpen,
  mode,
  isMobile = false,
  rightHeader,
  onClose,
}: TasksLayoutProps) {
  const { handleTouchStart, handleTouchEnd } = useSwipeGesture(
    () => onClose?.(),
    { enabled: isMobile && isPanelOpen }
  );

  if (isMobile) {
    const columns = isPanelOpen ? ['0fr', '1fr', '0fr'] : ['1fr', '0fr', '0fr'];
    const gridTemplateColumns = `minmax(0, ${columns[0]}) minmax(0, ${columns[1]}) minmax(0, ${columns[2]})`;
    const isKanbanVisible = columns[0] !== '0fr';
    const isAttemptVisible = columns[1] !== '0fr';
    const isAuxVisible = columns[2] !== '0fr';

    return (
      <div
        className="h-full min-h-0 grid"
        style={{
          gridTemplateColumns,
          transition: 'grid-template-columns 250ms cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        <div
          className="min-w-0 min-h-0 overflow-hidden"
          aria-hidden={!isKanbanVisible}
          aria-label="Kanban board"
          role="region"
          style={{ pointerEvents: isKanbanVisible ? 'auto' : 'none' }}
        >
          {kanban}
        </div>

        <div
          className="min-w-0 min-h-0 overflow-hidden border-l flex flex-col"
          aria-hidden={!isAttemptVisible}
          aria-label="Details"
          role="region"
          style={{ pointerEvents: isAttemptVisible ? 'auto' : 'none' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {rightHeader && (
            <div className="shrink-0 sticky top-0 z-20 bg-background border-b">
              {rightHeader}
            </div>
          )}
          <div className="flex-1 min-h-0">{attempt}</div>
        </div>

        <div
          className="min-w-0 min-h-0 overflow-hidden border-l"
          aria-hidden={!isAuxVisible}
          aria-label={mode === 'preview' ? 'Preview' : 'Diffs'}
          role="region"
          style={{ pointerEvents: isAuxVisible ? 'auto' : 'none' }}
        >
          {aux}
        </div>
      </div>
    );
  }

  const desktopNode = (
    <DesktopSimple
      kanban={kanban}
      attempt={attempt}
      aux={aux}
      mode={mode}
      rightHeader={rightHeader}
      showRightArea={isPanelOpen}
    />
  );

  return (
    <div className="h-full min-h-0" data-panel-open={isPanelOpen ? 'true' : 'false'}>
      {desktopNode}
    </div>
  );
}
