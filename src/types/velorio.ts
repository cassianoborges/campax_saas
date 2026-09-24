export interface Camera {
  id: string;
  nome: string;
  rtspUrl: string;
}

export interface Velorio {
  id: string;
  nomeFalecido: string;
  dataInicio: Date;
  dataFim: Date;
  tokenAcesso: string;
  salaVelorio: string;
  camerasReferencia: string[];
  status: 'Agendado' | 'Ao Vivo' | 'Encerrado';
}

export type VelorioFormData = Omit<Velorio, 'id' | 'tokenAcesso' | 'status'>;

export type CameraFormData = Omit<Camera, 'id'>;
