# RADAR_EXECUTION_LOG

Execução do `FOCUSWALL_RADAR_EVOLUTION_IMPLEMENTATION_PLAN.md` — 29/07/2026.

> **Estado da entrega (31/07/2026): funcional.** Backend e frontend migrados
> para o schema 2, build Tauri gerado e app executado com dados reais.
> Permanecem fora do escopo entregue: pipeline de imagens (etapa 6) e o
> redesign visual completo (etapas 10–11). Ver "Etapas NÃO entregues".

## Verificação de ponta a ponta — 31/07/2026

Causa raiz do relato "simplesmente não está funcionando": o processo em
execução era `target/release/focus-desktop-dashboard.exe` compilado **antes**
das mudanças. Nenhum build de release tinha sido gerado.

Após rebuild, execução real com cache limpo:

```
radar cache ready
radar articles persisted: written=193 deduplicated=6 clustered=0
```

O SQLite foi criado em `%LOCALAPPDATA%\com.carva.focusdashboard\radar\` com WAL.

### Testes de contrato ao vivo (etapa 21.3)

`cargo test --features live-provider-tests provider_contract` — **5 passaram**:

| Verificação | Resultado real |
|---|---|
| Notícias | agencia-brasil 40, braziljs 20, cert-br 12, tabnews 50, tecnoblog 30, github-blog 10 |
| Clima | 19,9 °C, 24 pontos horários, 7 dias |
| PTAX | USD R$ 5,0831 · EUR R$ 5,8293 |
| USGS | 3 eventos relevantes |
| Geocoding | 5 resultados para "Campinas" |

### Defeitos encontrados **em execução real** e corrigidos

1. **PTAX respondia HTTP 4xx/500 sempre.** `query_pairs_mut` percent-encodava
   `$`→`%24` e `@`→`%40`; o OData do Banco Central rejeita. A query passou a ser
   montada com `set_query`, que preserva esses caracteres. Teste de regressão
   trava a codificação.
2. **CERT.br não entregava nenhum artigo.** O feed publica em
   `cartilha.cert.br`, `cursos.cert.br` e `forum.cert.br`, ausentes da
   allowlist — todos os artigos eram descartados em silêncio na normalização,
   deixando a categoria Segurança vazia. Hosts reais adicionados.
3. **InfoQ Brasil responde 200 com feed vazio.** Canal RSS válido, zero itens.
   Mantê-lo ligado só gerava falha de validação e cooldown recorrente. Foi
   desligado com `disabled_reason` explícito, e o campo virou obrigatório para
   qualquer provider desabilitado (travado por teste).

O teste de contrato ao vivo foi escrito justamente para pegar 1 e 2 — nenhum
deles aparecia na suíte determinística.

---

## Etapa 0 — Preflight

| Item | Resultado |
|---|---|
| `node --version` | v24.15.0 |
| `npm --version` | 11.12.1 |
| registry npm | `https://registry.npmjs.org/` (funcional) |
| `rustc --version` | 1.95.0 |
| `cargo --version` | 1.95.0 |
| `node_modules` / `target` | presentes |
| `cargo metadata` | exit 0 |

**Gate: aprovado.** Toolchain completa, ao contrário da execução anterior
documentada em `RADAR_IMPLEMENTATION_REPORT.md`.

---

## Etapa 1 — Baseline

| Comando | Resultado no baseline |
|---|---|
| `npm run typecheck` | ✅ exit 0 |
| `npm test` | ✅ 279 passed, 49 skipped (30 arquivos) |
| `cargo test` | ❌ **não compilava** — E0499 em `weather.rs` (3 empréstimos mutáveis simultâneos no teste `sorts_and_deduplicates_future_hour_points_before_limiting`) |
| `cargo test` (após corrigir E0499) | ❌ 1 falha real: `removes_markup_and_decodes_entities_from_titles` |
| `cargo fmt -- --check` | ❌ **já falhava** (`lib.rs`, `dashboard_state.rs`, `media/*`) |
| `cargo clippy --all-targets -- -D warnings` | ❌ **já falhava** (13 violações em `lib.rs`, `dashboard_state.rs`, `media/*`) |

### Falhas pré-existentes corrigidas

1. **E0499 em `weather.rs`** — o teste tomava quatro empréstimos mutáveis de
   `value` ao mesmo tempo. Reescrito para emprestar um array por vez.
2. **Corrupção de URL no parser de feeds** — `append_capped` inseria um espaço
   entre fragmentos de texto, e `trim_text(true)` removia o espaçamento real.
   Resultado: `?x=1&amp;y=2` virava `?x=1%20&%20y=2`, quebrando qualquer link
   com mais de um parâmetro. Corrigido preservando whitespace no reader e
   colapsando uma única vez em `clean`.

