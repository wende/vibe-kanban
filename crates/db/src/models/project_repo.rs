use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::repo::Repo;

#[derive(Debug, Error)]
pub enum ProjectRepoError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Repository not found")]
    NotFound,
    #[error("Repository already exists in this project")]
    AlreadyExists,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ProjectRepo {
    pub id: Uuid,
    pub project_id: Uuid,
    pub repo_id: Uuid,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ProjectRepoWithDetails {
    pub id: Uuid,
    pub project_id: Uuid,
    pub repo_id: Uuid,
    pub name: String,
    pub path: PathBuf,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProjectRepo {
    pub name: String,
    pub git_repo_path: String,
}

impl ProjectRepo {
    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_repos
               WHERE project_id = $1"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_repos_for_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<ProjectRepoWithDetails>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepoWithDetails,
            r#"SELECT pr.id as "id!: Uuid",
                      pr.project_id as "project_id!: Uuid",
                      pr.repo_id as "repo_id!: Uuid",
                      r.name,
                      r.path,
                      pr.created_at as "created_at!: DateTime<Utc>",
                      pr.updated_at as "updated_at!: DateTime<Utc>"
               FROM project_repos pr
               JOIN repos r ON r.id = pr.repo_id
               WHERE pr.project_id = $1
               ORDER BY r.name ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project_and_repo(
        pool: &SqlitePool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_repos
               WHERE project_id = $1 AND repo_id = $2"#,
            project_id,
            repo_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn count_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!: i64" FROM project_repos WHERE project_id = $1"#,
            project_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn add_repo_to_project(
        pool: &SqlitePool,
        project_id: Uuid,
        repo_path: &str,
        repo_name: &str,
    ) -> Result<ProjectRepoWithDetails, ProjectRepoError> {
        let repo = Repo::find_or_create(pool, std::path::Path::new(repo_path), repo_name).await?;

        if Self::find_by_project_and_repo(pool, project_id, repo.id)
            .await?
            .is_some()
        {
            return Err(ProjectRepoError::AlreadyExists);
        }

        let id = Uuid::new_v4();
        let project_repo = sqlx::query_as!(
            ProjectRepo,
            r#"INSERT INTO project_repos (id, project_id, repo_id)
               VALUES ($1, $2, $3)
               RETURNING id as "id!: Uuid",
                         project_id as "project_id!: Uuid",
                         repo_id as "repo_id!: Uuid",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            project_id,
            repo.id
        )
        .fetch_one(pool)
        .await?;

        Ok(ProjectRepoWithDetails {
            id: project_repo.id,
            project_id: project_repo.project_id,
            repo_id: project_repo.repo_id,
            name: repo.name,
            path: repo.path,
            created_at: project_repo.created_at,
            updated_at: project_repo.updated_at,
        })
    }

    pub async fn remove_repo_from_project(
        pool: &SqlitePool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<(), ProjectRepoError> {
        let result = sqlx::query!(
            "DELETE FROM project_repos WHERE project_id = $1 AND repo_id = $2",
            project_id,
            repo_id
        )
        .execute(pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(ProjectRepoError::NotFound);
        }

        Ok(())
    }

    pub async fn create(
        executor: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            ProjectRepo,
            r#"INSERT INTO project_repos (id, project_id, repo_id)
               VALUES ($1, $2, $3)
               RETURNING id as "id!: Uuid",
                         project_id as "project_id!: Uuid",
                         repo_id as "repo_id!: Uuid",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            project_id,
            repo_id
        )
        .fetch_one(executor)
        .await
    }
}
