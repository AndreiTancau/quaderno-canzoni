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

// ─── Register Noto Serif (supports Romanian diacritics: ț, ă, î, ș, â) ──
Font.register({
  family: "NotoSerif",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/notoserif/v33/ga6iaw1J5X9T9RW6j9bNVls-hfgvz8JcMofYTa32J4wsL2JAlAhZqFCjwA.ttf",
      fontWeight: 400,
      fontStyle: "normal",
    },
    {
      src: "https://fonts.gstatic.com/s/notoserif/v33/ga6iaw1J5X9T9RW6j9bNVls-hfgvz8JcMofYTa32J4wsL2JAlAhZT1ejwA.ttf",
      fontWeight: 700,
      fontStyle: "normal",
    },
    {
      src: "https://fonts.gstatic.com/s/notoserif/v33/ga6saw1J5X9T9RW6j9bNfFIMZhhWnFTyNZIQD1-_FXP0RgnaOg9MYBNLg8cP.ttf",
      fontWeight: 400,
      fontStyle: "italic",
    },
    {
      src: "https://fonts.gstatic.com/s/notoserif/v33/ga6saw1J5X9T9RW6j9bNfFIMZhhWnFTyNZIQD1-_FXP0RgnaOg9MYBOshMcP.ttf",
      fontWeight: 700,
      fontStyle: "italic",
    },
  ],
});

// ─── Disable hyphenation (no word cutting) ─────────────────
Font.registerHyphenationCallback((word) => [word]);

// ─── Colors (matching CantariOltenia) ──────────────────────
const BLUE = "#1a2e6e";      // dark navy blue for titles & keys
const BLACK = "#1a1a1a";     // near-black for body text
const GRAY = "#666666";      // muted for page numbers

// ─── Section detection ─────────────────────────────────────
// Detects refrain/chorus lines: "R /:", "R:", "C /:", "C:", "Ritornello", "Coro", etc.
function isRefrainLine(line: string): boolean {
  const t = line.trim();
  return /^(R\s*\/?:?|Ritornello\b|Refren\b)/i.test(t);
}

function isChorusLine(line: string): boolean {
  const t = line.trim();
  return /^(C\s*\/?:?|Coro\b|Chorus\b)/i.test(t);
}

function isStanzaStart(line: string): boolean {
  return /^\d+\.?\s/.test(line.trim());
}

// ─── Parse song text into structured blocks ────────────────
interface SongBlock {
  type: "stanza" | "refrain" | "chorus";
  lines: string[];
}

function parseSongBlocks(text: string): SongBlock[] {
  const rawBlocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  const blocks: SongBlock[] = [];

  for (const raw of rawBlocks) {
    const lines = raw.split("\n").map((l) => l.trimEnd());
    const firstLine = lines[0]?.trim() || "";

    if (isRefrainLine(firstLine) || isChorusLine(firstLine)) {
      blocks.push({ type: isChorusLine(firstLine) ? "chorus" : "refrain", lines });
    } else {
      blocks.push({ type: "stanza", lines });
    }
  }

  return blocks;
}

// ─── CantariOltenia-style PDF styles ───────────────────────
const s = StyleSheet.create({
  // Song pages
  page: {
    paddingTop: 50,
    paddingBottom: 50,
    paddingLeft: 55,
    paddingRight: 55,
    fontFamily: "NotoSerif",
    fontSize: 13,
    color: BLACK,
  },
  // Cover
  coverPage: {
    paddingTop: 50,
    paddingBottom: 50,
    paddingHorizontal: 60,
    fontFamily: "NotoSerif",
  },
  coverTitle: {
    fontSize: 26,
    fontFamily: "NotoSerif",
    fontWeight: 700,
    textAlign: "center",
    color: BLACK,
    letterSpacing: 1,
  },
  // Index
  indexPage: {
    paddingTop: 50,
    paddingBottom: 50,
    paddingLeft: 55,
    paddingRight: 55,
    fontFamily: "NotoSerif",
    fontSize: 11,
    color: BLACK,
  },
  indexTitle: {
    fontSize: 16,
    fontFamily: "NotoSerif",
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 20,
    color: BLACK,
  },
  indexRow: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: 2.5,
    borderBottomWidth: 0.3,
    borderBottomColor: "#ddd",
  },
  indexNum: {
    fontSize: 10,
    width: 22,
    textAlign: "right",
    marginRight: 8,
    color: GRAY,
  },
  indexSongTitle: {
    fontSize: 11,
    fontFamily: "NotoSerif",
    flex: 1,
  },
  indexKey: {
    fontSize: 10,
    fontFamily: "NotoSerif",
    fontWeight: 700,
    color: BLUE,
    marginLeft: 8,
    width: 45,
    textAlign: "right",
  },
  indexPageNum: {
    fontSize: 10,
    color: GRAY,
    width: 24,
    textAlign: "right",
    marginLeft: 6,
  },
  // Song header
  songHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  songTitle: {
    fontSize: 18,
    fontFamily: "NotoSerif",
    fontWeight: 700,
    color: BLUE,
    flex: 1,
    lineHeight: 1.2,
  },
  songKey: {
    fontSize: 14,
    fontFamily: "NotoSerif",
    fontWeight: 700,
    color: BLUE,
    marginLeft: 16,
    flexShrink: 0,
  },
  // Stanza block
  stanzaBlock: {
    marginBottom: 14,
  },
  // Stanza first line (with number like "1. Text here")
  stanzaFirstLine: {
    fontSize: 13,
    fontFamily: "NotoSerif",
    lineHeight: 1.6,
    color: BLACK,
    paddingLeft: 16,
    textIndent: -16,
  },
  // Stanza continuation lines (indented under first line)
  stanzaContinuationLine: {
    fontSize: 13,
    fontFamily: "NotoSerif",
    lineHeight: 1.6,
    color: BLACK,
    paddingLeft: 30,
  },
  // Refrain/Chorus block - bold italic, indented
  refrainBlock: {
    marginBottom: 14,
    paddingLeft: 28,
  },
  refrainLine: {
    fontSize: 13,
    fontFamily: "NotoSerif",
    fontWeight: 700,
    fontStyle: "italic",
    lineHeight: 1.6,
    color: BLACK,
    paddingLeft: 20,
    textIndent: -20,
  },
  refrainContinuationLine: {
    fontSize: 13,
    fontFamily: "NotoSerif",
    fontWeight: 700,
    fontStyle: "italic",
    lineHeight: 1.6,
    color: BLACK,
    paddingLeft: 36,
  },
  // Empty line spacer
  emptyLine: {
    height: 8,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    right: 55,
  },
  footerText: {
    fontSize: 11,
    color: BLACK,
  },
});

