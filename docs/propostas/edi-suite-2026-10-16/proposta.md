# Proposta de implementação da suíte Edi

Data de referência: 16 de outubro de 2026.

Decisão posterior aprovada pelo titular: o piloto usará GitHub Releases e assinaturas próprias Ed25519, sem contratar certificado Authenticode nem storage/CDN. Essa decisão substitui os requisitos de certificado, storage e endpoint de ativação da seção 7 e dos pré-requisitos iniciais abaixo. A assinatura comercial via Stripe permanece. Consulte o [manual vigente de distribuição do piloto](distribuicao-piloto.md) e o [estado da implementação](implementacao.md); a proposta original não comprova homologação em produção.

Revisão consolidada: publicação e atualização automáticas, padrão único de desenvolvimento e preservação das interfaces existentes. As funcionalidades ainda em construção serão completadas em etapa posterior, fora deste escopo.

A Edi será um produto de assinatura que reúne EdiAula, EdiCaptura, EdiFoto, EdiPDF e EdiSVG. Uma assinatura habilitará todas as ferramentas disponíveis da suíte, com conta central, gestão de dispositivos, instalação e atualização pelo Edi Hub e validação de licença dentro de cada aplicativo.

A arquitetura recomendada combina um portal Next.js, integrado aos packages existentes de autenticação e Stripe, com aplicativos Electron distribuídos para Windows. As ferramentas continuarão sendo produtos desktop, preservando acesso a arquivos, captura, processamento local e formatos de projeto. O monorepo passará a ser a origem oficial do desenvolvimento e das versões distribuídas.

O levantamento inicial considerou a estrutura do monorepo, seu código de autenticação e billing e os manifests, documentação e trechos relevantes das cinco ferramentas. Os achados abaixo orientam o projeto; a auditoria completa e a execução dos testes nativos fazem parte da primeira fase de implementação.

## 1 Situação atual e implicações

O repositório usa pnpm, Turborepo, TypeScript, Next.js, React, Biome, PostgreSQL e Drizzle. Os apps consomem packages compartilhados e não importam outros apps. O deploy web tem Railway como destino, e a CI atual roda em Ubuntu. Essas convenções devem ser estendidas para desktop com tarefas e runners próprios.

Já existem fundações relevantes:

- `@informach/auth`: contas compartilhadas, sessões, permissões e factories de Better Auth.
- `@informach/billing`: Checkout, Customer Portal, assinaturas, isolamento por app, proteção contra cobranças duplicadas, webhooks, reconciliação e créditos de IA.
- `@informach/db`: schemas e migrations centralizados.
- `@informach/emails`: mensagens transacionais e infraestrutura de entrega.
- `@informach/ui`: componentes e tokens reutilizáveis, conforme compatibilidade com cada renderer.
- `@informach/ai-core`: chamadas de IA cobradas com reserva, consumo e telemetria.

O billing atual identifica clientes por provider, titular e app. Portanto, a Edi deve ser cadastrada como **um produto comercial com o escopo `edi`**, e não como cinco assinaturas independentes. Uma assinatura de outro produto Informach não habilitará a Edi automaticamente.

| Ferramenta | Versão declarada | Base encontrada | Atenção principal na migração |
| --- | --- | --- | --- |
| EdiAula | 0.1.0 | Electron, React, TypeScript, electron-vite | FFmpeg, Whisper, GPU, downloads auxiliares, projetos e operações longas |
| EdiCaptura | 0.2.2 | Electron, JavaScript e CommonJS | Captura nativa, múltiplos monitores, atalhos globais e biblioteca local |
| EdiFoto | 0.2.0 | Electron, React, TypeScript, electron-vite | Sandbox desabilitado na janela principal, IPC de arquivos e integrações de IA |
| EdiPDF | 0.1.0 | Electron, React, TypeScript, electron-vite | Integridade de PDFs, impressão, formulários, assets de PDF.js e validação nativa |
| EdiSVG | 0.5.4 | Electron, JavaScript, electron-vite | Formatos de projeto, funcionalidades ainda em construção e distribuição portátil |

As versões declaradas não comprovam maturidade comercial. O EdiSVG, por exemplo, registra limitações e validações nativas pendentes no README; sua documentação também referencia um executável anterior ao manifest. O EdiPDF já tem uma revisão documentada, mas ela deixa pendências de interface, impressão e auditoria de dependências.

Há divergências concretas a resolver: o monorepo aplica override global de Vite para a linha 6, enquanto quatro ferramentas declaram Vite 8; as ferramentas TypeScript declaram a linha 7, enquanto a raiz declara a linha 5. O electron-vite 6 aceita várias linhas de Vite, mas o plugin React 6.1.2 consultado exige Vite 8; portanto, a compatibilidade deve considerar a cadeia completa. EdiCaptura e EdiSVG também não possuem o mesmo contrato de scripts das aplicações atuais. A base candidata mais recente está no [padrão desktop](../../arquitetura-desktop.md), sujeita à homologação dos consumidores afetados.

Nas pastas indicadas, EdiAula, EdiFoto e EdiPDF têm `.git` próprio sem commits; EdiCaptura e EdiSVG não têm `.git` próprio. A importação inicial deve preservar um snapshot verificável. Não há, nessas condições locais, histórico de commits para importar.

## 2 Produto e experiência do assinante

O portal Edi oferecerá apresentação das ferramentas, recursos realmente disponíveis, planos, cadastro, assinatura, faturas, cancelamento, downloads e gestão de dispositivos. A área autenticada mostrará a situação da assinatura e ações claras para resolver pagamento pendente ou limite de dispositivos.

O Edi Hub será o aplicativo central no Windows. Ele permitirá entrar na conta, consultar a assinatura, instalar ferramentas individualmente, abrir aplicativos, verificar atualizações, acompanhar downloads, consultar notas de versão e remover instalações. O usuário não precisará instalar todas as ferramentas para usar uma delas.

Cada ferramenta poderá ser aberta diretamente por atalho ou associação de arquivo. Nessa abertura, usará a mesma conta e a mesma licença da suíte. O Hub não será a única barreira de acesso.

O plano inicial é individual, com cobrança mensal de **R$ 49,90** ou anual de **R$ 499**, valores aprovados pelo titular em 17/10/2026 em substituição à oferta inicial de R$ 29,90/R$ 299. Os dois intervalos habilitarão as mesmas cinco ferramentas disponíveis, em até dois dispositivos, sem consumo pago de IA incluído. Trial ficará desabilitado inicialmente. A comercialização será feita por pessoa jurídica (CNPJ). A aprovação dos valores não autoriza cobrança antes da homologação. Planos para equipes podem ser adicionados depois usando o suporte existente a titulares do tipo organização, com regras próprias de membros e assentos.

