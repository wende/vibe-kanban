use std::{
    collections::HashMap,
    io::{Read, Write},
    path::PathBuf,
    sync::Arc,
};

use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use thiserror::Error;
use tokio::sync::Mutex;
use uuid::Uuid;

const DEFAULT_SHELL: &str = "/bin/bash";
const TERM_ENV: &str = "xterm-256color";

#[derive(Debug, Error)]
pub enum TerminalError {
    #[error("PTY error: {0}")]
    Pty(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Session not found: {0}")]
    SessionNotFound(Uuid),

    #[error("Spawn task panicked: {0}")]
    SpawnTaskPanic(String),
}

impl From<anyhow::Error> for TerminalError {
    fn from(err: anyhow::Error) -> Self {
        Self::Pty(err.to_string())
    }
}

pub struct SpawnedSession {
    pub id: Uuid,
    pub reader: Box<dyn Read + Send>,
    pub writer: Box<dyn Write + Send>,
}

struct Session {
    master: Box<dyn MasterPty + Send>,
}

impl Session {
    fn new(master: Box<dyn MasterPty + Send>) -> Self {
        Self { master }
    }

    fn resize(&self, size: PtySize) -> Result<(), TerminalError> {
        self.master.resize(size)?;
        Ok(())
    }
}

type SessionMap = HashMap<Uuid, Session>;

#[derive(Clone, Default)]
pub struct TerminalService {
    sessions: Arc<Mutex<SessionMap>>,
}

impl TerminalService {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn spawn_session(
        &self,
        cols: u16,
        rows: u16,
        cwd: Option<PathBuf>,
    ) -> Result<SpawnedSession, TerminalError> {
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let (master, reader, writer) = tokio::task::spawn_blocking(move || spawn_pty(size, cwd))
            .await
            .map_err(|e| TerminalError::SpawnTaskPanic(e.to_string()))??;

        let session_id = Uuid::new_v4();
        self.sessions
            .lock()
            .await
            .insert(session_id, Session::new(master));

        tracing::info!(session_id = %session_id, "Spawned terminal session");

        Ok(SpawnedSession {
            id: session_id,
            reader,
            writer,
        })
    }

    pub async fn resize(
        &self,
        session_id: &Uuid,
        cols: u16,
        rows: u16,
    ) -> Result<(), TerminalError> {
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let sessions = self.sessions.lock().await;
        if let Some(session) = sessions.get(session_id) {
            session.resize(size)?;
            tracing::debug!(session_id = %session_id, cols, rows, "Resized terminal");
        }
        Ok(())
    }

    pub async fn kill_session(&self, session_id: &Uuid) -> Result<(), TerminalError> {
        if self.sessions.lock().await.remove(session_id).is_some() {
            tracing::info!(session_id = %session_id, "Killed terminal session");
        }
        Ok(())
    }
}

fn spawn_pty(
    size: PtySize,
    cwd: Option<PathBuf>,
) -> Result<
    (
        Box<dyn MasterPty + Send>,
        Box<dyn Read + Send>,
        Box<dyn Write + Send>,
    ),
    TerminalError,
> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(size)?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| DEFAULT_SHELL.to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", TERM_ENV);

    if let Some(cwd) = cwd {
        cmd.cwd(cwd);
    }

    let _child = pair.slave.spawn_command(cmd)?;
    let reader = pair.master.try_clone_reader()?;
    let writer = pair.master.take_writer()?;

    Ok((pair.master, reader, writer))
}
