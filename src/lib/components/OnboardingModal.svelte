<script>
  import { tick } from 'svelte';
  import MonitorSelector from './MonitorSelector.svelte';
  import { storage } from '../services/storage.js';
  import { showToast } from '../stores/ui-store.js';
  import {
    startupEnabled,
    toggleStartup,
    addTask,
    completeOnboarding,
    closeOnboarding
  } from '../stores/app-store.js';
  import { PRIORITY } from '../config.js';

  const TOTAL_STEPS = 4;
  const SUGGESTED_TASK = 'Definir as 3 prioridades do dia em 5 minutos';

  let dialogEl;
  let step = 1;
  let addingSuggestion = false;

  $: progress = Math.round((step / TOTAL_STEPS) * 100);
  $: isFirstStep = step === 1;
  $: isLastStep = step === TOTAL_STEPS;
  $: startupUnsupported = storage.mode !== 'tauri';

  function focusDialog() {
    tick().then(() => dialogEl?.focus());
  }

  function nextStep() {
    if (isLastStep) return;
    step += 1;
    focusDialog();
  }

  function previousStep() {
    if (isFirstStep) return;
    step -= 1;
    focusDialog();
  }

  async function handleFinish() {
    const ok = await completeOnboarding();
    if (ok) {
      closeOnboarding();
      document.getElementById('task-input')?.focus();
    }
  }

  async function handleAddSuggestion() {
    addingSuggestion = true;
    const id = await addTask(SUGGESTED_TASK, PRIORITY.MEDIUM);
    addingSuggestion = false;
    if (id) {
      showToast('Primeira tarefa criada');
      document.getElementById('task-input')?.focus();
    }
  }

  async function handleStartupToggle() {
    if (startupUnsupported) return;
    await toggleStartup();
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (isLastStep) handleFinish();
      return;
    }
    if (e.key === 'ArrowRight' && !isLastStep) {
      e.preventDefault();
      nextStep();
    }
    if (e.key === 'ArrowLeft' && !isFirstStep) {
      e.preventDefault();
      previousStep();
    }
  }
</script>

