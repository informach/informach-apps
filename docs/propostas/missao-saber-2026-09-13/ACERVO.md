# Acervo de referência e cobertura da coleta

Consulta e coleta: **13/09/2026**. O acervo apoia pesquisa curricular. **A decisão do produto é publicar apenas conteúdo autoral**; os originais não serão a biblioteca comercial do app.

## Resultado material

- **660 downloads válidos**, correspondentes a **646 conteúdos distintos por SHA-256**. URLs diferentes podem apontar ao mesmo arquivo.
- **886.366.825 bytes** nos downloads, aproximadamente **886.4 MB**, incluindo o pacote POTI.
- **9.346 páginas** nos PDFs baixados diretamente. Esse total inclui versões e cópias idênticas; não é número de questões nem de páginas inéditas.
- O ZIP oficial POTI contém **1.479 entradas**, incluindo pastas, fontes TeX e figuras. Há **784 membros PDF**, dos quais **445 são distintos por hash dentro do ZIP**, totalizando **2.777 páginas**. Esses PDFs foram extraídos e tiveram o texto processado. Incluem figuras isoladas e duplicações em relação a outros materiais: não são 445 aulas completas adicionais.
- **10 URLs de documentos falharam**. Uma falha de URL não implica necessariamente falta do conteúdo: parte foi recuperada por outro endereço oficial.

| Grupo | Downloads válidos |
| --- | ---: |
| Canguru Brasil | 114 |
| OBMEP: provas, soluções, bancos, PIC e regulamento | 331 |
| Olimpíada Carioca: complemento encontrado no índice OBMEP | 8 |
| Mirim e Nível A do índice Mirim | 38 |
| POTI: materiais individuais e ZIP | 145 |
| OLITEF | 24 |

## Como consultar

Comece pelo [catálogo navegável](acervo/CATALOGO.md), com links locais e origem oficial. Para filtrar por edição, nível, fase e tipo, use o [CSV normalizado](acervo/catalogo.csv) ou [JSON normalizado](acervo/catalogo.json).

O [manifesto bruto](acervo/manifesto.json) preserva URL original, URL efetiva de download, data, status HTTP, tamanho, hash, páginas e resultado da extração. Suas primeiras inferências de ano/nível não devem substituir os campos normalizados: um número em uma questão pode ter sido confundido com uma data. O nome da pasta do download também não é autoridade editorial.

Os originais estão em [acervo/arquivos](acervo/arquivos/), o texto extraído em [acervo/textos](acervo/textos/) e as páginas de origem salvas em [acervo/paginas](acervo/paginas/). O [inventário do ZIP POTI](acervo/pacote-poti.csv) associa cada nome interno ao arquivo extraído. Os binários e extrações permanecem no disco local, ignorados pelo Git; os documentos de proposta, scripts e metadados são versionáveis. Copiar apenas o repositório Git não transportará os PDFs.

## Cobertura histórica e por nível

### OLITEF

