export class FalhaDaPublicacao extends Error {
  constructor(
    readonly codigo: "CONFIGURACAO" | "INTEGRIDADE" | "ESTADO" | "OCUPADA" | "TENTATIVA",
  ) {
    super(`recreio.backup_publication.${codigo}`);
  }
}
