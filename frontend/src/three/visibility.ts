/*
 * visibility.ts
 *
 * The five sections in this directory share one Three.js scene, and only one
 * of them may be "driving" the camera and uniforms at a time. In the normal
 * scroll path the engine only calls update() on whichever section is on
 * screen, so this is academic. But engine.ts also has two paths that call
 * every registered section's update() once, back to back, in registry order
 * (the initial pass on boot, and the whole of ?still=1): after either of
 * those runs, whichever scene section is LAST in that order (zoom) is the
 * one left holding the camera, even if the section actually on screen is
 * hero.
 *
 * The fix lives here rather than in engine.ts, which this build does not
 * own: every scene section re-applies its own last-known progress to the
 * shared scene whenever its own element becomes visible again. That is still
 * a pure function of progress, the same progress the engine already gave it;
 * this only changes when that mapping gets (re)applied, not what it maps to.
 */

export function onVisible(el: Element, callback: () => void): () => void {
  if (typeof IntersectionObserver !== 'function') {
    // No observer support: apply once and leave it. Better than never.
    callback();
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) callback();
      }
    },
    { threshold: 0.01 },
  );
  observer.observe(el);
  return () => observer.disconnect();
}
