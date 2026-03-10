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
import { getSupabase } from "@/lib/supabase";
import type { Song, SongSection, SongWithSections } from "@/lib/types";

// ─── Styles (clean layout matching CantariOltenia.pdf) ─────
const styles = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 50,
    paddingHorizontal: 50,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#000000",
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
    fontSize: 28,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 16,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  coverSubtitle: {
    fontSize: 14,
    color: "#333333",
    textAlign: "center",
    marginBottom: 40,
  },
  coverMeta: {
    fontSize: 10,
    color: "#666666",
    textAlign: "center",
  },
  // Index page
  indexTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
    textTransform: "uppercase",
  },
  indexRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#cccccc",
  },
  indexNumber: {
    fontSize: 9,
    width: 20,
    textAlign: "right",
    marginRight: 8,
  },
  indexSongTitle: {
    fontSize: 10,
    flex: 1,
  },
  indexKey: {
    fontSize: 9,
    fontWeight: "bold",
    marginLeft: 8,
    width: 30,
    textAlign: "center",
  },
  indexPage: {
    fontSize: 9,
    color: "#666666",
    width: 20,
    textAlign: "right",
  },
  // Song header
  songHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 8,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#000000",
    flex: 1,
  },
  songKey: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#000000",
    marginLeft: 12,
  },
  songAuthor: {
    fontSize: 9,
    color: "#444444",
    marginTop: 2,
  },
  // Sections
  sectionContainer: {
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 3,
  },
  contentLine: {
    fontSize: 10,
    lineHeight: 1.7,
    fontFamily: "Helvetica",
  },
  indentedLine: {
    fontSize: 10,
    lineHeight: 1.7,
    fontFamily: "Helvetica",
    paddingLeft: 20,
  },
  chordLine: {
    fontSize: 9,
    fontWeight: "bold",
    fontFamily: "Courier-Bold",
    color: "#000000",
    lineHeight: 1.3,
  },
  lyricLine: {
    fontSize: 10,
    fontFamily: "Helvetica",
    lineHeight: 1.5,
  },
  // Footer: page number centered at bottom
  footer: {
    position: "absolute",
    bottom: 25,
    left: 0,
    right: 0,
    textAlign: "center",
  },
  footerPage: {
    fontSize: 9,
    color: "#666666",
  },
});

// ─── Section label formatting (CantariOltenia style) ───────
// Refrains: "R /:" ... ":/"
// Stanzas: "1.", "2.", etc.
function formatSectionLabel(
  sectionType: string,
  sectionLabel: string,
  stanzaNumber: number
): string {
  const type = sectionType.toLowerCase();
  if (type === "ritornello" || type === "refren" || type === "chorus") {
    return "R /:";
  }
  if (type === "bridge") {
    return "Bridge:";
  }
  if (type === "intro") {
    return "Intro:";
  }
  if (type === "outro") {
    return "Outro:";
  }
  // Stanzas get numbered
  return `${stanzaNumber}.`;
}

// Check if a section is a refrain type
function isRefrainType(sectionType: string): boolean {
  const type = sectionType.toLowerCase();
  return type === "ritornello" || type === "refren" || type === "chorus";
}

// ─── Chord line parsing ────────────────────────────────────
function hasChords(line: string): boolean {
  return /\[([^\]]+)\]/.test(line);
}

function splitChordLine(line: string): { chordRow: string; lyricRow: string } {
  const regex = /\[([^\]]+)\]/g;
  const lyricParts: string[] = [];
  const chordPositions: { pos: number; chord: string }[] = [];
  let lastIndex = 0;
  let lyricLength = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    const textBefore = line.slice(lastIndex, match.index);
    lyricParts.push(textBefore);
    chordPositions.push({
      pos: lyricLength + textBefore.length,
      chord: match[1],
    });
    lyricLength += textBefore.length;
    lastIndex = match.index + match[0].length;
  }

  const remaining = line.slice(lastIndex);
  lyricParts.push(remaining);
  const lyricText = lyricParts.join("");

  let chordRow = "";
  for (const { pos, chord } of chordPositions) {
    if (chordRow.length < pos) {
      chordRow += " ".repeat(pos - chordRow.length);
    }
    chordRow += chord;
  }

  return { chordRow, lyricRow: lyricText };
}

