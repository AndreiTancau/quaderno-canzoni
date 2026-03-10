import * as cheerio from "cheerio";
import type { ScrapedSong } from "./types";

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

  // Extract title
  const title = $(".title .titleContent").first().text().trim() || "Senza titolo";

  // Extract author and album from the dotted section links
  const blueLinks = $(".dottedSection .blueLink");
  const author = blueLinks.eq(0).text().trim() || "Anonim";
  const albumText = blueLinks.eq(1).text().trim();
  const album =
    albumText && albumText.toLowerCase() !== "fara album" ? albumText : null;

  // Parse the chord content from .stil-acorduri
  const chordEl = $(".stil-acorduri");
  let chordHtml = chordEl.html() || "";

  // Convert <a class="nice-acord" rel="G">G</a> → [G]
  // The rel attribute contains the chord name
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
  chordHtml = chordHtml
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x219;/g, "\u0219")
    .replace(/&#x21B;/g, "\u021B");

  const chordContent = chordHtml.trim();

  // Raw content = without chord markers
  const rawContent = chordContent.replace(/\[[^\]]+\]/g, "").trim();

  return { title, author, album, rawContent, chordContent };
}
