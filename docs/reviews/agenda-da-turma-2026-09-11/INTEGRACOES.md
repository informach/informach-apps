# Teams, Batista ID e integrações

## Entregue agora

`/recados/novo` recebe a publicação colada junto de uma imagem ou PDF. Registra origem, link e data de publicação opcional; seleciona páginas; separa providências e exige revisão. O link é referência para abrir o aplicativo oficial, não um pedido automático de leitura. A assinatura de calendário pessoal é unidirecional, privada e revogável.

O caso informado é de mensagens e publicações com anexos. A implementação não usa Atribuições do Teams como substituto desse conteúdo. Não há scraping autenticado, captura de senha escolar nem promessa de sincronização automática.

## Prova técnica condicionada a acesso autorizado

As fontes oficiais já levantadas na [pesquisa](FONTES.md) orientam os próximos passos. Elas não comprovam acesso aos comunicados particulares desta família.

| Frente | Amostra e verificação | Critério de avanço |
| --- | --- | --- |
| Teams, canal | Publicação inicial, resposta, imagem incorporada, arquivo com permissão distinta e edição posterior. Confirmar tenant, tipo de conta, canal e escopos permitidos. | Ler apenas recursos autorizados, correlacionar arquivo e publicação, paginar, detectar retificação e revogar acesso. |
| Teams, chat | Mensagem com arquivo e edição em conversa efetivamente acessível à conta. Tratar escopos e endpoints próprios. | Não ampliar leitura para chats não selecionados; confirmar que autorização é possível na instituição. |
| Batista/Layers | Solicitar catálogo efetivo de APIs e escopos de comunicados por responsável e criança, anexos e alterações, usando o programa oficial. | Homologação e acesso aos dados necessários confirmados. SSO ou acesso ao calendário sozinho não conclui essa prova. |

Referências: [mensagens de canal no Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/channel-list-messages?view=graph-rest-1.0), [consentimento por recurso no Teams](https://learn.microsoft.com/en-us/microsoftteams/platform/graph-api/rsc/resource-specific-consent), [programa oficial da Layers](https://developers.layers.education/content/quickstart/layers.html). Revalidar a documentação e os escopos na data da implementação do conector.

## Contrato a exigir antes de disponibilizar um conector

- Conta da origem e credenciais com renovação/revogação suportadas; autorização por recurso selecionado, nunca a senha compartilhada da criança.
- Identificador estável de mensagem, canal/chat, versão e anexos. A origem deve fornecer vínculo confiável com a criança ou exigir confirmação manual. Nomes semelhantes não bastam.
- Idempotência por identificador da origem + versão; alteração gera revisão da mesma providência, preservando conclusão e observações privadas. Exclusão/cancelamento deve invalidar lembretes futuros.
- Tratamento explícito de arquivos cujo acesso foi removido, respostas paginadas, notificações repetidas e interrupção de credenciais. Cursor e reconciliação precisam permitir recuperação sem apagar o histórico.
- Estado visível da conexão: última leitura concluída, recurso acompanhado, falha e necessidade de reconectar. Nunca mostrar “atualizado” apenas porque a autenticação funcionou.
- Conjunto de avaliação autorizado com publicação, arquivo e mudança posteriores. Verificar extração, fonte, criança, recuperação e revogação antes de anúncio comercial.

Não foram fornecidas conta institucional autorizada, aplicação Microsoft registrada ou credenciais de homologação Layers. Por isso, esses conectores permanecem uma etapa condicionada da proposta; o fluxo implementado funciona sem eles. Não houve solicitação de acesso enviada a terceiros.
