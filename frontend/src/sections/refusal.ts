/*
 * refusal.ts  -  section 8, "Did the model make it up?"
 *
 * The section every other section on this page exists to set up.
 *
 * A drafted representment is checked claim by claim against the evidence
 * vault. Five claims find the key they cite. The sixth does not, because it
 * was never in the vault. It is struck, and the decision rolls from CONTEST
 * to REVIEW.
 *
 * None of this is staged in the browser. The claims, their source keys, the
 * verdict on each, and the before and after actions all come out of
 * snapshot.refusal, which the exporter produced by running the real fault
 * injection path. The page is a viewer for a result, not a re-enactment of
 * one. If the pipeline stopped refusing, this section would stop striking.
 *
 * ON PURITY. update() is pure with respect to progress, as the contract
 * requires, with one deliberate exception: the replay button drives an
 * internal playhead that overrides scroll position while it runs. A video
 * take needs more than one attempt at this, and scrolling backwards to
 * re-arm it would be filmed as an obvious scrub. Replay is a direct user
 * action, not scroll-driven motion, so it stays live under ?still=1 for the
 * same reason the amount slider in gate2 does.
 */

import { flags } from '../core/engine';
import { register, ORDER } from '../core/registry';
import type { Claim } from '../core/data';
import type { Section, Snapshot } from '../core/section';

import './refusal.css';

/* The choreography, as fractions of section progress. Named rather than
 * scattered as literals, because the timing is the whole performance and it
 * gets tuned against a stopwatch while filming. */
const T = {
  vaultIn: 0.06,      // the vault has finished arriving
  firstClaim: 0.12,   // claim 0 lands
  claimStep: 0.088,   // spacing between claims
  searchHold: 0.10,   // how long the last claim hunts before failing
  strike: 0.80,       // the strike lands
  verdict: 0.88,      // the stamp rolls
} as const;

const REPLAY_MS = 7600;

