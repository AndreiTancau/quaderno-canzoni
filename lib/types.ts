export type UserRole = "admin" | "viewer";

export type UserName = "Andrei" | "Viewer";

export interface AppUser {
  name: UserName;
  role: UserRole;
}

export const USERS: AppUser[] = [
  { name: "Andrei", role: "admin" },
  { name: "Viewer", role: "viewer" },
];

/**
 * A song in the songbook.
 * Simplified model: just title, author, key, and the full lyrics text.
 * The text includes stanza numbers (1., 2.), refrain markers (R /:), etc.
 */
export interface Song {
  id: string;
  title: string;
  author: string;
  key: string | null;
  text: string;
  source_url: string | null;
  audio_url: string | null;
  created_at: string;
  updated_at: string;
  owner: string;
}

export interface ScrapedSong {
  title: string;
  author: string;
  album: string | null;
  text: string;
}

export interface SearchResult {
  url: string;
  title: string;
  author: string;
  type: "acorduri" | "cantece";
}

export type AppTab = "indice" | "canzone" | "importa" | "modifica";

export type SortMode = "title" | "author" | "key";

export const ALL_KEYS = [
  "Do", "Do#", "Reb", "Re", "Re#", "Mib", "Mi", "Fa", "Fa#",
  "Solb", "Sol", "Sol#", "Lab", "La", "La#", "Sib", "Si",
  "Do m", "Do# m", "Re m", "Re# m", "Mib m", "Mi m", "Fa m", "Fa# m",
  "Sol m", "Sol# m", "La m", "La# m", "Sib m", "Si m",
];
