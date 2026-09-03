/*
 * engine.ts
 *
 * Mounts every registered section and drives its update(progress).
 *
 * Three rules, in the order they matter:
 *
 * 1. update() runs at most once per frame per section, inside one rAF loop.
 *    GSAP's ticker is that loop. ScrollTrigger only records the newest
 *    progress; the ticker is what calls into a section.
 *
 * 2. A section that is off screen is not updated. It gets exactly one settle
 *    call as it leaves, so it comes to rest at 0 or 1 rather than wherever the
 *    last frame caught it, and then nothing until it comes back.
 *
 * 3. Both kill switches are read from the query string and both must work at
 *    the same time. ?flat=1&still=1 is the floor the whole site is designed
 *    against: no WebGL, no motion, and the argument still reads.
 *
 * Query string:
 *
 *   ?flat=1        no WebGL. Sets <html data-flat> and flags.flat. Sections
 *                  check the flag and draw canvas or SVG instead.
 *   ?still=1       no motion. Sets <html data-still>, drops Lenis, and calls
 *                  every section's update(1) once. Never again.
 *   ?section=<id>  scroll straight to one section on load, for filming takes.
 *
 * Any of them accepts =0 or =false to turn it back off, which is what makes a
 * bookmarked URL recoverable.
 */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

import type { Snapshot } from './data';
import { registered, type SectionEntry } from './registry';
import type { Section } from './section';

gsap.registerPlugin(ScrollTrigger);

/* ---------------------------------------------------------------- flags */

export interface Flags {
  /** ?flat=1. No WebGL anywhere. Canvas and SVG fallbacks instead. */
  flat: boolean;
  /** ?still=1. No smoothing, no scroll driven updates, final state only. */
  still: boolean;
  /** The visitor asked the OS for less motion. Smoothing off, progress kept. */
  reducedMotion: boolean;
  /** ?section=<id>. Scroll here on load. */
  section: string | null;
}

