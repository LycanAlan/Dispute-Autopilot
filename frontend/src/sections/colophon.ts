/*
 * colophon.ts
 *
 * Section 11, id "colophon". The last thing a judge reads: the defense-only
 * notice, the honest limitations, and the author block. Copied verbatim from
 * docs/site-copy.md section 11.
 *
 * Author feedback after seeing the boxed version: no panel, center aligned
 * like a title page, and each line should reveal on its own as the section
 * is scrolled, "something interactive showing each line meaningfully" rather
 * than sitting still like a printed footer. Section 8 (refusal.ts) proved
 * the technique -- a --in custom property per element, driven by a span()
 * ramp over progress -- but the author was explicit that this should not
 * look like that section's examination. There is no vault, no wires, no
 * struck claim: just eleven lines of a closing statement being set one at a
 * time, quiet and confident.
 *
 * ON PURITY. update() is a pure function of progress: every line's --in is
 * span(progress, appearsAt, appearsAt + FADE), nothing else. At progress = 1
 * every span() is 1, so ?still=1's single update(1) call lands on the
 * finished page, exactly as section.ts's contract requires.
 */

import { register, ORDER } from '../core/registry';
import type { Section, Snapshot } from '../core/section';

import './colophon.css';

/** Ramp from 0 to 1 across [a, b], flat outside it. */
function span(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

// Eleven lines, evenly paced with a little room left at each end so the
// first line does not land the instant the section arrives and the last one
// is not still settling as the page runs out. Tuned by eye, the same way
// refusal.ts's T table was.
const FIRST = 0.05;
const STEP = 0.078;
const FADE = 0.05;

class ColophonSection implements Section {
  readonly id = 'colophon';

  private lines: HTMLElement[] = [];

  mount(root: HTMLElement, _data: Snapshot): void {
    root.classList.add('on-charcoal', 'section--runway', 'colophon');
    root.style.height = '260svh';

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner colophon__inner">
          <div class="colophon__column">
            <p class="colophon__line colophon__notice-line" data-line>This system is defense-only.</p>
            <p class="colophon__line colophon__notice-line" data-line>It scores disputes and drafts grounded chargeback responses.</p>
            <p class="colophon__line colophon__notice-line" data-line>It cannot generate, alter, or synthesise evidence for real use.</p>
            <p class="colophon__line colophon__notice-line" data-line>When the evidence it would need is not in the vault, it refuses to contest and downgrades the decision to REVIEW.</p>

            <span class="colophon__rule" aria-hidden="true"></span>

            <h2 class="title colophon__line colophon__headline" data-line>What this does not show</h2>

            <p class="colophon__line colophon__body-line" data-line>The evidence documents are synthetic. IEEE-CIS has no order records or tracking numbers, so they were generated. The chargeback labels are real.</p>
            <p class="colophon__line colophon__body-line" data-line>No representment win rate can be inferred from any of this, and nothing here claims one.</p>
            <p class="colophon__line colophon__body-line" data-line>Evidence favourability is not yet part of the contest decision. The verifier compares identifier-like tokens, so invented prose citing a real source key would still pass. Both are open.</p>

            <span class="colophon__rule" aria-hidden="true"></span>

            <div class="colophon__line colophon__signature" data-line>
              <p class="colophon__name">Ali Ansari</p>
              <p class="micro">LycanAlan</p>
              <p class="micro"><a href="https://github.com/LycanAlan">github.com/LycanAlan</a></p>
              <p class="micro"><a href="mailto:lycanalan205@gmail.com">lycanalan205@gmail.com</a></p>
            </div>

            <p class="micro colophon__line colophon__repo" data-line>Repo: <a href="https://github.com/LycanAlan/Dispute-Autopilot">github.com/LycanAlan/Dispute-Autopilot</a></p>

            <p class="micro colophon__line colophon__footer" data-line>112 tests. Every figure on this page is checked against its artifact by a script in the repo.</p>
          </div>
        </div>
      </div>
    `;

    this.lines = Array.from(root.querySelectorAll<HTMLElement>('[data-line]'));
  }

  // Pure in progress: the same progress always produces the same --in on
  // every line, which is what lets ?still=1 land on the finished page with
  // one call and what makes scrubbing backwards during a take undo cleanly.
  update(progress: number): void {
    for (let i = 0; i < this.lines.length; i++) {
      const appearsAt = FIRST + i * STEP;
      const landed = span(progress, appearsAt, appearsAt + FADE);
      this.lines[i].style.setProperty('--in', landed.toFixed(3));
    }
  }

  unmount(): void {
    this.lines = [];
  }
}

register({
  order: ORDER.colophon,
  id: 'colophon',
  create: () => new ColophonSection(),
});
