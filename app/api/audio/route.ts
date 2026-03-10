import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "audio";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/audio - Upload audio file for a song
 * Body: FormData with "file" (audio blob) and "songId" (string)
 */
export async function POST(request: NextRequest) {
  try {
    const sb = getServiceClient();
    if (!sb) {
      return NextResponse.json({ error: "Supabase non configurato" }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const songId = formData.get("songId") as string | null;

    if (!file || !songId) {
      return NextResponse.json({ error: "file e songId richiesti" }, { status: 400 });
    }

    const ext = file.type.includes("webm") ? "webm" : file.type.includes("mp4") ? "m4a" : "ogg";
    const path = `${songId}.${ext}`;

    // Remove old file first (ignore errors)
    await sb.storage.from(BUCKET).remove([path]);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: "Errore upload" }, { status: 500 });
    }

    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    const audioUrl = `${data.publicUrl}?t=${Date.now()}`;

    // Update the song record
    const { error: dbError } = await sb
      .from("songs")
      .update({ audio_url: audioUrl })
      .eq("id", songId);

    if (dbError) {
      console.error("DB update error:", dbError);
      return NextResponse.json({ error: "Errore aggiornamento DB" }, { status: 500 });
    }

    return NextResponse.json({ audioUrl });
  } catch (err) {
    console.error("Audio upload error:", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/audio?songId=xxx&audioUrl=xxx - Delete audio file for a song
 */
export async function DELETE(request: NextRequest) {
  try {
    const sb = getServiceClient();
    if (!sb) {
      return NextResponse.json({ error: "Supabase non configurato" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const songId = searchParams.get("songId");
    const audioUrl = searchParams.get("audioUrl");

    if (!songId || !audioUrl) {
      return NextResponse.json({ error: "songId e audioUrl richiesti" }, { status: 400 });
    }

    // Extract file path from the public URL
    const match = audioUrl.match(/\/audio\/(.+?)(\?|$)/);
    if (match) {
      await sb.storage.from(BUCKET).remove([match[1]]);
    }

    // Clear audio_url in DB
    const { error: dbError } = await sb
      .from("songs")
      .update({ audio_url: null })
      .eq("id", songId);

    if (dbError) {
      console.error("DB update error:", dbError);
      return NextResponse.json({ error: "Errore aggiornamento DB" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Audio delete error:", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
