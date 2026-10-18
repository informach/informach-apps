import { getIP } from "better-auth/api";

/**
 * De onde sai o endereço de quem fez o pedido, nos apps que rodam no Railway
 * atrás do Cloudflare. É a regra do limite de tentativas do Better Auth
 * (`advanced.ipAddress` em `createAuth`) e de quem mais conta tentativas por
 * endereço (`.rateLimit` das server actions e as rotas dos apps): duas regras
 * dariam dois contadores para a mesma pessoa.
 *
 * O caminho é visitante → Cloudflare → borda do Railway → app. A borda do
 * Railway reescreve `X-Forwarded-For` e `X-Real-IP` em todo pedido, e põe em
 * `X-Real-IP` o `CF-Connecting-IP` quando a conexão vem das faixas IPv4 do
 * Cloudflare; de qualquer outra origem, `X-Real-IP` é quem conectou. Por isso
 * ninguém o falsifica, nem pulando o Cloudflare. O `X-Forwarded-For` padrão do
 * Better Auth chegava com mais de um endereço, e sem proxy confiável o Better
 * Auth descarta o valor: todo mundo caía num contador só.
 *
 * Quem chega por IPv6 vem com `0.0.0.0` (é o que a borda registra para esses
 * pedidos). Pular esse valor faz a leitura seguir para o `CF-Connecting-IP`,
 * que nesse caso foi escrito pelo próprio Cloudflare: a origem do Railway só
 * tem endereço IPv4, então um `0.0.0.0` só nasce de conexão que veio dele. O
 * Better Auth agrupa IPv6 por /64, uma casa por contador.
 *
 * As faixas do Cloudflare não entram como confiáveis de propósito: WARP e o
 * Retransmissão Privada do iCloud saem por elas, e quem usa os dois voltaria
 * a dividir um contador só.
 */
export const CLIENT_IP_ADDRESS = {
  ipAddressHeaders: ["x-real-ip", "cf-connecting-ip"],
  trustedProxies: ["0.0.0.0/32"],
};

/**
 * O endereço do pedido pela mesma regra do Better Auth. `null` quando nenhum
 * cabeçalho traz um endereço; em desenvolvimento e teste, `127.0.0.1`.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  return getIP(headers, { advanced: { ipAddress: CLIENT_IP_ADDRESS } });
}
