# Recreio: exclusão compartilhada sem cascata comercial

A revisão dos grupos comerciais encontrou uma lacuna na guarda compartilhada:
ela procurava somente perfil próprio. Um titular sem jogador ou responsável
infantil sem perfil também precisa resolver seus vínculos antes da exclusão.

Este incremento amplia somente o leitor de `@informach/auth`, antes de qualquer
callback de cancelamento/limpeza externa. Consulta perfil, grupo de titularidade
e responsabilidade, sempre pela conta atual. Qualquer vínculo ou falha de
consulta impede continuar, com a recusa existente de atendimento assistido.
Não cria endpoint de exclusão, cancela contratos ou implementa F7.

## Ordem de implantação

1. Qualificar esta fonte sobre o schema público atual (0178/179 recibos), com
   testes PostgreSQL de grupo sem jogador, perfil sem grupo, responsabilidade
   sem jogador e conta sem vínculos. Verificar consumidores compartilhados.
2. Publicar a guarda nos aplicativos que compõem autenticação/exclusão e
   conferir fonte e saúde dos processos. O migrator conserva a política atual;
   este incremento não contém migration e não autoriza seeds/deploy de banco.
3. Só depois qualificar/aplicar 0183, que troca as duas FKs de identidade do
   Recreio por `RESTRICT`, junto do lote privado de grupos 0179–0183. A trava
   no banco fecha concorrência após a prévia; a guarda evita efeitos externos
   antes de uma exclusão que será recusada.

A candidata completa de grupos segue separada. Não enviar a main do checkout
original com Morada D3, nem anexar migrations privadas a esta publicação. Ambas
as etapas exigem gates remotos e evidência operacional antes de conclusão.

**Estado:** implantação restrita em andamento, sem migration. O coordenador completo
de encerramento e os demais aceites de F1–F11 continuam pendentes.

A fonte isolada `644b3841` passou nos sete gates `44117921037` e no CI
compartilhado `44117922539` (segunda tentativa). A primeira falhou no timeout
de fidelidade do EdiFoto; as provas diagnósticas `44128829062` passaram, sem
confirmar a causa daquele timeout. Nenhum timeout ou asserção foi afrouxado.

Antes do push, a main pública avançou para `ed0d3762` com trabalho do EdiAula e
EdiSVG. A integração `aa4291bb` preserva essas mudanças e passou nos sete gates
`44146981530`. O CI completo `44146980351` falhou em um teste novo do EdiSVG:
o basename nativo do Linux preservava um caminho Windows inteiro. O corretivo
usa o parser Windows, que reconhece ambos os separadores, somente para o nome
exibido da imagem, sem mudar sua referência por hash ou caminhos de armazenamento.
A prova original permanece, acrescida de caminho POSIX. A candidata corrigida
precisa de CI remoto antes de qualquer publicação; não contém DDL.

`44149210659` passou pelos testes de basename e consumidores compartilhados,
mas parou no E2E do EdiSVG: o seletor de guia de estilo do assistente também
usava `data-guide`, reservado às linhas geométricas. Por isso a contagem real
era três, incluindo o select; a marcação de snapping também o alcançava.
O corretivo usa `data-assistant-style-guide` nas duas referências do assistente;
a prova geométrica original fica intacta, sem alterar a contagem esperada.

Durante essa qualificação, `origin/main` avançou para `84907a19` e incorporou
D3 do Morada. O deploy automático colocou essa fonte em ambos os serviços às
18:32 UTC. A leitura operacional posterior encontrou 179 recibos, somente
fotografias V1/V2, nenhuma partida aberta, famílias/checkpoint `off` e arte D2.
Antes de qualquer nova gravação V3, portal e Morada foram fixados em `644b3841`,
fonte isolada já homologada. Builds iniciados `9aab45a3` e `3cd2cb8f`, ainda
sem prova de conclusão neste registro. Não apagar as alterações D3 do Git nem
voltar o serviço a seguir main automaticamente: promoção seguinte deve apontar
somente a fonte qualificada da plataforma, independente da integração do jogo.

A candidata Git preserva `84907a19` e os dois corretivos do EdiSVG, para nova
verificação remota. Os oito outros consumidores web não tiveram código ou
packages compartilhados alterados por essa integração externa; ainda precisam
receber a guarda e ter o processo real conferido antes de 0183. O migrator
continua sem DDL novo e sem alteração de comando nesta etapa.

A fonte `644b3841` foi conferida no processo de cada um dos nove consumidores,
todos com `/api/ready` 200; Morada também responde 200 nessa fonte. A
[evidência](evidencias/guarda-contas-producao-2026-11-17.json) registra deployments
e fontes fixadas. Oito consumidores precisam voltar a acompanhar main depois
da integração pública qualificada da guarda; portal e Morada mantêm promoção
explícita para não incluir D3 por acidente.

Antes de F1, [restauração atual](evidencias/backup-logico-2026-11-17-pre-grupos.json)
aprovada às 19:16 UTC: 19.264.248 bytes, 243 tabelas/284.198 linhas,
estrutura/conteúdo comparados idênticos, temporários e serviço removidos sem
volume destacado. Inventário voltou a 34 serviços. O migrator foi alterado
para somente `pnpm db:migrate` e fixado em `204cf79c`, último recibo esperado
184/0183, sem migrations sociais. Deployment iniciado `917b452d`; conferir
resultado e banco antes de promover o portal. Não houve seed nesta etapa.

F1 foi promovida explicitamente em `204cf79c`: 184 recibos e hashes de
0179–0183 conferidos, duas FKs `RESTRICT`, dois grupos/um perfil/dois mundos
preservados e nenhuma tabela social. Portal `9da76a16` com fonte real/HTTP 200;
manutenção POST 200 com treze contagens. Famílias/checkpoint continuam `off`.
[Evidência de F1](evidencias/grupos-producao-2026-11-17.json). Migração e portal
usaram somente a fonte congelada já qualificada; a integração Git com a main
concorrente e a retirada dos oito pins temporários continuam pendentes.
