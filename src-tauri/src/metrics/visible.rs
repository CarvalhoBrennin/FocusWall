#[cfg(windows)]
use std::collections::HashSet;

#[cfg(windows)]
pub fn visible_window_pids() -> HashSet<u32> {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible,
    };

    let mut out = HashSet::new();

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let pids = &mut *(lparam.0 as *mut HashSet<u32>);
        if IsWindowVisible(hwnd).as_bool() {
            let mut pid = 0u32;
            let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid != 0 {
                pids.insert(pid);
            }
        }
        BOOL::from(true)
    }

    let lparam = LPARAM(&mut out as *mut HashSet<u32> as isize);
    let ok = unsafe { EnumWindows(Some(enum_proc), lparam) };
    if ok.is_err() {
        return HashSet::new();
    }

    out
}

#[cfg(not(windows))]
pub fn visible_window_pids() -> std::collections::HashSet<u32> {
    std::collections::HashSet::new()
}
