# Missão Saber: competição em família e desafios de peças

Pedido da titular em 31/10/2026. Canvas de proposta aprovado no mesmo dia: [Missão Saber, modo competição](https://claude.ai/artifact/CyMNwJ9gLE2harT6YSF4eT) (seis telas, privado).

## O que é

**Competição em família.** O responsável coordena, no aparelho dele (tablet ou TV), uma competição entre perfis da família. Ele escolhe quem joga, a área (Matemática, com perguntas no estilo Canguru e OBMEP; Financeira, no estilo OLITEF), quantos problemas e quantos desafios de peças cada criança faz e o tempo de cada tipo. O sistema sorteia na hora de criar. A sala mostra de quem é a vez; ao tocar em Começar, o cronômetro corre. Resposta antes do tempo é corrigida na hora, com a resposta e a explicação; quando o tempo acaba, a vez conta como erro e mostra a resposta. Acerto tem som e confete. Os pontos somam e a competição termina num pódio. Cada família pode ter várias competições.

**Desafios de peças.** Quebra-cabeças clássicos, que também existem em madeira, montados em 3D (three.js). Eles moram no **laboratório**, onde a criança treina e experimenta à vontade, e a competição sorteia entre eles, como sorteia as perguntas da trilha. Não há catálogo de desafios para o responsável: quem joga recebe o desafio por sorteio. O levantamento está em [desafios.md](desafios.md).

## Decisões da titular (31/10/2026)

| Decisão | Motivo e escopo |
|---|---|
| **Pódio privado** | Exceção registrada à regra "Cooperação, não ranking" ([proposta de experiência](../missao-saber-experiencia-2026-09-15/PROPOSTA-EXPERIENCIA.md), itens 7 e "O que não trazer"). O pódio aparece só na sala e na lista de competições da conta do responsável. Nada aparece no espaço de estudo da criança, nada é público. A promessa ao comprador continua verdadeira ("sem comparação **pública** entre crianças"); a página de privacidade passou a dizer "ranking público". O Desafio da família continua cooperativo e sem ordem. |
| **Um desafio por criança** | Cada criança recebe um desafio diferente, da faixa da idade dela. Ninguém vê a solução do outro antes. |
| **Pontos** | Problema certo vale 1. Desafio montado no tempo vale 3. Erro, tempo esgotado e desafio encerrado valem 0. Empate divide a posição (8, 8, 5 viram 1º, 1º e 3º). |
| **Dependências** | `three` 0.186.1, `@react-three/fiber` 9.8.2 e `@react-three/drei` 10.7.9 aprovados para o `apps/missao-saber`. A cena é carregada só nas telas de desafio. |
| **Ângulo livre já na primeira leva** | Além dos desafios em malha, entram Tangram, o T de quatro peças, a cruz grega, os 4 Ts na caixa e a pirâmide de duas peças. |
| **4 Ts na caixa** | A titular não tem as medidas do brinquedo (Jogo dos 4 Ts em MDF, base de 10 × 10 cm, uma só solução). A geometria é nossa e coerente com a foto: ver [desafios.md](desafios.md#4-ts-na-caixa). |

## Regras

- **Quem pode jogar.** Cada perfil joga no próprio ano escolar efetivo. Matemática usa as trilhas Canguru e OBMEP (com a Mirim) do ano; Financeira usa a OLITEF, que começa no 6º ano. Perfil sem trilha na área aparece desabilitado com o motivo.
- **Sorteio de problemas.** Só itens de escolha ou número, sem montagem prévia e sem itens de descoberta. Vêm das missões e dos bancos de diagnóstico e simulado das trilhas do ano. Sem assinatura, só de unidades gratuitas. Conteúdo pausado para correção fica fora. O sorteio varia habilidade e família de atividade antes de repetir e prefere o que a criança ainda não viu em competições anteriores. A semente fica gravada.
- **Sorteio de desafios.** Da faixa da criança (2º e 3º ano, 4º e 5º, 6º e 7º, 8º em diante); se faltar, das faixas anteriores, nunca das seguintes. Sem assinatura, só os desafios abertos.
- **Ordem das vezes.** Problemas primeiro, intercalando as crianças na ordem em que foram escolhidas; os desafios ficam para o fim.
- **Tempo.** Problema: 20 s a 5 min. Desafio: 1 a 15 min. O prazo é gravado pelo servidor ao começar a vez. Resposta que chega até 1,5 s depois do prazo ainda vale; depois disso, vira tempo esgotado. O aparelho conta a partir do prazo do servidor, corrigido pela diferença de relógio; recarregar a página não devolve tempo.
- **Correção.** Só no servidor. O enunciado só sai quando a vez começa, e a resposta só quando ela termina. A montagem de um desafio é conferida no servidor pelo mesmo verificador do aparelho.
- **Quem conduz.** Criar e apagar exigem a confirmação recente do responsável (dez minutos). Conduzir a sala usa só a sessão verificada, porque uma competição dura mais do que isso.
- **Fora do motor de evidência.** Respostas sob tempo não entram no domínio de habilidades, nas revisões nem no relato semanal.
- **Som.** Fanfarra curta sintetizada, sem arquivo. O áudio só começa depois do toque em Começar, e o botão de som fica lembrado no aparelho. O confete some com movimento reduzido.

## Implementação

| Parte | Onde |
|---|---|
| Tabelas `competitions`, `competitors`, `competition_turns`, `puzzle_solves` (migração aditiva `0075_missao_competicao`) | `packages/db/src/schema/missao-saber.ts` |
| Regras puras (elegibilidade, sorteio, ordem, pontos, pódio, prazo) | `apps/missao-saber/src/features/competition/regras.ts` e `constantes.ts` |
| Banco, serviço e ações | `features/competition/repository.ts`, `service.ts`, `actions.ts` |
| Telas do responsável | `app/(parent)/familia/competicoes/` (lista, `nova`, sala em `[id]`) e `features/competition/components/` |
| Modelo dos desafios (tipos, geometria, verificação, montagem inicial, mesa, plano de teclas) | `features/pecas/` |
| Catálogo dos desafios e soluções geradas por resolvedor | `features/pecas/catalogo/` |
| Cena 3D, mesa com controles e treino | `features/pecas/components/` |
| Laboratório | `app/(app)/laboratorio/pecas/` (lista e treino) e cartão em `/laboratorio` |
| Cronômetro e som | `components/ui/cronometro.tsx`, `components/ui/som.ts` |

A exportação de dados da família passou a incluir competições, competidores e vezes (sem a cópia do item com gabarito) e as montagens do laboratório. Apagar a família apaga tudo por cascata. Um perfil apagado sai das competições como "competidor sem perfil": apelido, avatar e nível ficam copiados para o pódio antigo continuar legível.

### Como a mesa funciona

O estado da mesa é uma função pura (`mesa-estado.ts`); a cena, os botões e o teclado só disparam ações. Peças em malha giram em torno de uma casa fixa, então quatro giros voltam exatamente ao começo. No espaço, nenhuma peça atravessa a mesa. Peças planas de ângulo livre se comportam como madeira: o arrasto para no contato (percorrido em passos curtos, para não atravessar peça fina), e ao soltar há um ímã de vértice e, na caixa, um empurrão de volta para dentro. Teclado, com o foco no nome de uma peça: setas movem, R e E giram, F vira, X e Y tombam, Page Up e Page Down sobem e descem.

## Verificação (31/10/2026)

- **Unitários do app:** 1.548 testes em 42 arquivos, 87 deles novos (peças, mesa e regras). Cada desafio fecha com a própria solução de referência, recusa as variações quase certas e começa desmontado. Para cada desafio em malha, um plano de teclas leva da arrumação inicial à solução usando só os controles.
- **Integração em PostgreSQL descartável:** 116 testes em 26 arquivos, com a migração `0075` aplicada do zero. Os 12 de `test/competition.integration.ts` cobrem a corrida entre resposta e fim do tempo, resposta depois do prazo, isolamento entre famílias, idempotência da criação, preferência por itens inéditos, exportação e registro do laboratório.
- **E2E sobre o build de produção (`e2e/competicao.spec.ts`):** competição completa no desktop (acerto, tempo esgotado, desafio montado pelo teclado, desafio encerrado, pódio) e treino no laboratório no desktop e no celular, os três passando.
  - O E2E achou dois defeitos reais, corrigidos na raiz. Primeiro, o embaralhamento da arrumação inicial usava comparador aleatório no `sort`, cujo resultado depende do motor JavaScript; virou Fisher-Yates com o gerador semeado. Segundo, a lista do laboratório chamava uma função de módulo de cliente no servidor.
- **Conferência visual:** capturas de todas as telas no desktop e no celular, claro e escuro. Elas levaram a três ajustes: o enquadramento próprio das mesas planas (o enquadramento automático girava a imagem), o cabeçalho do desafio no celular e a legenda da tabela do pódio.
- **Workspace:** tipagem das 26 tarefas, Biome sem erros nos arquivos do repositório e build de produção do Missão Saber.

## Pendências e próximos passos

- **Teste da titular com as crianças**, em tablet e TV: legibilidade a distância, ritmo das vezes e se o pódio funciona bem na família. É a validação que nenhum teste automático substitui.
- **4 Ts na caixa**: se a titular medir o brinquedo físico, trocar as medidas e conferir de novo, com o mesmo teste, que a solução reta não cabe.
- **Faltaram do levantamento**: cubo diabólico, Stomachion e pirâmide de quatro peças (motivos em [desafios.md](desafios.md#fora-desta-leva)).
