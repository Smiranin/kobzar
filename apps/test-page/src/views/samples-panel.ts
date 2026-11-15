import {
  summariseRun,
  type DiffPart,
  type RunTotals,
  type Sample,
  type SampleRunResult,
} from '@kobzar/core';
import { api, errorMessage } from '../api.js';
import { h, seconds } from '../dom.js';

export interface SamplesPanel {
  element: HTMLElement;
  reload(): Promise<void>;
  setReady(ready: boolean): void;
}

function diffView(parts: readonly DiffPart[]): HTMLElement {
  const line = h('p', { className: 'diff' });
  for (const part of parts) {
    const text = part.words.join(' ');
    const node =
      part.kind === 'same'
        ? h('span', {}, text)
        : part.kind === 'missing'
          ? h('del', { title: 'missing from the Transcript' }, text)
          : h('ins', { title: 'extra in the Transcript' }, text);
    line.append(node, ' ');
  }
  return line;
}

function totalsView(totals: RunTotals): HTMLElement {
  const percent = (totals.wordErrorRate * 100).toFixed(1);
  return h(
    'dl',
    { className: 'facts totals' },
    h('dt', {}, 'Samples'),
    h('dd', {}, `${totals.samples}${totals.failed > 0 ? `, failed: ${totals.failed}` : ''}`),
    h('dt', {}, 'Word errors'),
    h('dd', {}, `${totals.wordErrors} of ${totals.wordCount} (${percent}%)`),
    h('dt', {}, 'Recorded'),
    h('dd', {}, seconds(totals.recordedMs)),
    h('dt', {}, 'Processing'),
    h('dd', {}, seconds(totals.processingMs)),
    h('dt', {}, 'Faster than real time'),
    h('dd', {}, `${totals.speedFactor.toFixed(1)}×`),
  );
}

/** The Samples: play, edit the expected text, delete, and run all of them one after another. */
export function samplesPanel(): SamplesPanel {
  let samples: Sample[] = [];
  let ready = false;
  let running = false;

  const list = h('ul', { className: 'samples' });
  const listStatus = h('p', { className: 'status' });
  const runButton = h('button', { type: 'button' }, 'Run all');
  const progress = h('span', { className: 'elapsed' });
  const runTable = h('div', { className: 'run' });

  const renderRunButton = () => {
    runButton.disabled = !ready || running || samples.length === 0;
  };

  const sampleItem = (sample: Sample): HTMLElement => {
    const text = h('textarea', { rows: 2, value: sample.expectedText });
    const saveButton = h('button', { type: 'button' }, 'Save text');
    const deleteButton = h('button', { type: 'button', className: 'danger' }, 'Delete');
    const status = h('span', { className: 'status' });
    const audio = h('audio', { controls: true, preload: 'none', src: api.recordingUrl(sample.id) });

    saveButton.addEventListener('click', async () => {
      try {
        const updated = await api.updateSample(sample.id, text.value.trim());
        sample.expectedText = updated.expectedText;
        status.textContent = 'Saved.';
      } catch (error) {
        status.textContent = errorMessage(error);
      }
    });
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm(`Delete the Sample "${sample.expectedText}"?`)) return;
      try {
        await api.deleteSample(sample.id);
        await reload();
      } catch (error) {
        status.textContent = errorMessage(error);
      }
    });

    return h(
      'li',
      {},
      h(
        'p',
        { className: 'meta' },
        `${sample.language.toUpperCase()} · ${seconds(sample.durationMs)} · ${new Date(sample.createdAt).toLocaleString()}`,
      ),
      audio,
      text,
      h('div', { className: 'controls' }, saveButton, deleteButton, status),
    );
  };

  const reload = async () => {
    try {
      samples = await api.samples();
      list.replaceChildren(...samples.map(sampleItem));
      listStatus.textContent = samples.length === 0 ? 'No Samples yet.' : '';
    } catch (error) {
      listStatus.textContent = errorMessage(error);
    }
    renderRunButton();
  };

  const resultRow = (sample: Sample, outcome: SampleRunResult | Error): HTMLElement => {
    if (outcome instanceof Error) {
      return h(
        'article',
        { className: 'result failed' },
        h('p', { className: 'meta' }, sample.expectedText),
        h('p', { className: 'status' }, `Error: ${outcome.message}`),
      );
    }
    return h(
      'article',
      { className: `result${outcome.wordErrors === 0 ? ' clean' : ''}` },
      h(
        'p',
        { className: 'meta' },
        `${seconds(outcome.durationMs)} recorded · ${seconds(outcome.processingMs)} processing · errors: ${outcome.wordErrors} of ${outcome.wordCount}`,
      ),
      h('p', {}, h('b', {}, 'Expected: '), outcome.expectedText),
      h('p', {}, h('b', {}, 'Transcript: '), outcome.text === '' ? '(empty)' : outcome.text),
      diffView(outcome.diff),
    );
  };

  runButton.addEventListener('click', async () => {
    running = true;
    renderRunButton();
    runTable.replaceChildren();
    const results: SampleRunResult[] = [];
    let failed = 0;
    const toRun = [...samples];
    for (const [index, sample] of toRun.entries()) {
      progress.textContent = `${index + 1} / ${toRun.length}`;
      let outcome: SampleRunResult | Error;
      try {
        outcome = await api.runSample(sample.id);
        results.push(outcome);
      } catch (error) {
        // A failed Sample is shown and counted, and the run goes on.
        outcome = new Error(errorMessage(error));
        failed += 1;
      }
      runTable.append(resultRow(sample, outcome));
    }
    runTable.prepend(totalsView(summariseRun({ results, failed })));
    progress.textContent = 'Done';
    running = false;
    renderRunButton();
  });

  const element = h(
    'section',
    { className: 'panel' },
    h('h2', {}, 'Samples'),
    listStatus,
    list,
    h('h2', {}, 'Run'),
    h('div', { className: 'controls' }, runButton, progress),
    runTable,
  );

  return {
    element,
    reload,
    setReady: (value) => {
      ready = value;
      renderRunButton();
    },
  };
}
