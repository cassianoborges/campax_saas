import { toBlob } from 'html-to-image';

// Turns a rendered death-notice template into a PNG and hands it to the user (share / download / copy).
// Browser-only; checked by hand (see the plan's Task 6).

export const LARGURA_NOTA = 1080;
export const ALTURA_NOTA = 1350;

/**
 * Downloads an image and returns it as a data URL, or null if it can't be read. Images from the backend
 * (/files) must be inlined before rendering: a cross-origin <img> would taint the canvas and make the
 * export fail. /files sends CORS headers for the panel's origins.
 */
export async function paraDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'no-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Renders `node` (a template at full size, 1080×1350) to a PNG. */
export async function gerarPng(node: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
  await Promise.all(Array.from(node.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)));
  const blob = await toBlob(node, { width: LARGURA_NOTA, height: ALTURA_NOTA, pixelRatio: 1 });
  if (!blob) throw new Error('Não foi possível gerar a imagem');
  return blob;
}

export function podeCompartilhar(arquivo: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });
}

export async function compartilhar(arquivo: File, titulo: string): Promise<void> {
  await navigator.share({ files: [arquivo], title: titulo });
}

export function baixar(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function podeCopiar(): boolean {
  return typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
}

export async function copiar(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
