use super::*;
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;

const TOKEN: &str = "0123456789abcdef0123456789abcdef";

fn application(handle: Handle) -> Router {
    let (_, shutdown) = watch::channel(false);
    router(AppState {
        handle,
        token: TOKEN.into(),
        host: "127.0.0.1:8080".into(),
        origin: "http://127.0.0.1:8080".into(),
        clients: Arc::new(Clients::default()),
        imports: Arc::new(Semaphore::new(1)),
        shutdown,
    })
}

fn request(path: &str, host: &str, origin: Option<&str>, auth: bool) -> Request<Body> {
    let mut builder = Request::builder().uri(path).header("Host", host);
    if let Some(value) = origin {
        builder = builder.header("Origin", value);
    }
    if auth {
        builder = builder.header("Authorization", format!("Bearer {TOKEN}"));
    }
    builder.body(Body::empty()).unwrap()
}

type Case = (
    &'static str,
    &'static str,
    Option<&'static str>,
    bool,
    StatusCode,
);

fn http_cases() -> Vec<Case> {
    use StatusCode as S;
    vec![
        ("/", "127.0.0.1:8080", None, false, S::OK),
        ("/", "localhost:8080", None, false, S::FORBIDDEN),
        ("/api/state", "127.0.0.1:8080", None, false, S::UNAUTHORIZED),
        ("/api/state", "127.0.0.1:8080", None, true, S::OK),
        ("/ws", "127.0.0.1:8080", None, false, S::FORBIDDEN),
    ]
}

fn rejection_cases() -> Vec<Case> {
    use StatusCode as S;
    vec![
        (
            "/ws",
            "127.0.0.1:8080",
            Some("http://foreign.invalid"),
            false,
            S::FORBIDDEN,
        ),
        (
            "/api/state",
            "127.0.0.1:8080",
            Some("null"),
            true,
            S::FORBIDDEN,
        ),
        (
            "/cloudcanvas/../../Cargo.toml",
            "127.0.0.1:8080",
            None,
            false,
            S::NOT_FOUND,
        ),
        (
            "/js/%2e%2e%2fCargo.toml",
            "127.0.0.1:8080",
            None,
            false,
            S::NOT_FOUND,
        ),
    ]
}

#[tokio::test(flavor = "current_thread")]
async fn router_enforces_auth_host_origin_and_traversal() {
    let mut runtime = crate::runtime::start(true).unwrap();
    let app = application(runtime.handle.clone());
    for (path, host, origin, auth, status) in http_cases().into_iter().chain(rejection_cases()) {
        let response = app
            .clone()
            .oneshot(request(path, host, origin, auth))
            .await
            .unwrap();
        assert_eq!(response.status(), status, "{path} {host} {origin:?}");
    }
    runtime.shutdown();
}

#[tokio::test(flavor = "current_thread")]
async fn packaged_assets_have_security_headers_and_no_filesystem_dependency() {
    let mut runtime = crate::runtime::start(true).unwrap();
    let app = application(runtime.handle.clone());
    for path in ["/", "/hud.css", "/panels.css", "/js/app.js"] {
        let response = app
            .clone()
            .oneshot(request(path, "127.0.0.1:8080", None, false))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["x-content-type-options"], "nosniff");
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert!(response.headers()["content-security-policy"]
            .to_str()
            .unwrap()
            .contains("frame-ancestors 'none'"));
    }
    runtime.shutdown();
}

#[tokio::test(flavor = "current_thread")]
async fn import_requires_current_socket_lease_before_consuming_body() {
    let mut runtime = crate::runtime::start(true).unwrap();
    let app = application(runtime.handle.clone());
    let request = Request::builder()
        .uri("/api/import")
        .method("POST")
        .header("Host", "127.0.0.1:8080")
        .header("Authorization", format!("Bearer {TOKEN}"))
        .header("X-Client-Id", "1")
        .body(Body::from("/etc/passwd"))
        .unwrap();
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    runtime.shutdown();
}
