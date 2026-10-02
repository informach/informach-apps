# Revisão 017 — conferência da entrega antes de produção

Data: 02/10/2026. Escopo: todas as alterações das rodadas 015 e 016 e as seis melhorias implementadas. Inclui conteúdo, respostas e devolutivas, progressão, autenticação, perfis, caderno, cobrança, resumos, figuras, migração e configuração real dos serviços Railway. A publicação em `main` foi solicitada explicitamente pelo usuário.

## Achados e correções

| ID | Gravidade | Problema reproduzido ou identificado | Correção |
| --- | --- | --- | --- |
| R17-01 | Alta | Pistas compartilhadas orientavam a operação errada em problemas diferentes: multiplicação em vez de divisão para descobrir um lado, contagem de cubos visíveis em vez do total, fórmula do triângulo em um trapézio. | Pistas específicas por encontro; 46 questões corrigidas. Os três testes novos de conteúdo falharam antes da alteração e passaram depois. |
| R17-02 | Média | Nove enunciados de recuperação omitiam mínimo, garantia inferior, estado inicial da bateria, divisor ou hipóteses de equiprobabilidade. | Condições explícitas; preservados os resultados matemáticos. O teste do princípio das gavetas verifica também os inteiros imediatamente anterior e posterior à resposta. |
| R17-03 | Baixa | A explicação de `equivalencia-temporal-2-2` ainda comparava com um preço à vista ausente do enunciado já tornado autossuficiente. | Explicação usa apenas as duas parcelas e seus prazos. |
| R17-04 | Alta | Link do caderno com cursor removido ou sessão indisponível chegava à página genérica de erro. | Erros esperados recebem mensagem contextual e caminho para recomeçar. Falhas inesperadas continuam propagadas; autorização permanece no repositório. |
| R17-05 | Média | Legenda e tabela de figuras ficavam claras sobre fundo branco no tema escuro. | Fundo segue o tema; área de desenho preserva fundo branco e traços escuros. Teste de navegador exige contraste mínimo de 4,5:1. |
| R17-06 | Baixa | O schema permite quadrados até a linha 5, mas a altura fixa do SVG cortaria esses arranjos. | Altura calculada pela última linha, com margem para a borda. Os arranjos atuais continuam com as mesmas posições. |
| R17-07 | Alta | O cron de produção executava uma cópia antiga em `startCommand`; publicar o arquivo novo não atualizaria a execução. | Imagem Docker pequena copia o script versionado. Serviço passa a acompanhar `main`, com watch patterns próprios, em vez de manter uma cópia do algoritmo no painel. |
| R17-08 | Média | A verificação de schema não conferia as estruturas adicionadas pela migração 0064. | Verificação das quatro colunas, tipos e nulabilidade, índice pronto/válido e FK validada com `SET NULL`. |
| R17-09 | Baixa | Novos testes de famílias independentes compartilhavam IP e esgotavam o limite real de cadastro. | Cada cenário usa um cliente simulado próprio. Limites de autenticação permanecem ativos e testados. |

O [manifesto das questões](content-changes.json) registra 54 itens de recuperação alterados (46 com pistas e nove com enunciados; há sobreposição). A explicação adicional é `equivalencia-temporal-2-2`. O ledger foi atualizado apenas para esses 55 itens após a leitura, sem aprovar alterações desconhecidas. Foram relidas as 348 questões de recuperação com gabaritos, explicações e pistas, além do diff do catálogo anterior e das alterações funcionais. O catálogo completo permanece com 3.308 questões.

## Implantação

A migração 0064 é aditiva: quatro colunas opcionais, uma FK com `ON DELETE SET NULL` e um índice. Sessões existentes conservam seus snapshots. O endpoint de prontidão exige que o banco acompanhe o journal antes de liberar o app.

O [procedimento do cron](../../../../infrastructure/railway/missao-weekly-cron.md) descreve a conexão ao GitHub, a ordem da primeira publicação e o rollback. A imagem foi compilada localmente; a sintaxe foi conferida no shell da própria imagem e o hash do script empacotado coincide com o arquivo testado.

Os resultados anteriores em `reviews-015` e `reviews-016` são registros históricos de verificações locais. Esta rodada acrescenta uma nova verificação antes do commit e a conferência operacional após o push. As evidências de produção são coletadas em arquivos locais ignorados, sem credenciais nem dados pessoais, e resumidas na entrega.

## Limites da verificação

Os testes autenticados usam PostgreSQL descartável e entregas de e-mail locais. O teste publicado verifica disponibilidade, versão, schema, páginas públicas e proteção dos endpoints. Não cria cobranças nem dispara manualmente resumos de famílias. Chromium desktop e emulação móvel não substituem Safari, aparelhos físicos ou avaliação pedagógica externa.

A configuração pessoal `.claude/settings.local.json` está fora do commit. Os avisos preexistentes do Biome em protótipos de outros apps não são erros introduzidos por esta entrega.

Consulte [VERIFICATION REPORT](verification.md) para os comandos e resultados anteriores ao commit.
