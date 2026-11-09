// morada_voz.js — a voz inventada dos moradores do Morada ("moradês").
//
// Sintetizador de fonemas inventados, sem palavras reais: sílabas aleatórias (com semente), entonação por
// emoção, fonte glotal com harmônicos e um banco de formantes que desliza de um fonema para o outro.
// O mesmo código gera os arquivos da biblioteca (no Node, por sons_voz.py) e a fala ao vivo no navegador.
//
// Uso no navegador:
//   import { falar } from './morada_voz.js';
//   const fala = falar(ctx, { idade: 'adulto', sexo: 'f', emocao: 'feliz', semente: 42 });
//   // a cada quadro: const { abertura, forma } = fala.bocaAgora();   (abertura 0..1, forma 'X M A E I O F')
//
// Sem dependências; funciona em módulo ES no navegador e no Node (só gerarFala, sem Web Audio).

export const TAXA_PADRAO = 44100;
export const FPS_BOCA = 30;

// ------------------------------------------------------------------ vozes e emoções

export const VOZES = {
  bebe:    { m: { f0: 430, fs: 1.6, incl: 1.05, sopro: 0.08, ritmo: 0.9, jitter: 0.015 },
             f: { f0: 445, fs: 1.62, incl: 1.05, sopro: 0.08, ritmo: 0.9, jitter: 0.015 } },
  crianca: { m: { f0: 255, fs: 1.27, incl: 1.0, sopro: 0.06, ritmo: 1.08, jitter: 0.01 },
             f: { f0: 282, fs: 1.31, incl: 1.0, sopro: 0.07, ritmo: 1.08, jitter: 0.01 } },
  adulto:  { m: { f0: 112, fs: 1.0, incl: 1.05, sopro: 0.04, ritmo: 1.0, jitter: 0.008 },
             f: { f0: 205, fs: 1.16, incl: 1.1, sopro: 0.08, ritmo: 1.0, jitter: 0.008 } },
  idoso:   { m: { f0: 104, fs: 0.97, incl: 1.25, sopro: 0.13, ritmo: 0.85, jitter: 0.03, trem: [5.5, 0.025] },
             f: { f0: 178, fs: 1.12, incl: 1.3, sopro: 0.15, ritmo: 0.85, jitter: 0.03, trem: [6.0, 0.03] } },
};

export const EMOCOES = {
  neutro:   { nome: 'Neutro',   st: 0,    faixa: 3,   ritmo: 1.0,  energia: 1.0,  sopro: 0,    incl: 0,     tipos: { decl: 0.6, perg: 0.3, excl: 0.1 } },
  feliz:    { nome: 'Feliz',    st: 2,    faixa: 6,   ritmo: 1.1,  energia: 1.05, sopro: 0,    incl: -0.12, sorriso: 1.04, tipos: { excl: 0.5, decl: 0.3, perg: 0.2 } },
  triste:   { nome: 'Triste',   st: -2.5, faixa: 1.8, ritmo: 0.78, energia: 0.75, sopro: 0.12, incl: 0.25,  sorriso: 0.97, tremor: [7, 0.012], tipos: { decl: 0.9, perg: 0.1 } },
  bravo:    { nome: 'Bravo',    st: 1,    faixa: 5.5, ritmo: 1.15, energia: 1.25, sopro: 0,    incl: -0.3,  aspereza: 0.25, f1: 1.06, tipos: { excl: 0.7, decl: 0.3 } },
  surpreso: { nome: 'Surpreso', st: 3.5,  faixa: 9,   ritmo: 1.0,  energia: 1.1,  sopro: 0.02, incl: -0.1,  tipos: { perg: 0.5, excl: 0.5 } },
  rindo:    { nome: 'Rindo',    st: 3,    faixa: 6,   ritmo: 1.0,  energia: 1.0,  sopro: 0.1,  incl: 0,     tipos: { excl: 1 } },
  sono:     { nome: 'Sono',     st: -3,   faixa: 2.5, ritmo: 0.7,  energia: 0.7,  sopro: 0.2,  incl: 0.3,   tipos: { decl: 1 } },
  choro:    { nome: 'Choro de bebê', st: 0, faixa: 5, ritmo: 1.0, energia: 1.2,  sopro: 0.15, incl: -0.15, aspereza: 0.3, tipos: { excl: 1 } },
  balbucio: { nome: 'Balbucio', st: 1,    faixa: 6,   ritmo: 0.95, energia: 1.0,  sopro: 0.05, incl: 0,     sorriso: 1.03, tipos: { excl: 0.5, decl: 0.5 } },
};

// emoções de cada idade (choro e balbucio só no bebê)
export const EMOCOES_POR_IDADE = {
  bebe: ['choro', 'balbucio', 'rindo'],
  crianca: ['neutro', 'feliz', 'triste', 'bravo', 'surpreso', 'rindo', 'sono'],
  adulto: ['neutro', 'feliz', 'triste', 'bravo', 'surpreso', 'rindo', 'sono'],
  idoso: ['neutro', 'feliz', 'triste', 'bravo', 'surpreso', 'rindo', 'sono'],
};

// ------------------------------------------------------------------ fonemas

// formantes de referência (voz adulta masculina, Hz) e a forma de boca de cada vogal
const VOGAIS = {
  a: { F: [760, 1280, 2550, 3500], boca: 'A', txt: 'a' },
  e: { F: [460, 1900, 2550, 3500], boca: 'E', txt: 'e' },
  E: { F: [600, 1750, 2550, 3500], boca: 'A', txt: 'é' },
  i: { F: [300, 2250, 2950, 3600], boca: 'I', txt: 'i' },
  o: { F: [480, 900, 2500, 3400], boca: 'O', txt: 'o' },
  O: { F: [600, 980, 2500, 3400], boca: 'O', txt: 'ó' },
  u: { F: [330, 800, 2350, 3300], boca: 'O', txt: 'u' },
  y: { F: [550, 1500, 2500, 3400], boca: 'E', txt: 'ë' },
};

