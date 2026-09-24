# Campax — Primeiros passos da funerária

Bem-vindo à Campax. Este roteiro leva você do primeiro acesso até a primeira transmissão.
Leva uns 30 minutos, mais o tempo de configurar o roteador das câmeras.

**Painel:** https://app2.campax.com.br/admin · **Suporte Campax:** WhatsApp _(informado no contrato)_

---

## 1. Primeiro acesso

1. Entre no painel com o e-mail e a senha inicial que a Campax enviou.
2. Em **Usuários**, abra o seu usuário e defina uma senha nova (a senha inicial foi vista por outras pessoas).
3. Ainda em **Usuários**, crie as contas da equipe. Cada pessoa com o próprio login; não compartilhe senhas.

| Papel | O que pode fazer |
|-------|------------------|
| **Superadmin** | Tudo, inclusive gerenciar usuários |
| **Admin** | Tudo, menos usuários (inclui excluir registros e editar o banco de homenagens) |
| **Operador** | Cadastrar e editar câmeras, salas e velórios (o dia a dia) |
| **Visualizador** | Só consultar, inclusive os relatórios |

## 2. Preparar as câmeras (com o técnico de rede)

A Campax busca a imagem das câmeras pela internet. Para isso:

1. **Libere a câmera para a Campax no roteador:** redirecione uma porta externa para a porta RTSP da câmera (normalmente
   554). **Permita só o IP da Campax, `2.29.41.124`**, como origem; ninguém mais precisa acessar essa porta.
2. **Configure o vídeo da câmera em H.264** (não H.265/HEVC). Com H.265 a transmissão não abre em boa parte dos
   celulares e computadores das famílias. Sugestão: 1280x720 ou 1920x1080, 15 a 25 quadros por segundo, 2 a 4 Mbps,
   intervalo de quadro-chave de 2 segundos. Um pouco de áudio ambiente é opcional.
3. **Anote o endereço RTSP completo.** Exemplos:
   - Intelbras / Dahua: `rtsp://usuario:senha@SEU_IP_OU_DOMINIO:PORTA/cam/realmonitor?channel=1&subtype=0`
   - Hikvision: `rtsp://usuario:senha@SEU_IP_OU_DOMINIO:PORTA/Streaming/Channels/101`

   Use o IP público fixo da funerária ou um domínio (DDNS). Crie na câmera um usuário só de visualização para a Campax,
   em vez de usar o administrador.

## 3. Cadastrar as câmeras

1. **Câmeras → Nova câmera**: nome (ex.: "Sala 1 — Frontal") e o endereço RTSP.
2. Ao abrir a tela, o sistema testa cada câmera: **Online** quer dizer que a Campax alcançou a porta da câmera, com o
   horário do teste. **Offline**: confira o redirecionamento no roteador e se a câmera está ligada.
3. Clique no ícone de vídeo da câmera para ver a imagem. Se aparecer "codecs not supported", a câmera ainda está em
   H.265 (passo 2.2).

Endereços da rede interna (192.168.x.x, 10.x.x.x etc.) não são aceitos: a Campax não enxerga a rede da funerária,
só o que está liberado pela internet.

## 4. Cadastrar as salas

1. **Salas → Nova sala**: nome, endereço, responsável e WhatsApp do responsável, e as câmeras dessa sala.
2. Cada sala ganha um **link fixo** (botão **Copiar**). Ele mostra sempre o velório que está acontecendo na sala, ou o
   próximo. Dá para imprimir como QR code na entrada da sala ou mandar para a família; o link não muda de um velório para
   outro.

## 5. Cadastrar um velório

1. **Velórios → Novo velório**: nome do falecido, sala, início e fim, dados do responsável, datas de nascimento e
   falecimento, foto e mensagem de homenagem (pode usar o **banco de homenagens**).
2. Ao escolher a sala, o formulário mostra se as câmeras dela estão online.
3. Ao salvar, o sistema gera um **token de 6 caracteres**. Use o botão de **compartilhar** para mandar à família pelo
   WhatsApp o link com o token.

**Quando a família consegue assistir:** do **início** ao **fim** cadastrados. Antes do início, o link avisa que o
velório ainda não começou (com a data e a hora); depois do fim, avisa que foi encerrado. Se o velório atrasar ou se
estender, **edite o horário de início ou de fim**. Quem já estiver assistindo tem uma tolerância de 30 minutos depois
do fim antes de o vídeo parar de reconectar.

## 6. Durante e depois do velório

- Os visitantes se identificam (nome e celular) e aceitam os termos de uso antes de assistir.
- Na página do velório eles veem a transmissão, quantas pessoas estão assistindo e o **mural de homenagens** em tempo
  real.
- Em **Relatórios**: acessos por velório, visitantes identificados e o histórico de velórios criados, com quem criou.

## 7. Antes do primeiro velório de verdade: ensaio

Com a Campax acompanhando:

1. Crie um velório de teste começando agora, na sala real.
2. Abra pelo celular, usando o link com o token **e** pelo link fixo da sala.
3. Confira a imagem, registre uma homenagem e veja se ela aparece no mural.
4. Confira o relatório de acessos. Depois, exclua o velório de teste.

## Problemas comuns

| Sintoma | O que fazer |
|---------|-------------|
| Câmera **Offline** | Roteador (redirecionamento e liberação do IP `2.29.41.124`), câmera ligada, IP público da funerária mudou (use DDNS) |
| Câmera Online, mas o vídeo não abre | Câmera em H.265: mude para H.264. Confira usuário e senha no endereço RTSP |
| "Token inválido" para a família | Confira o token (6 caracteres, letras e números) |
| "Velório ainda não começou" ou "Velório encerrado" | O acesso vale do início ao fim cadastrados: ajuste os horários do velório |
| Esqueci a senha | Outro superadmin da funerária define uma nova em **Usuários**; se não houver, fale com o suporte Campax |
