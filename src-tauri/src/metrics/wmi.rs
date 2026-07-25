use super::{GpuInfo, TemperatureInfo};
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(windows)]
const WMI_QUERY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

fn is_cancelled(cancelled: &AtomicBool) -> bool {
    cancelled.load(Ordering::SeqCst)
}

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
fn query_wmi_with_cancellation<T>(
    connection: &wmi::WMIConnection,
    query: &str,
    cancelled: &AtomicBool,
) -> Option<Vec<T>>
where
    T: serde::de::DeserializeOwned,
{
    use futures_util::{FutureExt, StreamExt};
    use std::thread;
    use std::time::{Duration, Instant};

    let mut stream = Box::pin(connection.exec_query_async_native_wrapper(query).ok()?);
    let mut rows = Vec::new();
    let started_at = Instant::now();

    loop {
        if is_cancelled(cancelled) {
            // Dropping the stream invokes IWbemServices::CancelAsyncCall.
            return None;
        }
        if started_at.elapsed() >= WMI_QUERY_TIMEOUT {
            return None;
        }

        match stream.as_mut().next().now_or_never() {
            Some(Some(Ok(row))) => {
                if is_cancelled(cancelled) {
                    return None;
                }
                rows.push(row.into_desr().ok()?);
            }
            Some(Some(Err(_))) => return None,
            Some(None) => return Some(rows),
            None => thread::sleep(Duration::from_millis(10)),
        }
    }
}

#[cfg(windows)]
fn read_cpu_temp_wmi(cancelled: &AtomicBool) -> Option<f32> {
    use wmi::{COMLibrary, WMIConnection};

    #[derive(serde::Deserialize)]
    #[serde(rename = "MSAcpi_ThermalZoneTemperature")]
    struct MSAcpiThermalZoneTemperature {
        #[serde(rename = "CurrentTemperature")]
        current_temperature: Option<u32>,
    }

    if is_cancelled(cancelled) {
        return None;
    }
    if let Ok(com) = COMLibrary::new() {
        if is_cancelled(cancelled) {
            return None;
        }
        if let Ok(wmi_wmi) = WMIConnection::with_namespace_path("ROOT\\WMI", com) {
            if is_cancelled(cancelled) {
                return None;
            }
            if let Some(rows) = query_wmi_with_cancellation::<MSAcpiThermalZoneTemperature>(
                &wmi_wmi,
                "SELECT * FROM MSAcpi_ThermalZoneTemperature",
                cancelled,
            ) {
                for row in rows {
                    if is_cancelled(cancelled) {
                        return None;
                    }
                    if let Some(raw) = row.current_temperature {
                        if let Some(c) = kelvin_tenths_to_celsius(raw) {
                            return Some(c);
                        }
                    }
                }
            }
        }
    }

    if is_cancelled(cancelled) {
        return None;
    }
    let com = COMLibrary::new().ok()?;
    if is_cancelled(cancelled) {
        return None;
    }
    let wmi = WMIConnection::new(com).ok()?;

    #[derive(serde::Deserialize)]
    #[serde(rename = "Win32_PerfFormattedData_Counters_ThermalZoneInformation")]
    struct Win32PerfThermalZoneInformation {
        #[serde(rename = "Temperature")]
        temperature: Option<u32>,
    }

    if is_cancelled(cancelled) {
        return None;
    }
    if let Some(rows) = query_wmi_with_cancellation::<Win32PerfThermalZoneInformation>(
        &wmi,
        "SELECT * FROM Win32_PerfFormattedData_Counters_ThermalZoneInformation",
        cancelled,
    ) {
        for row in rows {
            if is_cancelled(cancelled) {
                return None;
            }
            if let Some(raw) = row.temperature.filter(|t| *t > 0) {
                let c = if raw > 200 {
                    (raw as f32) - 273.15
                } else {
                    raw as f32
                };
                if c.is_finite() && (-40.0..=150.0).contains(&c) {
                    return Some(c);
                }
            }
        }
    }

    #[derive(serde::Deserialize)]
    #[serde(rename = "Win32_TemperatureProbe")]
    struct Win32TemperatureProbe {
        #[serde(rename = "CurrentReading")]
        current_reading: Option<i32>,
    }

    if is_cancelled(cancelled) {
        return None;
    }
    if let Some(rows) = query_wmi_with_cancellation::<Win32TemperatureProbe>(
        &wmi,
        "SELECT * FROM Win32_TemperatureProbe",
        cancelled,
    ) {
        for row in rows {
            if is_cancelled(cancelled) {
                return None;
            }
            if let Some(raw) = row.current_reading.filter(|t| *t > -400 && *t < 1500) {
                let c = raw as f32 / 10.0;
                if c.is_finite() && (-40.0..=150.0).contains(&c) {
                    return Some(c);
                }
            }
        }
    }

    None
}