// tipo, sonora, lócus de F2, banda de ruído [centro Hz, largura em oitavas, força], forma de boca
const CONSOANTES = {
  p: { t: 'ocl', v: 0, l2: 900, rb: [1000, 1.2, 0.5], boca: 'M' },
  b: { t: 'ocl', v: 1, l2: 900, rb: [800, 1.2, 0.35], boca: 'M' },
  t: { t: 'ocl', v: 0, l2: 1800, rb: [4200, 0.8, 0.6], boca: 'E' },
  d: { t: 'ocl', v: 1, l2: 1700, rb: [3600, 0.8, 0.4], boca: 'E' },
  k: { t: 'ocl', v: 0, l2: 2000, rb: [2300, 0.6, 0.6], boca: 'E' },
  g: { t: 'ocl', v: 1, l2: 2000, rb: [2100, 0.6, 0.4], boca: 'E' },
  m: { t: 'nas', v: 1, l2: 1000, boca: 'M' },
  n: { t: 'nas', v: 1, l2: 1700, boca: 'E' },
  f: { t: 'fri', v: 0, l2: 1100, rb: [5500, 1.3, 0.28], boca: 'F' },
  v: { t: 'fri', v: 1, l2: 1100, rb: [5000, 1.3, 0.22], boca: 'F' },
  s: { t: 'fri', v: 0, l2: 1700, rb: [6800, 0.5, 0.75], boca: 'I' },
  z: { t: 'fri', v: 1, l2: 1700, rb: [6300, 0.5, 0.55], boca: 'I' },
  x: { t: 'fri', v: 0, l2: 1900, rb: [3300, 0.6, 0.75], boca: 'O', txt: 'ch' },
  j: { t: 'fri', v: 1, l2: 1900, rb: [3100, 0.6, 0.55], boca: 'O' },
  l: { t: 'liq', v: 1, F: [360, 1300, 2700, 3400], boca: 'E' },
  r: { t: 'tep', v: 1, l2: 1600, boca: 'E' },
  h: { t: 'asp', v: 0, boca: 'A' },
  w: { t: 'gli', v: 1, F: [330, 750, 2300, 3300], boca: 'O' },
};

// pesos das sílabas: soa como uma língua de desenho, macia e cheia de b, l, m, n
const ATAQUES = [['b', 3], ['d', 2], ['g', 1.2], ['p', 2], ['t', 1.5], ['k', 1.5], ['m', 3], ['n', 2.5], ['l', 3], ['r', 0.8],
  ['s', 2], ['z', 1], ['f', 1], ['v', 1], ['x', 1.5], ['j', 1], ['h', 0.8], ['w', 0.8], ['bl', 0.5], ['pl', 0.4], ['fl', 0.3],
  ['gr', 0.3], ['br', 0.4], ['tr', 0.3], ['', 1.2]];
const NUCLEOS = [['a', 4], ['e', 3], ['i', 3], ['o', 3], ['u', 2], ['E', 1], ['O', 1], ['y', 1]];
const CODAS = [['n', 3], ['l', 2], ['s', 2], ['x', 1], ['m', 1], ['b', 0.4]];

