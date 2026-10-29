use nova_daw::{runtime, server};
use rand::RngCore;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::watch;

struct Options {
    port: u16,
    headless: bool,
    browser: bool,
    seconds: Option<f64>,
}

fn options() -> Result<Options, String> {
    let mut args = std::env::args().skip(1);
    let mut result = Options {
        port: 8080,
        headless: false,
        browser: true,
        seconds: None,
    };
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--port" => {
                result.port = args
                    .next()
                    .ok_or("--port requires value")?
                    .parse()
                    .map_err(|_| "invalid port")?
            }
            "--headless" => result.headless = true,
            "--no-browser" => result.browser = false,
            "--seconds" => {
                let seconds: f64 = args
                    .next()
                    .ok_or("--seconds requires value")?
                    .parse()
                    .map_err(|_| "invalid seconds")?;
                if !seconds.is_finite() || !(0.01..=86400.0).contains(&seconds) {
                    return Err("seconds must be 0.01..86400".into());
                }
                result.seconds = Some(seconds);
            }
            "--help" => {
                println!("nova-daw [--port 8080] [--headless] [--no-browser] [--seconds N]");
                std::process::exit(0);
            }
            _ => return Err(format!("unknown option: {arg}")),
        }
    }
    Ok(result)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let options = options()?;
    let executor = tokio::runtime::Runtime::new()?;
    let mut engine = runtime::start(options.headless)?;
    let (shutdown, receive) = watch::channel(false);
    let listener = executor.block_on(tokio::net::TcpListener::bind((
        std::net::Ipv4Addr::LOCALHOST,
        options.port,
    )))?;
    let port = listener.local_addr()?.port();
    let token = token();
    let url = format!("http://127.0.0.1:{port}/#token={token}");
    let handle = engine.handle.clone();
    let stop = shutdown.clone();
    let server = executor.spawn(async move {
        let result = server::serve(listener, handle, token, receive).await;
        if let Err(e) = &result {
            eprintln!("Control server: {e}");
        }
        stop.send_replace(true);
        result
    });
    install_signal(&executor, shutdown.clone());
    println!("Harmonic Instrument · {url}");
    println!("Audio: {}", engine.handle.snapshot.borrow().device.name);
    if options.browser {
        open_browser(&url);
    }
    let result = run(&options, &mut engine, &shutdown);
    shutdown.send_replace(true);
    engine.shutdown();
    let _ = executor.block_on(server)?;
    result.map_err(Into::into)
}

fn run(
    options: &Options,
    engine: &mut runtime::Runtime,
    shutdown: &watch::Sender<bool>,
) -> Result<(), String> {
    let mut visualizer = visualizer(options.headless)?;
    let start = Instant::now();
    let mut input = nova_daw::native_input::Controller::new(engine.handle.clone());
    let mut next = Instant::now();
    while !*shutdown.borrow() {
        if options
            .seconds
            .is_some_and(|s| start.elapsed().as_secs_f64() >= s)
        {
            break;
        }
        // Virtual clock is explicit, frame-counted and never connected to audio output.
        if options.headless {
            engine.tick_virtual(768);
        }
        let snapshot = Arc::clone(&engine.handle.snapshot.borrow());
        if let Some(viz) = visualizer.as_mut() {
            if !viz.frame(&snapshot, &mut input)? {
                break;
            }
        }
        next += Duration::from_millis(16);
        std::thread::sleep(next.saturating_duration_since(Instant::now()));
        if next.elapsed() > Duration::from_millis(100) {
            next = Instant::now();
        }
    }
    Ok(())
}

fn visualizer(headless: bool) -> Result<Option<nova_daw::visualizer::Visualizer>, String> {
    if headless {
        Ok(None)
    } else {
        nova_daw::visualizer::Visualizer::new(1280, 720).map(Some)
    }
}

fn token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn open_browser(url: &str) {
    if let Err(e) = std::process::Command::new("xdg-open").arg(url).spawn() {
        eprintln!("Open the HUD URL manually: {e}");
    }
}
fn install_signal(executor: &tokio::runtime::Runtime, shutdown: watch::Sender<bool>) {
    executor.spawn(async move {
        let _ = tokio::signal::ctrl_c().await;
        shutdown.send_replace(true);
    });
}
