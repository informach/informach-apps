# Remoção de membro e integridade dos convites implantadas

Portal em `1ed101be`, alfa fechado, Mundo V2/protocolo 1/arte D2. Na Conta,
o responsável atual acessa as participações e gerencia os membros do próprio
mundo. A lista é paginada. Remover exige confirmação e login nativo recente;
encerra o vínculo e as partidas desse perfil somente no mundo escolhido,
cancela propostas e convites que ele tenha emitido e grava auditoria atômica.
Não apaga moradores, progresso, autoria ou assinatura. O antigo vínculo conserva
seu ID quando houver reingresso autorizado.

Convite anterior à saída/remoção não readmite. O aceite confere a autoridade
atual do emissor, e a transferência aceita revoga seus convites ainda não usados.
A volta posterior do papel não reativa os códigos antigos. Emissões novas são
comparadas com a saída no PostgreSQL, preservando sua precisão. Convites aceitos
e convites de outro mundo ficam preservados. Vínculo legado sem data não recebe
uma data inventada para permitir acesso.

Seis gates `43923719509` aprovados: 325 integrações, incluindo 34 casos de
remoção/convites. A fonte publicada passou os seis gates `43928476051`, assim
como sua repetição na main `43931150556`. O CI geral da base `43918017303` passou;
o da nova main `43931150504` ainda estava em execução ao registrar esta prova.
O CI geral da candidata `737b6638`, run `43923717777`, falhou na transferência
após novo login: a seleção do destinatário foi perdida durante o carregamento.
A remoção passou nesse mesmo navegador. A falha da transferência continua aberta
até a regressão com scripts suspensos e a correção da interface serem aprovadas;
não considerar o CI geral dessa candidata aprovado pelos seis gates específicos.
Os três defeitos de convites foram reproduzidos antes da correção. A transação
foi exercitada com falha real de auditoria e disputas com aceite/saída e prazo.

Portal `85952e0f`, Bastidores `0c3a8f70`, ambos em sucesso, configurações iguais
às anteriores e sem staged changes. Fonte, rotas de membros/responsabilidade,
prontidão 200 e schema 167 conferidos às 18:47:41 UTC. Não houve migration nova
ou reparo de dados. Preflight: dois membros, zero encerramentos sem data,
convites pendentes/autores incompatíveis e partidas abertas. Morada permaneceu
no build compatível `92f665e7`/`1c69178d`; não precisou reiniciar.

Mapas/release do Sentry conferidos. Cron posterior de 18:45:31 UTC aprovado,
com as cinco contagens. Oito apps, Admin e Morada responderam 200 às 18:53 UTC.
Consulta pontual do Sentry sem issues pendentes com atividade na última hora;
não é prova de estabilidade prolongada ou de carga.

A captura final, fonte `d4c3b503`, muda somente o teste de captura em relação
à aplicação publicada. Os seis gates passaram e a página inteira foi revista
em largura de 390 px: consequências, cancelar e confirmar legíveis, sem rolagem
horizontal. O teste usa Tab/Enter e confere foco/viewport. Imagem 390×971, viewport
390×844: há rolagem vertical; não é uma alegação de tudo caber sem rolar.

O titular adiou a prova humana da transferência; não repetir esse pedido.
Nenhuma conta piloto foi manipulada para produzir uma confirmação artificial.
A6 continua aberto para arquivamento, exportação/exclusão e atendimento. Família,
retenção integral, backup agendado, custo/capacidade, D3–D8, hardware/diversão e
homologação comercial continuam pendentes. A fonte antiga não é rollback seguro:
preservar os leitores de convites corrigidos e os históricos já revogados.

[Evidência operacional](evidencias/remocao-producao-2026-11-16.json).
[Plano, revisão e provas da candidata](remocao-membros-2026-11-16.md).
