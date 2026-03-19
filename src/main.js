import { mount } from 'svelte';
import App from './App.svelte';
import './styles.css';

function mountApp() {
  const target = document.getElementById('app');
  if (!target) {
    document.body.innerHTML = '<pre style="color:red;padding:2rem;">Erro: #app não encontrado</pre>';
    return;
  }
  try {
    mount(App, { target });
  } catch (err) {
    target.innerHTML = `<pre style="color:red;padding:2rem;white-space:pre-wrap;">Erro ao montar app:\n${err?.message || err}\n\n${err?.stack || ''}</pre>`;
    console.error(err);
  }
}

mountApp();