// palavras e pedaços que não podem sair (palavras reais comuns e palavrões, em português e inglês)
const PROIBIDAS = new Set((
  // português: palavras comuns e curtas (sem acento), interjeições e nomes de família
  'a o e as os um uma uns umas de do da dos das no na nos nas em ao aos com sem por pra para pelo pela que se nao sim mas mais ' +
  'menos muito pouco ja so bem mal meu minha teu tua seu sua dele dela eu tu ele ela vos eles elas me te lhe isso isto esse essa ' +
  'este esta aqui ali la ca hoje agora onde como quando quem qual foi fui era sou sao esta estou tem tenho ter ser vai vou vem ' +
  'ver vi viu dar dou deu faz fez diz disse ir sai saiu poe pos quer quero pode posso sabe sei olha oi ola tchau boa bom dia ' +
  'noite tarde sol lua mar rio ceu chao casa mesa cama sofa porta carro bola gato cao pato boi vaca porco galo rato sapo leao ' +
  'urso lobo peixe ave pai mae tio tia avo vovo filho filha bebe nene nenem mano mana amigo amiga amor beijo festa bolo doce ' +
  'pao leite cafe cha suco agua fogo luz som voz mao pe dedo olho boca nariz cara pele dente perna nome vida tempo hora ano mes ' +
  'lado cima fora meio fim base gafe brabo bravo nada tudo todo toda cada outro outra mesmo mesma tal tao ate apos sob sobre ' +
  'mil cem dez dois tres seis sete oito nove zero par vez fala falo lava leva lixo pia po mo do no pa fe re ma se be ce de ' +
  'mi fa si va ve le li leu da dei to ta pois bis belo bela lindo linda fofo fofa feio feia bobo boba tolo tola louco louca doido ' +
  'doida chato chata legal massa top joia coisa tela tema teto tipo tom topo touro trem tribo uva vela vila vinho bala bife bico ' +
  'bode bone bota boto bule cabo caco calo cana capa caro cavalo cedo cego cela cena cera cubo dado dama data dona dor dote duna ' +
  'duro faca fada fama fava favo feno fila filme fio fita foca foco folha fome fono forte fumo fundo gala gema gelo gola gole gota ' +
  'gula jaca jato jogo judo lama lata leme lima limo lodo lona lote luva lula maca mala mapa mato meia mel mimo mina mola moca moda ' +
  'mofo mole mono mula muro nabo nata neve nuca nulo ovo pala pano papa papo pata pena pera pelo pipa pista pote povo pulo puma ' +
  'rabo rede remo riso roda rolo rosa roupa rua sala salto seda selo sino sopa tapa taco tatu teia time toca tomo vale vaso veia ' +
  'velho via viola zona oba opa eba ui ai ei ue uai uau hum baba dada mama nana vovo titia mamae papai bunda cu pau pinto xota rola ' +
  'cona caca xixi coco mijo peido sexo mata morte burro burra bicha teta peru pila nos sal sul mau chuva lado pena lume tia tio ' +
  'menino menina moco moca rei reis lei leis seis voo bolha bolsa bica bota dote gato fado fato fino fiel giro gozo gume hino ' +
  'ilha jure lado logo lugar mito modo mudo nove ola onda ouro pai pais paz pelo pico polo pura puro raso rito rico roxo sapo ' +
  'sede seco sete soma sono suor taxa todo tosse unha uni vaga vago vela vez zelo bis lim pim tim fim sim mim rim ' +
  'magro magra don ban til les gordo gorda alto alta baixo baixa ruim rum gim bar mar par lar sal mel fel gel cal mal bem nem cem tem vem sem ' +
  // inglês
  'the an and or but if of in on at by for with from up out is are was be am does did have has had you he she we they it him ' +
  'her us them my your his its our this that what who how why when where yes not all any some one two go get got see saw say ' +
  'come came make made take took good bad big hot cold new old man men boy girl cat dog sun moon love kiss hug hi hello bye ok ' +
  'okay wow yeah yay oh so too can will just like now then here there home baby papa mom dad sis bro day night food eat sad ' +
  'mad fun run sit hat bat mat rat pet bed red blue pink pen pin pan pot tip tap map mop cup bus toy ball bell doll milk cake ' +
  'pie tea sea bee lol zip fan fig fit fix gap gas gum gun hit hop jam jar jet job jog lab lap leg lid lip log lot mix mud mug ' +
  'nap net nod nut pal pig pit pop rag ram rib rid rim rip rob rod rot rub rug sip six ski sob sum tab tag tan ten tin ton tub ' +
  'tug van vet wag wax web wet wig win wit yak yam yet zap god sex sexy gay nazi kill die dead fat ugly poo pee butt boob ' +
  'bum shut damn hell'
).split(/\s+/).filter(Boolean));
const PEDACOS = ['puta', 'foda', 'fod', 'merd', 'porr', 'bost', 'cacete', 'caralh', 'fuck', 'shit', 'cunt', 'dick', 'cock',
  'piss', 'bitch', 'nigg', 'fag', 'cuzao', 'buceta', 'xoxota', 'piroc', 'rapariga'];

// ------------------------------------------------------------------ utilidades

