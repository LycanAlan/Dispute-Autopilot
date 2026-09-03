/*
 * main.ts
 *
 * Load the snapshot, hand it to the engine, get out of the way.
 *
 * The glob below is the whole registration mechanism. Every module in
 * src/sections/ is imported for its side effect, which is a call to
 * register(). Adding a section means adding one file. Nothing here changes,
 * nothing in the engine changes, and no two agents edit the same line.
 */

import './core/tokens.css';
import './core/shell.css';

import { loadSnapshot } from './core/data';
import { startEngine } from './core/engine';

import.meta.glob('./sections/*.ts', { eager: true });

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('#app is missing from index.html');

  const data = await loadSnapshot();
  root.replaceChildren();

  await startEngine({ root, data });

  if (data.source === 'sample') {
    console.warn(
      '[main] Rendering from snapshot.sample.json. Every figure on this page ' +
        'is a placeholder. Do not film this.',
    );
  }
}

boot().catch((err: unknown) => {
  console.error('[main] boot failed:', err);
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) return;
  const note = document.createElement('p');
  note.className = 'boot boot--error';
  note.textContent =
    'The data snapshot could not be loaded, so there is nothing to show. ' +
    'Run scripts/export_site_data.py to write frontend/data, then reload.';
  root.replaceChildren(note);
});
