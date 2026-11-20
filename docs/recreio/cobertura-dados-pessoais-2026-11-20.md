# Inventário da cobertura pessoal do Recreio

Base: snapshot candidato 0240, 241 recibos, 77 tabelas `recreio`. Revisão em 20/11/2026; produção ainda na base 0203/204 recibos. Não é declaração de exportação integral, parecer jurídico ou implantação.

Esta matriz confere a presença das fontes e registra lacunas. Revisão campo a campo, retenções e prova dos últimos incrementos continuam necessárias. UUIDs históricos permanecem dados pessoais; não são anônimos. Encerrar o Recreio não apaga a identidade global ou os fatos financeiros.

| Área | Fontes persistidas | Situação | Contrato e lacunas |
| --- | --- | --- | --- |
| Cadastro | `groups`, `profiles`, `minor_profiles`, `guardian_links`, `adult_declarations`, `profile_creation_requests`, `account_participations` | Recorte | Cadastro próprio/parental, declaração e participação possuem DTOs. Metadados do grupo próprio, cobertura do perfil e intenções de cadastro foram acrescentados à candidata; gates pendentes. Titularidade comercial não concede cadastros de terceiros. |
| Aparelhos e proteção | `device_sessions`, `native_pins`, `minor_protection`, `paired_credentials`, `pairing_requests` | Lacuna parcial | Conta inclui aparelhos nativos e somente definição/data do PIN. Metadados dos próprios pareamentos e aparelhos pareados passaram em direitos 44762618290; nunca token, hash, geração ou segredo de polling. |
| Supervisão e tempo | `minor_policies`, `minor_daily_usage` | Recorte | Configuração reconhecida e uso agregado do próprio menor sob responsabilidade atual. Nascimento/faixa não é identidade verificada. Sem supervisão ou uso de outro perfil. |
| Dados de jogo | `profile_data_keys`, `profile_data_versions`, `profile_achievements` | Recorte | Chaves/revisões, versões/conflitos e conquistas por perfil/jogo, inclusive título retirado. Excesso deve falhar explicitamente sem apresentar arquivo parcial como integral. |
| Mundos | `spaces`, `space_members`, `space_invites`, `space_stewardship_requests`, `space_snapshots`, `space_journal`, `profile_world_traces` | Compartilhado e lacuna | Não exportar mundo/diário/resumo compartilhado como propriedade do solicitante. Vínculos próprios têm recorte; adapter retira identificadores preservando terceiros. Convites antigos e propostas de sucessão próprios foram acrescentados à candidata; gates pendentes. |
| Execução temporária | `game_tickets`, `game_sessions`, `session_save_permits`, `session_handoffs`, `game_instances`, `space_leases`, `world_host_presences` | Capacidades privadas | Sessões possuem histórico sem SID. Ingresso, permit, geração/cerca e segredo de host não entram no arquivo. Revogação offline provada no cluster frio; isso não admite tráfego nem resolve replay F7. |
| Social | `friend_codes`, `friend_requests`, `friend_consents`, `friendships`, `social_blocks`, `social_notices`, `social_preferences` | Lacuna parcial | Grafo/preferências/bloqueios próprios e aprovações originais possuem recortes. Avisos dirigidos ao próprio adulto passaram em direitos 44762618290. Não expor quem bloqueou outro perfil, códigos, hashes ou gerações. |
| Convites dirigidos | `directed_space_invites`, `directed_invite_world_approvals`, `directed_invite_guardian_approvals` | Recorte | Perfil recebe vínculos próprios; conta recebe só atos do próprio adulto. Sem nome/geração da outra ponta e sem herdar gestão de mundo por aprovação parental. |
| Visitas | `space_visit_invites`, `visit_invite_world_approvals`, `visit_invite_guardian_approvals`, `world_visits`, `world_visit_sessions` | Lacuna parcial | Visitas concedidas e aprovações possuem recortes. Convite ainda sem concessão passou em direitos 44762618290. Não entregar SID/presença/capacidade; retenções técnicas conservam seus prazos originais. |
| Sucessão supervisionada | `stewardship_guardian_approvals` | Recorte | A proposta aprovada pelo próprio adulto entra na cópia da conta. Não substitui aceite do destinatário nem homologa a transferência. |
| Segurança | `safety_reports`, `profile_restrictions`, `restriction_reviews`, `moderation_commands` | Recorte e retenção | Denúncias emitidas, restrição própria e recursos têm projeção. Ser alvo não concede denúncia. Sem evidência, denunciante alheio, moderador ou chave de repetição. Registrar retenções do domínio. |
| Comercial | `entitlements`, `purchase_authorizations`, `purchase_profiles`, `trial_enrollments`, `trial_claims`, `billing_contracts`, `plan_changes`, `plan_change_profiles`, `renewal_cancellations`, `billing_reconciliations` | Lacuna parcial | Concessões próprias e compra/troca/renovação/claim são separados de jogador. Completar produto atual do contrato nativo e estados próprios de conferência. Não exportar cadastro/permissões do outro adulto por seleção comercial. |
| Origem financeira | `funding_observations`, `payment_funding`, `funding_captures`, `funding_source_periods` | Lacuna | Incluir fatos próprios por pagante, grupo e modo completos. Capturas repetem entre observações: não somar nem inventar valor por período. Sem JSON livre do provedor ou origem de outro pagante; consulta não confirma pagamento novo. |
| Convite de adulto | `group_invites` | Recorte e expurgo | Próprios envios/recebimentos sem contatos alheios. Encerramento revoga/limpa pendências sob a mesma cerca da emissão. Aceite não dá propriedade do cadastro do outro adulto. |
| Direitos pessoais | `rights_preparations`, `rights_operations`, `rights_subjects`, `rights_worlds`, `account_closure_finances`, `personal_exports` | Recorte e retenção | Estado próprio e recibos de tratamento conservam datas originais, inclusive após remover o perfil vivo. Não entregar livro/segredo/ciphertext. Cópias duram dez minutos e revalidam participação; faltam revisão integral das retenções e replay nativo. |
| Custódia/recuperação | `snapshot_object_deliveries`, `backup_captures`, `backup_object_holds`, `backup_publications`, `backup_retirements` | Operacional privado | Inventários/envelopes não são cópias de conta. Comparar restauração antes de normalizar, usar chaves/destinos novos e reaplicar F7 antes do tráfego. Não apagar backup compartilhado para retirar um perfil; DPAPI local não comprova custódia externa. |

