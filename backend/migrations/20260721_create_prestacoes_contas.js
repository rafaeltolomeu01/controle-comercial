exports.up = async function(knex) {
  if (!await knex.schema.hasTable('prestacoes_contas')) {
    await knex.schema.createTable('prestacoes_contas', table => {
      table.increments('id').primary();
      table.string('empresa_id').notNullable().index();
      table.string('unit_id').notNullable().index();
      table.string('usuario_id').notNullable().index();
      table.date('periodo_inicio').notNullable();
      table.date('periodo_fim').notNullable();
      table.integer('versao').notNullable().defaultTo(1);
      table.decimal('saldo_calculado', 12, 2).notNullable().defaultTo(0);
      table.decimal('saldo_considerado', 12, 2).notNullable().defaultTo(0);
      table.decimal('despesas_aprovadas', 12, 2).notNullable().defaultTo(0);
      table.decimal('diferenca', 12, 2).notNullable().defaultTo(0);
      table.integer('despesas_nao_aprovadas_qtd').notNullable().defaultTo(0);
      table.decimal('despesas_nao_aprovadas_valor', 12, 2).notNullable().defaultTo(0);
      table.string('status').notNullable().defaultTo('Apurada');
      table.text('observacao').nullable();
      table.text('motivo_ajuste_saldo').nullable();
      table.text('snapshot_json').notNullable();
      table.string('criado_por').notNullable();
      table.timestamp('apurada_em').notNullable().defaultTo(knex.fn.now());
      table.timestamps(true, true);
      table.unique(['empresa_id', 'unit_id', 'usuario_id', 'periodo_inicio', 'periodo_fim', 'versao'], 'prestacoes_contas_periodo_versao_unico');
      table.index(['empresa_id', 'unit_id', 'usuario_id', 'periodo_inicio', 'periodo_fim'], 'prestacoes_contas_periodo_idx');
    });
  }

  if (!await knex.schema.hasTable('prestacoes_contas_itens')) {
    await knex.schema.createTable('prestacoes_contas_itens', table => {
      table.increments('id').primary();
      table.integer('prestacao_id').unsigned().notNullable()
        .references('id').inTable('prestacoes_contas').onDelete('CASCADE').index();
      table.string('tipo').notNullable().index();
      table.string('origem_tabela').notNullable();
      table.string('origem_id').notNullable();
      table.date('data_evento').nullable();
      table.time('hora_evento').nullable();
      table.string('descricao').notNullable();
      table.decimal('valor', 12, 2).notNullable().defaultTo(0);
      table.string('status').nullable();
      table.text('detalhes_json').notNullable().defaultTo('{}');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function() {
  // Rollback deliberadamente nao destrutivo: apuracoes financeiras sao historico de auditoria.
};