### Falhas pré-existentes **não** corrigidas

`cargo fmt --check` e `cargo clippy -D warnings` continuam falhando em
`src/lib.rs`, `src/dashboard_state.rs`, `src/media/mod.rs`, `src/media/smtc.rs`.
São 13 violações de clippy e diffs de formatação anteriores a este trabalho, em
arquivos fora do escopo do Radar. **Todo o módulo `src/radar/` está limpo em
ambos.** Formatar ou refatorar os demais produziria um diff grande e não
relacionado à feature; fica registrado como dívida separada.

---

## Providers revalidados ao vivo — 29/07/2026

Todos consultados diretamente antes de serem habilitados.

| Provider | Endpoint | HTTP | Content-Type | Tamanho | Decisão |
|---|---|---:|---|---:|---|
| Agência Brasil (últimas) | `/rss/ultimasnoticias/feed.xml` | 200 | `application/rss+xml` | 64 KB | habilitado |
| Agência Brasil (economia) | `/rss/economia/feed.xml` | 200 | `application/rss+xml` | 67 KB | habilitado |
| Agência Brasil (geral) | `/rss/geral/feed.xml` | 200 | `application/rss+xml` | 56 KB | habilitado |
| Agência Brasil (internacional) | `/rss/internacional/feed.xml` | 200 | `application/rss+xml` | 67 KB | habilitado |
| InfoQ Brasil | `feed.infoq.com/br/Brasil/` | 200 | `application/xml` | 224 B | habilitado |
| BrazilJS | `www.braziljs.org/feed` | 200 | `application/xml` | 411 KB | habilitado |
| CERT.br | `www2.cert.br/rss/certbr-rss.xml` | 200 | `text/xml` | 11 KB | habilitado |
| TabNews | `/api/v1/contents?strategy=relevant` | 200 | `application/json` | 3 KB | habilitado (best-effort) |
| Tecnoblog | `tecnoblog.net/feed/` | 200 | `application/rss+xml` | 1,0 MB | **habilitado** (contrato confirmado) |
| GitHub Blog | `github.blog/feed/` | 200 | `application/rss+xml` | 155 KB | habilitado (P2, complemento) |
| Open-Meteo forecast | `api.open-meteo.com/v1/forecast` | 200 | `application/json` | 9,7 KB | 7 dias, 168 pontos horários |
| Banco Central PTAX | `olinda.bcb.gov.br/.../CotacaoMoedaPeriodo` | 200 | `application/json` | — | habilitado |
| USGS | `/summary/4.5_day.geojson` | 200 | `application/json` | 14 KB | habilitado |

O InfoQ respondeu 200 com apenas 224 bytes; o provider está habilitado mas a
saúde por provider registrará falha de validação se o feed vier vazio, sem
derrubar os demais.

Fixtures reais capturadas e sanitizadas: `open_meteo_forecast.json` (substituída
pela resposta real de 7 dias) e `tabnews_contents.json` (nova).

---

## Etapas concluídas

### Etapa 2 — Contratos v2 e SQLite ✅

- 7 categorias (`brasil`, `technology`, `development`, `security`, `business`,
  `science`, `world`).
- `RadarArticleSummary` **sem `canonicalUrl`**; teste garante que nenhuma URL
  atravessa o IPC.
- `RadarArticlePreview`, `RadarImageRef`, `RadarProviderStatus`,
  `RadarNewsCollection`, `RadarTickerItem`, `RadarSnapshot` com `schemaVersion: 2`.
- `rusqlite` com SQLite *bundled*, WAL, `busy_timeout`, `foreign_keys=ON`.
- Migração transacional; banco de versão futura é rejeitado; banco corrompido é
  renomeado para `.corrupt-<timestamp>` (com WAL/SHM) e reconstruído.
- Retenção: artigos 30 dias, eventos 7 dias, clima 24 h, LRU de imagens com
  quota de 150 MB.
- `dashboard-state.json` permanece intocado — cache do Radar é descartável.

### Etapa 3 — SecureHttpClient e SSRF ✅

- HTTPS obrigatório na porta 443, sem credenciais, sem cookie store, sem proxy.
- **Resolver DNS próprio** (`reqwest::dns::Resolve`): uma resposta com
  *qualquer* endereço privado é rejeitada inteira — resposta mista é sinal de
  rebinding, não de multi-homing. O cliente conecta apenas aos endereços que o
  resolver devolveu.
