# Inventário da cobertura pessoal do Recreio

Base: snapshot candidato 0243, 244 recibos, 80 tabelas `recreio`. Revisão em 20/11/2026; produção ainda na base 0203/204 recibos. Não é declaração de exportação integral, parecer jurídico ou implantação.

Esta matriz confere a presença das fontes e registra lacunas. Revisão campo a campo, retenções e prova dos últimos incrementos continuam necessárias. UUIDs históricos permanecem dados pessoais; não são anônimos. Encerrar o Recreio não apaga a identidade global ou os fatos financeiros.

| Área | Fontes persistidas | Situação | Contrato e lacunas |
| --- | --- | --- | --- |
| Cadastro | `groups`, `profiles`, `minor_profiles`, `guardian_links`, `adult_declarations`, `profile_creation_requests`, `account_participations` | Recorte | Cadastro próprio/parental, declaração e participação possuem DTOs. Metadados do grupo próprio, cobertura do perfil e intenções de cadastro passaram nos gates de direitos/qualidade 44763965632/44763978650. Titularidade comercial não concede cadastros de terceiros. |
| Aparelhos e proteção | `device_sessions`, `native_pins`, `minor_protection`, `paired_credentials`, `pairing_requests` | Lacuna parcial | Conta inclui aparelhos nativos e somente definição/data do PIN. Metadados dos próprios pareamentos e aparelhos pareados passaram em direitos 44762618290; nunca token, hash, geração ou segredo de polling. |
| Supervisão e tempo | `minor_policies`, `minor_daily_usage` | Recorte | Configuração reconhecida e uso agregado do próprio menor sob responsabilidade atual. Nascimento/faixa não é identidade verificada. Sem supervisão ou uso de outro perfil. |
| Dados de jogo | `profile_data_keys`, `profile_data_versions`, `profile_achievements` | Recorte | Chaves/revisões, versões/conflitos e conquistas por perfil/jogo, inclusive título retirado. Excesso deve falhar explicitamente sem apresentar arquivo parcial como integral. |
| Mundos | `spaces`, `space_members`, `space_invites`, `space_stewardship_requests`, `space_snapshots`, `space_journal`, `profile_world_traces` | Compartilhado e lacuna | Não exportar mundo/diário/resumo compartilhado como propriedade do solicitante. Vínculos próprios têm recorte; adapter retira identificadores preservando terceiros. Convites antigos e propostas de sucessão próprios passaram nos gates de direitos/qualidade 44763965632/44763978650. |
| Execução temporária | `game_tickets`, `game_sessions`, `session_save_permits`, `session_handoffs`, `game_instances`, `space_leases`, `world_host_presences` | Capacidades privadas | Sessões possuem histórico sem SID. Ingresso, permit, geração/cerca e segredo de host não entram no arquivo. Revogação offline provada no cluster frio; isso não admite tráfego nem resolve replay F7. |
| Social | `friend_codes`, `friend_requests`, `friend_consents`, `friendships`, `social_blocks`, `social_notices`, `social_preferences` | Lacuna parcial | Grafo/preferências/bloqueios próprios e aprovações originais possuem recortes. Avisos dirigidos ao próprio adulto passaram em direitos 44762618290. Não expor quem bloqueou outro perfil, códigos, hashes ou gerações. |
| Convites dirigidos | `directed_space_invites`, `directed_invite_world_approvals`, `directed_invite_guardian_approvals` | Recorte | Perfil recebe vínculos próprios; conta recebe só atos do próprio adulto. Sem nome/geração da outra ponta e sem herdar gestão de mundo por aprovação parental. |
| Visitas | `space_visit_invites`, `visit_invite_world_approvals`, `visit_invite_guardian_approvals`, `world_visits`, `world_visit_sessions` | Lacuna parcial | Visitas concedidas e aprovações possuem recortes. Convite ainda sem concessão passou em direitos 44762618290. Não entregar SID/presença/capacidade; retenções técnicas conservam seus prazos originais. |
| Sucessão supervisionada | `stewardship_guardian_approvals` | Recorte | A proposta aprovada pelo próprio adulto entra na cópia da conta. Não substitui aceite do destinatário nem homologa a transferência. |
| Segurança | `safety_reports`, `profile_restrictions`, `restriction_reviews`, `moderation_commands` | Recorte e retenção | Denúncias emitidas, restrição própria e recursos têm projeção. Ser alvo não concede denúncia. Sem evidência, denunciante alheio, moderador ou chave de repetição. Registrar retenções do domínio. |
| Comercial | `entitlements`, `purchase_authorizations`, `purchase_profiles`, `trial_enrollments`, `trial_claims`, `billing_contracts`, `plan_changes`, `plan_change_profiles`, `renewal_cancellations`, `billing_reconciliations` | Lacuna parcial | Concessões próprias e compra/troca/renovação/claim são separados de jogador. Produto atual do contrato nativo e estados próprios de conferência passaram em 44763965632/44763972616. Não exportar cadastro/permissões do outro adulto por seleção comercial. |
| Origem financeira | `funding_observations`, `payment_funding`, `funding_captures`, `funding_source_periods` | Recorte | Fatos próprios com origem/estado atual e paginação composta passaram em 44763972616, com negativas entre pagantes. Capturas repetem entre observações: não somar nem inventar valor por período. Sem JSON livre do provedor ou origem de outro pagante; consulta não confirma pagamento novo. |
| Convite de adulto | `group_invites` | Recorte e expurgo | Próprios envios/recebimentos sem contatos alheios. Encerramento revoga/limpa pendências sob a mesma cerca da emissão. Aceite não dá propriedade do cadastro do outro adulto. |
| Direitos pessoais | `rights_preparations`, `rights_operations`, `rights_subjects`, `rights_worlds`, `account_closure_finances`, `personal_exports` | Recorte e retenção | Estado próprio e recibos de tratamento conservam datas originais, inclusive após remover o perfil vivo. Não entregar livro/segredo/ciphertext. Cópias duram dez minutos e revalidam participação; faltam revisão integral das retenções e replay nativo. |
| Proveniência histórica | `rights_recovery_runs`, `rights_recovery_sources` | Operacional privado e recorte próprio | Plano original, referências presentes/ausentes e datas efetivas de importação não são identidade nem consentimento novo. Cópia da conta expõe só tipo/data da própria operação; não plano/mapa/cerca. Importação/admissão e recusa de escopos copiados/vencidos passaram em cluster frio; reaplicação integral, retenção do livro e publicação continuam abertas. |
| Avaliação por restauração | `rights_recovery_evaluations` | Operacional privado e por execução | Referências de ator/operação/plano, mapa atual e recibo técnico de retomada; não identidade nem novo consentimento. Schema aditivo passou direitos/qualidade em f50bc3be. Retomada, retenção técnica e cópia própria ainda exigem qualificação; não expor mapa, cerca ou hashes na conta. |
| Custódia/recuperação | `snapshot_object_deliveries`, `backup_captures`, `backup_object_holds`, `backup_publications`, `backup_retirements` | Operacional privado | Inventários/envelopes não são cópias de conta. Comparar restauração antes de normalizar, usar chaves/destinos novos e reaplicar F7 antes do tráfego. Não apagar backup compartilhado para retirar um perfil; DPAPI local não comprova custódia externa. |

