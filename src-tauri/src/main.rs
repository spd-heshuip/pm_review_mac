fn key_args(subcommand: &str, extra: &[&str]) -> Vec<String> {
    let mut args = vec![
        subcommand.into(),
        "-a".into(),
        "pm-review".into(),
        "-s".into(),
        "cursor-api-key".into(),
    ];
    args.extend(extra.iter().map(|item| (*item).to_string()));
    args
}

fn security(args: &[String]) -> Result<std::process::Output, String> {
    std::process::Command::new("security")
        .args(args)
        .output()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_api_key() -> Result<Option<String>, String> {
    let output = security(&key_args("find-generic-password", &["-w"]))?;
    if !output.status.success() {
        return Ok(None);
    }
    let key = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if key.is_empty() { None } else { Some(key) })
}

#[tauri::command]
fn set_api_key(key: String) -> Result<(), String> {
    let mut args = key_args("add-generic-password", &["-w"]);
    args.push(key);
    args.push("-U".into());
    let output = security(&args)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_api_key, set_api_key])
        .run(tauri::generate_context!())
        .expect("error while running pm-review");
}
