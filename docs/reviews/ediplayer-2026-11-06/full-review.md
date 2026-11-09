# EdiPlayer: full review (06/11/2026)

Quatro revisões independentes do branch `feat/ediplayer`, cada uma sem ver as conclusões das outras: segurança e integridade de arquivos, motor de mídia (com FFmpeg real e clipes sintéticos), interface e estado, e integração com a suíte. Cada achado foi conferido no código antes de corrigir. Nada foi publicado e nada foi provisionado no Stripe.

## Achados graves e correções

| Achado | Correção | Prova |
| --- | --- | --- |
| Corte sem perda de MKV com B-frames (OBS) sempre falhava: a busca do FFmpeg voltava um GOP | Corte pela lista do concat demuxer com `inpoint` no quadro-chave e `outpoint` meio quadro antes do fim | Integração: MKV x264 veryfast GOP 2 s, dois trechos, duração certa |
| Arquivos que não começam em 0 (TS de câmera) cortavam no lugar errado | Quadros-chave relativos ao `start_time`; pontos de corte na linha do tempo do arquivo | Integração: MPEG-TS com início em 1,445 s |
| Vários cortes acumulavam dessincronia (até −331 ms em 4 trechos) | Som cortado por `atrim` com precisão de amostra e codificado em AAC 192k para durar exatamente o mesmo que cada trecho de imagem | Medido com cliques de áudio: estável em ±50 ms, sem acumular; integração: imagem e som terminam juntos (±0,1 s) |
| Publicar a suíte 0.5.0 falharia: o publicador lia o release 0.4.2 (6 apps) com o esquema que exigia 7 | Leitores tolerantes (`suiteIdSchema`); completude só no publicador (`assertCompleteRelease`) | `compatibility.test.ts`: release antigo e futuro aceitos; incompleto recusado na publicação |
| Clientes 0.4.2 perderiam o acesso quando o portal passasse a assinar licenças com `ediplayer` | `since: "0.5.0"` no catálogo; o servidor assina só as ferramentas que a versão do cliente conhece | `license.test.ts`: cliente 0.4.2 não recebe o EdiPlayer, 0.5.0 recebe |
| Apertar E recarregava o vídeo do início e o punha para tocar (a posição salva era perdida) | Um único Stage montado no mesmo lugar nos dois layouts | Jornada nativa: posição 6 s e pausado depois de E |
| O fallback de reprodução nunca chegava à prévia convertida | Nível de fallback explícito (0, 1, 2) em `player:open` | Leitura do código |
| Trocar de arquivo deixava o anterior tocando sob "Abrindo" e gravava a posição errada | Vídeo descarregado (`pause`, `removeAttribute("src")`, `load()`), tempo zerado e posição só gravada fora do carregamento | Leitura do código |
| "Salvar GIF" mudava escondido o modo de corte, que valia depois para o vídeo | O GIF usa os trechos marcados sem mexer no modo | Leitura do código |
| Aparar um MP3 como "Original" gerava MP3 recodificado dentro de `.mkv` | Arquivo só de som é cortado por cópia no próprio formato (ou MP3) | Integração: MP3 aparado continua MP3 |
| Recorte desenhado sobre a imagem girada ou espelhada não batia com o exportado | Enquanto recorta, a prévia mostra a imagem sem giro nem espelho (o recorte vem antes) | Leitura do código |

## Achados médios e baixos corrigidos

- **Segurança:**
  - `shell:showItem` não aguardava a checagem de permissão; passou a aguardar.
  - A proteção do original passou a comparar a identidade no disco (volume e id do arquivo) e cobre o som novo e a legenda.
  - Os trabalhos rodam sobre os caminhos canônicos.
  - Dividir não sobrescreve arquivos existentes, e o nome-base é validado como nome de arquivo simples.
  - O caminho no filtro `subtitles` usa escape em dois níveis; pastas `D'Avila` e `x',[a];b` foram testadas.
  - A janela bloqueia navegação, novas janelas e permissões (exceto tela cheia).
  - CSP com `ws://localhost:*` e `form-action 'none'`.
  - `-protocol_whitelist file,pipe` em todas as entradas do FFmpeg.
