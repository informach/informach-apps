# Recreio: compra nativa recuperável

Parte de F6, em implementação. Não habilita checkout live, teste gratuito ou
venda. Valores e preços continuam no catálogo `@informach/config/products`.

## Autorização e recuperação

O adulto nativo, com login recente, aceita a oferta exata e a declaração adulta.
Não precisa ter jogador. O servidor prepara o grupo sem criar perfil fictício
e registra `purchase_authorizations` antes de qualquer chamada externa,
inclusive criação de customer. A FK fixa grupo e titular e restringe exclusão
enquanto uma operação externa pode existir. Compra não usa o consentimento do
teste gratuito como autorização financeira.

O recibo conserva produto, tier, intervalo, valor/moeda, versões e horário
aceitos. Um pedido ativo por pagante e uma sessão externa por recibo evitam
associações cruzadas. `requestStartedAt` antecede I/O; resposta perdida conserva
essa tentativa. `resolvedAt`/`resolution` distinguem pedido nunca enviado,
Checkout concluído e sessão expirada sem pagamento, com ordem temporal
conferida no banco. `reviewRequired` só existe em tentativa não resolvida.
Checkout concluído não é prova de fatura paga nem concessão de gameplay.

Toda preparação, execução, recuperação, reconciliação e primeira sessão de
teste conserva o mutex `recreio:billing:<pagante>` anterior à transação. Rede
fica fora das travas de linhas. Antes de devolver URL financeira, o servidor
relê a conta, login recente e aparelho nativos; registra o resultado externo
mesmo quando a autoridade de devolução acabou. Nenhuma URL é guardada no
recibo ou auditoria. Cancelamento/retorno do navegador não resolvem tentativa:
é preciso confirmar o estado remoto. Nunca presumir ausência pelo silêncio.

O primeiro teste também deve consultar essa preparação: operação financeira
ainda ativa ou já enviada impede iniciar teste novo, mesmo antes de o customer
ter sido confirmado localmente. Pedido comprovadamente nunca enviado pode
ser encerrado sem simular efeito no provedor.

## Cobertura, fatos e operação ainda a concluir

Troca Família → Individual exige decisão nativa sobre cobertura. O portal
Stripe não pode substituir essa escolha. Quem paga não herda gestão ou dados
dos outros jogadores; reduzir cobertura preserva os perfis e progresso.
Conta de cobrança, saída do grupo e exclusão no app permanecem operações
distintas. Recibos financeiros resolvidos terão retenção e encerramento F7
próprios; não liberar cascatas destrutivas para contornar a FK.

Ativação exige leitura completa e conciliada de períodos/faturas e eventos
adversos. O espelho de status e a URL de sucesso não comprovam pagamento.
Resultado desconhecido ou divergência conserva revisão observável; não apaga
histórico nem confirma liquidação. O catálogo/portal precisa passar pela
política própria da aplicação sem mudar a política existente da Suíte Edi.

## Verificação

Migrations são geradas no GitHub, conferidas por fonte, hash e predecessor,
e só então adotadas intactas. Provar FK, unicidade, estados nulos, replay,
concorrência, falha de auditoria, sessão nativa encerrada durante I/O e
recuperação após resposta perdida. Gates pesados, builds e jornadas rodam
somente no GitHub. Depois, homologar no Stripe sandbox real, com catálogo,
webhook/reconciliação, cancelamento, renovação e eventos adversos, sem venda.

Este documento e o schema inicial não implementam esses fluxos por si sós.
