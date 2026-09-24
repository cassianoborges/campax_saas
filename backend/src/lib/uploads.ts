import fs from 'fs';
import path from 'path';
import multer from 'multer';

export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
// Pre-multiempresa uploads live directly in uploads/falecido-fotos/; their URLs keep working
// because /files serves the whole UPLOADS_DIR.
export const FALECIDO_FOTOS_DIR = path.join(UPLOADS_DIR, 'falecido-fotos');

/** Where an empresa's velório photos go: uploads/<empresa_id>/falecido-fotos/<velorio_id>/. */
export function falecidoFotoDir(empresaId: string, velorioId: string) {
  return path.join(UPLOADS_DIR, empresaId, 'falecido-fotos', velorioId);
}

export function falecidoFotoPublicPath(empresaId: string, velorioId: string, fileName: string) {
  return `/files/${empresaId}/falecido-fotos/${velorioId}/${fileName}`;
}

const storage = multer.diskStorage({
  // The route checks that the velório belongs to req.empresa *before* multer runs, so nothing is
  // ever written under another empresa's (or an unknown) velório.
  destination: (req, _file, cb) => {
    const dir = falecidoFotoDir(req.empresa!.id, req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `foto${ext}`);
  },
});

export const uploadFotoFalecido = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Apenas arquivos de imagem são permitidos'));
    }
    cb(null, true);
  },
});
