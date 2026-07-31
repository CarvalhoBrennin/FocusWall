# Relatório técnico — Radar corrigido e endurecido

## Resultado

A implementação da aba **Radar** foi revisada e corrigida de ponta a ponta. O pacote atual preserva a arquitetura Svelte 5/Tauri 2, migra o estado para a versão 8, mantém o cache do Radar separado do estado funcional e elimina os bloqueadores encontrados no code review: coerção numérica indevida, localização implícita no preview, perda de estado por concorrência, bypass de IP privado, semântica incorreta de timestamps, lockfile inconsistente, falhas silenciosas de atualização e lacunas relevantes de segurança, cache, acessibilidade e testes.

O pacote é entregue somente como código-fonte. O executável Windows antigo foi removido porque não correspondia ao código revisado.

## Correções consolidadas

| Área | Correção aplicada |
|---|---|
| Normalização | Somente valores realmente numéricos e finitos são aceitos. `null`, string vazia, booleanos, `NaN` e infinitos não viram zero. |
| Preview | Nenhuma cidade é presumida. Sem localização explícita, o clima fica indisponível/configurável e as notícias fictícias continuam disponíveis. |
| Persistência | Todas as gravações de `dashboard-state.json` passam por uma fila global. Cada operação relê o estado mais recente e publica somente o domínio confirmado. |
| Concorrência | Radar, tarefas, calendário, notas Neural, tema, locale e demais preferências deixam de sobrescrever alterações concorrentes. O debounce usa geração monotônica para ignorar publicação obsoleta. |
| URLs | Bloqueio de HTTP, credenciais, localhost, subdomínios `.localhost`, `.local`, IPv4 privados, loopback, link-local, multicast, unspecified e IPv4 mapeado em IPv6. |
| Timestamps | `generatedAt` não é mais usado como idade dos dados. A UI usa `fetchedAt` real; timestamps inválidos ou mais de cinco minutos no futuro são rejeitados. |
| Cooldown | O refresh manual expõe `refreshAvailableAt`, desabilita o botão durante 30 segundos e informa o horário de liberação. |
| Erros | Falhas de load/refresh/cache permanecem visíveis sem remover o snapshot anterior. |
| Categorias | Categorias habilitadas são persistidas separadamente da categoria selecionada em runtime. Troca de categorias invalida somente a seção de notícias e força reavaliação. |
| Busca de cidade | Debounce de 350 ms, geração para descartar respostas antigas, pausa/inatividade impedindo novas buscas, deduplicação e fechamento seguro do modal. |
| Acessibilidade | Focus trap, foco inicial, restauração de foco, Escape, conteúdo de fundo `inert`, anúncios `aria-live`, estados e controles acessíveis. |
| Layout | Um único scroll vertical principal; previsão horária quebra em grid responsivo, sem depender de overflow horizontal. |
| Cache | Schema versionado validado, limite de 1 MiB, quarantine sem duplicar arquivos enormes, pruning, validação semântica, recuperação de `.tmp`/`.bak` e coordenação de leitura/escrita. |
| Escrita do cache | Rename atômico em Unix; fallback crash-safe com backup e recuperação em plataformas sem substituição direta. |
| HTTP | Deadline total de 8 segundos incluindo retry/backoff, até duas tentativas apenas para falhas transitórias, limites de stream e content type. |
| Feeds | Parser XML streaming estruturado com `quick-xml`, sem regex, com limite de bytes, eventos, profundidade e entradas; DTD rejeitada; HTML não chega à UI. |
| Atom/RSS | Prioridade para link `alternate`, depois link sem `rel`, depois HTTPS válido; deduplicação por URL/título e truncamento Unicode seguro. |
| Resiliência | Falha ao construir o cliente HTTP desabilita apenas as integrações do Radar e não impede a inicialização do FocusWall. |
| Build reproduzível | `Cargo.toml` usa versões exatas já resolvidas no `Cargo.lock`: `quick-xml = 0.38.4` e `url = 2.5.8`. |
| Distribuição | Binário e instalador antigos removidos; pasta Windows contém instrução explícita de rebuild. |

