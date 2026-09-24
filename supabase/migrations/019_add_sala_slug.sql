-- ============================================
-- CAMPAX - SLUG DA SALA DE VELÓRIO
-- Migration: 019_add_sala_slug
-- Description: Adiciona um slug URL-safe a sala_velorio, usado no link
--   público fixo por sala (/:hashEmpresa/:salaSlug). Gerado a partir do
--   nome existente, com backfill para as salas já cadastradas.
-- ============================================

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE sala_velorio ADD COLUMN slug VARCHAR(255);

-- Backfill: minúsculas, sem acento, não-alfanumérico vira "_"
UPDATE sala_velorio
SET slug = regexp_replace(
             regexp_replace(lower(unaccent(nome_sala_velorio)), '[^a-z0-9]+', '_', 'g'),
             '(^_+|_+$)', '', 'g'
           );

-- Resolve colisão entre salas com nomes que geram o mesmo slug
UPDATE sala_velorio sv
SET slug = sv.slug || '_' || substr(sv.id::text, 1, 4)
WHERE EXISTS (
  SELECT 1 FROM sala_velorio sv2
  WHERE sv2.slug = sv.slug AND sv2.id <> sv.id
);

ALTER TABLE sala_velorio
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT sala_velorio_slug_unique UNIQUE (slug);

COMMENT ON COLUMN sala_velorio.slug IS 'Identificador amigável para URL pública (ex: sala_uruacu), gerado a partir do nome, editável no admin';
