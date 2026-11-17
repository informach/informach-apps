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

**Estado:** preparada, ainda sem qualificação ou implantação. Produção conserva
`3f2b1239`, 179 recibos, famílias/checkpoint desligados. O coordenador completo
de encerramento e os demais aceites de F1–F11 continuam pendentes.
