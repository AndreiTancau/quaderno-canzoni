export type UserRole = "admin" | "viewer";

export type UserName = "Andrei" | "Viewer";

export interface AppUser {
  name: UserName;
  role: UserRole;
  emoji: string;
}

export const USERS: AppUser[] = [
  { name: "Andrei", role: "admin", emoji: "\uD83C\uDFB5" },
  { name: "Viewer", role: "viewer", emoji: "\uD83D\uDC41\uFE0F" },
];

export type SectionType =
  | "strofa"
  | "ritornello"
  | "bridge"
  | "intro"
  | "outro";

export interface SongSection {
  id: string;
  song_id: string;
  section_type: SectionType;
  section_label: string;
  content: string;
  chords: string;
  position: number;
}

export interface Song {
  id: string;
  title: string;
  author: string;
  album: string | null;
  key: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  owner: string;
}

export interface SongWithSections extends Song {
  sections: SongSection[];
}

export interface ScrapedSong {
  title: string;
  author: string;
  album: string | null;
  rawContent: string;
  chordContent: string;
}

export interface SearchResult {
  url: string;
  title: string;
  author: string;
  type: "acorduri" | "cantece";
}

export type AppTab = "indice" | "canzone" | "importa" | "modifica";

export type SortMode = "title" | "author" | "key";

export const NOTES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export const NOTES_FLAT = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export const SECTION_LABELS: Record<SectionType, string> = {
  strofa: "Strofa",
  ritornello: "Ritornello",
  bridge: "Bridge",
  intro: "Intro",
  outro: "Outro",
};

export const SECTION_COLORS: Record<SectionType, string> = {
  strofa: "bg-blue-500",
  ritornello: "bg-amber-500",
  bridge: "bg-violet-500",
  intro: "bg-emerald-500",
  outro: "bg-red-500",
};

export const ALL_KEYS = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
  "Am",
  "A#m",
  "Bbm",
  "Bm",
  "Cm",
  "C#m",
  "Dm",
  "D#m",
  "Ebm",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Abm",
];

// --- Transpose helpers ---

const SHARP_NOTES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const FLAT_NOTES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

function noteIndex(note: string): number {
  let idx = SHARP_NOTES.indexOf(note);
  if (idx === -1) idx = FLAT_NOTES.indexOf(note);
  return idx;
}

export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord;
  // Match root note (with optional # or b) and the rest (m, 7, maj7, dim, sus4, etc.)
  const match = chord.match(/^([A-G][#b]?)(.*)/);
  if (!match) return chord;
  const root = match[1];
  const suffix = match[2];
  const idx = noteIndex(root);
  if (idx === -1) return chord;
  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  // Use flats if original was flat, sharps otherwise
  const useFlat = root.includes("b");
  const newRoot = useFlat ? FLAT_NOTES[newIdx] : SHARP_NOTES[newIdx];
  return newRoot + suffix;
}

// Transpose all [Chord] markers in text
export function transposeText(text: string, semitones: number): string {
  if (semitones === 0) return text;
  return text.replace(/\[([A-G][#b]?[^\]]*)\]/g, (_, chord) => {
    return `[${transposeChord(chord, semitones)}]`;
  });
}

// Detect key from first chord in content
export function detectKeyFromContent(content: string): string | null {
  const match = content.match(/\[([A-G][#b]?[m]?)/);
  if (match) return match[1];
  return null;
}
