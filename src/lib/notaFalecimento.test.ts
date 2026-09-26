import { describe, expect, it } from 'vitest';
import {
  COR_PRIMARIA_PADRAO, COR_SECUNDARIA_PADRAO, montarNota, nomeArquivoNota, notaCompacta, NotaEmpresa, NotaVelorio,
  tamanhoFamiliares, tamanhoNome,
} from './notaFalecimento';

const velorio: NotaVelorio = {
  nome_falecido: 'José da Silva',
  foto_falecido: 'https://backend.campax.com.br/files/falecido-fotos/x.jpg',
  data_nascimento: '1941-03-12T00:00:00.000Z',
  data_falecimento: '2026-09-25T00:00:00.000Z',
  data_inicio: '2026-09-26T11:00:00.000Z', // 08:00 em São Paulo (sábado)
  data_fim: '2026-09-26T19:30:00.000Z',    // 16:30
  data_sepultamento: '2026-09-26T20:00:00.000Z',
  local_sepultamento: 'Cemitério Municipal',
  familiares: 'Deixa a esposa Maria e os filhos João e Ana.',
  token_acesso: 'ABC123',
  sala: { nome_sala_velorio: 'Sala 1' },
};
const empresa: NotaEmpresa = {
  nome_exibicao: 'Senap', slug: 'senap', logo_url: 'https://backend.campax.com.br/files/logos/senap.png',
  cor_primaria: '#C9A227', cor_secundaria: '#1B2A4A', whatsapp_contato: '62999990000', email_contato: 'contato@senap.com.br',
};
const opcoes = { incluirTransmissao: false, baseDomain: 'campax.com.br', hostAtual: 'app2.campax.com.br' };

describe('montarNota', () => {
  it('monta todos os campos', () => {
    const nota = montarNota(velorio, empresa, opcoes);
    expect(nota.nome).toBe('José da Silva');
    expect(nota.fotoUrl).toBe(velorio.foto_falecido);
    expect(nota.nascimento).toBe('12/03/1941');
    expect(nota.falecimento).toBe('25/09/2026');
    expect(nota.velorio).toEqual({ sala: 'Sala 1', quando: '26/09 (sábado), das 8h às 16h30' });
    expect(nota.sepultamento).toEqual({ quando: '26/09 (sábado), às 17h', local: 'Cemitério Municipal' });
    expect(nota.familiares).toBe('Deixa a esposa Maria e os filhos João e Ana.');
    expect(nota.transmissao).toBeNull();
    expect(nota.empresa).toMatchObject({
      nome: 'Senap', logoUrl: empresa.logo_url, contato: '+55 62 99999-0000', corPrimaria: '#C9A227', corSecundaria: '#1B2A4A',
    });
    expect(nota.empresa.textoSobreSecundaria).toBe('hsl(40 30% 95%)');
  });

  it('datas só-dia não mudam de dia com o fuso', () => {
    const nota = montarNota({ ...velorio, data_nascimento: '1941-03-12', data_falecimento: '2026-09-25T00:00:00.000Z' }, empresa, opcoes);
    expect(nota.nascimento).toBe('12/03/1941');
    expect(nota.falecimento).toBe('25/09/2026');
  });

  it('velório que termina em outro dia', () => {
    const nota = montarNota({ ...velorio, data_inicio: '2026-09-26T11:00:00.000Z', data_fim: '2026-09-27T13:00:00.000Z' }, empresa, opcoes);
    expect(nota.velorio!.quando).toBe('26/09, 8h, a 27/09, 10h');
  });

  it('campos vazios viram null', () => {
    const nota = montarNota(
      { ...velorio, foto_falecido: null, data_nascimento: null, data_falecimento: '', data_sepultamento: null, local_sepultamento: '  ', familiares: '  ', sala: null },
      { ...empresa, logo_url: null, whatsapp_contato: null, email_contato: null },
      opcoes,
    );
    expect(nota).toMatchObject({ fotoUrl: null, nascimento: null, falecimento: null, sepultamento: null, familiares: null });
    expect(nota.velorio).toEqual({ sala: '', quando: '26/09 (sábado), das 8h às 16h30' });
    expect(nota.empresa.logoUrl).toBeNull();
    expect(nota.empresa.contato).toBeNull();
  });

  it('sepultamento só com local ou só com data', () => {
    expect(montarNota({ ...velorio, data_sepultamento: null }, empresa, opcoes).sepultamento).toEqual({ quando: null, local: 'Cemitério Municipal' });
    expect(montarNota({ ...velorio, local_sepultamento: null }, empresa, opcoes).sepultamento).toEqual({ quando: '26/09 (sábado), às 17h', local: null });
  });

  it('transmissão com subdomínio e sem', () => {
    expect(montarNota(velorio, empresa, { ...opcoes, incluirTransmissao: true }).transmissao).toEqual({ endereco: 'senap.campax.com.br', codigo: 'ABC123' });
    expect(montarNota(velorio, empresa, { ...opcoes, incluirTransmissao: true, baseDomain: '' }).transmissao).toEqual({ endereco: 'app2.campax.com.br', codigo: 'ABC123' });
  });

  it('cores nulas ou inválidas caem no padrão Campax', () => {
    for (const cor of [null, 'azul', '#FFF']) {
      const nota = montarNota(velorio, { ...empresa, cor_primaria: cor, cor_secundaria: cor }, opcoes);
      expect(nota.empresa.corPrimaria).toBe(COR_PRIMARIA_PADRAO);
      expect(nota.empresa.corSecundaria).toBe(COR_SECUNDARIA_PADRAO);
    }
  });

  it('contato: WhatsApp, senão e-mail', () => {
    expect(montarNota(velorio, { ...empresa, whatsapp_contato: null }, opcoes).empresa.contato).toBe('contato@senap.com.br');
  });
});

