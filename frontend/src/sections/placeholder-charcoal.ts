/*
 * placeholder-charcoal.ts
 *
 * The same shell check on the dark ground. Two things are being proved here
 * that the paper twin cannot prove:
 *
 *   .on-charcoal flips every token without renaming any of them
 *   the running head follows the ground change and stays legible
 *
 * Delete with its paper twin once real sections 1 to 11 land.
 */

import { register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';

import './placeholder.css';

const SWATCHES: Array<{ label: string; token: string; hex: string }> = [
  { label: 'CONTEST', token: '--contest', hex: '#1F6F4A' },
  { label: 'REVIEW', token: '--review', hex: '#B5822B' },
  { label: 'ACCEPT', token: '--accept', hex: '#A54334' },
];

class CharcoalShellCheck implements Section {
  readonly id = 'shell-charcoal';

  private progressEl: HTMLElement | null = null;
  private meterEl: HTMLElement | null = null;

  mount(root: HTMLElement, data: Snapshot): void {
    // on-charcoal is the whole dark mode. The engine reads it to set
    // <html data-ground>, which is what keeps the running head readable.
    root.classList.add('on-charcoal', 'section--runway');
    root.style.height = '240svh';

    const swatches = SWATCHES.map(
      (s) => `
        <div class="ph__swatch">
          <span class="ph__chip" style="background: var(${s.token})"></span>
          <span class="small">${s.label}</span>
          <span class="micro">${s.hex}</span>
        </div>`,
    ).join('');

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner ph">
          <div>
            <div class="ruled-kicker"><span class="kicker">Shell check</span></div>
            <h2 class="title ph__title">Dark ground, same tokens.</h2>
            <div class="prose">
              <p>
                Data sections sit on charcoal so the page alternates as it
                scrolls. A section opts in with one class and every colour
                token flips underneath it. Nothing is renamed, so a component
                written once reads correctly on both grounds.
              </p>
              <p>
                Three decision colours, and no fourth. Green contests, amber
                sends to review, clay accepts the loss.
              </p>
            </div>
            <div class="ph__swatches">${swatches}</div>
          </div>

          <div class="ph__panel">
            <span class="kicker">Section progress</span>
            <span class="figure-num ph__figure" data-progress>0.000</span>
            <div class="meter ph__meter"><div class="meter__fill" data-meter></div></div>

            <div class="readout">
              <span class="readout__label">Snapshot generated</span>
              <span class="readout__value">${data.generated_at}</span>
            </div>
            <div class="readout">
              <span class="readout__label">Temporal split, train ends</span>
              <span class="readout__value">${data.split.train_end_x}</span>
            </div>
            <div class="readout">
              <span class="readout__label">Temporal split, calibration ends</span>
              <span class="readout__value">${data.split.calib_end_x}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.progressEl = root.querySelector('[data-progress]');
    this.meterEl = root.querySelector('[data-meter]');
  }

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
  order: 1010,
  id: 'shell-charcoal',
  create: () => new CharcoalShellCheck(),
});
