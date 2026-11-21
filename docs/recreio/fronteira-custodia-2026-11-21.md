# Fronteira de ambiente da custódia

A regressão 44886743996/0f73bf94 reproduziu duas aceitações indevidas do parser
do livro: escopo de homologação num serviço Railway e escopo produtivo fora do
processo autorizado. Foram duas falhas esperadas, com 632 outros testes passando.
Não houve escrita de dados produtivos; a confirmação F7 permanece desligada.

A candidata passa a usar uma única política de contexto para direitos e backup:

- Qualificação exige CI/GitHub, repositório informach/informach-apps e ausência
  de identificadores Railway. Flags copiadas não convertem um processo Railway.
- Produção exige projeto/ambiente registrados e serviço UUID, e recusa o runner
  GitHub mesmo quando recebe metadados Railway copiados.
- O modo off continua sem carregar chaves, banco ou transporte. Erros mantêm
  mensagem constante, sem valores ou issues contendo material de custódia.

As fixtures agora representam ambientes separados. Os contêineres de prova
recebem somente os três identificadores não secretos de CI necessários, além
dos dados sintéticos e das seis credenciais já limitadas à homologação. O
inicializador sem banco usa a mesma política; a restauração offline mantém sua
capacidade própria, sem herdar credenciais ou acesso ao banco original.

Na fonte c632fe91, passaram qualidade 44887683603, imagem ativa 44887686108 e
CLI completa de backup 44887688433. A jornada integrada 44887690975 falhou na
nova etapa de importação de schema privado; o diagnóstico 44888800618 isolou
SCHEMA_ARQUIVO, com limpeza confirmada. Não atribuir essa falha à fronteira de
ambiente nem chamar a recuperação de concluída. Nada desta candidata foi
ativado em produção.