## Fontes externas ao schema Recreio

- `core.users` e `core.sessions`: identificação própria e metadados nativos, sem cookie, token, IP ou conteúdo de outro aplicativo. Encerramento Recreio não destrói login/identidade global.
- `billing.customers`, `subscriptions` e `subscription_payment_periods`: projeções passam pelo domínio billing, com escopo user/app Recreio. Produto de origem e atual nativo devem ser distinguidos sem sobrescrever o histórico.
- `audit.events`: candidata projeta tipos/datas dos atos próprios com ator e app Recreio explícitos; não lê payloads ou outros atores/apps. Retenção append-only de cinco anos segue `docs/audit-payload-policy.md`. Leitor passou em 44764693811/44764699861, com cursor composto e negativas entre atores/apps; revisão formal dos campos e execução da retenção permanecem necessárias.
- Redis, e-mail e telemetria: OTP, credenciais, tentativas e entrega têm retenção/expurgo próprios. Ausência em PostgreSQL não prova ausência no serviço.

## Sequência restante

1. Concessões/recibos/prazo passaram em 44759920970/44759925814; jornada v2 e limpeza em 44760442710. Atividades/visitas passaram em direitos 44762618290 (150 testes); qualidade passou em 44762623974.
2. Metadados de cadastro, convites antigos, sucessão e contrato/observações financeiras próprios passaram em 44763965632/44763972616; auditoria própria em 44764693811/44764699861, incluindo negativas entre adultos e paginação composta; valores observados não são totais nem rateio por período.
3. Conferir campos omitidos, retenções e expurgo em todas as fontes e provedores.
4. Concluir replay dos direitos na recuperação, inclusive solicitante ausente no backup, sem usuário fantasma, antes de admitir tráfego.
5. Repetir gates completos, backup/restore atuais e implantação controlada. Testes humanos permanecem no final.

