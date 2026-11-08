# Memória do chat do EdiAula e reinício pelo Hub de desenvolvimento: full review de 08/11/2026

Pedido do titular: full review do que ainda não estava no `origin/main` e correção dos achados. Ficaram dentro:
- o commit `a0277a95`, em que o chat do EdiAula passa a gravar memórias de preferência (`remember`, `forget` e `list_memories`);
- a mudança ainda sem commit no Hub de desenvolvimento: a ferramenta aberta com código antigo é marcada e o Hub oferece "Reiniciar".

O review foi só de leitura, em nível alto. Cada achado foi conferido no código antes da correção.

## Corrigidos

| # | Achado | Correção | Teste |
| --- | --- | --- | --- |
| 1 | Memórias perto do limite (24 KB inteiras, mais linhas de índice sem limite) somadas ao guia do editor (10,8 mil caracteres) podiam passar dos 32.767 caracteres da linha de comando do Windows. Aí nenhum turno do Claude Code abria, nem para apagar memórias. | O prompt das memórias tem teto de 12 KB no total: memórias inteiras enquanto cabem, depois linhas de índice com a descrição cortada em 160 caracteres, depois só quantas sobraram (`apps/ediaula/src/main/aiMemory.ts`). Se a linha de comando ainda assim passar de 30 mil caracteres, o turno roda sem a memória e registra `memory_too_long` (`commandLineLength` em `packages/edi-desktop/src/ai-engines.ts`). | `apps/ediaula/tests/ai-memory.test.ts` (100 memórias grandes), `packages/edi-desktop/src/ai-engines.test.ts` |
| 2 | O Codex só recebia a memória ao abrir o fio, apesar de o README dizer "antes de cada turno". Uma memória gravada ou apagada não chegava a um fio que já existia. | O motor guarda a memória que cada fio do Codex recebeu. Quando ela muda, a mensagem seguinte leva a versão nova, que substitui a anterior. | `ai-engines.test.ts` ("gives a Codex thread the memory again only when it changed") |
| 3 | A leitura da memória acontecia depois de criar o token da execução, e o Parar apertado durante essa espera não era conferido. | A memória é lida antes do token; entre criar o token e iniciar o processo não há mais nenhuma espera. | coberto pelos testes do motor |
| 4 | Um `name` editado à mão fora do kebab-case ("Exportar MP4") aparecia no prompt como nome da memória. As ferramentas recusavam esse nome, e a memória não podia mais ser atualizada nem apagada pelo chat. | `parseMemory` usa o nome do arquivo quando o `name` escrito não serve. | `ai-memory.test.ts` |
| 5 | Os arquivos de memória eram lidos um de cada vez, em todo turno. | Leitura em paralelo. | `ai-memory.test.ts` |
| 6 | A varredura depois do build contava o que o próprio build escreve: o `resources/native/*.exe` do helper nativo do EdiAula e do EdiCaptura. A ferramenta abria já marcada como desatualizada. | A varredura usa `git ls-files` (arquivos rastreados e novos não ignorados), e cada aviso do observador passa por `git check-ignore`. O que o git ignora, como as saídas do build, não conta (`scripts/edi/work-freshness.mts`). | `scripts/edi/work-freshness.test.mts` (repositório git de verdade) |
| 7 | A pasta `scripts` era ignorada, mas o build do EdiAula e do EdiCaptura roda `scripts/build-native-helper.mjs`. | `scripts` volta a contar. | `work-freshness.test.mts` |
| 8 | Um erro de disco na varredura (um arquivo apagado entre listar e ler) impedia a ferramenta de abrir. | As leituras de arquivo toleram arquivo sumido. A observação fica num `try` e só registra a falha; a gravação da marca também. | `work-freshness.test.mts` |
| 9 | A observação e o pedido de fechar também valiam no `edi:open`. O Hub ofereceria "Reiniciar" para uma sessão de teste e a reabriria no `edi:work`, com o perfil e os Documentos reais. | Só no modo de trabalho; as marcas antigas são apagadas nos dois modos. | conferido abrindo o EdiPDF no `edi:open` e editando o código: nada foi marcado |
| 10 | O Hub nunca mostrava "Não fechou": a ferramenta continuava aberta, e "Aberta"/"Código mudou" tomava o lugar no segundo seguinte. | "Não fechou" fica enquanto ela estiver aberta, com o botão Reiniciar para tentar de novo (`scripts/edi/hub-dev/hub-dev.ps1`). | conferido pela leitura |

Corrigido também durante a implementação: abrir pelo atalho uma ferramenta que já estava aberta terminava com erro, porque o registro estava em uso. O resultado era "não abriu", e não "já está aberto". Agora o registro só é zerado depois de decidir abrir (`scripts/edi/hub-dev/abrir.ps1`).

## Verificações

| Verificação | Resultado |
| --- | --- |
| `pnpm --filter @informach/edi-desktop test` | 154 aprovados |
| `pnpm edi:test:tooling` | 76 aprovados |
| `pnpm --filter @informach/ediaula test` | 1.107 aprovados, 0 falhas, 15 pulados (os testes físicos opt-in) |
| Typecheck de `edi-desktop`, `ediaula` e `scripts/edi` | passou |
| Biome nos arquivos alterados | sem erros |
| EdiPDF no `edi:work` com perfil descartável (`EDI_WORK_DATA`) | abriu sem marca, foi marcado depois de uma edição, "Reiniciar" fechou, recompilou e reabriu com a marca limpa |
| EdiPDF no `edi:open` | nada marcado depois de uma edição |
| EdiFoto no `edi:work` com uma imagem não salva | pediu para salvar, não fechou, e o reinício terminou com o código 3 |

## Limites

- O teto de 30 mil caracteres é uma estimativa conservadora das aspas e escapes do Windows. A memória pode ficar de fora antes do necessário, nunca depois.
- Uma ferramenta aberta por um `edi:work` anterior a esta mudança não é marcada. É preciso fechá-la uma vez pela janela ou pela bandeja.
- A memória continua indo pela linha de comando. `--append-system-prompt-file` não foi usado porque versões antigas do Claude Code podem não conhecê-lo.
