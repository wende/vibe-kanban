import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  X,
  Terminal as TerminalIcon,
  ScrollText,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDevserverPreview } from '@/hooks/useDevserverPreview';
import { useDevServer } from '@/hooks/useDevServer';
import { useLogStream } from '@/hooks/useLogStream';
import { useDevserverUrlFromLogs } from '@/hooks/useDevserverUrl';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { ClickToComponentListener } from '@/utils/previewBridge';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';
import { Alert } from '@/components/ui/alert';
import { useProject } from '@/contexts/ProjectContext';
import { DevServerLogsContent } from '@/components/tasks/TaskDetails/preview/DevServerLogsView';
import { PreviewToolbar } from '@/components/tasks/TaskDetails/preview/PreviewToolbar';
import { NoServerContent } from '@/components/tasks/TaskDetails/preview/NoServerContent';
import { ReadyContent } from '@/components/tasks/TaskDetails/preview/ReadyContent';
import { Terminal } from '@/components/Terminal';
import { VerticalResizeHandle } from '@/components/common/VerticalResizeHandle';

export function PreviewPanel() {
  const [iframeError, setIframeError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadingTimeFinished, setLoadingTimeFinished] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showBottomPanel, setShowBottomPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'terminal'>('logs');
  const [bottomPanelHeight, setBottomPanelHeight] = useState(240); // 240px = h-60 in Tailwind
  const listenerRef = useRef<ClickToComponentListener | null>(null);

  const { t } = useTranslation('tasks');
  const { project, projectId } = useProject();
  const { attemptId: rawAttemptId } = useParams<{ attemptId?: string }>();

  const attemptId =
    rawAttemptId && rawAttemptId !== 'latest' ? rawAttemptId : undefined;
  const projectHasDevScript = Boolean(project?.dev_script);

  // Get attempt data for terminal working directory
  const { data: attempt } = useTaskAttempt(attemptId);

  const {
    start: startDevServer,
    stop: stopDevServer,
    isStarting: isStartingDevServer,
    isStopping: isStoppingDevServer,
    runningDevServer,
    latestDevServerProcess,
  } = useDevServer(attemptId);

  const logStream = useLogStream(latestDevServerProcess?.id ?? '');
  const lastKnownUrl = useDevserverUrlFromLogs(logStream.logs);

  const previewState = useDevserverPreview(attemptId, {
    projectHasDevScript,
    projectId: projectId!,
    lastKnownUrl,
  });

  const handleRefresh = () => {
    setIframeError(false);
    setRefreshKey((prev) => prev + 1);
  };
  const handleIframeError = () => {
    setIframeError(true);
  };

  const { addElement } = useClickedElements();

  const handleCopyUrl = async () => {
    if (previewState.url) {
      try {
        // Check if Clipboard API is available
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(previewState.url);
        } else {
          // Fallback for older browsers or non-secure contexts
          const textArea = document.createElement('textarea');
          textArea.value = previewState.url;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
          textArea.remove();
        }
      } catch (err) {
        console.warn('Copy to clipboard failed:', err);
      }
    }
  };

  useEffect(() => {
    if (previewState.status !== 'ready' || !previewState.url || !addElement) {
      return;
    }

    const listener = new ClickToComponentListener({
      onOpenInEditor: (payload) => {
        addElement(payload);
      },
      onReady: () => {
        setIsReady(true);
        setShowBottomPanel(false);
        setShowHelp(false);
      },
    });

    listener.start();
    listenerRef.current = listener;

    return () => {
      listener.stop();
      listenerRef.current = null;
    };
  }, [previewState.status, previewState.url, addElement]);

  function startTimer() {
    setLoadingTimeFinished(false);
    setTimeout(() => {
      setLoadingTimeFinished(true);
    }, 5000);
  }

  useEffect(() => {
    startTimer();
  }, []);

  useEffect(() => {
    if (
      loadingTimeFinished &&
      !isReady &&
      latestDevServerProcess &&
      runningDevServer
    ) {
      setShowHelp(true);
      setShowBottomPanel(true);
      setActiveTab('logs');
      setLoadingTimeFinished(false);
    }
  }, [loadingTimeFinished, isReady, latestDevServerProcess, runningDevServer]);

  const isPreviewReady =
    previewState.status === 'ready' &&
    Boolean(previewState.url) &&
    !iframeError;
  const mode = iframeError
    ? 'error'
    : isPreviewReady
      ? 'ready'
      : runningDevServer
        ? 'searching'
        : 'noServer';

  const toggleBottomPanel = () => {
    setShowBottomPanel((v) => !v);
  };

  const handleStartDevServer = () => {
    setLoadingTimeFinished(false);
    startDevServer();
    startTimer();
    setShowHelp(false);
    setIsReady(false);
  };

  const handleStopAndEdit = () => {
    stopDevServer(undefined, {
      onSuccess: () => {
        setShowHelp(false);
      },
    });
  };

  if (!attemptId) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">{t('preview.title')}</p>
          <p className="text-sm mt-2">{t('preview.selectAttempt')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={`flex-1 flex flex-col min-h-0`}>
        {mode === 'ready' ? (
          <>
            <PreviewToolbar
              mode={mode}
              url={previewState.url}
              onRefresh={handleRefresh}
              onCopyUrl={handleCopyUrl}
              onStop={stopDevServer}
              isStopping={isStoppingDevServer}
            />
            <ReadyContent
              url={previewState.url}
              iframeKey={`${previewState.url}-${refreshKey}`}
              onIframeError={handleIframeError}
            />
          </>
        ) : (
          <NoServerContent
            projectHasDevScript={projectHasDevScript}
            runningDevServer={runningDevServer}
            isStartingDevServer={isStartingDevServer}
            startDevServer={handleStartDevServer}
            stopDevServer={stopDevServer}
            project={project}
          />
        )}

        {showHelp && (
          <Alert variant="destructive" className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-2">
                <p className="font-bold">{t('preview.troubleAlert.title')}</p>
                <ol className="list-decimal list-inside space-y-2">
                  <li>{t('preview.troubleAlert.item1')}</li>
                  <li>
                    {t('preview.troubleAlert.item2')}{' '}
                    <code>http://localhost:3000</code>
                    {t('preview.troubleAlert.item2Suffix')}
                  </li>
                  <li>
                    {t('preview.troubleAlert.item3')}{' '}
                    <a
                      href="https://github.com/BloopAI/vibe-kanban-web-companion"
                      target="_blank"
                      className="underline font-bold"
                    >
                      {t('preview.troubleAlert.item3Link')}
                    </a>
                    .
                  </li>
                </ol>
                <Button
                  variant="destructive"
                  onClick={handleStopAndEdit}
                  disabled={isStoppingDevServer}
                >
                  {isStoppingDevServer && (
                    <Loader2 className="mr-2 animate-spin" />
                  )}
                  {t('preview.noServer.stopAndEditButton')}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHelp(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Alert>
        )}
        {/* Bottom Panel with Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'logs' | 'terminal')}
          className="border-t bg-background"
          data-resizable-container
        >
          {/* Vertical Resize Handle at top of panel */}
          {showBottomPanel && (
            <VerticalResizeHandle
              onResize={setBottomPanelHeight}
              minHeight={100}
              maxHeight={800}
            />
          )}
          {/* Single Header Bar */}
          <div className="flex items-center justify-between px-3 py-1 border-b bg-muted/50">
            <TabsList className="h-7 bg-transparent p-0 gap-1">
              <TabsTrigger
                value="logs"
                className={`gap-1.5 h-6 px-2 text-xs transition-colors ${
                  activeTab === 'logs'
                    ? 'bg-background shadow-sm text-foreground font-medium border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  if (!showBottomPanel) {
                    setShowBottomPanel(true);
                  }
                }}
              >
                <ScrollText className="h-3 w-3" />
                {t('preview.logs.title')}
              </TabsTrigger>
              <TabsTrigger
                value="terminal"
                className={`gap-1.5 h-6 px-2 text-xs transition-colors ${
                  activeTab === 'terminal'
                    ? 'bg-background shadow-sm text-foreground font-medium border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  if (!showBottomPanel) {
                    setShowBottomPanel(true);
                  }
                }}
              >
                <TerminalIcon className="h-3 w-3" />
                {t('preview.terminal.title', 'Terminal')}
              </TabsTrigger>
            </TabsList>
            <button
              onClick={toggleBottomPanel}
              className="p-1 hover:bg-muted rounded"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showBottomPanel ? '' : 'rotate-180'}`}
              />
            </button>
          </div>

          {/* Panel Content - use CSS to hide instead of unmounting */}
          <div
            className={
              showBottomPanel ? 'overflow-hidden' : 'h-0 overflow-hidden'
            }
            style={{
              position: 'relative',
              height: showBottomPanel ? `${bottomPanelHeight}px` : '0px',
            }}
          >
            <TabsContent
              value="logs"
              className="mt-0 absolute inset-0"
              forceMount
              style={{ display: activeTab === 'logs' ? 'block' : 'none' }}
            >
              <DevServerLogsContent
                processId={latestDevServerProcess?.id}
                logs={logStream.logs}
                error={logStream.error}
                className="h-full"
              />
            </TabsContent>
            <TabsContent
              value="terminal"
              className="mt-0 absolute inset-0"
              forceMount
              style={{ display: activeTab === 'terminal' ? 'block' : 'none' }}
            >
              {attempt?.container_ref ? (
                <Terminal
                  cwd={attempt.container_ref}
                  isVisible={showBottomPanel && activeTab === 'terminal'}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  {t(
                    'preview.terminal.noWorktree',
                    'No worktree available for this task'
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
