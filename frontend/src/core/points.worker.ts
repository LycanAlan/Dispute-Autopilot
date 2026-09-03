/*
 * points.worker.ts
 *
 * Fetches and decodes data/points.bin off the main thread, then transfers the
 * buffer rather than copying it. 1.6 MB of Float32 arriving mid scroll is a
 * dropped frame on camera if it lands on the main thread, and the recording
 * machine is not the machine this was written on.
 *
 * If the file is not there yet, this returns a deterministic stand-in cloud so
 * the scene has something to draw. The stand-in is flagged all the way back up
 * to the caller, because a shape that looks like data and is not is worse than
 * an empty screen.
 */

export interface PointsWorkerRequest {
  url: string;
  stride: number;
}

export type PointsWorkerResponse =
  | { ok: true; buffer: ArrayBuffer; count: number; synthetic: boolean; reason: string }
  | { ok: false; reason: string };

// lib.dom is the only DOM lib in tsconfig, so the worker global is reached
// through a narrow cast instead of pulling lib.webworker in alongside it.
const ctx = self as unknown as {
  postMessage(message: PointsWorkerResponse, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
};

/** mulberry32. Same seed, same cloud, on every machine and every reload. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A stand-in with roughly the right geometry: x spread over time, y a log
 * amount, z a risk score correlated with the label. Small enough to build in
 * under a frame, large enough to look like a cloud.
 */
function syntheticCloud(count: number, stride: number): Float32Array {
  const out = new Float32Array(count * stride);
  const rand = mulberry32(20260904);
  for (let i = 0; i < count; i += 1) {
    const x = rand();
    const y = Math.pow(rand(), 2.2);
    const label = rand() < 0.035 ? 1 : 0;
    const z = Math.min(0.999, Math.max(0.001, label ? 0.55 + rand() * 0.45 : rand() * 0.35));
    const o = i * stride;
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = z;
    out[o + 3] = label;
  }
  return out;
}

async function handle(request: PointsWorkerRequest): Promise<void> {
  const stride = request.stride > 0 ? request.stride : 4;

  try {
    const res = await fetch(request.url, { cache: 'force-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) throw new Error('points.bin is empty');
    if (buffer.byteLength % (4 * stride) !== 0) {
      throw new Error(
        'points.bin is ' +
          buffer.byteLength +
          ' bytes, which is not a whole number of ' +
          stride +
          ' value points',
      );
    }

    ctx.postMessage(
      {
        ok: true,
        buffer,
        count: buffer.byteLength / (4 * stride),
        synthetic: false,
        reason: '',
      },
      [buffer],
    );
  } catch (err) {
    const count = 20000;
    const stand = syntheticCloud(count, stride);
    ctx.postMessage(
      {
        ok: true,
        buffer: stand.buffer as ArrayBuffer,
        count,
        synthetic: true,
        reason: String(err),
      },
      [stand.buffer as ArrayBuffer],
    );
  }
}

ctx.addEventListener('message', (event: MessageEvent) => {
  void handle(event.data as PointsWorkerRequest);
});
