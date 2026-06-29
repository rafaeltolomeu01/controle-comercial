// backend/migrations/20230920_add_cliente_ficha_fields.js
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('clientes');
  if (!hasTable) {
    await knex.schema.createTable('clientes', function(table) {
      table.string('id').primary();
      table.string('name');
      table.string('cnpj');
      table.string('phone');
      table.string('email');
      table.string('unitId');
      table.string('userId');
      table.string('status');
      table.string('companyName');
      table.string('city');
      table.string('address');
    });
  }
  return knex.schema.alterTable('clientes', function(table) {
    table.date('data_cadastro').notNullable().defaultTo(knex.fn.now());
    table.date('data_aprovacao');
    table.string('aprovador');
    table.enu('status_final', ['Aprovado', 'Reprovado', 'Pendente']).defaultTo('Pendente');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('clientes');
};
