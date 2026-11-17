# Recreio: gestão sem ocupar perfil de jogador

Primeiro incremento de F1, depois do SDK independente. O titular confirmou que
o adulto compra e cadastra quem joga; ele próprio pode não jogar. A identidade
administrativa é a sessão nativa da conta, não um perfil adulto obrigatório.
Este incremento não entrega sozinho o cadastro de menores ou o pareamento.

## Contrato

- `/conta` e aparelhos próprios exigem conta confirmada e sessão nativa atual.
  Perfil ativo nulo não impede essas operações e não cria perfil ou grupo.
- Estante, mundos e jogos continuam exigindo perfil ativo autorizado.
- Selecionar um perfil infantil não concede gestão. A página de gestão exige
  voltar à seleção adulta; os repositórios também recusam chamadas diretas com
  aparelho pareado ou perfil ativo que não pertence ao adulto autenticado.
- Suspensão do perfil jogador não retira o direito de gerenciar a própria
  conta. Suspensão da identidade, sessão revogada/vencida ou login removido
  continuam recusados no servidor.
- Revogar outro aparelho exige escopo da conta e revalidação após as esperas,
  encerra suas partidas e grava auditoria estrita na mesma transação. Sem
  perfil ativo, o evento omite `profileId`; não inventar um jogador para auditá-lo.

## Implementação em série

1. Layout do portal autentica conta e apresenta seleção opcional. Cada página
   de jogo/mundo/estante mantém sua própria exigência de perfil; conferir todos
   os consumidores de `paginaDoPortal` antes da alteração.
2. `paginaDaGestao` usa o contexto nativo, permite perfil nulo e recusa o contexto
   infantil. Conta apresenta estado sem jogador, seleção/criação e saída real.
   Não consultar direito de jogar com perfil inexistente.
3. Aparelhos autoriza conta → perfil selecionado, se houver → aparelho; confere
   identidade, login atual e relógio após esperar. Manter mutex de revogação e
   ordem do cursor de encerramento. Serviço continua sem dependência de Next.
4. Provas no PostgreSQL: conta sem nenhum perfil lista e revoga outro aparelho;
   IDs de outra conta, contexto infantil, login removido e credencial vencida
   são recusados; auditoria sem conteúdo e rollback continuam cobertos.
5. Prova no navegador: criar/confirmar conta, abrir Conta sem criar perfil,
   gerenciar aparelhos e sair. Conferir ausência de criação implícita de jogador.
6. Gates no GitHub e consumidores compartilhados. Publicar somente depois da
   evidência; continuar F1 (responsabilidade declarada, menores e convites) e F2
   (credencial pareada/PIN). Não marcar a plataforma concluída por esta etapa.
