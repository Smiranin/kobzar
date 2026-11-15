import { LANGUAGES, type Language, type TranscriptResponse } from '@kobzar/core';
import { api, errorMessage } from '../api.js';
import { clock, h, seconds } from '../dom.js';
import { Recorder } from '../recorder.js';

const LANGUAGE_NAMES: Record<Language, string> = { ru: 'Russian', en: 'English' };
const TICK_MS = 250;

export interface RecordPanel {
  element: HTMLElement;
  setReady(ready: boolean): void;
  setDefaultLanguage(language: Language): void;
}

/**
 * Record a phrase, see its Transcript and the times, and save it as a Sample. The phrase stays in
 * memory only; it reaches the disk only when the owner saves it.
 */
export function recordPanel(onSampleSaved: () => void): RecordPanel {
  const recorder = new Recorder();
  let ready = false;
  let busy = false;
  let lastRecording: { blob: Blob; language: Language } | undefined;
  let tick: number | undefined;

  const languageInputs = LANGUAGES.map((language) =>
    h('input', { type: 'radio', name: 'language', value: language }),
  );
  let languageTouched = false;
  const defaultInput = languageInputs.find((input) => input.value === 'ru');
  if (defaultInput) defaultInput.checked = true;
  for (const input of languageInputs) {
    input.addEventListener('change', () => {
      languageTouched = true;
    });
  }
  const languageSwitch = h(
    'fieldset',
    { className: 'languages' },
    h('legend', {}, 'Language'),
    ...LANGUAGES.map((language, index) =>
      h('label', {}, languageInputs[index] ?? null, ` ${LANGUAGE_NAMES[language]}`),
    ),
  );
  const hintsInput = h('input', {
    type: 'text',
    placeholder: 'Hints, comma-separated: Sensei, kata',
    autocomplete: 'off',
  });
  const recordButton = h('button', { type: 'button', className: 'record' }, 'Record');
  const elapsed = h('span', { className: 'elapsed' }, '');
  const status = h('p', { className: 'status' });
  const transcript = h('p', { className: 'transcript' });
  const facts = h('dl', { className: 'facts' });
  const dictionaryNote = h('p', { className: 'note' });

  const expectedInput = h('textarea', { rows: 3, placeholder: 'What it should say' });
  const saveButton = h('button', { type: 'button' }, 'Save as Sample');
  const saveStatus = h('p', { className: 'status' });
  const saveBox = h(
    'div',
    { className: 'save', hidden: true },
    h('label', {}, 'Expected text', expectedInput),
    saveButton,
    saveStatus,
  );

  const chosenLanguage = (): Language =>
    (languageInputs.find((input) => input.checked)?.value as Language | undefined) ?? 'ru';
  const hints = (): string[] =>
    hintsInput.value
      .split(',')
      .map((hint) => hint.trim())
      .filter((hint) => hint !== '');

  const render = () => {
    recordButton.disabled = busy || (!ready && !recorder.recording);
    recordButton.textContent = recorder.recording ? 'Stop' : 'Record';
    recordButton.classList.toggle('recording', recorder.recording);
    elapsed.textContent = recorder.recording ? clock(recorder.elapsedMs()) : '';
  };

  const showResult = (result: TranscriptResponse, roundTripMs: number) => {
    transcript.textContent = result.text === '' ? '(no speech found)' : result.text;
    transcript.classList.toggle('empty', result.text === '');
    facts.replaceChildren(
      h('dt', {}, 'Recording length'),
      h('dd', {}, seconds(result.durationMs)),
      h('dt', {}, 'Processing in Kobzar'),
      h('dd', {}, seconds(result.processingMs)),
      h('dt', {}, 'Round trip'),
      h('dd', {}, seconds(roundTripMs)),
    );
    const left = result.dictionary.total - result.dictionary.used;
    dictionaryNote.textContent =
      left > 0
        ? `The model prompt took ${result.dictionary.used} of ${result.dictionary.total} Dictionary entries; ${left} did not fit. Keep the important ones at the top of the file.`
        : '';
  };

  const send = async (blob: Blob) => {
    const language = chosenLanguage();
    lastRecording = { blob, language };
    busy = true;
    render();
    status.textContent = 'Transcribing…';
    transcript.textContent = '';
    facts.replaceChildren();
    dictionaryNote.textContent = '';
    saveBox.hidden = true;
    const started = performance.now();
    try {
      const result = await api.transcribe(blob, language, hints());
      showResult(result, performance.now() - started);
      status.textContent = '';
      expectedInput.value = result.text;
      saveStatus.textContent = '';
      saveBox.hidden = false;
    } catch (error) {
      status.textContent = errorMessage(error);
    } finally {
      busy = false;
      render();
    }
  };

  const stopTicking = () => {
    window.clearInterval(tick);
    tick = undefined;
  };

  recordButton.addEventListener('click', async () => {
    if (recorder.recording) {
      stopTicking();
      await send(await recorder.stop());
      return;
    }
    try {
      await recorder.start((blob) => {
        stopTicking();
        status.textContent = 'The five-minute limit was reached; recording stopped.';
        void send(blob);
      });
      status.textContent = '';
      tick = window.setInterval(render, TICK_MS);
    } catch (error) {
      status.textContent = errorMessage(error);
    }
    render();
  });

  saveButton.addEventListener('click', async () => {
    if (!lastRecording) return;
    const expectedText = expectedInput.value.trim();
    if (expectedText === '') {
      saveStatus.textContent = 'Enter the expected text.';
      return;
    }
    saveButton.disabled = true;
    try {
      await api.saveSample(lastRecording.blob, lastRecording.language, expectedText);
      saveStatus.textContent = 'Saved.';
      saveBox.hidden = true;
      lastRecording = undefined;
      onSampleSaved();
    } catch (error) {
      saveStatus.textContent = errorMessage(error);
    } finally {
      saveButton.disabled = false;
    }
  });

  const element = h(
    'section',
    { className: 'panel' },
    h('h2', {}, 'Record'),
    languageSwitch,
    h('label', {}, 'Hints (optional)', hintsInput),
    h('div', { className: 'controls' }, recordButton, elapsed),
    status,
    transcript,
    facts,
    dictionaryNote,
    saveBox,
  );
  render();

  return {
    element,
    setReady: (value) => {
      ready = value;
      render();
    },
    setDefaultLanguage: (language) => {
      if (languageTouched) return;
      const input = languageInputs.find((candidate) => candidate.value === language);
      if (input) input.checked = true;
    },
  };
}
