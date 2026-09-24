import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import {
  getHomenagens,
  submitHomenagem,
  deleteHomenagem,
  SubmitHomenagem,
} from '@/services/homenagensService';

export function useHomenagens(velorio_id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['homenagens', velorio_id],
    queryFn: () => getHomenagens(velorio_id!),
    enabled: !!velorio_id,
  });

  useEffect(() => {
    if (!velorio_id) return;

    const socket = getSocket();
    const handleChanged = () => {
      queryClient.invalidateQueries({ queryKey: ['homenagens', velorio_id] });
    };

    socket.emit('homenagens:join', { velorioId: velorio_id });
    socket.on('homenagens:changed', handleChanged);

    return () => {
      socket.off('homenagens:changed', handleChanged);
    };
  }, [velorio_id, queryClient]);

  return query;
}

export function useSubmitHomenagem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SubmitHomenagem) => submitHomenagem(payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['homenagens', variables.velorio_id] });
    },
  });
}

export function useDeleteHomenagem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, velorio_id }: { id: string; velorio_id: string }) =>
      deleteHomenagem(id, velorio_id).then(() => velorio_id),
    onSuccess: (velorio_id) => {
      queryClient.invalidateQueries({ queryKey: ['homenagens', velorio_id] });
    },
  });
}
