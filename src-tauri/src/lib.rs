mod placement;
#[cfg(target_os = "linux")]
mod speech;
mod translate;

use placement::{edge_rect, Rect, WindowMode};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow, WindowEvent};
use translate::{CommandError, TranslateRequest, Translation};

struct TranslationService {
    client: reqwest::Client,
    endpoint: Option<&'static str>,
}

#[derive(Default)]
struct PendingPlacement(Mutex<Option<Rect>>);

fn supports_floating() -> bool {
    !cfg!(target_os = "linux") || (
        std::env::var("XDG_SESSION_TYPE").ok().as_deref() != Some("wayland")
        && std::env::var_os("WAYLAND_DISPLAY").is_none()
    )
}

#[tauri::command]
fn floating_enabled() -> bool {
    supports_floating()
}

fn apply_mode(window: &WebviewWindow, mode: WindowMode) -> tauri::Result<()> {
    if !supports_floating() {
        return Ok(());
    }
    let monitor = window.current_monitor().ok().flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or(tauri::Error::WindowNotFound)?;
    let area = monitor.work_area();
    let rect = edge_rect(Rect {
        x: area.position.x,
        y: area.position.y,
        width: area.size.width,
        height: area.size.height,
    }, monitor.scale_factor(), mode);
    window.set_decorations(false)?;
    let pending = window.state::<PendingPlacement>();
    *pending.0.lock().unwrap() = Some(rect);
    window.set_size(PhysicalSize::new(rect.width, rect.height))?;
    window.set_position(PhysicalPosition::new(rect.x, rect.y))?;
    window.set_always_on_top(mode != WindowMode::Expanded)?;
    Ok(())
}

#[tauri::command]
fn set_window_mode(window: WebviewWindow, mode: WindowMode) -> Result<(), CommandError> {
    if apply_mode(&window, mode).is_err() {
        *window.state::<PendingPlacement>().0.lock().unwrap() = None;
        let _ = window.set_decorations(false);
        let _ = window.set_always_on_top(false);
        let _ = window.set_size(tauri::LogicalSize::new(420, 660));
        return Err(translate::unavailable());
    }
    if mode != WindowMode::Collapsed {
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn quit(window: WebviewWindow) -> Result<(), CommandError> {
    window.close().map_err(|_| translate::unavailable())
}

#[tauri::command]
async fn translate(request: TranslateRequest, service: State<'_, TranslationService>) -> Result<Translation, CommandError> {
    let endpoint = service.endpoint.ok_or_else(translate::unavailable)?;
    translate::send(&service.client, endpoint, request).await
}

#[tauri::command]
async fn synthesize_speech(text: String, language: String) -> Result<tauri::ipc::Response, CommandError> {
    #[cfg(target_os = "linux")]
    {
        let wav = tauri::async_runtime::spawn_blocking(move || speech::synthesize(&text, &language))
            .await
            .map_err(|_| translate::unavailable())?
            .map_err(|_| translate::unavailable())?;
        Ok(tauri::ipc::Response::new(wav))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (text, language);
        Err(translate::unavailable())
    }
}

pub fn run() {
    let endpoint = option_env!("TRANSLATION_ENDPOINT")
        .filter(|url| url.starts_with("https://") || cfg!(debug_assertions) && url.starts_with("http://127.0.0.1:"))
        .or(if cfg!(debug_assertions) { Some("http://127.0.0.1:8787/v1/translate") } else { None });
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(PendingPlacement::default())
        .manage(TranslationService { client: translate::client(Duration::from_secs(15)).expect("HTTP client"), endpoint })
        .on_window_event(|window, event| {
            if let WindowEvent::Resized(size) = event {
                let state = window.state::<PendingPlacement>();
                let mut pending = state.0.lock().unwrap();
                if pending.is_some_and(|rect| rect.width == size.width && rect.height == size.height) {
                    let rect = pending.take().unwrap();
                    drop(pending);
                    let _ = window.set_position(PhysicalPosition::new(rect.x, rect.y));
                }
            }
        })
        .invoke_handler(tauri::generate_handler![floating_enabled, set_window_mode, quit, translate, synthesize_speech])
        .run(tauri::generate_context!())
        .expect("Unable to start Yizhou");
}
