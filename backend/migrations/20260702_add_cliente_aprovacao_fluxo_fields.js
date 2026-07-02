exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('clientes');
  if (!hasTable) return;

  const columns = {
    motivo_reprovacao: table => table.text('motivo_reprovacao').nullable(),
    data_reprovacao: table => table.timestamp('data_reprovacao').nullable(),
    data_reenvio: table => table.timestamp('data_reenvio').nullable(),
    correction_resubmitted_by: table => table.string('correction_resubmitted_by').nullable()
  };

  for (const [name, addColumn] of Object.entries(columns)) {
    const exists = await knex.schema.hasColumn('clientes', name);
    if (!exists) await knex.schema.table('clientes', table => addColumn(table));
  }
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('clientes');
  if (!hasTable) return;

  const columns = ['motivo_reprovacao', 'data_reprovacao', 'data_reenvio', 'correction_resubmitted_by'];
  for (const name of columns) {
    const exists = await knex.schema.hasColumn('clientes', name);
    if (exists) await knex.schema.table('clientes', table => table.dropColumn(name));
  }
};
