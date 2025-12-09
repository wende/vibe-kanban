-- Store finalized normalized entries for faster conversation loading
-- Instead of re-normalizing raw stdout chunks on every load,
-- we snapshot the final NormalizedEntry objects when execution completes.

CREATE TABLE execution_process_normalized_entries (
    execution_id    BLOB NOT NULL,
    entry_index     INTEGER NOT NULL,
    entry_json      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    PRIMARY KEY (execution_id, entry_index),
    FOREIGN KEY (execution_id) REFERENCES execution_processes(id) ON DELETE CASCADE
);

CREATE INDEX idx_normalized_entries_execution_id
    ON execution_process_normalized_entries(execution_id);
