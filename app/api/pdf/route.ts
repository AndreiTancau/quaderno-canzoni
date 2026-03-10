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
import type { Song } from "@/lib/types";

// ─── Disable hyphenation (no word cutting) ─────────────────
Font.registerHyphenationCallback((word) => [word]);

// ─── Section label detection (same logic as frontend) ──────
const SECTION_PATTERNS: [RegExp, string][] = [
  [/^STROFA\s*\d*/i, "strofa"],
  [/^RITORNELLO/i, "ritornello"],
  [/^REFREN/i, "ritornello"],
  [/^CHORUS/i, "ritornello"],
  [/^BRIDGE/i, "bridge"],
  [/^PUNTE/i, "bridge"],
  [/^INTRO/i, "intro"],
  [/^OUTRO/i, "outro"],
  [/^CODA/i, "outro"],
  [/^PRE[- ]?CHORUS/i, "bridge"],
  [/^VERS\s*\d*/i, "strofa"],
  [/^\d+\.\s*$/, "strofa"],
  [/^R\s*[:\/]/i, "ritornello"],
];

function isSectionLabel(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return SECTION_PATTERNS.some(([re]) => re.test(trimmed));
}

// ─── CantariOltenia-style PDF styles ───────────────────────
const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 45,
    paddingHorizontal: 45,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#000",
  },
  // Cover
  coverPage: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: 60,
    fontFamily: "Helvetica",
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 12,
  },
  coverSubtitle: {
    fontSize: 12,
    textAlign: "center",
    color: "#666",
  },
  // Index
  indexTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 14,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  indexRow: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: 2,
    borderBottomWidth: 0.3,
    borderBottomColor: "#ddd",
  },
  indexNum: {
    fontSize: 9,
    width: 20,
    textAlign: "right",
    marginRight: 6,
    color: "#666",
  },
  indexSongTitle: {
    fontSize: 10,
    flex: 1,
  },
  indexAuthor: {
    fontSize: 8,
    color: "#888",
    marginLeft: 6,
    maxWidth: 120,
  },
  indexKey: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginLeft: 6,
    width: 30,
    textAlign: "center",
  },
  indexPage: {
    fontSize: 9,
    color: "#666",
    width: 22,
    textAlign: "right",
  },
  // Song page
  songHeader: {
    marginBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    paddingBottom: 8,
  },
  songHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  songTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    flex: 1,
  },
  songKey: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginLeft: 12,
    color: "#333",
  },
  songAuthor: {
    fontSize: 9,
    color: "#666",
    marginTop: 3,
  },
  // Song text
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#555",
    marginTop: 10,
    marginBottom: 3,
  },
  songLine: {
    fontSize: 10,
    lineHeight: 1.55,
    fontFamily: "Helvetica",
  },
  songLineEmpty: {
    height: 6,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 22,
    left: 0,
    right: 0,
    textAlign: "center",
  },
  footerText: {
    fontSize: 8,
    color: "#999",
  },
});

// ─── PDF Document ──────────────────────────────────────────
function SongBookDocument({ songs }: { songs: Song[] }) {
  const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title, "ro"));
  const showCover = sorted.length > 1;
  const showIndex = sorted.length > 1;
  const indexPages = Math.max(1, Math.ceil(sorted.length / 45));
  const songStartPage = (showCover ? 1 : 0) + (showIndex ? indexPages : 0) + 1;

  const pageFooter = React.createElement(
    View,
    { style: s.footer, fixed: true } as Record<string, unknown>,
    React.createElement(Text, {
      style: s.footerText,
      render: ({ pageNumber }: { pageNumber: number }) => `${pageNumber}`,
    } as Record<string, unknown>)
  );

  return React.createElement(
    Document,
    { title: "Quaderno Canzoni" },

    // Cover page
    showCover &&
      React.createElement(
        Page,
        { size: "A4", style: s.coverPage },
        React.createElement(
          View,
          { style: { flex: 1, justifyContent: "center", alignItems: "center" } },
          React.createElement(Text, { style: s.coverTitle }, "Quaderno Canzoni"),
          React.createElement(Text, { style: s.coverSubtitle }, `${sorted.length} canzoni`)
        ),
        pageFooter
      ),

    // Index page
    showIndex &&
      React.createElement(
        Page,
        { size: "A4", style: s.page, wrap: true },
        React.createElement(Text, { style: s.indexTitle }, "Indice"),
        React.createElement(
          View,
          null,
          ...sorted.map((song, idx) =>
            React.createElement(
              View,
              { key: song.id, style: s.indexRow, wrap: false } as Record<string, unknown>,
              React.createElement(Text, { style: s.indexNum }, `${idx + 1}.`),
              React.createElement(Text, { style: s.indexSongTitle }, song.title),
              React.createElement(Text, { style: s.indexAuthor }, song.author),
              song.key
                ? React.createElement(Text, { style: s.indexKey }, song.key)
                : null,
              React.createElement(Text, { style: s.indexPage }, String(songStartPage + idx))
            )
          )
        ),
        pageFooter
      ),

    // Song pages (one per song, wraps to multiple pages if needed)
    ...sorted.map((song) => {
      const lines = song.text.split("\n");
      const elements: React.ReactElement[] = [];

      lines.forEach((line, i) => {
        const trimmed = line.trim();

        if (trimmed === "") {
          elements.push(
            React.createElement(View, { key: `e-${i}`, style: s.songLineEmpty })
          );
        } else if (isSectionLabel(trimmed)) {
          elements.push(
            React.createElement(Text, { key: `s-${i}`, style: s.sectionLabel }, trimmed)
          );
        } else {
          elements.push(
            React.createElement(Text, { key: `l-${i}`, style: s.songLine }, line)
          );
        }
      });

      return React.createElement(
        Page,
        { key: song.id, size: "A4", style: s.page, wrap: true },
        // Song header
        React.createElement(
          View,
          { style: s.songHeader, wrap: false } as Record<string, unknown>,
          React.createElement(
            View,
            { style: s.songHeaderRow },
            React.createElement(Text, { style: s.songTitle }, song.title),
            song.key ? React.createElement(Text, { style: s.songKey }, song.key) : null
          ),
          song.author
            ? React.createElement(Text, { style: s.songAuthor }, song.author)
            : null
        ),
        // Song text
        ...elements,
        pageFooter
      );
    })
  );
}

// ─── API Route ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { songs } = body;

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return NextResponse.json(
        { error: "Nessuna canzone selezionata" },
        { status: 400 }
      );
    }

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
      { error: error instanceof Error ? error.message : "Errore nella generazione del PDF" },
      { status: 500 }
    );
  }
}