- **Motor de mídia:**
  - O trabalho de fundo (miniaturas, folha de quadros, onda, quadros-chave) espera a vez em vez de fazer exportações falharem por limite de processos.
  - A folha de quadros e as miniaturas são geradas uma vez por arquivo, sem corrida.
  - VP8 vai para a prévia.
  - Trocar o som usa duração explícita (o `-shortest` passava até 10 s).
  - Normalizar com som trocado e vários trechos não falha mais.
  - Juntar ignora trilhas de dados e timecode.
  - A onda é calculada em fluxo, sem acumular o áudio inteiro na memória.
- **Arquivos e cache:**
  - O cache saiu do perfil Roaming (`%LOCALAPPDATA%\EdiPlayer\cache`).
  - "Limpar recentes" apaga o cache, e o limite é aplicado depois de cada salvamento.
- **Interface:**
  - Retomar usa a posição desta sessão.
  - Trocar a faixa de áudio mantém a posição e não entra no desfazer.
  - Os arquivos para juntar e o diálogo Salvar são limpos ao trocar de vídeo.
  - O menu de legenda mostra a faixa carregada.
  - Sair do miniplayer devolve o "Sempre no topo" escolhido.
  - O som funciona no modo de desenvolvimento (um grafo de áudio por elemento).
  - Os atalhos continuam depois de usar o volume ou um menu.
  - Trocar de vídeo com edições pede confirmação; arquivos vindos de fora durante uma edição só entram na lista.
  - A onda cobre clipes curtos.
  - Um passo de desfazer por arrasto de slider.
  - I sempre começa um trecho novo.
  - Salvar fica bloqueado quando nada sobra, com mensagem em português.
  - A repetição A–B é desligada ao editar.
  - A fila pode ser recolhida e some no miniplayer.
  - Tela cheia com controles.
  - `aria-pressed` nos botões de alternar.
  - O texto secundário passa no contraste AA.
  - O aviso fica sempre montado para leitores de tela.
- **Suíte:**
  - A lista de nomes não usa mais `Intl.ListFormat`, que falta em navegadores antigos.
  - A frase do portal que errava o gênero foi reescrita.
  - O portal ganhou os limites do EdiPlayer.
  - A jornada nativa sempre confere a duração.
  - O teste de paridade com o banco compara conjuntos.
- **"Abrir com":** o registro foi retirado do instalador. As associações do electron-builder sobrescrevem o padrão sem backup, deixam extensões quebradas ao desinstalar e incluíam `.ts`/`.mts`.

## Verificação

| Gate | Resultado |
| --- | --- |
| `apps/ediplayer` unitários + integração com FFmpeg real | 29/29, com os casos novos: B-frames, início deslocado, quatro cortes, som curto, normalizar com som trocado, VP8, timecode, MP3, pastas com aspas, link físico, divisão sobre arquivos existentes |
| Typecheck e testes dos pacotes tocados (turbo) | 19/19 tarefas (config, edi-contracts 21, edi-licensing 14, edi-releases, edi-desktop, db, portal, edi-hub, informach-site, ediplayer) |
| Ferramental da suíte | 72/72; typecheck limpo |
| Harness nativo `pnpm edi:test:native ediplayer` | Passou, com a jornada (posição mantida ao entrar na edição, corte de 15 s, original intacto) |
| Biome | Sem erros |

## Pendências conhecidas

- **Hubs 0.4.x:** precisam reinstalar uma vez para ler o release 0.5.0. As licenças deles continuam válidas, sem o EdiPlayer.
- **Descrição do produto no Stripe:** continua dizendo "Cinco ferramentas". O script só define a descrição na criação; é preciso atualizar no painel do Stripe ou acrescentar esse caminho ao script.
- **"Abrir com" pelo instalador:** precisa de um include NSIS próprio (OpenWithProgids e SupportedTypes, sem mudar o padrão), verificado com um instalador real.
- **Instalador com o bundle `native-media` 9.0.2:** não verificado. Os testes usaram o FFmpeg 6.1.1 de desenvolvimento.
- **Corte sem perda:** o som é recodificado em AAC 192k, e um WebM cortado sai como MKV.
- **Juntar por cópia:** acumula algumas dezenas de milissegundos por arquivo quando o som de cada um é um pouco mais longo que a imagem.
- **Ainda não tratados:** a moldura de recorte e as alças da régua continuam só com o mouse; com o teclado, I e O substituem as alças. A legenda sobreposta é recalculada a cada quadro.
