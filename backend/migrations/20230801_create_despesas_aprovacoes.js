// Knex migration: create despesas_aprovacoes table

exports.up = function(knex) {
  return knex.schema.createTable('despesas_aprovacoes', function(table) {
    table.increments('id').primary();
    table.integer('solicitacao_id').unsigned().notNullable().references('id').inTable('despesas_solicitacoes').onDelete('CASCADE');
    table.integer('gerente_id').unsigned().notNullable(); // user id of approver
    table.date('data_aprovacao').notNullable();
    table.time('hora_aprovacao').notNullable();
    table.text('observacao');
    table.string('status').notNullable(); // aprovado ou rejeitado
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('despesas_aprovacoes');
};
