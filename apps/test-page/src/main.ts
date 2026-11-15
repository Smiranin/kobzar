import type { EngineStatus } from '@kobzar/core';
import { api, errorMessage } from './api.js';
import { h } from './dom.js';
import './style.css';
import { recordPanel } from './views/record-panel.js';
import { samplesPanel } from './views/samples-panel.js';

/** Health is asked often while the model loads and rarely once it is ready. */
const POLL_LOADING_MS = 2_000;
const POLL_READY_MS = 15_000;

const STATUS_TEXT: Record<EngineStatus, string> = {
  loading: 'model loading',
  ready: 'ready',
  failed: 'engine failed, restart Kobzar',
};

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('The page has no #app element');

const healthBadge = h('span', { className: 'health' }, 'checking…');
const samples = samplesPanel();
const recorder = recordPanel(() => void samples.reload());

root.append(h('header', {}, h('h1', {}, 'Kobzar'), healthBadge), recorder.element, samples.element);

async function pollHealth(): Promise<void> {
  let ready = false;
  try {
    const health = await api.health();
    ready = health.status === 'ready';
    healthBadge.textContent = `${STATUS_TEXT[health.status]} · v${health.version}`;
    healthBadge.dataset.status = health.status;
    recorder.setDefaultLanguage(health.defaultLanguage);
  } catch (error) {
    healthBadge.textContent = errorMessage(error);
    healthBadge.dataset.status = 'failed';
  }
  recorder.setReady(ready);
  samples.setReady(ready);
  window.setTimeout(() => void pollHealth(), ready ? POLL_READY_MS : POLL_LOADING_MS);
}

void pollHealth();
void samples.reload();