function semear(s) {
  let a = typeof s === 'number' ? s >>> 0 : 0;
  if (typeof s === 'string') { a = 2166136261; for (const c of s) { a ^= c.charCodeAt(0); a = Math.imul(a, 16777619); } a >>>= 0; }
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function sortear(r, lista) {
  let tot = 0; for (const [, w] of lista) tot += w;
  let x = r() * tot;
  for (const [v, w] of lista) { x -= w; if (x <= 0) return v; }
  return lista[lista.length - 1][0];
}
function sortearObj(r, obj) { return sortear(r, Object.entries(obj)); }
const st2f = (st) => Math.pow(2, st / 12);
function normalizarTexto(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

// ------------------------------------------------------------------ frases

function silaba(r, opts = {}) {
  let at = opts.ataque !== undefined ? opts.ataque : sortear(r, ATAQUES);
  const nu = opts.nucleo || sortear(r, NUCLEOS);
  const co = opts.coda !== undefined ? opts.coda : (r() < 0.2 ? sortear(r, CODAS) : '');
  return { ataque: at, nucleo: nu, coda: co };
}

function textoSilaba(s) {
  const c = (k) => (CONSOANTES[k] && CONSOANTES[k].txt) || k;
  return [...s.ataque].map(c).join('') + VOGAIS[s.nucleo].txt + [...s.coda].map(c).join('');
}

function palavra(r, nSil) {
  for (let tent = 0; tent < 30; tent++) {
    const sils = [];
    for (let i = 0; i < nSil; i++) {
      const s = silaba(r, i === 0 ? {} : { ataque: r() < 0.15 ? '' : undefined });
      if (nSil === 1 && s.ataque === '') s.ataque = sortear(r, ATAQUES.filter(([k]) => k));
      sils.push(s);
    }
    const txt = sils.map(textoSilaba).join('');
    const norm = normalizarTexto(txt);
    if (PROIBIDAS.has(norm) || PEDACOS.some((p) => norm.includes(p))) continue;
    const tonica = nSil === 1 ? 0 : (r() < 0.7 ? nSil - 2 : nSil - 1);
    return { sils, tonica, txt };
  }
  return { sils: [{ ataque: 'b', nucleo: 'y', coda: '' }], tonica: 0, txt: 'bë' };
}

// Monta o plano de uma fala: sílabas, tipo de frase e trechos especiais (risada, bocejo, choro)
export function criarFrase(opts = {}) {
  const idade = opts.idade || 'adulto';
  const sexo = opts.sexo || 'f';
  let emocao = opts.emocao || 'neutro';
  if (!EMOCOES_POR_IDADE[idade].includes(emocao)) emocao = EMOCOES_POR_IDADE[idade][0];
  const semente = opts.semente ?? Math.floor(Math.random() * 1e9);
  const r = semear(`${idade}|${sexo}|${emocao}|${semente}`);
  const voz = VOZES[idade][sexo];
  const emo = EMOCOES[emocao];
  const plano = { idade, sexo, emocao, semente, partes: [], tipo: sortearObj(r, emo.tipos) };

  const fala = (nPal) => {
    const pals = [];
    for (let i = 0; i < nPal; i++) pals.push(palavra(r, sortear(r, [[1, 0.35], [2, 0.45], [3, 0.2]])));
    return { tipo: 'fala', palavras: pals };
  };
  if (emocao === 'rindo') {
    const vog = idade === 'crianca' || idade === 'bebe' ? (r() < 0.6 ? 'i' : 'e') : idade === 'idoso' ? (r() < 0.6 ? 'o' : 'a') : (r() < 0.6 ? 'a' : 'e');
    if (r() < 0.35 && idade !== 'bebe') plano.partes.push(fala(1 + Math.floor(r() * 2)));
    plano.partes.push({ tipo: 'risada', vogal: vog, n: 4 + Math.floor(r() * 5), inspira: r() < 0.5 });
  } else if (emocao === 'sono') {
    plano.partes.push({ tipo: 'bocejo', dur: 0.9 + r() * 0.5 });
    const k = r();
    if (k < 0.45) plano.partes.push(fala(1 + Math.floor(r() * 2)));
    else if (k < 0.75) plano.partes.push({ tipo: 'hum', dur: 0.5 + r() * 0.3 });
  } else if (emocao === 'choro') {
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      plano.partes.push({ tipo: 'choro', dur: 0.45 + r() * 0.55, vogal: r() < 0.7 ? 'a' : 'E' });
      if (i < n - 1) plano.partes.push({ tipo: r() < 0.6 ? 'inspira' : 'solucos', dur: 0.15 + r() * 0.15 });
    }
  } else if (emocao === 'balbucio') {
    const n = 2 + Math.floor(r() * 3);
    const pals = [];
    for (let i = 0; i < n; i++) {
      const at = sortear(r, [['b', 3], ['d', 2], ['g', 2], ['m', 2], ['n', 1], ['', 1]]);
      const nu = sortear(r, [['a', 3], ['u', 2], ['i', 1], ['e', 1]]);
      const rep = 3;   // "bababa", nunca "baba" (que é palavra)
      const sils = Array.from({ length: rep }, () => ({ ataque: at, nucleo: nu, coda: '' }));
      pals.push({ sils, tonica: rep - 1, txt: sils.map(textoSilaba).join('') });
    }
    plano.partes.push({ tipo: 'fala', palavras: pals });
    if (r() < 0.4) plano.partes.push({ tipo: 'risada', vogal: 'i', n: 3 + Math.floor(r() * 2), inspira: false });
  } else if (emocao === 'surpreso') {
    const inter = { ataque: sortear(r, [['', 2], ['w', 1], ['h', 1.5]]), nucleo: sortear(r, [['o', 3], ['a', 2], ['u', 1], ['E', 1]]), coda: '' };
    plano.partes.push({ tipo: 'interjeicao', sil: inter });
    if (r() < 0.75) plano.partes.push(fala(1 + Math.floor(r() * 3)));
  } else {
    const nPal = emocao === 'bravo' ? 2 + Math.floor(r() * 3) : emocao === 'triste' ? 2 + Math.floor(r() * 2) : 2 + Math.floor(r() * 4);
    plano.partes.push(fala(nPal));
  }
  // texto para legenda e conferência
  const pont = { decl: '.', perg: '?', excl: '!' }[plano.tipo];
  const txt = plano.partes.map((p) => {
    if (p.tipo === 'fala') return p.palavras.map((w) => w.txt).join(' ');
    if (p.tipo === 'risada') return ('h' + VOGAIS[p.vogal].txt).repeat(p.n);
    if (p.tipo === 'bocejo') return 'aaauhm…';
    if (p.tipo === 'hum') return 'hmm…';
    if (p.tipo === 'choro') return 'uãã' + 'ã'.repeat(Math.round(p.dur * 4));
    if (p.tipo === 'inspira') return '(inspira)';
    if (p.tipo === 'solucos') return 'uh-uh';
    if (p.tipo === 'interjeicao') return textoSilaba(p.sil) + textoSilaba(p.sil).slice(-1) + '!';
    return '';
  }).join(' ').trim();
  plano.texto = txt.charAt(0).toUpperCase() + txt.slice(1) + (/[!?.…)]$/.test(txt) ? '' : pont);
  plano.voz = voz;
  return plano;
}

// ------------------------------------------------------------------ segmentos (fonemas no tempo)

