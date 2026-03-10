import { NextRequest, NextResponse } from "next/server";
import { scrapeSong } from "@/lib/scraper";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

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
