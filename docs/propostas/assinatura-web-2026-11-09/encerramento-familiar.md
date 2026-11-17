# Etapa final da família

Incremento local de 10/11/2026, ainda sem rota pública nem alteração de produção. `@informach/family/closure-detachment` seleciona e executa a desvinculação; `@informach/account/closure-family` compõe o adapter do coordenador. Billing e todos os apps precisam concluir antes de admitir a execução familiar.

## Contrato

- Conta global, pessoa comum, participação na família e histórico de aplicativo permanecem entidades distintas. A saída não apaga o login usado pela Suíte Edi nem transfere a assinatura ou a carteira.
- A seleção inclui responsabilidades em grupos anteriores e cadastros arquivados, em páginas de 250 metadados. Toma todos os grupos em ordem, participa da barreira de congelamento dos adultos envolvidos e trava as identidades antes de reler autoridade. Não usa nomes ou conteúdo no plano.
- Uma identidade sem conta pode ser removida somente quando o ator é seu único responsável e nenhum histórico preservado depende dela. Outro responsável, mesmo temporariamente indisponível, impede tratá-la como exclusiva. Para deixá-la com terceiros, é necessário um responsável disponível com acesso a um contexto vigente.
- Um administrador não pode sair deixando outros membros sem administrador disponível. Históricos compartilhados exigem o responsável apropriado no app. O cadastro de um adulto com histórico compartilhado continua visível aos acessos restantes; arquivar indiscriminadamente essa pessoa bloquearia o uso legítimo dos demais.
- Os predicados de propriedade de perfis são compartilhados com `family/closure`, evitando uma segunda regra de exclusão. A impressão da prévia não inclui os IDs exclusivos que os adapters dos apps devem remover. Assim, concluir a limpeza autorizada dos apps não invalida o consentimento familiar. Uma alteração de autoridade ou conteúdo preservado invalida a impressão.
- O executor recusa a saída enquanto ainda houver perfil exclusivo esperando seu adapter. Depois remove somente concessões e custódias do ator, revoga seus vínculos, elimina as identidades exclusivas já sem conteúdo e arquiva grupos que ficaram exclusivamente vazios. FKs restritivas recusam uma limpeza incompleta.
- A desistência anterior ao consentimento mantém pessoas, custódia, vínculos e dados. Revoga convites e transferências pendentes da participação anterior; novos pedidos exigem ação explícita após a retomada. Uma execução atrasada da revisão anterior é recusada.

## Verificação e pendências

Tipos de family/account e Biome passaram. O gate PostgreSQL final passou: **família 52 testes/11 arquivos e account 24/4**, com remoção da base descartável (`.codex-compasso-family-detachment-pg.log`). Os novos casos cobrem exclusividade, créditos preservados, criança/adulto compartilhados, ausência de administrador/custódia, adulto congelado, mudança após preparação, 252 identidades sob custódia, contexto anterior e retomada. O teste integrado usa o adapter familiar real e verifica a precedência dos demais recibos, a finalização e a conservação da sessão independente.

A primeira rodada teve 44 testes anteriores aprovados e oito falhas novas: expressões SQL correlacionadas em uma projeção de tabela única perdiam a qualificação da coluna no Drizzle. A correção usa subconsultas tipadas; não adiciona casts para esconder a referência errada. A repetição passou e a rodada final inclui remoção/auditoria em lotes de até 250 registros, evitando três consultas por identidade. Tipos em `.codex-compasso-family-detachment-types.log`.

Continuam necessárias a integração financeira, a recuperação de mudança de escopo depois de uma etapa irreversível, os jobs e a interface pública. Revalidar o conjunto de sete adapters antes de ativar qualquer confirmação de encerramento.