// Converte o plano numa lista de segmentos com duração, alvo de formantes, f0 (semitons), vozeamento e ruído
function segmentar(plano, r) {
  const voz = plano.voz, emo = EMOCOES[plano.emocao];
  const ritmo = voz.ritmo * emo.ritmo;
  const segs = [];
  const faixa = emo.faixa;
  const push = (s) => { s.dur /= ritmo; segs.push(s); };
  push({ fon: '_', dur: 0.012 });

  const consoante = (k, prox, tonica) => {
    const c = CONSOANTES[k];
    if (!c) return;
    const vF = VOGAIS[prox] ? VOGAIS[prox].F : VOGAIS.y.F;
    if (c.t === 'ocl') {
      // no começo da fala o fechamento não se ouve: fica curto para a voz não começar atrasada
      const inicio = segs.length <= 1;
      push({ fon: k, dur: inicio ? 0.012 : (c.v ? 0.045 : 0.055), F: [250, c.l2, vF[2], vF[3]], av: c.v ? 0.12 : 0, boca: c.boca, fase: 'fecho' });
      push({ fon: k, dur: c.v ? 0.012 : 0.014, F: [300, c.l2, vF[2], vF[3]], av: c.v ? 0.3 : 0, rb: c.rb, rf: 1, boca: c.boca, fase: 'solta' });
      if (!c.v) push({ fon: 'h', dur: tonica ? 0.03 : 0.022, F: vF, av: 0, asp: 0.35, boca: VOGAIS[prox] ? VOGAIS[prox].boca : 'E' });
    } else if (c.t === 'nas') {
      push({ fon: k, dur: 0.06, F: [260, c.l2, vF[2], vF[3]], av: 0.4, nasal: 1, boca: c.boca });
    } else if (c.t === 'fri') {
      push({ fon: k, dur: c.v ? 0.07 : 0.085, F: [300, c.l2, vF[2], vF[3]], av: c.v ? 0.25 : 0, rb: c.rb, rf: 1, boca: c.boca });
    } else if (c.t === 'liq') {
      push({ fon: k, dur: 0.05, F: c.F, av: 0.55, boca: c.boca });
    } else if (c.t === 'tep') {
      push({ fon: k, dur: 0.022, F: [350, c.l2, vF[2], vF[3]], av: 0.25, boca: c.boca });
    } else if (c.t === 'asp') {
      push({ fon: k, dur: 0.065, F: vF, av: 0, asp: 0.5, boca: VOGAIS[prox] ? VOGAIS[prox].boca : 'A' });
    } else if (c.t === 'gli') {
      push({ fon: k, dur: 0.05, F: c.F, av: 0.7, boca: c.boca });
    }
  };

  // contorno: declinação ao longo das vogais, acento nas tônicas e final pelo tipo de frase
  const vogal = (k, dur, st, amp = 1, extra = {}) => {
    push(Object.assign({ fon: k, dur, F: VOGAIS[k].F, av: amp, st, boca: VOGAIS[k].boca, vogal: true }, extra));
  };

  const nPartes = plano.partes.length;
  plano.partes.forEach((p, ip) => {
    const ultimaParte = ip === nPartes - 1;
    if (p.tipo === 'fala' || p.tipo === 'interjeicao') {
      const pals = p.tipo === 'fala' ? p.palavras : [{ sils: [p.sil], tonica: 0 }];
      const nV = pals.reduce((a, w) => a + w.sils.length, 0);
      let iv = 0;
      pals.forEach((w, iw) => {
        w.sils.forEach((s, is) => {
          const ton = is === w.tonica;
          const pos = nV > 1 ? iv / (nV - 1) : 0;
          let st = faixa * (0.3 - 0.7 * pos);
          if (ton) st += faixa * (plano.emocao === 'bravo' ? 0.6 : 0.45);
          const ultima = ultimaParte && iw === pals.length - 1 && is === w.sils.length - 1;
          let stFim = st;
          if (ultima || p.tipo === 'interjeicao') {
            if (plano.tipo === 'perg') { st = st - faixa * 0.2; stFim = st + faixa * 1.0; }
            else if (plano.tipo === 'excl') { st = st + faixa * 0.5; stFim = st - faixa * 0.7; }
            else { stFim = st - faixa * 0.6; }
          }
          if (p.tipo === 'interjeicao') { st = faixa * 0.2; stFim = st + faixa * (r() < 0.5 ? 0.9 : -0.4); }
          for (let i = 0; i < s.ataque.length; i++) consoante(s.ataque[i], s.nucleo, ton);
          let dur = ton ? 0.13 : 0.085;
          if (ultima) dur *= 1.6;
          if (p.tipo === 'interjeicao') dur = 0.32 + r() * 0.15;
          if (plano.emocao === 'bravo') dur *= 0.9;
          vogal(s.nucleo, dur * (0.9 + 0.2 * r()), st, ton ? 1 : 0.82, { stFim });
          for (let i = 0; i < s.coda.length; i++) consoante(s.coda[i], 'y', false);
          iv++;
        });
        if (iw < pals.length - 1 && r() < 0.25) push({ fon: '_', dur: 0.04 + r() * 0.05 });
      });
      if (!ultimaParte) push({ fon: '_', dur: 0.12 + r() * 0.1 });
    } else if (p.tipo === 'risada') {
      for (let i = 0; i < p.n; i++) {
        const st = faixa * (0.9 - 1.3 * (i / Math.max(1, p.n - 1)));
        const amp = 1 - 0.5 * (i / p.n);
        push({ fon: 'h', dur: (plano.idade === 'idoso' ? 0.07 : 0.05) * (0.85 + 0.3 * r()), F: VOGAIS[p.vogal].F, av: 0, asp: 0.28, boca: VOGAIS[p.vogal].boca });
        vogal(p.vogal, (plano.idade === 'idoso' ? 0.12 : 0.085) * (0.85 + 0.3 * r()), st, amp, { stFim: st - 0.8, avFim: 0.15, risada: true });
        push({ fon: '_', dur: 0.025 });
      }
      if (p.inspira) {
        push({ fon: '_', dur: 0.05 });
        push({ fon: 'h', dur: 0.28, F: VOGAIS.i.F, av: 0, asp: 0.35, boca: 'I', inspira: true });
      }
    } else if (p.tipo === 'bocejo') {
      push({ fon: 'h', dur: 0.12, F: VOGAIS.a.F, av: 0, asp: 0.3, boca: 'A' });
      vogal('a', p.dur * 0.6, faixa * 0.8, 1, { stFim: faixa * 1.2 });
      vogal('o', p.dur * 0.25, faixa * 1.0, 0.8, { stFim: -faixa * 1.6 });
      vogal('u', p.dur * 0.25, -faixa * 1.6, 0.5, { stFim: -faixa * 2.2, avFim: 0.4 });
      push({ fon: 'm', dur: 0.12, F: [260, 1000, 2400, 3300], av: 0.3, nasal: 1, boca: 'M' });
      push({ fon: '_', dur: 0.15 });
    } else if (p.tipo === 'hum') {
      push({ fon: 'm', dur: p.dur, F: [260, 1000, 2400, 3300], av: 0.45, nasal: 1, boca: 'M', st: 0, stFim: -faixa, vogal: true });
    } else if (p.tipo === 'choro') {
      push({ fon: 'w', dur: 0.06, F: CONSOANTES.w.F, av: 0.6, boca: 'O', st: -faixa * 0.3 });
      vogal(p.vogal, p.dur * 0.25, faixa * 0.2, 1, { stFim: faixa * 0.9, choro: true });
      vogal(p.vogal, p.dur * 0.75, faixa * 0.9, 0.95, { stFim: -faixa * 0.5, choro: true });
    } else if (p.tipo === 'inspira') {
      push({ fon: '_', dur: 0.04 });
      push({ fon: 'h', dur: p.dur, F: VOGAIS.i.F, av: 0, asp: 0.45, boca: 'I', inspira: true });
    } else if (p.tipo === 'solucos') {
      for (let i = 0; i < 2; i++) {
        push({ fon: 'h', dur: 0.03, F: VOGAIS.u.F, av: 0, asp: 0.3, boca: 'O' });
        vogal('u', 0.08, faixa * 0.4, 0.6, { stFim: faixa * 0.1 });
        push({ fon: '_', dur: 0.05 });
      }
    }
  });
  push({ fon: '_', dur: 0.06 });
  return segs;
}

