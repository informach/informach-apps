# Documentação e os caminhos de build

Implementado em `744dec00`: excluir somente `**/*.md` depois das inclusões atuais dos serviços
Recreio e Morada. Os demais arquivos, packages e entradas do workspace
continuam cobertos. Inspeção dos consumidores não encontrou carregamento de
Markdown no runtime desses serviços.

Railway documenta padrões de gitignore, com negação depois das inclusões:
[configuração de watch paths](https://docs.railway.com/builds/build-configuration#configure-watch-paths).
A regressão usa o próprio Git para conferir mudanças de código, SQL e manifests,
além de Markdown em apps e packages, para os dois serviços. Testes no GitHub.

Os seis gates da [candidata](https://github.com/informach/informach-apps/actions/runs/43810865094)
passaram. Em 16/11, foram lidos os dois serviços, sem mudanças pendentes; foi
acrescentado `!/**/*.md` ao final de cada `build.watchPatterns`. A comparação
integral das configurações antes/depois confirmou somente essas duas alterações.
Não se aplicou o grafo completo nem se pediu redeploy.

O push de `744dec00` gerou `SKIPPED` nos dois serviços às 05:40:05 UTC:
portal `a7d49676-5cce-4a76-a3b9-8a14cf467dbc`, Morada
`e7a18a5f-b301-4441-b29e-70257aa92455`. Saúde e prontidão foram conferidas
novamente, todas HTTP 200, e a fonte ativa continuou `d13038b7`. A repetição
main está no [run 43811727565](https://github.com/informach/informach-apps/actions/runs/43811727565);
os seis gates também passaram. Mundo V2/protocolo 1 e a arte não mudaram.
