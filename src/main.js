import { mount } from 'svelte';
import App from './App.svelte';
import './styles.css';

function renderError(container, message) {
  const pre = document.createElement('pre');
  pre.style.color = 'red';
  pre.style.padding = '2rem';
  pre.style.whiteSpace = 'pre-wrap';
  pre.textContent = message;

  container.replaceChildren(pre);
}

function mountApp() {
  const target = document.getElementById('app');
  if (!target) {
    renderError(document.body, 'Erro: #app não encontrado');
    return;
  }
  try {
    mount(App, { target });
  } catch (err) {
    renderError(
      target,
      `Erro ao montar app:\n${err?.message || err}\n\n${err?.stack || ''}`
    );
    console.error(err);
  }
}

mountApp();