describe('tamanhos e nome do arquivo', () => {
  it('nome encolhe conforme o tamanho', () => {
    expect(tamanhoNome('José da Silva')).toBe(84);
    expect(tamanhoNome('Maria Aparecida dos Santos')).toBe(72);
    expect(tamanhoNome('Maria Aparecida dos Santos Oliveira Pereira')).toBe(52);
    expect(tamanhoNome('x'.repeat(33))).toBe(60);
  });

  it('familiares encolhe conforme o tamanho', () => {
    expect(tamanhoFamiliares(null)).toBe(32);
    expect(tamanhoFamiliares('a'.repeat(150))).toBe(32);
    expect(tamanhoFamiliares('a'.repeat(280))).toBe(28);
    expect(tamanhoFamiliares('a'.repeat(400))).toBe(24);
  });

  it('nome do arquivo sem acentos nem espaços', () => {
    expect(nomeArquivoNota('José da Silva Júnior')).toBe('nota-falecimento-jose-da-silva-junior.png');
    expect(nomeArquivoNota('  ')).toBe('nota-falecimento.png');
  });
});

describe('notaCompacta', () => {
  it('nota com pouco texto não é compacta', () => {
    expect(notaCompacta(montarNota(velorio, empresa, opcoes))).toBe(false);
    expect(notaCompacta(montarNota(velorio, empresa, { ...opcoes, incluirTransmissao: true }))).toBe(false);
  });

  it('familiares longos deixam a nota compacta', () => {
    expect(notaCompacta(montarNota({ ...velorio, familiares: 'a'.repeat(200) }, empresa, opcoes))).toBe(true);
  });

  it('familiares médios com sepultamento e transmissão deixam a nota compacta', () => {
    const cheia = montarNota({ ...velorio, familiares: 'a'.repeat(120) }, empresa, { ...opcoes, incluirTransmissao: true });
    expect(notaCompacta(cheia)).toBe(true);
    expect(notaCompacta({ ...cheia, sepultamento: null })).toBe(false);
  });
});