// ─── PDF Document Component ───────────────────────────────
function SongBookDocument({ songs }: { songs: SongWithSections[] }) {
  const sortedSongs = [...songs].sort((a, b) =>
    a.title.localeCompare(b.title, "ro")
  );

  const showCover = sortedSongs.length > 1;
  const showIndex = sortedSongs.length > 1;

  // Calculate page offset for index references
  const indexPages = Math.max(1, Math.ceil(sortedSongs.length / 40));
  const songStartPage = (showCover ? 1 : 0) + (showIndex ? indexPages : 0) + 1;

  const pageFooter = React.createElement(
    View,
    { style: styles.footer, fixed: true } as Record<string, unknown>,
    React.createElement(Text, {
      style: styles.footerPage,
      render: ({ pageNumber }: { pageNumber: number }) => `${pageNumber}`,
    } as Record<string, unknown>)
  );

  return React.createElement(
    Document,
    {
      title: "Quaderno Canzoni",
      author: "Quaderno Canzoni",
    },

    // ── Cover page ──
    showCover &&
      React.createElement(
        Page,
        { size: "A4", style: styles.coverPage },
        React.createElement(
          View,
          {
            style: {
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
            },
          },
          React.createElement(
            Text,
            { style: styles.coverTitle },
            "QUADERNO CANZONI"
          ),
          React.createElement(
            Text,
            { style: styles.coverSubtitle },
            `${sortedSongs.length} canzoni`
          ),
          React.createElement(
            Text,
            { style: styles.coverMeta },
            new Date().toLocaleDateString("it-IT", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          )
        ),
        pageFooter
      ),

    // ── Index page(s) ──
    showIndex &&
      React.createElement(
        Page,
        { size: "A4", style: styles.page },
        React.createElement(Text, { style: styles.indexTitle }, "INDICE"),
        React.createElement(
          View,
          null,
          ...sortedSongs.map((song, idx) =>
            React.createElement(
              View,
              { key: song.id, style: styles.indexRow },
              React.createElement(
                Text,
                { style: styles.indexNumber },
                `${idx + 1}.`
              ),
              React.createElement(
                Text,
                { style: styles.indexSongTitle },
                song.title
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
        pageFooter
      ),

    // ── Song pages (one per song) ──
    ...sortedSongs.map((song) => {
      let stanzaCounter = 0;

      const sortedSections = [...song.sections].sort(
        (a, b) => a.position - b.position
      );

      return React.createElement(
        Page,
        { key: song.id, size: "A4", style: styles.page, wrap: true },

        // Song header: title on left, key on right, line underneath
        React.createElement(
          View,
          { style: styles.songHeaderRow },
          React.createElement(
            View,
            { style: { flex: 1 } },
            React.createElement(Text, { style: styles.songTitle }, song.title),
            song.author
              ? React.createElement(
                  Text,
                  { style: styles.songAuthor },
                  song.author + (song.album ? ` - ${song.album}` : "")
                )
              : null
          ),
          song.key
            ? React.createElement(Text, { style: styles.songKey }, song.key)
            : null
        ),

        // Sections
        ...sortedSections.map((section, sIdx) => {
          const isRefrain = isRefrainType(section.section_type);
          if (!isRefrain && section.section_type === "strofa") {
            stanzaCounter++;
          }
          const label = formatSectionLabel(
            section.section_type,
            section.section_label,
            stanzaCounter
          );

          const lines = section.content.split("\n");
          const lineElements: React.ReactNode[] = [];

          for (let li = 0; li < lines.length; li++) {
            const line = lines[li];

            if (hasChords(line)) {
              // Split into chord row + lyric row
              const { chordRow, lyricRow } = splitChordLine(line);
              lineElements.push(
                React.createElement(
                  Text,
                  {
                    key: `c-${li}`,
                    style: isRefrain
                      ? { ...styles.chordLine, paddingLeft: 30 }
                      : { ...styles.chordLine, paddingLeft: 20 },
                  },
                  chordRow
                )
              );
              lineElements.push(
                React.createElement(
                  Text,
                  {
                    key: `l-${li}`,
                    style: isRefrain
                      ? { ...styles.lyricLine, paddingLeft: 30 }
                      : { ...styles.lyricLine, paddingLeft: 20 },
                  },
                  lyricRow || " "
                )
              );
            } else {
              // Plain text line
              lineElements.push(
                React.createElement(
                  Text,
                  {
                    key: `t-${li}`,
                    style: isRefrain
                      ? { ...styles.contentLine, paddingLeft: 30 }
                      : { ...styles.indentedLine },
                  },
                  line || " "
                )
              );
            }
          }

          // For refrains, add closing ":/" marker
          if (isRefrain) {
            lineElements.push(
              React.createElement(
                Text,
                {
                  key: "refrain-close",
                  style: {
                    ...styles.contentLine,
                    paddingLeft: 30,
                    fontWeight: "bold",
                    marginTop: 2,
                  },
                },
                ":/"
              )
            );
          }

          return React.createElement(
            View,
            {
              key: section.id || `s-${sIdx}`,
              style: styles.sectionContainer,
              wrap: false,
            } as Record<string, unknown>,
            // Section label
            React.createElement(
              Text,
              { style: styles.sectionLabel },
              label
            ),
            // Content lines
            ...lineElements
          );
        }),

        // Footer: page number centered
        pageFooter
      );
    })
  );
}

// ─── API Route ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { songIds, songs: clientSongs } = body;

    if (
      (!songIds || !Array.isArray(songIds) || songIds.length === 0) &&
      (!clientSongs || !Array.isArray(clientSongs) || clientSongs.length === 0)
    ) {
      return NextResponse.json(
        { error: "Nessuna canzone selezionata" },
        { status: 400 }
      );
    }

    let songs: SongWithSections[] = [];

    // Try Supabase first
    const sb = getSupabase();
    if (sb && songIds && songIds.length > 0) {
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
    }

    // Fallback: use songs sent from client (localStorage mode)
    if (songs.length === 0 && clientSongs && Array.isArray(clientSongs)) {
      songs = clientSongs;
    }

    if (songs.length === 0) {
      return NextResponse.json(
        { error: "Nessuna canzone trovata" },
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
            : "Errore nella generazione del PDF",
      },
      { status: 500 }
    );
  }
}
