import { apiClient } from '@/lib/apiClient';

export interface Homenagem {
  id: string;
  velorio_id: string;
  autor_nome: string;
  parentesco: string | null;
  mensagem: string;
  created_at: string;
}

export interface SubmitHomenagem {
  velorio_id: string;
  autor_nome: string;
  parentesco?: string;
  mensagem: string;
}

export async function getHomenagens(velorio_id: string): Promise<Homenagem[]> {
  const { data } = await apiClient.get<{ data: Homenagem[] }>(`/public/velorios/${velorio_id}/homenagens`);
  return data;
}

export async function submitHomenagem(payload: SubmitHomenagem): Promise<Homenagem> {
  const { velorio_id, ...rest } = payload;
  const { data } = await apiClient.post<{ data: Homenagem }>(`/public/velorios/${velorio_id}/homenagens`, rest);
  return data;
}

export async function deleteHomenagem(id: string, velorio_id: string): Promise<void> {
  await apiClient.delete(`/velorios/${velorio_id}/homenagens/${id}`);
}
