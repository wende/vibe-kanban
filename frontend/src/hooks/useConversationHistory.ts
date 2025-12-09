// useConversationHistory.ts
import {
  CommandExitStatus,
  ExecutionProcess,
  ExecutionProcessStatus,
  ExecutorAction,
  NormalizedEntry,
  PatchType,
  TaskAttempt,
  ToolStatus,
} from 'shared/types';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { streamJsonPatchEntries } from '@/utils/streamJsonPatchEntries';

// Module-level cache for historical execution process entries
// This allows instant reopening of already-viewed executions
// Key format: `${attemptId}:${executionProcessId}` to prevent cross-attempt leakage
const historicalEntriesCache = new Map<string, PatchType[]>();

// Helper to create cache key scoped by attempt
const makeCacheKey = (attemptId: string, executionProcessId: string) =>
  `${attemptId}:${executionProcessId}`;

export type PatchTypeWithKey = PatchType & {
  patchKey: string;
  executionProcessId: string;
};

export type AddEntryType = 'initial' | 'running' | 'historic';

export type OnEntriesUpdated = (
  newEntries: PatchTypeWithKey[],
  addType: AddEntryType,
  loading: boolean
) => void;

type ExecutionProcessStaticInfo = {
  id: string;
  created_at: string;
  updated_at: string;
  executor_action: ExecutorAction;
};

type ExecutionProcessState = {
  executionProcess: ExecutionProcessStaticInfo;
  entries: PatchTypeWithKey[];
};

type ExecutionProcessStateStore = Record<string, ExecutionProcessState>;

interface UseConversationHistoryParams {
  attempt: TaskAttempt;
  onEntriesUpdated: OnEntriesUpdated;
}

interface UseConversationHistoryResult {}

const makeLoadingPatch = (executionProcessId: string): PatchTypeWithKey => ({
  type: 'NORMALIZED_ENTRY',
  content: {
    entry_type: {
      type: 'loading',
    },
    content: '',
    timestamp: null,
  },
  patchKey: `${executionProcessId}:loading`,
  executionProcessId,
});

const nextActionPatch: (
  failed: boolean,
  execution_processes: number,
  needs_setup: boolean,
  setup_help_text?: string
) => PatchTypeWithKey = (
  failed,
  execution_processes,
  needs_setup,
  setup_help_text
) => ({
  type: 'NORMALIZED_ENTRY',
  content: {
    entry_type: {
      type: 'next_action',
      failed: failed,
      execution_processes: execution_processes,
      needs_setup: needs_setup,
      setup_help_text: setup_help_text ?? null,
    },
    content: '',
    timestamp: null,
  },
  patchKey: 'next_action',
  executionProcessId: '',
});

