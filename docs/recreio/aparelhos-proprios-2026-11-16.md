# Gestão das sessões de aparelho do adulto

Incremento A12 sobre o alfa publicado, sem D3, migração ou alteração comercial.
Listar as sessões de login próprias em `/conta/aparelhos`, com datas, aparelho
atual e páginas de vinte outros aparelhos. Desconectar outro aparelho da própria
conta, preservando a negativa persistida e encerrando suas partidas na mesma
transação. Não alterar sessões de outros apps nem aparelhos pareados de crianças.

Arquivos: `features/aparelhos/{service,repository,actions}.ts`, botão em
`components/`, página e link na Conta; integração PostgreSQL e jornada real com
dois navegadores. Cursor por criação/UUID, validado e sempre limitado à conta;
sem IP, user-agent, token, ID do login ou nome inventado de aparelho na resposta.
A âncora UUID relê a criação no banco, com a mesma conta, preservando a precisão
de microssegundos; não arredondar o timestamp do cursor através de Date/JSON.

Autorização revalidada na transação: perfil adulto próprio ativo e selecionado,
aparelho de login da conta, não revogado e no prazo depois de esperar as travas.
Revogações da mesma conta usam uma trava própria antes de perfil/aparelhos:
duas sessões tentando revogar uma à outra não podem agir com autoridade já
revogada. Depois: perfil → aparelho chamador → alvo → cursor de encerramentos
→ sessões de jogo. O encerramento atual não volta a travar aparelhos depois do
cursor; a suspeita de espera circular nesse fluxo não foi confirmada. Preservar
a ordem, sem deslocar isoladamente o cursor para antes dos aparelhos.

`recreio.device_session_revoked` é evento pessoal estrito e atômico, apenas
`deviceSessionId`/`profileId` e `app`, ator da própria conta. Repetição sem efeito
não emite novo evento. Falha de auditoria reverte aparelho e partidas; os eventos
de fim usam o cursor existente. A negativa não é apagada enquanto o login puder
ser aceito. A propagação para o jogo segue o batimento já existente.

`@informach/auth` recebe só o membro aditivo de `AuditEventType`. Consumidores:
Recreio, Conta, Agenda, Cozya, Missão Saber, Bora Treinar, Dia de Estrela, Edi,
Bastidores, billing, family, account e ai-core. Sem mudança de runtime/auth desses
consumidores. Conferir tipos/unidades de auth e consumidores no CI correspondente.

Gates pesados só no GitHub: escopo/paginação, auto-revogação recusada, negativas
vencidas/revogadas, duas revogações cruzadas, rollback real da auditoria, jogo
encerrado com cursor e repetição. Navegador: entrar duas vezes, desconectar o
outro, conservar o atual, recusar o aparelho antigo e permitir autenticação nova.
Seis gates antes de publicar; conferir fonte, saúde, mapas e cron depois.
Família/PIN, nomes de aparelhos e demais itens A12 continuam pendentes.

O Bastidores recebe a frase do novo evento na Auditoria e na ficha da conta
(`features/audit/humanize.ts` e `features/people/service.ts`), sem ler conteúdo
ou ampliar permissões. Os tipos e as unidades do Bastidores fazem parte do gate.

## Evidência e implantação

Fonte `545aa7cb8c4ad215626b0c23429d69894afabf95`: seis gates na
[candidata 43836674032](https://github.com/informach/informach-apps/actions/runs/43836674032)
e na [main 43838006603](https://github.com/informach/informach-apps/actions/runs/43838006603)
aprovados; [tipos dos consumidores 43836381953](https://github.com/informach/informach-apps/actions/runs/43836381953)
aprovados para auth e os treze consumidores declarados nos manifests.
Integração: 200 testes, doze novos. Navegador: sete jornadas aprovadas e dois casos
reservados aos executores específicos. O fluxo novo entra em dois navegadores,
revoga o outro, preserva o atual e autentica novamente no aparelho antigo.

Portal `7ce53469-bfc2-416d-bb9e-1d9975e0737b` em SUCCESS; fonte e presença da
rota relidas no processo. Sem sessão, `/conta/aparelhos` responde 307 para o
login. Prontidão dos nove consumidores web: HTTP 200 às 09:26 UTC. Os consumidores
recompilaram pela mudança aditiva do tipo; Edi ainda aguardava seu gate remoto na
primeira consulta e permaneceu disponível com a versão anterior. Não forçar o gate.
Bastidores `71565ec4-e736-4c28-99bf-e25ae30e4cd5` em SUCCESS, fonte igual.

Configurações do portal e Bastidores comparadas integralmente, idênticas e sem
staged. Mapas do portal enviados às 09:16:27,594 UTC; release presente no Sentry.
Cron automático: 09:25:38,017 a 09:25:38,095 UTC, ok=true e quatro contagens zero.
Isso não comprova ausência global de disputa ou capacidade. Nenhuma conta piloto
foi modificada para verificar a implantação. D3, aparelhos infantis/pareados,
nomes de aparelhos e demais itens A12 continuam pendentes.

[Prova estruturada](evidencias/aparelhos-producao-2026-11-16.json). A CI preserva
apenas as duas telas sintéticas da conta para inspeção; não inclui imagens do jogo.
