import * as cheerio from "cheerio";
import type { ScrapedSong, SearchResult } from "./types";

/**
 * Search resursecrestine.ro for songs.
 * URL pattern: /cauta/{query}/{type}/{field}
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
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
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
          results.push({ url: href, title, author, type: t.label });
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
 * Supports both /acorduri/ and /cantece/ pages.
 * Always returns plain lyrics text (chords are stripped).
 */
export async function scrapeSong(url: string): Promise<ScrapedSong> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const isAcorduriPage = url.includes("/acorduri/") || $(".stil-acorduri").length > 0;

  // Title
  const title =
    $(".titleContent").first().text().trim() ||
    $(".title .titleContent").first().text().trim() ||
    "Fara titlu";

  // Author & album
  const dottedSection = $(".dottedSection").first();
  let author = "Anonim";
  let album: string | null = null;

  if (isAcorduriPage) {
    const blueLinks = dottedSection.find(".blueLink");
    author = blueLinks.eq(0).text().trim() || "Anonim";
    const albumText = blueLinks.eq(1).text().trim();
    album = albumText && albumText.toLowerCase() !== "fara album" ? albumText : null;
  } else {
    const dottedHtml = dottedSection.html() || "";
    const authorMatch = dottedHtml.match(/Autor:\s*<a[^>]*class="blueLink"[^>]*>\s*([\s\S]*?)\s*<\/a>/i);
    if (authorMatch) author = authorMatch[1].trim() || "Anonim";
    const albumMatch = dottedHtml.match(/Album:\s*<a[^>]*class="blueLink"[^>]*>\s*([\s\S]*?)\s*<\/a>/i);
    if (albumMatch) {
      const albumText = albumMatch[1].trim();
      album = albumText && albumText.toLowerCase() !== "fara album" ? albumText : null;
    }
  }

  let text: string;

  if (isAcorduriPage) {
    // /acorduri/ pages: get text from .stil-acorduri and strip chord tags
    const chordEl = $(".stil-acorduri");
    let content = chordEl.html() || "";

    // Remove chord tags entirely (they're <a class="nice-acord"> tags)
    content = content.replace(/<a[^>]*class="nice-acord"[^>]*>[^<]*<\/a>/gi, "");
    content = content.replace(/<br\s*\/?>/gi, "\n");
    content = content.replace(/&nbsp;/gi, " ");
    content = content.replace(/<[^>]+>/g, "");
    content = decodeEntities(content);

    // Clean up: remove excessive blank lines, trim each line
    text = cleanLyrics(content);
  } else {
    // /cantece/ pages: structured lyrics from strofa divs
    const strofaEls = $(".slides.carousel-mode .strofa");

    if (strofaEls.length > 0) {
      const sections: string[] = [];

      strofaEls.each((_, el) => {
        const label = $(el).find(".strofa-label").text().trim();
        let sText = $(el).find(".strofa-text").html() || "";
        sText = sText.replace(/<br\s*\/?>/gi, "\n");
        sText = sText.replace(/<[^>]+>/g, "");
        sText = decodeEntities(sText).trim();

        if (label && sText) {
          const normalizedLabel = label.toLowerCase();
          let marker = "";
          if (normalizedLabel.startsWith("refren") || normalizedLabel.startsWith("ref")) {
            marker = "R /: ";
          } else if (normalizedLabel.startsWith("strof")) {
            const num = label.match(/\d+/);
            marker = num ? `${num[0]}. ` : "";
          } else if (normalizedLabel.startsWith("chorus") || normalizedLabel.startsWith("cor")) {
            marker = "C /: ";
          } else if (normalizedLabel.startsWith("bridge") || normalizedLabel.startsWith("punte")) {
            marker = "Bridge: ";
          } else if (normalizedLabel.startsWith("intro")) {
            marker = "Intro: ";
          } else if (normalizedLabel.startsWith("outro") || normalizedLabel.startsWith("final")) {
            marker = "Outro: ";
          }

          // Add closing :/ for refrains/choruses
          const needsClose = marker.includes("/:");
          sections.push(marker + sText + (needsClose ? " :/" : ""));
        }
      });

      text = sections.join("\n");
    } else {
      // Fallback: plain text
      let content = $(".resized-text").html() || "";
      content = content.replace(/<br\s*\/?>/gi, "\n");
      content = content.replace(/<[^>]+>/g, "");
      content = decodeEntities(content).trim();
      text = cleanLyrics(content);
    }
  }

  return { title, author, album, text };
}

function cleanLyrics(raw: string): string {
  return raw
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x219;/g, "\u0219")
    .replace(/&#x21B;/g, "\u021B")
    .replace(/&nbsp;/g, " ");
}
