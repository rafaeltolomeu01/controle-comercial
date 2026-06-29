// Knex migration: create despesas_itens_extras table

exports.up = function(knex) {
  return knex.schema.createTable('despesas_itens_extras', function(table) {
    table.increments('id').primary();
    table.integer('solicitacao_id').unsigned().notNullable().references('id').inTable('despesas_solicitacoes').onDelete('CASCADE');
    table.decimal('valor', 10, 2).notNullable().defaultTo(0);
    table.string('descricao').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('despesas_itens_extras');
};
