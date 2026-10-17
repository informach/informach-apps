# Distribuição e atualização do piloto Edi

Decisão aprovada em 16 de outubro de 2026: usar GitHub Releases e assinaturas criptográficas próprias, sem contratar certificado Authenticode ou armazenamento/CDN. A assinatura de acesso à suíte continua no Stripe, por R$ 49,90/mês ou R$ 499/ano (valores revisados e aprovados em 17/10/2026), e só poderá cobrar após homologação. Esta decisão substitui a distribuição originalmente proposta; não altera o backlog funcional dos editores.

## Proteções e limites

O código permanece no repositório privado `informach/informach-apps`. O repositório público `informach/edi-releases` recebe somente instaladores, manifesto e documentação pública. Uma release contém Edi Hub, EdiAula, EdiCaptura, EdiFoto, EdiPDF, EdiSVG e `edi-release.json`.

O manifesto assinado Ed25519 vincula versão, canal, commit e os hashes SHA-512, tamanhos e URLs canônicas dos seis instaladores. Cada instalação contém um inventário assinado dos arquivos empacotados, incluindo executável e ASAR. A aplicação verifica o inventário antes de abrir o editor; o Hub verifica os arquivos antes de executar uma ferramenta instalada. As chaves confiáveis são incorporadas ao build, nunca obtidas automaticamente de um arquivo remoto de chaves.

Essas verificações protegem uma instalação legítima contra atualizações alteradas. **Não substituem Authenticode, não impedem adulteração por quem controla integralmente o computador e não tornam a primeira instalação confiável para o Windows.** O Windows pode avisar ou bloquear executáveis sem certificado público. Não desabilitar SmartScreen, antivírus ou políticas corporativas. A primeira instalação deve vir do canal oficial, e ambientes que exigem publicador certificado ficam fora deste piloto.

A chave privada de atualização fica somente no secret do workflow autorizado e no backup protegido. A chave privada de licença é outra identidade e pertence ao backend. Nenhum token GitHub, chave privada, segredo Stripe ou credencial de banco vai para o desktop.

## Configuração já realizada

- Repositório público criado, Actions desabilitadas nele e releases imutáveis habilitadas.
- Ambiente `edi-release` no repositório privado, com políticas de branch `main` e tag `edi-v*`.
- Secret `EDI_UPDATE_SIGNING_PRIVATE_KEY` configurado e chave pública de atualização publicada para transparência.
- Secret `EDI_DISTRIBUTION_TOKEN` confirmado no ambiente `edi-release` do repositório privado; permissão efetiva ainda não testada em publicação.
- Variables `EDI_DISTRIBUTION_REPOSITORY`, `EDI_UPDATE_SIGNING_KEY_ID`, `EDI_UPDATE_PUBLIC_KEYS`, `EDI_LICENSE_PUBLIC_KEYS` e `EDI_DESKTOP_CLIENT_ID` configuradas.
- Chaves distintas geradas; backup local DPAPI em `.cache/edi-configuration/keys.v1.dpapi`. O script `pnpm edi:setup:github` exige também backup portátil `age` e verifica sua recuperação antes de configurar o GitHub. Backup local ilegível bloqueia a operação.
- `EDI_PORTAL_URL=https://edi.informach.com.br` configurada. O portal seguirá o Railway e a infraestrutura dos outros apps, conforme definido pelo titular.

Ainda faltam o deploy Railway/DNS com a chave de licença, a confirmação operacional da credencial e a homologação ponta a ponta. O [runbook do portal](../../../apps/edi/PRODUCAO.md) descreve essa implantação. O [registro de implementação](implementacao.md) reúne resultados e pendências; nenhum instalador foi publicado até esta revisão.

## Credencial de publicação entre repositórios

