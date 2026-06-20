use super::{MediaArtwork, MediaSnapshot};

pub fn read_media_snapshot() -> Result<MediaSnapshot, String> {
    Ok(MediaSnapshot::unsupported())
}

pub fn resolve_media_artwork(
    smtc_base64: Option<String>,
    smtc_mime: Option<String>,
    smtc_width: Option<u32>,
    smtc_height: Option<u32>,
) -> Result<MediaArtwork, String> {
    Ok(MediaArtwork {
        base64: smtc_base64,
        mime: smtc_mime,
        width: smtc_width.unwrap_or(0),
        height: smtc_height.unwrap_or(0),
        source: "unsupported".into(),
        low_res: true,
    })
}
