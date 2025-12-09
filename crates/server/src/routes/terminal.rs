use std::{
    io::{Read, Write},
    path::PathBuf,
};

use axum::{
    Router,
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
use deployment::Deployment;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;

use crate::DeploymentImpl;

#[derive(Deserialize)]
pub struct TerminalQuery {
    cols: Option<u16>,
    rows: Option<u16>,
    cwd: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum ControlMessage {
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
}

pub async fn terminal_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TerminalQuery>,
) -> impl IntoResponse {
    tracing::info!(
        "Terminal WebSocket connection requested: cols={:?}, rows={:?}, cwd={:?}",
        query.cols,
        query.rows,
        query.cwd
    );
    ws.on_upgrade(move |socket| handle_terminal_ws(socket, deployment, query))
}

async fn handle_terminal_ws(socket: WebSocket, deployment: DeploymentImpl, query: TerminalQuery) {
    let cols = query.cols.unwrap_or(80);
    let rows = query.rows.unwrap_or(24);
    let cwd = query.cwd.map(PathBuf::from);

    // Spawn PTY session - now returns the session with reader/writer directly
    let spawned = match deployment.terminal().spawn_session(cols, rows, cwd).await {
        Ok(session) => session,
        Err(e) => {
            tracing::error!("Failed to spawn terminal: {}", e);
            return;
        }
    };

    let session_id = spawned.id;
    let pty_reader = spawned.reader;
    let pty_writer = spawned.writer;

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Channel for PTY output → WebSocket
    let (pty_tx, mut pty_rx) = mpsc::channel::<Vec<u8>>(32);

    // Spawn blocking task to read from PTY
    let pty_reader_handle = tokio::task::spawn_blocking(move || {
        let mut reader = pty_reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    if pty_tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break; // Channel closed
                    }
                }
                Err(e) => {
                    tracing::debug!("PTY read error: {}", e);
                    break;
                }
            }
        }
    });

    // Task to forward PTY output to WebSocket
    let pty_to_ws = async {
        while let Some(data) = pty_rx.recv().await {
            tracing::debug!("Sending {} bytes to WebSocket", data.len());
            if ws_sender.send(Message::Binary(data.into())).await.is_err() {
                tracing::debug!("WebSocket send failed");
                break;
            }
        }
    };

    // Task to forward WebSocket input to PTY and handle control messages
    let terminal_service = deployment.terminal().clone();
    let ws_to_pty = async move {
        let mut writer = pty_writer;
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Binary(data) => {
                    // Raw terminal input
                    if writer.write_all(&data).is_err() {
                        break;
                    }
                    if writer.flush().is_err() {
                        break;
                    }
                }
                Message::Text(text) => {
                    // Control messages (JSON)
                    if let Ok(ctrl) = serde_json::from_str::<ControlMessage>(&text) {
                        match ctrl {
                            ControlMessage::Resize { cols, rows } => {
                                let _ = terminal_service.resize(&session_id, cols, rows).await;
                            }
                        }
                    } else {
                        // Treat as raw input if not valid JSON control message
                        if writer.write_all(text.as_bytes()).is_err() {
                            break;
                        }
                        if writer.flush().is_err() {
                            break;
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    };

    // Wait for either direction to complete
    tokio::select! {
        _ = pty_to_ws => {}
        _ = ws_to_pty => {}
    }

    // Cleanup
    pty_reader_handle.abort();
    let _ = deployment.terminal().kill_session(&session_id).await;
    tracing::debug!("Terminal session {} cleaned up", session_id);
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new().route("/terminal/ws", get(terminal_ws))
}
