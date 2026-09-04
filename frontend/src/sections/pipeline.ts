/*
 * pipeline.ts
 *
 * Section between "measured" and "live", id "pipeline": "The pipeline, running"
 *
 * Every other section on this page renders a number that was computed once,
 * offline, and baked into snapshot.json. This one does not. A click sends a
 * real batch of real IEEE-CIS rows to POST /run on the local API, and the
 * response streams back one real Decision per row, as dispute_autopilot's own
 * score -> gate -> decide -> assemble -> verify pipeline finishes each one.
 * The row list, the progress bar, and the summary line are all painted
 * straight from that stream. Nothing here is staged.
 *
 * BATCH_N is 50 on purpose, not tuned down for snappiness: a real triage
 * measures at roughly 178 ms end to end, so 50 of them take on the order of
 * nine seconds, and that is deliberately how long this section takes to
 * finish. Watching it take a moment is the point being made.
 *
 * ABSOLUTE CONSTRAINT this section depends on and never overrides: /run
 * passes assemble_deterministic explicitly into every triage() call, so a
 * CONTEST row can never reach the provider seam that would call a live model.
 * See src/dispute_autopilot/api/main.py's _triage_batch(). This file makes
 * zero calls of its own beyond GET /health and POST /run.
 *
 * ON PURITY. update() only fades the panel in as the section scrolls into
 * view, exactly like measured.ts and gate2.ts. The run itself is a direct
 * user action -- a click -- never scroll-driven, so it lives entirely outside
 * update() and stays live under ?still=1 for the same reason gate2's slider
 * and refusal's replay button do.
 *
 * ON FAILURE. If GET /health does not answer, the button is disabled and a
 * quiet line says so and names the command that starts the API -- never a
 * spinner left running, never red text, never a console.error. Modeled on
 * live.ts, which solves the same problem for the section this one sits next
 * to.
 */

import { register, ORDER } from '../core/registry';
import type { Action, Posture } from '../core/data';
import type { Section, Snapshot } from '../core/section';

import './pipeline.css';

const API_BASE = 'http://127.0.0.1:8000';
const HEALTH_TIMEOUT_MS = 1500;
// Generous: a cold server pays a one-time real-dataset load (several seconds)
// before its first row streams, on top of the run itself.
const RUN_TIMEOUT_MS = 45000;

// The measured fact this section exists to show: about 178 ms per real
// triage, so 50 of them take on the order of nine seconds. Not tuned for
// speed -- see the module note above.
const BATCH_N = 50;

const START_CMD =
  '.venv/Scripts/python.exe -m uvicorn dispute_autopilot.api.main:app ' +
  '--host 127.0.0.1 --port 8000 --app-dir src';

const FIELD_LABEL: Record<string, string> = {
  billing_proof: 'billing',
  shipping_proof: 'shipping',
};

interface RunRecord {
  transaction_id: number;
  amount_inr: number;
  p_chargeback: number;
  posture: Posture;
  w_completeness: number;
  missing_required: string[];
  delta_ev_inr: number;
  action: Action;
  elapsed_ms: number;
}

interface RunSummary {
  n: number;
  counts: Record<string, number>;
  exposure_decided_inr: number;
  total_wall_ms: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function fmtINR0(v: number): string {
  const rounded = Math.round(v);
  const sign = rounded < 0 ? '-' : rounded > 0 ? '+' : '';
  return sign + '₹' + Math.abs(rounded).toLocaleString('en-IN');
}

function fmtINRAbs(v: number): string {
  return '₹' + Math.round(Math.abs(v)).toLocaleString('en-IN');
}

function actionClass(action: Action): string {
  if (action === 'CONTEST') return 'is-contest';
  if (action === 'REVIEW') return 'is-review';
  return 'is-accept';
}

/** Why a row landed where it did. The evidence gate firing has to be visible,
 * not just its verdict -- that is the system refusing, not deciding. */
function whyText(r: RunRecord): string {
  if (r.missing_required.length > 0) {
    return 'no ' + r.missing_required.map((f) => FIELD_LABEL[f] ?? f).join(' + ');
  }
  return 'ev ' + fmtINR0(r.delta_ev_inr);
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

/**
 * Reads POST /run's newline-delimited JSON body as it arrives, calling
 * onRecord for each triaged row and onSummary once for the final line.
 * Buffers across chunk boundaries: a network chunk is not guaranteed to end
 * on a line break.
 */
async function streamRun(
  n: number,
  seed: number,
  onRecord: (r: RunRecord) => void,
  onSummary: (s: RunSummary) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(API_BASE + '/run', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ n, seed }),
  });
  if (!res.ok || !res.body) throw new Error('run responded ' + res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consume = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parsed = JSON.parse(trimmed) as RunRecord | { summary: RunSummary };
    if ('summary' in parsed) onSummary(parsed.summary);
    else onRecord(parsed);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n');
    while (idx >= 0) {
      consume(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
      idx = buffer.indexOf('\n');
    }
  }
  if (buffer.trim()) consume(buffer);
}

