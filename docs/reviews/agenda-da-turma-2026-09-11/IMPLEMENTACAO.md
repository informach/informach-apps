# Implementação — Agenda da Turma

Implementação autorizada e realizada em 11/09/2026. A [revisão](REVISAO.md) e a [proposta](PROPOSTA.md) permanecem como registros anteriores à mudança. Este arquivo descreve o resultado no workspace, validado localmente; não houve implantação em produção.

**Revisão e correção posteriores:** o [full review da implementação](REVISAO-IMPLEMENTACAO.md) identificou dez achados, sendo seis de prioridade alta. Os dez foram corrigidos e verificados localmente em [CORRECOES.md](CORRECOES.md), com migrações e evidências atualizadas. As verificações abaixo descrevem a entrega original; o relatório de correções registra o estado atual e as homologações ainda necessárias antes da liberação.

O app passa a oferecer o ciclo **recado e anexo → revisão → rotina por criança → responsável e lembrete → conclusão**. Reutiliza Next, Drizzle, autenticação, billing, IA e e-mails existentes. A entrada principal atende às mensagens/publicações com anexos do Teams e Batista ID.

## Rastreabilidade

| Revisão/proposta | Resultado implementado | Evidência |
| --- | --- | --- |
| R01 — datas | Removidos preenchimentos de amanhã/próxima aula e propagação sem vínculo. Documentos antigos não recebem hoje como contexto. Recados permitem prazo nulo, trecho original e origem da data. | 25 testes de enriquecimento; nove de validação; corpus real com publicação antiga, data ausente e divergência. |
| R02 — grupos | Unicidade por criador e turno; dados públicos da sala não concedem acesso. Código aleatório, rotação e remoção de participante. Escrita revalida acesso na transação após revogação. | PostgreSQL real: isolamento, código antigo inválido, retirada de recebidos e recusa de escrita com autorização antiga. |
| R03 — conta | Exportação JSON e exclusão confirmada por e-mail. Cancelamento de billing antecede limpeza; falha preserva conta para tentar novamente. Autoria anonimizada sem apagar atividade já usada por outra família. | Testes de falha/retry, exclusão do criador e fluxo de confirmação no navegador com e-mail sandbox. |
| R04 — downgrade | Agenda, histórico e aceites continuam acessíveis. Correção e conclusão permanecem; novos benefícios pagos ficam limitados e automações pausadas. | Integração e navegador; edição de item que já tinha lembrete depois do downgrade. |
| R05 — alterações | Versionamento, histórico, conflito de edição antiga e cancelamento preservado. Aceites/conclusões privados permanecem. | Integração de correção, conclusão, cancelamento e feed com identificador estável. |
| R06/R14 — gratuito | Uma quota de 20 pendências próprias de escola/extras/recados; concluir libera vaga. Recebidas não consomem quota nem exigem Pro. Cinco importações por conta verificada com teto e reserva. | Criações concorrentes respeitam 20; oito pedidos admitem só cinco imports; reimportação real sem segundo débito. |
| R07 — primeiro uso | Nome da criança basta; nascimento, escola, turma e matérias ficam para depois. Perfil incompleto não bloqueia a rotina. | Cadastro, importação, revisão e gravação pelo navegador. |
| R08 — família | Dois adultos com logins próprios, convite por e-mail verificado, escopo por criança, responsável e revogação. Continuidade do convite no login/cadastro. | Banco e navegador com dois contextos; criança restrita oculta e acesso revogado. |
| R09 — recados | Texto + imagem/PDF, fonte, link, publicação opcional, ações independentes, material/autorização/evento/estudo, horário/local, revisão e duplicatas. Rascunhos retomáveis. | Passeio real de teste com três ações; reenvio recupera resultado; documento com várias crianças respeita escopo. |
| R10 — teclado | Controles separados de dia e atividade. Enter/espaço abrem detalhe; fechar devolve foco. | Exercitado com ambos os comandos e Escape no navegador. |
| R11 — oferta | Removidos selos de popularidade e promessas de velocidade sem evidência. Desconto derivado (~17%); franquia por importação; exemplo fictício e benefício familiar claros. | Inspeção desktop e 390 px; afirmações antigas ausentes. |
| R12 — móvel | Rotina de atenção/amanhã/sete dias, filtro por criança, navegação inferior e recado em destaque. Configurações escolares e exportação recolhidas. | Capturas e ausência de rolagem horizontal em 390 px. |
| R13 — qualidade/anexos | Limites visíveis, validação de arquivo e seleção de até três páginas. Corpus com texto, imagem e PDF digitalizado. | Sete testes de anexos; 15 casos no modelo real, incluindo quarta página selecionada. |
| R15 — medição/CSP | Eventos sem conteúdo escolar, relatório agregado e pagamento por fatura processada. Nonce no layout/tema e filtragem de tokens/conteúdo privado no Sentry. | Relatório executado, CSP enforced local sem violações no fluxo familiar, build e formatação aprovados. |
| Proposta 4.3 — acompanhamento | Resumo por e-mail, lembrete, sugestão explícita de antecedência, silêncio, cancelamento e idempotência. Job em lotes com runner. | Consentimento, concorrência, cancelamento, retenção e paginação em banco/e-mail em memória. |
| Proposta 4.3 — push | Service worker, consentimento, inscrição/revogação, orientação iOS, texto genérico na tela bloqueada e tratamento de endpoint expirado. | Validação de endpoints/preferências; entrega a dispositivo real depende de VAPID e homologação. |
| Proposta 5 — calendário | Link privado revogável, unidirecional, histórico e permissões atuais. | Testes iCalendar e integração de revisão/cancelamento/revogação. |
| Proposta 8 — piloto | Instrumentação, relatório de leitura, roteiro de entrevista, coortes, metas e planilha econômica vazia. | [PILOTO.md](PILOTO.md) e [piloto-familias.csv](piloto-familias.csv). Sem participantes ou vendas inventadas. |

