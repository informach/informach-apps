# Guia de desenvolvimento do Edi Hub e das ferramentas

Este guia descreve o fluxo implementado no checkout em 17/10/2026. Os comandos partem da raiz do repositório e os exemplos de terminal usam PowerShell. Para regras permanentes, consulte [AGENTS.md](../AGENTS.md) e a [arquitetura desktop](arquitetura-desktop.md). Para saber o que já foi publicado ou ainda está pendente, consulte o [estado do trabalho](estado-do-repositorio.md): conseguir abrir ou compilar um app localmente não comprova produção.

## 1. O que executar

| Parte | Papel | Comando de desenvolvimento |
| --- | --- | --- |
| Portal `apps/edi` | Site, cadastro, conta, assinatura, OAuth e API de licenças | `pnpm dev:edi` — navegador em `http://localhost:3006` |
| Hub `apps/edi-hub` | Central desktop para instalar, abrir e atualizar ferramentas | `pnpm --filter @informach/edi-hub dev` |
| EdiAula | Edição de vídeo e preparação de aulas | `pnpm --filter @informach/ediaula dev` |
| EdiCaptura | Captura de tela, gravação e anotações | `pnpm --filter @informach/edicaptura dev` |
| EdiFoto | Edição de imagens | `pnpm --filter @informach/edifoto dev` |
| EdiPDF | Edição e organização de PDFs | `pnpm --filter @informach/edipdf dev` |
| EdiSVG | Criação e animação vetorial | `pnpm --filter @informach/edisvg dev` |

O Hub e os cinco editores são aplicativos Electron independentes. Para desenvolver o EdiFoto, execute seu próprio `dev`; não é preciso abrir o Hub primeiro. A abertura direta continua sujeita à mesma licença. Os botões de instalação do Hub trabalham com instaladores e releases assinados, não com os servidores `dev` dos outros workspaces.

No portal, Next.js serve páginas e APIs por HTTP. No Electron, `electron-vite dev` inicia a aplicação nativa e o servidor de desenvolvimento do renderer. A URL interna desse renderer não substitui a aplicação: um navegador comum não possui o preload nem as operações de arquivo, captura e sistema do main. A interface recebe atualizações durante o desenvolvimento; alterações em main/preload exigem verificar o processo reiniciado e, em caso de dúvida, encerrar e executar `dev` novamente. Configuração pública da suíte é incorporada durante o build, portanto mudar essas variáveis também exige reinício/rebuild.

## 2. Preparar o ambiente

Use Node **24.15.0** e pnpm **9.15.0**, conforme `.nvmrc`, `packageManager` e workflows. O Electron homologado usa seu próprio runtime; a versão do Node instalada no terminal não altera esse runtime.

```powershell
git branch --show-current
git status --short
node --version
pnpm --version
pnpm install --frozen-lockfile
```

Confira o diff antes de trabalhar e preserve alterações existentes. As bibliotecas internas usam `workspace:*` e TypeScript fonte; não é necessário publicar packages no npm nem gerar um `dist` compartilhado.

Windows é o ambiente de referência para captura, automação nativa, DPAPI, instaladores NSIS e testes Electron da suíte. Testes de domínio, portal e parte do build também rodam em Linux no CI; isso não homologa os recursos Windows. Docker com containers Linux é necessário para compilar o bundle próprio de FFmpeg/FFprobe. Não é requisito para simplesmente iniciar o Hub em desenvolvimento.

## 3. Perfis locais separados dos dados pessoais

Antes de abrir um desktop para desenvolver, use um terminal dedicado e configure diretórios de trabalho isolados. O cofre compartilhado e o perfil de cada editor são coisas diferentes; configure ambos. Este exemplo mantém os dados em `.cache/edi-dev` e permite que os apps compartilhem a mesma sessão de desenvolvimento:

