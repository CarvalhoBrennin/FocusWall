//! Parser streaming de RSS 2.0, Atom e RDF.
//!
//! Segurança: DTD é rejeitada (bloqueia XXE e billion-laughs), entidades
//! externas nunca são resolvidas, e há teto para bytes, eventos, profundidade,
//! número de entradas e tamanho de cada campo. Nenhum HTML sai daqui — todo
//! texto passa por [`super::text::html_to_text`].

use super::{
    super::{
        config,
        error::{ProviderError, ProviderErrorKind},
        models::clean_text,
        sources::NewsProviderDefinition,
    },
    text, MediaCandidate, MediaOrigin, RawArticle,
};
use chrono::{DateTime, Utc};
use quick_xml::{
    events::{BytesCData, BytesRef, BytesStart, BytesText, Event},
    Reader,
};

// ---------------------------------------------------------------------------
// Estruturas internas de captura
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
struct RawEntry {
    title: String,
    guid: String,
    text_link: String,
    links: Vec<RawLink>,
    published: String,
    updated: String,
    description: String,
    content_encoded: String,
    author: String,
    categories: Vec<String>,
    media: Vec<MediaCandidate>,
}

#[derive(Debug)]
struct RawLink {
    href: String,
    relation: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Field {
    Title,
    Link,
    Guid,
    Published,
    Updated,
    Description,
    ContentEncoded,
    Author,
    Category,
}

#[derive(Debug)]
struct Capture {
    field: Field,
    depth: usize,
    end_name: Vec<u8>,
    buffer: String,
}

fn local_name(name: &[u8]) -> Vec<u8> {
    name.rsplit(|byte| *byte == b':')
        .next()
        .unwrap_or(name)
        .iter()
        .map(|byte| byte.to_ascii_lowercase())
        .collect()
}

/// Prefixo do namespace (`media` em `media:content`), em minúsculas.
fn namespace_prefix(name: &[u8]) -> Vec<u8> {
    match name.iter().position(|byte| *byte == b':') {
        Some(position) => name[..position]
            .iter()
            .map(u8::to_ascii_lowercase)
            .collect(),
        None => Vec::new(),
    }
}

fn decode_text(event: &BytesText<'_>) -> Result<String, ProviderError> {
    // Não usamos `unescape` do quick-xml aqui: a decodificação de entidades
    // acontece uma única vez, em `html_to_text`, para que markup escapado não
    // possa ressurgir depois da remoção de tags.
    event
        .decode()
        .map(|value| value.into_owned())
        .map_err(|_| ProviderError::new(ProviderErrorKind::Parse))
}

fn decode_cdata(event: &BytesCData<'_>) -> Result<String, ProviderError> {
    event
        .decode()
        .map(|value| value.into_owned())
        .map_err(|_| ProviderError::new(ProviderErrorKind::Parse))
}

/// Referências são reemitidas na forma textual para que a decodificação ocorra
/// numa etapa só. Entidades desconhecidas não são resolvidas.
fn decode_reference(event: &BytesRef<'_>) -> Result<String, ProviderError> {
    let name = event
        .decode()
        .map_err(|_| ProviderError::new(ProviderErrorKind::Parse))?;
    if name.chars().count() > 12 {
        return Err(ProviderError::new(ProviderErrorKind::Validation));
    }
    Ok(format!("&{name};"))
}

fn attribute_value(
    element: &BytesStart<'_>,
    expected: &[u8],
) -> Result<Option<String>, ProviderError> {
    for attribute in element.attributes() {
        let attribute = attribute.map_err(|_| ProviderError::new(ProviderErrorKind::Parse))?;
        if local_name(attribute.key.as_ref()) == expected {
            let value = attribute
                .decode_and_unescape_value(element.decoder())
                .map_err(|_| ProviderError::new(ProviderErrorKind::Parse))?;
            return Ok(Some(value.into_owned()));
        }
    }
    Ok(None)
}

fn parse_declared_width(value: Option<String>) -> Option<u32> {
    value?.parse::<u32>().ok().filter(|width| *width > 0)
}

/// Extrai candidato de mídia de `media:content`, `media:thumbnail` ou
/// `enclosure`, aceitando apenas o que se declara como imagem.
fn media_candidate(
    element: &BytesStart<'_>,
    name: &[u8],
    prefix: &[u8],
) -> Result<Option<MediaCandidate>, ProviderError> {
    let origin = match (prefix, name) {
        (b"media", b"content") => MediaOrigin::MediaContent,
        (b"media", b"thumbnail") => MediaOrigin::MediaThumbnail,
        (_, b"enclosure") => MediaOrigin::Enclosure,
        _ => return Ok(None),
    };

    let Some(url) = attribute_value(element, b"url")? else {
        return Ok(None);
    };

    // `media:content` também transporta vídeo e áudio; exigimos tipo de imagem.
    if origin != MediaOrigin::MediaThumbnail {
        let declared_type = attribute_value(element, b"type")?.unwrap_or_default();
        let medium = attribute_value(element, b"medium")?.unwrap_or_default();
        let is_image = declared_type.to_ascii_lowercase().starts_with("image/")
            || medium.eq_ignore_ascii_case("image");
        if !is_image {
            return Ok(None);
        }
    }

    Ok(Some(MediaCandidate {
        url,
        origin,
        declared_width: parse_declared_width(attribute_value(element, b"width")?),
    }))
}

/// Atom declara categorias em atributos (`<category term="x" label="X"/>`),
/// enquanto RSS as coloca no texto do elemento. Devolve `Some` apenas para a
/// forma atributiva; a textual continua sendo capturada pelo fluxo normal.
fn category_from_attributes(element: &BytesStart<'_>) -> Result<Option<String>, ProviderError> {
    // `label` é a forma legível quando existe; `term` é o identificador.
    let label = attribute_value(element, b"label")?;
    let term = attribute_value(element, b"term")?;
    let value = label.or(term).unwrap_or_default();
    let cleaned = clean_text(&value, config::MAX_TAG_CHARS);
    Ok((!cleaned.is_empty()).then_some(cleaned))
}

fn push_category(entry: &mut RawEntry, value: String) {
    if entry.categories.len() < 16 && !entry.categories.contains(&value) {
        entry.categories.push(value);
    }
}

fn field_for(name: &[u8], prefix: &[u8]) -> Option<Field> {
    match (prefix, name) {
        (b"content", b"encoded") => Some(Field::ContentEncoded),
        (b"dc", b"creator") => Some(Field::Author),
        (b"dc", b"date") => Some(Field::Published),
        _ => match name {
            b"title" => Some(Field::Title),
            b"link" => Some(Field::Link),
            b"guid" | b"id" => Some(Field::Guid),
            b"pubdate" | b"published" => Some(Field::Published),
            b"updated" | b"modified" => Some(Field::Updated),
            b"description" | b"summary" | b"subtitle" => Some(Field::Description),
            b"content" => Some(Field::Description),
            b"author" | b"creator" | b"name" => Some(Field::Author),
            b"category" => Some(Field::Category),
            _ => None,
        },
    }
}

fn commit_capture(entry: &mut RawEntry, capture: Capture) {
    let value = capture.buffer;
    if value.trim().is_empty() && capture.field != Field::Category {
        return;
    }
    match capture.field {
        Field::Title => push_first(&mut entry.title, value),
        Field::Link => push_first(&mut entry.text_link, value),
        Field::Guid => push_first(&mut entry.guid, value),
        Field::Published => push_first(&mut entry.published, value),
        Field::Updated => push_first(&mut entry.updated, value),
        Field::Description => push_first(&mut entry.description, value),
        Field::ContentEncoded => push_first(&mut entry.content_encoded, value),
        Field::Author => push_first(&mut entry.author, value),
        Field::Category => {
            let cleaned = clean_text(&value, config::MAX_TAG_CHARS);
            if !cleaned.is_empty() {
                push_category(entry, cleaned);
            }
        }
    }
}

/// O primeiro valor encontrado vence: feeds costumam repetir `title` no canal e
/// no item, e o do item aparece primeiro dentro do escopo da entrada.
fn push_first(target: &mut String, value: String) {
    if target.is_empty() {
        *target = value;
    }
}

fn parse_date(value: &str) -> Option<DateTime<Utc>> {
    let cleaned = clean_text(value, 128);
    if cleaned.is_empty() {
        return None;
    }
    DateTime::parse_from_rfc3339(&cleaned)
        .or_else(|_| DateTime::parse_from_rfc2822(&cleaned))
        // Alguns feeds brasileiros emitem RFC 822 com fuso numérico sem dois-pontos.
        .or_else(|_| DateTime::parse_from_str(&cleaned, "%a, %d %b %Y %H:%M:%S %z"))
        .or_else(|_| DateTime::parse_from_str(&cleaned, "%Y-%m-%d %H:%M:%S %z"))
        .ok()
        .map(|parsed| parsed.with_timezone(&Utc))
}

/// Escolhe a URL da entrada: `alternate` explícito, depois link sem `rel`,
/// depois qualquer link utilizável.
fn choose_entry_url(entry: &RawEntry) -> Option<String> {
    let mut links: Vec<&RawLink> = entry.links.iter().collect();
    let text_link;
    if !entry.text_link.trim().is_empty() {
        // `<link>` de RSS chega escapado (`&amp;`); os `href` de Atom já vêm
        // desescapados pelo parser. Sem esta decodificação, `?a=1&amp;b=2`
        // viraria um parâmetro literal chamado `amp;b`.
        text_link = RawLink {
            href: clean_text(
                &text::decode_entities(&entry.text_link),
                config::MAX_URL_CHARS,
            ),
            relation: String::new(),
        };
        links.push(&text_link);
    }

    let pick = |predicate: &dyn Fn(&RawLink) -> bool| -> Option<String> {
        links
            .iter()
            .filter(|link| predicate(link))
            .find_map(|link| super::super::security::canonicalize_article_url(&link.href))
    };

    pick(&|link| link.relation.eq_ignore_ascii_case("alternate"))
        .or_else(|| pick(&|link| link.relation.trim().is_empty()))
        .or_else(|| pick(&|_| true))
        // Último recurso: um `guid` que seja uma URL permanente válida.
        .or_else(|| {
            super::super::security::canonicalize_article_url(
                text::decode_entities(&entry.guid).trim(),
            )
        })
}

/// Localiza o primeiro `<img src>` dentro de um bloco HTML do feed.
fn inline_image(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut cursor = 0usize;
    while let Some(offset) = lower[cursor..].find("<img") {
        let start = cursor + offset;
        let end = lower[start..].find('>').map(|position| start + position)?;
        let tag = &html[start..end];
        for attribute in ["src=\"", "src='"] {
            let quote = attribute.chars().last().unwrap_or('"');
            if let Some(value_start) = tag.to_ascii_lowercase().find(attribute) {
                let value_start = value_start + attribute.len();
                if let Some(value_end) = tag[value_start..].find(quote) {
                    let candidate = &tag[value_start..value_start + value_end];
                    if !candidate.is_empty() {
                        return Some(candidate.to_string());
                    }
                }
            }
        }
        cursor = end;
    }
    None
}

fn finish_entry(mut entry: RawEntry, provider: &NewsProviderDefinition) -> Option<RawArticle> {
    let title = text::html_to_text(&entry.title, config::MAX_TITLE_CHARS);
    if title.is_empty() {
        return None;
    }
    let canonical_url = choose_entry_url(&entry)?;

    // `content:encoded` só é usado quando não há description utilizável.
    let summary_source = if entry.description.trim().is_empty() {
        entry.content_encoded.clone()
    } else {
        entry.description.clone()
    };
    let summary = text::summary_for_storage(&summary_source);

    // Imagem declarada dentro do HTML do feed, se nenhuma tag de mídia trouxe.
    if entry.media.is_empty() {
        let html = if entry.content_encoded.trim().is_empty() {
            &entry.description
        } else {
            &entry.content_encoded
        };
        if let Some(url) = inline_image(html) {
            entry.media.push(MediaCandidate {
                url,
                origin: MediaOrigin::InlineContent,
                declared_width: None,
            });
        }
    }

    let author = {
        let cleaned = text::html_to_text(&entry.author, config::MAX_AUTHOR_CHARS);
        (!cleaned.is_empty()).then_some(cleaned)
    };

    Some(RawArticle {
        source_id: provider.id.to_string(),
        title,
        canonical_url,
        origin_guid: {
            let guid = clean_text(&entry.guid, 200);
            (!guid.is_empty()).then_some(guid)
        },
        summary_html_or_text: summary,
        author,
        published_at: parse_date(&entry.published).or_else(|| parse_date(&entry.updated)),
        categories: entry.categories,
        media_candidates: entry.media,
    })
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

pub fn parse_feed(
    bytes: &[u8],
    provider: &NewsProviderDefinition,
) -> Result<Vec<RawArticle>, ProviderError> {
    if bytes.len() > config::MAX_FEED_BYTES {
        return Err(ProviderError::new(ProviderErrorKind::ResponseTooLarge));
    }

    let mut reader = Reader::from_reader(bytes);
    // Whitespace preservado: texto separado por entidades manteria espaçamento
    // incorreto se cada fragmento fosse trimado isoladamente.
    reader.config_mut().trim_text(false);

    let mut buffer = Vec::new();
    let mut depth = 0usize;
    let mut events = 0usize;
    let mut raw_entries = 0usize;
    let mut recognized_feed = false;
    let mut entry: Option<RawEntry> = None;
    let mut entry_depth = 0usize;
    let mut capture: Option<Capture> = None;
    let mut articles: Vec<RawArticle> = Vec::new();

    loop {
        events += 1;
        if events > config::MAX_XML_EVENTS {
            return Err(ProviderError::new(ProviderErrorKind::ResponseTooLarge));
        }

        let event = reader
            .read_event_into(&mut buffer)
            .map_err(|_| ProviderError::new(ProviderErrorKind::Parse))?;

        match event {
            Event::Start(element) => {
                depth = depth.saturating_add(1);
                if depth > config::MAX_XML_DEPTH {
                    return Err(ProviderError::new(ProviderErrorKind::ResponseTooLarge));
                }
                let raw = element.name();
                let name = local_name(raw.as_ref());
                let prefix = namespace_prefix(raw.as_ref());

                if depth == 1 && matches!(name.as_slice(), b"rss" | b"feed" | b"rdf") {
                    recognized_feed = true;
                }

                if entry.is_none() && matches!(name.as_slice(), b"item" | b"entry") {
                    raw_entries += 1;
                    if raw_entries > config::MAX_RAW_ENTRIES {
                        return Err(ProviderError::new(ProviderErrorKind::ResponseTooLarge));
                    }
                    entry = Some(RawEntry::default());
                    entry_depth = depth;
                    capture = None;
                } else if let Some(current) = entry.as_mut() {
                    if let Some(media) = media_candidate(&element, &name, &prefix)? {
                        if current.media.len() < 8 {
                            current.media.push(media);
                        }
                    } else if name == b"link" {
                        // Atom usa atributos; RSS usa texto.
                        match attribute_value(&element, b"href")? {
                            Some(href) => current.links.push(RawLink {
                                href,
                                relation: attribute_value(&element, b"rel")?.unwrap_or_default(),
                            }),
                            None => start_capture(&mut capture, &name, &prefix, depth),
                        }
                    } else if name == b"category" {
                        match category_from_attributes(&element)? {
                            Some(value) => push_category(current, value),
                            None => start_capture(&mut capture, &name, &prefix, depth),
                        }
                    } else {
                        start_capture(&mut capture, &name, &prefix, depth);
                    }
                }
            }
            Event::Empty(element) => {
                let raw = element.name();
                let name = local_name(raw.as_ref());
                let prefix = namespace_prefix(raw.as_ref());
                if let Some(current) = entry.as_mut() {
                    if let Some(media) = media_candidate(&element, &name, &prefix)? {
                        if current.media.len() < 8 {
                            current.media.push(media);
                        }
                    } else if name == b"link" {
                        if let Some(href) = attribute_value(&element, b"href")? {
                            current.links.push(RawLink {
                                href,
                                relation: attribute_value(&element, b"rel")?.unwrap_or_default(),
                            });
                        }
                    } else if name == b"category" {
                        if let Some(value) = category_from_attributes(&element)? {
                            push_category(current, value);
                        }
                    }
                }
            }
            Event::Text(value) => {
                append(&mut capture, &decode_text(&value)?);
            }
            Event::CData(value) => {
                append(&mut capture, &decode_cdata(&value)?);
            }
            Event::GeneralRef(value) => {
                append(&mut capture, &decode_reference(&value)?);
            }
            Event::End(element) => {
                let name = local_name(element.name().as_ref());
                if capture
                    .as_ref()
                    .is_some_and(|active| active.depth == depth && active.end_name == name)
                {
                    if let (Some(current), Some(finished)) = (entry.as_mut(), capture.take()) {
                        commit_capture(current, finished);
                    }
                }
                if entry.is_some()
                    && depth == entry_depth
                    && matches!(name.as_slice(), b"item" | b"entry")
                {
                    if let Some(completed) = entry.take() {
                        if let Some(article) = finish_entry(completed, provider) {
                            articles.push(article);
                        }
                    }
                    capture = None;
                    entry_depth = 0;
                }
                depth = depth.saturating_sub(1);
            }
            // DTD é sempre recusada: é o vetor de XXE e de entity expansion.
            Event::DocType(_) => return Err(ProviderError::new(ProviderErrorKind::Validation)),
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }

    if !recognized_feed || depth != 0 || entry.is_some() {
        return Err(ProviderError::new(ProviderErrorKind::Parse));
    }
    if articles.is_empty() {
        return Err(ProviderError::new(ProviderErrorKind::Validation));
    }
    articles.truncate(provider.max_items);
    Ok(articles)
}

fn start_capture(capture: &mut Option<Capture>, name: &[u8], prefix: &[u8], depth: usize) {
    if capture.is_some() {
        return;
    }
    if let Some(field) = field_for(name, prefix) {
        *capture = Some(Capture {
            field,
            depth,
            end_name: name.to_vec(),
            buffer: String::new(),
        });
    }
}

fn append(capture: &mut Option<Capture>, value: &str) {
    let Some(active) = capture.as_mut() else {
        return;
    };
    let used = active.buffer.chars().count();
    if used >= config::MAX_FIELD_CHARS {
        return;
    }
    active
        .buffer
        .extend(value.chars().take(config::MAX_FIELD_CHARS - used));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::radar::sources::provider_by_id;

    fn provider() -> &'static NewsProviderDefinition {
        provider_by_id("agencia-brasil").expect("provider")
    }

    fn dev_provider() -> &'static NewsProviderDefinition {
        provider_by_id("github-blog").expect("provider")
    }

    #[test]
    fn parses_rss_with_description_author_category_and_media() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Agência Brasil</title>
    <link>https://agenciabrasil.ebc.com.br</link>
    <item>
      <title>Economia cresce no trimestre</title>
      <link>https://agenciabrasil.ebc.com.br/economia/noticia/2026-07/economia-cresce</link>
      <guid isPermaLink="false">nota-12345</guid>
      <pubDate>Wed, 29 Jul 2026 12:00:00 -0300</pubDate>
      <description>&lt;p&gt;O resultado veio acima do esperado pelos analistas do mercado.&lt;/p&gt;</description>
      <dc:creator>Repórter da Agência</dc:creator>
      <category>Economia</category>
      <category>Brasil</category>
      <media:content url="https://midias.agenciabrasil.ebc.com.br/foto.jpg" type="image/jpeg" width="1200"/>
    </item>
  </channel>
</rss>"#.as_bytes();

        let articles = parse_feed(feed, provider()).expect("rss");
        assert_eq!(articles.len(), 1);
        let article = &articles[0];
        assert_eq!(article.title, "Economia cresce no trimestre");
        assert_eq!(
            article.canonical_url,
            "https://agenciabrasil.ebc.com.br/economia/noticia/2026-07/economia-cresce"
        );
        assert_eq!(article.origin_guid.as_deref(), Some("nota-12345"));
        assert_eq!(
            article.summary_html_or_text.as_deref(),
            Some("O resultado veio acima do esperado pelos analistas do mercado.")
        );
        assert_eq!(article.author.as_deref(), Some("Repórter da Agência"));
        assert_eq!(article.categories, vec!["Economia", "Brasil"]);
        assert_eq!(
            article.published_at.map(|date| date.to_rfc3339()),
            Some("2026-07-29T15:00:00+00:00".to_string())
        );
        let media = article.best_media().expect("media");
        assert_eq!(media.origin, MediaOrigin::MediaContent);
        assert_eq!(media.declared_width, Some(1200));
    }

