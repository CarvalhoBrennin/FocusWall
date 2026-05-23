# Plano — Métricas de RAM e CPU no InfoRail

## Objetivo

Exibir uso de memória e CPU do sistema em tempo real no painel esquerdo (InfoRail), abaixo do relógio ou câmbio, com polling leve e visual alinhado ao tema brutalista.

## Abordagem recomendada (Tauri / Rust)

### Backend

Adicionar dependência `sysinfo` no `src-tauri/Cargo.toml`:

```toml
sysinfo = "0.33"
```

Comando novo:

```rust
#[tauri::command]
fn get_system_metrics() -> Result<SystemMetrics, String> {
    // cpu_usage: f32 (0-100)
    // memory_used_mb: u64
    // memory_total_mb: u64
    // memory_percent: f32
}
```

Registrar em `lib.rs` + `permissions/app-commands.toml` + rebuild ACL.

### Frontend

- Componente `SystemMetricsCard.svelte` no InfoRail
- Poll a cada 3–5s (não a cada 1s — `sysinfo` refresh de CPU precisa de intervalo)
- Barra horizontal quadrada para RAM e CPU
- Pausar polling quando `$paused === true` (mesmo hook do relógio)

### Estrutura UI

```
┌─────────────────────────┐
│ SISTEMA                 │
│ CPU  ████░░░░  42%      │
│ RAM  ██████░░  68%      │
│ 10.8 / 16 GB            │
└─────────────────────────┘
```

## Alternativa (sem Rust)

- **Não recomendado** — WebView não expõe métricas reais do SO
- `@tauri-apps/plugin-os` não fornece CPU/RAM contínuos

## Performance

| Parâmetro | Valor |
|-----------|-------|
| Intervalo | 4000 ms |
| Refresh CPU | 2 amostras sysinfo antes de ler |
| Pausa em fullscreen/hidden | Sim |

## ACL

Adicionar `get_system_metrics` em `app-commands.toml` antes do deploy.

## Fases

1. Comando Rust + card estático
2. Polling + integração com `paused`
3. Opcional: top 3 processos (`sysinfo::Process`)
4. Opcional: alerta visual se RAM > 90%

## Testes

- Windows 10/11 com 1 e 2 monitores
- Verificar que build release inclui permissão ACL
- Confirmar que métricas param quando janela oculta
