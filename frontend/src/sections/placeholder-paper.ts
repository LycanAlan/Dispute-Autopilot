/*
 * placeholder-paper.ts
 *
 * A shell check on the paper ground. It exists so that a section agent can
 * confirm four things before writing anything real:
 *
 *   the module was found and registered
 *   mount() received the section element and the snapshot
 *   update(progress) is running, once per frame, only while on screen
 *   the kill switches reached the page
 *
 * Delete this file and its charcoal twin once real sections 1 to 11 land.
 * Nothing imports them.
 */

import { loadPoints } from '../core/data';
import { flags } from '../core/engine';
import { register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';

import './placeholder.css';

class PaperShellCheck implements Section {
  readonly id = 'shell-paper';

  private progressEl: HTMLElement | null = null;
  private meterEl: HTMLElement | null = null;

  mount(root: HTMLElement, data: Snapshot): void {
    // Taller than the viewport, so the engine treats it as a scroll runway and
    // progress runs a full 0 to 1 under the sticky stage.
    root.classList.add('section--runway');
    root.style.height = '240svh';

    const snapshotState =
      data.source === 'sample' ? 'sample, every figure is fake' : 'real';

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner ph">
          <div>
            <div class="ruled-kicker"><span class="kicker">Shell check</span></div>
            <h2 class="title ph__title">The frame is up.</h2>
            <div class="prose">
              <p>
                This block is not part of the argument. It is here so that the
                four agents building sections 1 to 11 can see that a module
                registered itself, received the snapshot, and is being driven
                by the scroll engine.
              </p>
              <p>
                The number on the right is this section's own progress. It runs
                0 to 1 as the section passes the viewport, and it is the only
                argument <code>update()</code> ever gets.
              </p>
            </div>
            <div class="ph__note">
              <p class="micro">Delete placeholder-paper.ts and placeholder-charcoal.ts once the real sections land.</p>
            </div>
          </div>

          <div class="ph__panel">
            <span class="kicker">Section progress</span>
            <span class="figure-num ph__figure" data-progress>0.000</span>
            <div class="meter ph__meter"><div class="meter__fill" data-meter></div></div>

            <div class="readout">
              <span class="readout__label">Snapshot</span>
              <span class="readout__value">${snapshotState}</span>
            </div>
            <div class="readout">
              <span class="readout__label">Points sampled of total</span>
              <span class="readout__value">${data.n_sampled.toLocaleString('en-US')} / ${data.n_total.toLocaleString('en-US')}</span>
            </div>
            <div class="readout">
              <span class="readout__label">points.bin decoded</span>
              <span class="readout__value" data-points>reading</span>
            </div>
            <div class="readout">
              <span class="readout__label">flat</span>
              <span class="readout__value">${flags.flat ? 'on' : 'off'}</span>
            </div>
            <div class="readout">
              <span class="readout__label">still</span>
              <span class="readout__value">${flags.still ? 'on' : 'off'}</span>
            </div>
            <div class="readout">
              <span class="readout__label">reduced motion</span>
              <span class="readout__value">${flags.reducedMotion ? 'on' : 'off'}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.progressEl = root.querySelector('[data-progress]');
    this.meterEl = root.querySelector('[data-meter]');

    // The point cloud is read in a worker and arrives late. mount() does not
    // wait for it: nothing on this page should be blocked on a 1.6 MB file.
    // A section that genuinely cannot paint without its data may return the
    // promise instead, which the engine will await.
    const pointsEl = root.querySelector<HTMLElement>('[data-points]');
    loadPoints()
      .then((cloud) => {
        if (!pointsEl) return;
        pointsEl.textContent =
          cloud.count.toLocaleString('en-US') +
          ' points' +
          (cloud.synthetic ? ', synthetic stand in' : '');
      })
      .catch((err: unknown) => {
        if (pointsEl) pointsEl.textContent = 'failed';
        console.error('[shell-paper] points.bin could not be read:', err);
      });
  }

  // Pure with respect to progress: same input, same pixels, every time.
  update(progress: number): void {
    if (this.progressEl) this.progressEl.textContent = progress.toFixed(3);
    if (this.meterEl) this.meterEl.style.width = (progress * 100).toFixed(2) + '%';
  }

  unmount(): void {
    this.progressEl = null;
    this.meterEl = null;
  }
}

register({
  order: 1000, // after every real section, so it is easy to spot and easy to drop
  id: 'shell-paper',
  create: () => new PaperShellCheck(),
});