<div class="onboarding-overlay" role="presentation">
  <div
    class="onboarding-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="onboarding-title"
    tabindex="-1"
    bind:this={dialogEl}
    on:keydown={handleKeydown}
  >
    <header class="onboarding-header">
      <p class="onboarding-kicker">FocusWall setup</p>
      <h2 id="onboarding-title">{step === 1 ? 'Bem-vindo ao seu foco diário.' : 'Configuração inicial rápida.'}</h2>
      <p class="onboarding-meta">Etapa {step} de {TOTAL_STEPS}</p>
      <div class="onboarding-progress" aria-hidden="true">
        <span style="width: {progress}%"></span>
      </div>
    </header>

    <div class="onboarding-content">
      {#if step === 1}
        <section class="onboarding-section" aria-label="Proposta de valor">
          <h3>Menos atrito. Mais execução.</h3>
          <p>
            O FocusWall mantém seu plano visível o dia inteiro: tarefas essenciais, contexto de tempo e um fluxo direto para agir.
          </p>
          <ul>
            <li>Painel sempre à vista.</li>
            <li>Entrada de tarefas sem distrações.</li>
            <li>Ritmo diário com progresso claro.</li>
          </ul>
        </section>
      {:else if step === 2}
        <section class="onboarding-section" aria-label="Preferências iniciais">
          <h3>Ajuste o ambiente base.</h3>
          <p>Confirme onde o FocusWall será exibido e se deve abrir junto com o Windows.</p>

          <MonitorSelector />

          <label class="startup-toggle" class:disabled={startupUnsupported}>
            <input
              type="checkbox"
              checked={$startupEnabled}
              disabled={startupUnsupported}
              on:change={handleStartupToggle}
            />
            <span>
              <strong>Iniciar com o Windows</strong>
              <small>
                {#if startupUnsupported}
                  Disponível apenas no app desktop Tauri.
                {:else}
                  Ative para deixar o painel pronto desde o login.
                {/if}
              </small>
            </span>
          </label>
        </section>
      {:else if step === 3}
        <section class="onboarding-section" aria-label="Explicação do painel">
          <h3>Como o painel funciona em 10 segundos.</h3>
          <ul>
            <li><strong>Esquerda:</strong> relógio e contexto rápido.</li>
            <li><strong>Centro:</strong> criação e progresso das tarefas do dia.</li>
            <li><strong>Topo:</strong> histórico curto para revisar dias anteriores.</li>
            <li><strong>Configurações:</strong> ajuste monitor e reabra este guia quando quiser.</li>
          </ul>
        </section>
      {:else}
        <section class="onboarding-section" aria-label="Primeira tarefa">
          <h3>Comece com uma primeira entrega.</h3>
          <p>Use a sugestão abaixo ou escreva sua prioridade agora mesmo.</p>
          <div class="suggestion-card">
            <p>{SUGGESTED_TASK}</p>
            <button
              type="button"
              class="ghost-button"
              on:click={handleAddSuggestion}
              disabled={addingSuggestion}
            >
              {addingSuggestion ? 'Adicionando...' : 'Usar sugestão'}
            </button>
          </div>
        </section>
      {/if}
    </div>

    <footer class="onboarding-footer">
      <button
        type="button"
        class="ghost-button"
        on:click={previousStep}
        disabled={isFirstStep}
      >
        Voltar
      </button>

      {#if isLastStep}
        <button type="button" class="primary-button" on:click={handleFinish}>
          Concluir setup
        </button>
      {:else}
        <button type="button" class="primary-button" on:click={nextStep}>
          Continuar
        </button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .onboarding-overlay {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(5, 8, 6, 0.72);
    backdrop-filter: blur(8px);
  }

  .onboarding-modal {
    width: min(760px, 100%);
    max-height: 90vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    background: var(--surface-dark-strong);
    border: 1px solid var(--surface-dark-border);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    color: var(--light-main);
  }

  .onboarding-header,
  .onboarding-footer {
    padding: 20px 24px;
    border-color: var(--surface-dark-border);
  }

  .onboarding-header {
    border-bottom: 1px solid var(--surface-dark-border);
    display: grid;
    gap: 8px;
  }

  .onboarding-kicker {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--light-soft);
    font-weight: 700;
  }

  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 3vw, 2.4rem);
    letter-spacing: -0.04em;
    color: var(--light-strong);
  }

  .onboarding-meta {
    margin: 0;
    color: var(--light-soft);
    font-size: 13px;
  }

  .onboarding-progress {
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .onboarding-progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--accent), var(--accent-strong));
    transition: width 180ms ease;
  }

  .onboarding-content {
    padding: 22px 24px;
    overflow-y: auto;
  }

  .onboarding-section {
    display: grid;
    gap: 14px;
  }

  h3 {
    margin: 0;
    font-size: 1.3rem;
    color: var(--light-strong);
  }

  p,
  li {
    margin: 0;
    line-height: 1.55;
    color: var(--light-muted);
  }

  ul {
    margin: 0;
    padding-left: 20px;
    display: grid;
    gap: 8px;
  }

  .startup-toggle {
    margin-top: 4px;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: flex-start;
    padding: 14px;
    border: 1px solid rgba(245, 236, 223, 0.1);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.04);
  }

  .startup-toggle input {
    margin-top: 3px;
    accent-color: var(--accent);
  }

  .startup-toggle small {
    display: block;
    margin-top: 4px;
    color: var(--light-soft);
  }

  .startup-toggle.disabled {
    opacity: 0.7;
  }

  .suggestion-card {
    padding: 14px;
    border-radius: var(--radius-md);
    border: 1px solid rgba(245, 236, 223, 0.1);
    background: rgba(255, 255, 255, 0.04);
    display: grid;
    gap: 10px;
    justify-items: flex-start;
  }

  .onboarding-footer {
    border-top: 1px solid var(--surface-dark-border);
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .onboarding-footer .primary-button,
  .onboarding-footer .ghost-button {
    min-height: 44px;
  }
</style>
