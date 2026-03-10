"use client";

import { useState, useEffect, useMemo, useCallback, useRef, type FormEvent } from "react";
import type {
  AppUser,
  AppTab,
  Song,
  SortMode,
  ScrapedSong,
  SearchResult,
} from "@/lib/types";
import { USERS, ALL_KEYS } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import { uploadAudio, deleteAudio } from "@/lib/audio-storage";

// ─── Helpers ───────────────────────────────────────────────

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function generateId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

interface ParsedSection {
  label: string;       // e.g. "STROFA 1", "RITORNELLO", "BRIDGE", ""
  type: "strofa" | "ritornello" | "bridge" | "intro" | "outro" | "chorus" | "other";
  lines: string[];
}

type SectionType = ParsedSection["type"];

interface EditSongBlock {
  label: string;
  type: SectionType;
  text: string;
}

function detectSectionMeta(firstLine: string): { label: string; type: SectionType; stanzaNumber?: number } {
  const line = firstLine.trim();
  const stanzaMatch = line.match(/^(\d+)\.\s/);
  if (stanzaMatch) {
    const stanzaNumber = Number(stanzaMatch[1]);
    return { label: `STROFA ${stanzaNumber}`, type: "strofa", stanzaNumber };
  }

  const strofaMatch = line.match(/^strofa\s*(\d+)?\s*:?/i);
  if (strofaMatch) {
    const stanzaNumber = strofaMatch[1] ? Number(strofaMatch[1]) : undefined;
    return {
      label: stanzaNumber ? `STROFA ${stanzaNumber}` : "STROFA",
      type: "strofa",
      stanzaNumber,
    };
  }

  if (/^(r\s*\/?:|ritornello\b)/i.test(line)) return { label: "RITORNELLO", type: "ritornello" };
  if (/^(c\s*\/?:|coro\b|chorus\b)/i.test(line)) return { label: "CORO", type: "chorus" };
  if (/^bridge\b/i.test(line)) return { label: "BRIDGE", type: "bridge" };
  if (/^intro\b/i.test(line)) return { label: "INTRO", type: "intro" };
  if (/^outro\b/i.test(line)) return { label: "OUTRO", type: "outro" };

  return { label: "", type: "other" };
}

function parseEditBlocks(text: string): EditSongBlock[] {
  if (!text.trim()) return [];

  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  return blocks.map((block, index) => {
    const trimmed = block.trim();
    const firstLine = trimmed.split("\n")[0]?.trim() || "";
    const meta = detectSectionMeta(firstLine);

    return {
      label: meta.label || `SEZIONE ${index + 1}`,
      type: meta.type,
      text: trimmed,
    };
  });
}

function getNextStanzaNumber(blocks: EditSongBlock[]): number {
  const maxStanza = blocks.reduce((max, block) => {
    const fromText = block.text.trim().match(/^(\d+)\.\s/);
    if (fromText) return Math.max(max, Number(fromText[1]));

    const fromLabel = block.label.match(/STROFA\s+(\d+)/i);
    if (fromLabel) return Math.max(max, Number(fromLabel[1]));

    return max;
  }, 0);

  return maxStanza + 1;
}

function createEditBlock(type: SectionType, stanzaNumber = 1): EditSongBlock {
  if (type === "strofa") {
    return { label: `STROFA ${stanzaNumber}`, type, text: `${stanzaNumber}. ` };
  }
  if (type === "ritornello") {
    return { label: "RITORNELLO", type, text: "R /: " };
  }
  if (type === "chorus") {
    return { label: "CORO", type, text: "C /: " };
  }
  if (type === "bridge") {
    return { label: "BRIDGE", type, text: "Bridge: " };
  }
  if (type === "intro") {
    return { label: "INTRO", type, text: "Intro: " };
  }
  if (type === "outro") {
    return { label: "OUTRO", type, text: "Outro: " };
  }
  return { label: "SEZIONE", type: "other", text: "" };
}

/**
 * Parse song text into labeled sections.
 * Detects patterns like "1. ", "R /: ", "C /: ", "Bridge: ", "Intro: ", "Outro: "
 * Sections are separated by blank lines.
 */
function parseSections(text: string): ParsedSection[] {
  if (!text.trim()) return [];

  // Split into blocks by blank lines
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  const sections: ParsedSection[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    const firstLine = trimmed.split("\n")[0].trim();
    const meta = detectSectionMeta(firstLine);

    const label = meta.label;
    const type: ParsedSection["type"] = meta.type;
    let content = trimmed;

    if (type === "strofa") {
      content = trimmed.replace(/^(\d+\.\s*|strofa\s*\d*\s*:?\s*)/i, "");
    }
    else if (type === "ritornello") {
      content = trimmed
        .replace(/^(R\s*\/?:|ritornello\s*:?)\s*/i, "")
        .replace(/\s*:\/\s*$/, "");
    }
    else if (type === "chorus") {
      content = trimmed
        .replace(/^(C\s*\/?:|coro\s*:?|chorus\s*:?)\s*/i, "")
        .replace(/\s*:\/\s*$/, "");
    }
    else if (type === "bridge") {
      content = trimmed.replace(/^bridge\s*:?\s*/i, "");
    }
    else if (type === "intro") {
      content = trimmed.replace(/^intro\s*:?\s*/i, "");
    }
    else if (type === "outro") {
      content = trimmed.replace(/^outro\s*:?\s*/i, "");
    }

    sections.push({
      label,
      type,
      lines: content.split("\n").map((l) => l.trimEnd()),
    });
  }

  return sections;
}

