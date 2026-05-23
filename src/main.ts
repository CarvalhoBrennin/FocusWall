import { mount } from 'svelte';
import App from './App.svelte';
import './styles.css';

function renderFatal(target, message, stack = '') {
  target.innerHTML = `<pre style="color:red;padding:2rem;white-space:pre-wrap;">Erro ao montar app:\n${message}\n\n${stack}</pre>`;
}

function mountApp() {
  const target = document.getElementById('app');
  if (!target) {
    document.body.innerHTML = '<pre style="color:red;padding:2rem;">Erro: #app não encontrado</pre>';
    return;
  }

  window.addEventListener('error', (event) => {
    console.error('[global error]', event.error || event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[unhandled rejection]', event.reason);
  });

  try {
    mount(App, { target });
  } catch (err) {
    renderFatal(target, err?.message || err, err?.stack || '');
    console.error(err);
  }
}

mountApp();