Referências: [contratos e provas](encerramento-conta-2026-11-19.md), [normalização offline](normalizacao-recuperacao-2026-11-19.md), [fechamento](fechamento-plataforma-2026-11-16.md).


### Índices complementares qualificados em candidata

O complemento de 20/11 prepara quinze índices aditivos para cadastro, pareamento,
avisos, contratos/financiamento, convites/visitas, sucessão e auditoria própria.
Texto dos cursores de captura/auditoria usa collation C explícita; UUID continua
UUID. Convites e sucessão montam a página pela união limitada de referências
próprias de cada relação, com deduplicação antes da leitura dos DTOs. Não há
OFFSET no leitor nem varredura correlacionada das relações alheias como base.

A prova ampliada inclui 211 vínculos próprios em cada uma das duas fontes,
8.000 convites alheios e sobreposição alvo/aceite, além do histórico anterior.
ANALYZE/EXPLAIN nativos devem comprovar índice e condição de cursor sem desligar
sequential scan ou alterar custos do planner. Geração/adoção e gates foram concluídos conforme os recibos abaixo; não
aplicar DDL em produção sem backup, restauração e janela conferidos.


Geração 44770196292/243d654e adotada sem alterações: 0241 com quinze CREATE
INDEX não únicos, sem outra DDL/DML. Snapshot só acrescenta esses índices;
241 entradas anteriores do journal são idênticas, com 242 no total. ZIP,
SQL/snapshot/journal e fonte conferidos no
[recibo](evidencias/migracao-indices-atividades-44770196292.json).
Fonte dbeaedb9 passou upgrade PostgreSQL/direitos 44770726381, qualidade
44770733529 e conciliação 44770739502, incluindo paginação/negativas e plano nativo
de índices. Índices comuns podem bloquear escritas durante criação; conferir
dados, backup, restauração e janela antes de qualquer DDL em produção.


### Limite atual da recuperação histórica

0243 foi gerada em 44808850554 e adotada intacta em f50bc3be; direitos
44810698876, qualidade 44810703406 e versões 44810707510 passaram. A base
candidata tem 244 recibos/80 tabelas, sem DDL produtivo.

Consentimento nativo posterior à captura, apagamento real, diário e fotos
foram comprovados em 44801988161; liberação por mundo passou direitos
44805260098 e cluster frio 44805269975. [Recibo](evidencias/liberacao-mundos-cluster-frio-44805269975.json).
A retomada anterior ao backup e o recibo por execução estão em 47f15b83:
direitos 44812035838 e captura 44812048038 passaram, mas a prova externa em
cluster novo 44812548724 ainda está em execução. Captura comum não comprova
cluster frio. Histórico financeiro, retenção do livro, publicação seletiva,
custódia e tráfego continuam abertos. [Sequência](reaplicacao-nativa-2026-11-20.md).
