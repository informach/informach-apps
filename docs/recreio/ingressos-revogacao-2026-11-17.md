# Ingresso não volta depois de perder autoridade

Na revisão F3, dois casos permitiram reutilizar um ingresso não consumido,
ainda dentro dos 60 segundos: retirar/restaurar cobertura e trocar de perfil
por PIN/voltar ao anterior no mesmo aparelho. O ingresso carregava a mesma
identidade do aparelho/perfil e versão, e o recibo antigo ainda existia.

## Reprodução remota

Fonte funcional `bcba605` mais os dois testes em `00569bf`. Worktree de prova
separado `d680713` altera somente a matriz para executar integração, sem merge
ou publicação. Run GitHub `44021767786`: **dois testes falharam porque a promessa
resolveu com sessão aberta; os outros 427 passaram**. A reprodução não simula
autorização: usa login, banco, assinatura de token, concessão e PIN reais no
ambiente descartável. Nenhum teste/build roda nesta máquina.

Arquivo de regressão `test/ingressos-revogacao.integration.ts`, SHA-256
`55baabb1473d1467be3ffe17c521750ea0f4edeed79034333adb7766b2499b4a`.
Conservar o mesmo arquivo na prova corrigida; não confundir o vermelho esperado
do worktree com aprovação da candidata.

## Correção candidata

- Revogar cobertura efetiva invalida ingressos pendentes do perfil na mesma
  transação que retira acesso, encerra partidas e audita. Retirar uma cortesia
  quando outra cobertura continua válida não revoga autoridade existente.
- Revogar aparelho, revogar acesso protegido ou mudar/limpar seleção invalida
  os ingressos correspondentes sob a trava de aparelho/perfil. Emissão anterior
  precisa confirmar antes; emissão posterior espera e relê a nova autoridade.
- Somente recibos sem consumo e ainda vigentes são eliminados. Nunca devolver
  `consumed_at` a nulo, reaproveitar JTI ou restaurar o recibo numa retomada.
- Seleção nativa revalida login/contexto sob trava desde a leitura para escrita,
  audita somente mudança real e não eleva SHARE do aparelho a UPDATE. Uma leitura
  antiga não limpa seleção posterior ou contexto infantil.
- Índices parciais por perfil/aparelho e validade suportam a invalidação. A
  migration ainda será gerada pelo workflow e conferida antes de integrar.

Prova verde e publicação ainda pendentes. Esta correção deve entrar também na
candidata de leitores; não publicar uma versão sabendo dessa lacuna. F3 e o
fechamento da plataforma continuam em execução.
