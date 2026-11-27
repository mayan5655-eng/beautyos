// lib/protocolBook/types.ts — the shape of "ספר הפרוטוקולים". PURE: no React, no database.
import type { FieldKey } from '../businessFields.ts';

export type BookLang = 'he' | 'ar' | 'en';
export const BOOK_LANGS: readonly BookLang[] = ['he', 'ar', 'en'];

/** free: every business with the book on sees it. full: only with the upgrade (a grant today; a purchase once billing is live). */
export type Tier = 'free' | 'full';

export type StepIcon =
  | 'drop' | 'loupe' | 'prep' | 'peel' | 'steam' | 'extract' | 'bolt' | 'mask' | 'led' | 'cream' | 'snow' | 'serum' | 'sun'
  | 'hands' | 'eye' | 'file' | 'pusher' | 'drill' | 'buffer' | 'brush' | 'lamp' | 'oil' | 'form' | 'shield';

export type FaceZone = 'forehead' | 'nose' | 'cheek' | 'chin' | 'lip' | 'eyes' | 'jaw';

/** One protocol's words in one language. Steps are [name, detail], in the same order as Protocol.steps. */
export interface ProtocolText {
  title: string;
  goal: string;
  suits: string;
  /** Do not treat today: refer, postpone, or choose another treatment. */
  contraStop: string[];
  /** Treat, but adapt: lower strength, skip a step, patch test first. */
  contraAdapt: string[];
  prep: string;
  steps: [string, string][];
  /** What is normal after the treatment, so she can tell the client in advance. */
  expected: string;
  /** Stop the treatment and act now. */
  stopNow: string;
  /** A protocol-specific warning shown above aftercare, if any. */
  warn?: string;
  after: string;
  home: string;
  freq: string;
  tip: string;
  /** Yes/no questions to the client, for the health questionnaire. A "yes" means: read the contraindications before treating. */
  ask: string[];
}

export interface Protocol {
  key: string;
  field: FieldKey;
  chapter: string;
  tier: Tier;
  /** An advanced treatment (microneedling, RF, plasma, needle-free mesotherapy): marked as such in the book. */
  advanced?: boolean;
  /** ISO country codes where this protocol is shown. Absent: everywhere. See lib/protocolBook/advanced.ts. */
  countries?: string[];
  /** Face map (cosmetics only). */
  zones?: FaceZone[];
  lift?: boolean;
  /** Icon and minutes [min, max] per step, same order as ProtocolText.steps. */
  steps: { icon: StepIcon; min: [number, number] }[];
  text: Record<BookLang, ProtocolText>;
}
