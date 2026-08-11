# FocusWall Radar — Plano de reconstrução

## 1. Objetivo

Reconstruir a aba Radar como uma central editorial, meteorológica e contextual nativa do FocusWall, mantendo Svelte 5, TypeScript, Tauri 2 e Rust. A implementação anterior é tratada apenas como baseline técnico. O resultado deve priorizar contexto brasileiro, alta densidade informacional, operação offline, falhas parciais, segurança de rede e consistência nos temas dark, light e olive.

## 2. Decisões de produto

1. A tela será uma composição editorial contínua, com um único scroll principal. Não será um mosaico de cards administrativos.
2. A localização meteorológica será sempre explícita. Na ausência de seleção, o clima exibirá um estado editorial de configuração, sem cidade presumida.
3. A abertura de notícias ocorrerá primeiro em drawer interno. Somente um botão explícito poderá abrir o navegador.
4. O Radar exibirá resumos fornecidos por feeds/APIs; não reproduzirá matéria integral nem renderizará HTML remoto.
5. Alertas derivados do modelo meteorológico serão marcados como não oficiais. Não serão apresentados como alertas de Defesa Civil.
6. O ticker usará dados sem segredo: PTAX/BCB para câmbio, AwesomeAPI para cripto e USGS para eventos sísmicos. Ibovespa não será incluído sem provider estável, licenciado e sem chave.
7. Um mapa meteorológico externo não será incorporado nesta entrega: tiles gratuitos normalmente têm restrições de uso, atribuição e estabilidade incompatíveis com uma aplicação desktop comercial. Será usada uma visualização local de precipitação baseada na previsão horária.

## 3. Arquitetura-alvo

### 3.1 Frontend

- `types/radar.ts`: contratos normalizados para clima, notícias, mercado, eventos, fontes e cache.
- `utils/radar.ts`: validação defensiva, normalização, WMO, recência, scoring editorial, deduplicação e formatação.
- `services/radar.ts`: única fachada de IPC; nenhuma chamada HTTP direta.
- `stores/radar-store.ts`: ciclo de vida, cancelamento lógico, cooldown, pausa, filtro e seleção de notícia.
- Componentes especializados: toolbar, clima hero, previsão horária, precipitação, sete dias, edição de notícias, drawer, ticker e fontes.
- Imagens são solicitadas por chave opaca; nenhuma URL remota é passada ao atributo `src`.

### 3.2 Backend Rust

- Cliente `reqwest` único, HTTPS, timeout, redirects manuais e retry limitado.
- Allowlist por provider e por tipo de recurso.
- Validação de DNS e bloqueio de localhost, faixas privadas, link-local, CGNAT, documentação, benchmarking, IPv6 local e IPv4 mapeado.
- Providers isolados: uma falha não invalida as demais seções/fontes.
- Parser RSS/Atom com limites de bytes, eventos e profundidade; DTD rejeitado.
- Parser TabNews JSON.
- Open Graph obtido somente pelo backend, apenas para hosts de artigo permitidos.
- Imagens validadas por MIME e assinatura, decodificadas, dimensionadas, reencodadas para JPEG e armazenadas com quota.
- Abertura externa por ID de artigo/evento/provider resolvido no backend.

## 4. Providers

### 4.1 Clima e geocodificação

Open-Meteo, sem chave. Serão usados forecast e geocoding. O timezone retornado deve coincidir com o timezone da localização selecionada. A abstração permanecerá encapsulada para substituição futura. A edição gratuita pública possui restrições para uso comercial; isso será documentado como risco de homologação e opção de self-host/licença comercial.

### 4.2 Notícias

- Agência Brasil: Brasil, ciência, economia e mundo.
- Tecnoblog: tecnologia, segurança, negócios digitais.
- TI Inside: tecnologia corporativa e negócios.
- TabNews: desenvolvimento e comunidade técnica.
- BrazilJS: desenvolvimento web.
- GitHub Blog: complemento internacional de desenvolvimento.

As fontes serão atualizadas separadamente. Artigos serão classificados por palavras-chave, deduplicados por URL e título normalizado e ranqueados por recência, contexto brasileiro, imagem, resumo e prioridade da fonte.

### 4.3 Mercado e contexto

- Banco Central do Brasil/Olinda PTAX: USD/BRL e EUR/BRL.
- AwesomeAPI: BTC/BRL e ETH/BRL.
- USGS GeoJSON: terremotos globais recentes.

## 5. UX e composição

1. Masthead com título, estado, localização, última atualização, cache e ação de atualizar.
2. Clima principal com temperatura, condição, sensação, máxima/mínima, métricas, nascer/pôr do sol e avisos.
3. Linha horária de 12 a 24 horas com navegação horizontal contida, sem overflow da página.
4. Gráfico local de precipitação e previsão de sete dias.
5. Manchete principal com imagem, resumo e metadados.
6. Grade secundária de diferentes proporções e lista compacta paginada por expansão.
7. Filtros de visualização e gerenciamento de assuntos persistidos.
8. Drawer com foco retido, restauração de foco, Escape e botão de abertura externa.
9. Ticker inferior com mercado, alertas, eventos e timestamp.
10. Rodapé de providers com estado fresh/stale/unavailable.

## 6. Estados

