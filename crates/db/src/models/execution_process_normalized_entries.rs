use chrono::{DateTime, Utc};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

/// Stores finalized NormalizedEntry objects for fast conversation loading.
/// Instead of re-normalizing raw stdout chunks on every load, we snapshot
/// the final entries when execution completes.
#[derive(Debug, Clone, FromRow)]
pub struct ExecutionProcessNormalizedEntry {
    pub execution_id: Uuid,
    pub entry_index: i64,
    pub entry_json: String,
    pub created_at: DateTime<Utc>,
}

impl ExecutionProcessNormalizedEntry {
    /// Find all normalized entries for an execution process, ordered by index
    pub async fn find_by_execution_id(
        pool: &SqlitePool,
        execution_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExecutionProcessNormalizedEntry,
            r#"SELECT
                execution_id as "execution_id!: Uuid",
                entry_index,
                entry_json,
                created_at as "created_at!: DateTime<Utc>"
               FROM execution_process_normalized_entries
               WHERE execution_id = $1
               ORDER BY entry_index ASC"#,
            execution_id
        )
        .fetch_all(pool)
        .await
    }

    /// Insert a batch of normalized entries for an execution process.
    /// entries is a slice of (entry_index, entry_json) tuples.
    pub async fn insert_batch(
        pool: &SqlitePool,
        execution_id: Uuid,
        entries: &[(usize, String)],
    ) -> Result<(), sqlx::Error> {
        if entries.is_empty() {
            return Ok(());
        }

        // Use a transaction for batch insert
        let mut tx = pool.begin().await?;

        for (entry_index, entry_json) in entries {
            let entry_index = *entry_index as i64;
            sqlx::query!(
                r#"INSERT INTO execution_process_normalized_entries
                   (execution_id, entry_index, entry_json, created_at)
                   VALUES ($1, $2, $3, datetime('now', 'subsec'))"#,
                execution_id,
                entry_index,
                entry_json
            )
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }
}
