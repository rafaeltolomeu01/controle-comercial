exports.up = async function(knex) {
  // Intencionalmente nao altera dados. A regra anterior inferia que qualquer
  // inteiro >= 1000 estava em centavos e podia transformar R$ 1.000,00 em
  // R$ 10,00. Correcoes historicas exigem backup e IDs auditados explicitamente.
  return Promise.resolve();
};

exports.down = function(knex) {
  return Promise.resolve();
};
