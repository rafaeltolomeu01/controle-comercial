exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('equipamentos_importados');
  if (!exists) {
    await knex.schema.createTable('equipamentos_importados', table => {
      table.increments('id').primary();
      table.string('empresa_id').notNullable().defaultTo('001');
      table.string('unitId').notNullable().defaultTo('all');
      table.string('codigo_equipamento').notNullable();
      table.string('nome_equipamento').notNullable();
      table.string('criado_por').nullable();
      table.string('atualizado_por').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['empresa_id', 'unitId', 'codigo_equipamento']);
    });
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('equipamentos_importados');
};