// ─── Render a stanza block ─────────────────────────────────
function renderStanzaBlock(block: SongBlock, blockIdx: number): React.ReactElement {
  const elements: React.ReactElement[] = [];

  block.lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();
    if (trimmed === "") {
      elements.push(
        React.createElement(View, { key: `e-${blockIdx}-${lineIdx}`, style: s.emptyLine })
      );
      return;
    }

    if (lineIdx === 0 && isStanzaStart(trimmed)) {
      // First line with stanza number - hanging indent
      elements.push(
        React.createElement(
          Text,
          { key: `l-${blockIdx}-${lineIdx}`, style: s.stanzaFirstLine },
          trimmed
        )
      );
    } else {
      // Continuation lines - indented
      elements.push(
        React.createElement(
          Text,
          { key: `l-${blockIdx}-${lineIdx}`, style: s.stanzaContinuationLine },
          trimmed
        )
      );
    }
  });

  return React.createElement(
    View,
    { key: `block-${blockIdx}`, style: s.stanzaBlock, wrap: false } as Record<string, unknown>,
    ...elements
  );
}

// ─── Render a refrain/chorus block ─────────────────────────
function renderRefrainBlock(block: SongBlock, blockIdx: number): React.ReactElement {
  const elements: React.ReactElement[] = [];

  block.lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();
    if (trimmed === "") {
      elements.push(
        React.createElement(View, { key: `e-${blockIdx}-${lineIdx}`, style: s.emptyLine })
      );
      return;
    }

    if (lineIdx === 0) {
      // First line (with R /: or C /: prefix) - hanging indent
      elements.push(
        React.createElement(
          Text,
          { key: `l-${blockIdx}-${lineIdx}`, style: s.refrainLine },
          trimmed
        )
      );
    } else {
      // Continuation lines - extra indent
      elements.push(
        React.createElement(
          Text,
          { key: `l-${blockIdx}-${lineIdx}`, style: s.refrainContinuationLine },
          trimmed
        )
      );
    }
  });

  return React.createElement(
    View,
    { key: `block-${blockIdx}`, style: s.refrainBlock, wrap: false } as Record<string, unknown>,
    ...elements
  );
}

// ─── PDF Document ──────────────────────────────────────────
function SongBookDocument({ songs }: { songs: Song[] }) {
  const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title, "ro"));
  const showCover = sorted.length > 1;
  const showIndex = sorted.length > 1;
  const indexPages = Math.max(1, Math.ceil(sorted.length / 40));
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
        { size: "LETTER", style: s.coverPage },
        React.createElement(
          View,
          { style: { flex: 1, justifyContent: "center", alignItems: "center" } },
          React.createElement(Text, { style: s.coverTitle }, "QUADERNO CANZONI")
        ),
        pageFooter
      ),

    // Index page
    showIndex &&
      React.createElement(
        Page,
        { size: "LETTER", style: s.indexPage, wrap: true },
        React.createElement(Text, { style: s.indexTitle }, "INDICE"),
        React.createElement(
          View,
          null,
          ...sorted.map((song, idx) =>
            React.createElement(
              View,
              { key: song.id, style: s.indexRow, wrap: false } as Record<string, unknown>,
              React.createElement(Text, { style: s.indexNum }, `${idx + 1}.`),
              React.createElement(Text, { style: s.indexSongTitle }, song.title),
              song.key
                ? React.createElement(Text, { style: s.indexKey }, song.key)
                : null,
              React.createElement(Text, { style: s.indexPageNum }, String(songStartPage + idx))
            )
          )
        ),
        pageFooter
      ),

    // Song pages
    ...sorted.map((song) => {
      const blocks = parseSongBlocks(song.text);

      const songElements: React.ReactElement[] = [];

      blocks.forEach((block, blockIdx) => {
        if (block.type === "refrain" || block.type === "chorus") {
          songElements.push(renderRefrainBlock(block, blockIdx));
        } else {
          songElements.push(renderStanzaBlock(block, blockIdx));
        }
      });

      return React.createElement(
        Page,
        { key: song.id, size: "LETTER", style: s.page, wrap: true },
        // Song header: title left, key right
        React.createElement(
          View,
          { style: s.songHeaderRow, wrap: false } as Record<string, unknown>,
          React.createElement(Text, { style: s.songTitle }, song.title),
          song.key ? React.createElement(Text, { style: s.songKey }, song.key) : null
        ),
        // Song body
        ...songElements,
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
