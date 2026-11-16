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
