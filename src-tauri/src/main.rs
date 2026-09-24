use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

struct BridgeProcess(Mutex<Option<Child>>);

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let bridge_token = Uuid::new_v4().simple().to_string();
            let (bridge, port) = start_bridge(bridge_entry()?, &bridge_token)
                .map_err(|error| std::io::Error::other(format!("failed to start node bridge: {error}")))?;
            app.manage(BridgeProcess(Mutex::new(Some(bridge))));
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App(format!("index.html?bridge={port}&token={bridge_token}").into()),
            )
            .title("需求审查")
            .inner_size(1100.0, 760.0)
            .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building pm-review");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(mut child) = handle
                .state::<BridgeProcess>()
                .0
                .lock()
                .expect("bridge lock poisoned")
                .take()
            {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}

fn app_resources_dir() -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    let resources = executable.parent()?.parent()?.join("Resources");
    resources
        .join("dist/bridge/server.js")
        .is_file()
        .then_some(resources)
}

fn bridge_entry() -> Result<PathBuf, std::io::Error> {
    if let Some(resources) = app_resources_dir() {
        return Ok(resources.join("dist/bridge/server.js"));
    }
    std::env::var("PM_REVIEW_BRIDGE_ENTRY")
        .map(PathBuf::from)
        .map_err(|_| std::io::Error::other("PM_REVIEW_BRIDGE_ENTRY is not configured"))
}

fn node_program() -> PathBuf {
    if let Some(resources) = app_resources_dir() {
        let bundled = resources.join("node/bin/node");
        if bundled.is_file() {
            return bundled;
        }
    }
    PathBuf::from("node")
}

fn start_bridge(entry: PathBuf, bridge_token: &str) -> Result<(Child, u16), String> {
    let node = node_program();
    let mut child = Command::new(&node)
        .arg(&entry)
        .env("PM_REVIEW_BRIDGE_TOKEN", bridge_token)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| error.to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "node bridge stdout is unavailable".to_string())?;
    let mut line = String::new();
    BufReader::new(stdout)
        .read_line(&mut line)
        .map_err(|error| error.to_string())?;
    let port = line
        .trim()
        .parse::<u16>()
        .map_err(|_| format!("node bridge returned an invalid port: {line}"))?;
    Ok((child, port))
}
