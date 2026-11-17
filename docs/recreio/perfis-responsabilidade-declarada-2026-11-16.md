# Perfis sob responsabilidade declarada

Parte de F1–F3. Decisão do titular: o adulto cadastra seu perfil ou o de uma
criança sob responsabilidade própria. Não existe fornecedor de verificação;
compra, declaração e verificação externa não são fatos equivalentes.

## Modelo e fronteiras

`adult_declarations` registra o aceite nativo de uma versão da declaração.
`minor_profiles` guarda somente mês e ano de nascimento e só se liga a perfil
`minor`, por FK composta. `guardian_links` identifica o responsável atual e a
declaração dele por FK composta; pagar o grupo não cria esse vínculo.
Eliminar a identidade responsável exige resolver primeiro esses vínculos,
sem apagar implicitamente progresso compartilhado ou cadastro de outra pessoa.

Cadastro: conta nativa atual e recente → grupo próprio → limite de quatro
jogadores → perfil menor → mês/ano → vínculo explícito → auditoria estrita.
Sem perfil adulto obrigatório. Repetição exige recibo próprio para não criar
dois filhos após perder a resposta. A chave idempotente não vai à auditoria.
O servidor prepara uma intenção de 15 minutos antes da gravação. A confirmação
consome essa linha com perfil e resumo do pedido na mesma transação. Não criar
intenção quando receber um ID desconhecido. Recibos confirmados duram 24 horas;
exclusão do perfil conserva o recibo sem referência, impedindo recriação por
repetição antiga. A limpeza não torna um ID desconhecido válido.
O schema é aditivo e a migration é gerada no GitHub, nunca editada à mão.

Idade e classificação são calculadas no servidor com o relógio admitido após
as esperas; duas camadas: social até 12/13–17 e limite L/6/10/12/14/16. Aos 18,
o perfil continua protegido até a transição explícita para conta própria.
Nenhum jogo recebe mês/ano ou identidade do responsável. Classificação
`em_analise` continua incompatível com menores; não reclassificar o Morada para
fazer o teste passar. O jogo interno L prova o contrato da plataforma.

## Sequência e aceites

1. Contratos de nascimento e declaração, cálculo puro com meses limite,
   recusa de nascimento futuro e cadastro inicial com 18 ou mais.
2. Schema, geração remota, conferência de proveniência e PostgreSQL descartável:
   FK não aceita responsável/declaracão de outra conta nem metadados infantis
   em perfil adulto. Auditoria nunca recebe nascimento, apelido ou conteúdo.
3. Autoridade nativa recente vinculada ao aparelho, depois das travas. Criação
   idempotente com grupo sem jogador adulto; quota também na criação própria.
   Duas criações concorrentes não ultrapassam o limite e falha de auditoria
   reverte perfil, vínculo e recibo.
4. Formulário e gestão de filhos, seleção autorizada e política efetiva. Manter
   credencial infantil bloqueada para gestão e compras; pareamento/PIN em F2.
   Antes da ativação em produção, concluir a autoridade infantil nas APIs do
   SDK, o limite de conteúdo e as provas de chamadas diretas em F2–F3.
5. Testar família com pagante sem perfil, contas distintas e quatro jogadores;
   completar convites/cobertura e os demais aceites de F1 antes de marcá-lo feito.

Estado: projeto do incremento; não comprova cadastro infantil implementado,
verificação de idade ou liberação para menores em produção.

## Sequência da geração

A primeira geração (`43991804537`, fonte `0694e16`, artefato `14287502455`)
foi rejeitada na revisão: o Drizzle colocou a FK composta de `minor_profiles`
antes de criar a UNIQUE de `profiles(id, kind)`. O SQL não foi editado nem
aplicado. Gerar primeiro somente a UNIQUE existente e incorporar a migration;
depois reexportar o schema familiar e gerar a próxima migration com as tabelas.
O PostgreSQL descartável precisa aplicar a sequência inteira antes da publicação.
