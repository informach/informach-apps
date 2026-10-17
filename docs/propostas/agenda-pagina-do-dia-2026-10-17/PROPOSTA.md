# Proposta: a página do dia, outubro de 2026

Proposta de direção de arte, copy e produto para a Agenda da Turma (página de vendas e app), aprovada pela Helena em 17/10/2026 ("Gostei do plano. Pode implementar tudo"). O canvas com as pranchas e as telas está em https://claude.ai/artifact/GdHq3Jt3y8zKDgBWD9uU6M (privado; compartilhar pelo menu Share do próprio canvas). O que foi construído, por fase, está em [IMPLEMENTACAO.md](./IMPLEMENTACAO.md).

## O diagnóstico

Levantado em 17/10/2026 com o app rodando no ambiente local, uma família fictícia (duas crianças, plano Pro) e uma conta nova vazia, num celular de 390 px, e com a página de vendas publicada.

- **Hoje tinha cinco telas de altura** (4.263 px), com dez blocos empilhados, e a primeira tela não mostrava nenhuma atividade: título, botão de PDF, filtro e o convite do horário do resumo vinham antes.
- **Os quatro números do topo repetiam as três listas logo abaixo.**
- **Cada card pintava duas cores com sentidos diferentes**: o fundo da matéria e o selo do tipo.
- **Abrir uma atividade abria o formulário de edição**, com treze campos. Não havia uma vista para ler.
- **"Foto" caía no meio de um formulário longo**, com criança, origem, observação e ditado antes da foto.
- **A conta nova começava "resolvida"**, com quatro zeros e "Tudo certo por aqui!", e os primeiros passos no fim da página.
- **A criança tinha cinco nomes** (criança, estudante, perfil, "Todos os perfis", "quem você acompanha") e a franquia tinha seis (recado, importação, leitura, crédito, providência, pendência).
- **A página de vendas** era correta e fria, prometia o cartaz de cinco matérias e mostrava um passeio, pulava a revisão na demonstração e escondia no FAQ a vez da criança, a turma que recebe junto e o WhatsApp.

Defeitos achados no caminho: o Pro anual escolhido na landing se perdia no cadastro; a barra de progresso aparecia cheia com 0% (trilho `bg-secondary` roxo); o peso 800 da fonte não era carregado; o e-mail diário dizia "para amanhã" trazendo atrasadas e datas `AAAA-MM-DD`; o push era sempre o mesmo texto; travessões em texto visível.

## A direção: a página do dia

O app passa a ser organizado como a agenda de papel que vai na mochila, uma página por dia.

1. **A primeira tela responde "o que é para hoje?".** Configuração, convites e números vêm depois, ou em uma linha.
2. **Um botão por destino.** O + do rodapé é a porta de entrada.
3. **Detalhe é para ler.** Editar é um toque a mais.
4. **Data é dia da semana**: "qui, 22", nunca "22/10".
5. **Uma coisa elevada por tela** (a regra da sombra sólida continua).
6. **Nenhuma comparação entre crianças**, nem por porcentagem.

Cor: nenhum token novo de paleta. O fundo continua `app-ground`; as folhas passam a usar `background` com fio de 15% do `foreground`. A cor da matéria vira um ponto ao lado do nome; o tipo é ícone e palavra; a urgência é palavra e peso ("Passou · sex, 16" tingido de vermelho, "Hoje" preenchido, "Amanhã" contornado). A tinta `destructive-ink` entra no bloco TINTAS no mesmo padrão das outras.

Voz: frases inteiras, segunda pessoa, sem travessão. Glossário: criança (não perfil nem estudante), recado lido ou leitura (não importação nem crédito, na interface), atividade em aberto (não pendência própria nem providência), Hoje (não Rotina da família nem dashboard), Feito (não Feito em casa), "a escola disse" e "na próxima aula" para a origem da data.

## As decisões da Helena

Aprovadas com a proposta, na recomendação de cada uma:

1. "Crédito" vira "recado lido" ou "leitura" na interface da Agenda. Por baixo continua crédito; os e-mails de cobrança do pacote compartilhado não mudam.
2. A escolha de plano sai do cadastro: grátis por padrão, o Pro aparece quando faz falta. Quem escolhe o Pro na landing vai direto ao pagamento depois de confirmar o e-mail.
3. A aba Calendário vira Semana.
4. Seção "Quem faz" na landing, com o contato do Instagram. O texto e a foto dependem dos dois fundadores; a seção não publica texto inventado.
5. Push com conteúdo. **Implementado com contagens e dias, sem nome de criança nem de atividade**, porque a política de privacidade publicada promete texto genérico na tela bloqueada. Mostrar nomes exige mudar a política e criar uma opção por pessoa (coluna nova), e fica registrado como pendência.
6. Mostrar as telas a famílias da escola antes da fase 3: é ação da Helena, não do código.

Decisão posterior, em 17/10/2026: **a vez da criança mostra o que vence até a próxima aula**, não só o de hoje. Quem estuda de manhã faz em casa o que é para amanhã. A lista junta "Para hoje" e o que vence até o próximo dia de aula (numa sexta, até segunda), sai da mesma `getRoutineSnapshot` que o adulto vê, diz "É para hoje", "É para amanhã" ou "É para segunda", e oferece "Quer adiantar?" com o resto da semana.

## O que não muda

A IA nunca inventa prazo, não estima tempo e não cria sessão de estudo. Revisão antes de salvar. Um card, um detalhe, um formulário e a folha Adicionar com os quatro caminhos. Turma do titular e código como credencial. Sem recado por e-mail. Sem competição entre crianças; a sequência é da casa. Sem estrela, "mais popular", contador ou depoimento inventado. Contato só pelo Instagram.

## Fases

1. Consertar e falar a mesma língua.
2. Hoje em uma tela e meia.
3. Trazer um recado em três toques.
4. Página de vendas e primeiro acesso.
5. Semana, família e criança.

Métricas: primeiro recado salvo por variante da landing; dias com Hoje aberto (evento novo `today_viewed`, um por adulto por dia); tempo para trazer um recado (`notice_attempt` até `notice_confirmed`); atividades mandadas para a turma e aceitas.
