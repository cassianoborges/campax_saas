-- ============================================
-- ETERNAL STREAMS - INITIAL DATABASE SCHEMA
-- Migration: 001_initial_schema
-- Description: Creates tables for cameras, velorios, and their associations
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM for velorio status
CREATE TYPE velorio_status AS ENUM ('Agendado', 'Ao Vivo', 'Encerrado');

-- ============================================
-- CAMERAS TABLE
-- ============================================
CREATE TABLE cameras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(255) NOT NULL,
  rtsp_url TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for active cameras
CREATE INDEX idx_cameras_ativo ON cameras(ativo);

COMMENT ON TABLE cameras IS 'Armazena informações das câmeras RTSP para transmissão';
COMMENT ON COLUMN cameras.nome IS 'Nome descritivo da câmera (ex: Sala Principal - Câmera 1)';
COMMENT ON COLUMN cameras.rtsp_url IS 'URL completa do stream RTSP';
COMMENT ON COLUMN cameras.ativo IS 'Indica se a câmera está ativa e disponível para uso';

-- ============================================
-- VELORIOS TABLE
-- ============================================
CREATE TABLE velorios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_falecido VARCHAR(255) NOT NULL,
  data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
  data_fim TIMESTAMP WITH TIME ZONE NOT NULL,
  token_acesso VARCHAR(6) NOT NULL UNIQUE,
  sala_velorio VARCHAR(255) NOT NULL,
  status velorio_status DEFAULT 'Agendado',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_dates CHECK (data_fim > data_inicio),
  CONSTRAINT valid_token CHECK (LENGTH(token_acesso) = 6)
);

-- Indexes
CREATE INDEX idx_velorios_token ON velorios(token_acesso);
CREATE INDEX idx_velorios_status ON velorios(status);
CREATE INDEX idx_velorios_data_inicio ON velorios(data_inicio);

COMMENT ON TABLE velorios IS 'Armazena informações dos velórios e cerimônias';
COMMENT ON COLUMN velorios.token_acesso IS 'Token único de 6 caracteres para acesso público';
COMMENT ON COLUMN velorios.status IS 'Status calculado ou manual: Agendado, Ao Vivo, ou Encerrado';

-- ============================================
-- VELORIO_CAMERAS JUNCTION TABLE
-- ============================================
CREATE TABLE velorio_cameras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  velorio_id UUID NOT NULL REFERENCES velorios(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prevent duplicate associations
  UNIQUE(velorio_id, camera_id)
);

-- Indexes for foreign keys
CREATE INDEX idx_velorio_cameras_velorio ON velorio_cameras(velorio_id);
CREATE INDEX idx_velorio_cameras_camera ON velorio_cameras(camera_id);

COMMENT ON TABLE velorio_cameras IS 'Tabela de associação entre velórios e câmeras (many-to-many)';
COMMENT ON COLUMN velorio_cameras.ordem IS 'Ordem de exibição das câmeras na interface';

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate unique token
CREATE OR REPLACE FUNCTION generate_unique_token()
RETURNS VARCHAR(6) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  new_token VARCHAR(6);
  token_exists BOOLEAN;
BEGIN
  LOOP
    new_token := '';
    FOR i IN 1..6 LOOP
      new_token := new_token || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    SELECT EXISTS(SELECT 1 FROM velorios WHERE token_acesso = new_token) INTO token_exists;
    
    IF NOT token_exists THEN
      RETURN new_token;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_unique_token IS 'Gera um token único de 6 caracteres para acesso ao velório';

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_cameras_updated_at BEFORE UPDATE ON cameras
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_velorios_updated_at BEFORE UPDATE ON velorios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE velorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE velorio_cameras ENABLE ROW LEVEL SECURITY;

-- Public read access for cameras (only active ones)
CREATE POLICY "Public can view active cameras"
  ON cameras FOR SELECT
  USING (ativo = true);

-- Public read access for velorios (only via token)
CREATE POLICY "Public can view velorios by token"
  ON velorios FOR SELECT
  USING (true); -- Will be filtered by token in application

-- Public read access for velorio_cameras
CREATE POLICY "Public can view velorio cameras"
  ON velorio_cameras FOR SELECT
  USING (true);

-- Admin full access (authenticated users)
CREATE POLICY "Authenticated users have full access to cameras"
  ON cameras FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users have full access to velorios"
  ON velorios FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users have full access to velorio_cameras"
  ON velorio_cameras FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- SEED DATA (Optional - for testing)
-- ============================================

-- Insert sample cameras
INSERT INTO cameras (id, nome, rtsp_url) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Sala Principal - Câmera 1', 'rtsp://admin:Admin123@192.168.1.100:554/stream1'),
  ('550e8400-e29b-41d4-a716-446655440002', 'Sala Principal - Câmera 2', 'rtsp://admin:Admin123@192.168.1.101:554/stream1'),
  ('550e8400-e29b-41d4-a716-446655440003', 'Sala Ouro - Câmera 1', 'rtsp://admin:Admin123@192.168.1.102:554/stream1'),
  ('550e8400-e29b-41d4-a716-446655440004', 'Sala Prata - Câmera 1', 'rtsp://admin:Admin123@192.168.1.103:554/stream1');

-- Insert sample velorios
INSERT INTO velorios (id, nome_falecido, data_inicio, data_fim, token_acesso, sala_velorio, status) VALUES
  ('660e8400-e29b-41d4-a716-446655440001', 'João da Silva', '2025-12-12 10:00:00-03', '2025-12-13 08:00:00-03', 'AX9B4Z', 'Sala Ouro', 'Ao Vivo'),
  ('660e8400-e29b-41d4-a716-446655440002', 'Maria Santos', '2025-12-14 14:00:00-03', '2025-12-15 10:00:00-03', 'BK7C3X', 'Sala Principal', 'Agendado');

-- Associate cameras with velorios
INSERT INTO velorio_cameras (velorio_id, camera_id, ordem) VALUES
  ('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 1),
  ('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 2),
  ('660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440003', 1);