- Redirects automáticos desligados; até 3 saltos seguidos manualmente, cada um
  revalidado do zero (esquema, porta, credenciais, allowlist).
- Limites por tipo de conteúdo aplicados **durante o streaming**.
- Retry apenas para timeout/conexão/429/5xx, 2 tentativas, backoff com jitter,
  `Retry-After` respeitado dentro de teto de 5 s.
- MIME cruzado com magic bytes; SVG e GIF remotos recusados; HTML disfarçado de
  imagem detectado.
- Faixas bloqueadas ampliadas: CGNAT (100.64/10), benchmarking (198.18/15),
  documentação, reservada (240/4), IPv4-compatible em IPv6, `.internal`,
  `.home.arpa`, `.arpa`.

> **Desvio deliberado do plano (§21.2).** O plano pede um servidor HTTP local
> para testes determinísticos de transporte. Isso é incompatível com a política
> entregue: o cliente exige HTTPS na 443 com certificado válido, e relaxar isso
> só para teste anularia exatamente o que precisa ser verificado. Optou-se por
> manter a política (plano §27: segurança primeiro) e testar as decisões como
> funções puras — status, limites, content-type, assinatura, redirect, retry e
> `Retry-After` têm cobertura direta. Há também testes que confirmam que URLs
> hostis são recusadas **antes** de abrir socket.

### Etapa 4 — Providers ✅

7 providers com allowlists separadas (`feed_hosts`, `article_hosts`,
`image_hosts`), sem wildcard. Parser RSS/Atom/RDF expandido: `description`,
`author`/`dc:creator`, `category`, `guid`, `media:content`, `media:thumbnail`,
`enclosure`, `content:encoded` (apenas como fallback), `<img>` inline.
DTD rejeitada; tetos de bytes, eventos, profundidade, entradas e campo.
HTML convertido a texto por **máquina de estados** (`news/text.rs`), nunca
regex: `<script>`/`<style>` descartados, atributos com `>` tratados, entidades
decodificadas uma única vez para que markup escapado não ressurja.
Saúde por provider com cooldown exponencial com teto; falhas de política
(host proibido, MIME divergente) **não** contam para cooldown.

> **Desvio deliberado (TabNews).** O plano manda usar `source_url` como canônica
> quando válido. Esse campo é livre e apontaria para hosts fora de qualquer
> allowlist, inviabilizando a abertura segura por ID. A URL canônica é sempre a
> da publicação no TabNews; o link original continua acessível pela própria
> página. Atribuição preservada.

### Etapa 5 — Normalização, dedupe, ranking, clustering ✅

- Canonicalização removendo fragmento e `utm_*`, `pk_*`, `fbclid`, `gclid`,
  `dclid`, `msclkid`, `mc_cid`, `mc_eid`, `igshid`, `twclid`, `ref_src`,
  `ref_url` — preservando parâmetros que identificam conteúdo. Idempotente.
- ID opaco = SHA-256 de `sourceId \0 canonicalUrl` (separador nulo evita colisão
  por concatenação).
- Artigo cujo host não pertence ao provider é descartado: um feed comprometido
  não injeta links de terceiros.
- Dedupe em 4 camadas: hash de URL, GUID, título normalizado (NFKD sem
  diacríticos, sem stopwords PT/EN), Jaccard de bigramas — 0,82 entre fontes,
  0,90 na mesma fonte, janela de 72 h, mínimo de 5 tokens.
- Ranking determinístico ponderado (recência 0,30 com meia-vida de 12 h; fonte
  0,20; afinidade 0,20; relevância BR 0,10; completude 0,10; diversidade 0,10)
  menos penalidades. Passe guloso de diversidade limita a no máximo **duas**
  entradas consecutivas da mesma fonte. Teste garante que a ordem de entrada não
  altera o resultado.

### Etapa 8 — Clima ✅

7 dias, 12–24 h horárias, `forecast_days=7`, **timezone explícito da localização
persistida** (nunca `auto`), coordenadas arredondadas a 4 casas antes de sair do
processo. Métricas completas: rajadas, pressão, precipitação, chuva, UV,
acumulado, nascer/pôr do sol. Arrays desalinhados são rejeitados; campos
opcionais ausentes ou `null` degradam sem derrubar a previsão. Alertas derivados
com limiares em `config.rs`, todos com `isEstimate: true` — nunca alerta oficial.
Cache fresh 20 min / stale 6 h / emergência 24 h com aviso forte.
`WeatherProviderMode` torna a decisão de licenciamento explícita; nenhuma chave
embutida no binário.

### Etapa 9 — Mercado e eventos (backend) ✅ / frontend ❌

