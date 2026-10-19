# Fixture de senha de abertura vazia

`empty-user.pdf` contém uma página de 200 × 100 pontos e o texto sintético `EMPTY_OPENING_FIXTURE`. Não contém dados de usuário. Datas do documento: 01/01/2000. Senha de abertura: vazia; senha administrativa de teste: `fixture-admin`.

Gerado durante o probe da fronteira C do PDFium 2.15.1, antes da validação, a partir de uma senha de abertura iniciada por nulo. O arquivo confirma que leitura sem senha não equivale a autorização para editar ou trocar a proteção. Os testes também verificam que `fixture-admin\0suffix` é recusado, sem truncamento para a senha administrativa. A criação desse par malformado passou a ser recusada pelo EdiPDF.
