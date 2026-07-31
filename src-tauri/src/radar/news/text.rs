//! Conversão de HTML para texto e normalização tipográfica.
//!
//! Implementado como máquina de estados explícita — nunca por regex — para que
//! `<script>`, comentários, CDATA e atributos com `>` sejam tratados
//! corretamente. Nenhum HTML sobrevive a esta camada: o frontend só recebe
//! texto puro.

use super::super::config;

/// Entidades HTML nomeadas que aparecem de fato em feeds brasileiros.
/// Referências numéricas são resolvidas dinamicamente.
const NAMED_ENTITIES: &[(&str, &str)] = &[
    ("amp", "&"),
    ("lt", "<"),
    ("gt", ">"),
    ("quot", "\""),
    ("apos", "'"),
    ("nbsp", "\u{a0}"),
    ("ndash", "–"),
    ("mdash", "—"),
    ("hellip", "…"),
    ("lsquo", "‘"),
    ("rsquo", "’"),
    ("ldquo", "“"),
    ("rdquo", "”"),
    ("aacute", "á"),
    ("agrave", "à"),
    ("acirc", "â"),
    ("atilde", "ã"),
    ("eacute", "é"),
    ("ecirc", "ê"),
    ("iacute", "í"),
    ("oacute", "ó"),
    ("ocirc", "ô"),
    ("otilde", "õ"),
    ("uacute", "ú"),
    ("uuml", "ü"),
    ("ccedil", "ç"),
    ("Aacute", "Á"),
    ("Atilde", "Ã"),
    ("Eacute", "É"),
    ("Iacute", "Í"),
    ("Oacute", "Ó"),
    ("Otilde", "Õ"),
    ("Uacute", "Ú"),
    ("Ccedil", "Ç"),
];

/// Elementos cujo conteúdo textual nunca deve ser exibido.
const SKIPPED_ELEMENTS: [&str; 4] = ["script", "style", "noscript", "iframe"];

/// Elementos que separam blocos de texto.
const BLOCK_ELEMENTS: [&str; 17] = [
    "p",
    "div",
    "br",
    "li",
    "ul",
    "ol",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "tr",
    "td",
    "section",
    "article",
    "blockquote",
];

fn decode_entity(raw: &str) -> Option<String> {
    if let Some(rest) = raw.strip_prefix('#') {
        let code = if let Some(hex) = rest.strip_prefix(['x', 'X']) {
            u32::from_str_radix(hex, 16).ok()?
        } else {
            rest.parse::<u32>().ok()?
        };
        let character = char::from_u32(code)?;
        // Controles não-imprimíveis viram espaço em vez de contaminar o texto.
        if character.is_control() && !matches!(character, '\t' | '\n' | '\r') {
            return Some(" ".to_string());
        }
        return Some(character.to_string());
    }
    NAMED_ENTITIES
        .iter()
        .find(|(name, _)| *name == raw)
        .map(|(_, value)| (*value).to_string())
}

/// Decodifica entidades. Referências desconhecidas são preservadas literalmente
/// em vez de descartadas, para não corromper textos que contenham `&`.
pub fn decode_entities(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut chars = value.char_indices().peekable();
    while let Some((index, character)) = chars.next() {
        if character != '&' {
            result.push(character);
            continue;
        }
        // Uma entidade válida tem no máximo ~10 caracteres antes do ';'.
        let tail = &value[index + 1..];
        let Some(end) = tail
            .char_indices()
            .take(12)
            .find(|(_, c)| *c == ';')
            .map(|(i, _)| i)
        else {
            result.push('&');
            continue;
        };
        let name = &tail[..end];
        match decode_entity(name) {
            Some(decoded) => {
                result.push_str(&decoded);
                for _ in 0..=name.chars().count() {
                    chars.next();
                }
            }
            None => result.push('&'),
        }
    }
    result
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State {
    Text,
    TagName,
    /// Dentro de um atributo entre aspas; `>` aqui não fecha a tag.
    AttributeSingle,
    AttributeDouble,
    /// Dentro da tag mas fora de atributo.
    TagBody,
    Comment,
    CData,
}

fn is_name_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '-' || character == '_'
}

