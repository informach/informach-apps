// A simulação não pode ler relógio nem sorteio do ambiente. Se algum código
// dela chamar um dos dois, o teste cai aqui em vez de passar por acaso.
const proibido = (nome: string) => () => {
  throw new Error(`${nome} não pode ser usado dentro da simulação`);
};

Math.random = proibido("Math.random");
Date.now = proibido("Date.now");
