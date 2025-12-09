import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import BranchSelector from '@/components/tasks/BranchSelector';
import { ExecutorProfileSelector } from '@/components/settings';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import {
  useNavigateWithSearch,
  useTask,
  useAttempt,
  useBranches,
  useTaskAttempts,
} from '@/hooks';
import { useProject } from '@/contexts/ProjectContext';
import { useUserSystem } from '@/components/ConfigProvider';
import { paths } from '@/lib/paths';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import type { ExecutorProfileId, BaseCodingAgent } from 'shared/types';
import { useKeySubmitTask, Scope } from '@/keyboard';
import { attemptsApi } from '@/lib/api';

export interface CreateAttemptDialogProps {
  taskId: string;
  /** Optional source attempt to continue from (passes conversation history) */
  sourceAttemptId?: string;
}

const CreateAttemptDialogImpl = NiceModal.create<CreateAttemptDialogProps>(
  ({ taskId, sourceAttemptId }) => {
    const modal = useModal();
    const navigate = useNavigateWithSearch();
    const { projectId } = useProject();
    const { t } = useTranslation('tasks');
    const { profiles, config } = useUserSystem();
    const { createAttempt, isCreating, error } = useAttemptCreation({
      taskId,
      onSuccess: (attempt) => {
        if (projectId) {
          navigate(paths.attempt(projectId, taskId, attempt.id));
        }
      },
    });

    const [userSelectedProfile, setUserSelectedProfile] =
      useState<ExecutorProfileId | null>(null);
    const [userSelectedBranch, setUserSelectedBranch] = useState<string | null>(
      null
    );
    const [customBranch, setCustomBranch] = useState<string>('');
    const [includeHistory, setIncludeHistory] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Get source attempt details when continuing from another attempt
    const { data: sourceAttempt } = useAttempt(sourceAttemptId, {
      enabled: modal.visible && !!sourceAttemptId,
    });

    const { data: branches = [], isLoading: isLoadingBranches } = useBranches(
      projectId,
      { enabled: modal.visible && !!projectId }
    );

    const { data: attempts = [], isLoading: isLoadingAttempts } =
      useTaskAttempts(taskId, {
        enabled: modal.visible,
        refetchInterval: 5000,
      });

    const { data: task, isLoading: isLoadingTask } = useTask(taskId, {
      enabled: modal.visible,
    });

    const parentAttemptId = task?.parent_task_attempt ?? undefined;
    const { data: parentAttempt, isLoading: isLoadingParent } = useAttempt(
      parentAttemptId,
      { enabled: modal.visible && !!parentAttemptId }
    );

    const latestAttempt = useMemo(() => {
      if (attempts.length === 0) return null;
      return attempts.reduce((latest, attempt) =>
        new Date(attempt.created_at) > new Date(latest.created_at)
          ? attempt
          : latest
      );
    }, [attempts]);

    useEffect(() => {
      if (!modal.visible) {
        setUserSelectedProfile(null);
        setUserSelectedBranch(null);
        setCustomBranch('');
        setIncludeHistory(true);
      }
    }, [modal.visible]);

    // Pre-select the source attempt's branch when continuing
    useEffect(() => {
      if (sourceAttempt && !userSelectedBranch) {
        setUserSelectedBranch(sourceAttempt.branch);
      }
    }, [sourceAttempt, userSelectedBranch]);

    const defaultProfile: ExecutorProfileId | null = useMemo(() => {
      if (latestAttempt?.executor) {
        const lastExec = latestAttempt.executor as BaseCodingAgent;
        // If the last attempt used the same executor as the user's current preference,
        // we assume they want to use their preferred variant as well.
        // Otherwise, we default to the "default" variant (null) since we don't know
        // what variant they used last time (TaskAttempt doesn't store it).
        const variant =
          config?.executor_profile?.executor === lastExec
            ? config.executor_profile.variant
            : null;

        return {
          executor: lastExec,
          variant,
        };
      }
      return config?.executor_profile ?? null;
    }, [latestAttempt?.executor, config?.executor_profile]);

    const currentBranchName: string | null = useMemo(() => {
      return branches.find((b) => b.is_current)?.name ?? null;
    }, [branches]);

    const defaultBranch: string | null = useMemo(() => {
      return (
        parentAttempt?.branch ??
        currentBranchName ??
        latestAttempt?.target_branch ??
        null
      );
    }, [
      parentAttempt?.branch,
      currentBranchName,
      latestAttempt?.target_branch,
    ]);

    const effectiveProfile = userSelectedProfile ?? defaultProfile;
    const effectiveBranch = userSelectedBranch ?? defaultBranch;

    const isLoadingInitial =
      isLoadingBranches ||
      isLoadingAttempts ||
      isLoadingTask ||
      isLoadingParent;
    const canCreate = Boolean(
      effectiveProfile &&
      effectiveBranch &&
      !isCreating &&
      !isLoadingInitial &&
      !isLoadingHistory
    );

    const handleCreate = async () => {
      if (!effectiveProfile || !effectiveBranch) return;
      try {
        let conversationHistory: string | null = null;

        // Fetch conversation history if continuing from another attempt
        if (sourceAttemptId && includeHistory) {
          try {
            setIsLoadingHistory(true);
            const result =
              await attemptsApi.exportConversation(sourceAttemptId);
            conversationHistory = result.markdown;
          } catch (err) {
            console.error('Failed to export conversation:', err);
            // Continue without history
          } finally {
            setIsLoadingHistory(false);
          }
        }

        await createAttempt({
          profile: effectiveProfile,
          baseBranch: effectiveBranch,
          customBranch: customBranch,
          conversationHistory,
          // Use existing branch when continuing from another attempt
          useExistingBranch: !!sourceAttemptId,
        });

        modal.hide();
      } catch (err) {
        console.error('Failed to create attempt:', err);
      }
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) modal.hide();
    };

    useKeySubmitTask(handleCreate, {
      enabled: modal.visible && canCreate,
      scope: Scope.DIALOG,
      preventDefault: true,
    });

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('createAttemptDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('createAttemptDialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {profiles && (
              <div className="space-y-2">
                <ExecutorProfileSelector
                  profiles={profiles}
                  selectedProfile={effectiveProfile}
                  onProfileSelect={setUserSelectedProfile}
                  showLabel={true}
                />
              </div>
            )}

            {sourceAttemptId ? (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t('createAttemptDialog.continuingOnBranch')}
                </Label>
                <div className="text-sm text-muted-foreground font-mono bg-muted px-3 py-2 rounded">
                  {sourceAttempt?.branch ?? '...'}
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t('createAttemptDialog.baseBranch')}{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <BranchSelector
                    branches={branches}
                    selectedBranch={effectiveBranch}
                    onBranchSelect={setUserSelectedBranch}
                    placeholder={
                      isLoadingBranches
                        ? t('createAttemptDialog.loadingBranches')
                        : t('createAttemptDialog.selectBranch')
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="custom-branch"
                    className="text-sm font-medium text-muted-foreground"
                  >
                    Custom branch name (optional)
                  </Label>
                  <Input
                    id="custom-branch"
                    value={customBranch}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setCustomBranch(e.target.value)
                    }
                    placeholder="feature/my-custom-branch"
                    disabled={isCreating}
                  />
                </div>
              </>
            )}

            {sourceAttemptId && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-history"
                    checked={includeHistory}
                    onCheckedChange={(checked) =>
                      setIncludeHistory(checked === true)
                    }
                    disabled={isCreating || isLoadingHistory}
                  />
                  <Label
                    htmlFor="include-history"
                    className="text-sm font-medium cursor-pointer"
                  >
                    {t('createAttemptDialog.includeHistory')}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  {t('createAttemptDialog.includeHistoryDescription')}
                </p>
              </div>
            )}

            {error && (
              <div className="text-sm text-destructive">
                {t('createAttemptDialog.error')}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => modal.hide()}
              disabled={isCreating}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!canCreate}>
              {isLoadingHistory
                ? t('createAttemptDialog.loadingHistory')
                : isCreating
                  ? t('createAttemptDialog.creating')
                  : t('createAttemptDialog.start')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const CreateAttemptDialog = defineModal<CreateAttemptDialogProps, void>(
  CreateAttemptDialogImpl
);
