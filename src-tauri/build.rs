fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["get_api_key", "set_api_key"]),
        ),
    )
    .expect("failed to run tauri-build");
}
