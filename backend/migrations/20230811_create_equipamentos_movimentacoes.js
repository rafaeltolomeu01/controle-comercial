exports.up = function(knex) {
  return knex.schema.createTable('equipamentos_movimentacoes', function(table) {
    table.increments('id').primary();
    table.string('empresa').notNullable();
    table.string('tipo_solicitacao').notNullable(); // Troca, Adição, Recolha, Adesivar
    table.string('vendedor_solicitante').notNullable();
    table.string('vendedor_id').notNullable();
    table.string('cliente_codigo');
    table.string('cliente_nome').notNullable();
    table.string('cliente_cidade').notNullable();
    table.string('cliente_endereco').notNullable();
    table.string('cliente_vendedor').notNullable();
    table.string('status').notNullable().defaultTo('Pendente'); // Pendente, Aprovado, Reprovado
    table.text('motivo_reprovacao');
    table.text('observacao');
    
    // Campos específicos dinâmicos
    table.string('patrimonio');
    table.string('modelo');
    table.string('voltagem');
    table.string('patrimonio_novo');
    table.string('modelo_novo');
    table.string('voltagem_nova');
    table.integer('quantidade').defaultTo(1);
    table.text('detalhe_troca_adicao');
    table.text('motivo_recolhimento');
    
    // Links para mídias
    table.string('foto_equipamento_url');
    table.string('foto_antes_url');
    table.string('foto_depois_url');
    table.string('video_url');
    
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('equipamentos_movimentacoes');
};
