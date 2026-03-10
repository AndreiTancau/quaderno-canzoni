"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type {
  AppUser,
  AppTab,
  Song,
  SongWithSections,
  SongSection,
  SectionType,
  SortMode,
  ScrapedSong,
} from "@/lib/types";
import {
  USERS,
  SECTION_LABELS,
  SECTION_COLORS,
  ALL_KEYS,
  transposeText,
  transposeChord,
  detectKeyFromContent,
} from "@/lib/types";
import { getSupabase } from "@/lib/supabase";

// ─── Helpers ───────────────────────────────────────────────

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function sectionBgColor(type: SectionType): string {
  const map: Record<SectionType, string> = {
    strofa: "bg-blue-500",
    ritornello: "bg-amber-500",
    bridge: "bg-violet-500",
    intro: "bg-emerald-500",
    outro: "bg-red-500",
  };
  return map[type] || "bg-gray-500";
}

function sectionBorderColor(type: SectionType): string {
  const map: Record<SectionType, string> = {
    strofa: "border-blue-400",
    ritornello: "border-amber-400",
    bridge: "border-violet-400",
    intro: "border-emerald-400",
    outro: "border-red-400",
  };
  return map[type] || "border-gray-400";
}

/** Render chord content: replace [Chord] with styled spans */
function renderChordLine(line: string, transpose: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(line)) !== null) {
    // Text before chord
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{line.slice(lastIndex, match.index)}</span>
      );
    }
    // Chord
    const chord =
      transpose !== 0
        ? transposeChord(match[1], transpose)
        : match[1];
    parts.push(
      <span key={key++} className="chord-inline">
        {chord}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  // Remaining text
  if (lastIndex < line.length) {
    parts.push(<span key={key++}>{line.slice(lastIndex)}</span>);
  }
  return parts;
}

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// ─── Main Component ────────────────────────────────────────

