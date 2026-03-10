import { NextRequest, NextResponse } from "next/server";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Song } from "@/lib/types";

// ─── Styles matching CantariOltenia.pdf ────────────────────
const s = StyleSheet.create({
  page: {
    paddingTop: 45,
    paddingBottom: 50,
    paddingHorizontal: 50,
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
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 40,
  },
  // Index
  indexTitle: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    textTransform: "uppercase",
  },
  indexRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
  },
  indexNum: {
    fontSize: 9,
    width: 22,
    textAlign: "right",
    marginRight: 6,
  },
  indexSongTitle: {
    fontSize: 10,
    flex: 1,
  },
  indexKey: {
    fontSize: 9,
    fontWeight: "bold",
    marginLeft: 8,
    width: 35,
    textAlign: "center",
  },
  indexPage: {
    fontSize: 9,
    color: "#666",
    width: 20,
    textAlign: "right",
  },
  // Song page
  songHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  songTitle: {
    fontSize: 14,
    fontWeight: "bold",
    flex: 1,
  },
  songKey: {
    fontSize: 12,
    fontWeight: "bold",
    marginLeft: 12,
  },
  songLine: {
    fontSize: 10,
    lineHeight: 1.6,
    fontFamily: "Helvetica",
  },
  songLineEmpty: {
    fontSize: 10,
    lineHeight: 1.6,
    height: 8,
  },
  // Page number footer
  footer: {
    position: "absolute",
    bottom: 25,
    left: 0,
    right: 0,
    textAlign: "center",
  },
  footerText: {
    fontSize: 9,
    color: "#666",
  },
});

// ─── PDF Document ──────────────────────────────────────────
function SongBookDocument({ songs }: { songs: Song[] }) {
  const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title, "ro"));
  const showCover = sorted.length > 1;
  const showIndex = sorted.length > 1;
  const indexPages = Math.max(1, Math.ceil(sorted.length / 42));
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

    // Cover
    showCover &&
      React.createElement(
        Page,
        { size: "A4", style: s.coverPage },
        React.createElement(
          View,
          { style: { flex: 1, justifyContent: "center", alignItems: "center" } },
          React.createElement(Text, { style: s.coverTitle }, "QUADERNO CANZONI")
        ),
        pageFooter
      ),

    // Index
    showIndex &&
      React.createElement(
        Page,
        { size: "A4", style: s.page },
        React.createElement(Text, { style: s.indexTitle }, "INDICE"),
        React.createElement(
          View,
          null,
          ...sorted.map((song, idx) =>
            React.createElement(
              View,
              { key: song.id, style: s.indexRow },
              React.createElement(Text, { style: s.indexNum }, `${idx + 1}.`),
              React.createElement(Text, { style: s.indexSongTitle }, song.title),
              song.key
                ? React.createElement(Text, { style: s.indexKey }, song.key)
                : null,
              React.createElement(Text, { style: s.indexPage }, String(songStartPage + idx))
            )
          )
        ),
        pageFooter
      ),

    // Song pages (one per song)
    ...sorted.map((song) =>
      React.createElement(
        Page,
        { key: song.id, size: "A4", style: s.page, wrap: true },
        // Header: title + key
        React.createElement(
          View,
          { style: s.songHeaderRow },
          React.createElement(Text, { style: s.songTitle }, song.title),
          song.key ? React.createElement(Text, { style: s.songKey }, song.key) : null
        ),
        // Text lines
        ...song.text.split("\n").map((line, i) =>
          React.createElement(
            Text,
            { key: `l-${i}`, style: line.trim() === "" ? s.songLineEmpty : s.songLine },
            line || " "
          )
        ),
        pageFooter
      )
    )
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
