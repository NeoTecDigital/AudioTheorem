use super::security::error;
use axum::{
    extract::Path,
    http::{header::CONTENT_TYPE, StatusCode},
    response::{IntoResponse, Response},
};

pub(super) async fn index() -> Response {
    asset(
        "text/html; charset=utf-8",
        include_str!("../../web/index.html"),
    )
}

pub(super) async fn style() -> Response {
    asset("text/css; charset=utf-8", include_str!("../../web/hud.css"))
}

pub(super) async fn panels() -> Response {
    asset(
        "text/css; charset=utf-8",
        include_str!("../../web/panels.css"),
    )
}

pub(super) async fn script(Path(file): Path<String>) -> Response {
    match script_source(&file) {
        Some(source) => asset("text/javascript; charset=utf-8", source),
        None => error(StatusCode::NOT_FOUND, "No such packaged module"),
    }
}

fn asset(mime: &'static str, source: &'static str) -> Response {
    ([(CONTENT_TYPE, mime)], source).into_response()
}

fn script_source(file: &str) -> Option<&'static str> {
    Some(match file {
        "app.js" => include_str!("../../web/app.js"),
        "connection.js" => include_str!("../../web/connection.js"),
        "keyboard.js" => include_str!("../../web/keyboard.js"),
        "controls.js" => include_str!("../../web/controls.js"),
        "instrument.js" => include_str!("../../web/instrument.js"),
        "analysis.js" => include_str!("../../web/analysis.js"),
        "status.js" => include_str!("../../web/status.js"),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traversal_is_not_an_asset() {
        for path in [
            "../Cargo.toml",
            "%2e%2e/Cargo.toml",
            "/etc/passwd",
            "../../src/main.rs",
        ] {
            assert!(script_source(path).is_none());
        }
        assert!(script_source("app.js").is_some());
    }
}
