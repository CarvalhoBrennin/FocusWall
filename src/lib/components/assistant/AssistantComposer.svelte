<script>
  import { t } from '../../i18n/index.js';

  let {
    value = '',
    disabled = false,
    sending = false,
    onInput = () => {},
    onSubmit = () => {},
    onCancel = () => {}
  } = $props();

  function submit() {
    const text = value.trim();
    if (!text || disabled || sending) return;
    onSubmit(text);
  }

  function handleButtonClick() {
    if (sending) {
      onCancel();
      return;
    }
    submit();
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      // Still swallow Enter while a turn runs, so the draft is not lost to a
      // submit that would be rejected anyway.
      event.preventDefault();
      submit();
    }
  }
</script>

<form
  class="assistant-composer"
  aria-busy={sending}
  onsubmit={(event) => {
    event.preventDefault();
    submit();
  }}
>
  <div class="assistant-composer-field">
    <label class="sr-only" for="assistant-prompt">{$t('assistant.inputLabel')}</label>
    <textarea
      id="assistant-prompt"
      rows="3"
      value={value}
      placeholder={$t('assistant.placeholder')}
      disabled={disabled}
      aria-describedby="assistant-composer-help"
      oninput={(event) => onInput(event.currentTarget.value)}
      onkeydown={handleKeydown}
    ></textarea>
    <span id="assistant-composer-help" class="assistant-composer-hint">{$t('assistant.composerHint')}</span>
  </div>
  <button
    class="primary-button"
    class:is-loading={sending}
    type="button"
    disabled={sending ? false : (!value.trim() || disabled)}
    onclick={handleButtonClick}
    aria-label={sending ? $t('assistant.cancel') : $t('assistant.send')}
  >
    <svg class="assistant-send-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12L20 4L16 20L11 13L4 12Z" />
      <path d="M11 13L20 4" />
    </svg>
    {sending ? $t('assistant.cancel') : $t('assistant.send')}
  </button>
</form>

<style>
  .assistant-composer {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: end !important;
    gap: 0.75rem;
    flex: 0 0 auto !important;
    padding: clamp(0.7rem, 1.2vw, 1rem);
    border-top: 1px solid rgba(207, 206, 205, 0.14);
    background: linear-gradient(180deg, rgba(7, 7, 7, 0.72), #070707 34%);
    overflow: hidden;
  }

  .assistant-composer-field {
    display: grid;
    min-width: 0;
    border: 1px solid rgba(207, 206, 205, 0.22);
    border-radius: var(--radius-lg);
    background: var(--field-bg);
    transition: border-color var(--transition-fast), background-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .assistant-composer-field:focus-within {
    border-color: var(--accent-soft);
    background: var(--field-bg-hover);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .assistant-composer textarea {
    width: 100%;
    min-height: 4rem;
    max-height: 10rem;
    resize: vertical;
    padding: 0.82rem 0.9rem 0.35rem;
    border: 0;
    border-radius: inherit;
    outline: none;
    background: transparent;
    color: var(--light-strong);
    font: inherit;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .assistant-composer textarea::placeholder {
    color: var(--field-placeholder);
  }

  .assistant-composer textarea:focus {
    outline: none;
    box-shadow: none;
  }

  .assistant-composer-hint {
    padding: 0.1rem 0.9rem 0.58rem;
    color: var(--light-soft);
    font-size: 0.66rem;
    line-height: 1.2;
  }

  .assistant-composer .primary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 6.5rem;
    min-height: 3rem;
    gap: 0.45rem;
    padding-inline: 0.9rem;
    border-color: var(--accent-soft);
    background: var(--accent-strong);
    color: var(--app-bg);
    box-shadow: 0 0.6rem 1.4rem rgba(143, 209, 143, 0.12);
  }

  .assistant-composer .primary-button:hover:not(:disabled) {
    border-color: var(--accent-strong);
    background: var(--light-strong);
    color: var(--app-bg);
    transform: translateY(-1px);
  }

  .assistant-composer .primary-button:disabled {
    border-color: var(--control-border);
    background: var(--control-bg);
    color: var(--light-soft);
    box-shadow: none;
    cursor: not-allowed;
  }

  .assistant-composer .primary-button.is-loading {
    border-color: rgba(207, 206, 205, 0.28);
    background: var(--control-bg-active);
    color: var(--light-main);
  }

  .assistant-send-icon {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  @media (max-width: 760px) {
    .assistant-composer {
      grid-template-columns: 1fr !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible;
    }

    .assistant-composer .primary-button {
      width: 100% !important;
      min-width: 0;
    }
  }
</style>
