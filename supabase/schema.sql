-- =============================================
-- Quaderno Canzoni - Schema Database Supabase
-- Modello semplificato: solo tabella songs con campo text
-- =============================================

-- Tabella canzoni
CREATE TABLE songs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Anonim',
  key TEXT,
  text TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  audio_url TEXT,
  owner TEXT NOT NULL DEFAULT 'Andrei',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indici
CREATE INDEX idx_songs_title ON songs(title);
CREATE INDEX idx_songs_author ON songs(author);
CREATE INDEX idx_songs_key ON songs(key);

-- Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER songs_updated_at
  BEFORE UPDATE ON songs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS (Row Level Security)
-- Using anon key without auth, so allow all operations.
-- Admin/viewer distinction is enforced in the frontend.
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "songs_select" ON songs FOR SELECT USING (true);
CREATE POLICY "songs_insert" ON songs FOR INSERT WITH CHECK (true);
CREATE POLICY "songs_update" ON songs FOR UPDATE USING (true);
CREATE POLICY "songs_delete" ON songs FOR DELETE USING (true);

-- =============================================
-- Storage bucket per file audio
-- =============================================
-- Eseguire nella console Supabase o via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', true);
-- CREATE POLICY "audio_select"  ON storage.objects FOR SELECT USING (bucket_id = 'audio');
-- CREATE POLICY "audio_insert"  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'audio');
-- CREATE POLICY "audio_update"  ON storage.objects FOR UPDATE USING (bucket_id = 'audio');
-- CREATE POLICY "audio_delete"  ON storage.objects FOR DELETE USING (bucket_id = 'audio');

-- Migrazione per database esistente:
-- ALTER TABLE songs ADD COLUMN audio_url TEXT;
