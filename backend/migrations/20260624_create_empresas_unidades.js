exports.up = async function(knex) {
  const hasEmpresas = await knex.schema.hasTable('empresas');
  if (!hasEmpresas) {
    await knex.schema.createTable('empresas', function(table) {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('cnpj').nullable();
      table.string('phone').nullable();
      table.string('email').nullable();
      table.timestamps(true, true);
    });
  }

  const hasUnidades = await knex.schema.hasTable('unidades');
  if (!hasUnidades) {
    await knex.schema.createTable('unidades', function(table) {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('empresa_id').notNullable();
      table.timestamps(true, true);
    });
  }
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('unidades')
    .dropTableIfExists('empresas');
};
