/**
 * A Windows-recognised publisher is an Authenticode certificate subject (CN=…, O=…),
 * the same shape the desktop verifier requires. Uncertified releases name the suite's own
 * signing instead, so Windows may warn before running them.
 */
export function windowsPublisherCertified(publisher: string) {
  return publisher.includes("CN=") && publisher.includes("O=");
}

export function formatInstallerSize(bytes: number) {
  const megabytes = bytes / 1024 ** 2;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: megabytes < 10 ? 1 : 0 }).format(megabytes)} MB`;
}
