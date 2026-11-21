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

A prova verde ainda precisa passar qualidade, imagem ativa, CLI completa de
backup e jornada integrada. Nada desta candidata foi ativado em produção.
