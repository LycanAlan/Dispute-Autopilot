/*
 * zoom.ts
 *
 * Section 5. The turn from the dataset to one dispute.
 *
 * The author's note: "The fifth page seems empty and has no indication of
 * what to come, reduces navigability of the user could improve this story or
 * add pointers instead something indicating to scroll as well as tell why
 * contest, what is being contest, the design for this is center-oriented
 * looks nice."
 *
 * So the centred layout stays and the emptiness goes. Three things were
 * missing and are now here:
 *
 *   WHAT is being contested. The dispute as it arrives: transaction, amount,
 *   the reason code the bank pulled the money back under, and the model's
 *   probability. Four facts, all from the snapshot.
 *
 *   WHY contest at all. Contesting costs money whether it is won or lost, so
 *   the answer is not "because it might be won". It is that the expected
 *   value of contesting beats the expected value of writing it off. That is
 *   the argument the next three sections make, and saying so here is what
 *   makes them feel like an answer rather than a change of subject.
 *
 *   WHAT COMES NEXT. Three numbered pointers at the three sections that
 *   follow, so a viewer knows the shape of the rest before scrolling into it.
 *
 * The point cloud is gone from this section, along with the collapse-to-one
 * animation it existed for. That animation was the reason this page had a
 * single short paragraph floating in the middle of a lot of charcoal: the
 * cloud was supposed to be the content. It was not.
 *
 * ON PURITY. Every animated value is a ramp over progress; update(1) is the
 * finished page.
 */
import { ORDER, register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import { fmtInr, fmtPct } from '../three/format';

import './zoom.css';

/** Ramp from 0 to 1 across [a, b], flat outside it. */
function span(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

/*
 * The reason code is shown exactly as the network writes it. An earlier pass
 * prettified 'fraud_card_absent' by swapping underscores for commas, which
 * produced "fraud, card, absent": three things where the code names one, and
 * worse than the raw token for a reader who has ever seen a real chargeback
 * notice. Codes are identifiers, so this prints the identifier.
 */

interface Cue {
  el: HTMLElement;
  from: number;
  to: number;
}

class ZoomSection implements Section {
  readonly id = 'zoom';

  private cues: Cue[] = [];

  mount(root: HTMLElement, data: Snapshot): void {
    root.classList.add('on-charcoal', 'section--runway', 'zoom-section');
    root.style.height = '230svh';

    const contest = data.cases.contest;
    const txn = contest.transaction_id ?? contest.casefile.transaction_id;
    const amount = contest.amount_inr;
    const reason = contest.reason_code;
    const p = contest.p_chargeback ?? contest.decision.p_chargeback;

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner zoom__inner">
          <div class="zoom__column">
            <div class="ruled-kicker zoom__cue" data-cue><span class="kicker">One dispute</span></div>

            <h2 class="title zoom__head zoom__cue" data-cue>Now just one of them</h2>

            <p class="lede zoom__lede zoom__cue" data-cue>
              The money is already gone. The bank took it back this morning and
              you have about a week to decide what to do about it.
            </p>

            <dl class="zoom__facts">
              <div class="zoom__fact zoom__cue" data-cue tabindex="0">
                <dt class="micro zoom__fact-label">Transaction</dt>
                <dd class="num zoom__fact-value" data-fact="txn"></dd>
              </div>
              <div class="zoom__fact zoom__cue" data-cue tabindex="0">
                <dt class="micro zoom__fact-label">Amount at stake</dt>
                <dd class="num zoom__fact-value is-accept" data-fact="amount"></dd>
              </div>
              <div class="zoom__fact zoom__cue" data-cue tabindex="0">
                <dt class="micro zoom__fact-label">Bank's reason code</dt>
                <dd class="num zoom__fact-value" data-fact="reason"></dd>
              </div>
              <div class="zoom__fact zoom__cue" data-cue tabindex="0">
                <dt class="micro zoom__fact-label">Chargeback risk, scored</dt>
                <dd class="num zoom__fact-value is-review" data-fact="p"></dd>
              </div>
            </dl>

            <p class="zoom__why zoom__cue" data-cue>
              Contesting is not free, and it is not automatic. Fighting every
              dispute loses money, and so does fighting none. The question is
              which ones are worth the fee, and that is a number rather than an
              instinct.
            </p>

            <ol class="zoom__next">
              <li class="zoom__step zoom__cue" data-cue>
                <a href="#gate1">
                  <span class="num zoom__step-n">01</span>
                  <span class="zoom__step-title">Theft, or regret?</span>
                  <span class="micro zoom__step-note">Whether this one is winnable at all</span>
                </a>
              </li>
              <li class="zoom__step zoom__cue" data-cue>
                <a href="#gate2">
                  <span class="num zoom__step-n">02</span>
                  <span class="zoom__step-title">Worth it, or not?</span>
                  <span class="micro zoom__step-note">Whether the expected value clears the cost</span>
                </a>
              </li>
              <li class="zoom__step zoom__cue" data-cue>
                <a href="#refusal">
                  <span class="num zoom__step-n">03</span>
                  <span class="zoom__step-title">Made up, or grounded?</span>
                  <span class="micro zoom__step-note">Every claim tied to the vault, or no claim</span>
                </a>
              </li>
            </ol>

            <p class="micro zoom__cue zoom__cta" data-cue>Keep scrolling</p>
          </div>
        </div>
      </div>
    `;

    const put = (key: string, text: string): void => {
      const el = root.querySelector<HTMLElement>('[data-fact="' + key + '"]');
      if (el) el.textContent = text;
    };

    put('txn', String(txn));
    put('amount', amount === undefined ? 'not in snapshot' : fmtInr(amount));
    put('reason', reason === undefined ? 'not in snapshot' : reason);
    put('p', fmtPct(p, 1));

    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-cue]'));
    const FIRST = 0.04;
    const STEP = 0.062;
    const FADE = 0.09;
    this.cues = els.map((el, i) => ({
      el,
      from: FIRST + i * STEP,
      to: FIRST + i * STEP + FADE,
    }));

    this.update(0);
  }

  update(progress: number): void {
    for (const c of this.cues) {
      c.el.style.setProperty('--in', span(progress, c.from, c.to).toFixed(3));
    }
  }

  unmount(): void {
    this.cues = [];
  }
}

register({
  order: ORDER.zoom,
  id: 'zoom',
  create: () => new ZoomSection(),
});
