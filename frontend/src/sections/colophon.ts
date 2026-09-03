/*
 * colophon.ts
 *
 * Section 11, id "colophon". The last thing a judge reads: the defense-only
 * notice as its own set-apart block, the honest limitations, and the author
 * block. Copied verbatim from docs/site-copy.md section 11.
 *
 * Motion for this section is "static" in the design spec's own section
 * table, so update() does nothing. mount() paints the whole thing once, the
 * way the colophon of a printed report sits still on its own page.
 */

import { register, ORDER } from '../core/registry';
import type { Section, Snapshot } from '../core/section';

import './colophon.css';

class ColophonSection implements Section {
  readonly id = 'colophon';

  mount(root: HTMLElement, _data: Snapshot): void {
    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner colophon__inner">
          <blockquote class="colophon__notice">
            <p>This system is defense-only.</p>
            <p>It scores disputes and drafts grounded chargeback responses.</p>
            <p>It cannot generate, alter, or synthesise evidence for real use.</p>
            <p>When the evidence it would need is not in the vault, it refuses to contest and downgrades the decision to REVIEW.</p>
          </blockquote>

          <div class="colophon__limits">
            <h2 class="title">What this does not show</h2>
            <div class="prose">
              <p>The evidence documents are synthetic. IEEE-CIS has no order records or tracking numbers, so they were generated. The chargeback labels are real.</p>
              <p>No representment win rate can be inferred from any of this, and nothing here claims one.</p>
              <p>Evidence favourability is not yet part of the contest decision. The verifier compares identifier-like tokens, so invented prose citing a real source key would still pass. Both are open.</p>
            </div>
          </div>

          <div class="colophon__foot">
            <div class="colophon__author">
              <p class="colophon__name">Ali Ansari</p>
              <p class="micro">LycanAlan</p>
              <p class="micro"><a href="https://github.com/LycanAlan">github.com/LycanAlan</a></p>
              <p class="micro"><a href="mailto:lycanalan205@gmail.com">lycanalan205@gmail.com</a></p>
            </div>

            <div class="colophon__meta">
              <p class="micro">Repo: <a href="https://github.com/LycanAlan/Dispute-Autopilot">github.com/LycanAlan/Dispute-Autopilot</a></p>
              <p class="micro colophon__footer">84 tests. Every figure on this page is checked against its artifact by a script in the repo.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // "static" in the design spec's motion column: nothing here animates.
  update(_progress: number): void {}

  unmount(): void {}
}

register({
  order: ORDER.colophon,
  id: 'colophon',
  create: () => new ColophonSection(),
});
