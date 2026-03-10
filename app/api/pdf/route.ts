import { NextRequest, NextResponse } from "next/server";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import { getSupabase } from "@/lib/supabase";
import type { Song, SongSection, SongWithSections } from "@/lib/types";

// ─── Fonts ─────────────────────────────────────────────────
// Using standard fonts to avoid font loading issues on Vercel
Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
    { src: "Helvetica-Oblique", fontStyle: "italic" },
  ],
});

// ─── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 45,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#1a1a2e",
  },
  // Cover page
  coverPage: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: 60,
    fontFamily: "Helvetica",
  },
  coverTitle: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#6366f1",
    marginBottom: 12,
    textAlign: "center",
  },
  coverSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 40,
  },
  coverMeta: {
    fontSize: 10,
    color: "#9ca3af",
    textAlign: "center",
  },
  // Index page
  indexTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#6366f1",
  },
  indexRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  indexSongTitle: {
    fontSize: 10,
    fontWeight: "bold",
    flex: 1,
  },
  indexAuthor: {
    fontSize: 9,
    color: "#6b7280",
    marginLeft: 8,
    marginRight: 8,
  },
  indexKey: {
    fontSize: 9,
    color: "#6366f1",
    fontWeight: "bold",
    marginRight: 8,
    width: 25,
    textAlign: "center",
  },
  indexPage: {
    fontSize: 9,
    color: "#6b7280",
    width: 20,
    textAlign: "right",
  },
  // Song pages
  songTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#1a1a2e",
  },
  songAuthor: {
    fontSize: 10,
    color: "#6b7280",
    marginBottom: 2,
  },
  songKey: {
    fontSize: 10,
    color: "#6366f1",
    fontWeight: "bold",
    marginBottom: 16,
  },
  sectionContainer: {
    marginBottom: 14,
  },
  sectionBadge: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    alignSelf: "flex-start",
  },
  sectionContent: {
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: "#e5e7eb",
  },
  contentLine: {
    fontSize: 10,
    lineHeight: 1.8,
    fontFamily: "Courier",
  },
  chordText: {
    color: "#6366f1",
    fontWeight: "bold",
    fontFamily: "Courier-Bold",
  },
  normalText: {
    color: "#1a1a2e",
    fontFamily: "Courier",
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 25,
    left: 45,
    right: 45,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 8,
    color: "#9ca3af",
  },
  footerPage: {
    fontSize: 8,
    color: "#6b7280",
  },
});

// ─── Section colors ────────────────────────────────────────
const SECTION_BADGE_COLORS: Record<string, string> = {
  strofa: "#3b82f6",
  ritornello: "#f59e0b",
  bridge: "#8b5cf6",
  intro: "#10b981",
  outro: "#ef4444",
};

const SECTION_BORDER_COLORS: Record<string, string> = {
  strofa: "#93c5fd",
  ritornello: "#fcd34d",
  bridge: "#c4b5fd",
  intro: "#6ee7b7",
  outro: "#fca5a5",
};

// ─── Chord parsing helpers ─────────────────────────────────
interface TextSegment {
  text: string;
  isChord: boolean;
}

function parseChordLine(line: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index), isChord: false });
    }
    segments.push({ text: match[1], isChord: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), isChord: false });
  }
  if (segments.length === 0 && line.length === 0) {
    segments.push({ text: " ", isChord: false });
  }
  return segments;
}

