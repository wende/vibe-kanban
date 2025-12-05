import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@radix-ui/react-label';
import { Textarea } from '@/components/ui/textarea.tsx';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { useCallback, useEffect, useState } from 'react';
import { attemptsApi } from '@/lib/api.ts';
import { useTranslation } from 'react-i18next';
import { FileStatusEntry } from 'shared/types';
import { Loader2, GitCommit, FileText, FilePlus, FileX, FileEdit } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useQueryClient } from '@tanstack/react-query';

interface CommitDialogProps {
  attemptId: string;
}

function getFileIcon(entry: FileStatusEntry) {
  if (entry.is_untracked) {
    return <FilePlus className="h-4 w-4 text-green-500" />;
  }
  const staged = entry.staged;
  const unstaged = entry.unstaged;

  if (staged === 'D' || unstaged === 'D') {
    return <FileX className="h-4 w-4 text-red-500" />;
  }
  if (staged === 'A') {
    return <FilePlus className="h-4 w-4 text-green-500" />;
  }
  if (staged === 'M' || unstaged === 'M') {
    return <FileEdit className="h-4 w-4 text-yellow-500" />;
  }
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function getStatusLabel(entry: FileStatusEntry): string {
  if (entry.is_untracked) return 'untracked';

  const parts: string[] = [];
  if (entry.staged !== ' ') {
    if (entry.staged === 'M') parts.push('modified (staged)');
    else if (entry.staged === 'A') parts.push('added');
    else if (entry.staged === 'D') parts.push('deleted');
    else if (entry.staged === 'R') parts.push('renamed');
  }
  if (entry.unstaged !== ' ') {
    if (entry.unstaged === 'M') parts.push('modified');
    else if (entry.unstaged === 'D') parts.push('deleted');
  }
  return parts.join(', ') || 'changed';
}

const CommitDialogImpl = NiceModal.create<CommitDialogProps>(({ attemptId }) => {
  const modal = useModal();
  const { t } = useTranslation('tasks');
  const queryClient = useQueryClient();

  const [commitMessage, setCommitMessage] = useState('');
  const [files, setFiles] = useState<FileStatusEntry[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!modal.visible) return;

    setLoading(true);
    setError(null);
    setCommitMessage('');

    attemptsApi
      .getWorktreeStatus(attemptId)
      .then((response) => {
        setFiles(response.entries);
        // Select all files by default
        setSelectedFiles(new Set(response.entries.map((e) => e.path)));
      })
      .catch((err) => {
        setError(err.message || t('commit.dialog.errors.loadFailed'));
      })
      .finally(() => setLoading(false));
  }, [modal.visible, attemptId, t]);

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.path)));
    }
  }, [selectedFiles.size, files]);

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim() || selectedFiles.size === 0) return;

    setError(null);
    setCommitting(true);

    try {
      await attemptsApi.commit(attemptId, {
        files: Array.from(selectedFiles),
        message: commitMessage.trim(),
      });

      // Invalidate branch status to reflect the new commit
      queryClient.invalidateQueries({ queryKey: ['branchStatus', attemptId] });

      modal.hide();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('commit.dialog.errors.commitFailed')
      );
    } finally {
      setCommitting(false);
    }
  }, [attemptId, commitMessage, selectedFiles, queryClient, modal, t]);

  const handleCancel = useCallback(() => {
    modal.hide();
    setCommitMessage('');
    setSelectedFiles(new Set());
  }, [modal]);

  const allSelected = files.length > 0 && selectedFiles.size === files.length;

  return (
    <Dialog open={modal.visible} onOpenChange={() => handleCancel()}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCommit className="h-5 w-5" />
            {t('commit.dialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('commit.dialog.description')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {t('commit.dialog.noChanges')}
          </div>
        ) : (
          <div className="flex-1 space-y-4 py-4 overflow-hidden flex flex-col">
            <div className="space-y-2">
              <Label htmlFor="commit-message">
                {t('commit.dialog.messageLabel')}
              </Label>
              <Textarea
                id="commit-message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder={t('commit.dialog.messagePlaceholder')}
                rows={3}
              />
            </div>

            <div className="space-y-2 flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <Label>{t('commit.dialog.filesLabel')}</Label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {allSelected
                    ? t('commit.dialog.deselectAll')
                    : t('commit.dialog.selectAll')}
                </button>
              </div>

              <div className="border rounded-md overflow-y-auto flex-1 min-h-[100px] max-h-[200px]">
                {files.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                    onClick={() => toggleFile(file.path)}
                  >
                    <Checkbox
                      checked={selectedFiles.has(file.path)}
                      onCheckedChange={() => toggleFile(file.path)}
                    />
                    {getFileIcon(file)}
                    <span className="flex-1 truncate text-sm font-mono">
                      {file.path}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getStatusLabel(file)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="text-xs text-muted-foreground">
                {t('commit.dialog.selectedCount', {
                  count: selectedFiles.size,
                  total: files.length,
                })}
              </div>
            </div>

            {error && <Alert variant="destructive">{error}</Alert>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {t('common:buttons.cancel')}
          </Button>
          <Button
            onClick={handleCommit}
            disabled={
              committing ||
              !commitMessage.trim() ||
              selectedFiles.size === 0 ||
              loading
            }
          >
            {committing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('commit.dialog.committing')}
              </>
            ) : (
              t('commit.dialog.commitButton')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const CommitDialog = defineModal<CommitDialogProps, void>(
  CommitDialogImpl
);
