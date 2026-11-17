# Checkpoint, avisos e troca de aparelho

Continuação de F3. Este é o desenho da próxima implementação, não uma entrega
homologada. O núcleo de política/tempo e autoridade atual precede esta etapa.
Mantém World2/protocolo1 do Morada; não depende da evolução D3–D8.

## Contrato

- Uma troca tem intenção persistente vinculada ao perfil, SID anterior,
  aparelho destinatário, nonce do ingresso e revisão de política. Uso único,
  prazo curto e retenção técnica delimitada. Outro pedido não captura uma
  confirmação anterior. O ingresso só é consumido quando a nova sessão abre.
- Antes de transferir, o host do jogo anterior suspende comandos, espera as
  escritas em andamento e confirma o checkpoint. A plataforma conserva uma
  barreira no SID antigo: apagar a intenção ou voltar ao mesmo perfil não
  permite que esse token volte a escrever. Falha/silêncio não vira confirmação.
- Dados sem mundo confirmam a fila de gravações pela autoridade do SID. A
  barreira espera as operações admitidas e recusa as seguintes. Conflito ou
  escrita sem confirmação impede anunciar progresso sincronizado.
- Mundo exige confirmação do servidor do jogo, autenticada pela API das
  instâncias e vinculada à posse/cerca e sessão. A fotografia cobre o diário
  confirmado. O ACK do navegador sozinho não comprova persistência do mundo.
  Um título sem esse contrato pede saída no aparelho antigo; não ganha um ACK
  fabricado pelo portal.
- O cliente interno sem mundos e o servidor genérico de teste devem provar o
  contrato antes da integração do adaptador do Morada. Seu protocolo de saída
  já devolve se houve salvamento; o consumidor precisa respeitar o resultado.

## Ordem e falhas

Identidade → mundo quando houver → perfil → mutex de sessão/aparelho → aparelho
→ cursor quando encerrar → sessão → intenção. A confirmação conserva a mesma
ordem, sem elevar SHARE de sessão para UPDATE. A barreira irreversível do SID
evita que a retenção da intenção reative tokens. Leitores chegam antes dos
escritores e a ativação só ocorre com os dois implantados.

Pedidos duplicados recuperam a mesma intenção/resultado. Se o nonce, aparelho,
acesso ou política mudarem, a nova abertura é recusada. Se o destinatário some
depois de confirmar o checkpoint, o aparelho anterior permanece parado, podendo
fechar a sessão e abrir outra com autoridade atual; não se remove a barreira.
Durante partição de rede, o prazo de reconexão e o limite de concessão continuam
explícitos. Um checkpoint atrasado não concede mais tempo de jogo.

## Tempo e experiência

O estado de controle usa relógio do banco, calendário de Brasília, agregado
por perfil/dia e orçamento já concedido. Consulta não renova, zera ou consome
outra vez o intervalo. O jogo recebe apenas saldo/prazo/motivo; nunca nascimento,
conta, e-mail, agenda completa ou informação comercial do responsável.

O aviso antecede o corte e solicita pausa/checkpoint com prazo delimitado. O
corte retira gameplay; a capacidade de sincronizar o estado já admitido deve
ser restrita, com revisão e prazo próprios, sem reabrir jogo ou driblar uma
revogação. Sem confirmação, a tela informa progresso não sincronizado e oferece
tentar novamente. Ao falhar pagamento/cancelar acesso, aplica-se o mesmo ciclo,
sem anunciar que nada foi perdido durante uma indisponibilidade.

## Provas exigidas

1. Dois aparelhos reais do executor remoto: pedir troca, checkpoint positivo,
   revogar token antigo e reabrir com progresso confirmado. Nenhum jogo novo
   roda antes do ACK. O mesmo teste no título sem mundos e no servidor genérico.
2. ACK negado/ausente/duplicado, nonce vencido, outra política, outro aparelho,
   outro SID, outra cerca e confirmação após vencer. Auditoria indisponível
   reverte intenção, barreira e transferência.
3. Escrita em voo antes da barreira termina; escrita posterior é recusada.
   Trocas simultâneas não abrem duas partidas nem conservam duas reservas.
4. Limite diário e janela com antecedência, virada local e falha de rede.
   Contador informado pelo cliente e mudança de relógio não ampliam concessão.
5. Revogação atual prevalece sobre qualquer intenção/recibo antigo. Retenção
   não reativa o SID. Nenhum segredo entra em URL, DOM, auditoria ou captura.

As migrations desta etapa ainda não foram geradas. Não mudar o piso de rollback
ou habilitar famílias/checkpoint em produção com base neste desenho.