// ------------------------------------------------------------------ síntese

// Ressonador de 2ª ordem (ganho ~1 no pico)
function coefRes(f, bw, sr) {
  const rr = Math.exp(-Math.PI * bw / sr);
  const th = 2 * Math.PI * Math.min(f, sr / 2 - 200) / sr;
  return { a1: -2 * rr * Math.cos(th), a2: rr * rr, b0: (1 - rr) * Math.sqrt(1 - 2 * rr * Math.cos(2 * th) + rr * rr) };
}
// Passa-banda (RBJ, ganho de pico 1) para o ruído das fricativas
function coefBP(f, oct, sr) {
  const w0 = 2 * Math.PI * Math.min(Math.max(f, 50), sr * 0.45) / sr;
  oct = Math.max(oct, 0.1);
  const al = Math.sin(w0) * Math.sinh(Math.LN2 / 2 * oct * w0 / Math.sin(w0));
  const a0 = 1 + al;
  return { b0: al / a0, b2: -al / a0, a1: -2 * Math.cos(w0) / a0, a2: (1 - al) / a0 };
}

export function sintetizar(plano, taxa = TAXA_PADRAO) {
  const sr = taxa;
  const r = semear(`sint|${plano.semente}|${plano.idade}|${plano.sexo}|${plano.emocao}`);
  const voz = plano.voz, emo = EMOCOES[plano.emocao];
  const segs = segmentar(plano, r);
  // tempos
  let t = 0;
  for (const s of segs) { s.t0 = t; t += s.dur; s.t1 = t; }
  const N = Math.ceil(t * sr) + 1;

  // trilhas por amostra: interpolação linear entre os centros dos segmentos, depois suavização
  const nT = 9; // F1..F4, av, asp, nasal, frc, st
  const pontos = [];
  const fs = voz.fs, sorr = emo.sorriso || 1, f1x = emo.f1 || 1;
  let stAnt = 0;
  for (const s of segs) {
    const F = s.F || (s.fon === '_' ? null : VOGAIS.y.F);
    const st = s.st !== undefined ? s.st : stAnt;
    const base = {
      F1: F ? F[0] * fs * f1x : null, F2: F ? F[1] * fs * sorr : null, F3: F ? F[2] * fs * sorr : null, F4: F ? F[3] * fs : null,
      av: (s.av || 0) * emo.energia, asp: (s.asp || 0) * emo.energia, nasal: s.nasal || 0, frc: s.rf ? s.rb[2] * emo.energia : 0,
    };
    if (s.vogal && s.stFim !== undefined) {
      pontos.push(Object.assign({ t: s.t0 + s.dur * 0.15, st }, base));
      pontos.push(Object.assign({}, base, { t: s.t0 + s.dur * 0.85, st: s.stFim, av: base.av * (s.avFim ?? 1) }));
      stAnt = s.stFim;
    } else {
      pontos.push(Object.assign({ t: (s.t0 + s.t1) / 2, st }, base));
      if (s.st !== undefined) stAnt = st;
    }
  }
  // completa formantes ausentes (silêncio) com o vizinho
  const chaves = ['F1', 'F2', 'F3', 'F4'];
  for (const k of chaves) {
    let ult = null;
    for (const p of pontos) { if (p[k] !== null) ult = p[k]; else if (ult !== null) p[k] = ult; }
    ult = null;
    for (let i = pontos.length - 1; i >= 0; i--) { if (pontos[i][k] !== null) ult = pontos[i][k]; else pontos[i][k] = ult ?? 500; }
  }
  const trilha = (k) => {
    const y = new Float32Array(N);
    let j = 0;
    for (let n = 0; n < N; n++) {
      const tt = n / sr;
      while (j < pontos.length - 2 && pontos[j + 1].t < tt) j++;
      const a = pontos[j], b = pontos[Math.min(j + 1, pontos.length - 1)];
      const u = b.t > a.t ? Math.min(1, Math.max(0, (tt - a.t) / (b.t - a.t))) : 0;
      y[n] = a[k] + (b[k] - a[k]) * u;
    }
    return y;
  };
  const suavizar = (y, seg) => { // média móvel (duas passadas) de 'seg' segundos
    const w = Math.max(1, Math.round(seg * sr));
    for (let pass = 0; pass < 2; pass++) {
      const out = new Float32Array(y.length);
      let acc = 0;
      for (let n = 0; n < y.length; n++) {
        acc += y[n];
        if (n >= w) acc -= y[n - w];
        out[Math.max(0, n - (w >> 1))] = acc / Math.min(n + 1, w);
      }
      for (let n = y.length - (w >> 1); n < y.length; n++) out[n] = y[n];
      y = out;
    }
    return y;
  };
  const T = {};
  for (const k of chaves) T[k] = suavizar(trilha(k), 0.018);
  T.av = suavizar(trilha('av'), 0.008);
  T.asp = suavizar(trilha('asp'), 0.006);
  T.nasal = suavizar(trilha('nasal'), 0.012);
  T.st = suavizar(trilha('st'), 0.03);
  // fricção: degraus nítidos (bursts curtos) com borda suave de 3 ms; banda do segmento corrente
  const frc = new Float32Array(N), fbC = new Float32Array(N).fill(3000), fbO = new Float32Array(N).fill(1);
  for (const s of segs) {
    const a = Math.floor(s.t0 * sr), b = Math.min(N, Math.floor(s.t1 * sr));
    for (let n = a; n < b; n++) {
      fbC[n] = s.rb ? s.rb[0] * Math.sqrt(fs) : 3000; fbO[n] = s.rb ? s.rb[1] : 1;
      frc[n] = s.rf ? s.rb[2] * emo.energia * (s.fase === 'solta' ? 1.4 : 1) : 0;
    }
  }
  const frcS = suavizar(frc, 0.003);

  // f0 com declinação, jitter, tremor de idoso e de tristeza, vibrato no choro
  const f0b = voz.f0 * st2f(emo.st);
  const jit = voz.jitter, trem = voz.trem, tremE = emo.tremor;
  const sopro = Math.min(0.3, voz.sopro + (emo.sopro || 0));
  const incl = voz.incl + (emo.incl || 0);
  const asper = emo.aspereza || 0;
  let lento = 0, lentoV = 0;
  const KMAX = 80;
  const w = new Float32Array(KMAX + 1);
  for (let k = 1; k <= KMAX; k++) w[k] = 1 / Math.pow(k, incl);
  // estados dos filtros
  const fz = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];
  const ganhos = [1.0, 0.7, 0.35, 0.18];
  const bwsBase = [70, 95, 140, 190].map((b) => b * (1 + sopro * 1.5));
  let cf = [], cn = null, cb = null;
  let bx1 = 0, bx2 = 0, by1 = 0, by2 = 0;
  let fase = 0;
  const out = new Float32Array(N);
  let dc = 0;
  const choroSegs = segs.filter((s) => s.choro).map((s) => [s.t0, s.t1]);
  for (let n = 0; n < N; n++) {
    const tt = n / sr;
    if ((n & 31) === 0) {
      cf = [0, 1, 2, 3].map((i) => coefRes(T[chaves[i]][n], bwsBase[i], sr));
      cn = coefRes(260 * fs, 100, sr);
      cb = coefBP(fbC[n], fbO[n], sr);
      lentoV += (r() * 2 - 1) * 0.25; lentoV *= 0.9; lento += lentoV * 0.05; lento *= 0.995;
    }
    let f0 = f0b * st2f(T.st[n]) * (1 + jit * lento * 4);
    if (trem) f0 *= 1 + trem[1] * Math.sin(2 * Math.PI * trem[0] * tt);
    if (tremE) f0 *= 1 + tremE[1] * Math.sin(2 * Math.PI * tremE[0] * tt);
    let noChoro = false;
    for (const [a, b] of choroSegs) if (tt >= a && tt < b) { noChoro = true; break; }
    if (noChoro) f0 *= 1 + 0.035 * Math.sin(2 * Math.PI * 6.5 * tt);
    fase += f0 / sr;
    if (fase > 1) fase -= 1;
    // fonte: soma de harmônicos por recorrência de Chebyshev, com rolagem suave perto de Nyquist
    const th = 2 * Math.PI * fase;
    const s1 = Math.sin(th), c2 = 2 * Math.cos(th);
    let sk = s1, sp = 0, src = s1 * w[1];
    const lim = 0.46 * sr;
    for (let k = 2; k <= KMAX; k++) {
      const sn = c2 * sk - sp; sp = sk; sk = sn;
      const fk = k * f0;
      if (fk > lim) break;
      const rol = Math.min(1, (lim - fk) / (0.05 * sr));
      src += sn * w[k] * rol;
    }
    src *= 0.55;
    if (asper > 0) src *= 1 + asper * (0.7 * Math.sin(th * 0.5) + 0.3 * (r() * 2 - 1));
    const ruido = r() * 2 - 1;
    const av = T.av[n];
    const exc = src * av * (1 - sopro * 0.5) + ruido * (T.asp[n] * 0.9 + sopro * av * 0.45);
    // banco de formantes em paralelo, com o murmúrio nasal
    const nas = T.nasal[n];
    let y = 0;
    for (let i = 0; i < 4; i++) {
      const c = cf[i], z = fz[i];
      const v = c.b0 * exc - c.a1 * z[0] - c.a2 * z[1];
      z[1] = z[0]; z[0] = v;
      y += v * ganhos[i] * (i < 3 ? (1 - 0.8 * nas) : 1);
    }
    {
      const z = fz[4];
      const v = cn.b0 * exc - cn.a1 * z[0] - cn.a2 * z[1];
      z[1] = z[0]; z[0] = v;
      y += v * nas * 1.1;
    }
    // fricção
    const ruido2 = r() * 2 - 1;
    const fr = cb.b0 * ruido2 + cb.b2 * bx2 - cb.a1 * by1 - cb.a2 * by2;
    bx2 = bx1; bx1 = ruido2; by2 = by1; by1 = fr;
    y += fr * frcS[n] * 0.9;
    // bloqueio de DC
    dc += (y - dc) * 0.004;
    out[n] = y - dc;
  }
  // nível: RMS dos trechos com som ≈ -18 dBFS, pico até 0,95; bordas com rampa de 3 ms
  let acc = 0, cnt = 0;
  for (let n = 0; n < N; n++) { if (Math.abs(out[n]) > 1e-4) { acc += out[n] * out[n]; cnt++; } }
  const rms = Math.sqrt(acc / Math.max(1, cnt));
  let g = 0.126 / Math.max(rms, 1e-6);
  let pk = 0;
  for (let n = 0; n < N; n++) pk = Math.max(pk, Math.abs(out[n] * g));
  if (pk > 0.95) g *= 0.95 / pk;
  const rampa = Math.round(0.003 * sr);
  for (let n = 0; n < N; n++) {
    let e = 1;
    if (n < rampa) e = n / rampa; else if (n > N - rampa) e = (N - n) / rampa;
    out[n] *= g * e;
  }
  return { amostras: out, taxa: sr, duracao: N / sr, boca: calcularBoca(out, segs, sr), texto: plano.texto, plano };
}

