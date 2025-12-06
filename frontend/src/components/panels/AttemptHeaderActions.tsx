import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Eye, FileDiff, X } from 'lucide-react';
import { Button } from '../ui/button';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import type { LayoutMode } from '../layout/TasksLayout';
import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '../ui/actions-dropdown';
import { usePostHog } from 'posthog-js/react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { cn } from '@/lib/utils';

interface AttemptHeaderActionsProps {
  onClose: () => void;
  mode?: LayoutMode;
  onModeChange?: (mode: LayoutMode) => void;
  task: TaskWithAttemptStatus;
  attempt?: TaskAttempt | null;
  sharedTask?: SharedTaskRecord;
}

export const AttemptHeaderActions = ({
  onClose,
  mode,
  onModeChange,
  task,
  attempt,
  sharedTask,
}: AttemptHeaderActionsProps) => {
  const { t } = useTranslation('tasks');
  const posthog = usePostHog();
  const isXL = useMediaQuery('(min-width: 800px)');
  const [copied, setCopied] = useState(false);

  const handleCopyPath = useCallback(async () => {
    if (!attempt?.container_ref) return;
    try {
      await navigator.clipboard.writeText(attempt.container_ref);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy to clipboard failed:', err);
    }
  }, [attempt?.container_ref]);

  const CopyPathButton = ({ className }: { className?: string }) => {
    if (!attempt?.container_ref) return null;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="icon"
            className={cn('shrink-0', className)}
            aria-label={
              copied ? t('actionsMenu.pathCopied') : t('actionsMenu.copyPath')
            }
            onClick={handleCopyPath}
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {copied ? t('actionsMenu.pathCopied') : t('actionsMenu.copyPath')}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <>
      {typeof mode !== 'undefined' && onModeChange && isXL && (
        <TooltipProvider>
          <div className="flex items-center gap-4">
            <ToggleGroup
              type="single"
              value={mode ?? ''}
              onValueChange={(v) => {
                const newMode = (v as LayoutMode) || null;

                // Track view navigation
                if (newMode === 'preview') {
                  posthog?.capture('preview_navigated', {
                    trigger: 'button',
                    timestamp: new Date().toISOString(),
                    source: 'frontend',
                  });
                } else if (newMode === 'diffs') {
                  posthog?.capture('diffs_navigated', {
                    trigger: 'button',
                    timestamp: new Date().toISOString(),
                    source: 'frontend',
                  });
                } else if (newMode === null) {
                  // Closing the view (clicked active button)
                  posthog?.capture('view_closed', {
                    trigger: 'button',
                    from_view: mode ?? 'attempt',
                    timestamp: new Date().toISOString(),
                    source: 'frontend',
                  });
                }

                onModeChange(newMode);
              }}
              className="inline-flex gap-4"
              aria-label="Layout mode"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="preview"
                    aria-label="Preview"
                    active={mode === 'preview'}
                  >
                    <Eye className="h-4 w-4" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t('attemptHeaderActions.preview')}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="diffs"
                    aria-label="Diffs"
                    active={mode === 'diffs'}
                  >
                    <FileDiff className="h-4 w-4" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t('attemptHeaderActions.diffs')}
                </TooltipContent>
              </Tooltip>
            </ToggleGroup>
            <CopyPathButton />
          </div>
        </TooltipProvider>
      )}
      {typeof mode !== 'undefined' && onModeChange && isXL && (
        <div className="h-4 w-px bg-border" />
      )}
      {(!isXL || typeof mode === 'undefined' || !onModeChange) &&
        attempt?.container_ref && (
          <TooltipProvider>
            <CopyPathButton />
          </TooltipProvider>
        )}
      <ActionsDropdown task={task} attempt={attempt} sharedTask={sharedTask} />
      {mode !== 'diffs' && (
        <Button variant="icon" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </Button>
      )}
    </>
  );
};
