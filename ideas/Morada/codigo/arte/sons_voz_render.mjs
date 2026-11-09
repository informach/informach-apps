// Renderiza falas com o motor da voz inventada (o mesmo módulo usado ao vivo no navegador).
// Uso: node sons_voz_render.mjs pedidos.json pasta_saida
// pedidos.json: [{id, idade, sexo, emocao, semente}, ...] → pasta_saida/<id>.f32 (float32 LE) e indice.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gerarFala } from './sons_voz_motor.js';

const [pedidosArq, saida] = process.argv.slice(2);
const pedidos = JSON.parse(readFileSync(pedidosArq, 'utf8'));
mkdirSync(saida, { recursive: true });
const indice = {};
for (const p of pedidos) {
  const f = gerarFala(p, 44100);
  writeFileSync(join(saida, p.id + '.f32'), Buffer.from(f.amostras.buffer));
  indice[p.id] = { texto: f.texto, duracao: f.duracao, boca: f.boca, semente: p.semente };
}
writeFileSync(join(saida, 'indice.json'), JSON.stringify(indice));
console.log('falas:', pedidos.length);