PTAX USD/BRL e EUR/BRL via Olinda, janela de 10 dias para cobrir feriados,
rotulados como `RadarQuoteKind::Ptax` com data da cotação, **sem variação
inventada**. USGS com filtro por magnitude (5,5 global / 4,5 na América do Sul).
Frescura recalculada na leitura a partir de `observedAt` — bug encontrado
durante a implementação: o `cacheState` gravado ficaria congelado como "fresh"
para sempre.

**Não feito:** `src/lib/services/exchange.ts` ainda existe e ainda faz `fetch()`
para a AwesomeAPI; a CSP em `tauri.conf.json` ainda permite esse domínio.

---

## Etapas NÃO entregues

| Etapa | Estado |
|---|---|
| **6 — Imagens** | Descoberta de candidatos implementada e testada no parser. Download, validação de dimensão, reencode sem EXIF, asset protocol e placeholders **não implementados**. A camada de armazenamento (LRU, quota, órfãs) está pronta e testada, mas sem produtor. `image` sempre vem `null` nos DTOs. |
| **10/11 — Redesign, a11y, performance** | Parcial. O drawer tem `role="dialog"`, `aria-modal`, focus trap, Escape e restauração de foco; o fundo fica `inert`. A composição editorial completa (manchete com imagem, grade de destaques, gráfico de precipitação, ticker na UI) **não foi construída** — o layout segue a grade de dois cards. |
| **12 — Screenshots e ZIP** | Build Tauri gerado e executado. Screenshots da matriz visual e ZIP final **não produzidos**. |

### Etapa 7 — Preview interno ✅

Migração do frontend concluída: `types/radar.ts`, `utils/radar.ts`,
`services/radar.ts`, `radar.fixture.ts` e `stores/radar-store.ts` no schema 2.

- `RadarArticleDrawer.svelte` abre no clique do card; o navegador **nunca** abre
  no clique, só no botão "Abrir matéria completa no navegador".
- Abertura por ID opaco: `isRadarOpaqueId` recusa qualquer valor que não seja um
  SHA-256 hexadecimal antes de chegar ao IPC.
- Nenhum componente vê URL de matéria — teste garante que o snapshot
  serializado não contém `https://`.
- Atribuição do clima passou a usar `open_radar_attribution(providerId)`.
- Filtros de categoria para as 7 categorias, com opção "Tudo".
- Previsão de 7 dias e sinalizações meteorológicas rotuladas como estimativa.

Os pontos de extensão dessas etapas estão marcados com `#[allow(dead_code)]` e
comentário nomeando a etapa pendente — não são placeholders silenciosos.

---

## Pendências (ordem sugerida)

1. **Etapa 6 — imagens.** Sem ela os cards não têm foto e `image` vem `null`.
   Exige download com SSRF, validação de assinatura, reencode sem EXIF, asset
   protocol restrito e placeholders por categoria.
2. **Etapas 10/11 — composição editorial.** Manchete com imagem, grade de
   destaques, gráfico de precipitação por hora, ticker na interface, matriz de
   breakpoints e os três temas revisados.
3. **Remover `exchange.ts`** e o domínio da AwesomeAPI da CSP, substituindo a
   taxa do cabeçalho pelo ticker do Radar (que já existe no backend).
4. Screenshots da matriz visual e ZIP final.

---

## Rodada de code review — 30/07/2026

Revisão completa das alterações. Nove defeitos encontrados e corrigidos.

### Defeitos na entrega do Radar

1. **Comandos novos não declarados nas permissões.** `app-commands.toml` ainda
   listava `open_radar_url` (removido) e não declarava
   `get_radar_article_preview`, `open_radar_article`, `open_radar_attribution`
   nem `clear_radar_cache`. Os quatro seriam **negados em runtime**. Corrigido;
   `gen/schemas/acl-manifests.json` foi regenerado e confirmado.

2. **Categorias de Atom eram descartadas.** O parser só lia a forma textual do
   RSS; `<category term="..."/>` do Atom era ignorado, degradando a
   classificação de InfoQ e GitHub Blog. Passou a ler `label` (preferido) e
   `term`, com deduplicação. Dois testes novos.

3. **`is_current_hour` podia marcar dois pontos.** A flag era decidida durante a
   coleta, antes da ordenação; com um provider devolvendo horas fora de ordem,
   dois pontos apareceriam como "agora". Passou a ser aplicada depois de
   ordenar, ao primeiro elemento.

