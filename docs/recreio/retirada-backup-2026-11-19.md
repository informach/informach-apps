# Retirada durável e abandono de capturas

Estado: plano de implementação após publicação/coleta qualificadas; sem ativação.

1. Adicionar controle de retirada por captura, FK RESTRICT, destino derivado da
   publicação (nunca o bucket de fotografias), motivo enumerado, fonte, token,
   prazo, bytes exatos/hash do tombstone, confirmação de armazenamento e primeira
   prova de ausência. Reconferência não apaga a primeira prova. Gerar/adotar DDL
   no GitHub, sem fabricar recibos para capturas antigas.
2. Captura sem arquivo selado só pode ser abandonada após tomar a barreira
   exclusiva antes da linha da captura: esperar fechamento da visão exportada,
   conferir ausência de publicação/tentativa admitida, gravar abandono/auditoria.
   Liberação de reservas é limitada e posterior ao recibo. Sem referência de
   ciphertext admitida não há autorização para um worker enviar arquivo.
3. Para arquivo selado/publicado, fixar retirada e bytes assinados antes do I/O,
   invalidando o token de publicação. Todos os caminhos de publicar/retomar/
   liberar por arquivo guardado precisam recusar retirada já preparada. Locks
   são captura → publicação → retirada; nenhuma rede sob essas travas.
4. Guardar e reler o tombstone imutável pelo adapter existente. Só então admitir
   DELETE do payload exato, com GET NoSuchKey e tentativa atual. Manifesto e
   tombstone permanecem: publicação tardia continua recusada pelo leitor de
   recuperação, mesmo depois de perder o banco original.
5. Confirmar ausência/auditoria atomicamente. Captura que nunca foi verificada
   pode concluir abandono com prova; confirmação histórica de uma publicada não
   deve desaparecer para aparentar outro passado. Disponibilidade exige ausência
   de retirada, nunca apenas `verified`. Reservas remanescentes são liberadas em
   lotes depois da retirada confirmada, sem inferir ausência de erro de rede.
6. Reconferir payloads retirados contra PUT tardio, conservando marcadores e a
   primeira data. Retenção não apaga as chaves de decifrar arquivos ainda válidos.
   Seleção por idade/cadência é uma política operacional separada; não habilitar
   exclusão automática a partir de um parâmetro arbitrário do navegador.

Gates remotos: captura ainda em curso, coordenação perdida, arquivo não admitido,
PUT/índice atrasados, token vencido, resposta perdida, chave indisponível,
repetição com bytes idênticos, falhas de auditoria, tombstone divergente e
retomada sem arquivos locais. Prova externa só em prefixos sintéticos próprios;
nenhuma retirada de dados reais antes de qualificar retenção e custódia.

O ledger de direitos F7 continua obrigatório antes de receber tráfego restaurado.
Retirar um backup não equivale a excluir dados pessoais em todos os mundos,
origens, exportações e demais backups. Fonte atual qualificada: `44281736`,
recuperação externa `44491770523`; produção permanece sem esses modos.

Capturas anteriores ao writer completo precisam de versão explícita de
protocolo: a migration conserva `0` nas antigas e só o novo escritor emite `1`.
Ausência de uma publicação legada não comprova que não houve I/O. A retomada ou
abandono automático recusa protocolo legado. Um banco restaurado também não
pode ativar jobs por ter esse número: a normalização/ledger e o bootstrap de
recuperação permanecem gates separados, antes de qualquer tráfego ou coleta.

O controle de retirada também precisa de FK RESTRICT para a publicação, que
conserva o destino independente. A FK só para captura deixaria apagar os
metadados necessários à retomada. A constraint adicional é aditiva e não exige
backfill de produção: essa tabela só existe em candidata e todos os escritores
nativos criam a publicação antes da retirada; não houve implantação.