- Inicial sem cache.
- Sem localização.
- Carregando com skeleton geometricamente compatível com o layout final.
- Fresh.
- Stale com indicação de idade.
- Offline usando cache.
- Falha parcial por fonte/provider.
- Seção indisponível sem colapsar o restante.
- Cooldown de atualização manual.
- Troca rápida de cidade com descarte lógico de resposta antiga.
- Pausa global e aba inativa sem polling.

## 7. Cache e persistência

- Cache Radar v2 separado do estado funcional.
- TTL: clima 15 min fresh/8 h stale; notícias 10 min/48 h; mercado 5 min/24 h; eventos 10 min/24 h.
- Cache corrompido será colocado em quarentena.
- Escrita em temporário, `sync_all` e replace crash-safe.
- Migração conservadora de notícias v1; clima v1 incompatível será descartado.
- Máximo de quatro localizações meteorológicas.
- Imagens em diretório próprio, JPEG normalizado, quota aproximada de 40 MB e remoção LRU por data de modificação.
- Estado funcional continua usando a fila serializada existente, preservando tarefas, eventos, notas e preferências.

## 8. Segurança e LGPD

- Frontend sem rede externa.
- CSP sem hosts de providers em `connect-src`.
- Nenhum HTML remoto renderizado.
- Nenhuma URL remota usada diretamente como imagem.
- URLs limitadas, HTTPS/443, sem credenciais e sem fragmento.
- Redirects limitados e revalidados.
- Respostas limitadas por bytes e content-type.
- Strings remotas sem tags e com limites de tamanho.
- Logs sem consulta de cidade, coordenadas, URL completa ou título.
- Persistência local mínima: cidade escolhida, dados públicos em cache e chaves opacas de imagem.
- Sem geolocalização automática, consentimento implícito ou envio de dados pessoais.

## 9. Performance

- Cache-first para primeira renderização.
- Imagens lazy com `IntersectionObserver`, cache em memória limitado e cache em disco.
- Enriquecimento Open Graph limitado às primeiras matérias sem imagem.
- Downloads de imagens concorrentes e limitados.
- Lista adicional expandida sob demanda.
- Nenhum polling quando aba inativa ou aplicativo pausado.
- Respostas antigas descartadas por geração lógica no store.
- `prefers-reduced-motion` desativa ticker animado e transições não essenciais.

## 10. Acessibilidade

- Landmarks e headings consistentes.
- Filtros com `aria-pressed`.
- Estados anunciados por `aria-live`.
- Focus trap no drawer e seletor de localização.
- Escape fecha overlays e foco retorna ao acionador.
- Foco visível nos três temas.
- Conteúdo acionável usa botão; artigos não são links externos implícitos.
- Contraste e targets compatíveis com desktop e zoom.

## 11. Responsividade e temas

Validar 1100×720, 1366×768 e 1920×1080; zoom 125% e 150%. Usar container queries e breakpoints para reorganizar colunas sem overflow horizontal. Dark, light e olive reutilizam tokens globais e acrescentam apenas tokens semânticos locais. Textos longos usam line clamp somente nas capas; o drawer preserva leitura integral do resumo.

## 12. Testes planejados

### Frontend

- Normalização de todos os contratos e valores inválidos.
- URL privada, IPv4 mapeado, categorias e deduplicação.
- Scoring editorial e seleção de manchete.
- Serviço IPC, imagem por chave, abertura por ID e fixture.
- Store: cache, refresh, geração, troca rápida, pausa, cooldown e falha parcial.
- Persistência e migração de preferências.
- Ticker e drawer por funções puras/contratos.

### Rust

- SSRF e allowlists.
- Content-type, limite, retry e redirect.
- RSS, Atom, entidades, DTD, links, resumo, autor e mídia.
- TabNews.
- Open Graph.
- Imagem: formato, assinatura, dimensões e reencode.
- Forecast, timezone, 12+ horas e sete dias.
- Geocoding e deduplicação.
- PTAX, cripto, tendências e formatação.
- USGS e severidade.
- Cache fresh/stale/expirado/corrompido/migrado e replace crash-safe.
- Snapshot parcial e compatibilidade de preferências.

## 13. Critérios de aceite

- Cidade real selecionável, persistida e nunca presumida.
- Clima atual, 12+ horas e sete dias.
- Notícias brasileiras por múltiplas fontes.
- Imagens quando feed/Open Graph permitir, com fallback editorial.
- Preview interno antes do navegador.
- Ticker com timestamp.
- Cache offline e stale visíveis.
- Falha parcial preserva seções saudáveis.
- Três temas, sem overflow horizontal e com navegação por teclado.
- Rede exclusivamente no Rust e URLs/imagens validadas.
- Testes e comandos registrados com resultado real.
- ZIP limpo, sem dependências, builds, executáveis antigos ou temporários.

## 14. Pendências e decisões de homologação

- Confirmar enquadramento comercial do Open-Meteo; para produção comercial, contratar plano ou self-host.
- Feeds públicos podem alterar URL/esquema sem aviso; o design tolera falha parcial e provider replacement.
- AwesomeAPI é serviço de terceiros; BCB permanece fonte oficial apenas para câmbio.
- USGS cobre terremotos, não substitui Defesa Civil brasileira.
- A proteção contra DNS rebinding valida todas as resoluções antes da requisição, mas existe janela TOCTOU entre validação e resolução interna do cliente; pinagem de DNS por conexão é evolução recomendada para threat model extremo.
