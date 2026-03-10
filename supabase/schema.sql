-- =============================================
-- Quaderno Canzoni - Schema Database Supabase
-- =============================================

-- Tabella canzoni
CREATE TABLE songs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Anonim',
  album TEXT,
  key TEXT,
  source_url TEXT,
  owner TEXT NOT NULL DEFAULT 'Andrei',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabella sezioni canzoni
CREATE TABLE song_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL DEFAULT 'strofa',
  section_label TEXT NOT NULL DEFAULT 'Strofa 1',
  content TEXT NOT NULL DEFAULT '',
  chords TEXT DEFAULT '',
  position INT NOT NULL DEFAULT 0
);

-- Indici
CREATE INDEX idx_songs_title ON songs(title);
CREATE INDEX idx_songs_author ON songs(author);
CREATE INDEX idx_songs_key ON songs(key);
CREATE INDEX idx_song_sections_song_id ON song_sections(song_id);
CREATE INDEX idx_song_sections_position ON song_sections(song_id, position);

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
ALTER TABLE song_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "songs_select" ON songs FOR SELECT USING (true);
CREATE POLICY "songs_insert" ON songs FOR INSERT WITH CHECK (true);
CREATE POLICY "songs_update" ON songs FOR UPDATE USING (true);
CREATE POLICY "songs_delete" ON songs FOR DELETE USING (true);

CREATE POLICY "sections_select" ON song_sections FOR SELECT USING (true);
CREATE POLICY "sections_insert" ON song_sections FOR INSERT WITH CHECK (true);
CREATE POLICY "sections_update" ON song_sections FOR UPDATE USING (true);
CREATE POLICY "sections_delete" ON song_sections FOR DELETE USING (true);
