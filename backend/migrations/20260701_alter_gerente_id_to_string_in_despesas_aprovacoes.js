exports.up = function(knex) {
  return knex.schema.alterTable('despesas_aprovacoes', function(table) {
    table.string('gerente_id').alter();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('despesas_aprovacoes', function(table) {
    table.integer('gerente_id').unsigned().alter();
  });
};
