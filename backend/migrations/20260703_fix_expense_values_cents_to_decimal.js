exports.up = async function(knex) {
  const rows = await knex('despesas_reembolsos').select('id', 'value');
  for (const row of rows) {
    if (row.value !== null && row.value !== undefined) {
      const val = Number(row.value);
      // Se for um valor inteiro maior ou igual a 1000, interpretamos como centavos e dividimos por 100
      if (Number.isInteger(val) && val >= 1000) {
        await knex('despesas_reembolsos')
          .where('id', row.id)
          .update({ value: val / 100 });
      }
    }
  }
};

exports.down = function(knex) {
  return Promise.resolve();
};
