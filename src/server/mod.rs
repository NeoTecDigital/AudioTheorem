//! Packaged, authenticated loopback HUD. No arbitrary filesystem route or CORS.
mod assets;
mod http;
mod security;
mod socket;

use crate::runtime::Handle;
use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use security::Clients;
use std::sync::Arc;
use tokio::sync::{watch, Semaphore};

#[derive(Clone)]
struct AppState {
    pub handle: Handle,
    pub token: Arc<str>,
    pub host: Arc<str>,
    pub origin: Arc<str>,
    pub clients: Arc<Clients>,
    pub imports: Arc<Semaphore>,
    pub shutdown: watch::Receiver<bool>,
}

pub async fn serve(
    listener: tokio::net::TcpListener,
    handle: Handle,
    token: String,
    shutdown: watch::Receiver<bool>,
) -> Result<(), String> {
    let address = listener.local_addr().map_err(|e| e.to_string())?;
    if !address.ip().is_loopback() || token.len() < 32 {
        return Err("HUD requires a loopback address and a strong session token".into());
    }
    let host = address.to_string();
    let state = AppState {
        handle,
        token: token.into(),
        origin: format!("http://{host}").into(),
        host: host.into(),
        clients: Arc::new(Clients::default()),
        imports: Arc::new(Semaphore::new(1)),
        shutdown: shutdown.clone(),
    };
    axum::serve(listener, router(state))
        .with_graceful_shutdown(wait_shutdown(shutdown))
        .await
        .map_err(|e| e.to_string())
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/", get(assets::index))
        .route("/hud.css", get(assets::style))
        .route("/panels.css", get(assets::panels))
        .route("/js/:file", get(assets::script))
        .route("/api/state", get(http::state))
        .route("/api/import", post(http::import))
        .route("/api/panic", post(http::panic))
        .route("/ws", get(socket::upgrade))
        .fallback(http::not_found)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            security::guard,
        ))
        .with_state(state)
}

async fn wait_shutdown(mut shutdown: watch::Receiver<bool>) {
    while !*shutdown.borrow_and_update() {
        if shutdown.changed().await.is_err() {
            break;
        }
    }
}

#[cfg(test)]
mod tests;