```powershell
$ediDevRoot = Join-Path (Get-Location) '.cache/edi-dev'
$env:EDI_SUITE_TEST_PROFILE = Join-Path $ediDevRoot 'suite'
$env:EDIAULA_USER_DATA = Join-Path $ediDevRoot 'ediaula'
$env:EDICAPTURA_TEST_PROFILE = Join-Path $ediDevRoot 'edicaptura'
$env:EDIFOTO_USER_DATA = Join-Path $ediDevRoot 'edifoto'
$env:EDIPDF_USER_DATA = Join-Path $ediDevRoot 'edipdf'
$env:EDISVG_USER_DATA = Join-Path $ediDevRoot 'edisvg'
New-Item -ItemType Directory -Force -Path $env:EDI_SUITE_TEST_PROFILE, $env:EDIAULA_USER_DATA, $env:EDICAPTURA_TEST_PROFILE, $env:EDIFOTO_USER_DATA, $env:EDIPDF_USER_DATA, $env:EDISVG_USER_DATA | Out-Null
```

O Hub usa uma subpasta `hub` do perfil compartilhado. Essas opções são aceitas apenas pelo app não empacotado; não são mecanismos de licença e não redirecionam o perfil de um instalador comercial. Os testes nativos já criam seus próprios perfis temporários. Use cópias de projetos e destinos descartáveis: um perfil isolado não impede que um diálogo de arquivo escolha um documento pessoal.

Ao usar outro terminal, repita a configuração necessária. Fechar esse terminal encerra suas variáveis de processo; não grave essas opções como configuração global do Windows. Evite executar simultaneamente a versão pessoal instalada e o editor em teste, pois os apps usam locks de instância e alguns mantêm serviços locais.

## 4. Subir o portal local

O portal precisa de PostgreSQL de desenvolvimento, separado de produção. Para verificações automatizadas sem preparar um banco persistente, prefira a integração descartável da seção de testes.

1. Se ainda não existir, copie `apps/edi/.env.example` para `apps/edi/.env.local`. Preserve qualquer arquivo local já configurado.
2. Configure `DATABASE_URL` para o banco local isolado, `NEXT_PUBLIC_APP_URL=http://localhost:3006`, e valores fortes exclusivos de desenvolvimento para `BETTER_AUTH_SECRET` e `CRON_SECRET` — ambos exigem ao menos 32 caracteres.
3. Mantenha `STRIPE_MODE=dev`, `EDI_BILLING_ENABLED=false` e `SENTRY_DSN` vazio no início. Para cadastro manual, `EMAIL_SANDBOX_MODE=sandbox` grava mensagens em `EMAIL_SANDBOX_DIR`, por padrão `./tmp/emails` relativo ao processo do portal. Os arquivos permitem consultar o OTP local sem enviar e-mail. O modo `memory` do exemplo é útil nos testes, mas não oferece uma caixa de entrada no navegador.
4. Aplique as migrations no banco isolado e provisione o cliente OAuth antes do primeiro login desktop.

Com a `DATABASE_URL` local explicitamente configurada no terminal, o comando abaixo aplica o histórico completo do package de banco. Ele também lê a `.env` da raiz como fallback; confira o destino antes de executar, pois a `.env.local` do portal não é carregada automaticamente por esse script.

```powershell
pnpm --filter @informach/db db:migrate
```

O comando de setup OAuth também não carrega sozinho a `.env.local`. Para executá-lo com esse arquivo, usando o Node e o `tsx` já presentes no workspace:

```powershell
pnpm --filter @informach/edi exec node --env-file=.env.local --import tsx scripts/setup-oauth.ts
pnpm dev:edi
```

O setup é idempotente e cria um cliente OAuth nativo público, sem client secret. Variáveis já exportadas no terminal prevalecem sobre o arquivo; não reutilize um terminal com credenciais de produção. O `pnpm db:migrate` da raiz é mais amplo: além das migrations, executa o backfill de tarefas e a inicialização do storage Mastra. Siga o [runbook](deploy-runbook.md) quando trabalhar nessa frente compartilhada.

## 5. Login e licença durante o desenvolvimento

O botão **Conectar conta** abre o portal no navegador. O usuário entra na conta e autoriza o código do dispositivo; o desktop recebe a sessão e solicita uma licença assinada para aquele dispositivo. Credenciais ficam no cofre protegido do main, nunca no renderer. O Hub não concede acesso aos editores por conta própria.

Para conectar um desktop não empacotado ao portal local, as configurações precisam corresponder:

