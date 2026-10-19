# EdiFoto

Editor simples para criar imagens, combinar fotos, textos e formas, recortar e exportar. Professores orientam as decisões de facilidade de uso; nomes e funcionalidades atendem qualquer pessoa. A meta é substituir o Photoshop nas tarefas cotidianas escolhidas, sem reproduzir sua complexidade profissional.

Implementação e aceite em [PLANO-DE-IMPLEMENTACAO.md](PLANO-DE-IMPLEMENTACAO.md). O diagnóstico amplo e os reviews de cada lote estão em [docs/reviews/edifoto-2026-10-18](../../docs/reviews/edifoto-2026-10-18). `IMPLEMENTACAO.md`, `ENTREGA-0.2.0.md` e `LEVANTAMENTO-PEN.md` são históricos anteriores ao monorepo; seus antigos caminhos e comandos não definem o estado atual.

## Desenvolver e verificar

Na raiz do monorepo, Node 24.15.0 e pnpm 9.15.0:

```sh
pnpm install --frozen-lockfile
pnpm --filter @informach/edifoto dev
pnpm --filter @informach/edifoto typecheck
pnpm --filter @informach/edifoto test
pnpm --filter @informach/edifoto test:e2e
pnpm --filter @informach/edifoto build
pnpm edi:test:native edifoto
```

O teste E2E usa Vite, Playwright e ponte de arquivos em memória, sem conta pessoal. Instale seu Chromium com `pnpm --filter @informach/edifoto exec playwright install chromium`; no Windows o runner aceita Edge instalado como alternativa ou `EDIFOTO_TEST_BROWSER_EXECUTABLE` para um executável específico. Evidências em `.cache/edifoto-tests`. A suite nativa Windows compila o app, usa perfil/licença descartáveis, testa diálogos reais de arquivo, recuperação, exportação, expiração e restrições do SDK. Evidências em `.cache/edi-native-results`. Nunca usar projetos pessoais para esses testes. [Guia Edi](../../docs/desenvolvimento-edi.md).

## Experiência e compatibilidade

- Nove ferramentas na interface simples; **Mais ferramentas** revela controles adicionais. Mesclagem permanece disponível, recolhida por padrão.
- Modelos genéricos, todos editáveis; o espaço de imagem do modelo **Imagem e texto** aceita uma foto em **Propriedades › Escolher imagem**. Projetos `.edifoto` salvos podem ser reabertos e usados como base.
- Texto com quebra automática, alinhamento de imagens/textos/formas, ajustes rápidos reutilizáveis e estilos Natural/Quente/Frio/Preto e branco com intensidade.
- Seleção retangular, laço e varinha; somar/subtrair/intersectar, expandir/recolher/suavizar e criar máscara. Pintura, borracha, carimbo, desfoque e formas vetoriais permanecem disponíveis.
- Máscaras acompanham a imagem por padrão; podem ser desvinculadas. Transformações preservam rotação, espelhamento e escala desigual. Camadas bloqueadas impedem edição. Mesclar é permitido quando conserva a aparência; combinações dependentes da composição pedem copiar/exportar o resultado.
- PNG/JPEG/WebP com prévia e tamanho final; JPEG usa fundo branco na transparência. Últimas preferências ficam na sessão. Entrada: PNG/JPEG/WebP/GIF/BMP/AVIF que o Chromium consegue decodificar; GIF/AVIF animados entram como imagem estática. Não há promessa de PSD, RAW, TIFF, HEIC, PDF, CMYK/ICC, HDR ou interoperabilidade profissional.
- Composição WebGL2; documento limitado a 8192 px por lado e 32 milhões de pixels, até 250 camadas e 64 milhões de pixels únicos de imagens/máscaras. Histórico limitado por passos e memória; caches de texto/vetores/texturas também têm orçamento. O hardware pode impor limites menores, comunicados pelo app.

## Arquivos e recuperação

Projetos novos usam `EDIFOTO2`, com validação de modelo, índices, dimensões e referências antes de substituir o trabalho aberto. Lê arquivos v1; ao sobrescrever um v1, o main conserva a primeira cópia `.v1.bak`. Aplicativos antigos não abrem v2. Salvamento usa snapshot, fila ordenada e escrita atômica pelo SDK; uma edição posterior continua indicada como não salva. Reabrir o mesmo projeto cria outra sessão de edição para rejeitar retornos atrasados.

Uma cópia local do trabalho não salvo é atualizada no IndexedDB após pausa breve (1,5 s). Ao reabrir, **Recuperar trabalho** restaura um documento editável separado do arquivo original. Não é backup externo nem garante o último traço em interrupção abrupta. Salvar e sair conclui a limpeza da cópia; sair sem salvar ou descartar a cópia remove a recuperação por decisão explícita. O arquivo original continua separado.

## Remover fundo por cor

Selecione uma imagem desbloqueada e use **Remover fundo**. O diálogo escolhe entre fundo uniforme de qualquer cor e verde/azul, com conta-gotas, tolerância, refinamento e prévia em fundo claro/escuro. O worker mantém a interface disponível; cancelar não altera o projeto. Aplicar conserva máscaras existentes e permite desfazer. A prévia mostra os pixels antes da máscara/mesclagem.

É recorte local por cor, sem reconhecimento semântico de pessoas/objetos. Regiões parecidas ou fundos complexos podem exigir máscara manual. Exporte PNG/WebP para preservar transparência.

## IA pela assinatura pessoal

O assistente usa exclusivamente Claude Code ou Codex oficial, instalado e autenticado com a assinatura pessoal. Não há chave de API, créditos Edi ou provedor pago do aplicativo. Login, modelos disponíveis, limites e política de dados pertencem ao cliente/provedor. O EdiFoto verifica o método de login, não extrai credenciais e inicia o processo sem interpretar o texto pelo shell. No Codex, exige login ChatGPT. [Referência oficial de autenticação](https://learn.chatgpt.com/docs/auth).

Em **Inteligência artificial**, escolha o cliente e use **Conectar**. A conexão MCP autenticada da suíte permanece local em `127.0.0.1:47331`; erros de porta aparecem na configuração. Clientes externos também podem usar as ferramentas após essa conexão. `get_document` fornece o identificador que chamadas externas devem repetir em `document_id` ao editar.

Ferramentas compartilham as operações locais do editor. Cada execução pertence a um documento e sessão; trocar/reabrir documento encerra a conversa. Confirmações, leituras e cancelamento são conferidos antes de aplicar. Falhas compostas revertem a ferramenta; edições anteriores bem-sucedidas permanecem no Histórico. Ações consecutivas da mesma execução podem formar um passo, mas edições manuais entre elas ficam separadas. Expiração da licença cancela o job pelo SDK. Exclusão pede confirmação por padrão; exportar pela IA exige permissão e destino autorizado. Não há geração de imagem, retoque semântico nem acesso indiscriminado a arquivos por essas ferramentas.
