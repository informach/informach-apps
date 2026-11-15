# Sonda independente no Workers

Publicado em 15/11/2026, 14h14 UTC. **Agenda configurada; execução automática ainda em observação.** A execução manual da sonda GitHub e a ingestão Sentry passaram, mas sua agenda automática ainda não disparou na janela observada. O titular não pode ampliar a cota de uptime do Sentry. Usar a conta Workers já existente, sem trocar plano nem habilitar um produto de uptime.

## Escopo

- Um Worker `informach-recreio-monitor`, cron de cinco minutos, sem domínio, rota HTTP pública, banco ou armazenamento novo.
- Mesma sonda pura de `scripts/recreio/sonda.mjs` para GitHub e Workers: dois destinos fixos, corpo limitado a 1 KiB, prazo de 10 s, três tentativas, redirecionamento recusado e eventos sanitizados.
- Segredos somente de ingestão dos dois projetos Sentry, enviados diretamente ao provedor. Nenhuma credencial Cloudflare, Railway ou de banco no GitHub.
- Falha de prontidão ou de entrega reprova a execução do cron. Flag operacional de prova do transporte desativada por padrão; quando ligada, envia eventos informativos.

## Verificação e publicação

1. Executar testes HTTP da sonda e cinco cenários de cron no Miniflare/workerd no GitHub. A rede é substituída somente na fronteira por um servidor HTTP de fixtures; nenhuma chamada de teste usa produção.
2. Gerar `Env` a partir de `secrets.required`/configuração, conferir tipos, construir arquivo único e validar `wrangler deploy --dry-run --no-bundle` no GitHub. Ferramentas fixadas: Wrangler 4.162.0 e seu Miniflare 5.20261113.0-beta; não alteram os manifests/lockfile dos apps.
3. Baixar somente o bundle sem segredos, conferir SHA e procedência. Publicar o arquivo já construído com `--no-bundle` e sem comando de build local. Credenciais não entram no bundle, logs ou argumentos do shell.
4. Conferir a configuração no provedor, primeiras execuções agendadas e ingestão dos dois eventos de prova, depois manter a flag desligada. Mudanças de cron podem levar até 15 minutos para propagar. Não considerar apenas o upload como aceite.
5. Manter Bastidores e a alternativa GitHub. Registrar consumo e falhas; não anunciar SLA de 60 s, restauração agendada ou operação comercial concluída.

## Consumo e limites

A conta existente possui Workers no modelo `standard`; a API de assinaturas não está acessível com o escopo atual. Este desenho não requer mudar a assinatura. Cinco minutos equivalem a 288 invocações por dia (8.640 em 30 dias), com CPU configurada em 10 ms; espera de rede não conta como CPU. A documentação descreve 100 mil invocações/dia no Free e 10 milhões/mês incluídas no Standard, mas o saldo restante da conta não foi comprovado. Não prometer custo adicional zero. Eventos de falha usam a cota de erros Sentry existente; falha de ingestão precisa aparecer no cron.

Referências: [Cron Triggers e propagação](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [preços Workers](https://developers.cloudflare.com/workers/platform/pricing/), [configuração e segredos](https://developers.cloudflare.com/workers/wrangler/configuration/).

## Publicação de 15/11

Run candidato [43723080121](https://github.com/informach/informach-apps/actions/runs/43723080121): sete testes HTTP e cinco nativos aprovados, tipos gerados/compilados e deploy seco sem bundle aprovados. Repetição na main [43723421621](https://github.com/informach/informach-apps/actions/runs/43723421621) aprovada. Bundle de 6,32 KiB, SHA-256 `e64eaa7bd05fa954f5ecb0be5acd210b4138f2dfa374a94f2145ff93e9539ac8`, fonte `5e54f59f`; construído exclusivamente no GitHub. Publicação local usou somente `--no-bundle`, sem build configurado. Segredos transferidos diretamente de Railway em arquivo temporário restrito e removido, sem valores no shell/GitHub/logs.

Versão inicial Workers `1e0ed8e3-ff78-4284-af61-7eb5a75d4f93`, cron `*/5 * * * *`, modelo existente `standard`, CPU 10 ms. API confirmou cron, dois bindings `secret_text`, logs habilitados e domínio/preview desativados. Nenhuma troca de plano ou remoção de outro monitor. Flag de prova temporariamente ligada até observar os dois eventos sanitizados da agenda; desligar após a prova.

Regra Sentry [6349336](https://informach-nucleo-de-aprendizag.sentry.io/monitors/alerts/6349336/) cobre somente os dois projetos em produção, mensagem exata `recreio.external_readiness_failed`, nível >= erro, e-mail aos responsáveis ou membros ativos e intervalo de 30 min. Não depende da prioridade automática. As regras gerais anteriores permanecem. Recebimento humano dos avisos operacionais anteriores confirmado; esta regra específica ainda não foi exercitada por uma indisponibilidade real ou provocada em produção.
