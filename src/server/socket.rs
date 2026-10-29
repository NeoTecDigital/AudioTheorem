use super::{
    security::{error, token_matches},
    AppState,
};
use crate::contracts::{Action, Command};
use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    http::StatusCode,
    response::Response,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use tokio::time::{timeout, Instant};

const COMMAND_LIMIT: usize = 16 * 1024;

struct Lease {
    state: AppState,
    client: u64,
}

impl Drop for Lease {
    fn drop(&mut self) {
        self.state.handle.disconnect(self.client);
        self.state.clients.release(self.client);
    }
}

pub(super) async fn upgrade(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    let Some(client) = state.clients.claim() else {
        return error(StatusCode::TOO_MANY_REQUESTS, "Maximum 31 HUD connections");
    };
    let lease = Lease { state, client };
    ws.max_message_size(COMMAND_LIMIT)
        .max_frame_size(COMMAND_LIMIT)
        .max_write_buffer_size(2 * 1024 * 1024)
        .on_upgrade(move |socket| run(socket, lease))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Authentication {
    #[serde(rename = "type")]
    kind: String,
    token: String,
}

async fn authenticate(socket: &mut WebSocket, expected: &str) -> bool {
    let received = timeout(Duration::from_secs(3), socket.recv()).await;
    let Ok(Some(Ok(Message::Text(text)))) = received else {
        return false;
    };
    if text.len() > 512 {
        return false;
    }
    let Ok(auth) = serde_json::from_str::<Authentication>(&text) else {
        return false;
    };
    auth.kind == "auth" && token_matches(&auth.token, expected)
}

async fn send(socket: &mut WebSocket, value: Value) -> Result<(), ()> {
    timeout(
        Duration::from_secs(2),
        socket.send(Message::Text(value.to_string())),
    )
    .await
    .map_err(|_| ())?
    .map_err(|_| ())
}

async fn run(mut socket: WebSocket, lease: Lease) {
    if !authenticate(&mut socket, &lease.state.token).await {
        let _ = send(
            &mut socket,
            json!({"type":"error","error":"Authentication failed"}),
        )
        .await;
        return;
    }
    let hello = json!({"type":"hello", "version":1, "client":lease.client});
    if send(&mut socket, hello).await.is_err() {
        return;
    }
    let _ = session(&mut socket, &lease).await;
}

async fn session(socket: &mut WebSocket, lease: &Lease) -> Result<(), ()> {
    let mut snapshots = lease.state.handle.snapshot.clone();
    let mut shutdown = lease.state.shutdown.clone();
    let mut cadence = tokio::time::interval(Duration::from_millis(33));
    cadence.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut rate = Rate::new();
    let first = snapshots.borrow_and_update().as_ref().clone();
    send(socket, json!({"type":"snapshot", "state":first})).await?;
    loop {
        tokio::select! {
            _ = shutdown.changed() => return Ok(()),
            _ = cadence.tick() => {
                if !snapshots.has_changed().unwrap_or(false) { continue; }
                let state = snapshots.borrow_and_update().as_ref().clone();
                send(socket, json!({"type":"snapshot", "state":state})).await?;
            }
            message = socket.recv() => {
                let Some(Ok(message)) = message else { return Ok(()); };
                if !receive(socket, message, lease, &mut rate).await? { return Ok(()); }
            }
        }
    }
}

async fn receive(
    socket: &mut WebSocket,
    message: Message,
    lease: &Lease,
    rate: &mut Rate,
) -> Result<bool, ()> {
    match message {
        Message::Text(text) => {
            let result = dispatch(&text, lease, rate).await;
            send(socket, result).await?;
        }
        Message::Close(_) => return Ok(false),
        Message::Binary(_) => {
            send(
                socket,
                json!({"type":"error","error":"Commands must be JSON text"}),
            )
            .await?
        }
        _ => {}
    }
    Ok(true)
}

async fn dispatch(text: &str, lease: &Lease, rate: &mut Rate) -> Value {
    if text.len() > COMMAND_LIMIT {
        return json!({"type":"error","error":"Command rate or size limit exceeded"});
    }
    let command = match serde_json::from_str::<Command>(text) {
        Ok(command) => command,
        Err(err) => return json!({"type":"error","error":format!("Invalid command: {err}")}),
    };
    let id = command.id;
    if !rate.allow() && !matches!(command.action, Action::Release { .. } | Action::Panic) {
        return json!({"type":"error","id":id,"error":"Command rate limit exceeded"});
    }
    let future = lease.state.handle.command(lease.client, command);
    match timeout(Duration::from_secs(2), future).await {
        Ok(Ok(ack)) => json!({"type":"ack", "ack":ack}),
        Ok(Err(error)) => json!({"type":"error", "id":id, "error":error}),
        Err(_) => {
            json!({"type":"error", "id":id, "error":"Acknowledgement timed out; consult current state before retrying"})
        }
    }
}

struct Rate {
    start: Instant,
    count: u32,
}

impl Rate {
    fn new() -> Self {
        Self {
            start: Instant::now(),
            count: 0,
        }
    }

    fn allow(&mut self) -> bool {
        if self.start.elapsed() >= Duration::from_secs(1) {
            self.start = Instant::now();
            self.count = 0;
        }
        self.count += 1;
        self.count <= 240
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limit_is_bounded() {
        let mut rate = Rate::new();
        for _ in 0..240 {
            assert!(rate.allow());
        }
        assert!(!rate.allow());
    }
}