    #[test]
    fn parses_atom_preferring_alternate_link_and_nested_author_name() {
        let feed = r#"<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>GitHub Blog</title>
  <entry>
    <title>Novidades da plataforma</title>
    <id>tag:github.blog,2026:1</id>
    <link rel="self" href="https://github.blog/api/1"/>
    <link rel="alternate" href="https://github.blog/2026-07-29-novidades/"/>
    <published>2026-07-29T12:00:00Z</published>
    <updated>2026-07-29T13:00:00Z</updated>
    <summary>Resumo suficientemente longo para ser aceito pelo normalizador.</summary>
    <author><name>Equipe GitHub</name></author>
    <category term="engineering"/>
  </entry>
</feed>"#
            .as_bytes();

        let articles = parse_feed(feed, dev_provider()).expect("atom");
        assert_eq!(articles.len(), 1);
        assert_eq!(
            articles[0].canonical_url,
            "https://github.blog/2026-07-29-novidades/"
        );
        assert_eq!(articles[0].author.as_deref(), Some("Equipe GitHub"));
        assert_eq!(
            articles[0].categories,
            vec!["engineering".to_string()],
            "categoria em atributo `term` do Atom precisa ser lida"
        );
        assert_eq!(
            articles[0].published_at.map(|date| date.to_rfc3339()),
            Some("2026-07-29T12:00:00+00:00".to_string()),
            "published tem precedência sobre updated"
        );
    }

