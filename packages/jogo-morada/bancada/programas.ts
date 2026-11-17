import { ErroDePrograma, ProgramasDaCena } from "../src/cena/programas";

const gl = document.createElement("canvas").getContext("webgl2");
if (!gl) throw new Error("WebGL2 indisponível na bancada");
const guardiao = new ProgramasDaCena(
  (p) => p instanceof WebGLProgram && gl.getProgramParameter(p, gl.LINK_STATUS) === true,
);
const resultado = document.getElementById("resultado");
if (!resultado) throw new Error("Resultado ausente");

function conferir(valido: boolean) {
  if (!gl || !resultado) throw new Error("Bancada indisponível");
  const vertex = gl.createShader(gl.VERTEX_SHADER),
    fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const programa = gl.createProgram();
  if (!vertex || !fragment || !programa) throw new Error("Recursos WebGL indisponíveis");
  try {
    gl.shaderSource(
      vertex,
      valido
        ? "#version 300 es\nvoid main(){gl_Position=vec4(0.0,0.0,0.0,1.0);}"
        : "isto não é um shader válido",
    );
    gl.shaderSource(
      fragment,
      "#version 300 es\nprecision highp float;\nout vec4 cor;\nvoid main(){cor=vec4(1.0);}",
    );
    gl.compileShader(vertex);
    gl.compileShader(fragment);
    gl.attachShader(programa, vertex);
    gl.attachShader(programa, fragment);
    gl.linkProgram(programa);
    try {
      guardiao.verificar([{ program: programa }]);
      resultado.textContent = "Programa válido aceito";
    } catch (erro) {
      if (!(erro instanceof ErroDePrograma)) throw erro;
      resultado.textContent = "Programa inválido recusado";
    }
  } finally {
    gl.deleteProgram(programa);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}

document.getElementById("valido")?.addEventListener("click", () => conferir(true));
document.getElementById("invalido")?.addEventListener("click", () => conferir(false));
