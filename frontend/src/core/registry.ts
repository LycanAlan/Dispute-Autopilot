/*
 * registry.ts
 *
 * Sections put themselves on the page. The engine reads this list and mounts
 * what it finds, in order, and knows nothing else about any of them.
 *
 * To add a section, create one file in src/sections/ that calls register() at
 * module scope. main.ts picks the file up with import.meta.glob, so nothing in
 * the engine, in main.ts, or in any other section changes. Two agents can add
 * two sections without touching the same line of the same file.
 *
 *   import { register, ORDER } from '../core/registry';
 *
 *   register({
 *     order: ORDER.model,
 *     id: 'model',
 *     create: () => new ModelSection(),
 *   });
 *
 * Order is a plain number, sorted ascending. ORDER holds the eleven ids from
 * the spec spaced ten apart, so anything can be slipped between two of them
 * without renumbering.
 */

import type { Section } from './section';

export interface SectionEntry {
  /** Sort key. Ascending. Ties fall back to registration order. */
  order: number;
  /**
   * Stable slug. Becomes the DOM id of the section element, the target of
   * ?section=<id>, and the anchor #<id>. Must match the Section's own id.
   */
  id: string;
  /** Called once, at mount time. Construct nothing expensive before then. */
  create: () => Section;
}

/** The eleven sections from the design spec, spaced to leave room between. */
export const ORDER = {
  hero: 10,
  label: 20,
  split: 30,
  model: 40,
  zoom: 50,
  gate1: 60,
  gate2: 70,
  refusal: 80,
  measured: 90,
  live: 100,
  colophon: 110,
} as const;

const entries: SectionEntry[] = [];
let sequence = 0;
const sequenceOf = new WeakMap<SectionEntry, number>();

/**
 * Adds a section to the page. Called at module scope, once per section file.
 * A duplicate id is a mistake worth shouting about: it would mean two agents
 * claimed the same slot, and the second registration is dropped.
 */
export function register(entry: SectionEntry): void {
  if (!entry.id) {
    console.error('[registry] a section was registered without an id, ignoring it');
    return;
  }
  const clash = entries.find((e) => e.id === entry.id);
  if (clash) {
    console.error(
      '[registry] two sections registered the id "' +
        entry.id +
        '". Keeping the first, dropping the second.',
    );
    return;
  }
  sequenceOf.set(entry, sequence);
  sequence += 1;
  entries.push(entry);
}

/** Every registered section, in mount order. A copy; mutating it does nothing. */
export function registered(): SectionEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return (sequenceOf.get(a) ?? 0) - (sequenceOf.get(b) ?? 0);
  });
}

/** Present for tests and for the dev console. Not used in the normal path. */
export function clearRegistry(): void {
  entries.length = 0;
  sequence = 0;
}
