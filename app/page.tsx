"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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

    let label = "";
    let type: ParsedSection["type"] = "other";
    let content = trimmed;

    // Check for numbered stanza: starts with "1. ", "2. ", etc.
    const stanzaMatch = firstLine.match(/^(\d+)\.\s/);
    if (stanzaMatch) {
      label = `STROFA ${stanzaMatch[1]}`;
      type = "strofa";
      // Remove the number prefix from the first line
      content = trimmed.replace(/^\d+\.\s*/, "");
    }
    // Check for refrain: "R /:" or "R:" at the start
    else if (/^R\s*\/?:/.test(firstLine)) {
      label = "RITORNELLO";
      type = "ritornello";
      content = trimmed.replace(/^R\s*\/?:\s*/, "").replace(/\s*:\/$/, "");
    }
    // Check for chorus: "C /:" at the start
    else if (/^C\s*\/?:/.test(firstLine)) {
      label = "CORO";
      type = "chorus";
      content = trimmed.replace(/^C\s*\/?:\s*/, "").replace(/\s*:\/$/, "");
    }
    // Check for bridge
    else if (/^bridge\s*:/i.test(firstLine)) {
      label = "BRIDGE";
      type = "bridge";
      content = trimmed.replace(/^bridge\s*:\s*/i, "");
    }
    // Check for intro
    else if (/^intro\s*:/i.test(firstLine)) {
      label = "INTRO";
      type = "intro";
      content = trimmed.replace(/^intro\s*:\s*/i, "");
    }
    // Check for outro
    else if (/^outro\s*:/i.test(firstLine)) {
      label = "OUTRO";
      type = "outro";
      content = trimmed.replace(/^outro\s*:\s*/i, "");
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
  const [activeTab, setActiveTab] = useState<AppTab>("indice");
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);

  // Indice
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("title");
  const [filterKey, setFilterKey] = useState("");
  const [activeLetter, setActiveLetter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // Song view
  const [fontSizeMode, setFontSizeMode] = useState<"normal" | "large" | "xlarge">("normal");
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState("");
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = selectedUser.role === "admin";

  // ─── Dark mode ───
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // ─── Toast ───
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), 2500);
  }, []);

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

  // ─── Save song ───
  const saveSong = useCallback(
    async (title: string, author: string, key: string | null, text: string, sourceUrl: string | null) => {
      const sb = getSupabase();
      if (!sb) {
        const newSong: Song = {
          id: generateId(),
          title, author, key, text,
          source_url: sourceUrl,
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

  // ─── Search on resursecrestine.ro ───
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", query: searchQuery.trim(), searchType: "all" }),
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
    setEditTitle(song.title);
    setEditAuthor(song.author);
    setEditKey(song.key || "");
    setEditText(song.text);
    setActiveTab("modifica");
  }, []);

  // ─── Edit: save ───
  const handleEditSave = useCallback(async () => {
    if (!selectedSong) return;
    setSaving(true);
    try {
      await updateSong(selectedSong.id, editTitle, editAuthor, editKey || null, editText);
      showToast("Modifiche salvate!");
      setSelectedSong({ ...selectedSong, title: editTitle, author: editAuthor, key: editKey || null, text: editText });
      setActiveTab("canzone");
    } catch { showToast("Errore durante il salvataggio"); }
    setSaving(false);
  }, [selectedSong, editTitle, editAuthor, editKey, editText, updateSong, showToast]);

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

  // ─── RENDER ─────────────────────────────────────────────

  return (
    <div className={cn(fontSizeMode === "large" && "font-large", fontSizeMode === "xlarge" && "font-xlarge")}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-fade-in">
          <div className="toast-msg">{toast}</div>
        </div>
      )}

      <div className={cn(isFullscreen && "fullscreen-mode")}>
        {/* ─── HEADER ─── */}
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
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg hover:bg-[var(--hover-bg)] transition-colors text-sm"
                aria-label="Tema"
              >
                {darkMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
              </button>

              <div className="flex gap-1">
                {USERS.map((u) => (
                  <button
                    key={u.name}
                    onClick={() => setSelectedUser(u)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                      selectedUser.name === u.name ? "btn-primary" : "hover:bg-[var(--hover-bg)]"
                    )}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        {/* ─── MAIN ─── */}
        <main className="max-w-4xl mx-auto px-4 pb-24">

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
                <div className="mt-8 text-center no-print">
                  <button onClick={() => handleExportPdf(songs.map((s) => s.id))} className="px-6 py-2.5 rounded-xl border text-sm font-semibold hover:bg-[var(--hover-bg)] transition-colors">
                    Esporta tutto come PDF ({songs.length} canzoni)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ════════════ CANZONE ════════════ */}
          {activeTab === "canzone" && selectedSong && (
            <div className="animate-fade-in py-6">
              {/* Song header - like the PDF */}
              <div className="song-header">
                <div className="flex-1">
                  <h2 className="song-view-title">{selectedSong.title}</h2>
                  {selectedSong.author && <p className="song-view-author">{selectedSong.author}</p>}
                </div>
                {selectedSong.key && <span className="song-view-key">{selectedSong.key}</span>}
              </div>

              {/* Controls bar */}
              <div className="no-print flex items-center gap-2 flex-wrap mb-6">
                {/* Font size */}
                <div className="flex items-center gap-1">
                  {(["normal", "large", "xlarge"] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setFontSizeMode(size)}
                      className={cn("px-2 py-1 rounded-md text-xs font-semibold transition-colors", fontSizeMode === size ? "btn-primary" : "hover:bg-[var(--hover-bg)]")}
                    >
                      {size === "normal" ? "A" : size === "large" ? "A+" : "A++"}
                    </button>
                  ))}
                </div>

                {/* Fullscreen */}
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2 rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
                  aria-label="Schermo intero"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {isFullscreen ? (
                      <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>
                    ) : (
                      <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>
                    )}
                  </svg>
                </button>

                {/* PDF */}
                <button
                  onClick={() => handleExportPdf([selectedSong.id])}
                  className="p-2 rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
                  aria-label="Esporta PDF"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>

                {/* Edit (admin) */}
                {isAdmin && (
                  <button onClick={() => startEdit(selectedSong)} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold btn-primary">
                    Modifica
                  </button>
                )}
              </div>

              {/* Song text - with section labels */}
              <div className="song-text">
                <SongSections text={selectedSong.text} />
              </div>

              {selectedSong.source_url && (
                <div className="mt-8 no-print">
                  <a href={selectedSong.source_url} target="_blank" rel="noopener noreferrer" className="text-xs underline muted hover:opacity-100">
                    Fonte originale
                  </a>
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
                      {searchResults.map((result, idx) => (
                        <button
                          key={`${result.url}-${idx}`}
                          onClick={() => handleImport(result.url)}
                          disabled={importLoading}
                          className="w-full text-left p-4 rounded-xl border transition-all hover:shadow-md disabled:opacity-50 card"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-sm leading-snug title-font">{result.title}</h3>
                              <p className="text-xs mt-0.5 muted">{result.author}</p>
                            </div>
                            <span className={cn("flex-shrink-0 px-2 py-0.5 rounded-md text-xs font-bold", result.type === "acorduri" ? "tag-chord" : "tag-lyrics")}>
                              {result.type === "acorduri" ? "Accordi" : "Testo"}
                            </span>
                          </div>
                        </button>
                      ))}
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
                <label className="block text-xs font-semibold mb-1 muted">Testo</label>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={25}
                  className="w-full px-4 py-3 rounded-xl border text-sm font-mono leading-relaxed input-field resize-y"
                />
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
                  className="px-5 py-3 rounded-xl border border-red-300 text-red-500 font-bold text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