export default function Home() {
  // --- State ---
  const [selectedUser, setSelectedUser] = useState<AppUser>(USERS[0]);
  const [activeTab, setActiveTab] = useState<AppTab>("indice");
  const [songs, setSongs] = useState<SongWithSections[]>([]);
  const [selectedSong, setSelectedSong] = useState<SongWithSections | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);

  // Indice state
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("title");
  const [filterKey, setFilterKey] = useState("");
  const [activeLetter, setActiveLetter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // Song view state
  const [transposeAmount, setTransposeAmount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSizeMode, setFontSizeMode] = useState<"normal" | "large" | "xlarge">("normal");

  // Import state
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [scrapedSong, setScrapedSong] = useState<ScrapedSong | null>(null);
  const [importSections, setImportSections] = useState<Partial<SongSection>[]>([]);
  const [importKey, setImportKey] = useState("");
  const [importTitle, setImportTitle] = useState("");
  const [importAuthor, setImportAuthor] = useState("");

  // Edit state
  const [editSections, setEditSections] = useState<SongSection[]>([]);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editAlbum, setEditAlbum] = useState("");
  const [editKey, setEditKey] = useState("");
  const [saving, setSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState("");
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = selectedUser.role === "admin";

  // --- Dark mode toggle ---
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // --- Show toast ---
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), 2500);
  }, []);

  // --- Load songs ---
  const loadSongs = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) {
      // Fallback: load from localStorage
      const stored = localStorage.getItem("quaderno-songs");
      if (stored) {
        try { setSongs(JSON.parse(stored)); } catch {}
      }
      setLoading(false);
      return;
    }
    try {
      const { data: songsData } = await sb
        .from("songs")
        .select("*")
        .order("title");
      const { data: sectionsData } = await sb
        .from("song_sections")
        .select("*")
        .order("position");

      if (songsData) {
        const songsWithSections: SongWithSections[] = songsData.map((s: Song) => ({
          ...s,
          sections: (sectionsData || []).filter(
            (sec: SongSection) => sec.song_id === s.id
          ),
        }));
        setSongs(songsWithSections);
        localStorage.setItem("quaderno-songs", JSON.stringify(songsWithSections));
      }
    } catch (err) {
      console.error("Error loading songs:", err);
      const stored = localStorage.getItem("quaderno-songs");
      if (stored) {
        try { setSongs(JSON.parse(stored)); } catch {}
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  // --- Save song to Supabase ---
  const saveSong = useCallback(
    async (
      title: string,
      author: string,
      album: string | null,
      key: string | null,
      sourceUrl: string | null,
      sections: Partial<SongSection>[]
    ) => {
      const sb = getSupabase();
      if (!sb) {
        // localStorage fallback
        const newSong: SongWithSections = {
          id: generateId(),
          title,
          author,
          album,
          key,
          source_url: sourceUrl,
          owner: selectedUser.name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sections: sections.map((s, i) => ({
            id: generateId(),
            song_id: "",
            section_type: s.section_type || "strofa",
            section_label: s.section_label || `Strofa ${i + 1}`,
            content: s.content || "",
            chords: s.chords || "",
            position: i,
          })),
        };
        newSong.sections.forEach((s) => (s.song_id = newSong.id));
        const updated = [...songs, newSong];
        setSongs(updated);
        localStorage.setItem("quaderno-songs", JSON.stringify(updated));
        return newSong;
      }

      const { data: songData, error: songErr } = await sb
        .from("songs")
        .insert({ title, author, album, key, source_url: sourceUrl, owner: selectedUser.name })
        .select()
        .single();

      if (songErr || !songData) throw songErr || new Error("Failed to save song");

      const sectionsToInsert = sections.map((s, i) => ({
        song_id: songData.id,
        section_type: s.section_type || "strofa",
        section_label: s.section_label || `Strofa ${i + 1}`,
        content: s.content || "",
        chords: s.chords || "",
        position: i,
      }));

      if (sectionsToInsert.length > 0) {
        await sb.from("song_sections").insert(sectionsToInsert);
      }

      await loadSongs();
      return songData;
    },
    [songs, selectedUser, loadSongs]
  );

  // --- Update song ---
  const updateSong = useCallback(
    async (
      songId: string,
      title: string,
      author: string,
      album: string | null,
      key: string | null,
      sections: SongSection[]
    ) => {
      const sb = getSupabase();
      if (!sb) {
        const updated = songs.map((s) =>
          s.id === songId
            ? {
                ...s,
                title,
                author,
                album,
                key,
                updated_at: new Date().toISOString(),
                sections,
              }
            : s
        );
        setSongs(updated);
        localStorage.setItem("quaderno-songs", JSON.stringify(updated));
        return;
      }

      await sb
        .from("songs")
        .update({ title, author, album, key })
        .eq("id", songId);

      // Delete old sections and re-insert
      await sb.from("song_sections").delete().eq("song_id", songId);

      if (sections.length > 0) {
        await sb.from("song_sections").insert(
          sections.map((s, i) => ({
            song_id: songId,
            section_type: s.section_type,
            section_label: s.section_label,
            content: s.content,
            chords: s.chords,
            position: i,
          }))
        );
      }

      await loadSongs();
    },
    [songs, loadSongs]
  );

  // --- Delete song ---
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

  // --- Import: scrape song ---
  const handleImport = useCallback(async () => {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    setImportError("");
    setScrapedSong(null);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setImportError(data.error || "Eroare la import");
        return;
      }

      setScrapedSong(data);
      setImportTitle(data.title);
      setImportAuthor(data.author);

      // Auto-detect key
      const detectedKey = detectKeyFromContent(data.chordContent);
      if (detectedKey) setImportKey(detectedKey);

      // Auto-split into sections: treat the whole content as one section initially
      // Users can then split it manually
      const sections: Partial<SongSection>[] = [
        {
          section_type: "strofa" as SectionType,
          section_label: "Cantec",
          content: data.chordContent,
          chords: "",
          position: 0,
        },
      ];

      // Try to auto-detect sections by looking for patterns like blank lines
      const lines = data.chordContent.split("\n");
      const autoSections: Partial<SongSection>[] = [];
      let currentContent: string[] = [];
      let sectionCount = { strofa: 0, ritornello: 0 };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim().toLowerCase();

        // Check if this is a section marker
        const isRefrain =
          trimmed.startsWith("r:") ||
          trimmed.startsWith("refren:") ||
          trimmed.startsWith("ref:") ||
          trimmed === "refren" ||
          trimmed === "ritornello" ||
          trimmed === "chorus" ||
          trimmed === "chorus:";
        const isBridge =
          trimmed.startsWith("bridge") || trimmed.startsWith("punte");
        const isIntro = trimmed.startsWith("intro");
        const isOutro =
          trimmed.startsWith("outro") || trimmed.startsWith("final");

        if (isRefrain || isBridge || isIntro || isOutro) {
          // Save current content as a section
          if (currentContent.length > 0) {
            const text = currentContent.join("\n").trim();
            if (text) {
              sectionCount.strofa++;
              autoSections.push({
                section_type: "strofa",
                section_label: `Strofa ${sectionCount.strofa}`,
                content: text,
                position: autoSections.length,
              });
            }
          }
          currentContent = [];

          // Start collecting the special section
          let type: SectionType = "ritornello";
          if (isBridge) type = "bridge";
          if (isIntro) type = "intro";
          if (isOutro) type = "outro";

          // The label line itself might have content after the marker
          const markerContent = line
            .replace(/^(r:|refren:|ref:|refren|ritornello|chorus:|chorus|bridge:|bridge|punte:|punte|intro:|intro|outro:|outro|final:?)\s*/i, "")
            .trim();
          if (markerContent) {
            currentContent.push(markerContent);
          }

          // Collect until next blank line or section marker
          let j = i + 1;
          while (j < lines.length) {
            const nextTrimmed = lines[j].trim().toLowerCase();
            if (
              nextTrimmed === "" &&
              j + 1 < lines.length &&
              lines[j + 1].trim() === ""
            ) {
              break;
            }
            const isNextMarker =
              nextTrimmed.startsWith("r:") ||
              nextTrimmed.startsWith("refren") ||
              nextTrimmed.startsWith("ref:") ||
              nextTrimmed === "chorus" ||
              nextTrimmed.startsWith("bridge") ||
              nextTrimmed.startsWith("intro") ||
              nextTrimmed.startsWith("outro") ||
              nextTrimmed.startsWith("final");
            if (isNextMarker) break;
            currentContent.push(lines[j]);
            j++;
          }
          i = j - 1;

          const sectionText = currentContent.join("\n").trim();
          if (sectionText) {
            if (type === "ritornello") sectionCount.ritornello++;
            autoSections.push({
              section_type: type,
              section_label:
                type === "ritornello"
                  ? `Ritornello${sectionCount.ritornello > 1 ? " " + sectionCount.ritornello : ""}`
                  : SECTION_LABELS[type],
              content: sectionText,
              position: autoSections.length,
            });
          }
          currentContent = [];
        } else {
          currentContent.push(line);
        }
      }

      // Remaining content
      if (currentContent.length > 0) {
        const text = currentContent.join("\n").trim();
        if (text) {
          if (autoSections.length > 0) {
            sectionCount.strofa++;
            autoSections.push({
              section_type: "strofa",
              section_label: `Strofa ${sectionCount.strofa}`,
              content: text,
              position: autoSections.length,
            });
          }
        }
      }

      // Use auto-detected sections if we found more than one, otherwise use the single section
      setImportSections(
        autoSections.length > 1 ? autoSections : sections
      );
    } catch (err) {
      setImportError("Eroare de retea");
    } finally {
      setImportLoading(false);
    }
  }, [importUrl]);

  // --- Import: save ---
  const handleImportSave = useCallback(async () => {
    setSaving(true);
    try {
      const song = await saveSong(
        importTitle,
        importAuthor,
        scrapedSong?.album || null,
        importKey || null,
        importUrl || null,
        importSections
      );
      showToast("Cantec salvat cu succes!");
      setScrapedSong(null);
      setImportUrl("");
      setImportSections([]);
      setImportKey("");
      setImportTitle("");
      setImportAuthor("");
      setActiveTab("indice");
    } catch (err) {
      showToast("Eroare la salvare");
    }
    setSaving(false);
  }, [
    importTitle,
    importAuthor,
    importKey,
    importUrl,
    importSections,
    scrapedSong,
    saveSong,
    showToast,
  ]);

  // --- Edit: start editing ---
  const startEdit = useCallback((song: SongWithSections) => {
    setEditTitle(song.title);
    setEditAuthor(song.author);
    setEditAlbum(song.album || "");
    setEditKey(song.key || "");
    setEditSections(
      song.sections.map((s) => ({ ...s }))
    );
    setActiveTab("modifica");
  }, []);

  // --- Edit: save ---
  const handleEditSave = useCallback(async () => {
    if (!selectedSong) return;
    setSaving(true);
    try {
      await updateSong(
        selectedSong.id,
        editTitle,
        editAuthor,
        editAlbum || null,
        editKey || null,
        editSections
      );
      showToast("Modificari salvate!");
      // Reload selected song
      const updated = songs.find((s) => s.id === selectedSong.id);
      if (updated) {
        setSelectedSong({
          ...updated,
          title: editTitle,
          author: editAuthor,
          album: editAlbum || null,
          key: editKey || null,
          sections: editSections,
        });
      }
      setActiveTab("canzone");
    } catch (err) {
      showToast("Eroare la salvare");
    }
    setSaving(false);
  }, [
    selectedSong,
    editTitle,
    editAuthor,
    editAlbum,
    editKey,
    editSections,
    updateSong,
    showToast,
    songs,
  ]);

  // --- Edit: delete ---
  const handleDelete = useCallback(async () => {
    if (!selectedSong) return;
    if (!confirm("Esti sigur ca vrei sa stergi acest cantec?")) return;
    await deleteSong(selectedSong.id);
    setSelectedSong(null);
    setActiveTab("indice");
    showToast("Cantec sters");
  }, [selectedSong, deleteSong, showToast]);

  // --- PDF export ---
  const handleExportPdf = useCallback(
    async (ids: string[]) => {
      try {
        showToast("Se genereaza PDF-ul...");
        const res = await fetch("/api/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ songIds: ids }),
        });
        if (!res.ok) throw new Error("PDF generation failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download =
          ids.length === 1
            ? `${songs.find((s) => s.id === ids[0])?.title || "cantec"}.pdf`
            : "quaderno-canzoni.pdf";
        a.click();
        URL.revokeObjectURL(url);
        showToast("PDF descarcat!");
      } catch {
        showToast("Eroare la generarea PDF");
      }
    },
    [songs, showToast]
  );

  // --- Filtered & sorted songs ---
  const filteredSongs = useMemo(() => {
    let result = [...songs];

    // Filter by search query
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.author.toLowerCase().includes(q)
      );
    }

    // Filter by key
    if (filterKey) {
      result = result.filter((s) => s.key === filterKey);
    }

    // Filter by letter
    if (activeLetter) {
      result = result.filter((s) =>
        s.title.toUpperCase().startsWith(activeLetter)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortMode === "title") return a.title.localeCompare(b.title, "ro");
      if (sortMode === "author") return a.author.localeCompare(b.author, "ro");
      if (sortMode === "key") return (a.key || "").localeCompare(b.key || "");
      return 0;
    });

    return result;
  }, [songs, query, filterKey, activeLetter, sortMode]);

  // Available letters
  const availableLetters = useMemo(() => {
    const letters = new Set(songs.map((s) => s.title[0]?.toUpperCase()).filter(Boolean));
    return "ABCDEFGHIJKLMNOPRSTUVWXYZ".split("").filter((l) => letters.has(l));
  }, [songs]);

  // Available keys in collection
  const usedKeys = useMemo(() => {
    return [...new Set(songs.map((s) => s.key).filter(Boolean))] as string[];
  }, [songs]);

  // ─── RENDER ─────────────────────────────────────────────

  return (
    <div className={cn(fontSizeMode === "large" && "font-large", fontSizeMode === "xlarge" && "font-xlarge")}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-fade-in">
          <div className="px-5 py-2.5 rounded-xl shadow-lg text-sm font-medium"
            style={{ background: "var(--accent)", color: "white" }}>
            {toast}
          </div>
        </div>
      )}

      {/* Fullscreen wrapper */}
      <div className={cn(isFullscreen && "fullscreen-mode")}>
        {/* Header */}
        <header
          className="no-print sticky top-0 z-40 backdrop-blur-md border-b"
          style={{
            background: "color-mix(in srgb, var(--background) 85%, transparent)",
            borderColor: "var(--card-border)",
          }}
        >
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            {/* Back button when not on indice */}
            {activeTab !== "indice" && (
              <button
                onClick={() => {
                  if (activeTab === "modifica") {
                    setActiveTab("canzone");
                  } else {
                    setActiveTab("indice");
                    setTransposeAmount(0);
                  }
                }}
                className="p-2 rounded-lg hover:bg-[var(--accent-light)] transition-colors"
                aria-label="Inapoi"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {/* Title */}
            <h1
              className="text-lg md:text-xl font-bold tracking-tight flex-1"
              style={{ fontFamily: "var(--font-title), var(--font-fraunces), serif" }}
            >
              {activeTab === "indice" && "Quaderno Canzoni"}
              {activeTab === "canzone" && (selectedSong?.title || "")}
              {activeTab === "importa" && "Importa Cantec"}
              {activeTab === "modifica" && "Modifica"}
            </h1>

            {/* Controls */}
            <div className="flex items-center gap-1.5">
              {/* Dark mode toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg hover:bg-[var(--accent-light)] transition-colors text-sm"
                aria-label="Toggle dark mode"
              >
                {darkMode ? "\u2600\uFE0F" : "\uD83C\uDF19"}
              </button>

              {/* User selector */}
              <div className="flex gap-1">
                {USERS.map((u) => (
                  <button
                    key={u.name}
                    onClick={() => setSelectedUser(u)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                      selectedUser.name === u.name
                        ? "text-white shadow-md"
                        : "hover:bg-[var(--accent-light)]"
                    )}
                    style={
                      selectedUser.name === u.name
                        ? { background: "var(--accent)" }
                        : undefined
                    }
                  >
                    {u.emoji} {u.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-5xl mx-auto px-4 pb-24">
          {/* ═══════════════ TAB: INDICE ═══════════════ */}
          {activeTab === "indice" && (
            <div className="animate-fade-in">
              {/* Search + controls bar */}
              <div className="sticky top-[57px] z-30 pt-4 pb-3 no-print"
                style={{ background: "var(--background)" }}>
                <div className="flex flex-col gap-3">
                  {/* Search */}
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40"
                        width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Cauta cantec sau autor..."
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setActiveLetter("");
                        }}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-all"
                      />
                    </div>

                    {/* Import button (admin only) */}
                    {isAdmin && (
                      <button
                        onClick={() => setActiveTab("importa")}
                        className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                        style={{ background: "var(--accent)" }}
                      >
                        + Importa
                      </button>
                    )}
                  </div>

                  {/* Filters row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Sort */}
                    <select
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value as SortMode)}
                      className="px-3 py-1.5 rounded-lg border text-xs font-medium focus:outline-none"
                    >
                      <option value="title">Titlu A-Z</option>
                      <option value="author">Autor A-Z</option>
                      <option value="key">Gama</option>
                    </select>

                    {/* Key filter */}
                    {usedKeys.length > 0 && (
                      <select
                        value={filterKey}
                        onChange={(e) => setFilterKey(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border text-xs font-medium focus:outline-none"
                      >
                        <option value="">Toate gamele</option>
                        {usedKeys.sort().map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Count */}
                    <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
                      {filteredSongs.length} cantece
                    </span>

                    {/* Select mode toggle */}
                    <button
                      onClick={() => {
                        setSelectMode(!selectMode);
                        setSelectedIds(new Set());
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                        selectMode && "text-white"
                      )}
                      style={selectMode ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
                    >
                      {selectMode ? "Anuleaza" : "Selecteaza"}
                    </button>
                  </div>

                  {/* Alpha nav */}
                  {availableLetters.length > 3 && (
                    <div className="alpha-nav flex flex-wrap gap-1">
                      <a
                        href="#"
                        className={cn(!activeLetter && "active")}
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveLetter("");
                        }}
                      >
                        Toate
                      </a>
                      {availableLetters.map((l) => (
                        <a
                          key={l}
                          href="#"
                          className={cn(activeLetter === l && "active")}
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveLetter(activeLetter === l ? "" : l);
                          }}
                        >
                          {l}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Selection actions */}
                  {selectMode && selectedIds.size > 0 && (
                    <div className="flex gap-2 items-center">
                      <span className="text-xs font-medium">
                        {selectedIds.size} selectate
                      </span>
                      <button
                        onClick={() => handleExportPdf(Array.from(selectedIds))}
                        className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
                        style={{ background: "var(--accent)" }}
                      >
                        Exporta PDF ({selectedIds.size})
                      </button>
                      <button
                        onClick={() => handleExportPdf(songs.map((s) => s.id))}
                        className="px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-[var(--accent-light)] transition-colors"
                      >
                        Exporta Toate
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Song list */}
              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--accent)] border-t-transparent" />
                </div>
              ) : filteredSongs.length === 0 ? (
                <div className="text-center py-20" style={{ color: "var(--muted)" }}>
                  <div className="text-4xl mb-4">{songs.length === 0 ? "\uD83C\uDFB5" : "\uD83D\uDD0D"}</div>
                  <p className="text-lg font-medium">
                    {songs.length === 0
                      ? "Niciun cantec inca"
                      : "Niciun rezultat"}
                  </p>
                  {songs.length === 0 && isAdmin && (
                    <button
                      onClick={() => setActiveTab("importa")}
                      className="mt-4 px-6 py-2.5 rounded-xl text-white font-semibold"
                      style={{ background: "var(--accent)" }}
                    >
                      Importa primul cantec
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {filteredSongs.map((song) => (
                    <button
                      key={song.id}
                      onClick={() => {
                        if (selectMode) {
                          const next = new Set(selectedIds);
                          if (next.has(song.id)) next.delete(song.id);
                          else next.add(song.id);
                          setSelectedIds(next);
                        } else {
                          setSelectedSong(song);
                          setTransposeAmount(0);
                          setActiveTab("canzone");
                        }
                      }}
                      className={cn(
                        "card-transition text-left p-4 rounded-xl border transition-all hover:shadow-md",
                        selectMode && selectedIds.has(song.id) && "ring-2 ring-[var(--accent)]"
                      )}
                      style={{
                        background: "var(--card-bg)",
                        borderColor: "var(--card-border)",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        {selectMode && (
                          <div
                            className={cn(
                              "mt-1 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all",
                              selectedIds.has(song.id) && "border-[var(--accent)] bg-[var(--accent)]"
                            )}
                          >
                            {selectedIds.has(song.id) && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3
                            className="font-bold text-[0.95rem] leading-snug truncate"
                            style={{ fontFamily: "var(--font-title), serif" }}
                          >
                            {song.title}
                          </h3>
                          <p
                            className="text-xs mt-0.5 truncate"
                            style={{ color: "var(--muted)" }}
                          >
                            {song.author}
                          </p>
                        </div>
                        {song.key && (
                          <span
                            className="flex-shrink-0 px-2 py-0.5 rounded-md text-xs font-bold"
                            style={{
                              background: "var(--accent-light)",
                              color: "var(--accent)",
                            }}
                          >
                            {song.key}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Export all button at bottom */}
              {songs.length > 0 && !selectMode && (
                <div className="mt-8 text-center no-print">
                  <button
                    onClick={() => handleExportPdf(songs.map((s) => s.id))}
                    className="px-6 py-2.5 rounded-xl border text-sm font-semibold hover:bg-[var(--accent-light)] transition-colors"
                  >
                    Exporta tot ca PDF ({songs.length} cantece)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ TAB: CANZONE ═══════════════ */}
          {activeTab === "canzone" && selectedSong && (
            <div className="animate-fade-in py-6">
              {/* Song header */}
              <div className="mb-6">
                <h2
                  className="text-2xl md:text-3xl lg:text-4xl font-extrabold leading-tight"
                  style={{ fontFamily: "var(--font-title), serif" }}
                >
                  {selectedSong.title}
                </h2>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span style={{ color: "var(--muted)" }} className="text-sm">
                    {selectedSong.author}
                  </span>
                  {(selectedSong.key || transposeAmount !== 0) && (
                    <span
                      className="px-2.5 py-0.5 rounded-md text-xs font-bold"
                      style={{
                        background: "var(--accent-light)",
                        color: "var(--accent)",
                      }}
                    >
                      Gama:{" "}
                      {transposeAmount !== 0 && selectedSong.key
                        ? transposeChord(selectedSong.key, transposeAmount)
                        : selectedSong.key || "?"}
                    </span>
                  )}
                  {selectedSong.source_url && (
                    <a
                      href={selectedSong.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline opacity-50 hover:opacity-100"
                    >
                      sursa
                    </a>
                  )}
                </div>
              </div>

              {/* Controls bar */}
              <div
                className="no-print flex items-center gap-2 flex-wrap mb-6 p-3 rounded-xl border"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--card-border)",
                }}
              >
                {/* Transpose */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                    Transpune:
                  </span>
                  <button
                    onClick={() => setTransposeAmount((t) => t - 1)}
                    className="w-8 h-8 rounded-lg border text-sm font-bold hover:bg-[var(--accent-light)] transition-colors flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="text-sm font-mono font-bold w-6 text-center">
                    {transposeAmount > 0 ? `+${transposeAmount}` : transposeAmount}
                  </span>
                  <button
                    onClick={() => setTransposeAmount((t) => t + 1)}
                    className="w-8 h-8 rounded-lg border text-sm font-bold hover:bg-[var(--accent-light)] transition-colors flex items-center justify-center"
                  >
                    +
                  </button>
                  {transposeAmount !== 0 && (
                    <button
                      onClick={() => setTransposeAmount(0)}
                      className="text-xs px-2 py-1 rounded-md hover:bg-[var(--accent-light)] transition-colors"
                      style={{ color: "var(--muted)" }}
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="w-px h-6 mx-1" style={{ background: "var(--card-border)" }} />

                {/* Font size */}
                <div className="flex items-center gap-1">
                  {(["normal", "large", "xlarge"] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setFontSizeMode(size)}
                      className={cn(
                        "px-2 py-1 rounded-md text-xs font-semibold transition-colors",
                        fontSizeMode === size
                          ? "text-white"
                          : "hover:bg-[var(--accent-light)]"
                      )}
                      style={
                        fontSizeMode === size
                          ? { background: "var(--accent)" }
                          : undefined
                      }
                    >
                      {size === "normal" ? "A" : size === "large" ? "A+" : "A++"}
                    </button>
                  ))}
                </div>

                <div className="w-px h-6 mx-1" style={{ background: "var(--card-border)" }} />

                {/* Fullscreen */}
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2 rounded-lg hover:bg-[var(--accent-light)] transition-colors"
                  aria-label="Toggle fullscreen"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {isFullscreen ? (
                      <>
                        <polyline points="4 14 10 14 10 20" />
                        <polyline points="20 10 14 10 14 4" />
                        <line x1="14" y1="10" x2="21" y2="3" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </>
                    ) : (
                      <>
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </>
                    )}
                  </svg>
                </button>

                {/* PDF export */}
                <button
                  onClick={() => handleExportPdf([selectedSong.id])}
                  className="p-2 rounded-lg hover:bg-[var(--accent-light)] transition-colors"
                  aria-label="Export PDF"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>

                {/* Edit button (admin only) */}
                {isAdmin && (
                  <button
                    onClick={() => startEdit(selectedSong)}
                    className="ml-auto px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
                    style={{ background: "var(--accent)" }}
                  >
                    Modifica
                  </button>
                )}
              </div>

              {/* Song sections */}
              <div className="space-y-6">
                {selectedSong.sections.length > 0 ? (
                  selectedSong.sections
                    .sort((a, b) => a.position - b.position)
                    .map((section, idx) => (
                      <div key={section.id || idx} className="animate-fade-in">
                        {/* Section label badge */}
                        <div className="mb-2">
                          <span
                            className={cn(
                              "section-badge",
                              sectionBgColor(section.section_type as SectionType)
                            )}
                          >
                            {section.section_label}
                          </span>
                        </div>
                        {/* Section content */}
                        <div
                          className={cn(
                            "pl-4 border-l-[3px]",
                            sectionBorderColor(section.section_type as SectionType)
                          )}
                        >
                          <div className="song-text">
                            {section.content.split("\n").map((line, li) => (
                              <div key={li}>
                                {renderChordLine(line, transposeAmount)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="song-text py-4" style={{ color: "var(--muted)" }}>
                    Nicio sectiune definita
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════ TAB: IMPORTA ═══════════════ */}
          {activeTab === "importa" && isAdmin && (
            <div className="animate-fade-in py-6 max-w-2xl mx-auto">
              {/* URL input */}
              <div className="mb-6">
                <label className="block text-sm font-semibold mb-2">
                  Link resursecrestine.ro
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://www.resursecrestine.ro/acorduri/..."
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleImport()}
                    className="flex-1 px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <button
                    onClick={handleImport}
                    disabled={importLoading || !importUrl.trim()}
                    className="px-6 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-all"
                    style={{ background: "var(--accent)" }}
                  >
                    {importLoading ? (
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      "Importa"
                    )}
                  </button>
                </div>
                {importError && (
                  <p className="mt-2 text-sm text-red-500">{importError}</p>
                )}
              </div>

              {/* Scraped song preview */}
              {scrapedSong && (
                <div className="space-y-5">
                  {/* Title & Author */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>
                        Titlu
                      </label>
                      <input
                        type="text"
                        value={importTitle}
                        onChange={(e) => setImportTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>
                        Autor
                      </label>
                      <input
                        type="text"
                        value={importAuthor}
                        onChange={(e) => setImportAuthor(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </div>
                  </div>

                  {/* Key */}
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>
                      Gama (Tonalitate)
                    </label>
                    <select
                      value={importKey}
                      onChange={(e) => setImportKey(e.target.value)}
                      className="px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    >
                      <option value="">Selecteaza...</option>
                      {ALL_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sections editor */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold">Sectiuni</h3>
                      <button
                        onClick={() => {
                          setImportSections([
                            ...importSections,
                            {
                              section_type: "strofa" as SectionType,
                              section_label: `Strofa ${importSections.filter((s) => s.section_type === "strofa").length + 1}`,
                              content: "",
                              position: importSections.length,
                            },
                          ]);
                        }}
                        className="text-xs px-3 py-1 rounded-lg font-semibold"
                        style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                      >
                        + Adauga sectiune
                      </button>
                    </div>

                    <div className="space-y-3">
                      {importSections.map((section, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl border"
                          style={{
                            background: "var(--card-bg)",
                            borderColor: "var(--card-border)",
                          }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <select
                              value={section.section_type || "strofa"}
                              onChange={(e) => {
                                const next = [...importSections];
                                next[idx] = {
                                  ...next[idx],
                                  section_type: e.target.value as SectionType,
                                  section_label:
                                    SECTION_LABELS[e.target.value as SectionType],
                                };
                                setImportSections(next);
                              }}
                              className="px-2 py-1 rounded-md border text-xs font-medium focus:outline-none"
                            >
                              {Object.entries(SECTION_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={section.section_label || ""}
                              onChange={(e) => {
                                const next = [...importSections];
                                next[idx] = { ...next[idx], section_label: e.target.value };
                                setImportSections(next);
                              }}
                              className="flex-1 px-2 py-1 rounded-md border text-xs focus:outline-none"
                              placeholder="Label..."
                            />
                            <button
                              onClick={() => {
                                setImportSections(importSections.filter((_, i) => i !== idx));
                              }}
                              className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                              aria-label="Sterge"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                          <textarea
                            value={section.content || ""}
                            onChange={(e) => {
                              const next = [...importSections];
                              next[idx] = { ...next[idx], content: e.target.value };
                              setImportSections(next);
                            }}
                            rows={6}
                            className="w-full px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-y"
                            placeholder="Testo con accordi..."
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  {importSections.length > 0 && importSections[0].content && (
                    <div>
                      <h3 className="text-sm font-bold mb-3">Previzualizare</h3>
                      <div
                        className="p-5 rounded-xl border"
                        style={{
                          background: "var(--card-bg)",
                          borderColor: "var(--card-border)",
                        }}
                      >
                        <div className="space-y-4">
                          {importSections.map((section, idx) => (
                            <div key={idx}>
                              <span
                                className={cn(
                                  "section-badge mb-1.5",
                                  sectionBgColor(
                                    (section.section_type as SectionType) || "strofa"
                                  )
                                )}
                              >
                                {section.section_label}
                              </span>
                              <div
                                className={cn(
                                  "pl-4 border-l-[3px] mt-1.5",
                                  sectionBorderColor(
                                    (section.section_type as SectionType) || "strofa"
                                  )
                                )}
                              >
                                <div className="song-text text-sm">
                                  {(section.content || "").split("\n").map((line, li) => (
                                    <div key={li}>{renderChordLine(line, 0)}</div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Save button */}
                  <button
                    onClick={handleImportSave}
                    disabled={saving || !importTitle.trim()}
                    className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-all hover:shadow-lg"
                    style={{ background: "var(--accent)" }}
                  >
                    {saving ? "Se salveaza..." : "Salveaza in Quaderno"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ TAB: MODIFICA ═══════════════ */}
          {activeTab === "modifica" && isAdmin && selectedSong && (
            <div className="animate-fade-in py-6 max-w-2xl mx-auto">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>
                    Titlu
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>
                    Autor
                  </label>
                  <input
                    type="text"
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>
                    Album
                  </label>
                  <input
                    type="text"
                    value={editAlbum}
                    onChange={(e) => setEditAlbum(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>
                    Gama
                  </label>
                  <select
                    value={editKey}
                    onChange={(e) => setEditKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  >
                    <option value="">Selecteaza...</option>
                    {ALL_KEYS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sections */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold">Sectiuni</h3>
                  <button
                    onClick={() => {
                      setEditSections([
                        ...editSections,
                        {
                          id: generateId(),
                          song_id: selectedSong.id,
                          section_type: "strofa",
                          section_label: `Strofa ${editSections.filter((s) => s.section_type === "strofa").length + 1}`,
                          content: "",
                          chords: "",
                          position: editSections.length,
                        },
                      ]);
                    }}
                    className="text-xs px-3 py-1 rounded-lg font-semibold"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                  >
                    + Adauga
                  </button>
                </div>

                <div className="space-y-3">
                  {editSections.map((section, idx) => (
                    <div
                      key={section.id}
                      className="p-4 rounded-xl border"
                      style={{
                        background: "var(--card-bg)",
                        borderColor: "var(--card-border)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {/* Reorder buttons */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => {
                              if (idx === 0) return;
                              const next = [...editSections];
                              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                              setEditSections(next.map((s, i) => ({ ...s, position: i })));
                            }}
                            disabled={idx === 0}
                            className="p-0.5 rounded hover:bg-[var(--accent-light)] disabled:opacity-20 transition-colors"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="18 15 12 9 6 15" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              if (idx === editSections.length - 1) return;
                              const next = [...editSections];
                              [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                              setEditSections(next.map((s, i) => ({ ...s, position: i })));
                            }}
                            disabled={idx === editSections.length - 1}
                            className="p-0.5 rounded hover:bg-[var(--accent-light)] disabled:opacity-20 transition-colors"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>
                        </div>

                        <select
                          value={section.section_type}
                          onChange={(e) => {
                            const next = [...editSections];
                            next[idx] = {
                              ...next[idx],
                              section_type: e.target.value as SectionType,
                              section_label: SECTION_LABELS[e.target.value as SectionType],
                            };
                            setEditSections(next);
                          }}
                          className="px-2 py-1 rounded-md border text-xs font-medium focus:outline-none"
                        >
                          {Object.entries(SECTION_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={section.section_label}
                          onChange={(e) => {
                            const next = [...editSections];
                            next[idx] = { ...next[idx], section_label: e.target.value };
                            setEditSections(next);
                          }}
                          className="flex-1 px-2 py-1 rounded-md border text-xs focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            setEditSections(editSections.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i })));
                          }}
                          className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                      <textarea
                        value={section.content}
                        onChange={(e) => {
                          const next = [...editSections];
                          next[idx] = { ...next[idx], content: e.target.value };
                          setEditSections(next);
                        }}
                        rows={6}
                        className="w-full px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-y"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleEditSave}
                  disabled={saving || !editTitle.trim()}
                  className="flex-1 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-all"
                  style={{ background: "var(--accent)" }}
                >
                  {saving ? "Se salveaza..." : "Salveaza modificarile"}
                </button>
                <button
                  onClick={handleDelete}
                  className="px-5 py-3 rounded-xl border border-red-300 text-red-500 font-bold text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Sterge
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
