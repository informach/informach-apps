# Políticas efetivas e autoridade dos jogos

F3 do [fechamento](fechamento-plataforma-2026-11-16.md), em série com F1/F2.
O cadastro declarado, o pareamento e o PIN não autorizam ativação infantil
isolada. Todos os testes, builds, cargas e navegador rodam no GitHub.

## Entrega

1. Política efetiva calculada no servidor: faixa social e classificação
   separadas, configuração de supervisão, regras versionadas, horário semanal
   e tempo diário agregado. Mês/ano e identidade responsável não chegam ao jogo.
2. A idade é o teto inicial de conteúdo; eventual limite do responsável só o
   reduz. Conteúdo `em_analise` e adulto continua recusado a menores. Aos 18,
   não converter o perfil protegido em identidade adulta silenciosamente.
3. Nenhum horário ou limite diário é inventado como decisão do responsável.
   Ausência de configuração significa ausência desse limite; pausa explícita
   e lista de horários vazia são fatos diferentes. Padrões de comunicação e
   visibilidade continuam protetivos. Aprovação de contatos pertence a F4.
4. Tempo contabiliza a concessão autoritativa do perfil, não um contador
   enviado pelo navegador. Um perfil tem uma partida vigente; aparelhos não
   ganham orçamentos independentes. Renovação/saída acertam o intervalo
   admitido, com corte na virada do dia de Brasília e no horário permitido.
5. Aviso antecipado e salvamento têm prazo delimitado. Confirmar checkpoint
   antes da transferência de aparelho; silêncio/falha não vira confirmação.
   Falta de rede tem limite de concessão verificável, nunca promessa de corte
   instantâneo durante partição.

## Autoridade transacional comum

As APIs atuais de mundos entregam só `perfilId/jogo` ao repository. Isso não
basta para reler aparelho, política e sessão de jogo depois de esperar por
travas. Antes de aceitar menores, preservar a referência autenticada completa
da operação (aparelho ou SID/token com prazo e versão) até a transação.

A ordem de mundos existente é identidade → mundo(s) → perfil → aparelho →
cursor → sessões de jogo. Dados sem mundo mantêm identidade → perfil → mutex
dos dados → aparelho → sessão de jogo → chave. Não segurar a sessão de jogo
para depois esperar um mundo ou pedir o cursor de encerramentos.

O kernel deve ter preparação/admissão explícitas: localizar a identidade por
uma pista e travá-la; o repository toma suas travas de mundo; só então reler
perfil, vínculo/geração, aparelho, política, acesso e token depois das esperas.
Login usa a conexão transacional no fallback PostgreSQL, conservando Redis
autoritativo quando configurado. Provar novamente dez escritores sem conexão
extra no pool. Credencial pareada e contexto nativo infantil são autoridades
restritas, sem receber a administração da conta responsável.

A revisão da política efetiva exige trava de perfil apropriada desde o início;
não elevar SHARE a UPDATE com leitores concorrentes. Alterar política deve
invalidar as concessões anteriores e notificar o host pelo mecanismo de fim
de sessão. Recalcular idade e aplicar configuração são fatos auditáveis com
IDs/códigos, sem nascimento, horários detalhados ou conteúdo privado.

## Ingresso, SDK e compatibilidade

Admission/renovação precisam usar prazo e versão derivados sob trava. Se a
assinatura local do token entrar na transação, a composição deve garantir
somente criptografia local, sem rede. Falha da assinatura ou auditoria reverte
consumo do ingresso, sessão e tempo juntos. Não entregar um token com política
calculada antes da espera enquanto a linha aceita outra versão.

Campos novos de política precisam conservar o leitor adulto antigo. O catálogo
do Morada continua Mundo V2/protocolo 1 e `em_analise`; nenhum teste pode
reclassificá-lo para liberar menor. O título interno L sem mundos prova a
plataforma infantil independente do conteúdo do Morada. Hosts devem conferir
a política efetiva nas ações; botão escondido não é autorização.

## Aceites antes de publicar

- Conta sem jogador configura quatro perfis, PIN e pareamento, cada perfil com
  seu progresso. Nenhuma chamada direta infantil administra família/cobrança.
- Ingresso, renovação, dados/conquistas, mundos/convites e admissão de host
  recusam credenciais revogadas, geração/política antigas e prazo vencido sob
  espera real de trava. Restaurar cobertura não restaura uma credencial antiga.
- Faixas limite, virada de mês/dia, horário inexistente, pausa, orçamento
  agregado entre aparelhos e resposta perdida têm provas determinísticas.
- Troca de aparelho pede e confirma checkpoint, com prazo de falha e sem
  encerrar silenciosamente o progresso confirmado do anterior.
- Navegador mostra estante protegida e aviso de tempo, salva/sai/reabre o jogo
  interno; Morada incompatível é recusado também por API.
- Seis gates, consumidores compartilhados, migração gerada/conferida, revisão
  e implantação verificadas. F4–F11 continuam abertos depois deste incremento.

Estado: desenho do incremento, sem políticas infantis de jogo ativadas em produção.

## Schema e implantação

`minor_policies` guarda a configuração e o último cálculo efetivo, com versão
observada/aceita separadas. Agenda nula é não configurada; array vazio bloqueia
todos os horários. `minor_daily_usage` mantém um agregado por perfil/dia local
e o intervalo da concessão em curso, sem conteúdo do jogo. A retenção global
precisa remover agregados com mais de trinta dias, em lotes delimitados.

A FK da concessão usa sessão/perfil juntos, impedindo atribuir ao menor uma
sessão de outro perfil. Primeiro gerar a UNIQUE correspondente em
`game_sessions`; só depois reexportar e gerar as tabelas de política/uso. Isso
evita a ordem inválida de FK antes de UNIQUE já encontrada no gerador. A
correlação é anulável; retenção/exclusão de sessões deve acertar o intervalo
e retirar a referência antes de eliminar a sessão histórica, sem apagar o
tempo agregado ou deixar uma FK de outro perfil. Não usar SET NULL composto
que tente anular o `profile_id` obrigatório.

A ativação exige primeiro leitores que reconheçam a restrição infantil, com
novos escritores desligados, e só depois habilitação comprovada dos fluxos.
Depois de criar contextos nativos protegidos, uma versão adulta antiga que
ignora `minor_context_generation` não é rollback seguro. O piso de rollback
deve ser uma release com esses leitores; desligar cadastro/jogo infantil não
apaga a trava nem impede retorno autorizado do responsável. Validar esse
contrato de implantação antes de habilitar a escrita em produção.

Primeira etapa de geração: run GitHub `44013448586`, fonte
`0ee900b51b241480001390b32a478a055e6baf6e`, gerou somente a UNIQUE em
`0172_curious_starjammers.sql` (119 bytes, SHA-256
`02a9a8d1df90a1649310543923caaca4c803d16d123d6bdb76093af16d8204f4`).
Origem, três caminhos, tamanhos e hashes do artefato foram conferidos antes
da cópia. SQL e metadados não foram editados. Schema de políticas reexportado
somente depois dessa etapa, para a segunda geração. Nenhuma das migrations
0168 em diante foi aplicada em produção neste incremento.
