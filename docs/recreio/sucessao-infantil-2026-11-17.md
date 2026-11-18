# Recreio: transferência do mundo de um perfil menor

Incremento F5, ainda sem implementação de serviço, tela ou implantação.
Reaproveita a proposta de responsabilidade existente, com prazo de 24 horas e
aceite independente do destinatário adulto. O titular autorizou finalizar a
plataforma sem depender de D3–D8 do Morada.

## Autoridade e persistência

- O adulto nativo atual do menor proponente precisa de login recente e da
  responsabilidade atual pelo perfil que é responsável pelo mundo. Não precisa
  de jogador próprio nem assinatura. Aparelho pareado, parentesco comercial,
  coadministração ou pagamento não concedem esse poder.
- O destinatário precisa ser outro participante adulto atual do mesmo mundo.
  Aceita pelo próprio login recente; a proposta não altera papéis antes disso.
- Uma prova separada conserva proposta, perfil cuidado, vínculo, conta do
  proponente, geração de acesso, política e revisão da gestão. O aceite relê a
  composição atual sob contas ordenadas → mundo → perfis → aparelho → membros.
  A relação entre o perfil da prova e o membro de origem da proposta também
  precisa ser conferida na transação. Conhecer IDs não autoriza a operação.
- Remover o vínculo apaga a prova técnica por CASCADE e invalida uma proposta
  infantil pendente; não apaga a proposta, os membros nem o mundo. Mudança de
  geração, política ou gestão também exige cancelar e propor novamente. Nunca
  recriar a prova automaticamente ao consultar ou recuperar uma resposta.
- O aceite muda os dois papéis e o responsável do mundo, incrementa a revisão,
  revoga convites emitidos pela autoridade anterior e encerra somente as sessões
  afetadas pelo protocolo de revogação existente. Preserva IDs, fotografias,
  diário, autoria e contador de cerca. Não fabrica confirmação de salvamento.
- Revogação e recusa não exigem cobertura comercial. O responsável atual pode
  cancelar a proposta do mundo de seu menor mesmo se a prova anterior perdeu
  validade. Nenhum caminho concede permissão global sobre o cadastro do menor.

## Execução e provas pendentes

1. Gerar no GitHub a tabela aditiva `stewardship_guardian_approvals`, conferir
   fonte, allowlist, bytes, hashes e ordenação das FKs antes de copiar artefatos.
2. Implementar proposta/cancelamento parental e aceite/recusa do destinatário;
   conservar a transferência adulta existente e os leitores antigos.
3. Entregar seleção e confirmação na gestão do mundo do menor, com nomes
   autorizados, consequência explícita e recibos recuperáveis.
4. Provar com PostgreSQL real: adulto sem jogador, outro responsável recusado,
   aparelho pareado recusado, login antigo, revogação de vínculo/geração/política,
   CAS de gestão, concorrência, resposta perdida e rollback da auditoria.
5. Provar a jornada nativa completa no navegador e o upgrade com dados no GitHub;
   conferir capturas, consumidores, restauração e operação antes de implantar.

A definição inicial do schema não concede autoridade e não comprova nenhum
dos serviços ou fluxos acima. Produção permanece no marco F4/0190.

A geração inicial `44217811527`/fonte `2db88122` foi inspecionada antes da
cópia: SQL aditivo, mas duas FKs tinham nomes automáticos acima do limite de
63 bytes do PostgreSQL. O artefato `14387714774` não foi aplicado ou copiado.
A candidata seguinte atribui nomes explícitos curtos às três FKs e solicita
nova geração a partir do mesmo prefixo 0196.