// Envelope da boca por quadro: abertura 0..1 (RMS do quadro, normalizado, ataque rápido e soltura de ~60 ms)
// e a forma da boca do fonema no meio do quadro: X repouso, M fechada, A aberta, E média, I estreita, O redonda, F dentes no lábio
export function calcularBoca(amostras, segs, sr, fps = FPS_BOCA) {
  const nq = Math.ceil(amostras.length / sr * fps);
  const amp = new Float32Array(nq);
  const forma = [];
  const h = sr / fps;
  for (let q = 0; q < nq; q++) {
    const a = Math.floor(q * h), b = Math.min(amostras.length, Math.floor((q + 1) * h));
    let s = 0;
    for (let n = a; n < b; n++) s += amostras[n] * amostras[n];
    amp[q] = Math.sqrt(s / Math.max(1, b - a));
    const tc = (q + 0.5) / fps;
    const seg = segs.find((g) => tc >= g.t0 && tc < g.t1);
    forma.push(seg && seg.fon !== '_' ? seg.boca || 'E' : 'X');
  }
  const ord = Array.from(amp).filter((v) => v > 1e-4).sort((x, y) => x - y);
  const ref = ord.length ? ord[Math.floor(ord.length * 0.95)] : 1;
  const sol = Math.exp(-1 / (0.06 * fps));
  let ant = 0;
  const out = [];
  for (let q = 0; q < nq; q++) {
    let v = Math.min(1, Math.pow(amp[q] / ref, 0.7));
    if (v < 0.04) v = 0;
    ant = v > ant ? v : ant * sol + v * (1 - sol);
    out.push(Math.round(ant * 100) / 100);
    if (forma[q] === 'X' && ant > 0.15) forma[q] = 'E';
  }
  return { fps, amp: out, forma: forma.join('') };
}

