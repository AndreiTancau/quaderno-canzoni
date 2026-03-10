import { NextRequest, NextResponse } from "next/server";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Link,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Song } from "@/lib/types";

// ─── Register Noto Sans (supports Romanian diacritics: ț, ă, î, ș, â) ──
Font.register({
  family: "NotoSans",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d.ttf",
      fontWeight: 400,
      fontStyle: "normal",
    },
    {
      src: "https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyAaBN9d.ttf",
      fontWeight: 700,
      fontStyle: "normal",
    },
    {
      src: "https://fonts.gstatic.com/s/notosans/v42/o-0kIpQlx3QUlC5A4PNr4C5OaxRsfNNlKbCePevHtVtX57DGjDU1QDce6Vc.ttf",
      fontWeight: 400,
      fontStyle: "italic",
    },
    {
      src: "https://fonts.gstatic.com/s/notosans/v42/o-0kIpQlx3QUlC5A4PNr4C5OaxRsfNNlKbCePevHtVtX57DGjDU1QNAZ6Vc.ttf",
      fontWeight: 700,
      fontStyle: "italic",
    },
  ],
});

// ─── Disable hyphenation (no word cutting) ─────────────────
Font.registerHyphenationCallback((word) => [word]);

// ─── Colors ────────────────────────────────────────────────
const BLUE = "#1a2e6e";       // dark navy blue for titles & keys
const BLACK = "#000000";
const GRAY = "#555555";

// ─── Section detection ─────────────────────────────────────
function isRefrainOrChorus(line: string): boolean {
  const t = line.trim();
  return /^(R\s*\/?\s*:?|C\s*\/?\s*:?|Ritornello\b|Refren\b|Coro\b|Chorus\b)/i.test(t);
}

function isStanzaStart(line: string): boolean {
  return /^\d+\.?\s/.test(line.trim());
}

// ─── Parse song text into structured blocks ────────────────
interface SongBlock {
  type: "stanza" | "refrain";
  lines: string[];
}

function parseSongBlocks(text: string): SongBlock[] {
  const rawBlocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  const blocks: SongBlock[] = [];

  for (const raw of rawBlocks) {
    const lines = raw.split("\n").map((l) => l.trimEnd());
    const firstLine = lines[0]?.trim() || "";

    if (isRefrainOrChorus(firstLine)) {
      blocks.push({ type: "refrain", lines });
    } else {
      blocks.push({ type: "stanza", lines });
    }
  }

  return blocks;
}

// ─── Styles (matching reference image exactly) ─────────────
const s = StyleSheet.create({
  // Song pages
  page: {
    paddingTop: 60,
    paddingBottom: 60,
    paddingLeft: 65,
    paddingRight: 65,
    fontFamily: "NotoSans",
    fontSize: 13,
    color: BLACK,
  },
  // Cover
  coverPage: {
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 65,
    fontFamily: "NotoSans",
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: "NotoSans",
    fontWeight: 700,
    textAlign: "center",
    color: BLACK,
    letterSpacing: 1,
  },
  // Index
  indexPage: {
    paddingTop: 60,
    paddingBottom: 60,
    paddingLeft: 65,
    paddingRight: 65,
    fontFamily: "NotoSans",
    fontSize: 11,
    color: BLACK,
  },
  indexTitle: {
    fontSize: 16,
    fontFamily: "NotoSans",
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
    fontFamily: "NotoSans",
    flex: 1,
    color: BLACK,
  },
  indexSongLink: {
    fontSize: 11,
    fontFamily: "NotoSans",
    flex: 1,
    color: BLACK,
    textDecoration: "none",
  },
  indexKey: {
    fontSize: 10,
    fontFamily: "NotoSans",
    fontWeight: 700,
    color: BLACK,
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
    marginBottom: 36,
  },
  songTitle: {
    fontSize: 20,
    fontFamily: "NotoSans",
    fontWeight: 700,
    color: BLUE,
    flex: 1,
    lineHeight: 1.2,
  },
  songKey: {
    fontSize: 13,
    fontFamily: "NotoSans",
    fontWeight: 700,
    color: BLUE,
    marginLeft: 20,
    flexShrink: 0,
  },
  // Stanza block
  stanzaBlock: {
    marginBottom: 18,
  },
  // Stanza first line (with number like "1. Cel Minunat, Salvatorul,")
  stanzaFirstLine: {
    fontSize: 13,
    fontFamily: "NotoSans",
    lineHeight: 1.7,
    color: BLACK,
    paddingLeft: 22,
    textIndent: -22,
  },
  // Stanza continuation lines (indented under the text, not the number)
  stanzaContinuationLine: {
    fontSize: 13,
    fontFamily: "NotoSans",
    lineHeight: 1.7,
    color: BLACK,
    paddingLeft: 22,
  },
  // Refrain/Chorus block - bold italic, centered
  refrainBlock: {
    marginBottom: 18,
    alignItems: "center",
  },
  refrainLine: {
    fontSize: 13,
    fontFamily: "NotoSans",
    fontWeight: 700,
    fontStyle: "italic",
    lineHeight: 1.7,
    color: BLACK,
    textAlign: "center",
  },
  // Empty line spacer
  emptyLine: {
    height: 8,
  },
  // Footer (page number bottom-right)
  footer: {
    position: "absolute",
    bottom: 30,
    right: 65,
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
      // Continuation lines - indented to align with text after number
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

// ─── Render a refrain/chorus block (bold italic, centered) ─
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

    elements.push(
      React.createElement(
        Text,
        { key: `l-${blockIdx}-${lineIdx}`, style: s.refrainLine },
        trimmed
      )
    );
  });

  return React.createElement(
    View,
    { key: `block-${blockIdx}`, style: s.refrainBlock, wrap: false } as Record<string, unknown>,
    ...elements
  );
}

// ─── PDF Document ──────────────────────────────────────────
function SongBookDocument({ songs, title }: { songs: Song[]; title: string }) {
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
    { title: title },

    // Cover page
    showCover &&
      React.createElement(
        Page,
        { size: "LETTER", style: s.coverPage },
        React.createElement(
          View,
          { style: { flex: 1, justifyContent: "center", alignItems: "center" } },
          React.createElement(Text, { style: s.coverTitle }, title.toUpperCase())
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
              React.createElement(
                Link,
                { src: `#song-${song.id}`, style: s.indexSongLink } as Record<string, unknown>,
                song.title
              ),
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
        if (block.type === "refrain") {
          songElements.push(renderRefrainBlock(block, blockIdx));
        } else {
          songElements.push(renderStanzaBlock(block, blockIdx));
        }
      });

      return React.createElement(
        Page,
        { key: song.id, id: `song-${song.id}`, size: "LETTER", style: s.page, wrap: true } as Record<string, unknown>,
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
    const { songs, title } = body;

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return NextResponse.json(
        { error: "Nessuna canzone selezionata" },
        { status: 400 }
      );
    }

    const pdfTitle = typeof title === "string" && title.trim() ? title.trim() : "Quaderno Canzoni";
    const doc = React.createElement(SongBookDocument, { songs, title: pdfTitle });
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