/** Render parsed sections as React elements */
function SongSections({ text }: { text: string }) {
  const sections = parseSections(text);

  if (sections.length === 0) {
    return <p className="muted">Nessun testo</p>;
  }

  return (
    <>
      {sections.map((section, si) => (
        <div key={si} className="song-section">
          {section.label && (
            <div className={cn("song-section-label", `section-${section.type}`)}>
              {section.label}
            </div>
          )}
          <div className="song-section-text">
            {section.lines.map((line, li) => (
              <div key={li} className={line.trim() === "" ? "song-empty-line" : "song-line"}>
                {line}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Main Component ────────────────────────────────────────

export default function Home() {
  // State
  const [selectedUser, setSelectedUser] = useState<AppUser>(USERS[0]);
  const [loginUser, setLoginUser] = useState<AppUser>(USERS[0]);
  const [activeTab, setActiveTab] = useState<AppTab>("indice");
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");

  // Indice
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("title");
  const [filterKey, setFilterKey] = useState("");
  const [activeLetter, setActiveLetter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // Song view
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [liveSetIds, setLiveSetIds] = useState<string[]>([]);

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUploading, setAudioUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Import
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [scrapedSong, setScrapedSong] = useState<ScrapedSong | null>(null);
  const [importTitle, setImportTitle] = useState("");
  const [importAuthor, setImportAuthor] = useState("");
  const [importKey, setImportKey] = useState("");
  const [importText, setImportText] = useState("");

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [importMode, setImportMode] = useState<"search" | "url">("search");

  // Edit
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editKey, setEditKey] = useState("");
  const [editBlocks, setEditBlocks] = useState<EditSongBlock[]>([]);
  const [saving, setSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState("");
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const isAdmin = selectedUser.role === "admin";

  // ─── Toast ───
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), 2500);
  }, []);

  // ─── Simple app password gate ───
  useEffect(() => {
    try {
      const unlocked = sessionStorage.getItem("quaderno-auth") === "ok";
      const storedUser = sessionStorage.getItem("quaderno-user");
      if (storedUser) {
        const found = USERS.find((u) => u.name === storedUser);
        if (found) {
          setSelectedUser(found);
          setLoginUser(found);
        }
      }
      setIsUnlocked(unlocked);
    } catch {
      // Ignore session storage errors.
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;
    try {
      sessionStorage.setItem("quaderno-user", selectedUser.name);
    } catch {
      // Ignore session storage errors.
    }
  }, [isUnlocked, selectedUser]);

  const handleUnlock = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!authPassword.trim()) return;

    setAuthSubmitting(true);
    setAuthError("");

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: authPassword }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));

      if (!res.ok) {
        setAuthError(data.error || "Password non valida");
        return;
      }

      const adminUser = USERS.find((u) => u.role === "admin") || USERS[0];
      try {
        sessionStorage.setItem("quaderno-auth", "ok");
        sessionStorage.setItem("quaderno-user", adminUser.name);
      } catch {
        // Ignore session storage errors.
      }

      setSelectedUser(adminUser);
      setAuthPassword("");
      setIsUnlocked(true);
    } catch {
      setAuthError("Errore di rete");
    } finally {
      setAuthSubmitting(false);
    }
  }, [authPassword, loginUser]);

  // ─── Load songs ───
  const loadSongs = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) {
      const stored = localStorage.getItem("quaderno-songs");
      if (stored) {
        try { setSongs(JSON.parse(stored)); } catch { /* ignore */ }
      }
      setLoading(false);
      return;
    }
    try {
      const { data } = await sb.from("songs").select("*").order("title");
      if (data) {
        setSongs(data);
        localStorage.setItem("quaderno-songs", JSON.stringify(data));
      }
    } catch (err) {
      console.error("Error loading songs:", err);
      const stored = localStorage.getItem("quaderno-songs");
      if (stored) {
        try { setSongs(JSON.parse(stored)); } catch { /* ignore */ }
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSongs(); }, [loadSongs]);

  // Keep selectedSong in sync when songs array updates (e.g. after audio upload)
  useEffect(() => {
    if (selectedSong) {
      const fresh = songs.find((s) => s.id === selectedSong.id);
      if (fresh && fresh.updated_at !== selectedSong.updated_at) {
        setSelectedSong(fresh);
      }
    }
  }, [songs, selectedSong]);

  // ─── Save song ───
  const saveSong = useCallback(
    async (title: string, author: string, key: string | null, text: string, sourceUrl: string | null) => {
      const sb = getSupabase();
      if (!sb) {
        const newSong: Song = {
          id: generateId(),
          title, author, key, text,
          source_url: sourceUrl,
          audio_url: null,
          owner: selectedUser.name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const updated = [...songs, newSong];
        setSongs(updated);
        localStorage.setItem("quaderno-songs", JSON.stringify(updated));
        return newSong;
      }

      const { data, error } = await sb
        .from("songs")
        .insert({ title, author, key, text, source_url: sourceUrl, owner: selectedUser.name })
        .select()
        .single();

      if (error || !data) throw error || new Error("Failed to save");
      await loadSongs();
      return data;
    },
    [songs, selectedUser, loadSongs]
  );

  // ─── Update song ───
  const updateSong = useCallback(
    async (songId: string, title: string, author: string, key: string | null, text: string) => {
      const sb = getSupabase();
      if (!sb) {
        const updated = songs.map((s) =>
          s.id === songId ? { ...s, title, author, key, text, updated_at: new Date().toISOString() } : s
        );
        setSongs(updated);
        localStorage.setItem("quaderno-songs", JSON.stringify(updated));
        return;
      }
      await sb.from("songs").update({ title, author, key, text }).eq("id", songId);
      await loadSongs();
    },
    [songs, loadSongs]
  );

  // ─── Delete song ───
  const deleteSong = useCallback(
    async (songId: string) => {
      const sb = getSupabase();
      if (!sb) {
        const updated = songs.filter((s) => s.id !== songId);
        setSongs(updated);
        localStorage.setItem("quaderno-songs", JSON.stringify(updated));
        return;
      }
      await sb.from("songs").delete().eq("id", songId);
      await loadSongs();
    },
    [songs, loadSongs]
  );

  // ─── Audio recording ───
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access error:", err);
      showToast("Errore: accesso al microfono negato");
    }
  }, [showToast]);

  const stopAndUploadRecording = useCallback(async (songId: string) => {
    if (!mediaRecorderRef.current) return;

    return new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current!;
      recorder.onstop = async () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        setRecordingTime(0);

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        if (blob.size === 0) {
          showToast("Registrazione vuota");
          resolve();
          return;
        }

        setAudioUploading(true);
        try {
          await uploadAudio(songId, blob);
          await loadSongs();
          showToast("Audio salvato");
        } catch (err) {
          console.error("Upload error:", err);
          showToast("Errore nel salvataggio audio");
        }
        setAudioUploading(false);
        resolve();
      };
      recorder.stop();
    });
  }, [showToast, loadSongs]);

  const handleDeleteAudio = useCallback(async (song: Song) => {
    if (!song.audio_url) return;
    if (!confirm("Eliminare la registrazione audio?")) return;

    try {
      await deleteAudio(song.id, song.audio_url);
      await loadSongs();
      showToast("Audio eliminato");
    } catch (err) {
      console.error("Delete audio error:", err);
      showToast("Errore nell'eliminazione audio");
    }
  }, [showToast, loadSongs]);

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ─── Search on resursecrestine.ro ───
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", query: searchQuery.trim(), searchType: "cantece" }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Errore nella ricerca"); return; }
      setSearchResults(data.results || []);
      if ((data.results || []).length === 0) showToast("Nessun risultato trovato");
    } catch { showToast("Errore di rete"); }
    finally { setSearchLoading(false); }
  }, [searchQuery, showToast]);

  // ─── Import: scrape song ───
  const handleImport = useCallback(
    async (url?: string) => {
      const targetUrl = url || importUrl.trim();
      if (!targetUrl) return;
      setImportLoading(true);
      setImportError("");
      setScrapedSong(null);

      try {
        const res = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
        });
        const data = await res.json();
        if (!res.ok) { setImportError(data.error || "Errore durante l'importazione"); return; }

        setScrapedSong(data);
        setImportTitle(data.title);
        setImportAuthor(data.author);
        setImportUrl(targetUrl);
        setImportText(data.text);
        setImportKey("");
        setSearchResults([]);
      } catch { setImportError("Errore di rete"); }
      finally { setImportLoading(false); }
    },
    [importUrl]
  );

  // ─── Import: save ───
  const handleImportSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveSong(importTitle, importAuthor, importKey || null, importText, importUrl || null);
      showToast("Canzone salvata!");
      setScrapedSong(null);
      setImportUrl("");
      setImportText("");
      setImportKey("");
      setImportTitle("");
      setImportAuthor("");
      setSearchQuery("");
      setSearchResults([]);
      setActiveTab("indice");
    } catch { showToast("Errore durante il salvataggio"); }
    setSaving(false);
  }, [importTitle, importAuthor, importKey, importText, importUrl, saveSong, showToast]);

  // ─── Edit: start ───
  const startEdit = useCallback((song: Song) => {
    const parsed = parseEditBlocks(song.text);
    setEditTitle(song.title);
    setEditAuthor(song.author);
    setEditKey(song.key || "");
    setEditBlocks(parsed.length ? parsed : [createEditBlock("strofa", 1)]);
    setActiveTab("modifica");
  }, []);

  const composeEditText = useCallback((blocks: EditSongBlock[]) => {
    return blocks
      .map((block) => block.text.trim())
      .filter((chunk) => chunk.length > 0)
      .join("\n\n");
  }, []);

  const updateEditBlock = useCallback((index: number, value: string) => {
    setEditBlocks((prev) =>
      prev.map((block, i) => {
        if (i !== index) return block;

        const firstLine = value.trim().split("\n")[0]?.trim() || "";
        const meta = detectSectionMeta(firstLine);
        return {
          text: value,
          type: meta.type === "other" ? block.type : meta.type,
          label: meta.label || block.label || `SEZIONE ${i + 1}`,
        };
      })
    );
  }, []);

  const addEditBlock = useCallback((type: SectionType = "strofa") => {
    setEditBlocks((prev) => {
      const nextStanza = getNextStanzaNumber(prev);
      return [...prev, createEditBlock(type, nextStanza)];
    });
  }, []);

  const removeEditBlock = useCallback((index: number) => {
    setEditBlocks((prev) => {
      if (prev.length <= 1) {
        const fallback = prev[0] || createEditBlock("strofa", 1);
        return [{ ...fallback, text: "" }];
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const repartitionEditBlocks = useCallback(() => {
    setEditBlocks((prev) => {
      const merged = composeEditText(prev);
      const repartitioned = parseEditBlocks(merged);
      return repartitioned.length ? repartitioned : [createEditBlock("strofa", 1)];
    });
    showToast("Sezioni aggiornate");
  }, [composeEditText, showToast]);

  // ─── Edit: save ───
  const handleEditSave = useCallback(async () => {
    if (!selectedSong) return;
    const normalizedText = composeEditText(editBlocks);
    if (!normalizedText.trim()) {
      showToast("Inserisci il testo della canzone");
      return;
    }

    setSaving(true);
    try {
      await updateSong(selectedSong.id, editTitle, editAuthor, editKey || null, normalizedText);
      showToast("Modifiche salvate!");
      setSelectedSong({ ...selectedSong, title: editTitle, author: editAuthor, key: editKey || null, text: normalizedText });
      setActiveTab("canzone");
    } catch { showToast("Errore durante il salvataggio"); }
    setSaving(false);
  }, [selectedSong, editTitle, editAuthor, editKey, editBlocks, composeEditText, updateSong, showToast]);

  // ─── Edit: delete ───
  const handleDelete = useCallback(async () => {
    if (!selectedSong) return;
    if (!confirm("Sei sicuro di voler eliminare questa canzone?")) return;
    await deleteSong(selectedSong.id);
    setSelectedSong(null);
    setActiveTab("indice");
    showToast("Canzone eliminata");
  }, [selectedSong, deleteSong, showToast]);

  // ─── PDF export ───
  const handleExportPdf = useCallback(
    async (ids: string[]) => {
      try {
        showToast("Generazione PDF...");
        const selectedSongs = songs.filter((s) => ids.includes(s.id));
        const res = await fetch("/api/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ songs: selectedSongs }),
        });
        if (!res.ok) throw new Error("PDF generation failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = ids.length === 1
          ? `${songs.find((s) => s.id === ids[0])?.title || "canzone"}.pdf`
          : "quaderno-canzoni.pdf";
        a.click();
        URL.revokeObjectURL(url);
        showToast("PDF scaricato!");
      } catch { showToast("Errore nella generazione del PDF"); }
    },
    [songs, showToast]
  );

  const songById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);

  const liveSongs = useMemo(() => {
    return liveSetIds
      .map((id) => songById.get(id))
      .filter((song): song is Song => Boolean(song));
  }, [liveSetIds, songById]);

  const currentLiveIndex = useMemo(() => {
    if (!selectedSong) return -1;
    return liveSongs.findIndex((song) => song.id === selectedSong.id);
  }, [selectedSong, liveSongs]);

  const openLiveSet = useCallback((ids: string[], startSongId?: string) => {
    const valid = ids.filter((id) => songById.has(id));
    if (!valid.length) return;

    const startId = startSongId && valid.includes(startSongId) ? startSongId : valid[0];
    const songToOpen = songById.get(startId);
    if (!songToOpen) return;

    setLiveSetIds(valid);
    setSelectedSong(songToOpen);
    setActiveTab("canzone");
    showToast(`Set live: ${valid.length} canzoni`);
  }, [songById, showToast]);

  const navigateLive = useCallback((direction: "prev" | "next") => {
    if (currentLiveIndex < 0) return;

    const targetIndex = direction === "next" ? currentLiveIndex + 1 : currentLiveIndex - 1;
    const targetSong = liveSongs[targetIndex];

    if (!targetSong) {
      showToast(direction === "next" ? "Ultima canzone del set" : "Prima canzone del set");
      return;
    }

    setSelectedSong(targetSong);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentLiveIndex, liveSongs, showToast]);

  const handleSongTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleSongTouchEnd = useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (!swipeStartRef.current || liveSongs.length < 2) return;

    const touch = e.changedTouches[0];
    const diffX = touch.clientX - swipeStartRef.current.x;
    const diffY = touch.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;

    // Only trigger when horizontal intent is clear.
    if (Math.abs(diffX) < 70 || Math.abs(diffY) > 55) return;
    if (diffX < 0) navigateLive("next");
    else navigateLive("prev");
  }, [liveSongs.length, navigateLive]);

  // ─── Filtered & sorted songs ───
  const filteredSongs = useMemo(() => {
    let result = [...songs];
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) => s.title.toLowerCase().includes(q) || s.author.toLowerCase().includes(q)
      );
    }
    if (filterKey) result = result.filter((s) => s.key === filterKey);
    if (activeLetter) result = result.filter((s) => s.title.toUpperCase().startsWith(activeLetter));

    result.sort((a, b) => {
      if (sortMode === "title") return a.title.localeCompare(b.title, "ro");
      if (sortMode === "author") return a.author.localeCompare(b.author, "ro");
      if (sortMode === "key") return (a.key || "").localeCompare(b.key || "");
      return 0;
    });
    return result;
  }, [songs, query, filterKey, activeLetter, sortMode]);

  const availableLetters = useMemo(() => {
    const letters = new Set(songs.map((s) => s.title[0]?.toUpperCase()).filter(Boolean));
    return "ABCDEFGHIJKLMNOPRSTUVWXYZ".split("").filter((l) => letters.has(l));
  }, [songs]);

  const usedKeys = useMemo(() => {
    return [...new Set(songs.map((s) => s.key).filter(Boolean))] as string[];
  }, [songs]);
  const hasLiveSet = liveSongs.length > 1 && currentLiveIndex >= 0;
  const isSongFullscreen = isFullscreen && activeTab === "canzone" && !!selectedSong;

  useEffect(() => {
    setLiveSetIds((prev) => prev.filter((id) => songById.has(id)));
  }, [songById]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
        return;
      }

      if (activeTab !== "canzone" || !selectedSong || liveSongs.length < 2) return;
      if (e.key === "ArrowRight") navigateLive("next");
      if (e.key === "ArrowLeft") navigateLive("prev");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, selectedSong, liveSongs.length, navigateLive, isFullscreen]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="spinner" />
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <div className="auth-gate-wrap min-h-screen flex items-center justify-center px-4 py-8">
        <div className="auth-gate-card card w-full max-w-sm p-6 sm:p-8">
          <h1 className="title-font text-2xl sm:text-3xl font-bold mb-1 tracking-tight">Quaderno Canzoni</h1>
          <p className="text-sm muted mb-6">Seleziona come vuoi accedere.</p>

          <div className="flex flex-col gap-3 mb-5">
            <button
              onClick={() => {
                const viewer = USERS.find((u) => u.role === "viewer");
                if (viewer) {
                  setSelectedUser(viewer);
                  try {
                    sessionStorage.setItem("quaderno-auth", "ok");
                    sessionStorage.setItem("quaderno-user", viewer.name);
                  } catch { /* ignore */ }
                  setIsUnlocked(true);
                }
              }}
              className="w-full py-3 rounded-xl text-sm font-semibold border border-[var(--card-border)] hover:bg-[var(--hover-bg)] transition-all"
            >
              Entra come Ospite
            </button>
          </div>

          <div className="border-t border-[var(--separator)] pt-5">
            <p className="text-xs font-semibold muted mb-3 uppercase tracking-wide">Accesso Admin</p>
            <form onSubmit={handleUnlock} className="space-y-3">
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-2.5 rounded-xl border text-sm input-field"
              />
              {authError && <p className="text-sm text-red-500">{authError}</p>}
              <button
                type="submit"
                disabled={authSubmitting || !authPassword.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 btn-primary"
              >
                {authSubmitting ? "Accesso..." : "Entra come Admin"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─── RENDER ─────────────────────────────────────────────

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-fade-in">
          <div className="toast-msg">{toast}</div>
        </div>
      )}

      <div className={cn(isSongFullscreen && "fullscreen-mode")}>
        {/* ─── HEADER ─── */}
        {!isSongFullscreen && (
          <header className="no-print sticky top-0 z-40 header-bar">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
              {activeTab !== "indice" && (
                <button
                  onClick={() => {
                    if (activeTab === "modifica") setActiveTab("canzone");
                    else { setActiveTab("indice"); setIsFullscreen(false); }
                  }}
                  className="p-2 rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
                  aria-label="Indietro"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>
              )}

              <h1 className="text-lg md:text-xl font-bold tracking-tight flex-1 title-font">
                {activeTab === "indice" && "Quaderno Canzoni"}
                {activeTab === "canzone" && (selectedSong?.title || "")}
                {activeTab === "importa" && "Importa Canzone"}
                {activeTab === "modifica" && "Modifica"}
              </h1>

              <div className="flex items-center gap-1.5">
                {isAdmin && (
                  <span className="px-2.5 py-1.5 rounded-lg text-xs font-semibold btn-primary">
                    Admin
                  </span>
                )}
              </div>
            </div>
          </header>
        )}

        {/* ─── MAIN ─── */}
        <main className={cn("max-w-4xl mx-auto px-4 pb-24", isSongFullscreen && "fullscreen-main")}>

          {/* ════════════ INDICE ════════════ */}
          {activeTab === "indice" && (
            <div className="animate-fade-in">
              {/* Controls */}
              <div className="sticky top-[57px] z-30 pt-4 pb-3 no-print" style={{ background: "var(--background)" }}>
                <div className="flex flex-col gap-3">
                  {/* Search row */}
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Cerca canzone o autore..."
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActiveLetter(""); }}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm input-field"
                      />
                    </div>
                    {isAdmin && (
                      <button onClick={() => setActiveTab("importa")} className="px-4 py-2.5 rounded-xl text-sm font-semibold btn-primary">
                        + Importa
                      </button>
                    )}
                  </div>

                  {/* Filters */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className="px-3 py-1.5 rounded-lg border text-xs font-medium input-field">
                      <option value="title">Titolo A-Z</option>
                      <option value="author">Autore A-Z</option>
                      <option value="key">Tonalita</option>
                    </select>

                    {usedKeys.length > 0 && (
                      <select value={filterKey} onChange={(e) => setFilterKey(e.target.value)} className="px-3 py-1.5 rounded-lg border text-xs font-medium input-field">
                        <option value="">Tutte le tonalita</option>
                        {usedKeys.sort().map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    )}

                    <span className="text-xs ml-auto muted">{filteredSongs.length} canzoni</span>

                    <button
                      onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all", selectMode && "btn-primary")}
                    >
                      {selectMode ? "Annulla" : "Seleziona"}
                    </button>
                  </div>

                  {/* Alpha nav */}
                  {availableLetters.length > 3 && (
                    <div className="alpha-nav flex flex-wrap gap-1">
                      <a href="#" className={cn(!activeLetter && "active")} onClick={(e) => { e.preventDefault(); setActiveLetter(""); }}>Tutte</a>
                      {availableLetters.map((l) => (
                        <a key={l} href="#" className={cn(activeLetter === l && "active")} onClick={(e) => { e.preventDefault(); setActiveLetter(activeLetter === l ? "" : l); }}>{l}</a>
                      ))}
                    </div>
                  )}

                  {/* Selection actions */}
                  {selectMode && selectedIds.size > 0 && (
                    <div className="flex gap-2 items-center">
                      <span className="text-xs font-medium">{selectedIds.size} selezionate</span>
                      <button
                        onClick={() => openLiveSet(Array.from(selectedIds))}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border hover:bg-[var(--hover-bg)]"
                      >
                        Apri Live ({selectedIds.size})
                      </button>
                      <button onClick={() => handleExportPdf(Array.from(selectedIds))} className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-primary">
                        Esporta PDF ({selectedIds.size})
                      </button>
                      <button onClick={() => handleExportPdf(songs.map((s) => s.id))} className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-[var(--hover-bg)]">
                        Esporta Tutte
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Song list */}
              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="spinner" />
                </div>
              ) : filteredSongs.length === 0 ? (
                <div className="text-center py-20 muted">
                  <p className="text-lg font-medium">{songs.length === 0 ? "Nessuna canzone ancora" : "Nessun risultato"}</p>
                  {songs.length === 0 && isAdmin && (
                    <button onClick={() => setActiveTab("importa")} className="mt-4 px-6 py-2.5 rounded-xl font-semibold btn-primary">
                      Importa la prima canzone
                    </button>
                  )}
                </div>
              ) : (
                <div className="song-list">
                  {filteredSongs.map((song, idx) => (
                    <button
                      key={song.id}
                      onClick={() => {
                        if (selectMode) {
                          const next = new Set(selectedIds);
                          if (next.has(song.id)) next.delete(song.id); else next.add(song.id);
                          setSelectedIds(next);
                        } else {
                          setLiveSetIds(filteredSongs.map((s) => s.id));
                          setSelectedSong(song);
                          setActiveTab("canzone");
                        }
                      }}
                      className={cn("song-list-item", selectMode && selectedIds.has(song.id) && "selected")}
                    >
                      <span className="song-list-num">{idx + 1}.</span>
                      <span className="song-list-title">{song.title}</span>
                      <span className="song-list-author">{song.author}</span>
                      {song.key && <span className="song-list-key">{song.key}</span>}
                      {selectMode && (
                        <span className={cn("song-list-check", selectedIds.has(song.id) && "checked")}>
                          {selectedIds.has(song.id) ? "\u2713" : ""}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Export all */}
              {songs.length > 0 && !selectMode && (
                <div className="mt-8 text-center no-print flex items-center justify-center gap-2 flex-wrap">
                  <button
                    onClick={() => openLiveSet(filteredSongs.map((s) => s.id))}
                    disabled={filteredSongs.length === 0}
                    className="px-6 py-2.5 rounded-xl border text-sm font-semibold hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Avvia Set Live ({filteredSongs.length})
                  </button>
                  <button onClick={() => handleExportPdf(songs.map((s) => s.id))} className="px-6 py-2.5 rounded-xl border text-sm font-semibold hover:bg-[var(--hover-bg)] transition-colors">
                    Esporta tutto come PDF ({songs.length} canzoni)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ════════════ CANZONE ════════════ */}
          {activeTab === "canzone" && selectedSong && (
            <div className={cn("animate-fade-in py-4 sm:py-6 song-stage-view", isSongFullscreen && "song-stage-fullscreen")}>
              {!isSongFullscreen && <div className="song-stage-bg" aria-hidden="true" />}

              {!isSongFullscreen && (
                <>
                  {/* Song hero */}
                  <div className="song-hero card">
                    <div className="song-hero-topline">
                      <span className="song-hero-chip">Leggio</span>
                      {hasLiveSet && (
                        <span className="song-hero-chip song-hero-chip-live">
                          {currentLiveIndex + 1} / {liveSongs.length}
                        </span>
                      )}
                      {selectedSong.key && <span className="song-hero-key">{selectedSong.key}</span>}
                    </div>
                    <h2 className="song-view-title">{selectedSong.title}</h2>
                    {selectedSong.author && <p className="song-view-author">{selectedSong.author}</p>}
                  </div>

                  {/* Controls bar */}
                  <div className="no-print song-toolbar card">
                    {/* Left: action icons */}
                    <button
                      onClick={() => setIsFullscreen(!isFullscreen)}
                      className="song-tool-icon"
                      aria-label="Schermo intero"
                      title="Schermo intero"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {isFullscreen ? (
                          <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>
                        ) : (
                          <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>
                        )}
                      </svg>
                    </button>

                    <button
                      onClick={() => handleExportPdf([selectedSong.id])}
                      className="song-tool-icon"
                      aria-label="Esporta PDF"
                      title="Esporta PDF"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>

                    {/* Center: live set navigation (takes flex:1 to center) */}
                    {hasLiveSet ? (
                      <div className="song-nav-group">
                        <button
                          onClick={() => navigateLive("prev")}
                          className="song-tool-icon"
                          disabled={currentLiveIndex <= 0}
                          aria-label="Precedente"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                          </svg>
                        </button>

                        <select
                          value={selectedSong.id}
                          onChange={(e) => {
                            const song = liveSongs.find((s) => s.id === e.target.value);
                            if (song) { setSelectedSong(song); }
                          }}
                          className="song-index-select"
                        >
                          {liveSongs.map((s, i) => (
                            <option key={s.id} value={s.id}>
                              {i + 1}. {s.title}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => navigateLive("next")}
                          className="song-tool-icon"
                          disabled={currentLiveIndex < 0 || currentLiveIndex >= liveSongs.length - 1}
                          aria-label="Successiva"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1" />
                    )}

                    {/* Right: edit */}
                    {isAdmin && (
                      <button onClick={() => startEdit(selectedSong)} className="song-tool-btn btn-primary">
                        Modifica
                      </button>
                    )}
                  </div>

                  {/* Audio player / recorder */}
                  {(selectedSong.audio_url || isAdmin) && (
                    <div className="audio-bar card">
                      {selectedSong.audio_url && !isRecording && (
                        <div className="audio-player-row">
                          <audio
                            ref={audioPlayerRef}
                            src={selectedSong.audio_url}
                            controls
                            preload="metadata"
                            className="audio-player"
                          />
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteAudio(selectedSong)}
                              className="song-tool-btn audio-delete-btn"
                              title="Elimina audio"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}

                      {isAdmin && !isRecording && !audioUploading && (
                        <button
                          onClick={startRecording}
                          className="song-tool-btn audio-record-btn"
                        >
                          <span className="audio-record-dot" />
                          {selectedSong.audio_url ? "Registra di nuovo" : "Registra audio"}
                        </button>
                      )}

                      {isRecording && (
                        <div className="audio-recording-row">
                          <span className="audio-recording-indicator" />
                          <span className="audio-recording-time">{formatRecordingTime(recordingTime)}</span>
                          <button
                            onClick={() => stopAndUploadRecording(selectedSong.id)}
                            className="song-tool-btn btn-primary"
                          >
                            Ferma e Salva
                          </button>
                        </div>
                      )}

                      {audioUploading && (
                        <div className="audio-uploading-row">
                          <span className="text-sm text-[var(--muted)]">Caricamento audio...</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {isSongFullscreen && (
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="no-print fullscreen-exit"
                  aria-label="Esci da schermo intero"
                >
                  Chiudi
                </button>
              )}

              {/* Song text */}
              <div
                className={cn("song-content card", isSongFullscreen && "song-content-fullscreen")}
                onTouchStart={handleSongTouchStart}
                onTouchEnd={handleSongTouchEnd}
              >
                {isSongFullscreen && (
                  <div className="song-fullscreen-head">
                    <h2 className="song-view-title song-fullscreen-title">{selectedSong.title}</h2>
                    {selectedSong.author && <p className="song-view-author">{selectedSong.author}</p>}
                    {selectedSong.key && <span className="song-hero-key">{selectedSong.key}</span>}
                  </div>
                )}
                <div className="song-text">
                  <SongSections text={selectedSong.text} />
                </div>
              </div>

              {!isSongFullscreen && hasLiveSet && (
                <div className="no-print live-dock card">
                  <button
                    className="live-dock-btn"
                    onClick={() => navigateLive("prev")}
                    disabled={currentLiveIndex <= 0}
                  >
                    Precedente
                  </button>
                  <div className="live-dock-center">
                    <div className="live-dock-label">Set Live</div>
                    <div className="live-dock-count">{currentLiveIndex + 1} di {liveSongs.length}</div>
                    <div className="live-dock-hint">Swipe orizzontale per cambiare</div>
                  </div>
                  <button
                    className="live-dock-btn live-dock-btn-primary"
                    onClick={() => navigateLive("next")}
                    disabled={currentLiveIndex >= liveSongs.length - 1}
                  >
                    Successiva
                  </button>
                </div>
              )}


            </div>
          )}

          {/* ════════════ IMPORTA ════════════ */}
          {activeTab === "importa" && isAdmin && (
            <div className="animate-fade-in py-6 max-w-2xl mx-auto">
              {/* Mode tabs */}
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setImportMode("search")}
                  className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border", importMode === "search" ? "btn-primary" : "hover:bg-[var(--hover-bg)]")}
                >
                  Cerca Canzone
                </button>
                <button
                  onClick={() => setImportMode("url")}
                  className={cn("flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border", importMode === "url" ? "btn-primary" : "hover:bg-[var(--hover-bg)]")}
                >
                  Incolla Link
                </button>
              </div>

              {/* Search mode */}
              {importMode === "search" && !scrapedSong && (
                <div className="mb-6">
                  <label className="block text-sm font-semibold mb-2">Cerca su resursecrestine.ro</label>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="Titolo della canzone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      className="flex-1 px-4 py-3 rounded-xl border text-sm input-field"
                    />
                    <button
                      onClick={handleSearch}
                      disabled={searchLoading || searchQuery.trim().length < 2}
                      className="px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 btn-primary"
                    >
                      {searchLoading ? <span className="spinner-sm" /> : "Cerca"}
                    </button>
                  </div>

                  {/* Results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium mb-2 muted">{searchResults.length} risultati</p>
                      {searchResults.map((result, idx) => {
                        const alreadyInQuaderno = songs.some(
                          (s) => s.title.toLowerCase().trim() === result.title.toLowerCase().trim()
                        );
                        return (
                          <div
                            key={`${result.url}-${idx}`}
                            className={cn("w-full text-left p-4 rounded-xl border transition-all card", alreadyInQuaderno && "opacity-60")}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-sm leading-snug title-font">{result.title}</h3>
                                <p className="text-xs mt-0.5 muted">{result.author}</p>
                              </div>
                              {alreadyInQuaderno ? (
                                <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--secondary)] muted whitespace-nowrap">
                                  Nel quaderno
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleImport(result.url)}
                                  disabled={importLoading}
                                  className="text-xs font-semibold px-4 py-1.5 rounded-lg btn-primary whitespace-nowrap disabled:opacity-50"
                                >
                                  Importa
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {importLoading && <div className="flex justify-center py-8"><div className="spinner" /></div>}
                </div>
              )}

              {/* URL mode */}
              {importMode === "url" && !scrapedSong && (
                <div className="mb-6">
                  <label className="block text-sm font-semibold mb-2">Link resursecrestine.ro</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://www.resursecrestine.ro/..."
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleImport()}
                      className="flex-1 px-4 py-3 rounded-xl border text-sm input-field"
                    />
                    <button
                      onClick={() => handleImport()}
                      disabled={importLoading || !importUrl.trim()}
                      className="px-6 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 btn-primary"
                    >
                      {importLoading ? <span className="spinner-sm" /> : "Importa"}
                    </button>
                  </div>
                  {importError && <p className="mt-2 text-sm text-red-500">{importError}</p>}
                </div>
              )}

              {importMode === "search" && importError && (
                <p className="mb-4 text-sm text-red-500">{importError}</p>
              )}

              {/* Scraped song editor */}
              {scrapedSong && (
                <div className="space-y-5">
                  <button
                    onClick={() => { setScrapedSong(null); setImportText(""); setImportError(""); }}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[var(--hover-bg)] transition-colors accent-text"
                  >
                    &larr; Torna alla ricerca
                  </button>

                  {/* Title & Author */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1 muted">Titolo</label>
                      <input type="text" value={importTitle} onChange={(e) => setImportTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm input-field" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1 muted">Autore</label>
                      <input type="text" value={importAuthor} onChange={(e) => setImportAuthor(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm input-field" />
                    </div>
                  </div>

                  {/* Key */}
                  <div>
                    <label className="block text-xs font-semibold mb-1 muted">Tonalita</label>
                    <select value={importKey} onChange={(e) => setImportKey(e.target.value)} className="px-3 py-2 rounded-lg border text-sm input-field">
                      <option value="">Seleziona...</option>
                      {ALL_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>

                  {/* Text editor */}
                  <div>
                    <label className="block text-xs font-semibold mb-1 muted">Testo</label>
                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      rows={20}
                      className="w-full px-4 py-3 rounded-xl border text-sm font-mono leading-relaxed input-field resize-y"
                      placeholder="Testo della canzone..."
                    />
                  </div>

                  {/* Preview */}
                  {importText && (
                    <div>
                      <h3 className="text-sm font-bold mb-3">Anteprima</h3>
                      <div className="card p-6 rounded-xl">
                        <div className="song-header mb-4">
                          <div className="flex-1">
                            <h4 className="song-view-title text-xl">{importTitle}</h4>
                          </div>
                          {importKey && <span className="song-view-key">{importKey}</span>}
                        </div>
                        <div className="song-text text-sm">
                          <SongSections text={importText} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Save */}
                  <button
                    onClick={handleImportSave}
                    disabled={saving || !importTitle.trim()}
                    className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-50 btn-primary"
                  >
                    {saving ? "Salvataggio..." : "Salva nel Quaderno"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ════════════ MODIFICA ════════════ */}
          {activeTab === "modifica" && isAdmin && selectedSong && (
            <div className="animate-fade-in py-6 max-w-2xl mx-auto">
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <label className="block text-xs font-semibold mb-1 muted">Titolo</label>
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 muted">Autore</label>
                  <input type="text" value={editAuthor} onChange={(e) => setEditAuthor(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm input-field" />
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-xs font-semibold mb-1 muted">Tonalita</label>
                <select value={editKey} onChange={(e) => setEditKey(e.target.value)} className="px-3 py-2 rounded-lg border text-sm input-field">
                  <option value="">Seleziona...</option>
                  {ALL_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div className="mb-5">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <label className="block text-xs font-semibold muted flex-1">Testo (diviso per sezioni)</label>
                  <button
                    onClick={() => addEditBlock("strofa")}
                    className="px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold hover:bg-[var(--hover-bg)] transition-colors"
                  >
                    + Strofa
                  </button>
                  <button
                    onClick={() => addEditBlock("ritornello")}
                    className="px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold hover:bg-[var(--hover-bg)] transition-colors"
                  >
                    + Ritornello
                  </button>
                  <button
                    onClick={() => addEditBlock("chorus")}
                    className="px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold hover:bg-[var(--hover-bg)] transition-colors"
                  >
                    + Coro
                  </button>
                  <button
                    onClick={repartitionEditBlocks}
                    className="px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold hover:bg-[var(--hover-bg)] transition-colors"
                  >
                    Rileva Sezioni
                  </button>
                </div>

                <div className="space-y-3">
                  {editBlocks.map((block, idx) => (
                    <div key={`${idx}-${block.label}`} className="edit-song-block card p-3 rounded-xl">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={cn("song-section-label", `section-${block.type}`)}>
                          {block.label || `SEZIONE ${idx + 1}`}
                        </span>
                        <button
                          onClick={() => removeEditBlock(idx)}
                          className="px-2.5 py-1 rounded-md border text-[11px] font-semibold hover:bg-[var(--hover-bg)] transition-colors"
                        >
                          Rimuovi
                        </button>
                      </div>

                      <textarea
                        value={block.text}
                        onChange={(e) => updateEditBlock(idx, e.target.value)}
                        rows={Math.min(16, Math.max(4, block.text.split("\n").length + 1))}
                        className="edit-section-textarea w-full rounded-xl border px-3 py-2.5 text-sm leading-relaxed input-field resize-y"
                        placeholder="Inserisci il testo della sezione..."
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleEditSave}
                  disabled={saving || !editTitle.trim()}
                  className="flex-1 py-3 rounded-xl font-bold text-sm disabled:opacity-50 btn-primary"
                >
                  {saving ? "Salvataggio..." : "Salva le modifiche"}
                </button>
                <button
                  onClick={handleDelete}
                  className="px-5 py-3 rounded-xl border border-red-300 text-red-500 font-bold text-sm hover:bg-red-50 transition-colors"
                >
                  Elimina
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
