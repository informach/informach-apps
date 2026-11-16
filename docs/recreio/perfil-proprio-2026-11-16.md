# Edição do perfil adulto próprio

Incremento de A12, independente do D3. Permitir editar apelido e avatar do
perfil de login em `/conta/perfil`, usando o catálogo e a normalização já
existentes. Não altera conta, personagens do Morada, cobertura ou política.

Arquivos e contratos:

- `features/perfis/regras.ts`: entrada estrita com os dados anteriores e novos;
  não aceitar identificadores ou campos de autorização do navegador.
- `repository.ts`: localizar e travar o perfil adulto ativo da conta; depois
  travar para leitura a sessão de aparelho, conferindo conta, tipo, validade,
  revogação e seleção atual. Ordem perfil → aparelho, como na troca de ingresso.
  Conferir novamente depois da espera. Valores iguais são repetição sem evento;
  base divergente recusa a alteração para não sobrescrever outra aba.
- `service.ts` e `actions.ts`: validar entrada e obter a conta/aparelho da sessão
  confirmada, nunca do formulário. Atualização e `profile_updated` na mesma
  transação; `fields` contém somente `nickname` e/ou `avatar`, sem valores.
- `components/formulario-do-perfil.tsx`: compartilhar os controles existentes
  de criação/edição; salvar leva à Conta, cancelar conserva os dados.
- `app/(portal)/conta/perfil/page.tsx` e Conta: acesso autenticado e link visível.
- Testes PostgreSQL: escopo, sessão revogada/vencida, suspensão, repetição,
  conflito concorrente e rollback real da auditoria. Jornada de navegador:
  editar, recarregar e conferir persistência, além da criação existente.

Verificações pesadas somente no GitHub. Candidata própria sobre a main publicada,
seis gates antes de publicar, conferência de deploy/saúde/mapas depois.
Sem migração ou alteração de dependências. Gestão de aparelhos, perfis infantis
e encerramento continuam pendentes; este incremento não conclui A12.

## Validação e operação

Fonte `9725e5fb8490c5878f892d0fd1dc24494a3b5f61`: seis gates na
[candidata 43826021613](https://github.com/informach/informach-apps/actions/runs/43826021613)
e na [main 43826920567](https://github.com/informach/informach-apps/actions/runs/43826920567)
aprovados. PostgreSQL: 188 integrações, incluindo nove novas de edição. Navegador:
seis jornadas aprovadas e dois casos pulados por pertencerem aos executores
específicos de versões/arte; esses executores têm seus próprios gates/provas.
A jornada nova salva, recarrega, cancela sem gravar e escolhe avatar pelo cartão
e por setas do teclado. A imagem da tela foi inspecionada. Isso não substitui
homologação completa de acessibilidade com pessoas.

Portal `6a5ccc68-7a77-491e-b751-8eb669fae37c` em SUCCESS; fonte e nova rota
relidas no processo. Sem sessão, `/conta/perfil` redireciona 307 para o login;
saúde/prontidão do portal e do Morada respondem 200. Mapas enviados ao Sentry
às 07:54:36,256 UTC; release presente. Configurações integrais dos dois serviços
comparadas, idênticas, sem alterações staged. O jogo não foi recompilado:
gatilho SKIPPED, fonte `179a0a76`, Mundo V2/protocolo 1/arte D2 conservados.

Cron automático de 08:00:52,459 a 08:00:52,529 UTC: `ok=true`, quatro contagens
zero. Não prova ausência global de disputa ou carga. Nenhuma edição foi feita
nas contas piloto para testar a implantação. [Evidência estruturada](evidencias/perfil-proprio-producao-2026-11-16.json).
Gestão de aparelhos, proteção infantil e demais itens A12 continuam abertos.
