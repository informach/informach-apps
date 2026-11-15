# Recreio e Morada: nota de passagem (15/11/2026)

Para quem retoma a frente depois de uma pausa. Leia primeiro a [execução atual](execucao-2026-11-15.md) e [PRODUCAO.md](../../apps/recreio/PRODUCAO.md). O registro completo permanece em [`implementacao.md`](implementacao.md). O titular autorizou as cinco frentes e todos os achados, incluindo família/proteção e homologação comercial. Testes pesados, builds, empacotamento e E2E rodam **somente no GitHub**, nunca nesta máquina; arte/evidência licenciada somente no repositório privado.

## Onde está cada coisa

- **`origin/main` em `98890016`** inclui as correções de integridade, revogação, auditoria, limites, recuperação e proteção contra downgrade de formato. Oito conjuntos de tipos/unidades, 171 integrações, cinco jornadas do portal, 18 do cliente, 100 dias e prova antes/depois passaram. Portal/Morada estavam prontos em `0aa4c82c` na última consulta; conferir o deployment do commit seguinte antes de chamá-lo de vigente.
- **Alfa fechado implantado:** portal, Morada e manutenção, DNS/TLS, Redis, schema e Sentry conferidos. As três flags IaC estão em `true`; não são rollback. O titular entrou, criou um mundo, jogou e saiu. O backup lógico atual foi [restaurado em destino isolado](ensaio-backup-producao.md), com limpeza confirmada. Backups agendados, alerta humano, carga e custo por mundo ainda exigem prova. Não restaurar sobre a origem.
- **Arte D1 no volume, ainda desativada:** pacote privado e manifesto conferidos; jornada privada completa ainda em investigação, candidato de limitação da fila gráfica em verificação. O visual em produção permanece procedural. Não aplicar a configuração de arte só porque ela aparece como desejada na IaC.
- **A migração `0080_recreio`** já existe em produção, e a prontidão do portal confere a compatibilidade esperada. Não executar migrations isoladas da frente Compasso para esta entrega.
- A branch `feat/recreio` foi juntada à `main` e não tem nada a mais.

## A arte numa máquina nova

**Nenhum arquivo de arte entra neste repositório** (ele é público). O empacotador lê um clone parcial do `informach/artes-3d` (privado) no commit `4f3012101735ffddd066c31bb0bd8319723eb9ba`, sempre fora do repositório, e grava a saída também fora. O recorte de personagens usado no X2 tinha cerca de 550 MB; o D1 acrescenta móveis e construção:

```bash
gh repo clone informach/artes-3d <fora-do-repo>/artes-3d -- --filter=blob:none --no-checkout
cd <fora-do-repo>/artes-3d
git sparse-checkout set --no-cone /LEIA.md '/biblioteca/LEIA*.md' /biblioteca/info.json /biblioteca/rotulos.json \
  /biblioteca/corpos/ /biblioteca/itens/ /biblioteca/roupas_mascaras/ /biblioteca/roupas_gen/ /biblioteca/medidas/ \
  /biblioteca/props/ /biblioteca/moveis/ /biblioteca/construcao/ /codigo/arte/elenco.json /codigo/arte/cabelos.json /codigo/arte/roupas.json /paginas/tipos_de_corpo/ \
  /biblioteca/bibliotecas_30fps/adulto.glb /biblioteca/bibliotecas_30fps/idoso.glb \
  /biblioteca/bibliotecas_30fps/crianca_m.glb /biblioteca/bibliotecas_30fps/bebe_m.glb \
  /biblioteca/bibliotecas_30fps/adulta_gravida.glb
git checkout 4f3012101735ffddd066c31bb0bd8319723eb9ba

# na raiz deste repositório
ARTES_3D_DIR=<fora-do-repo>/artes-3d pnpm --filter @informach/morada-arte empacotar -- --saida <fora-do-repo>/arte-prova \
  --casa packages/morada-sim/src/conteudo/imoveis/casa-prova.v1.json
MORADA_PLATAFORMA=falsa MORADA_REGRAS=prova MORADA_ARTE_DIR=<fora-do-repo>/arte-prova pnpm dev:morada-server
pnpm --filter @informach/jogo-morada bancada     # http://localhost:5173/?apelido=Lia&arte
```

O empacotamento gera arquivos determinísticos com hash; sem `--casa`, inclui só personagens. Sem a arte, tudo continua procedural, como no CI. Ver tempos e tamanhos medidos no review do D1.

Os testes de integração e o E2E do portal criam e apagam um banco descartável do executor GitHub. Nenhuma credencial ou dump de produção entra nesses testes. As receitas de desenvolvimento acima e abaixo são referências técnicas; não autorizam empacotar/buildar/testar nesta máquina.

## Continuação de 13/11

O X3 já foi integrado à `main`; a passagem anterior dizia incorretamente que ele estava só em branch local. O D1 acrescenta a arte da casa atual e a revisão dessa integração. As provas visuais e os E2E ficam descritos no [review do D1](review-d1-2026-11-13.md).

Para repetir o portal com arte, em banco local descartável:

```bash
RECREIO_E2E_ARTE_DIR=<fora-do-repo>/arte-prova DATABASE_URL=<postgres-local> \
  pnpm --filter @informach/recreio-app e2e
```

Esse opt-in declara `assets` no SDK/CSP, entrega a pasta ao servidor do jogo e guarda capturas/traces em uma pasta irmã da arte, fora do repositório. O comando normal de E2E continua sem arte.

## Próximos passos

1. D2: criação da família; depois D3–D8 conforme os critérios do plano. A meta de FPS do D1 ainda precisa de medição em vídeo integrado real.
2. X4: homologar arte, backup agendado, alerta humano, estabilidade e custo por hora de mundo com 1, 2, 4 e 8 pessoas, seguindo [PRODUCAO.md](../../apps/recreio/PRODUCAO.md). A [sonda externa](monitoramento-externo.md) passou nos testes e na ingestão, mas o primeiro agendamento GitHub ainda precisa ser observado. Uptime Sentry de 60 s permanece desligado: o titular não pode liberar orçamento. O [roteiro de cobrança](stripe-pendente.md) registra a configuração/homologação comercial ainda pendente, agora dentro do escopo autorizado.

## Abertos que pedem decisão do titular

- Os zips de pacotes de arte e as animações da Mixamo continuam no histórico do git deste repositório público.
- Licença ITHappy por escrito e a conversa jurídica, que travam só o lançamento público.
- `/termos` e `/privacidade` do Recreio pedem revisão.
