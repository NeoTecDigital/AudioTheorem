use super::AppState;
use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

pub(super) struct Clients {
    used: AtomicU32,
    generation: AtomicU64,
    identities: [AtomicU64; 32],
}

impl Default for Clients {
    fn default() -> Self {
        Self {
            used: AtomicU32::new(0),
            generation: AtomicU64::new(0),
            identities: std::array::from_fn(|_| AtomicU64::new(0)),
        }
    }
}

impl Clients {
    pub fn claim(&self) -> Option<u64> {
        let slot =
            (1..32).find(|id| self.used.fetch_or(1 << id, Ordering::AcqRel) & (1 << id) == 0)?;
        let id = self.generation.fetch_add(1, Ordering::AcqRel) * 32 + slot;
        self.identities[slot as usize].store(id, Ordering::Release);
        Some(id)
    }

    pub fn contains(&self, id: u64) -> bool {
        !id.is_multiple_of(32) && self.identities[(id % 32) as usize].load(Ordering::Acquire) == id
    }

    pub fn release(&self, id: u64) {
        let slot = (id % 32) as usize;
        if self.identities[slot]
            .compare_exchange(id, 0, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            self.used.fetch_and(!(1 << slot), Ordering::AcqRel);
        }
    }
}

pub(super) fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({"error": message}))).into_response()
}

fn exact_header(headers: &HeaderMap, name: &str, expected: &str) -> bool {
    headers.get_all(name).iter().count() == 1
        && headers.get(name).and_then(|v| v.to_str().ok()) == Some(expected)
}

pub(super) fn valid_origin(headers: &HeaderMap, origin: &str, required: bool) -> bool {
    (!required && !headers.contains_key("origin")) || exact_header(headers, "origin", origin)
}

pub(super) fn token_matches(actual: &str, expected: &str) -> bool {
    let mut difference = actual.len() ^ expected.len();
    for (a, b) in actual.bytes().zip(expected.bytes()) {
        difference |= usize::from(a ^ b);
    }
    difference == 0
}

fn authenticated(headers: &HeaderMap, expected: &str) -> bool {
    if headers.get_all("authorization").iter().count() != 1 {
        return false;
    }
    headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .is_some_and(|token| token_matches(token, expected))
}

pub(super) async fn guard(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if !exact_header(request.headers(), "host", &state.host) {
        return error(StatusCode::FORBIDDEN, "Foreign Host rejected");
    }
    let api = request.uri().path().starts_with("/api/");
    let required = request.uri().path() == "/ws";
    if !valid_origin(request.headers(), &state.origin, required) {
        return error(StatusCode::FORBIDDEN, "Foreign or missing Origin rejected");
    }
    if api && !authenticated(request.headers(), &state.token) {
        return error(StatusCode::UNAUTHORIZED, "Session authentication required");
    }
    secure_headers(next.run(request).await)
}

fn secure_headers(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert("cache-control", "no-store".parse().unwrap());
    headers.insert("referrer-policy", "no-referrer".parse().unwrap());
    headers.insert("x-content-type-options", "nosniff".parse().unwrap());
    headers.insert("x-frame-options", "DENY".parse().unwrap());
    headers.insert(
        "content-security-policy",
        concat!(
            "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; ",
            "img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        )
        .parse()
        .unwrap(),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origins_and_duplicate_host_are_exact() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "127.0.0.1:8080".parse().unwrap());
        headers.insert("origin", "http://evil.invalid".parse().unwrap());
        assert!(!valid_origin(&headers, "http://127.0.0.1:8080", true));
        headers.insert("origin", "http://127.0.0.1:8080".parse().unwrap());
        assert!(valid_origin(&headers, "http://127.0.0.1:8080", true));
        headers.append("host", "localhost:8080".parse().unwrap());
        assert!(!exact_header(&headers, "host", "127.0.0.1:8080"));
        headers.remove("origin");
        assert!(!valid_origin(&headers, "http://127.0.0.1:8080", true));
    }

    #[test]
    fn credentials_require_exact_bearer() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer secret".parse().unwrap());
        assert!(authenticated(&headers, "secret"));
        assert!(!authenticated(&headers, "secre"));
        assert!(!token_matches("secret\0", "secret"));
        headers.append("authorization", "Bearer secret".parse().unwrap());
        assert!(!authenticated(&headers, "secret"));
    }

    #[test]
    fn bounded_client_slots_never_claim_native() {
        let clients = Clients::default();
        let ids: Vec<_> = (1..32).map(|_| clients.claim().unwrap()).collect();
        assert!(ids.iter().all(|id| !id.is_multiple_of(32)));
        assert_eq!(clients.claim(), None);
        assert!(!clients.contains(0));
        assert!(!clients.contains(32));
        clients.release(ids[11]);
        let replacement = clients.claim().unwrap();
        assert_eq!(replacement % 32, ids[11] % 32);
        assert!(replacement > ids[11]);
        clients.release(ids[11]);
        assert!(clients.contains(replacement));
    }
}