| Portal | Desktop, no terminal antes de `dev` | Relação |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL=http://localhost:3006` | `EDI_PORTAL_URL=http://localhost:3006` | Mesma origem, inclusive escolha entre `localhost` e `127.0.0.1` |
| `EDI_DESKTOP_CLIENT_ID=edi-desktop-development` | `EDI_DESKTOP_CLIENT_ID=edi-desktop-development` | Mesmo cliente provisionado pelo setup OAuth |
| `EDI_LICENSE_KEY_ID` e `EDI_LICENSE_PRIVATE_KEY` de desenvolvimento | `EDI_LICENSE_PUBLIC_KEYS` | JSON que associa o mesmo ID à chave pública Ed25519 correspondente |
| `EDI_MINIMUM_CLIENT_VERSION` | Versão do app obtida pelo Electron | O cliente deve atender ao piso do servidor |

### Criar a identidade local uma única vez

Este exemplo usa `node:crypto` e cria arquivos exclusivos de desenvolvimento na pasta ignorada `.cache/edi-dev/license`. Ele recusa uma pasta já existente e não sobrescreve arquivos. Não use as chaves do ambiente de publicação.

```powershell
@'
import { generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
const directory = resolve(".cache/edi-dev/license");
await mkdir(dirname(directory), { recursive: true });
await mkdir(directory);
const pair = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const keyId = "edi-license-development";
await writeFile(join(directory, "backend.json"), JSON.stringify({ keyId, privateKey: pair.privateKey }), { flag: "wx", mode: 0o600 });
await writeFile(join(directory, "public-keys.json"), JSON.stringify({ [keyId]: pair.publicKey }), { flag: "wx", mode: 0o600 });
console.log("Identidade local criada; nenhum valor de chave foi impresso.");
'@ | node --input-type=module
```

No **terminal exclusivo do backend**, carregue a privada e inicie/reinicie o portal:

```powershell
$ediBackendKey = Get-Content -Raw '.cache/edi-dev/license/backend.json' | ConvertFrom-Json
$env:EDI_LICENSE_KEY_ID = $ediBackendKey.keyId
$env:EDI_LICENSE_PRIVATE_KEY = $ediBackendKey.privateKey
pnpm dev:edi
```

Não inicie o desktop desse terminal. Abra outro e carregue somente a pública, como abaixo. Reutilize esse par nas próximas sessões: regenerar a chave invalida a confiança das licenças locais existentes. Se a geração parar pela metade, inspecione os arquivos antes de qualquer substituição; o exemplo não tenta recuperar nem apagar uma identidade anterior. Os arquivos são segredos de desenvolvimento locais, não um backup de produção.

A configuração desktop é lida por `@informach/edi-desktop/build` a partir do ambiente do processo: não suponha que a `.env.local` do Next será carregada pelo Electron.

Exemplo, depois de preparar um arquivo local contendo **somente** o mapa de chaves públicas:

```powershell
$env:EDI_PORTAL_URL = 'http://localhost:3006'
$env:EDI_DESKTOP_CLIENT_ID = 'edi-desktop-development'
$env:EDI_LICENSE_PUBLIC_KEYS = Get-Content -Raw '.cache/edi-dev/license/public-keys.json'
$env:EDI_COMMERCIAL_BUILD = 'false'
pnpm --filter @informach/edi-hub dev
```

Um mapa tem a forma `{"id-da-chave":"PEM da chave pública"}`; as quebras de linha do PEM devem ser escapadas corretamente como JSON. O modo de desenvolvimento aceita autenticação apenas em loopback. Não aponte esse modo para o portal de produção.

**Login não equivale a licença.** Sem chave de licença configurada ou sem direito comercial válido, o desktop continuará restrito. Desabilitar billing impede o checkout; não libera o editor. Não há hoje um comando único que prepare uma sessão interativa permanentemente licenciada, nem um seed genérico para liberar qualquer usuário. O caminho manual usa os serviços reais em ambiente de teste, conforme os passos abaixo.

### Sessão interativa com assinatura de teste

1. Prepare o portal, banco local, cliente OAuth, e-mail sandbox e par de licença de desenvolvimento conforme acima. Cadastre uma conta local e confirme o OTP do sandbox.
2. Com `STRIPE_SECRET_KEY` **de teste** carregada no terminal a partir do armazenamento local seguro, confira o catálogo existente:

   ```powershell
   pnpm exec tsx scripts/edi/stripe-provision.mts --mode dev
   ```

   O comando retorna IDs e mudanças propostas. Se faltarem recursos, `pnpm exec tsx scripts/edi/stripe-provision.mts --mode dev --apply` cria o catálogo/Portal Edi no modo teste; essa ação altera a conta Stripe de teste. O provisionador recusa uma chave live nesse modo. Reutilize os recursos corretos, sem alterar produtos de outros apps.
