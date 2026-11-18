# Recreio: transferência do mundo de um perfil menor

Incremento F5, com backend candidato, ainda sem gates, tela ou implantação.
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

Geração corrigida `44218177439`, fonte `0c787f81e951c0741993deb9a6a03663dac608cb`,
artefato `14388634721`, ZIP SHA-256
`caf5016679a059e205fec06ee06c5c9f050f1ee3b8c6a9d86b46171375c3699b`.
Allowlist, prefixo do journal, predecessor do snapshot, bytes e SHA conferidos
antes/depois da cópia intacta:

- `0197_loving_swordsman.sql`: 1334 bytes,
  `bec02fd7fe8bebabda2226fbf5a48f1db2bcdd294be51890a8045e6f1cbef43b`.
- Snapshot: 878327 bytes,
  `3ed9fe442b2a5e11bafd618f315a264cb6006fa657fff8cf487066a39a96c00c`.
- Journal: 29927 bytes,
  `a13ddb1950da1df4a03babe583102eaec853f0598948db56fad78a659ac6d7f8`.

A candidata de backend propõe/cancela pelo adulto atual e encaminha o aceite
próprio do destinatário para a nova prova, mantendo a transferência adulta.
A admissão de participante nativo tem entrada separada da gestão: não exige
ser administrador antes de aceitar, mas não empresta essa autoridade aos
chamadores de gestão. Oito testes candidatos cobrem adulto sem jogador e sem
plano, recuperação, identidade, login, revisão, vínculo/geração/política,
ausência de administração prévia, cancelamento e rollback da auditoria.
As provas ainda precisam executar no GitHub. Journal candidato com 198 entradas;
produção conserva 191/0190. A tela parental e a jornada E2E continuam pendentes.

Backend `e19de9ef804d3c2a4c1d8b12ff0ea1352103aea9` passou na qualidade e na
integração `44219056739`: 782 testes/84 arquivos, incluindo os oito novos, e
cinco testes administrativos. Upgrades 179→198 e 191→198 preservaram os dados
e passaram na repetição. Os demais gates ainda estavam em andamento ao
registrar esse resultado; não é uma aprovação integral do incremento.

A candidata seguinte inclui a tela parental em gestão do mundo, com seleção
de adulto já participante, declaração explícita, envio único até atualização,
cancelamento e recuperação por recibo. A consulta não exige login recente nem
plano e mostra a invalidação da prova sem recriá-la. O destinatário continua
usando o aceite nativo existente, agora com texto independente de um jogo.

Três integrações adicionais candidatas verificam leitura/paginação gratuita,
invalidação sem nova aprovação, rollback da proposta e prazo real até depois
da auditoria; a transferência também conserva o terceiro participante e o
criador original. A jornada nova cadastra e pareia o menor, aprova amizade e
convite pelas interfaces, salva um contador, propõe/aceita a transferência e
reabre o mesmo mundo pelos dois jogadores. Não insere membros, convites ou
aprovações por SQL. Captura mobile está na allowlist do workflow. Os gates
dessa candidata ainda precisam executar; visitas e homologação F5 permanecem
abertas.
