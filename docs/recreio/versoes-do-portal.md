# Versões do portal e ações da estante

Em 15/11/2026 às 18h47 UTC, `RECREIO-4` registrou uma ação desconhecida na
estante. O evento veio do cliente `116939f6`, depois de o portal implantar
`36606409`. O código de criar mundo não mudou entre essas fontes; o deploy não
conservava a chave de Server Actions nem configurava `deploymentId`.

Referências da versão instalada Next 16.4.2: guias locais `self-hosting.md` e
`deploymentId.md`; [guia oficial](https://nextjs.org/docs/app/guides/self-hosting#version-skew).
IDs de ação e chave de closures têm funções distintas; a configuração deve
conservar a chave entre builds e identificar cada versão do cliente/servidor.

## Implementação e aceite

1. Configurar `deploymentId` com `NEXT_DEPLOYMENT_ID` explícito ou o commit do
   Railway. Conservar a chave AES da build atual como segredo próprio do portal;
   não reutilizar chaves de login ou do servidor do jogo.
2. Exigir chave no build de produção. O executor isolado gera chave própria de
   32 bytes por execução, compartilhada apenas entre as duas builds do ensaio.
3. Erro de ação desconhecida oferece carregar o documento atual. Não repetir
   automaticamente uma mutação, afirmar que nada mudou ou ocultar a telemetria.
4. Novo gate `versoes`, exclusivamente no GitHub: dois standalone de produção,
   identificadores distintos, mesma chave, banco descartável e mesmo segredo de
   autenticação. Abrir a estante na build A, trocar o processo pela B mantendo a
   aba, confirmar a criação uma vez e conferir o mundo na versão B.
5. Repetir os demais gates; provisionar a chave sem imprimi-la, conferir a main
   remota e implantar. Capturas de arte continuam privadas; o ensaio de versão
   não precisa carregar o jogo nem arquivos licenciados.

Estado inicial: correção em preparação, incidente ainda não resolvido.
Não altera a confirmação humana de salvar/reabrir a família personalizada.
