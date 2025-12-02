use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum RepoError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Repository not found")]
    NotFound,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Repo {
    pub id: Uuid,
    pub path: PathBuf,
    pub name: String,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

impl Repo {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT id as "id!: Uuid",
                      path,
                      name,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM repos
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_path(pool: &SqlitePool, path: &Path) -> Result<Option<Self>, sqlx::Error> {
        let path_str = path.to_string_lossy();
        sqlx::query_as!(
            Repo,
            r#"SELECT id as "id!: Uuid",
                      path,
                      name,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM repos
               WHERE path = $1"#,
            path_str
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_or_create<'e, E>(
        executor: E,
        path: &Path,
        name: &str,
    ) -> Result<Self, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let path_str = path.to_string_lossy().to_string();
        let id = Uuid::new_v4();

        // Use INSERT OR IGNORE + SELECT to handle race conditions atomically
        sqlx::query_as!(
            Repo,
            r#"INSERT INTO repos (id, path, name)
               VALUES ($1, $2, $3)
               ON CONFLICT(path) DO UPDATE SET updated_at = updated_at
               RETURNING id as "id!: Uuid",
                         path,
                         name,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            path_str,
            name
        )
        .fetch_one(executor)
        .await
    }

    pub async fn all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT id as "id!: Uuid",
                      path,
                      name,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM repos
               ORDER BY name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT r.id as "id!: Uuid",
                      r.path,
                      r.name,
                      r.created_at as "created_at!: DateTime<Utc>",
                      r.updated_at as "updated_at!: DateTime<Utc>"
               FROM repos r
               JOIN project_repos pr ON r.id = pr.repo_id
               WHERE pr.project_id = $1
               ORDER BY r.name ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }
}
