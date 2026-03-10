import * as cheerio from "cheerio";
import type { ScrapedSong } from "./types";

export interface SearchResult {
  url: string;
  title: string;
  author: string;
  type: "acorduri" | "cantece";
}

/**
 * Search resursecrestine.ro for songs.
 * Uses the URL pattern: /cauta/{query}/{type}/{field}
 * type: 1 = Acorduri (with chords), 2 = Cantece (lyrics only)
 */
export async function searchSongs(
  query: string,
  searchType: "all" | "acorduri" | "cantece" = "all"
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  const types =
    searchType === "all"
      ? [
          { id: "1", label: "acorduri" as const },
          { id: "2", label: "cantece" as const },
        ]
      : searchType === "acorduri"
        ? [{ id: "1", label: "acorduri" as const }]
        : [{ id: "2", label: "cantece" as const }];

  for (const t of types) {
    try {
      const url = `https://www.resursecrestine.ro/cauta/${encodeURIComponent(query)}/${t.id}/titlu`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });

      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      $(".listingLeft").each((_, el) => {
        const linkEl = $(el).find(".listingTitleLink");
        const href = linkEl.attr("href");
        const title = linkEl.text().trim();
        const author = $(el).find(".brownLink").first().text().trim() || "Anonim";

        if (href && title) {
          results.push({
            url: href,
            title,
            author,
            type: t.label,
          });
        }
      });
    } catch (err) {
      console.error(`Search error for type ${t.label}:`, err);
    }
  }

  return results;
}

/**
 * Scrape a song from resursecrestine.ro.
 * Supports both /acorduri/ (with chords) and /cantece/ (lyrics-only) pages.
 */
export async function scrapeSong(url: string): Promise<ScrapedSong> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Detect page type
  const isAcorduriPage = url.includes("/acorduri/") || $(".stil-acorduri").length > 0;

  // Extract title
  const title =
    $(".titleContent").first().text().trim() ||
    $(".title .titleContent").first().text().trim() ||
    "Fara titlu";

  // Extract author and album from the dotted section
  const dottedSection = $(".dottedSection").first();
  let author = "Anonim";
  let album: string | null = null;

  if (isAcorduriPage) {
    // /acorduri/ pages: links are in order (author, album)
    const blueLinks = dottedSection.find(".blueLink");
    author = blueLinks.eq(0).text().trim() || "Anonim";
    const albumText = blueLinks.eq(1).text().trim();
    album =
      albumText && albumText.toLowerCase() !== "fara album" ? albumText : null;
  } else {
    // /cantece/ pages: parse by label text
    const dottedHtml = dottedSection.html() || "";

    // Author: text after "Autor:" followed by a blueLink
    const authorMatch = dottedHtml.match(
      /Autor:\s*<a[^>]*class="blueLink"[^>]*>\s*([\s\S]*?)\s*<\/a>/i
    );
    if (authorMatch) {
      author = authorMatch[1].trim() || "Anonim";
    }

    // Album: text after "Album:" followed by a blueLink
    const albumMatch = dottedHtml.match(
      /Album:\s*<a[^>]*class="blueLink"[^>]*>\s*([\s\S]*?)\s*<\/a>/i
    );
    if (albumMatch) {
      const albumText = albumMatch[1].trim();
      album =
        albumText && albumText.toLowerCase() !== "fara album"
          ? albumText
          : null;
    }
  }

  let chordContent: string;
  let rawContent: string;

  if (isAcorduriPage) {
    // ─── /acorduri/ pages: extract chords + lyrics from .stil-acorduri ───
    const chordEl = $(".stil-acorduri");
    let chordHtml = chordEl.html() || "";

    // Convert <a class="nice-acord" rel="G">G</a> → [G]
    chordHtml = chordHtml.replace(
      /<a[^>]*class="nice-acord"[^>]*rel="([^"]*)"[^>]*>[^<]*<\/a>/gi,
      "[$1]"
    );

    // Convert line breaks to newlines
    chordHtml = chordHtml.replace(/<br\s*\/?>/gi, "\n");

    // Convert &nbsp; to spaces
    chordHtml = chordHtml.replace(/&nbsp;/gi, " ");

    // Remove remaining HTML tags
    chordHtml = chordHtml.replace(/<[^>]+>/g, "");

    // Decode HTML entities
    chordHtml = decodeEntities(chordHtml);

    chordContent = chordHtml.trim();
    rawContent = chordContent.replace(/\[[^\]]+\]/g, "").trim();
  } else {
    // ─── /cantece/ pages: extract structured lyrics from strofa divs ───
    const strofaEls = $(".slides.carousel-mode .strofa");

    if (strofaEls.length > 0) {
      // Structured lyrics with section labels
      const sections: string[] = [];

      strofaEls.each((_, el) => {
        const label = $(el).find(".strofa-label").text().trim();
        let text = $(el).find(".strofa-text").html() || "";

        // Convert <br> to newlines
        text = text.replace(/<br\s*\/?>/gi, "\n");
        text = text.replace(/<[^>]+>/g, "");
        text = decodeEntities(text).trim();

        if (label && text) {
          // Convert Romanian section labels to our marker format
          const normalizedLabel = label.toLowerCase();
          let marker = "";
          if (normalizedLabel.startsWith("refren")) {
            marker = "R: ";
          } else if (normalizedLabel.startsWith("strof")) {
            // Extract number from "Strofă 1", "Strofă 2", etc.
            const num = label.match(/\d+/);
            marker = num ? `${num[0]}. ` : "";
          } else if (normalizedLabel.startsWith("bridge") || normalizedLabel.startsWith("punte")) {
            marker = "Bridge: ";
          } else if (normalizedLabel.startsWith("intro")) {
            marker = "Intro: ";
          } else if (normalizedLabel.startsWith("outro") || normalizedLabel.startsWith("final")) {
            marker = "Outro: ";
          }

          sections.push(`${marker}${text}`);
        }
      });

      chordContent = sections.join("\n\n");
      rawContent = chordContent;
    } else {
      // Fallback: plain text from resized-text div
      let textHtml = $(".resized-text").html() || "";
      textHtml = textHtml.replace(/<br\s*\/?>/gi, "\n");
      textHtml = textHtml.replace(/<[^>]+>/g, "");
      textHtml = decodeEntities(textHtml).trim();

      chordContent = textHtml;
      rawContent = textHtml;
    }
  }

  return { title, author, album, rawContent, chordContent };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x219;/g, "\u0219") // ș
    .replace(/&#x21B;/g, "\u021B") // ț
    .replace(/&nbsp;/g, " ");
}