class PipelineSection implements Section {
  readonly id = 'pipeline';

  private panelEl: HTMLElement | null = null;
  private runButton: HTMLButtonElement | null = null;
  private progressEl: HTMLElement | null = null;
  private barFillEl: HTMLElement | null = null;
  private rowsEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private noteEl: HTMLElement | null = null;

  private live = false;
  private running = false;
  private processed = 0;
  private controller: AbortController | null = null;

  async mount(root: HTMLElement, _data: Snapshot): Promise<void> {
    root.classList.add('on-charcoal');

    this.live = await probeHealth();

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner">
          <div class="pipeline__panel" data-panel>
            <div class="pipeline__head">
              <div>
                <div class="ruled-kicker"><span class="kicker">Watch it run</span></div>
                <h2 class="title">The pipeline, running</h2>
              </div>
              <div class="pipeline__badge${this.live ? ' pipeline__badge--live' : ''}">
                <span class="pipeline__dot" aria-hidden="true"></span>
                <span class="micro" data-badge-text>${this.live ? 'LIVE' : 'OFFLINE'}</span>
              </div>
            </div>

            <p class="lede">
              A real batch of real transactions, sent to the local API and triaged
              one at a time. Every row below is the actual Decision that came back,
              as it came back.
            </p>

            <div class="pipeline__controls">
              <button type="button" class="pipeline__run" data-run${this.live ? '' : ' disabled'}>
                Run ${BATCH_N} disputes
              </button>
              <span class="micro pipeline__progress" data-progress>processed 0 / ${BATCH_N}</span>
            </div>

            <div class="pipeline__bar"><div class="pipeline__bar-fill" data-bar></div></div>

            <p class="small pipeline__note${this.live ? ' is-empty' : ''}" data-note>${
              this.live
                ? ''
                : `The backend is not running, so there is nothing real to run here.
                   Start it from the repo root: <code>${START_CMD}</code>`
            }</p>

            <ul class="pipeline__rows" data-rows aria-live="polite"></ul>

            <div class="pipeline__summary" data-summary></div>
          </div>
        </div>
      </div>
    `;

    this.panelEl = root.querySelector('[data-panel]');
    this.runButton = root.querySelector('[data-run]');
    this.progressEl = root.querySelector('[data-progress]');
    this.barFillEl = root.querySelector('[data-bar]');
    this.rowsEl = root.querySelector('[data-rows]');
    this.summaryEl = root.querySelector('[data-summary]');
    this.noteEl = root.querySelector('[data-note]');

    this.runButton?.addEventListener('click', this.handleRun);
  }

  private handleRun = (): void => {
    if (!this.live || this.running || !this.rowsEl) return;

    this.running = true;
    this.runButton?.setAttribute('disabled', 'true');
    this.rowsEl.replaceChildren();
    if (this.summaryEl) this.summaryEl.replaceChildren();
    this.setNote(null);
    this.processed = 0;
    this.setProgress(0, BATCH_N);
    this.setBar(0);

    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
    // A fresh seed per click, so a second run is a different real batch, not
    // a replay of the first.
    const seed = Math.floor(Math.random() * 1_000_000_000);

    streamRun(
      BATCH_N,
      seed,
      (record) => {
        this.processed += 1;
        this.appendRow(record);
        this.setProgress(this.processed, BATCH_N);
        this.setBar(this.processed / BATCH_N);
      },
      (summary) => this.renderSummary(summary),
      controller.signal,
    )
      .catch(() => {
        // Same rule as live.ts: the health probe answered a moment ago, and
        // the server can still vanish mid-run. Quiet, not red, not logged.
        this.setNote('The run stopped before it finished. Reload once the backend is back.');
      })
      .finally(() => {
        clearTimeout(timer);
        this.running = false;
        this.controller = null;
        this.runButton?.removeAttribute('disabled');
      });
  };

  private appendRow(r: RunRecord): void {
    if (!this.rowsEl) return;
    // One list item, appended once. The list scrolls; nothing already on
    // screen is re-rendered by a new row landing.
    this.rowsEl.insertAdjacentHTML(
      'beforeend',
      `<li class="pipeline__row">
        <span class="pipeline__cell pipeline__cell--id num">${r.transaction_id}</span>
        <span class="pipeline__cell pipeline__cell--p num">p ${r.p_chargeback.toFixed(3)}</span>
        <span class="pipeline__cell pipeline__cell--posture micro">${r.posture}</span>
        <span class="pipeline__cell pipeline__cell--why num">${whyText(r)}</span>
        <span class="pipeline__cell pipeline__cell--arrow" aria-hidden="true">&rarr;</span>
        <span class="pipeline__cell pipeline__cell--action ${actionClass(r.action)}">${r.action}</span>
      </li>`,
    );
    this.rowsEl.scrollTop = this.rowsEl.scrollHeight;
  }

  private setProgress(done: number, total: number): void {
    if (this.progressEl) this.progressEl.textContent = `processed ${done} / ${total}`;
  }

  private setBar(fraction: number): void {
    if (this.barFillEl) this.barFillEl.style.width = (clamp01(fraction) * 100).toFixed(2) + '%';
  }

  private setNote(text: string | null): void {
    if (!this.noteEl) return;
    this.noteEl.textContent = text ?? '';
    this.noteEl.classList.toggle('is-empty', !text);
  }

  private renderSummary(summary: RunSummary): void {
    if (!this.summaryEl) return;
    const contest = summary.counts['CONTEST'] ?? 0;
    const accept = summary.counts['ACCEPT'] ?? 0;
    const review = summary.counts['REVIEW'] ?? 0;
    const seconds = (summary.total_wall_ms / 1000).toFixed(1);

    this.summaryEl.innerHTML = `
      <div class="pipeline__counts">
        <span class="pipeline__count is-contest">CONTEST <span class="num">${contest}</span></span>
        <span class="pipeline__count is-accept">ACCEPT <span class="num">${accept}</span></span>
        <span class="pipeline__count is-review">REVIEW <span class="num">${review}</span></span>
      </div>
      <p class="small pipeline__exposure">
        ${fmtINRAbs(summary.exposure_decided_inr)} of exposure decided in ${seconds} seconds.
      </p>
    `;
  }

  // Pure with respect to progress: this only fades the panel in as the
  // section enters, exactly like measured.ts and gate2.ts. The run itself is
  // a click, not scroll, so it lives entirely in handleRun and stays live
  // under ?still=1.
  update(progress: number): void {
    if (this.panelEl) {
      const revealed = clamp01(progress / 0.3);
      this.panelEl.style.opacity = String(revealed);
      this.panelEl.style.transform = `translateY(${(1 - revealed) * 10}px)`;
    }
  }

  unmount(): void {
    this.runButton?.removeEventListener('click', this.handleRun);
    this.controller?.abort();
    this.controller = null;
    this.panelEl = null;
    this.runButton = null;
    this.progressEl = null;
    this.barFillEl = null;
    this.rowsEl = null;
    this.summaryEl = null;
    this.noteEl = null;
  }
}

register({
  order: (ORDER.measured + ORDER.live) / 2,
  id: 'pipeline',
  create: () => new PipelineSection(),
});
