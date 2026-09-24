import { Camera, Velorio } from '@/types/velorio';

// Mock data for development - will be replaced with Supabase
export const mockCameras: Camera[] = [
  { id: 'CAM_001', nome: 'Sala Principal - Câmera 1', rtspUrl: 'rtsp://admin:Admin123@192.168.1.100:554/stream1' },
  { id: 'CAM_002', nome: 'Sala Principal - Câmera 2', rtspUrl: 'rtsp://admin:Admin123@192.168.1.101:554/stream1' },
  { id: 'CAM_003', nome: 'Sala Ouro - Câmera 1', rtspUrl: 'rtsp://admin:Admin123@192.168.1.102:554/stream1' },
  { id: 'CAM_004', nome: 'Sala Prata - Câmera 1', rtspUrl: 'rtsp://admin:Admin123@192.168.1.103:554/stream1' },
];

export const mockVelorios: Velorio[] = [
  {
    id: 'VEL_001',
    nomeFalecido: 'João da Silva',
    dataInicio: new Date('2025-12-12T10:00:00'),
    dataFim: new Date('2025-12-13T08:00:00'),
    tokenAcesso: 'AX9B4Z',
    salaVelorio: 'Sala Ouro',
    camerasReferencia: ['CAM_001', 'CAM_002'],
    status: 'Ao Vivo',
  },
  {
    id: 'VEL_002',
    nomeFalecido: 'Maria Santos',
    dataInicio: new Date('2025-12-14T14:00:00'),
    dataFim: new Date('2025-12-15T10:00:00'),
    tokenAcesso: 'BK7C3X',
    salaVelorio: 'Sala Principal',
    camerasReferencia: ['CAM_003'],
    status: 'Agendado',
  },
];

export function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 6; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export function getVelorioStatus(velorio: Velorio): 'Agendado' | 'Ao Vivo' | 'Encerrado' {
  const now = new Date();
  if (now < velorio.dataInicio) return 'Agendado';
  if (now > velorio.dataFim) return 'Encerrado';
  return 'Ao Vivo';
}