## Verificação

- **478 testes do app** aprovados, em 36 arquivos.
- **216 de autenticação, 185 de billing e 106 de e-mail** aprovados. Checagem de tipos dos cinco pacotes afetados aprovada.
- **16 testes de integração** aprovados em PostgreSQL local, incluindo concorrência, escopos, downgrade, exclusão, proteção de assinatura em outro app, recuperação de importação e notificações.
- **15 casos com provedor real** aprovados no corpus fictício. Verificam datas, tipos, duplicação e alertas nos exemplos definidos; não são uma taxa de precisão comercial.
- **Um cenário completo de navegador** aprovado com dois adultos, OTP em sandbox, cadastro, convite, login, restrição por criança, conclusão, revogação, exportação, downgrade e exclusão confirmada.
- **Build otimizado final aprovado**, com TypeScript e geração de rotas. Verificações adicionais de teclado, captura e reimportação descritas em [evidence/IMPLEMENTACAO.md](evidence/IMPLEMENTACAO.md).

## Operação e dependências

Migrações 0035/0036 geradas pelo Drizzle e aplicadas ao banco local, com seed do novo preço de crédito. Para disponibilizar aos clientes, seguir [OPERACAO.md](OPERACAO.md): migrar o ambiente de destino, publicar, configurar VAPID/scheduler e verificar entrega e billing em homologação. E-mails deste trabalho foram sandbox/memória; não houve compra, cobrança real ou disparo para famílias.

A tentativa de servir o build otimizado localmente foi bloqueada pela aprovação automática; os testes de navegador usaram o servidor de desenvolvimento com CSP ligada. O smoke test de runtime de produção permanece necessário antes da publicação.

Teams e Batista/Layers usam importação manual assistida. Conectores automáticos dependem de permissões institucionais e prova técnica, conforme [INTEGRACOES.md](INTEGRACOES.md). Não foram fornecidos acessos nem enviada comunicação a terceiros.

O valor comercial continua sendo uma hipótese: não há pagantes informados. Entrevistas, amostras reais autorizadas, custo efetivo, compra e renovação precisam ser observados no piloto. O código e os instrumentos para essa validação estão entregues.
