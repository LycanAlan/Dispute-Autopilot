/*
 * live.ts
 *
 * Section 10, id "live". Probes GET /health on the local API once, on mount,
 * with a short timeout. If it answers, the visitor can POST one of the demo
 * cases to /disputes/{id}/triage and see the real Decision come back. If it
 * does not answer, times out, or errors, this falls back silently to the
 * decision already baked into snapshot.json: no error text, no console
 * noise, no red.
 *
 * The health probe and the DOM build both happen inside mount(), which the
 * engine awaits before calling update() for the first time. That is what
 * keeps a spinner from ever being this section's terminal state: by the time
 * anything is on screen, the LIVE/offline question is already answered.
 *
 * snapshot.json's cases.accept is null on this data -- see notes.accept_case
 * in the snapshot for the documented reason. core/data.ts types DemoCase and
 * Snapshot without an accept nullability or a `notes` field, since those are
 * shaped by the exporter rather than the section contract, so this file
 * reads them defensively rather than editing core/data.ts.
 */

import { register, ORDER } from '../core/registry';
import type { Action, Decision, DemoCase } from '../core/data';
import type { Section, Snapshot } from '../core/section';

import './live.css';

const API_BASE = 'http://127.0.0.1:8000';
const HEALTH_TIMEOUT_MS = 1500;
const TRIAGE_TIMEOUT_MS = 8000;

/** The fields snapshot.json's demo cases carry beyond core/data.ts's DemoCase. */
interface CaseFeatures {
  dispute_id: string;
  transaction_id: number;
  amount_inr: number;
  reason_code: string;
  features: Record<string, unknown>;
}

type LiveCase = DemoCase & CaseFeatures;

/** notes is written by the exporter for humans reading the file, not typed in core/data.ts. */
interface SnapshotNotes {
  notes?: { accept_case?: string };
}

function fmtPercent1(v: number): string {
  return (v * 100).toFixed(1) + '%';
}

function fmtINR0(v: number): string {
  const rounded = Math.round(v);
  const sign = rounded < 0 ? '-' : rounded > 0 ? '+' : '';
  return sign + '₹' + Math.abs(rounded).toLocaleString('en-IN');
}

async function probeHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + '/health', {
      signal: controller.signal,
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function runTriage(c: LiveCase): Promise<Decision> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRIAGE_TIMEOUT_MS);
  try {
    const res = await fetch(
      API_BASE + '/disputes/' + encodeURIComponent(c.dispute_id) + '/triage',
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: c.transaction_id,
          amount_inr: c.amount_inr,
          reason_code: c.reason_code,
          transaction: c.features,
        }),
      },
    );
    if (!res.ok) throw new Error('triage responded ' + res.status);
    return (await res.json()) as Decision;
  } finally {
    clearTimeout(timer);
  }
}

function actionClass(action: Action): string {
  if (action === 'CONTEST') return 'is-contest';
  if (action === 'REVIEW') return 'is-review';
  return 'is-accept';
}

class LiveSection implements Section {
  readonly id = 'live';

  private contentEl: HTMLElement | null = null;
  private resultEl: HTMLElement | null = null;
  private buttons: HTMLButtonElement[] = [];

