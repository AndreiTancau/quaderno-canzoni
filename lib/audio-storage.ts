/**
 * Upload an audio blob via the server-side API route.
 * The API uses the service_role key to bypass Storage RLS.
 * Returns the public URL of the uploaded file.
 */
export async function uploadAudio(songId: string, blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, `recording.${blob.type.includes("webm") ? "webm" : "ogg"}`);
  formData.append("songId", songId);

  const res = await fetch("/api/audio", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Errore upload audio");
  }

  const { audioUrl } = await res.json();
  return audioUrl;
}

/**
 * Delete an audio file via the server-side API route.
 */
export async function deleteAudio(songId: string, audioUrl: string): Promise<void> {
  const res = await fetch(
    `/api/audio?songId=${encodeURIComponent(songId)}&audioUrl=${encodeURIComponent(audioUrl)}`,
    { method: "DELETE" }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Errore eliminazione audio");
  }
}
