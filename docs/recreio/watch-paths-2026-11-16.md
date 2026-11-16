# Documentação e os caminhos de build

Candidata: excluir somente `**/*.md` depois das inclusões atuais dos serviços
Recreio e Morada. Os demais arquivos, packages e entradas do workspace
continuam cobertos. Inspeção dos consumidores não encontrou carregamento de
Markdown no runtime desses serviços.

Railway documenta padrões de gitignore, com negação depois das inclusões:
[configuração de watch paths](https://docs.railway.com/builds/build-configuration#configure-watch-paths).
A regressão usa o próprio Git para conferir mudanças de código, SQL e manifests,
além de Markdown em apps e packages, para os dois serviços. Testes no GitHub.

A alteração remota ainda não foi aplicada. Depois dos gates, comparar os dois
campos `build.watchPatterns` ao vivo e alterar somente esses campos. Preservar
fontes, variáveis, volumes, banco, domínios, réplicas e demais serviços. Conferir
novamente o diff antes da integração. Confirmar que o commit documental fica
sem rebuild e que a fonte ativa continua sendo a já homologada. Não aplicar o
grafo inteiro da infraestrutura para esse ajuste.
