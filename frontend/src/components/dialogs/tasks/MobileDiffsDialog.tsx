import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronsUp, ChevronsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDiffStream } from '@/hooks/useDiffStream';
import { useDiffSummary } from '@/hooks/useDiffSummary';
import DiffCard from '@/components/DiffCard';
import { Loader } from '@/components/ui/loader';
import type { TaskAttempt } from 'shared/types';

interface MobileDiffsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAttempt: TaskAttempt | null;
}

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
      if (
        !enabled ||
        touchStartX.current === null ||
        touchStartY.current === null
      )
        return;

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

export function MobileDiffsDialog({
  open,
  onOpenChange,
  selectedAttempt,
}: MobileDiffsDialogProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const [loading, setLoading] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [hasInitialized, setHasInitialized] = useState(false);

  const { diffs, error } = useDiffStream(selectedAttempt?.id ?? null, true);
  const { fileCount, added, deleted } = useDiffSummary(
    selectedAttempt?.id ?? null
  );

  // Swipe to close
  const { handleTouchStart, handleTouchEnd } = useSwipeGesture(
    () => onOpenChange(false),
    { threshold: 100, enabled: open }
  );

  // Reset loading state when attempt changes
  useEffect(() => {
    if (open) {
      setLoading(true);
      setHasInitialized(false);
    }
  }, [selectedAttempt?.id, open]);

  // Stop loading when diffs arrive
  useEffect(() => {
    if (diffs.length > 0 && loading) {
      setLoading(false);
    }
  }, [diffs, loading]);

  // Timeout for loading state
  useEffect(() => {
    if (!loading || !open) return;
    const timer = setTimeout(() => {
      if (diffs.length === 0) {
        setLoading(false);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [loading, diffs.length, open]);

  // Default-collapse certain change kinds
  useEffect(() => {
    if (diffs.length === 0 || hasInitialized) return;
    const kindsToCollapse = new Set([
      'deleted',
      'renamed',
      'copied',
      'permissionChange',
    ]);
    const initial = new Set(
      diffs
        .filter((d) => kindsToCollapse.has(d.change))
        .map((d, i) => d.newPath || d.oldPath || String(i))
    );
    if (initial.size > 0) setCollapsedIds(initial);
    setHasInitialized(true);
  }, [diffs, hasInitialized]);

  const ids = useMemo(() => {
    return diffs.map((d, i) => d.newPath || d.oldPath || String(i));
  }, [diffs]);

  const toggle = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const allCollapsed = collapsedIds.size === diffs.length;
  const handleCollapseAll = useCallback(() => {
    setCollapsedIds(allCollapsed ? new Set() : new Set(ids));
  }, [allCollapsed, ids]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header - compact for mobile */}
      <div className="shrink-0 z-10 bg-background border-b px-3 py-1.5 flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {t('diff.filesChanged', { count: fileCount })}{' '}
          <span className="text-green-600 dark:text-green-500">+{added}</span>{' '}
          <span className="text-red-600 dark:text-red-500">-{deleted}</span>
        </span>

        <div className="flex items-center gap-1">
          {/* Collapse/Expand all */}
          {diffs.length > 0 && (
            <Button
              variant="icon"
              onClick={handleCollapseAll}
              aria-pressed={allCollapsed}
              aria-label={
                allCollapsed ? t('diff.expandAll') : t('diff.collapseAll')
              }
            >
              {allCollapsed ? (
                <ChevronsDown className="h-4 w-4" />
              ) : (
                <ChevronsUp className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Close button */}
          <Button
            variant="icon"
            aria-label={t('common:buttons.close', { defaultValue: 'Close' })}
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2">
        {error && diffs.length === 0 ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
            <div className="text-red-800 text-sm">
              {t('diff.errorLoadingDiff', { error })}
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        ) : diffs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {t('diff.noChanges')}
          </div>
        ) : (
          diffs.map((diff, idx) => {
            const id = diff.newPath || diff.oldPath || String(idx);
            return (
              <DiffCard
                key={id}
                diff={diff}
                expanded={!collapsedIds.has(id)}
                onToggle={() => toggle(id)}
                selectedAttempt={selectedAttempt}
                forceMobileView
              />
            );
          })
        )}
      </div>
    </div>
  );
}