    #[test]
    fn enclosure_and_thumbnail_are_accepted_but_non_image_media_is_ignored() {
        let feed = r#"<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>x</title>
  <item>
    <title>Com enclosure</title>
    <link>https://agenciabrasil.ebc.com.br/a</link>
    <enclosure url="https://agenciabrasil.ebc.com.br/foto.jpg" type="image/jpeg" length="1000"/>
  </item>
  <item>
    <title>Com podcast</title>
    <link>https://agenciabrasil.ebc.com.br/b</link>
    <enclosure url="https://agenciabrasil.ebc.com.br/audio.mp3" type="audio/mpeg" length="1000"/>
    <media:content url="https://agenciabrasil.ebc.com.br/video.mp4" type="video/mp4"/>
  </item>
  <item>
    <title>Com thumbnail</title>
    <link>https://agenciabrasil.ebc.com.br/c</link>
    <media:thumbnail url="https://agenciabrasil.ebc.com.br/thumb.jpg"/>
  </item>
</channel></rss>"#
            .as_bytes();

        let articles = parse_feed(feed, provider()).expect("rss");
        assert_eq!(articles.len(), 3);
        assert_eq!(
            articles[0].best_media().map(|media| media.origin),
            Some(MediaOrigin::Enclosure)
        );
        assert!(
            articles[1].best_media().is_none(),
            "áudio e vídeo não são candidatos de imagem"
        );
        assert_eq!(
            articles[2].best_media().map(|media| media.origin),
            Some(MediaOrigin::MediaThumbnail)
        );
    }

