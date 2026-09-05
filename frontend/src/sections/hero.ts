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
 * WHY THE ENTRANCE IS CSS AND NOT SCROLL PROGRESS.
 *
 * It was scroll progress, and that was wrong in a way worth recording. Every
 * line's opacity was a ramp over progress, starting at 0.03. The page loads at
 * scroll zero, hero progress is therefore exactly 0, and every ramp evaluates
 * to 0: the first thing any visitor saw was an empty charcoal screen with a
 * masthead. It stayed empty until they happened to scroll.
 *
 * It passed every check because of how it was checked. ?still=1 calls
 * update(1), so every screenshot showed the finished title page. The state
 * being verified was the one the animation was designed for, never the one a
 * visitor actually lands on. It took deploying the site and opening the real
 * URL to see it.
 *
 * A title page has to be legible at rest. Its entrance is a one-off on load,
 * which is what a CSS animation is for, so that is where it lives now. The
 * scroll position no longer decides whether the title exists.
 *
 * ON PURITY. update() touches nothing, so the purity contract is satisfied
 * trivially and ?still=1 and scrubbing cannot desynchronise this section.
 */
import { ORDER, register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import { fmtInt } from '../three/format';

import './hero.css';

class HeroSection implements Section {
  readonly id = 'hero';

  mount(root: HTMLElement, data: Snapshot): void {
    root.classList.add('on-charcoal', 'section--runway', 'hero');
    // Enough runway for the title to hold while the reader starts scrolling,
    // without a long stretch of nothing happening. It was 190svh when the
    // section still had a scroll-driven reveal to spend it on.
    root.style.height = '140svh';

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

    // The stagger index only feeds an animation-delay in CSS. Nothing here
    // depends on scroll, so the title is legible the instant the page paints.
    root.querySelectorAll<HTMLElement>('[data-line]').forEach((el, i) => {
      el.style.setProperty('--i', String(i));
    });
  }

  /**
   * Deliberately empty. See the note at the top of this file: tying the title
   * page's visibility to scroll progress is what made it invisible on load.
   */
  update(): void {}

  unmount(): void {}
}

register({
  order: ORDER.hero,
  id: 'hero',
  create: () => new HeroSection(),
});
