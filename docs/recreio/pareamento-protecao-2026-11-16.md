# Pareamento, PIN e autoridade infantil

Incrementos F2–F3 do fechamento da plataforma. Execução em série, com todos os
testes, builds e navegador no GitHub. Não ativar menores a partir de uma tabela
ou formulário isolado.

## Contrato de proteção

- Um aparelho pareado representa um único perfil protegido. Não herda a conta
  do responsável, cobrança, gestão, edição da família ou login Better Auth.
- O aparelho inicia uma intenção com segredo aleatório de 256 bits, separado
  do código curto. Só o código aparece para o adulto; o segredo fica em cookie
  HttpOnly, Secure em produção, SameSite estrito e host próprio. Código não é
  credencial de consulta nem de jogo. Nenhum segredo vai à URL ou auditoria.
- Código tem 40 bits, cinco minutos e aceite único por adulto com login
  recente e vínculo atual. Aceitar trava e revalida perfil, vínculo, intenção
  e prazo. Dois aceites não produzem dois aparelhos. Resposta perdida admite
  recuperação pelo mesmo segredo de consulta durante a janela original.
- Credencial final é aleatória, persistida só por hash e vinculada à geração
  atual de acesso do menor. Revogar o aparelho ou mudar a geração impede
  reutilização; restaurar cobertura ou o cadastro não reativa a credencial.
- PIN tem seis dígitos, scrypt assíncrono com sal aleatório de 16 bytes,
  parâmetros fixos e comparação em tempo constante. Tentativas limitadas
  antes da derivação e novamente sob a autoridade atual. PIN não substitui
  login nativo, vínculo ou autorização de aparelho. Troca exige autenticação
  recente; PIN e hashes nunca entram em logs ou eventos.
- Em aparelho compartilhado, entrar no contexto infantil fecha a autoridade
  administrativa dessa sessão. Voltar ao adulto exige PIN de destino e login
  nativo ainda válido, ou autenticação nova. Resolver um perfil indisponível
  nunca transforma silenciosamente o aparelho infantil em administrador.
- Conteúdo em análise continua recusado a menores. A prova usa o título
  interno L; o Morada mantém a classificação vigente.

## Ordem de execução

1. Schema aditivo de intenção/credencial/proteção/PIN e índices de retenção;
   gerar no GitHub e conferir proveniência. Não editar arquivos gerados.
2. Repositórios com relógio do banco após as esperas, idempotência, limite de
   aparelhos, limpeza delimitada e auditoria atômica. Provas negativas de
   código sem segredo, vínculo alheio, concorrência, revogação e geração.
3. Adapter de cookie e ator restrito separado da conta nativa. Rever cada
   página/ação/API que hoje admite somente a sessão Better Auth. A autorização
   efetiva precisa permanecer válida dentro da transação.
4. Autoridade comum do jogo: ingresso, troca, renovação, dados, conquistas,
   mundos e instâncias. Relógio e política atuais após travas, sem conexões
   extras no pool. Mudança de geração encerra partidas e alcança os hosts.
5. Políticas de idade/tempo e supervisão; seleção/PIN/pareamento pelo navegador,
   chamadas diretas sem gestão por credencial infantil, recuperação e saída.
6. Seis gates e consumidores compartilhados, revisão final, implantação e
   prova operacional antes de marcar F2/F3 concluídos.

A troca de perfil não deve ocorrer apenas no client. O schema atual de aparelhos
aceita registros de preparação `paired_device`; os novos writers precisam criar
somente registros coerentes e não interpretar dados antigos incompletos como
autoridade. O PIN do perfil de destino protege a troca, sem conceder poderes
sobre outros adultos ou sobre a identidade global.

Referência de API consultada: [Node 24, crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html).
Usar a versão já instalada, sem atualização de dependências. O hash não elimina
a baixa entropia do PIN; tentativas e autoridade atual fazem parte do contrato.

Estado: plano do incremento, sem pareamento ou proteção infantil ativados em produção.
