# Recreio — trocas de plano com consentimento e recuperação

Incremento restante de F6, autorizado pelo fechamento da plataforma. Fonte de
produto relida: `artes-3d/paginas/recreio.html`, seção Planos e acesso. Este plano
não implementa nem habilita trocas por si só.

## Comportamento obrigatório

- Aumento: imediato, com proporcional calculado pelo Stripe e apresentado antes
  do aceite. A capacidade maior depende da liquidação confirmada da fatura.
- Redução: no fim do período já pago. O pagante escolhe quais perfis continuam;
  perfis, identidades e progresso dos demais são preservados.
- Cancelamento: no fim do período; recuperação usa os mesmos perfis/mundos.
- Conta pagante, gestão familiar, responsabilidade infantil e gestão de mundo
  permanecem autoridades distintas. Toda decisão financeira exige adulto nativo
  atual e login recente, sem exigir perfil jogador.

## Contratos a implementar

1. Recibo nativo de troca ligado ao pagante, grupo, modo, assinatura e aceite
   original. Oferta, prazo, data do proporcional e seleção são imutáveis após
   admissão. Tentativa anterior ao I/O; resposta desconhecida mantém revisão.
2. Adaptar o provedor compartilhado sem reutilizar o downgrade legado que cancela
   e recria assinatura. A agenda deve alterar o mesmo contrato; namespace nativo
   conserva idempotência e metadados distintos dos contratos Compasso.
3. Manter a origem do Checkout original mesmo quando muda o produto atual.
   A conciliação exige o novo consentimento para admitir o novo preço; não edita
   o aceite inicial nem aceita apenas o preço observado como autorização.
4. Proporcional usa `pending_if_incomplete`: não conceder plano maior diante de
   pagamento pendente, ação adicional ou resposta perdida. Consulta posterior
   comprova a operação exata; limite de idempotência não autoriza novo débito.
5. Redução conserva cobertura atual até a vigência confirmada. Aplicar somente
   escolhas ainda válidas de perfis do próprio grupo, com revisões conferidas;
   uma revogação posterior nunca é restaurada pela agenda antiga. Se a seleção
   mudou, exigir resolução explícita sem apagar dados ou conceder vaga a outro.
6. Captura técnica de operação admitida persiste após logout; nenhum URL, fatura
   ou resultado financeiro é entregue sem nova autorização após a rede.
7. Auditoria, revisão comercial, cobertura e revogação de ingressos/SIDs são
   transacionais; rede permanece fora das travas PostgreSQL.

## Verificação e implantação

Gerar eventual DDL no GitHub e adotar SQL/snapshot/journal intactos com hashes e
predecessor. Provar upgrade/replay e integridade de pagante/modo/origem. Gates
com SDK/HTTP fechado e PostgreSQL cobrem concorrência, aceite divergente,
resposta perdida, ação de pagamento, agenda, redução e revisões/revogação.
Homologação externa no Stripe de teste cobre fatura proporcional, inadimplência,
renovação e execução da agenda, sem clientes ou chaves live. Fluxo familiar e
capturas de navegador integram o aceite; testes pesados somente no GitHub.

O catálogo de teste já possui evidência própria; isso não comprova trocas ou
pagamentos. Nenhuma DDL F6 ou alteração comercial foi implantada em produção.
