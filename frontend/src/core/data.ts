/*
 * data.ts
 *
 * Everything the site knows comes from two files that scripts/export_site_data.py
 * bakes out of the real artifacts:
 *
 *   data/snapshot.json   metrics, demo decisions, curves, the refusal payload
 *   data/points.bin      a flat Float32Array, [x, y, z, label] per point
 *
 * vite.config.ts points publicDir at frontend/data, so both are served from the
 * site root and copied into dist untouched. Build the URL from BASE_URL; never
 * hardcode the GitHub Pages prefix.
 *
 * The types below mirror src/dispute_autopilot/contracts.py. The three family
 * blocks are copied verbatim out of eval/reports/*.json by the exporter, so
 * their known keys are typed and an index signature lets extra keys through
 * rather than failing the build when a report gains a field.
 */

// Vite turns the ?worker suffix into a Worker constructor and bundles that
// file separately. The message types come from the worker module as types
// only, so nothing of data.ts is pulled into the worker bundle.
import PointsWorker from './points.worker?worker';
import type { PointsWorkerRequest, PointsWorkerResponse } from './points.worker';

/* --------------------------------------------------------- shared enums */

export type Action = 'CONTEST' | 'ACCEPT' | 'REVIEW';
export type Posture = 'NONE' | 'PASSIVE' | 'ACTIVE';

/* ------------------------------------------------- contracts.py mirrors */

export interface EvidenceItem {
  field: string;
  value: string;
  source: string;
}

export interface CaseFile {
  transaction_id: number;
  posture: Posture;
  items: Record<string, EvidenceItem>;
}

export interface Claim {
  text: string;
  source_field: string | null;
  grounded: boolean;
}

export interface EvidenceBundle {
  dispute_id: string;
  fields: Record<string, string>;
  claims: Claim[];
}

export interface Decision {
  dispute_id: string;
  action: Action;
  p_chargeback: number;
  p_win: number;
  delta_ev_inr: number;
  w_completeness: number;
  missing_required: string[];
  assumption_notice: string;
  bundle: EvidenceBundle | null;
  /**
   * Claims the groundedness verifier could not tie back to the vault.
   * Non-empty means the refusal gate fired and downgraded to REVIEW.
   */
  refused_claims: string[];
}

/* ----------------------------------------------------- report families */

/** family_a, verbatim from eval/reports/metrics.json. MEASURED on real labels. */
export interface FamilyA {
  basis: string;
  n_test: number;
  positive_rate: number;
  pr_auc: number;
  pr_auc_uncalibrated: number;
  roc_auc: number;
  brier: number;
  brier_uncalibrated: number;
  operating_threshold: number;
  operating_threshold_basis: string;
  precision_at_threshold: number;
  recall_at_threshold: number;
  f1_at_threshold: number;
  [key: string]: unknown;
}

/** family_b, verbatim. SIMULATED under config/costs.yaml. Never blend with A. */
export interface FamilyB {
  basis: string;
  assumptions: Record<string, number>;
  ev_optimal_threshold: number;
  precision_at_ev_threshold: number;
  recall_at_ev_threshold: number;
  net_inr: Record<string, number>;
  confusion_counts: Record<string, Record<string, number>>;
  model_uplift_vs_flag_all_inr: number;
  [key: string]: unknown;
}

/** One stratum of family_c, from eval/reports/generation_metrics.json. */
export interface FamilyCStratum {
  n: number;
  n_declined_by_model: number;
  n_malformed_responses: number;
  n_attributed_bundles: number;
  mean_claims_per_bundle: number;
  groundedness_mean_over_attributed: number;
  gate_refusal_rate: number;
  ungrounded_upper_bound_95: number;
  [key: string]: unknown;
}

