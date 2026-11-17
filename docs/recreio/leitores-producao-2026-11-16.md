# Integridade e leitores da responsabilidade em produção

Portal, Morada e migrator implantaram `f0f1c96c`, depois dos seis gates da
candidata e do CI geral dos consumidores compartilhados. Fontes foram
conferidas nos processos ativos. O banco tem 167 recibos, quatro FKs compostas
validadas e aceita o novo motivo `permissions_changed`. O pedido de
responsabilidade continua sem escritor: zero pedidos, zero emissões do novo
motivo e rota de transferência ausente do artefato do portal.

A reconciliação de capacidades do Morada usa a participação atual na admissão
e conserva a concessão própria da fundação. Não houve troca de papéis das
contas reais. Mundo V2/protocolo 1 e arte D2/manifesto 3 permanecem ativos;
SHA do manifesto `4198478735b643e07d4ce0821db82654c42847bbf996d1d07a99a5890b21672f`.

Prontidão de portal/Morada 200, oito apps do catálogo 200 com o schema novo,
mapas/release Sentry e cron das 16:10 UTC com cinco contagens foram conferidos.
A consulta pontual `is:unresolved lastSeen:-2h` não encontrou issues nos dois
projetos. Isso não certifica estabilidade geral ou o restante da operação.
Configurações dos três serviços ficaram idênticas e sem alterações pendentes.

**Achado adicional em correção:** o PID 1 real do Morada é pnpm, com outro pnpm
e dois shells antes do Node. A retirada anterior registrou erro do comando e
não confirmou o encerramento da instância. Não havia partida aberta no
preflight; esse dado não prova perda nem encerramento ordenado. A candidata
de processo prepara Node direto e prova em contêiner no GitHub antes da
mudança intencional de configuração. Não considerar a implantação desta
etapa como homologação do recebimento de SIGTERM pelo processo do jogo.

Os gates da main ainda estavam em execução no registro. Não publicar outro
incremento que cancele esse CI sem uma necessidade concreta. Antes de ativar
o escritor da transferência, conferir sua homologação e os leitores ativos.
Depois da primeira emissão, o rollback mínimo preserva os leitores deste
marco; não reclassificar o histórico para caber numa versão antiga.

[Dados e horários](evidencias/responsabilidade-leitores-producao-2026-11-16.json).
A6, proteção familiar, retenção integral e venda continuam pendentes.
