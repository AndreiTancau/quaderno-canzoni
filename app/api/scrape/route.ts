import { NextRequest, NextResponse } from "next/server";
import { scrapeSong, searchSongs } from "@/lib/scraper";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ─── Search mode ───
    if (body.action === "search") {
      const { query, searchType } = body;
      if (!query || typeof query !== "string" || query.trim().length < 2) {
        return NextResponse.json(
          { error: "Termenul de cautare trebuie sa aiba cel putin 2 caractere" },
          { status: 400 }
        );
      }

      const results = await searchSongs(query.trim(), searchType || "all");
      return NextResponse.json({ results });
    }

    // ─── Scrape mode (default) ───
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL-ul este obligatoriu" },
        { status: 400 }
      );
    }

    if (!url.includes("resursecrestine.ro")) {
      return NextResponse.json(
        { error: "URL-ul trebuie sa fie de pe resursecrestine.ro" },
        { status: 400 }
      );
    }

    const song = await scrapeSong(url);
    return NextResponse.json(song);
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Eroare la importul cantecului",
      },
      { status: 500 }
    );
  }
}
