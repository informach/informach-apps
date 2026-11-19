# Checkout nativo — ambiente isolado de homologação

Estado: portal de teste implantado na fonte qualificada `9ea03e4c`, com banco
e cache próprios. Origem:
https://recreio-homologacao-checkout-production.up.railway.app

O portal respondeu 200 em `/api/ready`, `/entrar` e `/` em 19/11. Isso não
comprova login, Checkout, webhook recebido, assinatura ou cancelamento. A etapa
humana de login/Checkout foi apresentada ao titular; resultado ainda pendente.

Recursos separados no projeto Railway existente: `recreio-homologacao-checkout`,
`recreio-homologacao-pg`, `recreio-homologacao-redis` e
`cron-recreio-homologacao-financeiro`. Banco vazio inicial, sem cópia de produção,
sem proxy TCP público; cache autenticado separado. Postgres/Redis/curl usam
imagens fixadas por digest. Sentry usa o projeto `recreio-homologacao`, separado
dos erros de produção. Não foi contratado uptime pago.

O build remoto inicial passou, mas o pré-deploy recusou corretamente
`CUTOVER_HELD` ao encontrar banco novo sem o marco 0162. Reimplantar o build
antigo conservou seu snapshot anterior de configuração e repetiu a recusa.
A nova implantação aplicou a configuração atual: liberação explicitamente
restrita ao pré-deploy deste banco descartável, migrations sem seeds, sem
liberação do migrator ou banco de produção. Implantação `cb48deb8` concluída.

Configuração comercial: `sandbox`/Stripe `dev`; quatro preços aprovados e
portal de teste relidos na conta já cadastrada. Endpoint exclusivo de teste
`/api/webhooks/stripe`, com os 25 eventos aceitos pelo receptor nativo.
O provisionamento não criou customer, Checkout, assinatura ou charge.
Credenciais efêmeras próprias estão cifradas fora do Git; nenhuma chave foi
publicada ou adicionada ao GitHub Actions. A chave Stripe usada é somente TEST.
SendGrid é reutilizado por referência, para OTP solicitado pelo próprio usuário.

Família `setup`; social/visitas/checkpoint/teste/objetos desligados e nenhum
servidor de jogo conectado ao banco isolado. Job financeiro habilitado somente
nesta homologação, com cron de cinco minutos, segredo referenciado do portal
e chamada por rede privada. Execução HTTP/registro nativo e entrega real do
webhook ainda precisam ser conferidos; ter configuração não comprova execução.

Não alterar ou encerrar um contrato real nesta jornada. Somente cartão de
teste, autenticação do próprio adulto e desafio do provedor sem bypass.
Após o ensaio: conferir recibos/assinatura/acesso, cancelar pelo fluxo próprio,
resolver os recursos Stripe sintéticos, medir custo separado e retirar somente
os recursos temporários desta homologação. Resultado não libera venda.
