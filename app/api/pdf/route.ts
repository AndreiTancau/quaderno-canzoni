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

Font.registerHyphenationCallback((word) => [word]);

const BLUE = "#1a2e6e";
const BLACK = "#000000";
const GRAY = "#555555";

function isRefrainOrChorus(line: string): boolean {
  const t = line.trim();
  return /^(R\s*\/?\s*:?|C\s*\/?\s*:?|Ritornello\b|Refren\b|Coro\b|Chorus\b)/i.test(t);
}

function isStanzaStart(line: string): boolean {
  return /^\d+\.?\s/.test(line.trim());
}

function isLikelySideNote(note: string): boolean {
  const normalized = note.trim();
  return /^(ref(?:ren)?|rit(?:ornello)?|coro|chorus|bis)\b|\bx\s*\d+\b|\b\d+\s*x\b/i.test(normalized);
}

function parseNote(line: string): { text: string; note: string | null } {
  const trimmed = line.trimEnd();
  const suffixMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (suffixMatch) {
    return { text: suffixMatch[1].trimEnd(), note: suffixMatch[2].trim() };
  }

  const prefixMatch = trimmed.match(/^\(([^)]+)\)\s*(.+)$/);
  if (prefixMatch && isLikelySideNote(prefixMatch[1])) {
    return { text: prefixMatch[2].trimEnd(), note: prefixMatch[1].trim() };
  }

  const prefixLabelMatch = trimmed.match(/^((?:ref(?:ren)?|rit(?:ornello)?|coro|chorus|bis)(?:\s*x\s*\d+|\s*\d+\s*x)?)\s*[:\-]\s*(.+)$/i);
  if (prefixLabelMatch) {
    return { text: prefixLabelMatch[2].trimEnd(), note: prefixLabelMatch[1].trim() };
  }

  return { text: trimmed, note: null };
}

interface SongLine {
  text: string;
  note: string | null;
}

interface SongBlock {
  type: "stanza" | "refrain";
  lines: SongLine[];
}

function parseSectionNoteLine(line: string): string | null {
  const match = line.trim().match(/^@note:\s*(.+)$/i);
  return match ? match[1].trim() : null;
}

function parseSongBlocks(text: string): SongBlock[] {
  const rawBlocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  const blocks: SongBlock[] = [];

  for (const raw of rawBlocks) {
    const rawLines = raw.split("\n").map((l) => l.trimEnd());
    let sectionNote: string | null = null;
    const contentLines = rawLines.filter((line) => {
      const note = parseSectionNoteLine(line);
      if (note) {
        sectionNote = note;
        return false;
      }
      return true;
    });
    const firstLine = contentLines[0]?.trim() || "";
    const lines = contentLines.map((l) => parseNote(l));

    if (sectionNote && lines[0] && !lines[0].note) {
      lines[0] = { ...lines[0], note: sectionNote };
    }

    if (isRefrainOrChorus(firstLine)) {
      blocks.push({ type: "refrain", lines });
    } else {
      blocks.push({ type: "stanza", lines });
    }
  }

  return blocks;
}

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 54,
    paddingRight: 54,
    fontFamily: "NotoSans",
    fontSize: 10,
    color: BLACK,
  },
  coverPage: {
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 65,
    fontFamily: "NotoSans",
  },
  coverTitle: {
    fontSize: 20,
    fontFamily: "NotoSans",
    fontWeight: 700,
    textAlign: "center",
    color: BLACK,
    letterSpacing: 1,
  },
  indexPage: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 54,
    paddingRight: 54,
    fontFamily: "NotoSans",
    fontSize: 9,
    color: BLACK,
  },
  indexTitle: {
    fontSize: 12,
    fontFamily: "NotoSans",
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 16,
    color: BLACK,
  },
  indexRow: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: 2,
    borderBottomWidth: 0.3,
    borderBottomColor: "#ddd",
  },
  indexNum: {
    fontSize: 8,
    width: 20,
    textAlign: "right",
    marginRight: 6,
    color: GRAY,
  },
  indexSongTitle: {
    fontSize: 9,
    fontFamily: "NotoSans",
    flex: 1,
    color: BLACK,
  },
  indexSongLink: {
    fontSize: 9,
    fontFamily: "NotoSans",
    flex: 1,
    color: BLACK,
    textDecoration: "none",
  },
  indexKey: {
    fontSize: 8,
    fontFamily: "NotoSans",
    fontWeight: 700,
    color: BLACK,
    marginLeft: 6,
    width: 40,
    textAlign: "right",
  },
  indexPageNum: {
    fontSize: 8,
    color: GRAY,
    width: 22,
    textAlign: "right",
    marginLeft: 4,
  },
  songHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  songTitle: {
    fontSize: 14,
    fontFamily: "NotoSans",
    fontWeight: 700,
    color: BLUE,
    flex: 1,
    lineHeight: 1.2,
  },
  songKey: {
    fontSize: 10,
    fontFamily: "NotoSans",
    fontWeight: 700,
    color: BLUE,
    marginLeft: 16,
    flexShrink: 0,
  },
  stanzaBlock: {
    marginBottom: 12,
  },
  stanzaLineRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  stanzaNumber: {
    fontSize: 10,
    fontFamily: "NotoSans",
    lineHeight: 1.6,
    color: BLACK,
    width: 26,
    textAlign: "right",
    marginRight: 4,
  },
  stanzaLineText: {
    fontSize: 10,
    fontFamily: "NotoSans",
    lineHeight: 1.6,
    color: BLACK,
    flex: 1,
  },
  stanzaContinuationLine: {
    fontSize: 10,
    fontFamily: "NotoSans",
    lineHeight: 1.6,
    color: BLACK,
    paddingLeft: 30,
    flex: 1,
  },
  refrainBlock: {
    marginBottom: 12,
    paddingLeft: 30,
  },
  refrainLine: {
    fontSize: 10,
    fontFamily: "NotoSans",
    fontWeight: 700,
    fontStyle: "italic",
    lineHeight: 1.6,
    color: BLACK,
    flex: 1,
  },
  refrainLineRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  noteOnSide: {
    fontSize: 7,
    fontFamily: "NotoSans",
    color: GRAY,
    flexShrink: 0,
    marginLeft: 6,
  },
  emptyLine: {
    height: 5,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    right: 54,
  },
  footerText: {
    fontSize: 8,
    color: BLACK,
  },
});