As interfaces estão em desenvolvimento avançado e serão preservadas, incluindo disposição, identidade e fluxos já construídos. O escopo desta entrega é uniformizar a base de desenvolvimento, integrar conta e assinatura, aplicar licença e automatizar distribuição e atualização. Uma revisão visual geral ou a conclusão de funcionalidades pendentes não faz parte desta entrega.

Recursos ainda incompletos devem aparecer como beta ou indisponíveis. O aceite verificará os recursos já implementados e as integrações da suíte. Defeitos que comprometam segurança, arquivos, assinatura ou atualização deverão ser corrigidos nesta integração; completar uma funcionalidade ainda ausente continuará no backlog posterior de cada editor. Animação, rig e runtime ainda planejados do EdiSVG são exemplos desse backlog.

## 3 Arquitetura no monorepo

Estrutura proposta:

```text
apps/
  edi/                    Portal, APIs, billing e operação da suíte
  edi-hub/                Aplicativo central Electron
  ediaula/                Ferramenta migrada
  edicaptura/              Ferramenta migrada
  edifoto/                 Ferramenta migrada
  edipdf/                  Ferramenta migrada
  edisvg/                  Ferramenta migrada

packages/
  edi-contracts/          Contratos públicos e validação das mensagens
  edi-licensing/          Serviço de licença executado no servidor
  edi-desktop/            Sessão, licença e atualização compartilhadas no desktop
  auth/                  Factory existente com extensão desktop opcional
  billing/               Motor Stripe existente
  db/                    Novo schema edi e migrations
  config/                Cadastro da suíte e catálogo comercial
  emails/                Comunicação transacional
  ui/                    Componentes e tokens compatíveis
```

`apps/edi` concentrará o backend inicial nas rotas e serviços do app Next.js. Não é necessário criar um microserviço separado para começar. Os jobs seguirão o padrão operacional do repositório; os instaladores ficarão em armazenamento de objetos e serão distribuídos por HTTPS.

`edi-contracts` conterá identificadores das ferramentas, contratos de catálogo, licença e compatibilidade, sem dependências de Next.js, Electron ou banco. `edi-licensing` será exclusivo do servidor e receberá banco, relógio, configuração e assinador por injeção. `edi-desktop` será integrado ao processo principal de cada aplicação Electron, sem importar os packages de banco ou billing.

Os packages manterão exports explícitos e o padrão de TypeScript fonte. Os builds Electron deverão incluir esses packages no artefato final; o computador do assinante não dependerá do workspace, de Node instalado ou de caminhos da máquina de desenvolvimento.

Código específico de cada editor continuará próximo de suas funcionalidades. Bibliotecas de processamento compartilhadas só serão extraídas quando houver reutilização real e contratos compatíveis. EdiCaptura e EdiSVG poderão conservar seus renderers existentes, com contratos validados, verificação de tipos compatível e testes; a integração não exigirá recriar essas telas em React. Código novo de domínio, IPC, sessão, licença e atualização será TypeScript. Novas ferramentas usarão React e TypeScript desde a criação.

A arquitetura, a matriz de versões, os scripts, a segurança e os critérios de conclusão seguirão o [padrão desktop do repositório](../../arquitetura-desktop.md), também referenciado nas instruções de `apps/AGENTS.md`. A uniformização abrangerá Electron, cadeia de build, bibliotecas compartilhadas, componentes comuns e distribuição, preservando os recursos específicos de cada editor.

## 4 Assinatura e integração Stripe

O catálogo terá os identificadores internos `edi_suite_monthly` e `edi_suite_annual`, ambos sob `app: "edi"`. No Stripe, corresponderão a um produto com preços recorrentes mensal e anual. IDs de preço serão separados por ambiente, validados e associados ao catálogo no servidor. Enquanto não forem provisionados e conferidos, permanecerão ausentes e o Checkout não será habilitado.

O fluxo comercial será:

1. O titular entra em sua conta Edi e escolhe um plano permitido pelo catálogo.
2. O servidor cria uma sessão Stripe Checkout usando a infraestrutura existente e suas proteções de idempotência.
3. O Stripe confirma o resultado por eventos autenticados.
4. O billing atualiza o estado local e os fatos comerciais necessários para calcular o direito de uso.
5. O serviço Edi emite ou renova a licença do dispositivo quando todos os requisitos estiverem atendidos.

O retorno à página de sucesso não liberará a suíte por si só. Quando houver atraso no evento, a interface mostrará confirmação em andamento e consultará o backend de forma limitada. A gestão de cartão, faturas e cancelamento usará o Customer Portal configurado para o catálogo Edi.

Reutilizar os handlers existentes para `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`. A assinatura do webhook será validada sobre o corpo original. Eventos duplicados, fora de ordem e reprocessados não poderão conceder períodos adicionais nem reativar acessos revogados.

