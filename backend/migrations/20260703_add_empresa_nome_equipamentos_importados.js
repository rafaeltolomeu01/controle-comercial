exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('equipamentos_importados');
  if (exists && !await knex.schema.hasColumn('equipamentos_importados', 'empresa_nome')) {
    await knex.schema.table('equipamentos_importados', table => {
      table.string('empresa_nome').nullable();
    });
  }
};

exports.down = async function(knex) {
  const exists = await knex.schema.hasTable('equipamentos_importados');
  if (exists && await knex.schema.hasColumn('equipamentos_importados', 'empresa_nome')) {
    await knex.schema.table('equipamentos_importados', table => {
      table.dropColumn('empresa_nome');
    });
  }
};
