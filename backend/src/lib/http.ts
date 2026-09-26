import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { isNotFound } from '../tenant/prismaForEmpresa';
import { RegraSuperadminError } from '../tenant/superadmins';

/**
 * Maps the errors company routes expect to HTTP statuses. A record of another empresa looks
 * exactly like a missing one (404), so the API never confirms that someone else's id exists.
 */
export function handleError(res: Response, error: unknown, messages: { conflict?: string; foreignKey?: string } = {}) {
  if (error instanceof RegraSuperadminError) {
    return res.status(400).json({ success: false, error: error.message });
  }
  if (isNotFound(error)) {
    return res.status(404).json({ success: false, error: 'Não encontrado' });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, error: messages.conflict ?? 'Registro duplicado' });
    }
    if (error.code === 'P2003') {
      return res.status(409).json({ success: false, error: messages.foreignKey ?? 'Referência inválida' });
    }
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ success: false, error: 'Dados inválidos' });
  }
  return res.status(500).json({ success: false, error: (error as Error).message });
}

/** Keeps only the listed fields that are present in the body (mass-assignment guard). */
export function pick<K extends string>(body: unknown, fields: readonly K[]): Partial<Record<K, any>> {
  const source = (body ?? {}) as Record<string, unknown>;
  const result: Partial<Record<K, any>> = {};
  for (const field of fields) {
    if (source[field] !== undefined) result[field] = source[field];
  }
  return result;
}

export const CAMERA_FIELDS = ['nome', 'rtsp_url', 'ativo'] as const;

export const SALA_FIELDS = [
  'nome_sala_velorio', 'slug', 'endereco', 'bairro', 'cep', 'cidade', 'estado',
  'responsavel_sala_velorio', 'whatsapp_responsavel_sala_velorio', 'google_maps_url',
] as const;

export const VELORIO_FIELDS = [
  'nome_falecido', 'data_inicio', 'data_fim', 'sala_velorio_id', 'status', 'responsavel_velorio_nome',
  'contato_whatsapp_responsavel', 'data_nascimento', 'data_falecimento', 'mensagem_homenagem',
  'data_sepultamento', 'local_sepultamento', 'google_maps_url_sepultamento', 'familiares',
] as const;

export const TEMPLATE_FIELDS = ['titulo', 'mensagem'] as const;

export const TENANT_ROLES = ['superadmin', 'admin', 'operador', 'viewer'] as const;

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isTenantRole(role: unknown): role is (typeof TENANT_ROLES)[number] {
  return typeof role === 'string' && (TENANT_ROLES as readonly string[]).includes(role);
}