/// Converte um fragmento de HTML em texto legível.
///
/// Garantias: nenhuma `<` ou `>` de markup sobrevive; conteúdo de `script`,
/// `style`, `noscript` e `iframe` é descartado; elementos de bloco viram
/// separadores; whitespace é colapsado; o resultado é truncado por caractere.
pub fn html_to_text(value: &str, max: usize) -> String {
    let mut output = String::with_capacity(value.len().min(max * 4));
    let mut state = State::Text;
    let mut tag_name = String::new();
    let mut closing = false;
    // Profundidade de elementos ignorados aninhados.
    let mut skip_depth = 0usize;

    let bytes: Vec<char> = value.chars().collect();
    let mut index = 0usize;
    while index < bytes.len() {
        let character = bytes[index];
        match state {
            State::Text => {
                if character == '<' {
                    // Comentário ou CDATA?
                    let rest: String = bytes[index..bytes.len().min(index + 9)].iter().collect();
                    if rest.starts_with("<!--") {
                        state = State::Comment;
                        index += 4;
                        continue;
                    }
                    if rest.starts_with("<![CDATA[") {
                        state = State::CData;
                        index += 9;
                        continue;
                    }
                    state = State::TagName;
                    tag_name.clear();
                    closing = false;
                } else if skip_depth == 0 {
                    output.push(character);
                }
                index += 1;
            }
            State::TagName => {
                if character == '/' && tag_name.is_empty() {
                    closing = true;
                    index += 1;
                    continue;
                }
                if is_name_char(character) {
                    tag_name.push(character.to_ascii_lowercase());
                    index += 1;
                    continue;
                }
                state = State::TagBody;
            }
            State::TagBody | State::AttributeSingle | State::AttributeDouble => {
                match (state, character) {
                    (State::TagBody, '"') => state = State::AttributeDouble,
                    (State::TagBody, '\'') => state = State::AttributeSingle,
                    (State::AttributeDouble, '"') => state = State::TagBody,
                    (State::AttributeSingle, '\'') => state = State::TagBody,
                    (State::TagBody, '>') => {
                        if SKIPPED_ELEMENTS.contains(&tag_name.as_str()) {
                            if closing {
                                skip_depth = skip_depth.saturating_sub(1);
                            } else {
                                // Tag auto-fechada não abre bloco a ignorar.
                                let self_closing = index > 0 && bytes[index - 1] == '/';
                                if !self_closing {
                                    skip_depth += 1;
                                }
                            }
                        } else if BLOCK_ELEMENTS.contains(&tag_name.as_str()) && skip_depth == 0 {
                            output.push(' ');
                        }
                        state = State::Text;
                    }
                    _ => {}
                }
                index += 1;
            }
            State::Comment => {
                let rest: String = bytes[index..bytes.len().min(index + 3)].iter().collect();
                if rest.starts_with("-->") {
                    state = State::Text;
                    index += 3;
                } else {
                    index += 1;
                }
            }
            State::CData => {
                let rest: String = bytes[index..bytes.len().min(index + 3)].iter().collect();
                if rest.starts_with("]]>") {
                    state = State::Text;
                    index += 3;
                } else {
                    if skip_depth == 0 {
                        output.push(character);
                    }
                    index += 1;
                }
            }
        }
    }

    let decoded = decode_entities(&output);
    // Uma segunda passagem remove markup que estava escapado no fonte
    // (`&lt;script&gt;`), impedindo que ele reapareça já decodificado.
    let sanitized = if decoded.contains('<') {
        strip_remaining_markup(&decoded)
    } else {
        decoded
    };

    sanitized
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max)
        .collect()
}

/// Remove qualquer `<...>` remanescente sem reinterpretar entidades.
fn strip_remaining_markup(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut inside = false;
    for character in value.chars() {
        match character {
            '<' => inside = true,
            '>' if inside => {
                inside = false;
                result.push(' ');
            }
            _ if !inside => result.push(character),
            _ => {}
        }
    }
    result
}

/// Trunca em `max` caracteres cortando na última fronteira de palavra e
/// acrescentando reticências. Nunca parte um caractere multibyte.
pub fn truncate_summary(value: &str, max: usize) -> String {
    let total = value.chars().count();
    if total <= max {
        return value.to_string();
    }
    let hard: String = value.chars().take(max).collect();
    let cut = hard
        .rfind(|character: char| character.is_whitespace())
        // Só recua até a palavra anterior se isso não descartar metade do texto.
        .filter(|position| *position > max / 2)
        .unwrap_or(hard.len());
    let mut trimmed = hard[..cut].trim_end().to_string();
    while trimmed.ends_with([',', ';', ':', '.', '-', '–', '—']) {
        trimmed.pop();
    }
    trimmed.push('…');
    trimmed
}

