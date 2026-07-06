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
      event.preventDefault();
      submit();
    }
  }
</script>

<form
  class="assistant-composer"
  style="height: 6.25rem; min-height: 6.25rem; max-height: 6.25rem;"
  onsubmit={(event) => {
    event.preventDefault();
    submit();
  }}
>
  <label class="sr-only" for="assistant-prompt">{$t('assistant.inputLabel')}</label>
  <textarea
    id="assistant-prompt"
    rows="3"
    value={value}
    placeholder={$t('assistant.placeholder')}
    disabled={disabled || sending}
    style="height: 5rem; min-height: 5rem; max-height: 5rem; resize: none;"
    oninput={(event) => onInput(event.currentTarget.value)}
    onkeydown={handleKeydown}
  ></textarea>
  <button
    class="primary-button"
    type="button"
    disabled={sending ? false : (!value.trim() || disabled)}
    onclick={handleButtonClick}
    style="height: 3rem; min-height: 3rem; max-height: 3rem; align-self: start;"
  >
    {sending ? $t('assistant.cancel') : $t('assistant.send')}
  </button>
</form>

<style>
  .assistant-composer {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 5.6rem !important;
    align-items: start !important;
    gap: 0.55rem;
    flex: 0 0 auto !important;
    padding: 0.58rem 0.72rem;
    overflow: hidden;
  }

  .assistant-composer textarea {
    width: 100%;
    overflow: auto;
  }

  .assistant-composer .primary-button {
    width: 5.6rem !important;
    min-width: 5.6rem !important;
    max-width: 5.6rem !important;
    justify-self: stretch;
  }

  @media (max-width: 760px) {
    .assistant-composer {
      grid-template-columns: minmax(0, 1fr) !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible;
    }

    .assistant-composer .primary-button {
      width: 100% !important;
      max-width: none !important;
    }
  }
</style>