3. Preencha a `.env.local` do portal com essa `STRIPE_SECRET_KEY`, os dois IDs retornados em `EDI_MONTHLY_PRICE_DEV`/`EDI_ANNUAL_PRICE_DEV` e `STRIPE_PORTAL_CONFIGURATION_ID`. Mantenha `STRIPE_MODE=dev`.
4. Em outro terminal com Stripe CLI disponível e a mesma chave de teste carregada, encaminhe os eventos ao portal local:

   ```powershell
   $env:STRIPE_API_KEY = $env:STRIPE_SECRET_KEY
   stripe listen --latest --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,charge.refunded,charge.dispute.created,charge.dispute.closed --forward-to http://localhost:3006/api/webhooks/stripe
   ```

   Copie o segredo do listener somente para `STRIPE_WEBHOOK_SECRET` na `.env.local`; não o publique em logs, evidências ou chat. Ele pertence ao listener local, não ao endpoint live. Esse fluxo de encaminhamento é documentado pelo [Stripe CLI](https://docs.stripe.com/webhooks#local-listener).
5. Agora defina `EDI_BILLING_ENABLED=true` **somente nesse portal local**, reinicie `pnpm dev:edi` e mantenha o listener aberto. Pela conta local, conclua o checkout usando exclusivamente os [dados de pagamento de teste da Stripe](https://docs.stripe.com/testing). O retorno do checkout sozinho não comprova licença: confira a entrega dos eventos e a reconciliação.
6. O webhook enfileira a reconciliação. O `next dev` não cria o cron do Railway; para executar o job local, carregue no terminal o mesmo `CRON_SECRET` local e chame:

   ```powershell
   Invoke-RestMethod -Method Post -Uri 'http://localhost:3006/api/jobs/reconcile' -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
   ```

   Repita quando precisar processar novos eventos ou atualizar os fatos comerciais durante uma sessão de desenvolvimento prolongada. O job consulta Stripe de teste e o banco local configurados no portal; não escreve uma licença arbitrária.
7. Execute o desktop com o perfil e a chave pública de desenvolvimento. Use **Conectar conta**, autorize o dispositivo no portal local e **Verificar acesso**. O acesso só será concedido quando os fatos de pagamento, o dispositivo e a versão permitirem.

Ao encerrar, pare o listener e os processos locais. Gerencie/cancele somente as assinaturas de teste que você criou. Não use os IDs/chaves live nem o banco de produção para esse fluxo. O [registro Stripe](propostas/edi-suite-2026-10-16/producao-stripe.md) contém os contratos e as evidências dos testes existentes.

Para verificar automaticamente os estados de acesso sem providers reais, use `pnpm edi:test:native`: o harness controla um servidor loopback, gera chaves efêmeras e licenças de fixture, verifica bloqueios e elimina seus perfis ao terminar. Ele não deixa uma sessão interativa permanente nem substitui a preparação descrita acima.

## 6. Onde implementar uma funcionalidade

| Mudança | Camada principal |
| --- | --- |
| Botão, painel, seleção, timeline, interação visual | Renderer do app em `src/renderer` |
| Modelo de documento ou contrato IPC puro | `src/shared` do app; `edi-contracts` apenas quando o contrato é da suíte |
| Leitura/escrita, exportação, captura, subprocessos | Main do app em `src/main` |
| Operação segura exposta à interface | Preload do app em `src/preload` |
| Sessão, licença local, integridade, atualização ou preservação de jobs | `packages/edi-desktop` |
| Catálogo de ferramentas e identidades Windows | `packages/config/src/edi-tools.ts` |
| Cor e glifo de cada ferramenta, usados pelo portal e pelo Hub | `packages/config/src/edi-brand.ts`; ícones Windows por `scripts/edi/make-icons.ps1`, com os mesmos cantos arredondados do SVG |
| Texto e próxima ação do Hub para cada estado de acesso | `apps/edi-hub/src/renderer/src/access-copy.ts`, uma entrada por `cause` do status desktop; falhas de IPC em `failure-copy.ts` |
| Conta, checkout, páginas e rotas HTTP | `apps/edi` |
| Regra de licença e persistência comercial do servidor | `packages/edi-licensing`; schema/migrations em `packages/db` |
| Manifesto e descoberta de release pública assinada | `packages/edi-contracts` e `packages/edi-releases` |

Fluxo típico: renderer chama uma capacidade específica do preload; preload valida/serializa o contrato; main autoriza a operação, valida entradas e executa o domínio. Use `desktopIpc` na composição do main e os helpers `desktopFiles`/`@informach/edi-desktop/files` para capabilities e escrita segura. Não exponha um `invoke` genérico, Node, banco, caminhos arbitrários ou segredos no renderer. Operações MCP precisam da mesma autorização da ação feita pela interface.

Uma feature exclusiva de um editor permanece no app. Extraia um package quando houver responsabilidade compartilhada real. Apps não importam apps e packages não importam apps. Preserve os renderers existentes; código novo de domínio/infraestrutura usa TypeScript, e novas interfaces usam React conforme o padrão desktop.

### Arquivos, tarefas longas e recuperação

Valide o documento com schema na leitura e na escrita, mantenha versão de formato e preserve campos compatíveis. Reutilize `atomicWrite`, `withStagedFiles` e os helpers de backup existentes; teste roundtrip, entrada inválida, falha de gravação e preservação de uma saída anterior. Um export interrompido não pode sobrescrever o original.

Uma operação longa já autorizada deve registrar seu ciclo com `desktopJobs.begin`, conectar `stop` ao cancelamento real, chamar `check()` entre etapas e antes do commit, e finalizar com `finish()` em `finally`. A primeira restrição fixa a janela, no máximo 30 minutos; renovar acesso ou repetir eventos não reinicia essa janela. Gravações/capturas usam preservação imediata (`preserveForMs: 0`) e mantêm material recuperável. Novas tarefas permanecem bloqueadas.

`recoveryChannels` deve conter apenas ações necessárias para parar ou salvar trabalho existente. Adicionar um canal ali não substitui a validação de destino, a confirmação de recuperação nem autoriza iniciar trabalho novo. Teste a expiração com operações e diálogos já abertos. Consulte a [evidência de preservação](propostas/edi-suite-2026-10-16/producao-jobs.md).

### Recursos nativos e ASAR

ASAR é o arquivo virtual de aplicação que o Electron consegue ler. Um FFmpeg ou outro executável externo não consegue abrir um caminho dentro dele. No EdiAula, `native-resources.ts` resolve as fontes, o auxiliar nativo `native/ediaula-helper.exe` e o modelo de redução de ruído `rnnoise/sh.rnnn` (lido pelo FFmpeg no tratamento da voz) em `process.resourcesPath` quando empacotado; `installer-config.mts` os copia por `extraResources` e os exclui do ASAR, e o aviso de terceiros cita a origem do modelo. `fonts.json` pode continuar no ASAR porque é lido pelo Electron.

O auxiliar nativo substitui os antigos scripts PowerShell de cursor e de entrada guiada: lista monitores, saídas da Desktop Duplication e janelas (`list`), registra mouse, formato do cursor e atalhos (`hook`), move e clica no modo guiado (`input`) e tem um autoteste de captura de cursor (`selftest`). As fontes C# 5 ficam em `apps/ediaula/native/helper`; `apps/ediaula/scripts/build-native-helper.mjs` compila com o `csc.exe` do .NET Framework 4.x que vem no Windows (ou o indicado em `CSC`), grava a versão do app (ou a da tag `EDI_RELEASE_TAG` no release) e só recompila quando fontes, versão ou opções mudam. Os scripts `dev`, `build` e `test` do app chamam esse passo; fora do Windows ele apenas avisa. O executável fica em `resources/native`, fora do Git. O protocolo de linhas JSON está em `src/shared/helperProtocol.ts`, e `src/main/nativeHelper.ts` valida as linhas, vigia o batimento e reinicia o auxiliar (esperando o processo antigo sair e devolvendo à ordem normal as janelas que ele tinha posto na frente). No `beforePack`, o instalador confere que o executável existe e que `--version` é a versão do release. Se o `rename` do executável falhar porque um EdiAula de desenvolvimento o está usando, o script para com essa mensagem. Os testes que geram entrada real (cliques e rolagens retidos pelo próprio teste, movimentos do ponteiro) só rodam com `EDIAULA_NATIVE_INPUT_TESTS=1`; `edi:media:test` liga a variável, então eles rodam no runner Windows do workflow de mídia.

Para conferir o inventário assinado, o hash precisa dos bytes físicos do arquivo ASAR inteiro. O `fs` normal do Electron apresenta esse arquivo como uma pasta virtual; por isso o startup e o gerenciador de instalações do Hub fornecem `electronInstallationFileSystem`, baseado em `original-fs`, ao verificador compartilhado. Os scripts Node de empacotamento usam o filesystem Node. Preserve essa composição ao acrescentar um consumidor; não altere globalmente o comportamento de ASAR do processo.

FFmpeg/FFprobe de desenvolvimento vêm dos wrappers em `devDependencies`; o app instalado usa exclusivamente `resources/native-media/bin`. Novos recursos usados por subprocessos precisam de caminho físico, inclusão no pacote, licenças/notices e cobertura no inventário assinado. Teste também o empacotamento: funcionar por `app.getAppPath()` em desenvolvimento não comprova funcionamento instalado.

## 7. Verificar a mudança

Comece pelos testes da área alterada; amplie para os consumidores quando tocar um package compartilhado. Os apps não usam todos o mesmo runner:

```powershell
pnpm --filter @informach/edi-hub test
pnpm --filter @informach/edi-desktop test
pnpm --filter @informach/edi-licensing test
pnpm --filter @informach/ediaula test
pnpm --filter @informach/edicaptura test
pnpm --filter @informach/edifoto test
pnpm --filter @informach/edipdf test
pnpm --filter @informach/edisvg test
```

Hub, SDK e licensing usam Vitest; os cinco editores usam `node:test`. Exemplos focados:

```powershell
pnpm --filter @informach/edi-desktop exec vitest run src/controller.test.ts
pnpm --filter @informach/ediaula exec node --test tests/project-preservation.test.ts
pnpm --filter @informach/edicaptura exec node --test src/main/recording-preservation.test.cjs
```

Hub, Aula, Foto e PDF têm script `typecheck`; Captura não tem esse script, e SVG oferece `check`. Não invente comandos comuns para os apps legados. Na raiz, os gates transversais são:

```powershell
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

`typecheck` e `test` da raiz incluem o tooling Edi. Eles também verificam produtos web não relacionados; um erro deve ser identificado, não escondido com skip ou alteração de escopo. Não execute build e testes que reescrevem `out`/`.next` simultaneamente no mesmo checkout.

| Verificação | Comando e requisitos |
| --- | --- |
| OAuth, banco e licenças | `pnpm edi:test:integration` — Windows; PostgreSQL descartável com migrations completas, sem banco existente |
| Portal standalone real | `pnpm build:edi`, depois `pnpm edi:test:integration --portal` — acrescenta HTTP, assets, auth e readiness; não é só `next dev` |
| Fluxo Electron e acesso | `pnpm edi:test:native` ou `pnpm edi:test:native edifoto` — Windows, perfis isolados, builds próprios, fixtures e screenshots em `.cache/edi-native-results` |
| Tooling de release | `pnpm edi:typecheck:tooling` e `pnpm edi:test:tooling` |
| Ciclo financeiro de teste | `pnpm edi:test:integration --stripe` — exige `EDI_STRIPE_TEST_KEY`; cria recursos de teste no provider |
| Webhook Stripe por HTTP | `pnpm edi:test:integration --stripe-http` — exige a mesma chave de teste e Stripe CLI; consultar homologação antes de operar |

O runner descartável limpa banco e diretório ao finalizar. O CI Linux usa o serviço PostgreSQL declarado no workflow de integração em vez do binário portátil Windows. Os harnesses não substituem aceite de captura/GPU em hardware representativo nem verificação de projetos reais copiados para ambiente descartável.

## 8. Build, pacote, instalação e release são etapas diferentes

| Etapa | Resultado |
| --- | --- |
| `pnpm --filter @informach/edi-hub build` | Compila main, preload e renderer em `out`; não gera instalador |
| `pnpm --filter @informach/edi-hub start` | Abre o build local pelo preview Electron; requer build anterior |
| `pnpm edi:test:package edi-hub` | Monta e verifica layout empacotado com chaves efêmeras, em Windows |
| `pnpm edi:test:package --installer edi-hub` | Também gera NSIS de teste; fora do CI não o instala nem publica |
| `pnpm edi:test:upgrade edi-hub` | Instala A/B e verifica upgrade/desinstalação; restrito a runner Windows descartável hospedado pelo GitHub |
| Workflow de release `edi-v*` | Compila a versão comercial, assina inventários/manifesto, verifica e publica a suíte no repositório público de distribuição |

`edi:test:package` aceita um ou mais IDs do catálogo; sem IDs verifica todos. `edi:test:upgrade` recebe um app por execução. Para EdiAula é necessário preparar o bundle próprio antes:

```powershell
pnpm edi:media:build
pnpm edi:media:test
pnpm edi:test:package --installer ediaula
```

`edi:media:build` usa Docker Linux para compilar as fontes fixadas em `scripts/edi/media/sources.lock.json`; `JOBS` define o paralelismo do compilador (padrão 2) sem mudar o resultado, e numa máquina de 12 threads com `JOBS=6` a compilação completa levou cerca de 12 minutos. O FFmpeg sai com NVENC, AMF (só os cabeçalhos do GPUOpen; o runtime vem no driver da AMD) e Media Foundation. `edi:media:test` exige Windows, verifica os binários, inclusive `h264_amf`, `h264_mf` e `scale_d3d11`, e executa os testes EdiAula contra eles. Passar com os wrappers de desenvolvimento não comprova compatibilidade com esse bundle. Fontes correspondentes, receitas e licenças acompanham os binários no pacote.

Na gravação, o EdiAula escolhe o codificador gravando a tela real com cada um, por três segundos, ao abrir o gravador (`src/main/encoders.ts`, escolha em `src/shared/encoderChoice.ts`), e guarda o resultado em `encoders.json` no perfil, por tela, tamanho e taxa, com chave na versão e na configuração do FFmpeg, nas placas e drivers e na versão do app. Se o escolhido não abrir a gravação, o gravador tenta o caminho seguinte e registra a falha no cache. Sem uma GPU AMD ou Intel à mão, AMF e Media Foundation só foram exercitados aqui até onde o hardware disponível permite; confirme numa máquina com essas placas antes de prometer o caminho pela GPU para elas.

Não instale pacotes de teste no perfil pessoal nem simule as variáveis do GitHub para contornar a restrição do smoke. Os scripts legados `pack`/`dist` do Captura e `package` do SVG não substituem o pipeline comum da suíte.

## 9. Caminho até a distribuição

O portal/backend é implantado no Railway. Os instaladores e o manifesto assinado vão para GitHub Releases em `informach/edi-releases`; o código permanece privado. Alterar o portal não atualiza automaticamente os executáveis, e publicar executáveis não implanta o backend.

O workflow [edi-release.yml](../.github/workflows/edi-release.yml) parte de tag `edi-v*` ou execução manual com tag existente. Exige ancestralidade de `main`, ambiente protegido `edi-release`, configuração/portal prontos, qualidade, integração de banco e upgrade Windows. O encadeamento de mídia compila em Linux e verifica em Windows; os instaladores reutilizam o mesmo artefato aprovado. Depois são montados e publicados os seis instaladores e o manifesto da suíte.

`pnpm edi:installer <id>` e `pnpm edi:publish` são os scripts usados pelo pipeline, não atalhos de desenvolvimento. Exigem versão, commit, configuração pública e credenciais do ambiente protegido. As chaves privadas de atualização pertencem à publicação; a privada de licença pertence ao backend. O cliente recebe somente âncoras públicas e sua identidade local de dispositivo. Na distribuição atual, Ed25519 comprova a integridade da suíte, mas não equivale a Authenticode nem a um publicador certificado pelo Windows.

Uma alteração diária deve ter escopo, testes, documentação e revisão antes de commit/merge/publicação conforme a autorização da tarefa. Siga o [manual de distribuição](propostas/edi-suite-2026-10-16/distribuicao-piloto.md), o [registro Windows](propostas/edi-suite-2026-10-16/producao-windows.md) e o [runbook do portal](../apps/edi/PRODUCAO.md) para operações reais. A publicação não deve forçar o fechamento de trabalho aberto.

## 10. Acrescentar uma ferramenta

1. Defina a responsabilidade, formato de documento e limites da ferramenta. Crie `apps/<id>` com nome `@informach/<id>`, scripts reais de desenvolvimento/build/test/typecheck, main/preload/renderer separados e interfaces novas em React/TypeScript.
2. Registre o ID, nome, identidade Windows única e extensões em `packages/config/src/edi-tools.ts`. Esse é o catálogo da suíte; não crie uma segunda lista no Hub, no portal ou em scripts PowerShell. A identidade visual fica em `packages/config/src/edi-brand.ts`, cujo tipo exige uma entrada por ferramenta; o único espelho é o desenho dos ícones em `scripts/edi/make-icons.ps1`, que não importa TypeScript e deve mudar junto.
3. Integre `ediBuildOptions`, `createEdiDesktop`, `exposeEdiBridge`/`protectEditor`, IPC autorizado e recuperação adequada. A ferramenta deve validar acesso quando aberta diretamente e compartilhar o contrato de sessão, licença, inventário e atualização.
4. Implemente formato versionado, persistência segura e perfis isolados. Inclua cor e glifo em `edi-brand.ts`, o desenho em `make-icons.ps1` e rode o script para gerar `resources/icon.{png,ico}`; acrescente notices e recursos nativos físicos quando necessários. Declare os exports públicos de um package novo e identifique seus consumidores.
5. Atualize contratos e testes afetados pelo novo catálogo. **O release atual valida explicitamente seis apps e sete assets** em `edi-contracts/src/index.ts` e `scripts/edi/github-publication.mts`; a ampliação exige revisar essa cardinalidade, o manifesto e sua compatibilidade com clientes já distribuídos. O schema `packages/db/src/schema/edi.ts` também mantém a constraint `edi_artifacts_app_chk` com os IDs permitidos: atualize a definição e gere uma nova migration compatível, sem editar a migration já aplicada. Apenas adicionar uma entrada ao catálogo ainda não basta.
6. Acrescente os cenários específicos da ferramenta ao harness nativo e valide bridge bloqueada, login/expiração, recuperação, arquivo existente, abertura direta, instalação e upgrade. As matrizes de workflow são derivadas do catálogo, mas os casos de comportamento não surgem automaticamente.
7. Verifique o conjunto de consumidores, documentação, portal e pipeline antes de incluir a ferramenta numa release completa. Não publique uma suíte com parte dos instaladores ausente.

## 11. Diagnóstico rápido

| Sintoma | Primeiro ponto a conferir |
| --- | --- |
| `pnpm dev:edi` abriu um site, não o Hub | Esse é o portal; execute o workspace `@informach/edi-hub` |
| Editor abre restrito | Portal acessível, setup OAuth, origem/client ID, chave pública correspondente, versão mínima e direito comercial; leia a razão exibida |
| Cadastro espera OTP que não chega | `EMAIL_SANDBOX_MODE`; para uso manual local, abra os arquivos do sandbox em vez de esperar envio externo |
| Alterei uma variável e nada mudou | Reinicie/recompile o desktop; configuração pública é incorporada pelo build |
| Hub não abre meu editor em `dev` | Execute o workspace diretamente; Hub gerencia instalações verificadas, não processos de desenvolvimento |
| Recurso funciona em `dev`, falha empacotado | Confira `extraResources`, caminho fora do ASAR, executável nativo, inventário e permissões reais |
| Instalador de teste recusa execução local | O smoke/upgrade exige runner descartável GitHub-hosted; use o workflow, não falsifique o ambiente |
| Teste/build mudou outro app | Confira dependências compartilhadas e concorrência no checkout; não reutilize `out` ou `.next` enquanto outro processo os reescreve |

Para logs, use códigos de operação e IDs permitidos pela [política de auditoria](audit-payload-policy.md). Não registre documentos, corpos de requests, tokens ou chaves. Novos erros operacionais do portal passam por `apps/edi/src/lib/observability.ts` e sua sanitização; testes locais devem permanecer sem DSN real.
