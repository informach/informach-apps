# Salvamento restrito no fim da autorização

Plano de F3 em implementação. Não habilitar famílias, cobrança ou pausa
automática com base no modelo ou no aviso antecipado isolados.

## Contrato

A concessão infantil continua de até 60 segundos e termina no horário,
orçamento ou mudança do dia. A margem de salvamento não é tempo de gameplay.
Uma capacidade distinta, emitida enquanto a sessão está autorizada, permite
somente concluir a persistência e encerrar o mesmo SID por até 30 segundos
depois da concessão. Não aceita novos comandos, entrada em mundo, conquistas,
renovação, administração ou abertura de outra partida.

Usar token EdDSA com `typ` próprio e escopo exclusivo `salvar`, vinculado a
recibo persistido, perfil, jogo, SID, versão da política e aparelho original.
Os verificadores de ingresso e sessão recusam esse tipo. Token, corpo e hashes
de conteúdo nunca entram em auditoria, URL, DOM, logs ou armazenamento web.
O prazo assinado e o persistido são limites cumulativos, relidos ao final.

A autorização atual de identidade/aparelho é compartilhada com gameplay:
login ou pareamento vigentes, geração, responsável, perfil ativo, banimento
e política atual. A capacidade não sobrevive a logout, revogação, mudança
de perfil, política ou responsável, nem a uma sessão sucessora. Perda de
direito comercial pode permitir salvar dentro do prazo, sem restaurar acesso.
Retorno idempotente de um recibo concluído nunca reexecuta uma escrita.

Dados de perfil usam somente gravação com revisão/CAS, cotas e preservação
de conflitos existentes. Um lote final tem chaves únicas e tamanho total
limitado; falha não declara sucesso. Conflitos conservados devem ser informados
para resolução ao voltar, sem escolher uma versão silenciosamente. O mesmo
motor de dados atende a chamada normal e a finalização já autorizada; não
copiar o writer ou criar um acesso genérico a transações.

Mundos são confirmados somente pela instância autenticada e pela posse atual:
pausar comandos daquele SID, concluir sua fila admitida, persistir fotografia
íntegra cobrindo o diário e confirmar cerca/revisão/sequência. Outros membros
continuam. Um booleano do navegador não é prova. A integração genérica faz a
homologação; Morada continua com a capacidade que seu adapter realmente oferece.

## Incrementos e arquivos

1. Modelo aditivo em `packages/db/src/schema/recreio-salvamento.ts`, export
   e geração remota por `db-generate.yml`; revisar SQL, snapshot e proveniência.
   Nenhuma alteração manual em arquivos gerados, backfill de sessões abertas
   ou execução de sementes. Aplicar antes de consumidores e conservar no rollback.
2. Tipo/claims próprios em `packages/recreio/src/contrato/tokens.ts`, emissor
   e verificação restrita; contratos de finalização e limites no mesmo package.
   Negativas de troca de tipo/audiência/perfil/prazo e compatibilidade antiga.
3. Extrair somente a admissão comum de identidade/aparelho do kernel existente,
   preservando ordem de travas. Gameplay conserva cobrança/conteúdo/tempo.
   Finalização exige o recibo e verifica o mesmo SID/aparelho/PV e a ausência
   de sucessor, sob o mutex de sessão e antes de escrever dados.
4. Emitir/renovar o recibo e token na transação normal da concessão. Recuperar
   abertura devolve somente o recibo do SID já aberto, sem criar concessão.
   Um deploy antigo continua válido com o novo recurso desligado.
5. Finalizador de perfil, rotas restritas e extensão do SDK. Serializar a fila,
   conservar o corpo/recibo em resposta incerta e repetir somente a mesma
   operação. Encerramento, prova, auditoria e dados confirmam atomicamente.
6. Finalizador de mundo pela API das instâncias; consumidor genérico e jornadas
   reais de tempo, rede e outro membro. Nenhuma tolerância global de JWT ou
   método que transforme a capacidade de salvar em sessão de jogo.
7. Integrar aviso/pausa, finalização e mensagens do host; expurgar recibos em
   lotes limitados; agregar separadamente o tempo de salvar após o corte.
   Na mudança do dia, exigir nova admissão: nunca renovar o intervalo anterior.

## Verificação e aceite

Somente no GitHub, com PostgreSQL descartável e navegadores reais. Conferir:
tempo/horário/dia; token normal vencido recusado; capacidade restrita só persiste;
revogação e política concorrentes; sucessor; replay com mesmo corpo e recusa
de corpo divergente; conflito; auditoria com falha/espera; expiração durante
trava; posse perdida, fotografia corrompida e outro membro ativo. Testar falha
de rede depois do commit sem duplicar dados ou declarar salvamento inexistente.
Os consumidores compartilhados e os sete gates do Recreio precisam de evidência
aplicável à fonte final, seguida de implantação e conferência de configuração.

Este plano não é entrega. F1 e F4–F11 permanecem no registro principal.

## Preparação candidata

Modelo `70fb884c`, gerado no GitHub em `44060168275`, artefato `14317712495`.
Copiados e conferidos sem edição manual:

- `0177_whole_tomas.sql`: 5.676 bytes,
  SHA-256 `928c8bf90cd72c7c643485dddd383248e53295f7679e3f91d48a12f0c551760d`.
- `0177_snapshot.json`: 766.432 bytes,
  SHA-256 `cf6a04e5e8bfc336ca05a40885e0f8c38429e16589f104ad07d32d1aa59f1a21`.
- Journal: 27.022 bytes,
  SHA-256 `ffe01215e0a48045b722867bd837e3aadeaa965f16b52d45024d6320d992d15a`.

Somente tabela nova, FKs/constraints e índices sobre tabela vazia. Não há
backfill nem mudança de constraints existentes. As seis provas do modelo
verificam correlação, margem, ciclo terminal (inclusive NULL em CHECK), prova
de mundo, expiração e ausência de reabertura ao remover o recibo.

O primeiro incremento de contratos acrescenta tipo/escopo restritos, prazo
criptográfico exato, emissor e verificadores, além do lote final limitado e
sem chaves duplicadas. Ainda não emite capacidade em sessão real, não expõe
rota e não persiste pela margem. Nenhuma configuração de produção habilita
o modelo. Os gates da candidata ainda precisam ser executados.
