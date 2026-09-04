/*
 * hero.ts
 *
 * Section 1. A title page, centred.
 *
 * It used to be a left-hand column of type with the point cloud drifting
 * behind it, which left a column of empty charcoal down the right of the
 * first thing anyone sees. The author's note was that it should be "middle
 * centered or add something more, but not a full text box, it would look
 * ugly for the first page". So: no box, no panel, no chart. One centred
 * column, and under the rule three figures that say what the dataset is
 * before any claim is made about it.
 *
 * The three figures are deliberately all structural or Family A (measured).
 * Nothing simulated appears above the fold. The whole page is built on never
 * blending the three metric families, and the title page is the easiest
 * place in the world to blend them by accident.
 *
 * ON PURITY. update() is a pure function of progress: each line's --in is a
 * ramp over a fixed window, nothing else. update(1) lands on the finished
 * title page, which is what ?still=1 relies on.
 */
import { ORDER, register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import { fmtInt } from '../three/format';

import './hero.css';

/** Ramp from 0 to 1 across [a, b], flat outside it. */
function span(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

const FIRST = 0.03;
const STEP = 0.075;
const FADE = 0.11;

class HeroSection implements Section {
  readonly id = 'hero';

  private lines: HTMLElement[] = [];

  mount(root: HTMLElement, data: Snapshot): void {
    root.classList.add('on-charcoal', 'section--runway', 'hero');
    root.style.height = '190svh';

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner hero__inner">
          <div class="hero__column">
            <p class="kicker hero__line hero__eyebrow" data-line>For Razorpay merchants</p>

            <h1 class="display hero__line hero__title" data-line>Dispute Autopilot</h1>

            <p class="lede hero__line hero__subtitle" data-line>
              Three-stage chargeback loss prevention.
              Predict the risk, preserve the evidence,
              decide on expected value.
            </p>

            <span class="hero__line hero__rule" data-line aria-hidden="true"></span>

            <dl class="hero__figures hero__line" data-line>
              <div class="hero__figure">
                <dt class="num hero__figure-value" data-fig="total"></dt>
                <dd class="micro hero__figure-label">transactions scored</dd>
              </div>
              <div class="hero__figure">
                <dt class="num hero__figure-value" data-fig="test"></dt>
                <dd class="micro hero__figure-label">held back for testing</dd>
              </div>
              <div class="hero__figure">
                <dt class="num hero__figure-value" data-fig="rate"></dt>
                <dd class="micro hero__figure-label">ended in a chargeback</dd>
              </div>
            </dl>

            <p class="micro hero__line hero__cue" data-line>Scroll</p>
          </div>
        </div>
      </div>
    `;

    const put = (key: string, text: string): void => {
      const el = root.querySelector<HTMLElement>('[data-fig="' + key + '"]');
      if (el) el.textContent = text;
    };

    // Every figure is read out of the snapshot at runtime. None of them is
    // typed into the markup, which is what check_site.py enforces and what
    // keeps the title page honest when the model is retrained.
    put('total', fmtInt(data.n_total));
    put('test', fmtInt(data.family_a.n_test));
    put('rate', (data.family_a.positive_rate * 100).toFixed(2) + '%');

    this.lines = Array.from(root.querySelectorAll<HTMLElement>('[data-line]'));
    this.update(0);
  }

  update(progress: number): void {
    for (let i = 0; i < this.lines.length; i++) {
      const at = FIRST + i * STEP;
      this.lines[i].style.setProperty('--in', span(progress, at, at + FADE).toFixed(3));
    }
  }

  unmount(): void {
    this.lines = [];
  }
}

register({
  order: ORDER.hero,
  id: 'hero',
  create: () => new HeroSection(),
});
