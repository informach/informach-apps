# Candidata de integração F6–F8 com a main

Estado: `d32c07ae`, publicada somente em
`candidate/recreio-integracao-f8-20261119`; não em `origin/main` e sem deploy.
Pais: main pública `ea12cb6c` e candidata `41a5a304`. A correção executável
mais recente é `bf6fa706`; sua prova externa de recuperação passou em
`44507816907`, incluindo queda/rollback, corrupção recusada e limpeza.

A integração resolveu apenas três arquivos em conflito: preservou `readFileSync`
e `sep` no executor isolado, os registros operacionais F5 da main e as
provas/pendências F6–F8 da candidata. Conferência por blob Git confirmou
448 arquivos gerados de migrations idênticos à candidata, com 224 recibos.
`node --check`, Biome do executor e `git diff --check` passaram localmente;
nenhum teste pesado ou build foi executado nesta máquina.

Rodadas remotas desta integração:

- `44509240380`: dezesseis gates do Recreio.
- `44509240406`: CI compartilhado.
- `44509240153`: bucket restrito com captura/restauração sintéticas completas,
  aprovado. ZIP/SHA conferidos, todos os cenários de queda/corrupção e limpeza
  preservados após o merge. [Recibo](evidencias/captura-provider-44509240153.json).

Os dois primeiros ainda estão em execução. A alteração posterior do migrator
no IaC requer seu gate quality próprio; não pertence à fonte desse ensaio.

Fontes de produção preservadas em `.railway/railway.ts`: portal/Admin em
`d014bd90a895df452b83b9a2e6e683ac5749e0cb` e servidor Morada em
`644b3841cb81b24d04159f75892a4c21d4d5f094`. Cobrança, jobs financeiros,
teste, famílias, social, visitas e checkpoint continuam desligados. Consulta
Railway confirmou o portal ainda na fonte anterior; não é homologação das
candidatas em produção.

## Antes de publicar na main ou implantar

A consulta operacional confirmou o migrator seguindo a main e executando
`pnpm db:migrate && pnpm db:seed && pnpm db:seed:reference`. Em 19/11 seu
comando foi limitado a `pnpm --filter @informach/db db:migrate` e a fonte
fixada em `ea12cb6cf507d05e8819306169222ed84cb67113`, a main qualificada com
204 recibos, antes de qualquer push público desta integração. O projeto possui
somente o ambiente production. A solicitação de deploy
`d58e61b5-072d-43a8-bc47-67ba68ecc7c6` terminou `SKIPPED` (commit documental
fora dos watch patterns), sem executar nova migration. Leitura posterior
confirmou fonte fixada, comando sem seeds e nenhuma alteração staged; o deploy
ativo anterior permaneceu o mesmo. IaC foi alinhado à configuração observada.
Isso protege futuros pushes; não é prova de execução das migrations candidatas.
Não admitir migrations candidatas por acidente. A execução autorizada precisa usar migrations qualificadas e recibos
conferidos, sem seed, após restauração e plano de retorno aplicáveis. Não
ativar a fonte pública como runtime do Morada ou do portal por atualização
implícita; conservar os commits fixados até a homologação do corte.

Mesmo com gates aprovados, permanecem as entregas F7, custódia real de chaves,
normalização de autoridades/replay de direitos, backup operacional retido e
RPO/RTO, Checkout hospedado, operação/carga e jornadas finais. Não anunciar
fechamento F0–F11 ou liberação de venda. O acompanhamento permanece no
[plano da plataforma](fechamento-plataforma-2026-11-16.md).