#[cfg(windows)]
fn read_gpu_temp_wmi(_cancelled: &AtomicBool) -> Option<f32> {
    // Poucos PCs expõem GPU via WMI padrão; falha silenciosa.
    let _ = ();
    None
}

#[cfg(windows)]
fn read_temperatures_uncached(cancelled: &AtomicBool) -> TemperatureInfo {
    TemperatureInfo {
        cpu_celsius: read_cpu_temp_wmi(cancelled),
        gpu_celsius: read_gpu_temp_wmi(cancelled),
    }
}

#[cfg(not(windows))]
fn read_temperatures_uncached(_cancelled: &AtomicBool) -> TemperatureInfo {
    TemperatureInfo {
        cpu_celsius: None,
        gpu_celsius: None,
    }
}

pub fn read_temperatures(cancelled: &AtomicBool) -> TemperatureInfo {
    if is_cancelled(cancelled) {
        return unavailable_temperature();
    }
    let info = read_temperatures_uncached(cancelled);
    if is_cancelled(cancelled) {
        return unavailable_temperature();
    }
    info
}

fn unavailable_temperature() -> TemperatureInfo {
    TemperatureInfo {
        cpu_celsius: None,
        gpu_celsius: None,
    }
}

#[cfg(windows)]
pub fn read_gpus(cancelled: &AtomicBool) -> Vec<GpuInfo> {
    use wmi::{COMLibrary, WMIConnection};

    #[derive(serde::Deserialize)]
    #[serde(rename = "Win32_VideoController")]
    struct Win32VideoController {
        #[serde(rename = "Name")]
        name: Option<String>,
        #[serde(rename = "AdapterRAM")]
        adapter_ram: Option<u64>,
    }

    if is_cancelled(cancelled) {
        return Vec::new();
    }
    let com = match COMLibrary::new() {
        Ok(com) => com,
        Err(_) => return Vec::new(),
    };
    let connection = match WMIConnection::new(com) {
        Ok(connection) => connection,
        Err(_) => return Vec::new(),
    };

    if is_cancelled(cancelled) {
        return Vec::new();
    }
    let controllers = query_wmi_with_cancellation::<Win32VideoController>(
        &connection,
        "SELECT * FROM Win32_VideoController",
        cancelled,
    )
    .unwrap_or_default();
    if is_cancelled(cancelled) {
        return Vec::new();
    }

    controllers
        .into_iter()
        .filter_map(|controller| {
            let name = controller.name?.trim().to_string();
            if name.is_empty() || name.eq_ignore_ascii_case("Microsoft Basic Display Adapter") {
                return None;
            }
            Some(GpuInfo {
                name,
                // GPUEngine counters are per engine rather than per adapter. Reporting
                // their maximum for every adapter misrepresents multi-GPU machines.
                usage_percent: None,
                memory_total_bytes: controller.adapter_ram.filter(|value| *value > 0),
                temperature_celsius: None,
            })
        })
        .collect()
}

#[cfg(not(windows))]
pub fn read_gpus(_cancelled: &AtomicBool) -> Vec<GpuInfo> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancelled_temperature_probe_returns_without_reading() {
        let cancelled = AtomicBool::new(true);
        let temperature = read_temperatures(&cancelled);
        assert!(temperature.cpu_celsius.is_none());
        assert!(temperature.gpu_celsius.is_none());
    }
}