    #[test]
    fn content_encoded_is_only_a_fallback_for_summary_and_image() {
        let feed = r#"<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>x</title>
  <item>
    <title>Com os dois</title>
    <link>https://agenciabrasil.ebc.com.br/a</link>
    <description>Resumo curto porém suficientemente longo do item.</description>
    <content:encoded><![CDATA[<p>Corpo integral que não deve ser usado.</p>]]></content:encoded>
  </item>
  <item>
    <title>Só content encoded</title>
    <link>https://agenciabrasil.ebc.com.br/b</link>
    <content:encoded><![CDATA[<p>Texto do corpo <img src="https://agenciabrasil.ebc.com.br/i.jpg"/> com imagem.</p>]]></content:encoded>
  </item>
</channel></rss>"#.as_bytes();

        let articles = parse_feed(feed, provider()).expect("rss");
        assert_eq!(
            articles[0].summary_html_or_text.as_deref(),
            Some("Resumo curto porém suficientemente longo do item.")
        );
        assert!(articles[1]
            .summary_html_or_text
            .as_deref()
            .expect("resumo")
            .starts_with("Texto do corpo"));
        assert_eq!(
            articles[1].best_media().map(|media| media.origin),
            Some(MediaOrigin::InlineContent)
        );
    }

    #[test]
    fn no_html_survives_into_any_field() {
        let feed = r#"<?xml version="1.0"?>
<rss version="2.0"><channel><title>x</title>
  <item>
    <title><![CDATA[Título com <b>negrito</b> &amp; símbolo]]></title>
    <link>https://agenciabrasil.ebc.com.br/a?x=1&amp;y=2</link>
    <description><![CDATA[<div onclick="alert(1)">Texto seguro do resumo com tamanho.</div><script>roubar()</script>]]></description>
  </item>
</channel></rss>"#.as_bytes();

        let articles = parse_feed(feed, provider()).expect("rss");
        let article = &articles[0];
        assert_eq!(article.title, "Título com negrito & símbolo");
        assert_eq!(
            article.canonical_url, "https://agenciabrasil.ebc.com.br/a?x=1&y=2",
            "entidade dentro da URL não pode virar espaço"
        );
        let summary = article.summary_html_or_text.as_deref().expect("resumo");
        assert!(!summary.contains('<'));
        assert!(!summary.contains("roubar"));
        assert!(!summary.contains("onclick"));
    }