## Fontes externas ao schema Recreio

- `core.users` e `core.sessions`: identificação própria e metadados nativos, sem cookie, token, IP ou conteúdo de outro aplicativo. Encerramento Recreio não destrói login/identidade global.
- `billing.customers`, `subscriptions` e `subscription_payment_periods`: projeções passam pelo domínio billing, com escopo user/app Recreio. Produto de origem e atual nativo devem ser distinguidos sem sobrescrever o histórico.
- `audit.events`: finalidade, projeção própria e retenção ainda precisam de revisão formal. Direito pessoal não concede busca livre em logs ou dados de outro ator.
- Redis, e-mail e telemetria: OTP, credenciais, tentativas e entrega têm retenção/expurgo próprios. Ausência em PostgreSQL não prova ausência no serviço.

## Sequência restante

1. Concessões/recibos/prazo passaram em 44759920970/44759925814; jornada v2 e limpeza em 44760442710. Atividades/visitas passaram em direitos 44762618290 (150 testes); qualidade em curso.
2. Metadados de cadastro, convites antigos, sucessão e contrato/observações financeiras próprios implementados em nova candidata, ainda sem prova remota. Provar negativas entre adultos e paginação composta; valores observados não são totais nem rateio por período.
3. Conferir campos omitidos, retenções e expurgo em todas as fontes e provedores.
4. Concluir replay dos direitos na recuperação, inclusive solicitante ausente no backup, sem usuário fantasma, antes de admitir tráfego.
5. Repetir gates completos, backup/restore atuais e implantação controlada. Testes humanos permanecem no final.

Referências: [contratos e provas](encerramento-conta-2026-11-19.md), [normalização offline](normalizacao-recuperacao-2026-11-19.md), [fechamento](fechamento-plataforma-2026-11-16.md).
