exports.up = function(knex) {
  return knex.schema.createTable('equipamentos_patrimonio', function(table) {
    table.string('patrimonio').primary();
    table.string('empresa').notNullable();
    table.string('modelo').notNullable();
    table.string('voltagem').notNullable(); // 110 ou 220
    table.string('cliente_atual_id');
    table.string('cliente_atual_nome');
    table.string('cliente_atual_cidade');
    table.string('cliente_atual_endereco');
    table.string('status').notNullable().defaultTo('Disponível');
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('equipamentos_patrimonio');
};
