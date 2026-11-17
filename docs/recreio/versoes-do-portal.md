# Versões do portal e ações da estante

Em 15/11/2026 às 18h47 UTC, `RECREIO-4` registrou uma ação desconhecida na
estante. O evento veio do cliente `116939f6`, depois de o portal implantar
`36606409`. O código de criar mundo não mudou entre essas fontes; o deploy não
conservava a chave de Server Actions nem configurava `deploymentId`.

Referências da versão instalada Next 16.4.2: guias locais `self-hosting.md` e
`deploymentId.md`; [guia oficial](https://nextjs.org/docs/app/guides/self-hosting#version-skew).
IDs de ação e chave de closures têm funções distintas; a configuração deve
conservar a chave entre builds e identificar cada versão do cliente/servidor.

## Implementação e aceite

1. Configurar `deploymentId` com `NEXT_DEPLOYMENT_ID` explícito ou o commit do
   Railway. Conservar a chave AES da build atual como segredo próprio do portal;
   não reutilizar chaves de login ou do servidor do jogo.
2. Exigir chave no build de produção. O executor isolado gera chave própria de
   32 bytes por execução, compartilhada apenas entre as duas builds do ensaio.
3. Erro de ação desconhecida oferece carregar o documento atual. Não repetir
   automaticamente uma mutação, afirmar que nada mudou ou ocultar a telemetria.
4. Novo gate `versoes`, exclusivamente no GitHub: dois standalone de produção,
   identificadores distintos, mesma chave, banco descartável e mesmo segredo de
   autenticação. Abrir a estante na build A, trocar o processo pela B mantendo a
   aba, confirmar a criação uma vez e conferir o mundo na versão B.
5. Repetir os demais gates; provisionar a chave sem imprimi-la, conferir a main
   remota e implantar. Capturas de arte continuam privadas; o ensaio de versão
   não precisa carregar o jogo nem arquivos licenciados.

Estado inicial: correção em preparação, incidente ainda não resolvido.
Não altera a confirmação humana de salvar/reabrir a família personalizada.

Primeira rodada `43750681062`: o gate de versões parou antes da mutação porque
a asserção leu `data-dpl-id` no DOM após carregar a página. O trace confirma o
identificador correto no HTML SSR e nas URLs dos recursos; o DOM final não o
conservou. A nova asserção confere o HTML recebido e exige o cabeçalho
`x-deployment-id` A no POST enviado depois de subir B, além do documento B no
destino. Não ampliar prazo ou mascarar erros de ação. O teste efetivo da ação
atravessando builds ainda está pendente.

Conferência somente de leitura do Turbo local: o plano (sem executar build)
inclui as duas variáveis no hash da tarefa do Recreio, herdando o restante da
configuração raiz. O manifesto da build publicada tem chave AES de 32 bytes;
ela ainda não foi copiada nem alterada no provedor.

Rodada `43751528429`: a aba A enviou a ação com seu identificador depois de B
ficar saudável, criou um mundo e recebeu o documento B; a lista mostrou só um.
O gate reprovou na vigia por dois GETs de prefetch de `/conta`/`/perfis` recusados
no intervalo em que a fixture para A antes de subir B na mesma porta. A nova
fixture admite somente `ERR_CONNECTION_REFUSED` dessas URLs RSC e somente
durante essa troca deliberada, como nos ensaios de queda existentes. Nenhuma
supressão de erro da ação, CSP, página ou fase posterior à prontidão.

## Aceite e implantação

`8559f4ab`: os seis gates da execução
[43751914501](https://github.com/informach/informach-apps/actions/runs/43751914501)
aprovaram. A medida confirma mesma aba, versões distintas e um único mundo
criado. [Evidência numérica](evidencias/versoes-portal-2026-11-15.json).

A chave AES de 32 bytes da build anterior foi conservada no segredo próprio do
portal antes do push na main. Deploy `909bcf91` aprovado, fonte conferida por
`/api/health`; saúde e prontidão 200. SSH confirmou que manifesto e variável
conservam a mesma chave, sem exibir seu valor.

O upload dos mapas de código foi confirmado pelo build às 19h35min57s UTC e a
release `8559f4ab…` existe no projeto Recreio do Sentry (ID `2094694861`). A pasta
pública do pacote instalado contém zero `.map`. A credencial de organização
usa o escopo `org:ci`, restrito a mapas/releases/mapeamentos de código; ela não
é uma credencial limitada a um projeto, mas só está configurada no portal.
Não altera orçamento nem sondagens pagas. A primeira credencial apareceu
indevidamente na saída de uma ferramenta e foi revogada antes do uso; a
substituta foi transferida diretamente para o Railway, sem imprimir o valor.

`RECREIO-4` marcado como corrigido nessa release, conservando o evento e a
detecção de regressões. Isso não certifica ausência de erros futuros. O build
também avisou sobre import depreciado do `withSentryConfig`; a troca para o
subpath `/config`, existente na versão instalada, segue na próxima candidata.

Plano IaC inicialmente previa apagar as três variáveis do upload. Declarado
`preserve()` em cada uma, o plano contra produção respondeu que a configuração
está atualizada, sem exclusões. Foi necessário o loader instalado `tsx` para
resolver imports TypeScript do catálogo; instrução registrada no runbook.

16/11, retenção de ingressos: portal `7f9b2b0a`, deployment `7a757f0c`,
saúde/prontidão 200 e mesma fonte informada pelo endpoint. O build confirmou
novo upload de mapas às 04:34:33,912 UTC e a release foi relida no Sentry;
sem novo token, rotação de chave ou alteração das sondagens pagas.