O `GITHUB_TOKEN` do repositório privado não concede escrita no repositório público separado. No piloto, criar um token fine-grained com proprietário `informach`, **somente** o repositório `edi-releases` e **Contents: Read and write**; não conceder administração, Actions, secrets nem acesso ao código privado. Salvar como `EDI_DISTRIBUTION_TOKEN` em **Settings → Environments → edi-release → Environment secrets** de `informach/informach-apps`. Não colar o token em chat, código, logs ou comandos versionados. [Autenticação do workflow](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token), [tokens fine-grained](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

Escolher expiração e registrar a data de renovação. Token expirado, revogado ou aguardando aprovação deve bloquear novas publicações, não downloads das versões já publicadas. Uma integração duradoura poderá migrar para GitHub App restrito a esse repositório, sem mudar os clientes. Não reutilizar a credencial pessoal ampla do terminal.

## Publicação de uma versão

1. Concluir os checks e o review do commit, integrá-lo a `main` e atualizar `scripts/edi/release-notes.json`.
2. Criar e enviar uma tag nova `edi-vX.Y.Z` ou `edi-vX.Y.Z-beta.N`. Também é possível publicar a Release correspondente no repositório privado ou executar manualmente o workflow com a tag existente. Um push comum de código não é uma publicação de aplicativo.
3. O workflow verifica que o commit pertence ao histórico de `main`, valida configurações e presença das credenciais, exige readiness do portal e executa lint, tipos e testes, incluindo integração PostgreSQL no mesmo ref de origem. As variables do ambiente são lidas nos steps, depois da inicialização do job, conforme o [ciclo de vida documentado pelo GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/variables).
4. O fluxo exige a homologação A→B de `edi-upgrade.yml`, incluindo a compilação/verificação de mídia nativa com suas fontes correspondentes. A matriz Windows, derivada do catálogo, testa cada app nativamente com perfis isolados e licenças efêmeras, sem bypass no produto, e preserva as capturas. Depois compila o app comercial pelo lockfile, aplica os fuses, assina o inventário final e gera NSIS sem certificado externo. O smoke de instalação e desinstalação roda somente no runner Windows descartável, preservando sentinelas de perfil/documentos. As capturas de teste não integram os assets de distribuição. Procedimentos, evidências e limites ficam no [registro Windows](producao-windows.md).
5. O job de publicação confere os seis descriptors, versão, commit e bytes. Prepara um draft no repositório público e envia somente os arquivos faltantes. Um arquivo já enviado com bytes diferentes bloqueia a tentativa; não há sobrescrita.
6. Antes de publicar, confirma exatamente sete assets e seus digests SHA-256 calculados pelo GitHub. Só então torna a release pública e confirma o resultado. Releases imutáveis não podem receber alterações posteriores; correções recebem outra versão. [Releases imutáveis](https://docs.github.com/en/repositories/releasing-projects-on-github/about-immutable-releases).

Se um build, smoke ou upload falhar, a versão anterior continua disponível. Uma tentativa posterior pode retomar um draft da mesma versão e commit. Nunca mover a tag ou substituir arquivos para “consertar” uma release publicada. O workflow serializa publicações para evitar disputa entre versões.

## Atualização no computador

Cada app consulta o catálogo no início e a cada 15 minutos, baixa o próprio instalador e usa o provider customizado e o verificador documentados do `electron-updater`. O marcador obrigatório no `app-update.yml` garante a participação do verificador próprio; remover o marcador bloqueia o app empacotado. A atualização independe de assinatura Stripe ativa, mas não libera uso do editor.

A instalação automática fica para o fechamento seguro. O instalador é verificado novamente antes da saída; NSIS nunca encerra um editor à força. Durante a passagem do updater para NSIS, aguarda a condição real de término do processo por até 30 segundos. Uma instalação manual com a ferramenta aberta é recusada. Locks compartilhados coordenam Hub e ferramentas; projetos e perfis ficam fora da instalação e não são apagados no uninstall.

O Hub pode baixar e instalar uma ferramenta fechada pelo mesmo manifesto. Ferramentas já instaladas continuam listadas quando o catálogo está indisponível, mas só abrem com inventário íntegro e licença válida. Com todos os processos fechados ou o computador desligado, não há atualização em segundo plano; a próxima execução retoma a checagem.

O canal estável nunca oferece beta automaticamente. Versões mais antigas que a instalada ou o maior catálogo aceito no canal são recusadas. Não há downgrade automático de documentos. Um defeito publicado deve ser corrigido com versão superior; ocultar ou bloquear a oferta depende das regras de imutabilidade do GitHub e não desfaz instalações existentes.

## Chaves e recuperação

O backup DPAPI depende do usuário e do perfil Windows atuais. Copiar apenas esse arquivo para outro computador **não** constitui recuperação portátil. Antes de distribuir amplamente, guardar uma cópia cifrada recuperável em meio separado, proteger a credencial de recuperação e testar a restauração sem publicar ou trocar as chaves. Nunca armazenar chave privada no repositório público nem no histórico Git.

Em 17/10/2026 o backup do perfil anterior não estava disponível neste computador e o repositório público ainda não tinha releases. Foi feita inicialização explícita **antes da primeira distribuição**, com novas identidades `edi-update-2026-10-17-a92e135e` e `edi-license-2026-10-17-a92e135e`. O script só admite `--initialize-unpublished` quando não há nenhuma release, inclusive draft. Depois do primeiro release, ausência de backup exige restauração, nunca regeneração silenciosa.

A cópia portátil foi cifrada com `age` 1.3.2 para a identidade SSH Ed25519 de recuperação já existente do operador, fora do checkout, em `C:/Users/tocha/.config/informach/edi/signing-keys-2026-10-17.age`. A chave SSH continua separada em seu armazenamento original. Recuperação em outro processo validou os dois pares Ed25519 por assinatura; alteração de um byte do arquivo foi rejeitada. Isso comprova recuperação portátil, não comprova que o operador já guardou a identidade SSH e o arquivo em outro equipamento ou cofre.

Com `age` instalado no PATH (ou `EDI_AGE_BINARY` apontando para seu executável), os comandos são:

```powershell
pnpm edi:setup:github --backup <arquivo.age> --recipient <chave-publica-de-recuperacao> --identity <identidade-de-recuperacao>
node scripts/edi/recover-keys.mjs --backup <arquivo.age> --identity <identidade-de-recuperacao>
# Somente se a cópia DPAPI local não existir:
node scripts/edi/recover-keys.mjs --backup <arquivo.age> --identity <identidade-de-recuperacao> --restore
```

O teste padrão não escreve arquivos. `--restore` cria um novo DPAPI para o usuário Windows atual e se recusa a sobrescrever um existente. Material privado transita por stdin/memória, sem aparecer nos argumentos, logs ou Git. O provisionador `scripts/edi/provision-backend.mjs` exige IDs explícitos de projeto/ambiente/serviço e conserva os segredos existentes; uma identidade de licença divergente bloqueia a operação. `--railway` permite indicar o executável nativo quando o CLI foi instalado por um shim npm no Windows.

Antes de qualquer gravação, os provisionadores comparam IDs e chaves públicas com o backend, o ambiente privado e o catálogo público. Também recusam âncoras adicionais, pares repetidos e mapas ausentes após a primeira publicação. Um backup antigo não pode substituir silenciosamente uma rotação posterior. A importação opcional `--stripe-env <arquivo>` aceita somente as sete variáveis de bootstrap Stripe, exige arquivo fora do checkout, modo `prod` e cobrança desabilitada; os valores são transferidos por stdin e conferidos sem impressão.

A versão mínima do cliente é enviada pelo desktop e incluída na licença assinada. `EDI_MINIMUM_CLIENT_VERSION` inicia em `0.1.0`; aumentar esse piso é uma decisão operacional para correção crítica, preservando a política de compatibilidade de 90 dias/duas versões anteriores em mudanças normais. Clientes abaixo do piso recebem `update_required`, mantendo acesso à atualização e recuperação de arquivos.

Uma rotação planejada deve distribuir primeiro um build que confie nas chaves antiga e nova, assinado com a antiga; após a adoção desse build, usar a nova chave e retirar a antiga em versão posterior. Clientes antigos não passam a confiar na chave nova pela simples alteração de `update-public-keys.json`. Em caso de comprometimento, suspender publicação, revogar a credencial de CI e preparar uma recuperação explícita; não prometer revogação retroativa de clientes offline.

## Homologação necessária antes do primeiro release

Exigir os seis instaladores finais compilados e instalados em runner isolado; atualização A→B; abertura direta, recuperação e bloqueio de licença; recusa de manifesto/instalador alterado; indisponibilidade de rede; processos abertos; e preservação de projetos/perfis. Validar também OAuth, webhooks, reconciliação, cancelamento, inadimplência e revogação no ambiente Stripe de testes. A compilação de um layout ou o sucesso de testes unitários não substitui essa homologação.

O runner `pnpm edi:test:native` já verificou localmente os seis apps com licenças Ed25519 de teste reais, armazenamento protegido do Electron, indisponibilidade HTTP 503, expiração e recusa IPC. Também verifica os controles de teclado no bloqueio e o cancelamento do fechamento do rascunho no EdiSVG. Ele não conclui uma compra Stripe, não instala EXEs, não testa upgrade A→B e não substitui o aceite de projetos representativos.

`pnpm edi:test:package --installer` compilou e verificou os seis instaladores NSIS com chaves efêmeras, sem instalar ou publicar. O portal standalone também passou no smoke HTTP com PostgreSQL descartável. Instalação real, upgrade A→B e publicação autenticada continuam como critérios separados.

GitHub não hospeda o banco nem o backend de assinaturas. O piloto evita contratar certificado e CDN, mas continua precisando de uma implantação real do portal/API, banco, e-mail e configuração Stripe. Não habilitar cobrança ou publicar builds apontando para domínios fictícios. A conta GitHub pode ter quotas de Actions e políticas de consumo; não habilitar gastos adicionais automaticamente.
