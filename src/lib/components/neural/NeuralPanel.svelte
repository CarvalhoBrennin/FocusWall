<script>
  import '../../../styles/neural.css';
  import { onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
  import NeuralGraph from './NeuralGraph.svelte';
  import { formatMessage, msg, t } from '../../i18n/index.js';
  import { data } from '../../stores/app-store.js';
  import { showConfirmModal, showToast } from '../../stores/ui-store.js';
  import {
    addNeuralNote,
    deleteNeuralNote,
    ensureNeuralSelection,
    filteredNeuralNotes,
    neuralNotes,
    neuralSearchQuery,
    neuralStats,
    selectNeuralNote,
    selectedNeuralGraph,
    selectedNeuralLinkedBacklinks,
    selectedNeuralLinks,
    selectedNeuralNote,
    selectedNeuralNoteId,
    selectedNeuralUnlinkedBacklinks,
    selectedNeuralUnlinkedMentions,
    updateNeuralNote
  } from '../../stores/neural-store.js';
  import { insertWikiLink, linkFirstUnlinkedMention } from '../../utils/neural.js';

  let { active = false } = $props();

  let draftTitle = $state('');
  let draftContent = $state('');
  let lastLoadedId = $state(null);
  let saveTimer = null;
  let saving = $state(false);
  let linkTargetId = $state('');
  let contentEl = $state(null);
  let noteListEl = $state(null);
  let lastPersistedTitle = $state('');
  let lastPersistedContent = $state('');
  let wasActive = $state(false);

  const hasNotes = $derived(($neuralNotes || []).length > 0);

  function formatNoteStatus(note) {
    if (!note) return msg('neural.noNoteSelected');
    const updated = new Date(note.updatedAt);
    if (Number.isNaN(updated.getTime())) return msg('neural.savedLocally');
    return formatMessage(msg('neural.updatedAt'), {
      date: updated.toLocaleString(get(data).ui?.locale || undefined)
    });
  }

  $effect(() => {
    if (!active) return;
    ensureNeuralSelection();
  });

  $effect(() => {
    if (wasActive && !active) {
      flushSave();
    }
    wasActive = active;
  });

  $effect(() => {
    const note = $selectedNeuralNote;
    if (!note) {
      clearSaveTimer();
      draftTitle = '';
      draftContent = '';
      lastLoadedId = null;
      return;
    }

    const draftMatchesPersisted = draftTitle.trim() === lastPersistedTitle && draftContent === lastPersistedContent;
    const draftMatchesStore = draftTitle.trim() === note.title && draftContent === note.content;

    if (note.id !== lastLoadedId || draftMatchesPersisted) {
      loadDraftFromNote(note);
    } else if (draftMatchesStore) {
      lastPersistedTitle = note.title;
      lastPersistedContent = note.content;
    }
  });

  $effect(() => {
    const notes = $neuralNotes || [];
    if (!linkTargetId || !notes.some((note) => note.id === linkTargetId)) {
      linkTargetId = notes.find((note) => note.id !== $selectedNeuralNoteId)?.id || '';
    }
  });

  onDestroy(() => {
    flushSave();
    clearSaveTimer();
  });

  function loadDraftFromNote(note) {
    clearSaveTimer();
    draftTitle = note.title;
    draftContent = note.content;
    lastLoadedId = note.id;
    lastPersistedTitle = note.title;
    lastPersistedContent = note.content;
  }

  function clearSaveTimer() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  function scheduleSave() {
    clearSaveTimer();
    saveTimer = setTimeout(() => {
      saveTimer = null;
      flushSave();
    }, 650);
  }

  function restoreTitleIfEmpty() {
    const note = get(selectedNeuralNote);
    if (!note || draftTitle.trim()) return;
    draftTitle = lastPersistedTitle || note.title;
    showToast(msg('neural.toastTitleRequired'));
  }

  async function flushSave() {
    const note = get(selectedNeuralNote);
    if (!note || note.id !== lastLoadedId) return false;
    const title = draftTitle.trim();
    if (!title) {
      restoreTitleIfEmpty();
      return false;
    }
    if (title === note.title && draftContent === note.content) return true;
    saving = true;
    try {
      const ok = await updateNeuralNote(note.id, { title, content: draftContent });
      const refreshed = get(selectedNeuralNote);
      if (ok && refreshed?.id === note.id) loadDraftFromNote(refreshed);
      return ok;
    } finally {
      saving = false;
    }
  }

  async function handleAddNote() {
    const id = await addNeuralNote({
      title: msg('neural.defaultNoteTitle'),
      content: msg('neural.defaultNoteContent')
    });
    if (id) {
      await tick();
      document.getElementById('neural-title-input')?.focus();
    }
  }

  function handleDeleteCurrentNote() {
    const note = get(selectedNeuralNote);
    if (!note) return;
    showConfirmModal({
      title: msg('neural.deleteConfirmTitle'),
      body: formatMessage(msg('neural.deleteConfirmBody'), { title: note.title }),
      confirmLabel: msg('neural.deleteConfirmLabel'),
      confirmDanger: true,
      onConfirm: async () => {
        clearSaveTimer();
        const ok = await deleteNeuralNote(note.id);
        if (ok) showToast(msg('neural.toastDeleted'));
      }
    });
  }

  async function handleSelect(id) {
    await flushSave();
    selectNeuralNote(id);
  }

  async function handleInsertLink() {
    const target = ($neuralNotes || []).find((note) => note.id === linkTargetId);
    if (!target || !contentEl) return;
    const start = contentEl.selectionStart ?? draftContent.length;
    const end = contentEl.selectionEnd ?? start;
    const previousLength = draftContent.length;
    draftContent = insertWikiLink(draftContent, start, end, target.title);
    const insertedLength = draftContent.length - previousLength + (end - start);
    scheduleSave();
    await tick();
    contentEl.focus();
    const cursor = start + insertedLength;
    contentEl.setSelectionRange(cursor, cursor);
  }

  function handleCreateLinkFromMention(title) {
    const nextContent = linkFirstUnlinkedMention(draftContent, title);
    if (nextContent === draftContent) return;
    draftContent = nextContent;
    scheduleSave();
    showToast(msg('neural.toastMentionLinked'));
  }

  async function handleCreateMissingNote(title) {
    await flushSave();
    const id = await addNeuralNote({ title, content: '' });
    if (id) showToast(msg('neural.toastNoteCreated'));
  }

  function handleNoteListKeydown(event) {
    const notes = $filteredNeuralNotes;
    if (!notes.length) return;

    const currentIndex = notes.findIndex((note) => note.id === $selectedNeuralNoteId);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      nextIndex = currentIndex < 0 ? 0 : Math.min(notes.length - 1, currentIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      nextIndex = currentIndex < 0 ? notes.length - 1 : Math.max(0, currentIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      nextIndex = notes.length - 1;
    } else {
      return;
    }

    if (nextIndex >= 0 && notes[nextIndex]?.id !== $selectedNeuralNoteId) {
      handleSelect(notes[nextIndex].id);
    }
  }
</script>

<section class="neural-panel" aria-label={$t('neural.panelLabel')}>
  <aside class="neural-sidebar" aria-label={$t('neural.sidebarLabel')}>
    <div class="neural-sidebar-head">
      <div>
        <p class="neural-eyebrow">{$t('neural.eyebrow')}</p>
        <h2>{$t('tasks.neural')}</h2>
      </div>
      <button class="primary-button neural-new-button" type="button" onclick={handleAddNote}>{$t('neural.newNote')}</button>
    </div>

    <label class="neural-search">
      <span>{$t('neural.search')}</span>
      <input
        type="search"
        placeholder={$t('neural.searchPlaceholder')}
        value={$neuralSearchQuery}
        oninput={(event) => neuralSearchQuery.set(event.currentTarget.value)}
      />
    </label>

    <div class="neural-stat-grid" aria-label={$t('neural.eyebrow')}>
      <span><strong>{$neuralStats.notes}</strong> {$t('neural.statsNotes')}</span>
      <span><strong>{$neuralStats.links}</strong> {$t('neural.statsLinks')}</span>
      <span><strong>{$neuralStats.orphanNotes}</strong> {$t('neural.statsOrphans')}</span>
    </div>

    <div
      class="neural-note-list"
      bind:this={noteListEl}
      role="listbox"
      tabindex="0"
      aria-label={$t('neural.sidebarLabel')}
      aria-activedescendant={$selectedNeuralNoteId ? `neural-note-${$selectedNeuralNoteId}` : undefined}
      onkeydown={handleNoteListKeydown}
    >
      {#if !$filteredNeuralNotes.length}
        <p class="neural-muted">{$t('neural.noNotesFound')}</p>
      {:else}
        {#each $filteredNeuralNotes as note (note.id)}
          <button
            id={`neural-note-${note.id}`}
            class="neural-note-row"
            class:is-active={$selectedNeuralNoteId === note.id}
            type="button"
            role="option"
            aria-selected={$selectedNeuralNoteId === note.id}
            onclick={() => handleSelect(note.id)}
          >
            <strong>{note.title}</strong>
            <span>{note.content ? note.content.replace(/\s+/g, ' ').slice(0, 90) : $t('neural.noteEmpty')}</span>
          </button>
        {/each}
      {/if}
    </div>
  </aside>

  <main class="neural-editor-shell" aria-label={$t('neural.editorLabel')}>
    {#if !hasNotes}
      <div class="neural-empty-state">
        <p class="neural-eyebrow">{$t('neural.emptyEyebrow')}</p>
        <h2>{$t('neural.emptyTitle')}</h2>
        <p>{$t('neural.emptyBody')}</p>
        <button class="primary-button" type="button" onclick={handleAddNote}>{$t('neural.emptyAction')}</button>
      </div>
    {:else if $selectedNeuralNote}
      <div class="neural-editor-toolbar">
        <div class="neural-link-tools">
          <select bind:value={linkTargetId} aria-label={$t('neural.linkTarget')}>
            {#each $neuralNotes.filter((note) => note.id !== $selectedNeuralNote.id) as note (note.id)}
              <option value={note.id}>{note.title}</option>
            {/each}
          </select>
          <button class="ghost-button" type="button" disabled={!linkTargetId} onclick={handleInsertLink}>
            {$t('neural.insertLink')}
          </button>
        </div>
        <div class="neural-save-state" aria-live="polite">
          {saving ? $t('neural.saving') : formatNoteStatus($selectedNeuralNote)}
        </div>
      </div>

      <article class="neural-editor-card">
        <label class="neural-title-field">
          <span>{$t('neural.noteTitle')}</span>
          <input
            id="neural-title-input"
            value={draftTitle}
            maxlength="96"
            required
            oninput={(event) => {
              draftTitle = event.currentTarget.value;
              scheduleSave();
            }}
            onblur={() => {
              restoreTitleIfEmpty();
              flushSave();
            }}
          />
        </label>

        <label class="neural-content-field">
          <span>{$t('neural.content')}</span>
          <textarea
            bind:this={contentEl}
            value={draftContent}
            placeholder={$t('neural.contentPlaceholder')}
            oninput={(event) => {
              draftContent = event.currentTarget.value;
              scheduleSave();
            }}
            onblur={flushSave}
          ></textarea>
        </label>
      </article>

      <section class="neural-lower-grid" aria-label={$t('neural.relationsLabel')}>
        <div class="neural-card">
          <div class="neural-card-head">
            <h3>{$t('neural.outgoingLinks')}</h3>
            <span>{$selectedNeuralLinks.length}</span>
          </div>
          {#if !$selectedNeuralLinks.length}
            <p class="neural-muted">{$t('neural.noOutgoingLinks')}</p>
          {:else}
            <div class="neural-chip-list">
              {#each $selectedNeuralLinks as link (`${link.title}-${link.index}`)}
                {#if link.note}
                  <button class="neural-chip" type="button" onclick={() => handleSelect(link.note.id)}>{link.title}</button>
                {:else}
                  <button class="neural-chip is-missing" type="button" onclick={() => handleCreateMissingNote(link.title)}>
                    {formatMessage($t('neural.createLink'), { title: link.title })}
                  </button>
                {/if}
              {/each}
            </div>
          {/if}
        </div>

        <div class="neural-card neural-card--graph">
          <div class="neural-card-head">
            <h3>{$t('neural.localGraph')}</h3>
            <span>{$selectedNeuralGraph.nodes.length} {$t('neural.nodes')}</span>
          </div>
          <NeuralGraph graph={$selectedNeuralGraph} onSelect={handleSelect} onCreateMissing={handleCreateMissingNote} />
        </div>
      </section>
    {/if}
  </main>

  <aside class="neural-relations" aria-label={$t('neural.relationsLabel')}>
    <div class="neural-card neural-relations-card">
      <div class="neural-card-head">
        <h3>{$t('neural.backlinks')}</h3>
        <span>{$selectedNeuralLinkedBacklinks.length}</span>
      </div>
      {#if !$selectedNeuralLinkedBacklinks.length}
        <p class="neural-muted">{$t('neural.noBacklinks')}</p>
      {:else}
        <div class="neural-reference-list">
          {#each $selectedNeuralLinkedBacklinks as item (item.note.id)}
            <button type="button" class="neural-reference" onclick={() => handleSelect(item.note.id)}>
              <strong>{item.note.title}</strong>
              <span>{item.excerpt}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="neural-card neural-relations-card">
      <div class="neural-card-head">
        <h3>{$t('neural.unlinkedMentions')}</h3>
        <span>{$selectedNeuralUnlinkedBacklinks.length}</span>
      </div>
      {#if !$selectedNeuralUnlinkedBacklinks.length}
        <p class="neural-muted">{$t('neural.noUnlinkedMentions')}</p>
      {:else}
        <div class="neural-reference-list">
          {#each $selectedNeuralUnlinkedBacklinks as item (item.note.id)}
            <button type="button" class="neural-reference" onclick={() => handleSelect(item.note.id)}>
              <strong>{item.note.title}</strong>
              <span>{item.excerpt}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="neural-card neural-relations-card">
      <div class="neural-card-head">
        <h3>{$t('neural.suggestions')}</h3>
        <span>{$selectedNeuralUnlinkedMentions.length}</span>
      </div>
      {#if !$selectedNeuralUnlinkedMentions.length}
        <p class="neural-muted">{$t('neural.noSuggestions')}</p>
      {:else}
        <div class="neural-chip-list neural-chip-list--stacked">
          {#each $selectedNeuralUnlinkedMentions as mention (`${mention.title}-${mention.index}`)}
            <button class="neural-chip" type="button" onclick={() => handleCreateLinkFromMention(mention.title)}>
              {formatMessage($t('neural.linkMention'), { title: mention.title })}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if hasNotes}
      <button class="ghost-button neural-delete-button" type="button" onclick={handleDeleteCurrentNote}>
        {$t('neural.deleteNote')}
      </button>
    {/if}
  </aside>
</section>