A integração também deverá tratar reembolso e disputa com uma política Edi explícita. Reembolso integral revogará o período correspondente, sem apagar outros períodos legitimamente pagos; reembolso parcial manterá o acesso e será registrado para acompanhamento. Disputa aberta suspenderá novas autorizações e o uso online, permitindo recuperação e suporte; a resolução favorável permitirá restaurar somente o prazo comercial ainda válido. Um reembolso não cancelará automaticamente a assinatura recorrente. Eventos serão relacionados à fatura e ao período pertinente antes de aplicar qualquer restrição. Essas extensões devem preservar os contratos dos demais produtos. [Referência Stripe sobre eventos de assinatura](https://docs.stripe.com/billing/subscriptions/webhooks).

Para vincular billing e licença sem perder atualizações em uma falha de processo, registrar a mudança comercial e um evento durável na mesma transação pertinente. Um consumidor idempotente atualizará a projeção de acesso Edi. Esse padrão de outbox registra trabalho pendente no banco e permite retomá-lo; não depende de um callback apenas em memória. As operações de licença sempre consultarão também os fatos comerciais atuais antes de conceder acesso.

O handler atual de `invoice.paid` concentra a concessão de créditos e pode retornar quando o produto não possui bônus. O direito de usar a suíte não dependerá desse bônus: confirmação de pagamento e período coberto deverão ser registrados antes e independentemente da lógica de créditos. Proração, troca de plano, fatura de valor zero confirmada, reembolso e disputa terão tratamento explícito. O período será obtido das linhas recorrentes pertinentes e do estado confirmado do provider, sem simplesmente somar um mês ao receber um evento.

Eventos de pagamento serão persistidos com identificação única de provider e fatura, assinatura, produto e intervalo coberto. A projeção poderá ser reconstruída desses fatos, inclusive para assinantes migrados. Concessão, revogação e emissão de licença usarão a mesma fronteira transacional por titular e dispositivo para evitar uma licença nova emitida no meio de uma revogação.

## 5 Política de acesso e bloqueio

O direito de uso será calculado em um serviço único. Ele verificará titular autenticado, escopo Edi, produto reconhecido, situação elegível, prazo de acesso confirmado, revogações e dispositivo autorizado. Recursos liberados por configuração de lançamento continuarão distintos de permissões comerciais.

O helper atual de billing permite `active` e `trialing`, mas consulta apenas o status. Para emitir uma licença offline, será necessário verificar também datas e fatos de pagamento. Um status local antigo não poderá estender indefinidamente uma licença.

| Situação | Comportamento proposto |
| --- | --- |
| Pagamento confirmado e período vigente | Habilita as ferramentas disponíveis da suíte |
| Cancelamento agendado | Mantém acesso até o término do período pago |
| Trial explicitamente concedido | Habilita somente até o fim do trial |
| `past_due` | Suspende novas concessões e o uso quando o desktop recebe a negativa; mantém cobrança recuperável |
| `incomplete` ou pagamento aguardando confirmação | Não concede acesso |
| `unpaid`, `incomplete_expired`, `paused` ou cancelamento efetivo | Não concede acesso |
| Dispositivo revogado ou conta suspensa | Nega novas licenças e encerra o acesso ao reconectar |
| Falha de comunicação com licença local válida | Mantém uso até a expiração já autorizada |
| Falha de comunicação sem licença válida | Solicita conexão para validar o acesso |

A política de `past_due` acompanha o padrão atual do repositório. Uma eventual tolerância comercial deve ter duração explícita e aprovação como regra de produto, sem alterar silenciosamente o comportamento dos outros apps.

### Licença offline

Recomenda-se uma autorização local assinada assimetricamente, com prazo máximo inicial de **72 horas**, limitado também ao término do período pago ou do trial. A chave privada ficará somente no servidor. O aplicativo verificará a autorização com chaves públicas, usando biblioteca criptográfica consolidada.

A autorização conterá identificadores de titular e dispositivo, vínculo com a chave pública da instalação, ferramentas permitidas, emissor, destinatário, ambiente, emissão, expiração e versão da política. O SDK verificará esse vínculo localmente, além de assinatura e datas. O servidor manterá o prazo comercial confirmado, por exemplo `paidThrough`, a partir dos fatos de pagamento; eventos de assinatura isolados não deverão avançar esse prazo sem a confirmação correspondente.

Primeira ativação exigirá internet. Enquanto conectado, o desktop verificará a situação ao iniciar, ao retornar da suspensão e periodicamente, com intervalo inicial sugerido de 15 minutos. Esse intervalo é configurável e deverá ter dispersão entre clientes para evitar picos de requisição. O limite offline será verificado antes de operações protegidas, mesmo se o app ficar aberto por vários dias.

Uma resposta explícita de revogação invalidará imediatamente o cache local e impedirá continuar usando uma autorização anterior. Erros de rede não serão tratados como revogação nem poderão gerar uma nova autorização. Alterações anormais do relógio exigirão nova validação online; referências de tempo do servidor e relógio monotônico ajudarão durante a execução, sem promessa de proteção absoluta contra adulteração do computador.

**Uso offline e bloqueio remoto instantâneo são requisitos incompatíveis.** Com 72 horas offline, uma revogação desconhecida pelo cliente poderá levar até o vencimento dessa autorização para surtir efeito. Para garantir bloqueio remoto antes disso, será necessário exigir conectividade mais frequente ou constante. Aplicativos locais também podem ser adulterados por quem controla a máquina; assinatura de código, validação e redução da superfície de ataque oferecem proteção prática, não inviolabilidade.

### Pontos de aplicação da licença

Cada ferramenta deverá aplicar a política no processo principal, nas operações de domínio e nos comandos de edição, incluindo IPC, atalhos, menus, tarefas em segundo plano e MCP. Como parte dos editores processa alterações no renderer, seus comandos também deverão convergir para uma camada comum de autorização e manter a interface consistente com o estado da licença. Esconder botões ou bloquear somente o Hub não atende ao requisito.

Ao vencer a licença, o app entrará em modo restrito: interromperá novas edições, capturas, renderizações e exportações comerciais, permitindo conta, suporte, atualização e recuperação do trabalho. Uma gravação ou tarefa já autorizada será finalizada ou interrompida em ponto seguro conforme seu tipo, com janela inicial de preservação de até 30 minutos por ocorrência de bloqueio. A janela não autoriza iniciar novas tarefas nem pode ser reiniciada para prolongar o uso. Capturas em andamento deverão concluir um arquivo recuperável; renderizações interrompidas não substituirão a saída original por um arquivo incompleto.

Salvar o estado do projeto que já está em memória será uma operação de preservação permitida, inclusive no EdiPDF; isso não autoriza novas edições durante o bloqueio. Arquivos locais e exportações anteriores continuarão pertencendo ao usuário. Expiração, cancelamento e desinstalação não apagarão projetos nem enviarão arquivos ao servidor.

## 6 Login desktop e dispositivos

O login abrirá o navegador padrão para autenticar na conta Edi. Será usado o fluxo de autorização de dispositivo com OAuth Provider oficial do Better Auth, cliente nativo público, código temporário, expiração, limitação de tentativas e aprovação explícita pelo titular. O desktop não terá client secret. A factory atual não expõe essa integração; ela será uma extensão opcional, com migrations e testes para preservar os outros produtos.

O alvo de homologação é Better Auth e plugins oficiais na linha 1.7.10 consultada, mantendo versões compatíveis entre core, passkey e OAuth Provider. O cliente solicitará tokens com audience específica das APIs desktop Edi, escopos mínimos de licença e dispositivo atual e `offline_access` quando precisar de renovação. Não receberá uma sessão web irrestrita com poderes para administrar cobrança, outras aplicações ou excluir a conta. A documentação distingue esse fluxo OAuth do plugin simples que entrega uma sessão Better Auth. [Documentação oficial de autorização de dispositivo](https://better-auth.com/docs/plugins/device-authorization).

Tokens de acesso terão validade curta e refresh tokens usarão rotação e revogação segundo o plugin homologado. Toda requisição de licença verificará também a ativação do dispositivo e o estado do titular no banco; um token ainda não expirado não contornará uma revogação. Tokens de login, autorização offline assinada e assinatura comercial são objetos distintos, com responsabilidades e prazos próprios.

O desktop nunca receberá chaves Stripe, credenciais do banco ou a chave privada de licença. Sessões serão armazenadas de forma protegida pelo Windows e acessadas apenas pelo processo principal. A suíte terá um armazenamento comum de sessão por usuário Windows, com gravação atômica e coordenação entre processos para evitar disputas de renovação. Tokens não serão transmitidos em argumentos de linha de comando ou expostos ao renderer.

Proposta inicial: **dois computadores ativados por conta individual**, contando uma instalação da suíte por usuário Windows, mesmo com cinco ferramentas instaladas. Esse é um limite de dispositivos, não um limite implícito de sessões simultâneas. Uma política de uso simultâneo, se desejada, será definida separadamente.

O registro usará identificador de instalação e par de chaves gerados localmente, evitando coleta de números de série de hardware. O portal permitirá visualizar e revogar dispositivos. Ativações concorrentes deverão ser serializadas no servidor para não ultrapassar o limite. Sair da suíte limpará as credenciais e autorizações locais compartilhadas e notificará as ferramentas abertas; revogações remotas obedecerão ao limite offline descrito anteriormente.

## 7 Instalação e atualização dos aplicativos

O envio de uma nova versão Edi ao GitHub acionará automaticamente verificação, build, assinatura, publicação dos instaladores e ativação no catálogo. Hub e ferramentas farão a descoberta e o download automaticamente, aplicando a instalação em um momento seguro. A publicação rotineira não exigirá copiar arquivos, editar links de download ou atualizar manualmente seis catálogos.

### Gatilhos e identidade da versão

O workflow proposto `.github/workflows/release-edi.yml` aceitará push de uma tag protegida `edi-vX.Y.Z` ou publicação de uma GitHub Release com essa mesma tag. Pré-releases usarão `edi-vX.Y.Z-beta.N`. Os dois gatilhos convergirão para a mesma identificação de release, com deduplicação e jobs comuns; uma tag e uma Release da mesma versão não provocarão duas publicações.

Um push comum de desenvolvimento continuará executando CI. A tag ou Release é o ato de publicar uma versão comercial, depois de as mudanças estarem integradas à branch autorizada. O workflow validará formato, commit, permissões e a correspondência entre versão, canal e metadados. Se a Release tiver sido publicada pela interface do GitHub, ela só entrará no catálogo Edi depois de os artefatos passarem pelos checks.

O Hub e as cinco ferramentas terão uma versão comercial comum por lançamento, independentemente das versões de desenvolvimento anteriores à migração. O valor normalizado da tag será aplicado ao empacotamento de todos os aplicativos. Um manifesto gerado registrará cada app, commit, versão, runtime, plataforma, arquitetura, contratos suportados, arquivos, hashes e identidade do publicador. Versão de documento continuará independente da versão comercial.

A execução será idempotente por versão, canal e commit. Tags e artefatos publicados não serão sobrescritos com conteúdo diferente. Jobs concorrentes serão coordenados, e uma versão antiga que termine depois de uma nova não poderá retroceder o catálogo. [Eventos de publicação e tags no GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

### Pipeline automático

| Passo | Operação automática | Condição para avançar |
| --- | --- | --- |
| 1 Validar | Conferir tag, commit autorizado, canal e catálogo de ferramentas | Identidade de release válida e ainda não ativada |
| 2 Verificar | Instalar pelo lockfile e executar lint, tipos, testes e builds dos consumidores afetados | Checks aprovados no commit da tag |
| 3 Compilar | Gerar Hub e ferramentas em matriz Windows x64 | Todos os aplicativos obrigatórios compilados |
| 4 Empacotar e assinar | Gerar NSIS e metadados com electron-builder e Authenticode | Publicador válido e assinatura com timestamp |
| 5 Testar artefatos | Verificar hashes, assinatura, instalação, abertura, licença e atualização em perfil isolado | Smoke dos instaladores finais aprovado |
| 6 Armazenar | Enviar os artefatos ao GitHub Release e ao armazenamento de distribuição, em caminhos imutáveis | Todos os arquivos presentes e verificáveis por HTTPS |
| 7 Preparar | Registrar manifesto e release em estado pronto, ainda sem mudar o canal ativo | Backend compatível, catálogo e feeds validados |
| 8 Ativar | Alterar transacionalmente o ponteiro da versão ativa do canal | Pacote completo, válido e mais novo que o ativo |
| 9 Disponibilizar | Atualizar catálogo, feeds, downloads e resumo da execução | Todos apontam para o mesmo manifesto ativo |

Build, upload e ativação serão jobs do mesmo fluxo ou workflows reutilizáveis chamados diretamente. Não dependerão de uma Release criada com `GITHUB_TOKEN` disparar um segundo workflow: eventos gerados com esse token, em geral, não criam outra execução. [Regras de disparo do GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

O repositório de código pode permanecer privado. Credenciais de publicação ficam nos jobs autorizados, com privilégio mínimo e OIDC quando o serviço suportar. As actions serão fixadas por commit confiável. Tokens de GitHub, credenciais de storage e chaves privadas nunca serão distribuídos no desktop. Jobs de PR não terão acesso à assinatura comercial.

O endpoint de preparação e ativação aceitará apenas a identidade de publicação da CI autorizada, por credencial específica de curta duração ou OIDC validado com emissor, audience, repositório, workflow e ref. Ele não reutilizará tokens do assinante nem permissões comuns de suporte. O servidor validará o manifesto, o estado dos artefatos e a versão antes de mudar o canal ativo.

### Instaladores e feeds

O padrão será `electron-builder`, instalador NSIS por usuário Windows e `electron-updater`, com publicador esperado e assinatura verificada. Cada ferramenta manterá identidade Windows própria e estável. O updater será configurado para o instalador escolhido; não se presumirá equivalência com o updater nativo do Electron. [Documentação do electron-builder](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/auto-update.md).

Artefatos serão armazenados em caminhos como `edi/releases/1.2.0/edifoto/win32/x64/`. O feed será separado por app e arquitetura, por exemplo `edi/updates/edifoto/win32/x64/latest.yml` no canal estável e `beta.yml` no beta. Um `latest.yml` compartilhado pelos seis apps não será usado. EXE, blockmaps e demais arquivos necessários terão nomes e caminhos inequívocos.

O endpoint de metadados usará o formato oficial do provider `generic`, preservando os campos gerados pelo builder e o vínculo com os artefatos imutáveis. O catálogo e os feeds serão derivados de um único ponteiro de release ativa por canal, alterado numa transação. Os binários serão entregues pelo armazenamento de objetos/CDN com HTTPS e suporte a range requests; o Next.js servirá apenas catálogo e metadados pequenos.

Metadados poderão ter cache curto, inicialmente até 60 segundos, enquanto artefatos versionados poderão ter cache longo. Os clientes poderão perceber a versão em instantes diferentes, mas só receberão releases completas e já ativadas. Uma falha de upload ou de teste não substituirá o ponteiro da versão anterior.

Instaladores e feeds serão públicos e assinados; o uso dos aplicativos continuará protegido pela licença. Essa escolha permite atualização sem sessão ativa e evita embutir credenciais de repositório privado. Arquivos grandes, como modelos de transcrição, terão distribuição auxiliar versionada e verificada e não serão incorporados indiscriminadamente ao instalador ou à Release.

### Atualização no computador

Hub e ferramentas verificarão a versão no início, ao retomar a conexão e periodicamente enquanto estiverem ativos, com intervalo inicial de 30 minutos e dispersão entre clientes. O download será automático em segundo plano. Usuários poderão ajustar consumo de rede, mas a configuração padrão já oferecerá atualização automática.

Depois de verificar integridade e assinatura, o aplicativo marcará a instalação como pronta. A instalação automática ocorrerá no fechamento seguro ou no próximo início apropriado. Alterações não salvas terão recuperação ou confirmação; captura, renderização e escrita de documentos não serão interrompidas abruptamente. Também haverá ação para instalar imediatamente quando for seguro.

Cada ferramenta usará a mesma implementação de updater no SDK desktop e funcionará sem o Hub aberto. Para ferramentas instaladas e fechadas, o Hub acionará um modo de manutenção restrito da aplicação, que executará somente o fluxo de atualização validado. Esse modo não abrirá o editor nem concederá licença ou execução de comandos. Exclusão mútua por ferramenta impedirá disputa entre updater, Hub, abertura pelo usuário e instaladores.

Se Hub e ferramentas estiverem fechados, a atualização ocorrerá na próxima execução; um computador desligado ou sem processo da suíte ativo não receberá instalação imediata. Falta de rede, espaço em disco, pacote inválido ou falha do instalador manterá a versão anterior e permitirá retomada controlada. Uma atualização não tentará instalar uma arquitetura ou uma versão incompatível com o Windows local.

### Canais e recuperação

Haverá homologação interna, beta opt-in e canal estável como padrão. Beta não será oferecido automaticamente a assinantes do estável. O artefato final assinado será testado e promovido de homologação para distribuição sem reconstrução. Uma versão `1.2.0-beta.1` não será renomeada para `1.2.0`: mudar a versão embutida exige novo artefato e nova verificação.

A API e o SDK manterão uma janela explícita de compatibilidade, inicialmente cobrindo versões comerciais publicadas nos últimos 90 dias e pelo menos as duas versões anteriores. Incidentes críticos poderão exigir versão mínima mais recente, mantendo disponível atualização e recuperação de trabalho. Mudanças de banco e backend serão publicadas de forma compatível antes de ativar os novos instaladores; a ativação fará uma checagem real desses contratos.

Publicações defeituosas serão retiradas do canal e corrigidas por uma versão maior, sem reutilizar a mesma tag. Retirar uma release impede novos downloads, mas não desfaz instalações já concluídas. Reinstalar uma versão anterior só será permitido quando dados e formatos forem compatíveis; não haverá downgrade automático sobre dados irreversivelmente migrados. Documentos e perfis sempre serão preservados.

Retentativas de publicação retomarão os artefatos já validados e os passos faltantes, sem duplicar releases ou conceder licença adicional. Falhas ficarão visíveis no GitHub Actions e na operação Edi; não será exigida uma aprovação manual adicional para concluir publicações rotineiras cujos checks tenham passado.

## 8 Migração das cinco pastas

Origens consideradas:

```text
C:\Users\julio\Desktop\CRIECOMHELENAEJULIO\APPS\EDIAULA
C:\Users\julio\Desktop\CRIECOMHELENAEJULIO\APPS\EDICAPTURA
C:\Users\julio\Desktop\CRIECOMHELENAEJULIO\APPS\EDIFOTO
C:\Users\julio\Desktop\CRIECOMHELENAEJULIO\APPS\EDIPDF
C:\Users\julio\Desktop\CRIECOMHELENAEJULIO\APPS\EDISVG
```

### Captura e preservação

Antes da importação, inventariar código, assets, testes, fixtures, `.pen`, documentação, dependências, arquivos de usuário e executáveis auxiliares. Criar snapshots com manifesto e hashes dos arquivos selecionados, verificando se as fontes mudaram durante a captura. Preservar as pastas originais até a validação final da migração.

Não importar `node_modules`, caches, perfis de teste, atalhos `.lnk`, outputs compilados, pacotes de entrega ou segredos. Fixtures de teste e assets legítimos serão incluídos após revisão. Projetos pessoais e mídias de usuário não devem entrar no Git por estarem dentro de uma pasta de desenvolvimento. Binários auxiliares terão política própria de aquisição, integridade e licenças de distribuição.

### Integração técnica

Cada ferramenta será importada em mudança identificável, com comportamento de referência registrado. Normalizar nomes de package, dependências `workspace:*`, scripts, instalação e tarefas Turborepo. O monorepo terá um lockfile pnpm; lockfiles npm originais serão preservados no snapshot de origem, não mantidos como segunda fonte de instalação ativa.

Resolver Vite, electron-vite, TypeScript, Node, React, Zod e Electron por uma matriz explícita. O auth atual usa Zod 3, enquanto ferramentas declaram Zod 4; contratos compartilhados precisarão de uma versão e fronteiras bem definidas, sem circular instâncias incompatíveis de schema. Um override existente poderá ser restringido aos consumidores corretos ou substituído por uma atualização compatível, conforme evidência. A solução deverá manter as proteções de segurança que motivaram os overrides e passar pelos checks dos apps web. Copiar `node_modules`, usar instalação com dependências incompatíveis ou suprimir erros de tipos não será estratégia de migração.

A versão de Node usada para desenvolver e testar será alinhada entre ambiente local e CI. Tipos de Node e APIs usadas no processo principal também deverão respeitar o runtime embutido na versão de Electron escolhida. Não basta compilar com os tipos mais recentes.

Criar tarefas desktop explícitas para build, verificação de tipos ou JavaScript, testes, smoke nativo, empacotamento e assinatura. Produção e testes deverão usar perfis diferentes. Nenhum teste poderá alterar a biblioteca real, os projetos, as credenciais ou associações de arquivo do usuário.

A uniformização usará a matriz candidata do padrão desktop e incluirá a homologação transversal dos packages compartilhados. A adoção de versões recentes será uma mudança rastreável de plataforma, preservando as interfaces. A captura do baseline funcional deverá ocorrer antes de atualizar dependências, para distinguir regressões da migração de funcionalidades que já estavam pendentes na origem.

### Dados locais e transição

Mapear diretórios atuais de `userData`, bibliotecas, documentos, modelos, caches e configurações. Mudanças no nome do package ou identidade Electron não poderão criar silenciosamente um perfil vazio. A migração de dados será versionada, idempotente, com cópia de segurança e escrita atômica, preservando os formatos já produzidos.

Validar arquivos `.ediaula`, `.edifoto`, `.edisvg`, PDFs e a biblioteca de capturas com cópias reais representativas. A primeira versão comercial deverá abrir os formatos suportados das versões importadas. Migrações de documento que criem formato novo terão política explícita para versões antigas.

Executáveis antigos já distribuídos sem validação de assinatura não poderão ser bloqueados retroativamente pelo novo backend. Eles precisarão de uma transição comercial e de instalação documentada. A garantia de licença começa nas versões que incorporarem o mecanismo.

## 9 Atualizações das pastas de desenvolvimento

Há um segundo fluxo de atualização, distinto daquele usado pelos assinantes: trazer mudanças feitas nas pastas antigas enquanto a migração está em andamento.

Recomenda-se manter essa possibilidade por um período de transição definido. Um comando interno de comparação produzirá relatório de arquivos adicionados, modificados, removidos e em conflito. A referência será o snapshot da importação, comparado com a origem atual e com o destino atual no monorepo.

Se apenas a origem mudou, a alteração poderá ser preparada para integração. Se ambos os lados mudaram o mesmo trecho, será necessário resolver o conflito. Exclusões de origem também serão exibidas explicitamente. O relatório informará alterações locais ainda não integradas antes de oferecer a aplicação da atualização em branch ou worktree isolada.

O fluxo será: **comparar, revisar, confirmar a integração, aplicar, testar e promover a mudança**. Uma ferramenta de comparação reconhecida fará o merge a três vias; não será criado um mecanismo que sobrescreve diretórios por data de modificação. Falhas preservarão as fontes e o estado anterior.

Depois da transição, as pastas antigas ficarão arquivadas e o desenvolvimento ocorrerá no monorepo. Se futuramente houver um upstream externo legítimo, ele será integrado por commits ou patches revisáveis. Sincronização permanente nos dois sentidos elevaria o risco de perder correções de segurança e de licença.

O aplicativo instalado nunca fará `git pull`, copiará código das pastas locais ou executará arquivos novos obtidos diretamente do repositório. Ele seguirá o processo de releases assinadas descrito na seção de distribuição.

## 10 Revisão de código e qualidade

Cada ferramenta terá revisão com achados classificados por impacto, evidência, correção e verificação. Serão condições de lançamento a ausência de falhas críticas ou altas conhecidas nos fluxos de licença, execução de código, arquivos, credenciais e integridade de projetos.

| Área | Revisão necessária |
| --- | --- |
| Electron | Sandbox, isolamento de contexto, navegação, janelas, permissões e preload mínimo |
| IPC e MCP | Origem e frame, contratos validados, autenticação local, autorização por operação e limites de payload |
| Arquivos | Caminhos autorizados, traversal, arquivos maliciosos, gravação atômica, concorrência e recuperação |
| Execução de processos | Argumentos estruturados, cancelamento, limites, subprocessos permitidos e ausência de comandos arbitrários |
| Estado do editor | Histórico, operações concorrentes, troca de documento, gravação e alterações pendentes |
| Dependências | Vulnerabilidades, versões compatíveis, licenças, assets e downloads reproduzíveis |
| Interface | Teclado, foco, contraste, mensagens, progresso, cancelamento e consistência da conta |
| Dados e privacidade | Minimização, armazenamento de credenciais, exclusão e logs sem conteúdo sensível |

No EdiFoto, a janela principal usa `sandbox: false` e existem handlers de leitura e gravação que recebem caminhos diretamente. Isso exige revisão do preload, das origens e dos limites de acesso, antes de habilitar distribuição comercial. A correção deverá adequar a fronteira de privilégios para que o sandbox possa ser ativado; somente mudar a flag sem validar as dependências do preload não basta.

A mesma revisão deve alcançar as pontes de resultados de IA, incluindo `ai:result`, e os servidores MCP. Escutar apenas em loopback reduz exposição à rede, mas não autentica outros processos locais. Tokens locais de curta duração e permissões por operação deverão proteger os comandos, com controle de licença aplicado também às chamadas de agentes.

O EdiPDF deverá reaproveitar as correções e os testes de integridade já documentados, complementando as validações nativas pendentes. Recursos de cobertura visual de texto não deverão ser apresentados como remoção segura de informações. O EdiCaptura também deverá explicar que pixelização de uma exportação não remove o original de sua biblioteca.

No EdiAula, a revisão incluirá FFmpeg, modelos e binários do Whisper, caminhos absolutos atuais, subprocessos, GPU e encerramento de renderizações. Downloads auxiliares deverão verificar versão e integridade antes da execução. O EdiSVG precisará de uma matriz fiel de funcionalidades e de compatibilidade dos formatos; limitações de animação, rig e exportação não serão ocultadas pela integração à suíte.

Essas medidas seguem as recomendações oficiais de isolamento, sandbox, navegação e validação de IPC do Electron. [Guia oficial de segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security).

## 11 Inteligência artificial e consumo

EdiAula, EdiFoto e EdiSVG já integram agentes externos, CLIs ou chaves do usuário. É necessário separar a assinatura Edi dos serviços externos usados pelo assinante.

Para a primeira versão, recomenda-se preservar a possibilidade de usar provedores próprios, com configuração e autorização explícitas. As credenciais continuarão locais e protegidas. O app não copiará logins de provedores para o servidor nem apresentará a assinatura Edi como cobertura desses serviços externos.

Se a Edi passar a oferecer IA paga pela Informach, as chamadas serão feitas pelo backend, usando `@informach/ai-core` e `withCredits`, com reserva, consumo, restituição e limites de uso. Chaves de provedor nunca serão distribuídas no Electron. IA hospedada exigirá orçamento e franquia próprios; não deve ser prometida como ilimitada dentro da assinatura.

O envio de conteúdo de projetos para IA terá informação clara e controle pelo usuário. Prompts, imagens, PDFs, gravações e caminhos pessoais não poderão aparecer em logs operacionais. Bloquear a licença da Edi também bloqueará os comandos que os agentes executam dentro das ferramentas, mesmo quando o provedor externo estiver disponível.

## 12 Dados e contratos do servidor

O banco manterá `core` para identidade e `billing` para os fatos de cobrança. O schema `edi`, gerenciado em `@informach/db`, poderá conter:

- `devices` e `activations`: identidade de instalação, vínculo com titular, revogação, última verificação e controle transacional do limite.
- `device_sessions`: vínculo com tokens OAuth e revogação do acesso de cada ativação; os tokens permanecem sob responsabilidade do provider oficial.
- `entitlements`: projeção reconstruível do acesso, prazo comercial confirmado, fonte e versão da política, referenciando a assinatura.
- `releases`, `release_artifacts` e `release_channels`: estados de preparação e publicação, artefatos imutáveis, compatibilidade e ponteiro ativo por canal.
- `outbox_events`: trabalho durável para sincronizar mudanças relevantes, com identificação e reprocessamento idempotente.

Não será criada uma segunda assinatura independente da tabela de billing. Concessões manuais, se necessárias para suporte ou testes, terão origem distinta, prazo máximo, motivo e auditoria; não poderão ser uma flag ilimitada de acesso.

Fatos comerciais de faturas e períodos confirmados serão modelados no domínio `billing`, independentemente de créditos de IA. `edi.entitlements` será uma projeção reconstruível desses fatos e das restrições Edi. O catálogo tipado em `@informach/config` será a origem da lista de ferramentas; registros de release serão gerados dele, sem manter listas conflitantes no Hub, pipeline e licença.

As APIs atenderão catálogo, situação de acesso, ativação, renovação de licença, revogação e consulta de dispositivos. O titular será obtido da autenticação validada, nunca aceito diretamente como autoridade em um `userId` enviado pelo desktop. Downloads e catálogo terão regras próprias, sem depender de acesso irrestrito ao backend.

Migrations usarão o fluxo Drizzle do repositório. Mudanças que exigirem dados serão separadas em backfill e alteração de schema na ordem correta, com compatibilidade durante o deploy. Os apps não rodarão migrations ao iniciar. Novas tabelas de plugin Better Auth também entrarão nesse processo centralizado.

O schema `edi` será adicionado ao `schemaFilter` do Drizzle e ao registro de exports. Credenciais de banco e permissões dos jobs terão escopo definido. Estados de release seguirão o fluxo preparado, verificado, pronto, ativo e retirado, com constraints e comparação de versão na ativação. Retenção de artefatos cobrirá a janela de compatibilidade e de recuperação.

## 13 Operação e administração

A operação inicial ficará em uma área restrita de `apps/edi`, usando as permissões compartilhadas. O `apps/admin` atual é um scaffold; sua integração completa não deve ser tratada como infraestrutura pronta. Uma futura centralização poderá consumir os mesmos serviços, sem duplicar as regras Edi.

Operadores autorizados poderão localizar assinatura, consultar dispositivos, revogar uma ativação, verificar processamento de pagamento e inspecionar releases. Permissões de suporte, cobrança e publicação terão limites explícitos. Mudanças financeiras usarão Stripe e seus serviços, mantendo referência auditável.

Logs e métricas registrarão IDs e estados necessários para investigar webhook, assinatura, dispositivo, autorização e atualização. Serão medidos atraso de eventos, divergências na reconciliação, falhas de renovação, ativações negadas, falhas de instalação e crashes por versão. Tokens, assinaturas criptográficas, conteúdo de documentos e dados de cartão não entrarão em auditoria ou telemetria.

Webhooks serão o caminho principal de atualização comercial. Haverá reconciliação incremental frequente para estados pendentes, períodos próximos ao vencimento e casos com divergência, além da varredura completa diária. Consultas de licença com estado comercial vencido ou desatualizado solicitarão reconciliação controlada antes de conceder novo prazo. A indisponibilidade do Stripe não autorizará estender um período ainda não confirmado.

Como objetivos iniciais a validar em homologação: disponibilizar acesso em até dois minutos após o evento comercial processado e aplicar uma revogação conhecida pelo backend na próxima verificação online, normalmente em até 15 minutos com o app ativo. Atrasos externos e clientes offline seguirão as regras descritas; esses números são metas propostas, não garantias já medidas.

Haverá procedimentos para falha de cobrança, atraso de webhook, queda do serviço de licença, incidente de assinatura de código, chave de licença comprometida, release defeituoso e restauração do banco. Rotação de chaves públicas manterá compatibilidade pelo período das autorizações ainda válidas. Backups do banco e testes de restauração serão parte do lançamento.

Exclusão de conta deverá respeitar a identidade compartilhada com outros produtos Informach. Antes de removê-la, encerrar cobranças aplicáveis e revogar dispositivos, preservando retenções comerciais obrigatórias. Projetos locais não serão apagados remotamente como consequência da exclusão.

## 14 Verificação e critérios de aceite

Os checks atuais de instalação com lockfile, Biome, tipos, testes e build continuarão obrigatórios para os consumidores afetados. A CI deverá acrescentar runner Windows para empacotamento e testes nativos de Electron. Publicação e assinatura usarão jobs restritos a releases confiáveis, sem disponibilizar segredos a builds de contribuições não aprovadas.

O aceite desta proposta avaliará integração, segurança, preservação da interface e comportamento já implementado. Funcionalidades ausentes terão registro no backlog e indicação apropriada na interface; a conclusão desses recursos não será exigida para aprovar a integração da suíte.

| Cenário | Resultado exigido |
| --- | --- |
| Assinar, confirmar pagamento e ativar | Cinco ferramentas disponíveis com uma única assinatura |
| Acessar Edi com assinatura de outro app | Acesso negado |
| Repetir ou reordenar eventos Stripe | Sem duplicação de concessões ou regressão de revogação |
| Perder evento e reconciliar | Estado comercial e licença recuperados corretamente |
| Cancelar no fim do período | Acesso mantido até a data efetiva e bloqueado depois |
| Falhar cobrança e pagar depois | Suspensão e reativação segundo a política |
| Revogar ou ativar dispositivos simultaneamente | Limite respeitado e acesso negado ao dispositivo revogado |
| Abrir ferramenta sem o Hub | Mesma regra de licença aplicada |
| Usar IPC, MCP ou atalho com licença vencida | Operação protegida recusada |
| Ficar offline, suspender o PC ou alterar o relógio | Prazo respeitado e reconexão solicitada quando necessária |
| Vencer licença durante edição ou captura | Trabalho preservado e interrupção segura |
| Instalar e atualizar | Artefatos válidos, projetos e perfis preservados |
| Baixar pacote corrompido ou de publicador incorreto | Instalação recusada |
| Atualizar com disco cheio ou processo aberto | Falha recuperável, sem destruir a instalação anterior |
| Abrir projetos antigos após a migração | Conteúdo preservado ou incompatibilidade informada antes de gravar |
| Publicar tag ou GitHub Release Edi | Build, teste, assinatura, upload e ativação executados automaticamente |
| Receber dois gatilhos para a mesma versão | Uma única publicação, sem sobrescrever artefatos |
| Publicar releases fora de ordem | Canal não retrocede para a execução que terminou por último |
| Falhar um dos seis builds, assinaturas ou uploads | Catálogo permanece na versão anterior |
| Consultar feeds de ferramentas diferentes | Cada feed oferece somente o aplicativo e a arquitetura corretos |
| Permanecer no canal estável | Nenhuma pré-release beta é instalada |
| Abrir o Hub com ferramenta instalada e fechada | Ferramenta é atualizada por manutenção restrita e coordenada |
| Revogar OAuth, dispositivo ou assinatura | Cache e tokens não contornam a restrição correspondente |
| Atualizar uma base comum | Todos os consumidores afetados passam pelos checks |
| Manter recurso ainda não implementado | Recurso identificado, sem simular execução ou bloquear o aceite da suíte |

Cada editor terá testes específicos: vídeo, áudio e GPU no EdiAula; atalhos e monitores no EdiCaptura; camadas e exportações no EdiFoto; PDFs, formulários e impressão no EdiPDF; importação SVG, histórico e compatibilidade no EdiSVG. A validação usará os instaladores finais, incluindo uma instalação Windows limpa, sem depender do ambiente de desenvolvimento.

Builds comerciais não poderão aceitar flags, variáveis de ambiente ou perfis de teste que desativem a licença ou redirecionem sua validação para um ambiente não confiável. Simulações de autorização serão injetadas nos testes e não estarão disponíveis como mecanismo de liberação no produto instalado.

O aceite comercial exigirá evidências dos fluxos essenciais de cada ferramenta, revisão de segurança concluída, migração reversível dos dados e documentação de suporte. Contagem de testes aprovados, isoladamente, não substitui esses critérios.

## 15 Etapas de implementação

| Etapa | Entrega | Critério para avançar |
| --- | --- | --- |
| 1 Auditoria e decisões | Inventário, snapshots, baseline, matriz de compatibilidade, backlog excluído e políticas | Escopo e riscos conhecidos; interfaces e fontes preservadas |
| 2 Importação e uniformização | Cinco apps no workspace com base comum, contratos e instalação reproduzível | Checks, interfaces e comportamento de referência preservados |
| 3 Portal e licença | Conta, Stripe, dispositivos, autorização desktop e regras offline | Ciclo comercial e bloqueio aprovados em homologação |
| 4 Distribuição piloto | Edi Hub, ferramenta piloto e workflow GitHub de assinatura, publicação e updater | Publicar versão no GitHub produz instalação e atualização automáticas |
| 5 Integração completa | Licença, segurança, base comum e release automático dos seis aplicativos | Matriz de aceite cumprida individualmente, sem completar backlog funcional |
| 6 Lançamento gradual | Beta, operação, restauração, suporte e canal estável | Evidências de uso real e capacidade de recuperação |

O EdiPDF é um candidato ao piloto porque tem escopo mais contido e uma revisão recente documentada. A escolha será confirmada após a auditoria nativa. Esse piloto validará a integração completa antes de replicar o SDK e o processo de release nas outras ferramentas.

A referência inicial de planejamento é **12 a 18 semanas com dois profissionais de engenharia e QA recorrente**, incluindo integração e distribuição Windows. A atualização transversal da base técnica, o OAuth desktop e o pipeline automático agora têm critérios mais definidos e precisam entrar no recálculo ao terminar a primeira etapa; essa faixa não deve ser tratada como prazo fechado. A preservação dos renderers evita incluir uma reescrita visual geral. A estimativa exclui concluir funcionalidades ainda planejadas, suporte a macOS ou Linux, sincronização de projetos na nuvem, colaboração e IA hospedada ilimitada.

Os pré-requisitos de lançamento incluem conta e configuração de assinatura Authenticode, credenciais de publicação GitHub, armazenamento de distribuição com HTTPS, DNS e ambiente Edi, preços e webhook Stripe, configuração OAuth e configuração dos jobs. A primeira etapa verificará disponibilidade, custo e responsável por cada item. Uma vez configurados, os lançamentos rotineiros serão automáticos a partir do GitHub.

## 16 Custos e decisões comerciais

O orçamento deverá separar desenvolvimento inicial de operação recorrente. A operação incluirá portal e jobs no Railway, PostgreSQL e backups, eventual Redis, armazenamento de instaladores e tráfego, e-mail, observabilidade, assinatura de código, runners Windows e suporte. Taxas Stripe e processamento de IA entrarão como custos variáveis. Os valores serão cotados no momento da implementação, usando volume esperado de assinantes e downloads.

O preço mensal não deve ser calculado apenas pelo custo do servidor. Será necessário considerar manutenção dos cinco aplicativos, testes Windows, atendimento, frequência de releases e margem para crescimento. Modelos de transcrição locais reduzem custo de processamento no servidor, mas aumentam distribuição, armazenamento e exigências do computador do usuário.

Políticas iniciais sugeridas para o planejamento:

| Decisão | Recomendação |
| --- | --- |
| Marca e produto | Suíte Edi com Edi Hub como central desktop |
| Plataforma de lançamento | Windows x64, versões suportadas definidas após validar o Electron adotado |
| Oferta | Uma assinatura individual para todas as ferramentas disponíveis |
| Cobrança aprovada | R$ 49,90/mês ou R$ 499/ano (revisão aprovada em 17/10/2026), com as mesmas funcionalidades |
| Titular comercial | Pessoa jurídica (CNPJ); publicador Windows usa a identidade empresarial validada |
| Trial | Desabilitado inicialmente |
| Dispositivos | Dois computadores por conta, contando a suíte como uma ativação |
| Uso offline | Até 72 horas, sem ultrapassar o período comercial confirmado |
| Inadimplência | Bloqueio de novas concessões e restrição conforme a política atual |
| Preservação de trabalho | Salvar e recuperar projetos existentes mesmo em modo restrito |
| Desenvolvimento | Monorepo e padrão desktop como base comum; interfaces existentes preservadas |
| Versão comercial | Uma versão por release para Hub e ferramentas, com feeds separados |
| Publicação | Tag ou GitHub Release aciona build, teste, assinatura, upload e ativação |
| Atualização do usuário | Download automático e instalação no fechamento seguro ou próximo início apropriado |
| Funcionalidades pendentes | Backlog posterior, fora do escopo da integração da suíte |
| IA inicial | Provedores do usuário; IA hospedada com orçamento e créditos separados |

Preço, eventual trial, limite de dispositivos e duração offline são escolhas comerciais configuráveis. A implementação deve usar esses parâmetros explicitamente, com versionamento da política e testes, evitando espalhar números e exceções pelo código.

## 17 Referências do repositório

- [README e convenções gerais](../../../README.md).
- [Arquitetura do monorepo](../../arquitetura-monorepo.md).
- [Arquitetura interna dos apps](../../arquitetura-apps.md).
- [Padrão de desenvolvimento desktop e matriz de versões](../../arquitetura-desktop.md).
- [Revisão de coerência e lacunas desta proposta](review.md).
- [Guia do package de billing](../../../packages/billing/CLAUDE.md).
- [Regra atual de acesso por assinatura](../../../packages/billing/src/access.ts).
- [Reconciliação de assinaturas](../../../packages/billing/src/sweepers.ts).
- [Schema de cobrança](../../../packages/db/src/schema/billing.ts).
- [Factory de autenticação](../../../packages/auth/src/index.ts).
- [Catálogo de produtos](../../../packages/config/src/products.ts).
- [Política de auditoria](../../audit-payload-policy.md).
- [Workflow atual de CI](../../../.github/workflows/ci.yml).

Documentação de origem a considerar na auditoria: `README.md` de cada ferramenta, `EDIPDF/REVIEW.md` e os planos e registros de implementação presentes nas cinco pastas. A importação deverá registrar versões e hashes efetivos; esses arquivos locais podem continuar mudando durante a transição.
