-- Add is_orchestrator flag to task_attempts table
-- Orchestrator attempts operate on the main branch without worktrees
ALTER TABLE task_attempts ADD COLUMN is_orchestrator BOOLEAN NOT NULL DEFAULT FALSE;

-- Add index for efficient lookup of orchestrator attempts by project
CREATE INDEX IF NOT EXISTS idx_task_attempts_orchestrator ON task_attempts(is_orchestrator) WHERE is_orchestrator = TRUE;
