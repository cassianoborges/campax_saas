import { apiClient } from '@/lib/apiClient';

export async function uploadFotoFalecido(velorioId: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const { url } = await apiClient.post<{ url: string }>(`/velorios/${velorioId}/foto`, formData);
  return url;
}