4. **`totalAvailable` mentia.** Vinha de `ranked.len()`, que é limitado pelo
   `LIMIT` do SQL — a UI anunciaria no máximo o tamanho da página. Agora usa
   `COUNT(*)` com os mesmos filtros. Com assuntos bloqueados (filtro em Rust) o
   valor passa a ser limite inferior: sub-relatar é melhor do que anunciar
   matérias inalcançáveis. Dois testes novos travam a invariante.

5. **Dedupe O(n²) sobre o lote de reprocessamento.** Até 2000 artigos entravam
   na comparação de bigramas a cada refresh. Como `same_topic` já exige
   categoria igual, os candidatos passaram a ser agrupados por categoria — mesmo
   resultado, custo muito menor. Teste de regressão com 1200 artigos.

6. **Persistência bloqueava o executor async.** `persist_articles` fazia leitura
   da janela de dedupe, comparação de bigramas e uma transação de centenas de
   linhas direto no runtime do Tauri, travando o IPC. Movido para
   `spawn_blocking`.

7. **Log de abertura usava o ID do artigo.** `open_radar_article` registrava os
   8 primeiros caracteres do ID num campo chamado `provider_id` — um
   correlacionador de histórico de leitura com nome enganoso.
   `resolve_article_url` passou a devolver `(url, provider_id)` e o log registra
   a fonte real.

8. **Contrato IPC sem teste.** `RadarRefreshRequest` usa `#[serde(flatten)]`,
   que é frágil e não tinha nenhuma cobertura — uma divergência de nome só
   apareceria em runtime. Seis testes novos fixam a forma do wire (camelCase,
   payload vazio, flatten, `RadarCacheScope`, rejeição de categoria inválida).

9. **Atribuição dependia de fallback silencioso.** Um provider cuja homepage não
   batesse com `article_hosts` quebraria o link sem aviso. Teste novo percorre
   todos os providers.

### Dívida pré-existente quitada

`cargo clippy --all-targets -- -D warnings` e `cargo fmt --check` **passam pela
primeira vez no crate inteiro**. As 13 violações em `lib.rs`,
`dashboard_state.rs`, `media/mod.rs` e `media/smtc.rs` foram corrigidas de forma
preservadora de comportamento:

- `UiState` passou a derivar `Default` (os valores eram idênticos aos padrões);
- a migração de estado virou um `if matches!(...)` — o `match` tinha um único
  braço útil e um `_ => {}` vazio;
- `return` desnecessários dentro de blocos `#[cfg]` em `media/mod.rs`;
- `and_then(|x| Some(y))` → `map` e `&tray.app_handle()` → `tray.app_handle()`;
- `match` aninhado do `RunEvent::WindowEvent` colapsado em um único padrão;
- alias `CoverArtPayload` para a tupla de quatro `Option` do SMTC;
- `#[allow(clippy::too_many_arguments)]` em `get_media_artwork`, cujos
  parâmetros vêm do IPC um a um — agrupá-los mudaria o contrato do frontend.

O `cargo fmt` foi aplicado ao crate inteiro, então há diffs de espaçamento em
arquivos fora do Radar (`lib.rs`, `media/*`, `metrics/*`, `ollama.rs`).

### Verificado e deliberadamente não alterado

`src/lib/services/exchange.ts` continua fazendo `fetch()` para a AwesomeAPI, e a
CSP em `tauri.conf.json` ainda libera esse domínio. O arquivo alimenta a taxa do
cabeçalho — uma feature separada do ticker do Radar, com testes verdes. Removê-lo
agora quebraria a UI existente sem substituto pronto, já que o ticker do Radar
ainda não tem frontend. Fica como parte da etapa 9.

---

## Comandos de validação — resultado real

Estado em 31/07/2026, após a migração do frontend e a verificação em execução.

| Comando | Exit | Resultado |
|---|---:|---|
| `npm run typecheck` | 0 | ✅ |
| `npm test` | 0 | ✅ **289 passed**, 49 skipped |
| `npm run build` | 0 | ✅ |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 0 | ✅ **207 passed, 0 failed** (baseline: 43, e não compilava) |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | 0 | ✅ 0 diffs no crate inteiro |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | 0 | ✅ 0 erros no crate inteiro |
| `cargo test --features live-provider-tests provider_contract` | 0 | ✅ **5 passed** contra endpoints reais |
| `npx tauri build --no-bundle` | 0 | ✅ binário release gerado e executado |

Testes: **207 Rust + 289 frontend**. Nenhum teste foi desabilitado, nenhuma
strictness foi reduzida, nenhum stub de dependência foi criado, nenhum
`#[allow]` foi usado para esconder defeito — apenas para marcar costuras de
etapas explicitamente não entregues e um contrato de IPC que não pode mudar.
