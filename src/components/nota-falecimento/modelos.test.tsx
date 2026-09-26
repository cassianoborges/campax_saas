import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { montarNota, NotaEmpresa, NotaVelorio } from '@/lib/notaFalecimento';
import { MODELOS_NOTA, modeloPorId } from './modelos';

const velorio: NotaVelorio = {
  nome_falecido: 'José da Silva',
  foto_falecido: 'data:image/png;base64,FOTO',
  data_nascimento: '1941-03-12', data_falecimento: '2026-09-25',
  data_inicio: '2026-09-26T11:00:00.000Z', data_fim: '2026-09-26T19:00:00.000Z',
  data_sepultamento: '2026-09-26T20:00:00.000Z', local_sepultamento: 'Cemitério Municipal',
  familiares: 'Deixa a esposa Maria.', token_acesso: 'ABC123', sala: { nome_sala_velorio: 'Sala 1' },
};
const empresa: NotaEmpresa = {
  nome_exibicao: 'Funerária Senap', slug: 'senap', logo_url: 'data:image/png;base64,LOGO',
  cor_primaria: '#C9A227', cor_secundaria: '#1B2A4A', whatsapp_contato: '62999990000', email_contato: null,
};
const opcoes = { incluirTransmissao: true, baseDomain: 'campax.com.br', hostAtual: 'app2.campax.com.br' };

describe.each(MODELOS_NOTA.map((m) => [m.id, m] as const))('modelo %s', (_id, modelo) => {
  const Modelo = modelo.componente;

  it('mostra foto, logo e todos os textos', () => {
    const html = renderToStaticMarkup(<Modelo dados={montarNota(velorio, empresa, opcoes)} />);
    for (const trecho of [
      'José da Silva', '12/03/1941', '25/09/2026', 'Deixa a esposa Maria.', 'Sala 1', 'Cemitério Municipal',
      'senap.campax.com.br', 'ABC123', '+55 62 99999-0000', 'base64,FOTO', 'base64,LOGO', 'width:1080px', 'height:1350px',
    ]) expect(html).toContain(trecho);
  });

  it('sem foto e sem logo: nenhuma imagem, nome da funerária em texto, nunca a logo da Campax', () => {
    const dados = montarNota({ ...velorio, foto_falecido: null }, { ...empresa, logo_url: null }, { ...opcoes, incluirTransmissao: false });
    const html = renderToStaticMarkup(<Modelo dados={dados} />);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('logo-campax');
    expect(html).toContain('Funerária Senap');
    expect(html).not.toContain('ABC123');
  });

  it('só o obrigatório: não mostra rótulos de campos vazios', () => {
    const dados = montarNota(
      { ...velorio, foto_falecido: null, data_nascimento: null, data_falecimento: null, data_sepultamento: null, local_sepultamento: null, familiares: null },
      { ...empresa, logo_url: null, whatsapp_contato: null },
      { ...opcoes, incluirTransmissao: false },
    );
    const html = renderToStaticMarkup(<Modelo dados={dados} />);
    expect(html).toContain('Velório');
    expect(html).not.toContain('Sepultamento');
    expect(html).not.toContain('Acompanhe ao vivo');
  });
});

describe.each(MODELOS_NOTA.map((m) => [m.id, m] as const))('modelo %s cheio', (_id, modelo) => {
  it('foto nunca encolhe (não fica achatada quando o texto é longo)', () => {
    const Modelo = modelo.componente;
    const dados = montarNota({ ...velorio, familiares: 'a'.repeat(400) }, empresa, opcoes);
    const html = renderToStaticMarkup(<Modelo dados={dados} />);
    const foto = /<img src="data:image\/png;base64,FOTO"[^>]*>/.exec(html)![0];
    expect(foto).toContain('flex-shrink:0');
  });
});

describe.each(MODELOS_NOTA.map((m) => [m.id, m] as const))('modelo %s com pouco texto', (_id, modelo) => {
  it('o miolo ocupa o espaço livre e fica centralizado (sem vão entre o conteúdo e o rodapé)', () => {
    const Modelo = modelo.componente;
    const dados = montarNota({ ...velorio, foto_falecido: null, familiares: 'Deixa filhos.' }, empresa, { ...opcoes, incluirTransmissao: false });
    const html = renderToStaticMarkup(<Modelo dados={dados} />);
    expect(html).toMatch(/<div data-miolo="" style="[^"]*flex:1[^"]*justify-content:center/);
    expect(html).not.toContain('margin-top:auto');
  });
});

describe('modeloPorId', () => {
  it('conhecido, desconhecido e null', () => {
    expect(modeloPorId('sereno').id).toBe('sereno');
    expect(modeloPorId('nao-existe').id).toBe('classico');
    expect(modeloPorId(null).id).toBe('classico');
    expect(MODELOS_NOTA.map((m) => m.id)).toEqual(['classico', 'sereno', 'moderno']);
  });
});
