// Leva 7: objetos novos com as poses; bolsa bate na perna ao andar; sentado, o objeto fica no chão fora da cadeira. Sem erros.
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage({viewport:{width:1300,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8765/teste_local.html');
const espera = async () => { await p.waitForFunction(()=>/animações/.test(document.getElementById('bib-status').textContent),undefined,{timeout:240000}); await p.waitForTimeout(1200); };
const shot = async (n, ms=3000) => { await p.waitForTimeout(ms); console.log('foto', n, JSON.stringify(errs.slice(-2))); await p.locator('#palco').screenshot({path:`${process.argv[2]}/${n}.png`}); };
const escolhe = async (chave, rotulo) => { await p.click(`button[aria-controls="grade-${chave}"]`); await p.click(`#grade-${chave} button[title="${rotulo}"]`); };
const anim = async (k) => { await p.click(`button[data-k="${k}"]`); };
await espera();
await p.click('#sexo button[data-k="m"]'); await espera();
const dir = ["Bola de futebol","Bola de basquete","Bandeja com tampa","Caixas de presente","Paleta de pintor","Frigideira","Lanterna","Cartaz","Tablet","Jornal","Garrafa térmica","Ancinho","Guarda-chuva listrado"];
for (const r of dir) { await escolhe('roupa-mao_dir', r); await shot('l7_d_' + dir.indexOf(r), 2500); }
await escolhe('roupa-mao_dir', 'Nenhum');
const esq = ["Bolsa de alça dourada","Bolsa de academia","Pasta de couro","Maleta antiga","Mala rígida com frisos","Sacola de loja","Extintor","Estojo de violão","Caixa de ferramentas","Sacola de compras com pão"];
for (const r of esq) { await escolhe('roupa-mao_esq', r); await shot('l7_e_' + esq.indexOf(r), 2500); }
await escolhe('roupa-mao_esq', 'Bolsa de academia'); await anim('bib:resident.walk.normal');
for (let i = 0; i < 4; i++) await shot('l7_andando_' + i, i ? 300 : 3000);
await anim('bib:resident.sit.chair.idle'); await shot('l7_sentado', 3500);
await anim('bib:resident.run.normal'); await shot('l7_correndo', 3000);
console.log('erros', JSON.stringify(errs.slice(0,8))); await b.close();})();
