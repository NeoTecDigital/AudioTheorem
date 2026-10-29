use super::{security::error, AppState};
use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use futures_util::StreamExt;

pub(super) const MAX_IMPORT: usize = 256 * 1024 * 1024;

pub(super) async fn state(State(state): State<AppState>) -> Response {
    Json(state.handle.snapshot.borrow().as_ref().clone()).into_response()
}

pub(super) async fn panic(State(state): State<AppState>) -> Response {
    state.handle.panic();
    Json(serde_json::json!({"status": "silence_requested"})).into_response()
}

pub(super) async fn not_found() -> Response {
    error(
        StatusCode::NOT_FOUND,
        "Only packaged HUD assets and documented API routes exist",
    )
}

pub(super) async fn import(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Body,
) -> Response {
    let Some(client) = import_client(&headers, &state) else {
        return error(
            StatusCode::UNAUTHORIZED,
            "An active authenticated HUD connection is required",
        );
    };
    let Ok(_permit) = state.imports.try_acquire() else {
        return error(
            StatusCode::TOO_MANY_REQUESTS,
            "Another import is decoding; try again",
        );
    };
    let bytes = match tokio::time::timeout(
        std::time::Duration::from_secs(120),
        read_upload(body, MAX_IMPORT),
    )
    .await
    {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(_)) => return error(StatusCode::PAYLOAD_TOO_LARGE, "Upload limit is 256 MiB"),
        Err(_) => return error(StatusCode::REQUEST_TIMEOUT, "Upload timed out"),
    };
    if !audio_signature(&bytes) {
        return error(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Upload WAV or FLAC content, not a path",
        );
    }
    if !state.clients.contains(client) {
        return error(StatusCode::UNAUTHORIZED, "The importing HUD disconnected");
    }
    match state.handle.import(client, bytes).await {
        Ok(asset) => Json(serde_json::json!({"asset": asset})).into_response(),
        Err(message) => error(StatusCode::UNPROCESSABLE_ENTITY, &message),
    }
}

async fn read_upload(body: Body, limit: usize) -> Result<Vec<u8>, ()> {
    let mut stream = body.into_data_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| ())?;
        if chunk.len() > limit - bytes.len() {
            return Err(());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn import_client(headers: &HeaderMap, state: &AppState) -> Option<u64> {
    let id = headers.get("x-client-id")?.to_str().ok()?.parse().ok()?;
    state.clients.contains(id).then_some(id)
}

fn audio_signature(bytes: &[u8]) -> bool {
    bytes.starts_with(b"fLaC")
        || (bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_checks_content_not_server_paths() {
        assert!(audio_signature(b"RIFF1234WAVE"));
        assert!(audio_signature(b"fLaC"));
        assert!(!audio_signature(b"/etc/passwd"));
        assert!(!audio_signature(b"RIFF"));
        assert!(!audio_signature(b"<html>"));
    }
    #[tokio::test]
    async fn streamed_import_enforces_actual_bytes_not_declared_length() {
        assert_eq!(read_upload(Body::from("1234"), 4).await.unwrap(), b"1234");
        assert!(read_upload(Body::from("12345"), 4).await.is_err());
    }
}
