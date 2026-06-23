exports.up = function(knex) {
  return knex.schema.createTable('despesas_solicitacoes', function(table) {
    table.increments('id').primary();
    table.string('empresa_id').notNullable();
    table.string('solicitante').notNullable();
    table.text('justificativa').notNullable();
    table.date('data_solicitacao').notNullable();
    table.time('hora_solicitacao').notNullable();
    table.string('usuario_id').notNullable();
    table.enu('status', ['Pendente', 'Aprovada', 'Rejeitada', 'Aprovada (não valor total)']).notNullable().defaultTo('Pendente');
    table.decimal('valor_hotel_alim', 10, 2).notNullable().defaultTo(0);
    table.decimal('valor_abastecimento', 10, 2).notNullable().defaultTo(0);
    table.string('rota_destino').notNullable();
    table.string('placa_veiculo').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('despesas_solicitacoes');
};