    #[test]
    fn tracking_parameters_are_stripped_from_the_canonical_url() {
        let feed = r#"<?xml version="1.0"?>
<rss version="2.0"><channel><title>x</title>
  <item><title>Com rastreio</title>
  <link>https://agenciabrasil.ebc.com.br/noticia?utm_source=rss&amp;utm_medium=feed&amp;id=9#topo</link></item>
</channel></rss>"#.as_bytes();
        let articles = parse_feed(feed, provider()).expect("rss");
        assert_eq!(
            articles[0].canonical_url,
            "https://agenciabrasil.ebc.com.br/noticia?id=9"
        );
    }

    #[test]
    fn entries_without_a_usable_https_link_are_discarded() {
        let feed = r#"<?xml version="1.0"?>
<rss version="2.0"><channel><title>x</title>
  <item><title>Inseguro</title><link>http://agenciabrasil.ebc.com.br/a</link></item>
  <item><title>Sem link</title></item>
  <item><title>Válido</title><link>https://agenciabrasil.ebc.com.br/b</link></item>
</channel></rss>"#
            .as_bytes();
        let articles = parse_feed(feed, provider()).expect("rss");
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].title, "Válido");
    }

    #[test]
    fn a_permalink_guid_rescues_an_entry_whose_link_is_unusable() {
        let feed = r#"<?xml version="1.0"?>
<rss version="2.0"><channel><title>x</title>
  <item>
    <title>Sem link utilizável</title>
    <link>javascript:void(0)</link>
    <guid isPermaLink="true">https://agenciabrasil.ebc.com.br/recuperado</guid>
  </item>
</channel></rss>"#
            .as_bytes();
        let articles = parse_feed(feed, provider()).expect("rss");
        assert_eq!(
            articles[0].canonical_url,
            "https://agenciabrasil.ebc.com.br/recuperado"
        );
    }

    #[test]
    fn rejects_dtd_oversized_payloads_and_malformed_xml() {
        let dtd = r#"<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY x "boom">]><rss version="2.0"><channel><title>x</title></channel></rss>"#.as_bytes();
        assert_eq!(
            parse_feed(dtd, provider()).expect_err("dtd").kind,
            ProviderErrorKind::Validation
        );

        let oversized = vec![b'x'; config::MAX_FEED_BYTES + 1];
        assert_eq!(
            parse_feed(&oversized, provider()).expect_err("grande").kind,
            ProviderErrorKind::ResponseTooLarge
        );

        assert_eq!(
            parse_feed(b"<rss", provider())
                .expect_err("malformado")
                .kind,
            ProviderErrorKind::Parse
        );

        // Documento bem formado que não é feed.
        assert_eq!(
            parse_feed(b"<?xml version=\"1.0\"?><html><body/></html>", provider())
                .expect_err("não é feed")
                .kind,
            ProviderErrorKind::Parse
        );
    }

    #[test]
    fn a_recognised_feed_with_no_usable_entry_is_a_validation_failure() {
        let feed = r#"<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
          <item><title>Só isso</title><link>http://inseguro.example.com/a</link></item>
        </channel></rss>"#
            .as_bytes();
        assert_eq!(
            parse_feed(feed, provider()).expect_err("sem itens").kind,
            ProviderErrorKind::Validation
        );
    }

    #[test]
    fn entry_and_field_limits_are_enforced() {
        // Mais entradas do que o teto de segurança.
        let mut feed =
            String::from(r#"<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>"#);
        for index in 0..(config::MAX_RAW_ENTRIES + 5) {
            feed.push_str(&format!(
                "<item><title>T{index}</title><link>https://agenciabrasil.ebc.com.br/{index}</link></item>"
            ));
        }
        feed.push_str("</channel></rss>");
        assert_eq!(
            parse_feed(feed.as_bytes(), provider())
                .expect_err("muitas entradas")
                .kind,
            ProviderErrorKind::ResponseTooLarge
        );

        // Campo gigantesco é truncado, não estoura memória.
        let long_title = "a".repeat(config::MAX_FIELD_CHARS * 2);
        let single = format!(
            r#"<?xml version="1.0"?><rss version="2.0"><channel><title>x</title><item><title>{long_title}</title><link>https://agenciabrasil.ebc.com.br/a</link></item></channel></rss>"#
        );
        let articles = parse_feed(single.as_bytes(), provider()).expect("rss");
        assert!(articles[0].title.chars().count() <= config::MAX_TITLE_CHARS);
    }

    #[test]
    fn provider_max_items_caps_the_returned_batch() {
        let mut feed =
            String::from(r#"<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>"#);
        for index in 0..50 {
            feed.push_str(&format!(
                "<item><title>Título número {index}</title><link>https://github.blog/{index}</link></item>"
            ));
        }
        feed.push_str("</channel></rss>");
        let articles = parse_feed(feed.as_bytes(), dev_provider()).expect("rss");
        assert_eq!(articles.len(), dev_provider().max_items);
    }

    #[test]
    fn atom_categories_prefer_label_over_term_and_are_deduplicated() {
        let feed = r#"<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>x</title>
  <entry>
    <title>Entrada com categorias</title>
    <link rel="alternate" href="https://github.blog/a"/>
    <category term="eng" label="Engenharia"/>
    <category term="eng" label="Engenharia"/>
    <category term="apenas-term"/>
    <category term=""/>
  </entry>
</feed>"#
            .as_bytes();
        let articles = parse_feed(feed, dev_provider()).expect("atom");
        assert_eq!(
            articles[0].categories,
            vec!["Engenharia".to_string(), "apenas-term".to_string()],
            "label vence term; duplicatas e valores vazios são descartados"
        );
    }

    #[test]
    fn rss_text_categories_still_work_and_are_deduplicated() {
        let feed = r#"<?xml version="1.0"?>
<rss version="2.0"><channel><title>x</title>
  <item>
    <title>Com categorias repetidas</title>
    <link>https://agenciabrasil.ebc.com.br/a</link>
    <category>Economia</category>
    <category>Economia</category>
    <category>Brasil</category>
    <category>   </category>
  </item>
</channel></rss>"#
            .as_bytes();
        let articles = parse_feed(feed, provider()).expect("rss");
        assert_eq!(
            articles[0].categories,
            vec!["Economia".to_string(), "Brasil".to_string()]
        );
    }

    #[test]
    fn implausible_dates_are_dropped_rather_than_corrupting_the_entry() {
        let feed = r#"<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
          <item><title>Data inválida</title><link>https://agenciabrasil.ebc.com.br/a</link>
          <pubDate>não é uma data</pubDate></item>
        </channel></rss>"#
            .as_bytes();
        let articles = parse_feed(feed, provider()).expect("rss");
        assert_eq!(articles.len(), 1);
        assert!(articles[0].published_at.is_none());
    }
}