  async mount(root: HTMLElement, data: Snapshot): Promise<void> {
    const live = await probeHealth();

    const contest = data.cases.contest as unknown as LiveCase;
    const review = data.cases.review as unknown as LiveCase;
    // The type says DemoCase; the data, honestly, says null on this snapshot.
    const accept = (data.cases as unknown as { accept: LiveCase | null }).accept;
    const acceptNote = (data as Snapshot & SnapshotNotes).notes?.accept_case ?? '';

    const badgeText = live
      ? 'LIVE, calling the local API'
      : 'Precomputed. Start the API to run this live.';

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner">
          <div class="live__layout">
            <div class="live__intro">
              <div class="ruled-kicker"><span class="kicker">Try it</span></div>
              <h2 class="title">Run one through yourself</h2>
              <div class="prose">
                <p class="lede">
                  Pick a transaction. It goes to the scoring model, the evidence
                  gate, and the economics, in that order.
                </p>
              </div>
              <div class="live__badge${live ? ' live__badge--live' : ''}">
                <span class="live__dot" aria-hidden="true"></span>
                <span class="micro">${badgeText}</span>
              </div>
            </div>

            <div class="live__panel">
              <div class="live__cases" role="group" aria-label="Pick a case">
                <button type="button" class="live__case" data-pick="contest">
                  <span class="live__case-action is-contest">CONTEST case</span>
                  <span class="live__case-meta">Dispute ${contest.dispute_id}, row ${contest.row}</span>
                  <span class="live__case-meta">${fmtINR0(contest.amount_inr)}, ${contest.reason_code.replace(/_/g, ' ')}</span>
                </button>
                <button type="button" class="live__case" data-pick="review">
                  <span class="live__case-action is-review">REVIEW case</span>
                  <span class="live__case-meta">Dispute ${review.dispute_id}, row ${review.row}</span>
                  <span class="live__case-meta">${fmtINR0(review.amount_inr)}, ${review.reason_code.replace(/_/g, ' ')}</span>
                </button>
                <div class="live__case live__case--unavailable">
                  <span class="live__case-action is-accept">ACCEPT case</span>
                  <span class="live__case-meta">Not available on this data.</span>
                </div>
              </div>

              ${
                acceptNote
                  ? `<p class="small live__accept-note"><strong>Why there is no ACCEPT case here.</strong> ${acceptNote}</p>`
                  : ''
              }

              <div class="live__result" data-result>
                <p class="small live__placeholder">Pick a case above to see the decision.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.contentEl = root.querySelector('.live__layout');
    this.resultEl = root.querySelector('[data-result]');

    const byId: Record<string, LiveCase | null> = { contest, review, accept };

    this.buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-pick]'));
    for (const button of this.buttons) {
      const key = button.dataset['pick'] ?? '';
      const c = byId[key];
      if (!c) continue;
      button.addEventListener('click', () => {
        for (const other of this.buttons) other.classList.remove('is-selected');
        button.classList.add('is-selected');
        void this.showDecision(c, live);
      });
    }
  }

  private async showDecision(c: LiveCase, live: boolean): Promise<void> {
    if (!this.resultEl) return;

    if (!live) {
      this.renderDecision(c.decision, 'Precomputed, from the snapshot.');
      return;
    }

    this.resultEl.innerHTML = '<p class="small live__placeholder">Calling the API.</p>';
    try {
      const decision = await runTriage(c);
      this.renderDecision(decision, 'From the running API, just now.');
    } catch {
      // The health probe answered a minute ago; the server can still vanish
      // between then and a click. Same rule applies: fail silently, and the
      // demo still works.
      this.renderDecision(c.decision, 'Precomputed, from the snapshot.');
    }
  }

  private renderDecision(decision: Decision, sourceLabel: string): void {
    if (!this.resultEl) return;

    const missing = decision.missing_required.length
      ? `<p class="small live__missing">Missing evidence: ${decision.missing_required.join(', ')}</p>`
      : '';
    const refused = decision.refused_claims.length
      ? `<p class="small live__missing">Claims refused by the groundedness gate: ${decision.refused_claims.length}</p>`
      : '';

    this.resultEl.innerHTML = `
      <div class="live__stamp ${actionClass(decision.action)}">${decision.action}</div>
      <div class="live__stats">
        <div class="readout"><span class="readout__label">Chargeback probability</span><span class="readout__value">${fmtPercent1(decision.p_chargeback)}</span></div>
        <div class="readout"><span class="readout__label">Win probability</span><span class="readout__value">${fmtPercent1(decision.p_win)}</span></div>
        <div class="readout"><span class="readout__label">Expected value</span><span class="readout__value">${fmtINR0(decision.delta_ev_inr)}</span></div>
        <div class="readout"><span class="readout__label">Evidence completeness</span><span class="readout__value">${fmtPercent1(decision.w_completeness)}</span></div>
      </div>
      ${missing}
      ${refused}
      <p class="small live__notice">${decision.assumption_notice}</p>
      <p class="micro">${sourceLabel}</p>
    `;
  }

  // Static content, so a light entrance is the only thing progress drives.
  // The panel itself is fully painted by mount(), independent of scroll.
  update(progress: number): void {
    if (!this.contentEl) return;
    const t = Math.max(0, Math.min(1, progress / 0.18));
    this.contentEl.style.opacity = String(t);
    this.contentEl.style.transform = 'translateY(' + ((1 - t) * 10).toFixed(2) + 'px)';
  }

  unmount(): void {
    for (const button of this.buttons) button.replaceWith(button.cloneNode(true));
    this.buttons = [];
    this.contentEl = null;
    this.resultEl = null;
  }
}

register({
  order: ORDER.live,
  id: 'live',
  create: () => new LiveSection(),
});
