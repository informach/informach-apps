import { MARCA_DO_CLIENTE } from "../src/index";

/**
 * Uma página que importa o package como o portal faz fora da rota do jogo: só
 * a marca. O teste de bundle confere que ela não carrega o three.js nem o HUD.
 */
const destino = document.getElementById("marca");
if (destino) destino.textContent = MARCA_DO_CLIENTE;
