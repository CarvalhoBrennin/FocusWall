#[cfg(windows)]
use log::{info, warn};

#[cfg(windows)]
// Tauri v2 serves bundled Windows assets from this origin by default. Keep the
// fallback aligned with the actual WebView origin so YouTube can identify the
// embed instead of receiving the application identifier as a fake domain.
const YOUTUBE_PLAYER_REFERER: &str = "http://tauri.localhost/";

#[cfg(windows)]
const YOUTUBE_FILTERS: [&str; 2] = [
    "https://www.youtube.com/*",
    "https://www.youtube-nocookie.com/*",
];

#[cfg(windows)]
pub fn install_youtube_player_identity<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    window
        .with_webview(|platform| {
            if let Err(error) = configure_webview2(platform) {
                warn!("Could not configure YouTube player client identity: {error}");
            }
        })
        .map_err(|error| format!("Could not access WebView2: {error}"))?;

    Ok(())
}

#[cfg(windows)]
fn configure_webview2(platform: tauri::webview::PlatformWebview) -> windows_core::Result<()> {
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
        WebResourceRequestedEventHandler,
    };
    use windows_core::HSTRING;

    let controller = platform.controller();
    let webview = unsafe { controller.CoreWebView2()? };

    for filter in YOUTUBE_FILTERS {
        let filter = HSTRING::from(filter);
        unsafe {
            webview
                .AddWebResourceRequestedFilter(&filter, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)?;
        }
    }

    let referer = String::from(YOUTUBE_PLAYER_REFERER);
    let handler = WebResourceRequestedEventHandler::create(Box::new(move |_sender, args| {
        if let Some(args) = args {
            unsafe {
                let request = args.Request()?;
                let headers = request.Headers()?;
                let name = HSTRING::from("Referer");
                let mut has_referer = std::mem::MaybeUninit::uninit();
                headers.Contains(&name, has_referer.as_mut_ptr())?;
                let has_referer = has_referer.assume_init();

                // Preserve the real dev-server referrer when WebView2 already
                // supplied it. Packaged builds need the Tauri localhost origin
                // because custom-protocol pages do not always emit a referrer.
                if !has_referer.as_bool() {
                    let value = HSTRING::from(referer.as_str());
                    headers.SetHeader(&name, &value)?;
                }
            }
        }
        Ok(())
    }));

    let mut token = 0;
    unsafe {
        webview.add_WebResourceRequested(&handler, &mut token)?;
    }

    info!("YouTube embedded-player client identity configured for WebView2.");
    Ok(())
}

#[cfg(not(windows))]
pub fn install_youtube_player_identity<R: tauri::Runtime>(
    _window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    Ok(())
}