export const useConversationHistory = ({
  attempt,
  onEntriesUpdated,
}: UseConversationHistoryParams): UseConversationHistoryResult => {
  const { executionProcessesVisible: executionProcessesRaw } =
    useExecutionProcessesContext();

  // CRITICAL: Filter execution processes to only those belonging to the current attempt
  // This prevents showing data from Card A when viewing Card B during transitions
  // when the WebSocket stream hasn't yet delivered the new attempt's processes
  const executionProcessesForAttempt = useMemo(
    () => executionProcessesRaw.filter((ep) => ep.task_attempt_id === attempt.id),
    [executionProcessesRaw, attempt.id]
  );

  const executionProcesses = useRef<ExecutionProcess[]>(executionProcessesForAttempt);
  const displayedExecutionProcesses = useRef<ExecutionProcessStateStore>({});
  const loadedInitialEntries = useRef(false);
  const streamingProcessIdsRef = useRef<Set<string>>(new Set());
  const onEntriesUpdatedRef = useRef<OnEntriesUpdated | null>(null);
  // Track the current attempt ID to prevent stale callbacks from affecting new attempts
  const currentAttemptIdRef = useRef<string>(attempt.id);
  // Track active WebSocket controller to close it when switching attempts
  const activeStreamControllerRef = useRef<{ close: () => void } | null>(null);
  // Track the last active process ID to prevent duplicate streams
  const lastActiveProcessId = useRef<string | null>(null);

  const mergeIntoDisplayed = (
    mutator: (state: ExecutionProcessStateStore) => void
  ) => {
    const state = displayedExecutionProcesses.current;
    mutator(state);
  };
  useEffect(() => {
    onEntriesUpdatedRef.current = onEntriesUpdated;
  }, [onEntriesUpdated]);

  // Keep executionProcesses up to date - only include processes for current attempt
  useEffect(() => {
    executionProcesses.current = executionProcessesForAttempt.filter(
      (ep) =>
        ep.run_reason === 'setupscript' ||
        ep.run_reason === 'cleanupscript' ||
        ep.run_reason === 'codingagent'
    );
  }, [executionProcessesForAttempt]);

  const loadEntriesForHistoricExecutionProcess = (
    executionProcess: ExecutionProcess,
    attemptId: string
  ): Promise<PatchType[]> => {
    // Check cache first for instant reopening (scoped by attempt ID)
    const cacheKey = makeCacheKey(attemptId, executionProcess.id);
    const cached = historicalEntriesCache.get(cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    let url = '';
    if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
      url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
    } else {
      url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
    }

    return new Promise<PatchType[]>((resolve) => {
      const controller = streamJsonPatchEntries<PatchType>(url, {
        onFinished: (allEntries) => {
          controller.close();
          // Cache the result for future reopens (scoped by attempt ID)
          historicalEntriesCache.set(cacheKey, allEntries);
          resolve(allEntries);
        },
        onError: (err) => {
          console.warn(
            `Error loading entries for historic execution process ${executionProcess.id}`,
            err
          );
          controller.close();
          resolve([]);
        },
      });
    });
  };

  const getLiveExecutionProcess = (
    executionProcessId: string
  ): ExecutionProcess | undefined => {
    return executionProcesses?.current.find(
      (executionProcess) => executionProcess.id === executionProcessId
    );
  };

  const patchWithKey = (
    patch: PatchType,
    executionProcessId: string,
    index: number | 'user'
  ) => {
    return {
      ...patch,
      patchKey: `${executionProcessId}:${index}`,
      executionProcessId,
    };
  };

  const getActiveAgentProcesses = (): ExecutionProcess[] => {
    return (
      executionProcesses?.current.filter(
        (p) =>
          p.status === ExecutionProcessStatus.running &&
          p.run_reason !== 'devserver'
      ) ?? []
    );
  };

  const flattenEntriesForEmit = useCallback(
    (executionProcessState: ExecutionProcessStateStore): PatchTypeWithKey[] => {
      // Flags to control Next Action bar emit
      let hasPendingApproval = false;
      let hasRunningProcess = false;
      let lastProcessFailedOrKilled = false;
      let needsSetup = false;
      let setupHelpText: string | undefined;

      // Create user messages + tool calls for setup/cleanup scripts
      const allEntries = Object.values(executionProcessState)
        .sort(
          (a, b) =>
            new Date(
              a.executionProcess.created_at as unknown as string
            ).getTime() -
            new Date(
              b.executionProcess.created_at as unknown as string
            ).getTime()
        )
        .flatMap((p, index) => {
          const entries: PatchTypeWithKey[] = [];
          if (
            p.executionProcess.executor_action.typ.type ===
              'CodingAgentInitialRequest' ||
            p.executionProcess.executor_action.typ.type ===
              'CodingAgentFollowUpRequest'
          ) {
            // New user message
            const userNormalizedEntry: NormalizedEntry = {
              entry_type: {
                type: 'user_message',
              },
              content: p.executionProcess.executor_action.typ.prompt,
              timestamp: null,
            };
            const userPatch: PatchType = {
              type: 'NORMALIZED_ENTRY',
              content: userNormalizedEntry,
            };
            const userPatchTypeWithKey = patchWithKey(
              userPatch,
              p.executionProcess.id,
              'user'
            );
            entries.push(userPatchTypeWithKey);

            // Remove all coding agent added user messages, replace with our custom one
            const entriesExcludingUser = p.entries.filter(
              (e) =>
                e.type !== 'NORMALIZED_ENTRY' ||
                e.content.entry_type.type !== 'user_message'
            );

            const hasPendingApprovalEntry = entriesExcludingUser.some(
              (entry) => {
                if (entry.type !== 'NORMALIZED_ENTRY') return false;
                const entryType = entry.content.entry_type;
                return (
                  entryType.type === 'tool_use' &&
                  entryType.status.status === 'pending_approval'
                );
              }
            );

            if (hasPendingApprovalEntry) {
              hasPendingApproval = true;
            }

            entries.push(...entriesExcludingUser);

            const liveProcessStatus = getLiveExecutionProcess(
              p.executionProcess.id
            )?.status;
            const isProcessRunning =
              liveProcessStatus === ExecutionProcessStatus.running;
            const processFailedOrKilled =
              liveProcessStatus === ExecutionProcessStatus.failed ||
              liveProcessStatus === ExecutionProcessStatus.killed;

            if (isProcessRunning) {
              hasRunningProcess = true;
            }

            if (
              processFailedOrKilled &&
              index === Object.keys(executionProcessState).length - 1
            ) {
              lastProcessFailedOrKilled = true;

              // Check if this failed process has a SetupRequired entry
              const hasSetupRequired = entriesExcludingUser.some((entry) => {
                if (entry.type !== 'NORMALIZED_ENTRY') return false;
                if (
                  entry.content.entry_type.type === 'error_message' &&
                  entry.content.entry_type.error_type.type === 'setup_required'
                ) {
                  setupHelpText = entry.content.content;
                  return true;
                }
                return false;
              });

              if (hasSetupRequired) {
                needsSetup = true;
              }
            }

            if (isProcessRunning && !hasPendingApprovalEntry) {
              entries.push(makeLoadingPatch(p.executionProcess.id));
            }
          } else if (
            p.executionProcess.executor_action.typ.type === 'ScriptRequest'
          ) {
            // Add setup and cleanup script as a tool call
            let toolName = '';
            switch (p.executionProcess.executor_action.typ.context) {
              case 'SetupScript':
                toolName = 'Setup Script';
                break;
              case 'CleanupScript':
                toolName = 'Cleanup Script';
                break;
              case 'ToolInstallScript':
                toolName = 'Tool Install Script';
                break;
              default:
                return [];
            }

            const executionProcess = getLiveExecutionProcess(
              p.executionProcess.id
            );

            if (executionProcess?.status === ExecutionProcessStatus.running) {
              hasRunningProcess = true;
            }

            if (
              (executionProcess?.status === ExecutionProcessStatus.failed ||
                executionProcess?.status === ExecutionProcessStatus.killed) &&
              index === Object.keys(executionProcessState).length - 1
            ) {
              lastProcessFailedOrKilled = true;
            }

            const exitCode = Number(executionProcess?.exit_code) || 0;
            const exit_status: CommandExitStatus | null =
              executionProcess?.status === 'running'
                ? null
                : {
                    type: 'exit_code',
                    code: exitCode,
                  };

            const toolStatus: ToolStatus =
              executionProcess?.status === ExecutionProcessStatus.running
                ? { status: 'created' }
                : exitCode === 0
                  ? { status: 'success' }
                  : { status: 'failed' };

            const output = p.entries.map((line) => line.content).join('\n');

            const toolNormalizedEntry: NormalizedEntry = {
              entry_type: {
                type: 'tool_use',
                tool_name: toolName,
                action_type: {
                  action: 'command_run',
                  command: p.executionProcess.executor_action.typ.script,
                  result: {
                    output,
                    exit_status,
                  },
                },
                status: toolStatus,
              },
              content: toolName,
              timestamp: null,
            };
            const toolPatch: PatchType = {
              type: 'NORMALIZED_ENTRY',
              content: toolNormalizedEntry,
            };
            const toolPatchWithKey: PatchTypeWithKey = patchWithKey(
              toolPatch,
              p.executionProcess.id,
              0
            );

            entries.push(toolPatchWithKey);
          }

          return entries;
        });

      // Emit the next action bar if no process running
      if (!hasRunningProcess && !hasPendingApproval) {
        allEntries.push(
          nextActionPatch(
            lastProcessFailedOrKilled,
            Object.keys(executionProcessState).length,
            needsSetup,
            setupHelpText
          )
        );
      }

      return allEntries;
    },
    []
  );

  const emitEntries = useCallback(
    (
      executionProcessState: ExecutionProcessStateStore,
      addEntryType: AddEntryType,
      loading: boolean
    ) => {
      const entries = flattenEntriesForEmit(executionProcessState);
      onEntriesUpdatedRef.current?.(entries, addEntryType, loading);
    },
    [flattenEntriesForEmit]
  );

  // This emits its own events as they are streamed
  const loadRunningAndEmit = useCallback(
    (
      executionProcess: ExecutionProcess,
      attemptIdAtCallTime: string
    ): Promise<void> => {
      // Close any existing stream before starting a new one
      if (activeStreamControllerRef.current) {
        activeStreamControllerRef.current.close();
        activeStreamControllerRef.current = null;
      }

      return new Promise((resolve, reject) => {
        let url = '';
        if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
          url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
        } else {
          url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
        }
        const controller = streamJsonPatchEntries<PatchType>(url, {
          onEntries(entries) {
            // Check if the attempt has changed - if so, ignore this update
            if (currentAttemptIdRef.current !== attemptIdAtCallTime) {
              return;
            }
            const patchesWithKey = entries.map((entry, index) =>
              patchWithKey(entry, executionProcess.id, index)
            );
            mergeIntoDisplayed((state) => {
              state[executionProcess.id] = {
                executionProcess,
                entries: patchesWithKey,
              };
            });
            emitEntries(displayedExecutionProcesses.current, 'running', false);
          },
          onFinished: () => {
            // Check if the attempt has changed before emitting
            if (currentAttemptIdRef.current === attemptIdAtCallTime) {
              emitEntries(
                displayedExecutionProcesses.current,
                'running',
                false
              );
            }
            controller.close();
            if (activeStreamControllerRef.current === controller) {
              activeStreamControllerRef.current = null;
            }
            resolve();
          },
          onError: () => {
            controller.close();
            if (activeStreamControllerRef.current === controller) {
              activeStreamControllerRef.current = null;
            }
            reject();
          },
        });
        // Store the controller so it can be closed when attempt changes
        activeStreamControllerRef.current = controller;
      });
    },
    [emitEntries]
  );

  // Sometimes it can take a few seconds for the stream to start, wrap the loadRunningAndEmit method
  const loadRunningAndEmitWithBackoff = useCallback(
    async (executionProcess: ExecutionProcess, attemptIdAtCallTime: string) => {
      for (let i = 0; i < 20; i++) {
        // Check if attempt has changed before each retry
        if (currentAttemptIdRef.current !== attemptIdAtCallTime) {
          return;
        }
        try {
          await loadRunningAndEmit(executionProcess, attemptIdAtCallTime);
          break;
        } catch (_) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    },
    [loadRunningAndEmit]
  );

  const loadInitialEntries = useCallback(
    async (attemptId: string): Promise<ExecutionProcessStateStore> => {
      const localDisplayedExecutionProcesses: ExecutionProcessStateStore = {};

      if (!executionProcesses?.current) return localDisplayedExecutionProcesses;

      // Get all non-running processes (these are historical)
      const historicProcesses = executionProcesses.current.filter(
        (ep) => ep.status !== ExecutionProcessStatus.running
      );

      // Load all historic processes in parallel for faster loading
      const results = await Promise.all(
        historicProcesses.map(async (ep) => {
          const entries = await loadEntriesForHistoricExecutionProcess(
            ep,
            attemptId
          );
          return { ep, entries };
        })
      );

      // Build the state store from results (preserving original order)
      for (const { ep, entries } of results) {
        const entriesWithKey = entries.map((e, idx) =>
          patchWithKey(e, ep.id, idx)
        );
        localDisplayedExecutionProcesses[ep.id] = {
          executionProcess: ep,
          entries: entriesWithKey,
        };
      }

      return localDisplayedExecutionProcesses;
    },
    [executionProcesses]
  );

  const ensureProcessVisible = useCallback((p: ExecutionProcess) => {
    mergeIntoDisplayed((state) => {
      if (!state[p.id]) {
        state[p.id] = {
          executionProcess: {
            id: p.id,
            created_at: p.created_at,
            updated_at: p.updated_at,
            executor_action: p.executor_action,
          },
          entries: [],
        };
      }
    });
  }, []);

  // Use filtered processes for keys to ensure we only react to changes for current attempt
  const idListKey = useMemo(
    () => executionProcessesForAttempt?.map((p) => p.id).join(','),
    [executionProcessesForAttempt]
  );

  const idStatusKey = useMemo(
    () => executionProcessesForAttempt?.map((p) => `${p.id}:${p.status}`).join(','),
    [executionProcessesForAttempt]
  );

  // Initial load when attempt changes
  useEffect(() => {
    let cancelled = false;
    const attemptIdAtCallTime = attempt.id;
    (async () => {
      // Waiting for execution processes to load
      if (
        executionProcesses?.current.length === 0 ||
        loadedInitialEntries.current
      )
        return;

      // Load all historic entries in parallel (cached entries return instantly)
      const allInitialEntries = await loadInitialEntries(attemptIdAtCallTime);
      // Verify attempt hasn't changed during async load
      if (cancelled || currentAttemptIdRef.current !== attemptIdAtCallTime)
        return;
      mergeIntoDisplayed((state) => {
        Object.assign(state, allInitialEntries);
      });
      emitEntries(displayedExecutionProcesses.current, 'initial', false);
      loadedInitialEntries.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt.id, idListKey, loadInitialEntries, emitEntries]); // include idListKey so new processes trigger reload

  useEffect(() => {
    // Skip if we haven't loaded initial entries yet - this prevents race conditions
    // where we might emit entries from stale execution processes during attempt transitions
    if (!loadedInitialEntries.current) return;

    const activeProcesses = getActiveAgentProcesses();
    if (activeProcesses.length === 0) return;

    for (const activeProcess of activeProcesses) {
      // No need to verify task_attempt_id here since executionProcesses.current
      // is already filtered to only include processes for the current attempt

      if (!displayedExecutionProcesses.current[activeProcess.id]) {
        const runningOrInitial =
          Object.keys(displayedExecutionProcesses.current).length > 1
            ? 'running'
            : 'initial';
        ensureProcessVisible(activeProcess);
        emitEntries(
          displayedExecutionProcesses.current,
          runningOrInitial,
          false
        );
      }

      if (
        activeProcess.status === ExecutionProcessStatus.running &&
        lastActiveProcessId.current !== activeProcess.id
      ) {
        lastActiveProcessId.current = activeProcess.id;
        // Pass current attempt ID to detect if attempt changes during streaming
        loadRunningAndEmitWithBackoff(activeProcess, attempt.id);
      }
    }
  }, [
    attempt.id,
    idStatusKey,
    emitEntries,
    ensureProcessVisible,
    loadRunningAndEmitWithBackoff,
  ]);

  // If an execution process is removed, remove it from the state
  useEffect(() => {
    if (!executionProcessesForAttempt) return;

    const removedProcessIds = Object.keys(
      displayedExecutionProcesses.current
    ).filter((id) => !executionProcessesForAttempt.some((p) => p.id === id));

    if (removedProcessIds.length > 0) {
      mergeIntoDisplayed((state) => {
        removedProcessIds.forEach((id) => {
          delete state[id];
        });
      });
    }
  }, [attempt.id, idListKey, executionProcessesForAttempt]);

  // Reset state when attempt changes - but don't emit immediately to avoid flicker
  // The initial load effect will emit once data is ready
  const prevAttemptIdForResetRef = useRef<string | null>(null);
  useEffect(() => {
    // Update the current attempt ID ref immediately - this is critical for preventing
    // stale callbacks from affecting the new attempt
    currentAttemptIdRef.current = attempt.id;

    // Only reset if this is an actual attempt change (not initial mount)
    if (
      prevAttemptIdForResetRef.current !== null &&
      prevAttemptIdForResetRef.current !== attempt.id
    ) {
      // Close any active stream from the previous attempt
      if (activeStreamControllerRef.current) {
        activeStreamControllerRef.current.close();
        activeStreamControllerRef.current = null;
      }
      // Note: We do NOT clear the historicalEntriesCache here - it's keyed by attemptId
      // so each attempt has its own cache entries. Keeping the cache allows instant
      // reopening when switching back to a previously viewed card.
      displayedExecutionProcesses.current = {};
      loadedInitialEntries.current = false;
      lastActiveProcessId.current = null;
      streamingProcessIdsRef.current.clear();
      // Don't emit here - let the initial load effect handle it to avoid flicker
      // The old content stays visible until new content is ready
    }
    prevAttemptIdForResetRef.current = attempt.id;
  }, [attempt.id]);

  return {};
};
