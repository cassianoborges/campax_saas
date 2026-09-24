import { describe, expect, it } from 'vitest';
import { generatePathName, MANAGED_PATH } from '../src/paths';
import { planSync, CameraToSync } from '../src/plan';

const cam = (id: string, path: string, rtsp = `rtsp://cam-${id}.example.com/x`): CameraToSync => ({ id, rtsp_url: rtsp, mediamtx_path: path });

describe('generatePathName', () => {
    it('prefixa o slug da empresa e termina com 10 caracteres aleatórios', () => {
        const name = generatePathName('funeraria-sao-jose');
        expect(name).toMatch(/^funeraria-sao-jose-[a-z0-9]{10}$/);
        expect(MANAGED_PATH.test(name)).toBe(true);
    });

    it('gera nomes diferentes a cada chamada', () => {
        const names = new Set(Array.from({ length: 200 }, () => generatePathName('campax')));
        expect(names.size).toBe(200);
    });

    it('nomes antigos e configurações manuais não são "gerenciados"', () => {
        for (const legacy of ['santana', 'uruacu2', 'sala_anapolis', 'all_others', 'campax-curto']) {
            expect(MANAGED_PATH.test(legacy), legacy).toBe(false);
        }
    });
});

describe('planSync', () => {
    const a = cam('a', 'campax-aaaaaaaaaa');
    const b = cam('b', 'outra-bbbbbbbbbb');

    it('câmera nova → adicionar', () => {
        expect(planSync([a], [])).toEqual({ add: [a], updateSource: [], remove: [] });
    });

    it('nada muda quando tudo bate', () => {
        expect(planSync([a], [{ name: a.mediamtx_path, source: a.rtsp_url }])).toEqual({ add: [], updateSource: [], remove: [] });
    });

    it('rtsp_url alterado → atualizar o source (bug antigo: era ignorado)', () => {
        const plan = planSync([a], [{ name: a.mediamtx_path, source: 'rtsp://antigo.example.com/x' }]);
        expect(plan.updateSource).toEqual([a]);
        expect(plan.add).toEqual([]);
    });

    it('câmera desativada ou de empresa suspensa (fora da lista) → remover o caminho', () => {
        const plan = planSync([a], [
            { name: a.mediamtx_path, source: a.rtsp_url },
            { name: b.mediamtx_path, source: b.rtsp_url },
        ]);
        expect(plan.remove).toEqual([b.mediamtx_path]);
    });

    it('all_others e nomes fora do padrão nunca são removidos', () => {
        const plan = planSync([], [{ name: 'all_others' }, { name: 'santana', source: 'rtsp://x' }, { name: 'config-manual' }]);
        expect(plan.remove).toEqual([]);
    });

    it('sem câmeras ativas, remove todos os caminhos gerenciados (comportamento intencional)', () => {
        const plan = planSync([], [{ name: a.mediamtx_path }, { name: b.mediamtx_path }, { name: 'all_others' }]);
        expect(plan.remove.sort()).toEqual([a.mediamtx_path, b.mediamtx_path].sort());
    });

    it('câmera com nome antigo ainda funciona até a troca (não é adicionada de novo nem removida)', () => {
        const legado = cam('l', 'santana');
        expect(planSync([legado], [{ name: 'santana', source: legado.rtsp_url }])).toEqual({ add: [], updateSource: [], remove: [] });
    });
});

import { blockedReason, rtspHost } from '../src/hostGuard';

describe('hostGuard', () => {
    it('extrai o host mesmo com @ na senha', () => {
        expect(rtspHost('rtsp://admin:a@b@203.0.113.5:554/x')).toBe('203.0.113.5');
    });

    it.each(['rtsp://127.0.0.1:5432/x', 'rtsp://10.0.0.1/x', 'rtsp://[::1]/x', 'rtsp://169.254.169.254/x'])('bloqueia %s', async (url) => {
        expect(await blockedReason(url)).toMatch(/endereço interno/);
    });

    it('libera IP público', async () => {
        expect(await blockedReason('rtsp://203.0.113.5/x')).toBeNull();
    });
});