// ─── PDF Document Component ───────────────────────────────
function SongBookDocument({ songs }: { songs: SongWithSections[] }) {
  const sortedSongs = [...songs].sort((a, b) =>
    a.title.localeCompare(b.title, "ro")
  );

  // Page numbers: cover=1, index starts at 2, songs start after index
  // Index takes ceil(songs.length / 35) pages (approx 35 songs per index page)
  const indexPages = Math.max(1, Math.ceil(sortedSongs.length / 35));
  const songStartPage = 1 + indexPages + 1; // cover + index pages + 1

  const showCover = sortedSongs.length > 1;
  const showIndex = sortedSongs.length > 1;

  return React.createElement(
    Document,
    {
      title: "Quaderno Canzoni",
      author: "Quaderno Canzoni",
      subject: "Raccolta di canzoni con accordi",
    },
    // Cover page
    showCover &&
      React.createElement(
        Page,
        { size: "A4", style: styles.coverPage },
        React.createElement(
          View,
          { style: { flex: 1, justifyContent: "center", alignItems: "center" } },
          React.createElement(
            Text,
            { style: styles.coverTitle },
            "Quaderno Canzoni"
          ),
          React.createElement(
            Text,
            { style: styles.coverSubtitle },
            `${sortedSongs.length} cantece cu acorduri`
          ),
          React.createElement(
            Text,
            { style: styles.coverMeta },
            `Generat: ${new Date().toLocaleDateString("ro-RO", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}`
          )
        )
      ),

    // Index page(s)
    showIndex &&
      React.createElement(
        Page,
        { size: "A4", style: styles.page },
        React.createElement(Text, { style: styles.indexTitle }, "Indice"),
        React.createElement(
          View,
          null,
          ...sortedSongs.map((song, idx) =>
            React.createElement(
              View,
              { key: song.id, style: styles.indexRow },
              React.createElement(
                Text,
                { style: styles.indexSongTitle },
                `${idx + 1}. ${song.title}`
              ),
              React.createElement(
                Text,
                { style: styles.indexAuthor },
                song.author
              ),
              song.key
                ? React.createElement(
                    Text,
                    { style: styles.indexKey },
                    song.key
                  )
                : null,
              React.createElement(
                Text,
                { style: styles.indexPage },
                String(songStartPage + idx)
              )
            )
          )
        ),
        // Footer
        React.createElement(
          View,
          { style: styles.footer, fixed: true } as any,
          React.createElement(
            Text,
            { style: styles.footerText },
            "Quaderno Canzoni"
          ),
          React.createElement(
            Text,
            { style: styles.footerPage, render: ({ pageNumber }: { pageNumber: number }) => `${pageNumber}` } as any
          )
        )
      ),

    // Song pages
    ...sortedSongs.map((song) =>
      React.createElement(
        Page,
        { key: song.id, size: "A4", style: styles.page, wrap: true },
        // Header
        React.createElement(
          View,
          { style: { marginBottom: 16 } },
          React.createElement(Text, { style: styles.songTitle }, song.title),
          React.createElement(
            Text,
            { style: styles.songAuthor },
            song.author + (song.album ? ` — ${song.album}` : "")
          ),
          song.key
            ? React.createElement(
                Text,
                { style: styles.songKey },
                `Gama: ${song.key}`
              )
            : null
        ),
        // Sections
        ...song.sections
          .sort((a, b) => a.position - b.position)
          .map((section, sIdx) =>
            React.createElement(
              View,
              {
                key: section.id || `s-${sIdx}`,
                style: styles.sectionContainer,
                wrap: false,
              } as any,
              // Badge
              React.createElement(
                View,
                {
                  style: {
                    ...styles.sectionBadge,
                    backgroundColor:
                      SECTION_BADGE_COLORS[section.section_type] || "#6b7280",
                  },
                },
                React.createElement(
                  Text,
                  { style: { color: "#ffffff", fontSize: 8, fontWeight: "bold" } },
                  section.section_label
                )
              ),
              // Content
              React.createElement(
                View,
                {
                  style: {
                    ...styles.sectionContent,
                    borderLeftColor:
                      SECTION_BORDER_COLORS[section.section_type] || "#d1d5db",
                  },
                },
                ...section.content.split("\n").map((line, lineIdx) => {
                  const segments = parseChordLine(line);
                  return React.createElement(
                    Text,
                    {
                      key: `l-${lineIdx}`,
                      style: styles.contentLine,
                    },
                    ...segments.map((seg, segIdx) =>
                      React.createElement(
                        Text,
                        {
                          key: `seg-${segIdx}`,
                          style: seg.isChord
                            ? styles.chordText
                            : styles.normalText,
                        },
                        seg.text
                      )
                    )
                  );
                })
              )
            )
          ),
        // Footer
        React.createElement(
          View,
          { style: styles.footer, fixed: true } as any,
          React.createElement(
            Text,
            { style: styles.footerText },
            "Quaderno Canzoni"
          ),
          React.createElement(
            Text,
            { style: styles.footerPage, render: ({ pageNumber }: { pageNumber: number }) => `${pageNumber}` } as any
          )
        )
      )
    )
  );
}

// ─── API Route ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { songIds } = await request.json();

    if (!songIds || !Array.isArray(songIds) || songIds.length === 0) {
      return NextResponse.json(
        { error: "Nessun cantec selezionato" },
        { status: 400 }
      );
    }

    let songs: SongWithSections[] = [];
    const sb = getSupabase();

    if (sb) {
      // Fetch from Supabase
      const { data: songsData } = await sb
        .from("songs")
        .select("*")
        .in("id", songIds)
        .order("title");

      const { data: sectionsData } = await sb
        .from("song_sections")
        .select("*")
        .in("song_id", songIds)
        .order("position");

      if (songsData) {
        songs = songsData.map((s: Song) => ({
          ...s,
          sections: (sectionsData || []).filter(
            (sec: SongSection) => sec.song_id === s.id
          ),
        }));
      }
    } else {
      // When Supabase is not configured, the client should send the song data
      // For now, return an error
      return NextResponse.json(
        { error: "Database non configurato. Configura Supabase per generare PDF." },
        { status: 500 }
      );
    }

    if (songs.length === 0) {
      return NextResponse.json(
        { error: "Nessun cantec trovato" },
        { status: 404 }
      );
    }

    // Generate PDF
    const doc = React.createElement(SongBookDocument, { songs });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(doc as any);
    const uint8 = new Uint8Array(buffer);

    return new NextResponse(uint8, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="quaderno-canzoni.pdf"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Eroare la generarea PDF-ului",
      },
      { status: 500 }
    );
  }
}