/** Ramp from 0 to 1 across [a, b], flat outside it. */
function span(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

interface ClaimRow {
  el: HTMLElement;
  claim: Claim;
  /** The vault card this claim cites, or null when it cites nothing real. */
  target: HTMLElement | null;
  appearsAt: number;
  resolvesAt: number;
}

class RefusalSection implements Section {
  readonly id = 'refusal';

  private root: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private svg: SVGSVGElement | null = null;
  private rows: ClaimRow[] = [];
  private stampEl: HTMLElement | null = null;
  private noteEl: HTMLElement | null = null;
  private scrubEl: HTMLElement | null = null;

  private scrollProgress = 0;
  private playhead: number | null = null;
  private raf = 0;
  private onResize = (): void => this.draw(this.playhead ?? this.scrollProgress);

  mount(root: HTMLElement, data: Snapshot): void {
    this.root = root;
    root.classList.add('section--runway', 'refusal');
    root.style.height = '360svh';

    const refusal = data.refusal;

    // Vault order follows the order the claims cite it, so the connectors run
    // roughly parallel instead of crossing. Ordering it by the case file's own
    // key order looks arbitrary on screen and made five honest citations read
    // as a tangle, which is the opposite of the point being made here.
    const cited = refusal.claims.map((c) => c.source_field).filter(Boolean);
    const items = Object.values(refusal.casefile.items).slice().sort((a, b) => {
      const ia = cited.indexOf(a.source);
      const ib = cited.indexOf(b.source);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    // A claim cites a SOURCE key ("carrier_tracking"), not the evidence field
    // name ("shipping_proof"), so the join is on item.source. Getting this
    // backwards would have drawn every connector into empty space and made
    // the honest claims look fabricated too.
    const vaultId = (source: string): string => 'vault-' + source;

    root.innerHTML = `
      <div class="section__stage">
       <div class="section__inner refusal__stage">
        <header class="refusal__head">
          <div>
            <div class="ruled-kicker"><span class="kicker">Gate three</span></div>
            <h2 class="title refusal__title">Did the model make it up?</h2>
          </div>
          <div class="prose refusal__prose">
            <p>An LLM asked for a representment will produce one. Tracking number, delivery date, signature. Fluent and complete, whether or not any of it happened.</p>
            <p>Every sentence here has to point at a key in the evidence file. A deterministic check walks each one. No model marks its own work.</p>
          </div>
        </header>

        <div class="refusal__floor">
          <section class="vault" aria-label="Evidence vault">
            <span class="kicker">The vault</span>
            <p class="micro vault__note">What the merchant actually holds for transaction ${refusal.casefile.transaction_id}.</p>
            <ul class="vault__list">
              ${items
                .map(
                  (it) => `
                <li class="vault__item" id="${vaultId(it.source)}">
                  <span class="vault__key">${it.source}</span>
                  <span class="vault__value">${it.value}</span>
                </li>`,
                )
                .join('')}
            </ul>
          </section>

          <svg class="refusal__wires" aria-hidden="true"></svg>

          <section class="draft" aria-label="Drafted representment">
            <span class="kicker">The draft</span>
            <p class="micro draft__note">Each line has to name the key it came from.</p>
            <ol class="draft__list">
              ${refusal.claims
                .map(
                  (c) => `
                <li class="claim" data-grounded="${c.grounded}">
                  <p class="claim__text">${c.text}</p>
                  <p class="claim__cite">
                    <span class="claim__mark" aria-hidden="true"></span>
                    <span class="claim__source">${c.source_field ?? 'no source given'}</span>
                  </p>
                </li>`,
                )
                .join('')}
            </ol>
          </section>
        </div>

        <footer class="refusal__verdict">
          <p class="refusal__note" data-note>This claim points at nothing.</p>
          <div class="stamp" data-stamp>
            <span class="stamp__from">${refusal.before}</span>
            <span class="stamp__arrow" aria-hidden="true">becomes</span>
            <span class="stamp__to">${refusal.after}</span>
          </div>
          <p class="refusal__after">A person sees the sentence that was rejected.</p>
          <blockquote class="pull">The model drafts. It never decides.</blockquote>
          <button class="replay" type="button" data-replay>Run it again</button>
          <p class="micro refusal__provenance">
            Produced by the fault injection path in the repository, not staged here.
            Groundedness on this bundle: ${refusal.claims.filter((c) => c.grounded).length} of ${refusal.claims.length}.
          </p>
        </footer>
       </div>
      </div>
    `;

    this.stage = root.querySelector('.refusal__stage');
    this.svg = root.querySelector('.refusal__wires');
    this.stampEl = root.querySelector('[data-stamp]');
    this.noteEl = root.querySelector('[data-note]');

    const claimEls = Array.from(root.querySelectorAll<HTMLElement>('.claim'));
    this.rows = claimEls.map((el, i) => {
      const claim = refusal.claims[i];
      const appearsAt = T.firstClaim + i * T.claimStep;
      return {
        el,
        claim,
        target: claim.source_field
          ? root.querySelector<HTMLElement>('#' + CSS.escape(vaultId(claim.source_field)))
          : null,
        appearsAt,
        // A grounded claim resolves almost as it lands. The fabricated one
        // hunts for a while first, which is the only honest way to show that
        // the check is a search and not a foregone conclusion.
        resolvesAt: claim.grounded ? appearsAt + 0.03 : T.strike,
      };
    });

    const replay = root.querySelector<HTMLElement>('[data-replay]');
    replay?.addEventListener('click', () => this.replay());
    this.scrubEl = replay;

    window.addEventListener('resize', this.onResize, { passive: true });

    // ?still=1 never scrolls, so paint the finished state now rather than
    // leaving an empty stage waiting for a progress event that will not come.
    this.draw(flags.still ? 1 : 0);
  }

  update(progress: number): void {
    this.scrollProgress = progress;
    if (this.playhead === null) this.draw(progress);
  }

  unmount(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.root = null;
    this.stage = null;
    this.svg = null;
    this.rows = [];
    this.stampEl = null;
    this.noteEl = null;
    this.scrubEl = null;
  }

  /* --------------------------------------------------------------- replay */

  private replay(): void {
    cancelAnimationFrame(this.raf);
    const started = performance.now();
    this.scrubEl?.setAttribute('disabled', 'true');

    const step = (now: number): void => {
      const t = Math.min(1, (now - started) / REPLAY_MS);
      this.playhead = t;
      this.draw(t);
      if (t < 1) {
        this.raf = requestAnimationFrame(step);
      } else {
        // Hand control back to the scroll, but hold the finished frame: the
        // section is on screen at this point, so snapping back to whatever
        // the scroll says would undo the strike the viewer just watched.
        this.playhead = null;
        this.scrubEl?.removeAttribute('disabled');
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------------- paint */

  private draw(p: number): void {
    if (!this.root) return;

    const vaultIn = span(p, 0, T.vaultIn);
    this.root.style.setProperty('--vault-in', vaultIn.toFixed(3));

    for (const row of this.rows) {
      const landed = span(p, row.appearsAt, row.appearsAt + 0.05);
      row.el.style.setProperty('--in', landed.toFixed(3));

      // Three states, and the middle one matters: a claim under examination
      // is neither confirmed nor rejected, and showing it as either would be
      // the visual equivalent of assuming the answer.
      const state = !row.claim.grounded && p >= T.strike
        ? 'struck'
        : p >= row.resolvesAt
          ? 'held'
          : landed > 0
            ? 'checking'
            : 'waiting';
      row.el.dataset.state = state;
    }

    if (this.noteEl) {
      this.noteEl.style.setProperty('--in', span(p, T.strike, T.strike + 0.04).toFixed(3));
    }
    if (this.stampEl) {
      this.stampEl.style.setProperty('--in', span(p, T.verdict, T.verdict + 0.06).toFixed(3));
      this.stampEl.dataset.rolled = p >= T.verdict ? 'true' : 'false';
    }

    this.wires(p);
  }

  /** Connector lines from each landed claim to the vault key it cites. */
  private wires(p: number): void {
    const svg = this.svg;
    const stage = this.stage;
    if (!svg || !stage) return;

    // ?flat=1 turns off WebGL, not this: these are two dozen SVG line
    // segments, and the connection between a claim and its source is the
    // argument, not decoration on top of it.
    const box = stage.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);

    const parts: string[] = [];
    for (const row of this.rows) {
      const drawn = span(p, row.appearsAt, row.resolvesAt + 0.02);
      if (drawn <= 0) continue;

      const from = row.el.getBoundingClientRect();
      const y1 = from.top - box.top + from.height / 2;

      if (!row.target) {
        // Nothing to connect to. The line reaches into the gap and stops,
        // which is the picture of a citation with no referent.
        const x1 = from.left - box.left;
        const stub = 46 * drawn;
        parts.push(
          `<path class="wire wire--dangling" d="M ${x1} ${y1} L ${x1 - stub} ${y1}" style="--in:${drawn.toFixed(3)}"/>`,
        );
        continue;
      }

      const to = row.target.getBoundingClientRect();
      const x1 = from.left - box.left;
      const x2 = to.right - box.left;
      const y2 = to.top - box.top + to.height / 2;
      const mid = x2 + (x1 - x2) * 0.5;
      parts.push(
        `<path class="wire" d="M ${x2} ${y2} C ${mid} ${y2}, ${mid} ${y1}, ${x1} ${y1}" style="--in:${drawn.toFixed(3)}"/>`,
      );
    }
    svg.innerHTML = parts.join('');
  }
}

register({
  order: ORDER.refusal,
  id: 'refusal',
  create: () => new RefusalSection(),
});