export function gerarFala(opts = {}, taxa = TAXA_PADRAO) {
  return sintetizar(criarFrase(opts), taxa);
}

// Lê a boca num instante t (s desde o começo da fala): abertura interpolada e forma do quadro
export function bocaNoInstante(boca, t) {
  const q = t * boca.fps;
  if (q < 0 || q >= boca.amp.length) return { abertura: 0, forma: 'X' };
  const i = Math.floor(q), u = q - i;
  const a = boca.amp[i], b = boca.amp[Math.min(i + 1, boca.amp.length - 1)];
  return { abertura: a + (b - a) * u, forma: boca.forma[i] || 'X' };
}

// Fala ao vivo com Web Audio. Devolve a fonte, o horário de início e bocaAgora() para cada quadro do jogo.
export function falar(ctx, opts = {}, destino = null, { volume = 1, quando = 0 } = {}) {
  const f = gerarFala(opts, ctx.sampleRate);
  const buf = ctx.createBuffer(1, f.amostras.length, ctx.sampleRate);
  buf.copyToChannel(f.amostras, 0);
  const fonte = ctx.createBufferSource();
  fonte.buffer = buf;
  const ganho = ctx.createGain();
  ganho.gain.value = volume;
  fonte.connect(ganho).connect(destino || ctx.destination);
  const inicio = Math.max(ctx.currentTime, quando) + 0.01;
  fonte.start(inicio);
  return {
    fonte, ganho, inicio, duracao: f.duracao, boca: f.boca, texto: f.texto,
    bocaAgora: () => bocaNoInstante(f.boca, ctx.currentTime - inicio),
    parar: () => { try { fonte.stop(); } catch (e) { /* já parou */ } },
  };
}
