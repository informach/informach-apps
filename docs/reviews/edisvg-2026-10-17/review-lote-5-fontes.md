# Review incremental 5.2 — incorporação de fontes

18/10/2026. Continuidade do [catálogo 5.1](review-lote-5-recursos.md). Não encerra o lote 5, a tipografia avançada M04 ou o full review solicitado.

## Perfil implementado

Catálogo v15 aceita fontes TTF/OTF descomprimidas, de face única. O parser verifica diretório ordenado/único, limites/sobreposição/alinhamento, checksums de tabelas e global, head/maxp/OS2/hhea/hmtx, limites de loca/glyf, metadados Unicode e permissões declaradas de incorporação. Glifos SVG são recusados neste perfil. WOFF2, WOFF e coleções são recusados com orientação de conversão, não descomprimidos sem um orçamento seguro. Não é uma implementação de todas as regras OpenType: o sanitizador/decodificador real da plataforma também precisa aceitar a fonte.

Os flags devem permitir edição/incorporação; fontes restritas, apenas preview/print, bitmap ou com flags incompatíveis são recusadas. No-subsetting é preservado: a fonte é incorporada integralmente. Confirmação de direitos fica pendente na interface, sem `rightsConfirmed` no draft; somente uma confirmação explícita permite criar o recurso validado, decodificar e publicar a transação. Isso não substitui a licença nem constitui verificação jurídica automática. Avisos originais são comparados com os bytes e preservados; aviso adicional é texto XML válido, nunca CSS ou código.

Texto referencia `fontAssetId`; a família CSS é gerada a partir do hash, não do nome fornecido pelo arquivo/usuário. O catálogo e o painel de texto aplicam/removem a referência por comandos compartilhados, com locks e validação. Exclusão de fonte em uso é recusada. Duplicações/componentes continuam reutilizando o recurso raiz.

O editor possui um único dono de FontFaces por sessão/conjunto de hashes, fora do SVG substituído a cada render. Navegação/edições não reiniciam a carga; troca/fechamento cancela e libera a propriedade. Enquanto a carga não termina, a arte fica indisponível e exportar/testar não é liberado. Falha é explícita e conserva o documento, permitindo retirar/substituir o recurso. Cancelar uma importação em processamento aborta a publicação e aguarda seu término antes de admitir outra; não acumula tarefas canceladas de decodificação.

SVG/HTML/React incluem estilos gerados e avisos uma vez por fonte usada. O player assíncrono espera a carga efetiva antes de adquirir o DOM; o síncrono exige FontFace já carregada. A referência do conteúdo v3 precisa corresponder ao atributo do texto. Falha de carga não é apresentada como fallback bem-sucedido. A CSP admite apenas fontes locais/data, sem rede externa ou `unsafe-eval`. MCP lista comprimentos dos avisos e oferece leitura JSON por ID/offset, sem enviar metadados extensos implicitamente.

Isso **não verifica ainda a cobertura de todos os glifos** de um texto dinâmico, nem substitui o shaping nativo de cada plataforma. Fallback de glifos, wrapping, texto em caminho, conversão opcional em contornos e controles avançados de fontes seguem em M04/lote 5. A prova Noto do editor/Electron usa texto latino coberto; não certifica todas as escritas ou React Native.

## Review e evidências

- Tipos do editor/núcleo e tooling aprovados; check focado sem erros; build aprovado.
- 137 testes do editor, 61 do núcleo e 29 E2E conjuntos aprovados.
- Fonte Noto real, offline, com bytes originais identificados por SHA-256 e licença SIL OFL integral preservada como fixture de teste. Não usa fonte pessoal/do sistema nem dependência de rede.
- UI real: confirmação obrigatória, aplicação ao texto, undo/redo e reabertura. Loader real verifica carga/registro/liberação e recusa importação sem direitos confirmados.
- HTML interativo novo e ZIP React em consumidor independente carregam a fonte efetiva antes do player pronto. A prova Next existente passou novamente em produção/SSR/hidratação; não foi ampliada para todos os casos de fonte.
- Jornada Electron repetida: integridade física, licença/expiração/IPC, Worker, Yoga/WASM, rig/solo/skin, PNGs deduplicados com prova de pixel, fonte carregada/métrica de texto sob origem file/CSP, arquivos/recuperação e ZIP Save/Cancel aprovados. O probe de recursos é isolado do documento aberto: não equivale à homologação de importação de fonte por diálogo nativo. Nenhum instalador instalado/publicado.
- Auditoria de produção: nenhuma vulnerabilidade conhecida.

A rodada E2E paralela falhou com `esbuild: runtime cannot allocate memory`; a máquina tinha menos de 1,5 GiB físicos livres e processos de outras frentes ativos. Somente o runner de teste identificado e seus descendentes foram encerrados. O script oficial agora limita arquivos E2E a um por vez, sem remover assertions/testes; a rodada completa serial (29 testes) e Next passaram. Não encerrar processos pessoais para liberar memória.

Corrigidos no review: referências tipadas de fontes, gate de carga que poderia ser sobrescrito pela regra anterior de Testar, cancelamento tardio da confirmação, tratamento indevido de uma falha de render como falha de fonte, avisos XML inválidos e metadados extensos no overview. A captura nativa mostrou o alinhamento central da fixture cortando parte do texto; a fixture foi ajustada para alinhamento inicial. A imagem já gerada antecede esse ajuste, sem nova alegação de captura atualizada.

## Continuidade

Próxima frente: áudio funcional, seguido de gráficos/exportações/semântica/scripting e dependências dos lotes anteriores. O restante do lote 5, lote 6 e full review final continuam obrigatórios. Sem commit, merge, push, release, mudança de infraestrutura ou cobrança nesta frente.

Referências primárias consultadas: [formato OpenType/checksums](https://learn.microsoft.com/en-us/typography/opentype/spec/otff), [flags OS/2 fsType](https://learn.microsoft.com/en-us/typography/opentype/spec/os2#fstype). O perfil é deliberadamente conservador diante de permissões conflitantes de fontes antigas.
