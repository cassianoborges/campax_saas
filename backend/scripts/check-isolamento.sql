-- ============================================================================
-- Verificação de isolamento entre empresas (docs/multiempresa/09-piloto.md, "Isolamento em produção").
-- Só leitura. Cada linha do resultado é uma checagem; o esperado é problemas = 0 em todas.
-- A maioria das regras já é garantida pelo banco (FKs compostas, CHECK); estas consultas pegam o que o
-- banco não garante sozinho (vínculos de câmera) e servem de alarme caso uma regra seja removida.
--
-- Uso: scripts/check-isolamento.sh  (ou psql "$DATABASE_URL" -f backend/scripts/check-isolamento.sql)
-- ============================================================================

SELECT checagem, problemas FROM (
  SELECT 1 AS ordem, 'velório com empresa diferente da sala' AS checagem, count(*) AS problemas
    FROM velorios v JOIN sala_velorio s ON s.id = v.sala_velorio_id
   WHERE v.empresa_id <> s.empresa_id
  UNION ALL
  SELECT 2, 'câmera vinculada a sala de outra empresa', count(*)
    FROM sala_velorio_cameras sc
    JOIN sala_velorio s ON s.id = sc.sala_velorio_id
    JOIN cameras c ON c.id = sc.camera_id
   WHERE s.empresa_id <> c.empresa_id
  UNION ALL
  SELECT 3, 'câmera vinculada a velório de outra empresa', count(*)
    FROM velorio_cameras vc
    JOIN velorios v ON v.id = vc.velorio_id
    JOIN cameras c ON c.id = vc.camera_id
   WHERE v.empresa_id <> c.empresa_id
  UNION ALL
  SELECT 4, 'log de acesso com empresa diferente do velório', count(*)
    FROM velorio_access_logs l JOIN velorios v ON v.id = l.velorio_id
   WHERE l.empresa_id <> v.empresa_id
  UNION ALL
  SELECT 5, 'aceite de termos com empresa diferente do velório', count(*)
    FROM terms_acceptances t JOIN velorios v ON v.id = t.velorio_id
   WHERE t.empresa_id <> v.empresa_id
  UNION ALL
  SELECT 6, 'platform_admin com vínculo', count(*)
    FROM usuario_empresas ue JOIN profiles p ON p.id = ue.profile_id
   WHERE p.role = 'platform_admin'
  UNION ALL
  SELECT 7, 'caminho do MediaMTX sem o prefixo da empresa', count(*)
    FROM cameras c JOIN empresas e ON e.id = c.empresa_id
   WHERE c.mediamtx_path IS NOT NULL AND c.mediamtx_path NOT LIKE e.slug || '-%'
) checks
ORDER BY ordem;