function flagIn(params: URLSearchParams, name: string): boolean {
  if (!params.has(name)) return false;
  const raw = (params.get(name) ?? '').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/** Reads the switches fresh. Exported so a test can call it without a reload. */
export function readFlags(search: string = window.location.search): Flags {
  const params = new URLSearchParams(search);
  const section = params.get('section');
  return {
    flat: flagIn(params, 'flat'),
    still: flagIn(params, 'still'),
    reducedMotion:
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    section: section && section.trim() !== '' ? section.trim() : null,
  };
}

/**
 * The switches for this page load. Read once, at module load, from nothing but
 * the URL, so importing this module from a section is always safe.
 *
 *   import { flags } from '../core/engine';
 *   if (flags.flat) { drawWithCanvas(); } else { drawWithWebGL(); }
 */
export const flags: Flags = readFlags();

/* ------------------------------------------------------------- mounting */

export interface MountedSection {
  entry: SectionEntry;
  section: Section;
  /** The <section> element. Its DOM id is entry.id. */
  el: HTMLElement;
  /** Newest progress reported by ScrollTrigger, 0..1. */
  progress: number;
  /** Last progress actually passed to update(). */
  rendered: number;
  active: boolean;
  dirty: boolean;
  /** Set after update() throws once, so a broken section fails quietly. */
  broken: boolean;
  trigger: ScrollTrigger | null;
}

export interface Engine {
  readonly sections: readonly MountedSection[];
  readonly lenis: Lenis | null;
  scrollToSection(id: string, immediate?: boolean): void;
  refresh(): void;
  destroy(): void;
}

export interface StartOptions {
  /** Container the section elements are appended to. */
  root: HTMLElement;
  data: Snapshot;
}

const isCharcoal = (el: HTMLElement): boolean =>
  el.dataset['ground'] === 'charcoal' || el.classList.contains('on-charcoal');

export async function startEngine(options: StartOptions): Promise<Engine> {
  const { root, data } = options;
  const doc = document.documentElement;

  // The two switches announce themselves on <html> so CSS can react without
  // any JavaScript, and so a screenshot records which mode it was taken in.
  if (flags.flat) doc.setAttribute('data-flat', '');
  if (flags.still) doc.setAttribute('data-still', '');
  if (flags.reducedMotion) doc.setAttribute('data-reduced-motion', '');

  const entries = registered();
  if (entries.length === 0) {
    console.warn('[engine] no sections are registered, so there is nothing to mount');
  }

  // Elements first, in registry order, so document order is settled before any
  // section measures anything.
  const mounted: MountedSection[] = entries.map((entry) => {
    const el = document.createElement('section');
    el.className = 'section';
    el.id = entry.id;
    el.dataset['section'] = entry.id;
    root.appendChild(el);

    return {
      entry,
      section: entry.create(),
      el,
      progress: 0,
      rendered: Number.NaN,
      active: false,
      dirty: false,
      broken: false,
      trigger: null,
    };
  });

  for (const m of mounted) {
    if (m.section.id !== m.entry.id) {
      console.warn(
        '[engine] section registered as "' +
          m.entry.id +
          '" reports its own id as "' +
          m.section.id +
          '". The registry id is what ?section= and the anchor use.',
      );
    }
  }

  // Mounts run together. One section that fails to mount must not take the
  // other ten down with it, so each failure is contained and labelled.
  await Promise.all(
    mounted.map(async (m) => {
      try {
        await m.section.mount(m.el, data);
      } catch (err) {
        m.broken = true;
        console.error('[engine] section "' + m.entry.id + '" failed to mount:', err);
        const note = document.createElement('p');
        note.className = 'micro';
        note.style.padding = 'var(--gutter)';
        note.textContent = 'Section ' + m.entry.id + ' failed to mount. See the console.';
        m.el.appendChild(note);
      }
    }),
  );

  /* ------------------------------------------------------ running head */

  const railFill = document.querySelector<HTMLElement>('[data-rail-fill]');
  const whereEl = document.querySelector<HTMLElement>('[data-masthead-where]');
  const idEl = document.querySelector<HTMLElement>('[data-masthead-id]');
  const total = mounted.length;

  const pad = (n: number): string => String(n).padStart(2, '0');

  function setFocus(m: MountedSection): void {
    doc.dataset['ground'] = isCharcoal(m.el) ? 'charcoal' : 'paper';
    doc.dataset['sectionId'] = m.entry.id;
    const index = mounted.indexOf(m) + 1;
    if (whereEl) whereEl.textContent = pad(index) + ' / ' + pad(total);
    if (idEl) idEl.textContent = m.entry.id;
  }

  // Which section owns the viewport centre. An observer rather than a per
  // frame measurement, so it costs nothing and still works under ?still=1,
  // where the running head has to stay legible over both grounds.
  const focusObserver = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        const m = mounted.find((x) => x.el === record.target);
        if (m) setFocus(m);
      }
    },
    { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
  );
  for (const m of mounted) focusObserver.observe(m.el);
  if (mounted[0]) setFocus(mounted[0]);

  /* -------------------------------------------------------- still mode */

  function callUpdate(m: MountedSection, progress: number): void {
    if (m.broken) return;
    m.rendered = progress;
    try {
      m.section.update(progress);
    } catch (err) {
      m.broken = true;
      console.error(
        '[engine] section "' +
          m.entry.id +
          '" threw from update(' +
          progress.toFixed(4) +
          '). It will not be updated again.',
        err,
      );
    }
  }

  let lenis: Lenis | null = null;
  let tickerCallback: ((time: number) => void) | null = null;
  let maxScroll = 0;

  function scrollToSection(id: string, immediate = true): void {
    const m = mounted.find((x) => x.entry.id === id);
    if (!m) {
      console.warn(
        '[engine] ?section=' + id + ' does not match any registered section. ' +
          'Registered: ' + mounted.map((x) => x.entry.id).join(', '),
      );
      return;
    }
    if (lenis) {
      lenis.scrollTo(m.el, { immediate, force: true });
    } else {
      window.scrollTo({ top: m.el.getBoundingClientRect().top + window.scrollY, behavior: 'auto' });
    }
  }

  /**
   * Scroll to a section only once the page has stopped moving underneath it.
   *
   * A single requestAnimationFrame is too early. The display face is still
   * loading, and under ?flat=1 the canvas fallbacks have not sized themselves
   * yet, so every section above the target changes height after the scroll has
   * already happened and the page lands somewhere else. ?section=refusal&flat=1
   * reliably arrived at the hero, which is the one combination a filming
   * fallback cannot afford to get wrong.
   *
   * So: wait for fonts, wait two frames for layout, scroll, then scroll again
   * a moment later. The second call is a no-op when nothing moved and is the
   * whole fix when something did.
   */
  function settleThenScroll(id: string): void {
    const m = mounted.find((x) => x.entry.id === id);
    if (!m) {
      scrollToSection(id, true); // let it log its own warning about the id
      return;
    }

    // Re-assert on a fixed schedule rather than stopping once the position
    // looks stable. Stability is not the right signal: the five scene sections
    // share one canvas, and reparenting it changes their heights AFTER two
    // consecutive measurements have already agreed. ?section=model converged
    // early, then the page moved out from under it and the take opened on the
    // hero. These six calls cost nothing and outlast the reparenting.
    //
    // scrollIntoView, not a computed offset. The sections are sticky runways
    // and letting the browser resolve the target is both shorter and correct
    // for every one of them.
    const beats = [0, 120, 300, 600, 1000, 1600];
    const ready = document.fonts?.ready ?? Promise.resolve();
    void ready.then(() => {
      for (const ms of beats) {
        setTimeout(() => m.el.scrollIntoView({ block: 'start', behavior: 'auto' }), ms);
      }
    });
  }

  function requestedSection(): string | null {
    if (flags.section) return flags.section;
    const hash = window.location.hash.replace(/^#/, '');
    return hash !== '' && mounted.some((m) => m.entry.id === hash) ? hash : null;
  }

  if (flags.still) {
    // Final state, once, and then the engine is done. No ticker, no Lenis, no
    // ScrollTrigger. Scrolling moves the page and nothing recomputes, which is
    // exactly what a per section filming take wants.
    for (const m of mounted) callUpdate(m, 1);

    const target = requestedSection();
    if (target) settleThenScroll(target);

    const stillEngine: Engine = {
      sections: mounted,
      lenis: null,
      scrollToSection,
      refresh: () => {},
      destroy: () => {
        focusObserver.disconnect();
        for (const m of mounted) {
          try {
            m.section.unmount();
          } catch (err) {
            console.error('[engine] section "' + m.entry.id + '" threw on unmount:', err);
          }
        }
      },
    };
    exposeForFilming(stillEngine);
    return stillEngine;
  }

  /* ------------------------------------------------------- scroll mode */

  // Lenis is what makes the page feel like it has weight. It is also the first
  // thing to switch off: a visitor who asked for reduced motion gets the
  // browser's own scrolling, and every section still tracks progress, because
  // scroll linked movement stops the instant the visitor stops scrolling.
  if (!flags.reducedMotion) {
    lenis = new Lenis({
      duration: 1.05,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
    });
    lenis.on('scroll', ScrollTrigger.update);
  }

  for (const m of mounted) {
    m.trigger = ScrollTrigger.create({
      trigger: m.el,
      // A section taller than the viewport is a scroll runway: progress runs
      // 0 to 1 while it passes under a sticky stage. A section that fits gets
      // progress across its full traversal instead, because top-to-top on a
      // one screen section would be a zero length range.
      start: () => (m.el.offsetHeight > window.innerHeight + 1 ? 'top top' : 'top bottom'),
      end: () => (m.el.offsetHeight > window.innerHeight + 1 ? 'bottom bottom' : 'bottom top'),
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        m.progress = self.progress;
        m.dirty = true;
      },
      onToggle: (self) => {
        m.active = self.isActive;
        // Leaving settles the section at the boundary it left through, so it
        // is never abandoned mid animation by a fast scroll.
        m.progress = self.progress;
        m.dirty = true;
      },
    });
  }

  // One rAF loop for the whole page. Lenis advances first so ScrollTrigger has
  // this frame's scroll position, then every dirty section is flushed once.
  tickerCallback = (time: number) => {
    if (lenis) lenis.raf(time * 1000);

    for (const m of mounted) {
      if (!m.dirty) continue;
      m.dirty = false;
      if (!m.active && m.rendered === m.progress) continue;
      callUpdate(m, m.progress);
    }

    if (railFill) {
      const p = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      railFill.style.width = (p * 100).toFixed(3) + '%';
    }
  };
  gsap.ticker.add(tickerCallback);
  gsap.ticker.lagSmoothing(0);

  function refresh(): void {
    ScrollTrigger.refresh();
    maxScroll = ScrollTrigger.maxScroll(window);
  }

  refresh();

  // Give every section one defined starting frame, including the ones far
  // below the fold. Without this a section only learns its progress the first
  // time it scrolls into view, and loads at whatever its constructor left.
  for (const m of mounted) {
    const p = m.trigger ? m.trigger.progress : 0;
    m.progress = p;
    callUpdate(m, p);
  }

  const target = requestedSection();
  if (target) {
    requestAnimationFrame(() => {
      scrollToSection(target);
      requestAnimationFrame(refresh);
    });
  }

  // Late webfonts and late images both change section heights, and a stale
  // trigger range is the usual cause of a section that animates at the wrong
  // time. Both are cheap to re-measure once.
  window.addEventListener('load', refresh, { once: true });
  if (document.fonts) {
    document.fonts.ready.then(refresh).catch(() => {});
  }

  const engine: Engine = {
    sections: mounted,
    lenis,
    scrollToSection,
    refresh,
    destroy() {
      focusObserver.disconnect();
      if (tickerCallback) gsap.ticker.remove(tickerCallback);
      for (const m of mounted) m.trigger?.kill();
      lenis?.destroy();
      for (const m of mounted) {
        try {
          m.section.unmount();
        } catch (err) {
          console.error('[engine] section "' + m.entry.id + '" threw on unmount:', err);
        }
      }
    },
  };

  exposeForFilming(engine);
  return engine;
}

/**
 * A handle on the window, for filming and for debugging from the console:
 *
 *   __site.scrollToSection('refusal')
 *   __site.flags
 *
 * Not a public interface. Nothing in src/ should read it.
 */
function exposeForFilming(engine: Engine): void {
  (window as unknown as Record<string, unknown>)['__site'] = {
    engine,
    flags,
    scrollToSection: (id: string) => engine.scrollToSection(id),
    ids: engine.sections.map((m) => m.entry.id),
  };
}
