# Ensaio conjunto do encerramento Compasso

Plano local de 10/11/2026. A interface da Conta e os adapters de domínio possuem ensaios separados. Esta etapa verifica o mesmo pedido atravessando os sete domínios reais, por suas rotas HTTP, em PostgreSQL e Redis descartáveis. Não usa provedores, clientes ou dados de produção.

## Cenário e invariantes

Uma pessoa canônica será ativada em Agenda, Bora, Missão e Dia, com conteúdo representativo de cada app; Cozya terá dados pessoais do mesmo adulto. Outra família conserva seus próprios perfis e conteúdo. A identidade global também possui uma sessão independente, que deve sobreviver.

1. Criar uma avaliação pela API de domínio compartilhada. Cada app atende sua rota `account-departure`, com o segredo próprio da fixture. HTTP sem autorização é recusado; o corpo não determina ator ou domínio.
2. Somente após cinco respostas reais, iniciar o congelamento com uma sessão central recente. Comprovar revogação da sessão web e preservação da independente; criar a nova sessão de confirmação.
3. A manutenção da Conta prepara billing e família; cada app prepara sua seleção real. Conteúdo ainda existe. Confirmar o digest completo pela mesma API usada pela ação da Conta; nenhum plano sintético substitui a preparação dos apps.
4. A manutenção resolve billing antes dos apps. Executar os cinco jobs reais, verificando recibo, repetição sem novos efeitos e permanência da identidade comum até a última fase.
5. A manutenção executa família e finalização. Verificar conteúdo exclusivo removido, família alheia intacta, participação fechada, sete recibos completos, consentimento preservado e login global independente disponível.

## Execução e isolamento

O runner existente será ampliado com um modo exclusivo desse ensaio. Um servidor de app por vez usa os artefatos isolados já suportados pelo runner; isso conserva o mesmo banco entre etapas sem disputar memória com seis builds simultâneos. Playwright administra a criação/encerramento dos processos e confere HTTP. O teste usa a API pública dos packages e não importa código de um app em outro. Dados cruzados existem somente na fixture de teste.

O catálogo determina quais workers precisam responder. Chaves são geradas para o ensaio, variáveis locais de provedores são sobrepostas pelo isolamento existente e os pedidos não chamam Stripe ou IA. Ausência de Redis/readiness ou qualquer etapa falha encerra o gate; nenhuma condição é removida para fazê-lo passar. O cleanup mantém caminhos próprios e encerra serviços antes de remover a base.

Este ensaio complementa as 18 jornadas da Conta e as suítes de concorrência/autoridade de cada domínio. Não substitui backup/restauração, homologação de Stripe ou o corte operacional. Implementação inicial: `pnpm compasso:test:closure` utiliza o runner isolado, `playwright.closure.config.ts` e a fixture `e2e-system/closure.spec.ts` da Conta. A configuração executa um servidor por vez e usa somente os identificadores sintéticos no arquivo temporário. A repetição de 10/11 passou as 22 etapas com saída zero; PostgreSQL e Redis descartáveis foram removidos. O log é `.codex-compasso-closure-system-repeat.log`. A primeira tentativa teve HTTP 401 porque configurações carregadas em processos distintos geravam segredos sintéticos diferentes; o runner agora fornece o mesmo segredo efêmero ao servidor e ao teste, e a repetição confirma recusa de requisições sem autorização. A identidade comum permaneceu até a etapa familiar, os dados da outra família conservaram o mesmo digest, e o login independente continuou existente. A fixture usa conta sem customer Stripe; não homologa operações financeiras externas.
