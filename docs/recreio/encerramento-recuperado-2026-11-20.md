# Encerramento de conta na recuperação privada

Continuação de F7/F8. A retirada de perfil já tem admissão e reaplicação nativas
qualificadas. Encerrar conta também exige conciliar o financeiro e a participação;
não ampliar o executor de retirada para ignorar essas duas barreiras.

## Sequência de implementação

1. Reutilizar a admissão fixa de `admissao-recuperada-repository.ts` para
   reconhecer encerramento nativo que já estava admitido no arquivo. Conservar
   preparo, bytes/MAC, consentimento, primeira admissão e conclusão; a avaliação
   pertence à nova execução. Encerramento ausente/publishing ainda não é
   suportado por esse primeiro incremento e deve continuar recusado. Não
   fabricar cliente, participação, identidade ou aceite.
2. Acrescentar avaliação financeira por execução/operação, gerada pelo workflow
   de migrations. A confirmação original continua imutável. Uma prova nova lê
   o escopo assinado e o inventário completo atual do provedor; modo, pagante,
   cliente e contratos devem coincidir. Divergência fica em revisão. Não usar
   pagamento confirmado antigo como prova da situação atual, nem chamar I/O
   financeiro dentro das travas de dados. Ausência local não vira ausência no
   Stripe quando houve cliente/tentativa.
3. Fazer a composição financeira usar exclusivamente o banco da coordenação.
   O worker normal conserva o caminho ocioso sem S3/Stripe. O executor privado
   tem entrada separada, capacidade emitida no escopo da operação e nenhuma
   conexão implícita ao banco global. Só emitir capacidade de efeitos depois
   da avaliação financeira atual e da participação conferidas. O recuperador
   técnico do arquivo continua sem credenciais de origem, login ou Stripe.
4. Ampliar o executor/recibo terminal para encerramentos autenticados e provar:
   operação nativa anterior e posterior ao arquivo; publicação interrompida;
   operação já concluída; rollback da auditoria; repetição sem renovar prazos;
   financeiro divergente/indisponível; terceiro/global preservados. Usar banco
   descartável e cluster frio no GitHub, incluindo SDK/API Sandbox quando
   houver I/O do provedor. Somente fixture sintética cria consentimento.
5. Compor a publicação seletiva do Recreio com identidade/permissões atuais,
   credenciais/sessões renovadas e encerramento dos hosts antigos. Nunca
   restaurar tabelas globais/billing antigas sobre outros aplicativos, nem
   executar FLUSHALL. Reaprovação humana necessária não pode ser inventada
   pelo operador ou substituída pela conta pagante. Provar duas recuperações
   completas consecutivas, com captura/livro atualizados, antes do aceite.

## Verificação e fronteira

Somente GitHub Actions executa tipos, testes, builds, jornadas e clusters.
Cada candidato fica separado da implantação. As duas restaurações técnicas
reais do arquivo 1613df70 não são as duas recuperações completas deste plano.
Nenhum passo acima autoriza antecipar vendas, abrir tráfego recuperado ou
reativar credenciais antigas. A fonte corrente mantém esses caminhos fechados.