function renderStanzaBlock(block: SongBlock, blockIdx: number): React.ReactElement {
  const elements: React.ReactElement[] = [];

  block.lines.forEach((line, lineIdx) => {
    const { text: trimmed, note } = line;
    if (trimmed === "") {
      elements.push(
        React.createElement(View, { key: `e-${blockIdx}-${lineIdx}`, style: s.emptyLine })
      );
      return;
    }

    if (lineIdx === 0 && isStanzaStart(trimmed)) {
      const match = trimmed.match(/^(\d+\.?\s*)(.*)/);
      if (match) {
        elements.push(
          React.createElement(
            View,
            { key: `l-${blockIdx}-${lineIdx}`, style: s.stanzaLineRow },
            React.createElement(Text, { style: s.stanzaNumber }, match[1]),
            React.createElement(Text, { style: s.stanzaLineText }, match[2]),
            note ? React.createElement(Text, { style: s.noteOnSide }, `(${note})`) : null
          )
        );
      } else {
        elements.push(
          React.createElement(
            View,
            { key: `l-${blockIdx}-${lineIdx}`, style: s.stanzaLineRow },
            React.createElement(Text, { style: s.stanzaLineText }, trimmed),
            note ? React.createElement(Text, { style: s.noteOnSide }, `(${note})`) : null
          )
        );
      }
    } else {
      elements.push(
        React.createElement(
          View,
          { key: `l-${blockIdx}-${lineIdx}`, style: s.stanzaLineRow },
          React.createElement(Text, { style: s.stanzaContinuationLine }, trimmed),
          note ? React.createElement(Text, { style: s.noteOnSide }, `(${note})`) : null
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

function renderRefrainBlock(block: SongBlock, blockIdx: number): React.ReactElement {
  const elements: React.ReactElement[] = [];

  block.lines.forEach((line, lineIdx) => {
    const { text: trimmed, note } = line;
    if (trimmed === "") {
      elements.push(
        React.createElement(View, { key: `e-${blockIdx}-${lineIdx}`, style: s.emptyLine })
      );
      return;
    }

    elements.push(
      React.createElement(
        View,
        { key: `l-${blockIdx}-${lineIdx}`, style: s.refrainLineRow },
        React.createElement(Text, { style: s.refrainLine }, trimmed),
        note ? React.createElement(Text, { style: s.noteOnSide }, `(${note})`) : null
      )
    );
  });

  return React.createElement(
    View,
    { key: `block-${blockIdx}`, style: s.refrainBlock, wrap: false } as Record<string, unknown>,
    ...elements
  );
}

function SongBookDocument({ songs, title }: { songs: Song[]; title: string }) {
  const showCover = songs.length > 1;
  const showIndex = songs.length > 1;
  const indexPages = Math.max(1, Math.ceil(songs.length / 40));
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
    { title },

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

    showIndex &&
      React.createElement(
        Page,
        { size: "LETTER", style: s.indexPage, wrap: true },
        React.createElement(Text, { style: s.indexTitle }, "INDICE"),
        React.createElement(
          View,
          null,
          ...songs.map((song, idx) =>
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

    ...songs.map((song) => {
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
        React.createElement(
          View,
          { style: s.songHeaderRow, wrap: false } as Record<string, unknown>,
          React.createElement(Text, { style: s.songTitle }, song.title),
          song.key ? React.createElement(Text, { style: s.songKey }, song.key) : null
        ),
        ...songElements,
        pageFooter
      );
    })
  );
}

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
