# IA opcional do EdiCaptura — decisão de 18/10/2026

O titular definiu que a IA remota opcional utilizará apenas a assinatura do próprio usuário no Claude Code ou Codex e apontou o EdiAula como referência existente. A decisão substitui a proposta de consumo de IA por créditos Edi para o EdiCaptura. Não altera cobrança, provedores ou funcionalidades dos outros produtos.

## Referência conferida no checkout

- `apps/ediaula/src/main/engines.ts`: executa os clientes oficiais instalados, mantém sessões, transmite eventos e oferece cancelamento; Claude Code recebe apenas ferramentas MCP do editor e Codex usa workspace dedicado e sandbox de leitura.
- `apps/ediaula/src/main/aiSettings.ts`: detecção dos clientes, preferências e conexão MCP. A opção de API existente no EdiAula não faz parte do escopo aprovado do EdiCaptura.
- `apps/ediaula/src/main/mcpServer.ts`, `aiBridge.ts` e `src/shared/aiTools.ts`: servidor local e operações tipadas do editor.
- `@informach/edi-desktop/access` e `/mcp-config`: autenticação/licença local, ocultação de credenciais em diagnósticos e atualização preservadora da configuração MCP.

Esta inspeção confirma implementação no código do EdiAula; não comprova uma nova execução de inferência, disponibilidade de assinatura ou homologação da integração no EdiCaptura.

## Contrato para o lote 8

Oferecer Claude Code e Codex, com conexão MCP e assistente integrado seguindo a referência existente. Extrair infraestrutura reutilizável para package com exports explícitos e verificar os consumidores, sem imports entre apps. Reutilizar autenticação, licença e configuração MCP da suíte. Preservar as opções e os fluxos existentes do EdiAula.

Não criar opção de API, chave de provedor, reserva de créditos Edi, novo plano ou fallback pago para a IA do EdiCaptura. O usuário autentica nos clientes oficiais. Não ler, copiar ou intermediar tokens/senhas dos provedores. Registrar configuração MCP exige ação explícita na interface e preservação das entradas alheias; testes usam homes isolados, nunca as configurações pessoais reais.

Cada tarefa disponibiliza somente o texto e a imagem final sanitizada que o usuário revisou. Não expor arquivos genéricos, terminal, originais, OCR oculto por máscaras ou outros documentos. Operações propostas são validadas, têm preview e aplicação/desfazer explícitos, vinculados à revisão e identidade do documento. Cancelamento, troca de documento, perda de licença e saída encerram a autoridade da tarefa e descartam respostas tardias. Sem cliente, login, rede ou limite disponível, mostrar o motivo e preservar o trabalho local.

A infraestrutura será reutilizada após revisão, não copiada com riscos conhecidos: argumentos sem interpolação de shell, subprocessos e saída limitados, sessões isoladas por motor/documento, encerramento dos filhos próprios, nenhum dump de ambiente/configuração/linha de comando e isolamento das ferramentas/MCP alheios. Testes locais não podem consumir a assinatura real nem enviar capturas sem autorização específica.

## Documentação oficial consultada

O [Claude Code permite que o usuário autentique no binário oficial sem modificações](https://code.claude.com/docs/en/legal-and-compliance), distinguindo esse uso da intermediação de credenciais ou login Claude.ai em apps de terceiros. A [integração MCP](https://code.claude.com/docs/en/mcp) é um caminho documentado. A [visão geral do Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) não autoriza oferecer login/limites Claude.ai em outro produto sem aprovação; não substituir o binário oficial por uso dos tokens via SDK/API.

A documentação do [Codex App Server](https://learn.chatgpt.com/docs/app-server) distingue integração local de autenticação embutida em serviço comercial e aponta [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source) para os casos elegíveis. A referência atual do EdiAula usa o cliente oficial local e MCP, não App Server com tokens extraídos. O lote 8 deve conferir a documentação vigente do caminho efetivamente escolhido; não presumir que a assinatura concede uma API genérica ou que registro/aprovação comercial externa já exista.

Estado em 19/10/2026: implementado no EdiCaptura sobre `@informach/edi-desktop/ai-clients` e `/mcp-server` (etapas E6 e E7 da [base comum](base-comum.md)). Tarefas delimitadas (título e etiquetas da captura; textos dos passos do guia), revisão do que vai, só leitura e proposta, aplicar e desfazer explícitos. Testado com um motor substituto e o servidor MCP real; nenhuma inferência real nem assinatura foi usada nos testes. A conexão do Captura a clientes externos (Conectar) não é oferecida, porque o Captura não expõe nada fora de uma tarefa revisada.