## Arquivos criados nesta revisão

- `src/lib/services/state-persistence.ts` — fila global de persistência do estado funcional.
- `src/lib/services/state-persistence.test.ts` — serialização, ordem e recuperação após falha.
- `FocusWall-Windows/README.md` — orientação para gerar artefato Windows coerente.

## Principais arquivos alterados

### Frontend

- `src/lib/types/radar.ts`
- `src/lib/utils/radar.ts`
- `src/lib/utils/radar.test.ts`
- `src/lib/services/radar.ts`
- `src/lib/services/radar.fixture.ts`
- `src/lib/services/radar.test.ts`
- `src/lib/stores/radar-store.ts`
- `src/lib/stores/radar-store.test.ts`
- `src/lib/stores/app-store.ts`
- `src/lib/stores/app-store.test.ts`
- `src/lib/stores/calendar-store.ts`
- `src/lib/stores/neural-store.ts`
- `src/lib/utils/focus-trap.ts`
- `src/lib/components/radar/*.svelte`
- `src/lib/components/radar/radar.css`
- `src/lib/i18n/messages.ts`

### Backend

- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/src/lib.rs`
- `src-tauri/src/radar/models.rs`
- `src-tauri/src/radar/cache.rs`
- `src-tauri/src/radar/http.rs`
- `src-tauri/src/radar/security.rs`
- `src-tauri/src/radar/weather.rs`
- `src-tauri/src/radar/news.rs`
- `src-tauri/src/radar/mod.rs`

### Documentação e distribuição

- `README.md`
- `CHANGELOG.md`
- `RADAR_IMPLEMENTATION_REPORT.md`
- removidos `FocusWall-Windows/release/focus-desktop-dashboard.exe` e `FocusWall-Windows/Instalar-FocusWall.bat` por estarem desatualizados.

## Decisões técnicas

### Parser de feeds

A dependência proposta originalmente, `feed-rs`, exigiria regenerar uma árvore de dependências indisponível neste ambiente. Foi adotado `quick-xml = 0.38.4`, já presente no lockfile original, com parser streaming específico para os campos necessários do MVP. O parser:

- reconhece RSS, Atom e RDF;
- rejeita DTD;
- limita payload, eventos, profundidade, entradas e caracteres por campo;
- resolve apenas referências XML predefinidas e referências numéricas;
- não retorna descrição, conteúdo, autor, imagem ou HTML ao frontend;
- preserva falha parcial por fonte.

Esse é um desvio deliberado da sugestão de biblioteca da especificação, mantendo a exigência principal de não usar parser XML por regex e preservando build reproduzível com o lockfile entregue.

### Persistência funcional

A fila global `enqueueStatePersistence` é compartilhada por todos os domínios que gravam `dashboard-state.json`. A operação monta seu payload dentro da fila, a partir do estado mais recente. Após sucesso, somente o domínio alterado é aplicado sobre o estado atual em memória. Isso evita tanto lost update em disco quanto rollback acidental de mudanças otimistas ocorridas durante o `await`.

### Cache operacional

O cache Radar continua fora do backup funcional. O backend serializa refreshes, mas não mantém lock de cache durante rede. Leitura e escrita são coordenadas por lock próprio, com validação e pruning antes da persistência.

## Segurança e privacidade

- chamadas externas somente no Rust;
- CSP do WebView sem novos domínios de rede;
- somente HTTPS e porta padrão para providers;
- redirects limitados ao mesmo host permitido;
- abertura externa sem shell;
- URLs de artigo novamente validadas no comando Tauri;
- consultas de cidade, coordenadas completas, títulos, URLs e conteúdo de feeds não são logados;
- cidade e coordenadas permanecem no armazenamento local, exceto os parâmetros técnicos enviados ao provider meteorológico;
- nenhum HTML remoto é renderizado;
- nenhuma geolocalização automática;
- cache de notícias não entra em `dashboard-state.json` nem no backup funcional.

## Testes adicionados ou ampliados

- **55 casos frontend** contabilizados nos arquivos Radar, persistência global e integração de estado.
- **31 casos Rust** contabilizados no módulo Radar.

Cobertura ampliada para:

- valores nulos/vazios/booleanos e números não finitos;
- timestamps inválidos e futuros;
- URLs locais, privadas e IPv4 mapeado em IPv6;
- preview sem localização e filtro de categorias;
- cache antes de refresh, stale, fonte solicitada ausente com cache parcialmente fresh, falha parcial, geração antiga, pausa, timers e cooldown;
- concorrência entre Radar, calendário e Neural;
- forecast incompleto, arrays desalinhados, limites e ordenação horária;
- geocoding, locale, query e deduplicação;
- RSS/Atom, entities, DTD, links, dedupe e limites;
- cache expirado, versão, corrupção, pruning e recuperação de troca interrompida.

## Validações executadas

### Aprovadas

- `tsc -p /tmp/focuswall-tscheck/tsconfig.prod.json --pretty false` — passou para TypeScript de produção com stubs somente para dependências externas ausentes.
- `tsc -p /tmp/focuswall-tscheck/tsconfig.tests.json --pretty false` — passou para os testes novos e alterados.
- Compilação isolada e execução Node dos normalizadores/fixtures — passou (`runtime assertions: ok`).
- `git diff --check` — passou.
- Varredura de delimitadores de todos os módulos `src-tauri/src/radar/*.rs` — passou.
- Fixtures JSON e XML e arquivos TOML — validados estruturalmente.
- `Cargo.lock` — contém `quick-xml 0.38.4` e `url 2.5.8` como dependências do pacote principal.
- Ausência de `TODO`, `FIXME`, `unsafe`, `{@html}` e chamadas frontend `fetch()` na feature Radar — verificada.

### Comandos oficiais bloqueados pelo ambiente

| Comando | Resultado exato resumido | Classificação |
|---|---|---|
| `npm run typecheck` | `TS2688: Cannot find type definition file for 'vite/client'` | dependências npm ausentes |
| `npm test` | `vitest: not found` | dependências npm ausentes |
| `npm run build` | `vite: not found` | dependências npm ausentes |
| `npm ci --ignore-scripts` | HTTP 404 do registry interno para `zimmerframe-1.1.4.tgz` | registry do ambiente |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | `cargo: No such file or directory` | toolchain ausente |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | `cargo: No such file or directory` | toolchain ausente |
| `cargo test --manifest-path src-tauri/Cargo.toml` | `cargo: No such file or directory` | toolchain ausente |

Os logs completos desta execução ficaram em `/tmp/focuswall-final-validation` no ambiente de trabalho e não foram incluídos no pacote por serem artefatos temporários.

## Validação manual

Não foi possível iniciar o desktop Tauri neste ambiente. Permanecem para o ambiente Windows do projeto:

- teste online dos providers;
- offline com cache fresh/stale/expirado;
- corrupção real do cache;
- minimizar/retomar e troca rápida de tab/cidade;
- abertura no navegador padrão;
- temas dark/light/olive;
- 1100 × 720 e zoom 125%/150%;
- build e instalação do executável final.

## Riscos residuais

1. O código Rust foi revisado estruturalmente, mas não foi compilado, formatado por `rustfmt` nem submetido a Clippy neste ambiente por ausência da toolchain.
2. Os componentes Svelte não foram compilados com o compilador real nesta rodada porque `node_modules` não pôde ser restaurado pelo registry interno.
3. O parser de feeds aceita XML UTF-8; feeds com encoding legado são rejeitados como falha da fonte, preservando o cache válido quando disponível.
4. Disponibilidade e licenciamento dos providers devem ser revalidados antes de distribuição comercial.

## Pendências de ambiente

1. Executar `npm ci`, `npm run typecheck`, `npm test` e `npm run build` em registry npm funcional.
2. Executar `cargo fmt`, `cargo clippy --all-targets -- -D warnings` e `cargo test` com toolchain Rust compatível.
3. Executar `npm run tauri:build` e a matriz manual desktop.
4. Distribuir somente binários gerados a partir deste código e registrar o SHA-256 do release.