/** family_c, verbatim. MEASURED on a synthetic evidence corpus. */
export interface FamilyC {
  basis: string;
  model: string;
  design: string;
  contestable: FamilyCStratum;
  adverse: FamilyCStratum;
  cases_refused_before_any_api_call: number;
  actual_usage: {
    api_calls: number;
    input_tokens: number;
    output_tokens: number;
    usd: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/* ------------------------------------------------------------ snapshot */

/** Fraction along x where each temporal split boundary sits, 0..1. */
export interface Split {
  /** Where the train boundary falls on the normalised time axis. */
  train_end_x: number;
  /** Where the calibration boundary falls on the normalised time axis. */
  calib_end_x: number;
  /**
   * Where those same two boundaries fall by ROW COUNT: 0.70 and 0.80. The
   * pair exists so section 3 can draw both and show the drift between them,
   * which is the whole argument of that section. They are not the same
   * number as train_end_x and calib_end_x, and treating them as if they were
   * is the mistake the section is about.
   */
  train_end_row_frac?: number;
  calib_end_row_frac?: number;
  train_rows?: number;
  calib_rows?: number;
  test_rows?: number;
}

export interface Curves {
  /** [recall, precision] pairs. */
  pr: Array<[number, number]>;
  /** [predicted, observed] pairs. */
  calibration: Array<[number, number]>;
}

/** One pre-selected demo row, with everything needed to render it offline. */
export interface DemoCase {
  row: number;
  decision: Decision;
  casefile: CaseFile;
  bundle?: EvidenceBundle;
  /**
   * The dispute as it arrives, before anything is decided about it. These sit
   * at the top level of the case in snapshot.json and are what section 5 uses
   * to say what is actually being contested: which transaction, for how much,
   * and under which reason code the bank pulled the money back.
   */
  transaction_id?: number;
  amount_inr?: number;
  reason_code?: string;
  p_chargeback?: number;
}

/**
 * The fault injection payload for section 8. Produced by the existing fault
 * injection path, not written by hand: one claim in `claims` has grounded
 * false, which is what flips the stamp from `before` to `after`.
 */
export interface Refusal {
  casefile: CaseFile;
  claims: Claim[];
  before: Action;
  after: Action;
}

export interface Snapshot {
  generated_at: string;
  n_total: number;
  n_sampled: number;
  split: Split;
  family_a: FamilyA;
  family_b: FamilyB;
  family_c: FamilyC;
  curves: Curves;
  cases: {
    contest: DemoCase;
    accept: DemoCase;
    review: DemoCase;
  };
  refusal: Refusal;

  /**
   * Stamped by the loader, never by the exporter. 'sample' means every figure
   * on screen is a placeholder and none of it may be filmed or quoted.
   */
  source?: 'real' | 'sample';
}

/* ------------------------------------------------------------- loading */

const BASE = import.meta.env.BASE_URL;

const SNAPSHOT_URL = BASE + 'snapshot.json';
const SAMPLE_URL = BASE + 'snapshot.sample.json';
const POINTS_URL = BASE + 'points.bin';

/** Values per point in points.bin: x, y, z, label. */
export const POINT_STRIDE = 4;

export interface PointCloud {
  /** Flat Float32Array, POINT_STRIDE values per point. */
  data: Float32Array;
  /** data.length / POINT_STRIDE. */
  count: number;
  stride: typeof POINT_STRIDE;
  /**
   * True when points.bin was missing and the worker generated a stand-in.
   * Anything drawn from a synthetic cloud is shape, not evidence.
   */
  synthetic: boolean;
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: abort.signal, cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Cheap structural check. A 404 page that parses as JSON should not pass. */
function looksLikeSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['n_total'] === 'number' && typeof v['cases'] === 'object';
}

let snapshotPromise: Promise<Snapshot> | null = null;

/**
 * Loads data/snapshot.json, falling back to data/snapshot.sample.json.
 *
 * The sample exists because the exporter and the site are built in parallel.
 * Its figures are all -1 and its strings say so, so a fallback is impossible
 * to mistake for a measurement. Check `snapshot.source` before filming.
 */
export function loadSnapshot(): Promise<Snapshot> {
  if (snapshotPromise) return snapshotPromise;

  snapshotPromise = (async () => {
    try {
      const real = await fetchJson(SNAPSHOT_URL, 8000);
      if (looksLikeSnapshot(real)) {
        real.source = 'real';
        return real;
      }
      throw new Error('snapshot.json did not have the expected shape');
    } catch (err) {
      console.warn(
        '[data] snapshot.json unavailable, falling back to snapshot.sample.json. ' +
          'Every figure on the page is now a placeholder. Reason:',
        err,
      );
    }

    const sample = await fetchJson(SAMPLE_URL, 8000);
    if (!looksLikeSnapshot(sample)) {
      throw new Error(
        'Neither snapshot.json nor snapshot.sample.json could be loaded. ' +
          'Run scripts/export_site_data.py, or check that frontend/data exists.',
      );
    }
    sample.source = 'sample';
    return sample;
  })();

  return snapshotPromise;
}

let pointsPromise: Promise<PointCloud> | null = null;

/**
 * Loads data/points.bin.
 *
 * The decode happens in a worker and the buffer comes back transferred, not
 * copied, so 1.6 MB of Float32 never blocks a frame. If the file is missing
 * the worker returns a deterministic stand-in cloud with synthetic set true.
 */
export function loadPoints(): Promise<PointCloud> {
  if (pointsPromise) return pointsPromise;

  pointsPromise = new Promise<PointCloud>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new PointsWorker();
    } catch (err) {
      reject(new Error('Could not start the points worker: ' + String(err)));
      return;
    }

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('points.bin decode timed out'));
    }, 30000);

    worker.onmessage = (event: MessageEvent<PointsWorkerResponse>) => {
      clearTimeout(timer);
      const msg = event.data;
      worker.terminate();
      if (msg.ok) {
        if (msg.synthetic) {
          console.warn(
            '[data] points.bin unavailable, using a synthetic stand-in cloud of ' +
              msg.count +
              ' points. Shape only, not the dataset. Reason: ' +
              msg.reason,
          );
        }
        resolve({
          data: new Float32Array(msg.buffer),
          count: msg.count,
          stride: POINT_STRIDE,
          synthetic: msg.synthetic,
        });
      } else {
        reject(new Error(msg.reason));
      }
    };

    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('points worker failed: ' + event.message));
    };

    const request: PointsWorkerRequest = { url: POINTS_URL, stride: POINT_STRIDE };
    worker.postMessage(request);
  });

  return pointsPromise;
}

