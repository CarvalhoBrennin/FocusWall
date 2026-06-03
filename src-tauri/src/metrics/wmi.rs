use super::TemperatureInfo;
use log::warn;
use std::sync::Mutex;
use std::time::{Duration, Instant};

static TEMP_CACHE: Mutex<Option<(Instant, TemperatureInfo)>> = Mutex::new(None);
const TEMP_CACHE_TTL: Duration = Duration::from_secs(30);

#[cfg(windows)]
fn kelvin_tenths_to_celsius(raw: u32) -> Option<f32> {
    if raw == 0 {
        return None;
    }
    let c = (raw as f32 / 10.0) - 273.15;
    if c.is_finite() && (-40.0..=150.0).contains(&c) {
        Some(c)
    } else {
        None
    }
}

#[cfg(windows)]
fn read_cpu_temp_wmi() -> Option<f32> {
    use wmi::{COMLibrary, WMIConnection};

    let com = COMLibrary::new().ok()?;
    let wmi = WMIConnection::new(com).ok()?;

    #[derive(serde::Deserialize)]
    struct ThermalZone {
        #[serde(rename = "CurrentTemperature")]
        current_temperature: Option<u32>,
    }

    if let Ok(rows) = wmi.query::<ThermalZone>() {
        for row in rows {
            if let Some(raw) = row.current_temperature {
                if let Some(c) = kelvin_tenths_to_celsius(raw) {
                    return Some(c);
                }
            }
        }
    }

    if let Ok(com_wmi) = COMLibrary::new() {
        if let Ok(wmi_wmi) = WMIConnection::with_namespace_path("ROOT\\WMI", com_wmi) {
            if let Ok(rows) = wmi_wmi.query::<ThermalZone>() {
                for row in rows {
                    if let Some(raw) = row.current_temperature {
                        if let Some(c) = kelvin_tenths_to_celsius(raw) {
                            return Some(c);
                        }
                    }
                }
            }
        }
    }

    #[derive(serde::Deserialize)]
    struct PerfThermal {
        #[serde(rename = "Temperature")]
        temperature: Option<u32>,
    }

    if let Ok(rows) = wmi.query::<PerfThermal>() {
        for row in rows {
            if let Some(c) = row.temperature.filter(|t| *t > 0 && *t < 200) {
                return Some(c as f32);
            }
        }
    }

    #[derive(serde::Deserialize)]
    struct TemperatureProbe {
        #[serde(rename = "CurrentReading")]
        current_reading: Option<i32>,
    }

    if let Ok(rows) = wmi.query::<TemperatureProbe>() {
        for row in rows {
            if let Some(c) = row
                .current_reading
                .filter(|t| *t > -40 && *t < 150)
            {
                return Some(c as f32);
            }
        }
    }

    None
}

#[cfg(windows)]
fn read_gpu_temp_wmi() -> Option<f32> {
    // Poucos PCs expõem GPU via WMI padrão; falha silenciosa.
    let _ = ();
    None
}

#[cfg(windows)]
fn read_temperatures_uncached() -> TemperatureInfo {
    TemperatureInfo {
        cpu_celsius: read_cpu_temp_wmi(),
        gpu_celsius: read_gpu_temp_wmi(),
    }
}

#[cfg(not(windows))]
fn read_temperatures_uncached() -> TemperatureInfo {
    TemperatureInfo {
        cpu_celsius: None,
        gpu_celsius: None,
    }
}

pub fn read_temperatures_cached() -> TemperatureInfo {
    let now = Instant::now();
    if let Ok(mut guard) = TEMP_CACHE.lock() {
        if let Some((ts, info)) = guard.as_ref() {
            if now.duration_since(*ts) < TEMP_CACHE_TTL {
                return info.clone();
            }
        }

        let info = read_temperatures_uncached();
        *guard = Some((now, info.clone()));
        return info;
    }

    warn!("Temperature cache mutex poisoned; reading uncached");
    read_temperatures_uncached()
}