/// Resumo pronto para persistência: HTML removido e limite de armazenamento.
pub fn summary_for_storage(raw: &str) -> Option<String> {
    let text = html_to_text(raw, config::MAX_SUMMARY_CHARS * 2);
    if text.chars().count() < 20 {
        return None;
    }
    Some(truncate_summary(&text, config::MAX_SUMMARY_CHARS))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_tags_and_keeps_readable_text() {
        // `<b>` é inline: não introduz separador. `<p>` é bloco: introduz.
        assert_eq!(
            html_to_text("<p>Olá <b>mundo</b>!</p><p>Segundo parágrafo.</p>", 200),
            "Olá mundo! Segundo parágrafo."
        );
        assert_eq!(html_to_text("sem markup", 200), "sem markup");
        assert_eq!(html_to_text("", 200), "");
    }

    #[test]
    fn discards_script_style_and_comment_content() {
        assert_eq!(
            html_to_text(
                "<p>antes</p><script>var x = 1 > 0;</script><p>depois</p>",
                200
            ),
            "antes depois"
        );
        assert_eq!(
            html_to_text("<style>body{color:red}</style>texto", 200),
            "texto"
        );
        assert_eq!(html_to_text("a<!-- comentário -->b", 200), "ab");
        assert_eq!(
            html_to_text("<noscript>fallback</noscript>real", 200),
            "real"
        );
    }

    #[test]
    fn attributes_containing_angle_brackets_do_not_break_parsing() {
        assert_eq!(
            html_to_text(r#"<a title="1 > 0" href="/x">link</a> fim"#, 200),
            "link fim"
        );
        assert_eq!(
            html_to_text(r#"<img alt='a > b' src="/i.png"/>texto"#, 200),
            "texto"
        );
    }

    #[test]
    fn decodes_named_and_numeric_entities_used_by_brazilian_feeds() {
        assert_eq!(
            html_to_text("Informa&ccedil;&atilde;o &amp; a&ccedil;&atilde;o", 200),
            "Informação & ação"
        );
        assert_eq!(html_to_text("A &#233; B &#xe9; C", 200), "A é B é C");
        assert_eq!(html_to_text("50&nbsp;%", 200), "50 %");
        // Entidade desconhecida é preservada literalmente.
        assert_eq!(html_to_text("R&D &naoexiste;", 200), "R&D &naoexiste;");
        // `&` solto não vira entidade.
        assert_eq!(html_to_text("Tom & Jerry", 200), "Tom & Jerry");
    }

    #[test]
    fn escaped_markup_cannot_resurface_after_entity_decoding() {
        let result = html_to_text("&lt;script&gt;alert(1)&lt;/script&gt; texto", 200);
        assert!(
            !result.contains('<'),
            "markup escapado reapareceu: {result}"
        );
        assert!(
            !result.contains("script>"),
            "markup escapado reapareceu: {result}"
        );
        assert!(result.contains("texto"));
    }

    #[test]
    fn cdata_content_is_preserved_but_its_markup_is_not() {
        assert_eq!(
            html_to_text("<![CDATA[Título com <b>negrito</b>]]>", 200),
            "Título com negrito"
        );
    }

    #[test]
    fn truncation_never_splits_a_multibyte_character() {
        let value = "ação ".repeat(200);
        for limit in [1, 4, 5, 17, 99] {
            let truncated = html_to_text(&value, limit);
            assert!(truncated.chars().count() <= limit);
            assert!(truncated.is_char_boundary(truncated.len()));
        }
    }

    #[test]
    fn summary_truncation_cuts_on_a_word_boundary_and_adds_ellipsis() {
        let value = "Primeira frase completa e depois muito mais conteúdo adicional";
        let truncated = truncate_summary(value, 25);
        assert!(truncated.ends_with('…'));
        assert!(truncated.chars().count() <= 26);
        assert!(!truncated.contains("  "));
        // Texto curto não é alterado.
        assert_eq!(truncate_summary("curto", 25), "curto");
    }

    #[test]
    fn summary_for_storage_rejects_content_that_is_only_markup() {
        assert!(summary_for_storage("<div><span></span></div>").is_none());
        assert!(summary_for_storage("curto").is_none());
        let summary =
            summary_for_storage("<p>Um resumo real com tamanho suficiente para valer.</p>")
                .expect("resumo");
        assert_eq!(summary, "Um resumo real com tamanho suficiente para valer.");
        assert!(!summary.contains('<'));
    }

    #[test]
    fn storage_summary_respects_the_configured_ceiling() {
        let long = "palavra ".repeat(1000);
        let summary = summary_for_storage(&long).expect("resumo");
        assert!(summary.chars().count() <= config::MAX_SUMMARY_CHARS + 1);
    }
}