Foram baixados os materiais pedagógicos listados no [arquivo oficial](https://www.olitef.com.br/baixar-provas-anteriores): provas com gabaritos de **2024 e 2025**, simulados com gabaritos de **2025**, sempre nos **três níveis**, e os **três cadernos do estudante de 2026**. São 12 documentos pedagógicos centrais, além de regulamentos e outros documentos institucionais.

As provas de 2026 não constavam no arquivo público consultado; o caderno 2026 não deve ser rotulado como prova dessa edição. Não há uma edição OLITEF 2023 a preencher nesta coleção. A classificação histórica deve respeitar o ano: por exemplo, o cabeçalho da prova N3 de 2024 menciona o 1º ano do ensino médio; não substituir essa informação pela elegibilidade atual.

Os cadernos têm 50 páginas (N1), 47 (N2) e 55 (N3). Educação financeira básica, renda fixa e renda variável aparecem nos três. O [currículo proposto](CURRICULO.md) mapeia essas referências e explicita a diferenciação didática criada para os nossos cursos.

### Canguru Brasil

Foram localizadas **2021, 2022, 2023, 2024, 2025 e 2026**, com os seis níveis **P, E, B, C, J e S**, provas em português e inglês e respectivos gabaritos. Foram incluídos o conteúdo programático e as notas de corte disponíveis.

O [índice principal](https://www.cangurudematematicabrasil.com.br/provas-anteriores) e o [índice complementar](https://www.cangurudematematicabrasil.com.br/provas-anteriores-popup) diferem: o segundo disponibilizava 2026. O gabarito S de 2022 ausente em um índice foi recuperado pelo padrão de URL do armazenamento oficial, com resposta HTTP 200 e validação do PDF.

**2009–2020 permanecem não localizados nos acervos oficiais públicos consultados.** Foram pesquisadas páginas e referências históricas; materiais de Portugal, cópias sem proveniência e publicações comerciais não foram apresentados como arquivo brasileiro oficial. A ausência na consulta não prova que os organizadores não possuam os originais. Essa é uma lacuna real do pedido de todos os anos, registrada sem presumir completude.

### OBMEP

Foram consultados os índices de **2005–2019 e 2021–2025**, cobrindo níveis 1, 2 e 3 e as duas fases conforme a publicação disponível. O [índice oficial](https://www.obmep.org.br/provas.htm) não lista uma edição principal 2020; o banco de questões 2020 é um material diferente. O regulamento 2026 foi baixado; as provas 2026 não constavam nesse arquivo histórico na consulta.

A pesquisa reconciliou o site principal com o espelho da 20ª edição e seguiu páginas separadas de soluções. Os PDFs de soluções ligados a essas páginas foram baixados; a lista de páginas está em [soluções interativas](acervo/solucoes-interativas.json). Não foram baixadas gravações de vídeo.

Foram incluídos **15 bancos de questões, de 2006 a 2020**, a errata/soluções alternativas vinculada ao índice, **18 publicações PIC** e **nove arquivos de simulados** encontrados no menu correspondente. Os oito documentos da Olimpíada Carioca encontrados na página de 2021 ficam identificados como complemento: não substituem a primeira fase da OBMEP.

O quadro de cobertura abaixo conta os papéis prova/solução × fase × nível. Versões ampliadas, cores e endereços duplicados não aumentam essa cobertura.

| Edição OBMEP | Papéis encontrados / 12 | Pendências no catálogo |
| --- | ---: | --- |
| 2005 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2006 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2007 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2008 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2009 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2010 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2011 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2012 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2013 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2014 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2015 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2016 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2017 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2018 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2019 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2021 | 6 / 12 | N1 F1 prova; N1 F1 solucao; N2 F1 prova; N2 F1 solucao; N3 F1 prova; N3 F1 solucao |
| 2022 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2023 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2024 | 12 / 12 | Nenhuma nesses 12 papéis |
| 2025 | 12 / 12 | Nenhuma nesses 12 papéis |

### Mirim e POTI

O índice [Mirim](https://olimpiadamirim.obmep.org.br/provas-solucoes) fornece provas e soluções dos níveis Mirim 1/2, em duas fases, de **2022–2025**: oito documentos por ano. Também foram baixados seis arquivos das três edições do Nível A apresentadas pelo próprio índice na seção 2019–2021. O ano catalogado dessa seção segue o índice; datas e elegibilidade devem ser conferidas no original na edição de conteúdo. Documentos do Nível A eventualmente encontrados em outros índices mantêm sua proveniência própria.

No [POTI](https://poti.impa.br/index.php/site/material), foram percorridas 15 páginas do catálogo e 51 páginas de módulos: **147 links individuais de PDF**, dos quais **144 responderam com PDF válido**, além do pacote histórico. Os três links ausentes pertencem aos módulos 48 (congruência de triângulos), 49 (Pitágoras) e 50 (semelhança). O ZIP inclui materiais afins, mas sem correspondência comprovada não foi declarado substituto exato desses três arquivos.

## Falhas de URL e tratamento

| Documento / URL | Resultado | Tratamento |
| --- | --- | --- |
| [1a Fase Nivel 3 Solucao - espelho oficial OBMEP 2010](https://obmep2010.obmep.org.br/provas_static/export/sites/default/provas/provas2005/2005/1a_fase/Solucoes/NIVEL-3.pdf) | Conexão indisponível | Conteúdo recuperado no espelho público oficial via HTTP; HTTPS do servidor antigo indisponível |
| [2005 - 1ª FASE SOLUÇÕES NÍVEL 3](https://drive.google.com/file/d/1A-LiwCSZ2tMag2kh-l0I9twYqewxEEnU/view) | 404 | Conteúdo recuperado no espelho público oficial via HTTP; HTTPS do servidor antigo indisponível |
| [20ª OBMEP - 1ª FASE NÍVEL 2 SOLUÇÃO](https://drive.google.com/file/d/1cA47Y3KQBNlR_Vt161O-tcCvpV9qHHUi/view) | 404 | O índice principal oferece links válidos de soluções N2; o endereço histórico é mantido como falha |
| [20ª OBMEP - 1ª FASE NÍVEL 2 SOLUÇÃO](https://drive.google.com/file/d/1ase57hJmiym1FBdMqThk4tr8Phh70dhS/view) | 404 | O índice principal oferece links válidos de soluções N2; o endereço histórico é mantido como falha |
| [20ª OBMEP - 1ª FASE NÍVEL 2 SOLUÇÃO](https://drive.google.com/file/d/1I1_aq4XG5wWba-DIyyisx0Eu8js3nhN6/view) | 404 | O índice principal oferece links válidos de soluções N2; o endereço histórico é mantido como falha |
| [20ª OBMEP - 1ª FASE NÍVEL 2 SOLUÇÃO](https://drive.google.com/file/d/1UOCnuNFRcQDb8-vzI8wUK_JuH7QItnR_/view) | 404 | O índice principal oferece links válidos de soluções N2; o endereço histórico é mantido como falha |
| [20ª OBMEP - 1ª FASE NÍVEL 2 SOLUÇÃO](https://drive.google.com/file/d/1kowgFJdwm3UGQq717gFQ88sukApJIQY-/view) | 404 | O índice principal oferece links válidos de soluções N2; o endereço histórico é mantido como falha |
| [POTI — módulo 48 — Congruência de Triângulos — 1so9aded2c8xz.pdf](https://poti.impa.br/uploads/material_teorico/1so9aded2c8xz.pdf) | 404 | Pendente: PDF específico não recuperado |
| [POTI — módulo 49 — Teorema de Pitágoras — s01vdbx53hck8.pdf](https://poti.impa.br/uploads/material_teorico/s01vdbx53hck8.pdf) | 404 | Pendente: PDF específico não recuperado |
| [POTI — módulo 50 — Semelhança - Segmentos Proporcionais — bpnb9i6805s8c.pdf](https://poti.impa.br/uploads/material_teorico/bpnb9i6805s8c.pdf) | 404 | Pendente: PDF específico não recuperado |

## O que a consulta permite concluir

Os materiais mostram três exigências que precisam coexistir no produto: decisões financeiras contextualizadas na OLITEF; leitura de representações, exploração espacial e estratégias curtas no Canguru; e justificativa, encadeamento e crédito por raciocínio na segunda fase da OBMEP. Essas observações orientam os formatos da proposta; não são uma análise estatística da frequência de habilidades de todos os itens.

Foi realizada extração automática do texto de todas as páginas dos PDFs válidos, consulta dirigida de cadernos, programas, provas e soluções e inspeção visual de uma amostra declarada. **Não foi feita revisão humana integral de cada questão, de cada figura ou de cada gabarito do acervo.** PDFs digitalizados e gráficos matemáticos precisam de OCR e reconstrução editorial quando usados na análise curricular. O texto extraído sozinho não preserva toda a informação espacial.

Não estão incluídos neste pacote todos os vídeos dos portais, todos os artigos do Clubes de Matemática, produtos pagos ou recursos restritos a escolas. Esses universos são mais amplos que os arquivos históricos de provas, cadernos e materiais didáticos percorridos. Logo, esta entrega não afirma ter baixado todo recurso já produzido pelas instituições.

## Direitos, atualização e reexecução

A [política autoral](POLITICA-AUTORAL.md) determina o uso desse acervo: analisar competências e exigências; criar o catálogo comercial de forma independente. Os arquivos originais permanecem como referências locais, com proveniência e direitos preservados. Download não é autorização de redistribuição comercial.

Para atualizar o acervo, usar os scripts deste diretório, com Python, requests, beautifulsoup4, PyMuPDF e Firecrawl CLI autenticado. A descoberta inicial depende das capturas oficiais locais em `.firecrawl/`; elas são parte da coleta local, não um recurso remoto permanente. Os scripts preservam hashes e resultados, mas não são um serviço de sincronização implantado.

Ordem de manutenção: atualizar os índices, expandir fontes, executar a coleta, seguir soluções interativas, catalogar, gerar este relatório e verificar. Respeitar limites do provedor. A cada edição nova, conferir regulamento, disponibilidade pública, alterações de gabarito e qualidade editorial antes de modificar a matriz curricular.

Consulte o [relatório de verificação](VERIFICACAO.md) para o escopo e os avisos dos arquivos locais.
