<script>
  import { onDestroy, tick, untrack } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import { spawnOpenCode, checkOpenCodeAvailable } from '../services/opencode.js';

  /** @type {{ active?: boolean, workdir?: string, onSessionEnd?: () => void }} */
  let { active = false, workdir = '', onSessionEnd = () => {} } = $props();

  let host = $state(null);
  let ready = $state(false);
  let error = $state('');

  /** @type {Terminal | null} */
  let term = null;
  /** @type {FitAddon | null} */
  let fitAddon = null;
  /** @type {ReturnType<typeof spawnOpenCode> | null} */
  let pty = null;
  /** @type {ResizeObserver | null} */
  let resizeObserver = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let resizeTimer = null;
  let bootstrapped = false;
  let sessionEnded = false;

  /** @type {{ cols: number, rows: number }} */
  let lastPtySize = { cols: 0, rows: 0 };
  /** @type {{ width: number, height: number }} */
  let lastHostSize = { width: 0, height: 0 };

  const RESIZE_DEBOUNCE_MS = 250;
  const RESIZE_EPSILON = 2;

  async function waitForLayout() {
    await tick();
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function setTerminalInputEnabled(enabled) {
    if (!term) return;
    term.options.disableStdin = !enabled;
  }

  function syncPtySize(cols, rows) {
    if (!pty || !active || !cols || !rows) return;
    if (cols === lastPtySize.cols && rows === lastPtySize.rows) return;
    lastPtySize = { cols, rows };
    pty.resize(cols, rows);
  }

  function fitTerminal() {
    if (!fitAddon || !term || !host || !active) return false;

    const beforeCols = term.cols;
    fitAddon.fit();
    const changed = term.cols !== beforeCols || term.rows !== lastPtySize.rows;
    syncPtySize(term.cols, term.rows);
    return changed;
  }

  function scheduleFit(force = false) {
    if (!active || !ready) return;
    if (resizeTimer) clearTimeout(resizeTimer);

    resizeTimer = setTimeout(async () => {
      if (!host) return;

      const width = Math.round(host.clientWidth);
      const height = Math.round(host.clientHeight);
      if (
        !force &&
        Math.abs(width - lastHostSize.width) < RESIZE_EPSILON &&
        Math.abs(height - lastHostSize.height) < RESIZE_EPSILON
      ) {
        return;
      }

      lastHostSize = { width, height };
      await waitForLayout();
      fitTerminal();
    }, RESIZE_DEBOUNCE_MS);
  }

  function finishSession() {
    if (sessionEnded) return;
    sessionEnded = true;
    onSessionEnd();
  }

  function writePtyOutput(data) {
    if (!term || !active) return;
    term.write(data);
  }

  function handleWindowResize() {
    scheduleFit(true);
  }

  async function initTerminal() {
    if (ready || bootstrapped || !host || !workdir) return;
    bootstrapped = true;

    try {
      const available = await checkOpenCodeAvailable();
      if (!available) {
        throw new Error('Comando "opencode" não encontrado no PATH. Instale-o ou adicione ao PATH do sistema.');
      }

      term = new Terminal({
        convertEol: false,
        cursorBlink: true,
        cursorStyle: 'bar',
        customGlyphs: true,
        fontFamily: '"Cascadia Mono", Consolas, "Lucida Console", monospace',
        fontSize: 14,
        fontWeight: '400',
        fontWeightBold: '600',
        lineHeight: 1,
        letterSpacing: 0,
        scrollback: 256,
        scrollOnUserInput: false,
        disableStdin: !active,
        theme: {
          background: '#0A0A0A',
          foreground: '#F1ECEC',
          cursor: '#CFCECD',
          selectionBackground: 'rgba(207, 206, 205, 0.28)',
          black: '#0A0A0A',
          red: '#B55C50',
          green: '#5B8C5B',
          yellow: '#B7B1B1',
          blue: '#4B4646',
          magenta: '#CFCECD',
          cyan: '#B7B1B1',
          white: '#F1ECEC',
          brightBlack: '#656363',
          brightRed: '#B55C50',
          brightGreen: '#5B8C5B',
          brightYellow: '#CFCECD',
          brightBlue: '#B7B1B1',
          brightMagenta: '#F1ECEC',
          brightCyan: '#CFCECD',
          brightWhite: '#FFFFFF'
        }
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.onResize(({ cols, rows }) => syncPtySize(cols, rows));
      term.open(host);

      await waitForLayout();
      lastHostSize = {
        width: Math.round(host.clientWidth),
        height: Math.round(host.clientHeight)
      };
      fitTerminal();

      pty = await spawnOpenCode({
        cols: term.cols,
        rows: term.rows,
        cwd: workdir
      });

      lastPtySize = { cols: term.cols, rows: term.rows };
      pty.onData((data) => writePtyOutput(data));
      pty.onExit(() => finishSession());
      term.onData((data) => {
        if (active && pty) pty.write(data);
      });

      resizeObserver = new ResizeObserver(() => {
        if (active && ready) scheduleFit();
      });
      resizeObserver.observe(host);
      window.addEventListener('resize', handleWindowResize);

      ready = true;
      if (active) term.focus();
    } catch (err) {
      bootstrapped = false;
      error = err?.message || String(err);
    }
  }

  $effect(() => {
    if (!host || !workdir) return;
    if (bootstrapped) return;
    untrack(() => initTerminal());
  });

  $effect(() => {
    if (!ready || !term) return;

    setTerminalInputEnabled(active);

    if (!active) return;

    untrack(async () => {
      await waitForLayout();
      scheduleFit(true);
      term?.focus();
    });
  });

  onDestroy(() => {
    sessionEnded = true;
    window.removeEventListener('resize', handleWindowResize);
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeObserver?.disconnect();
    pty?.kill();
    term?.dispose();
  });
</script>

<section class="terminal-panel" aria-label="Terminal OpenCode">
  {#if error}
    <p class="terminal-error" role="alert">{error}</p>
  {:else}
    <div class="terminal-host" bind:this={host} aria-live="off"></div>
  {/if}
</section>
