exports.up = async function(knex) {
  if (!await knex.schema.hasTable('usuarios')) {
    await knex.schema.createTable('usuarios', function(table) {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('username').notNullable();
      table.string('password').notNullable();
      table.string('profile').notNullable();
      table.string('unitId').notNullable();
      table.string('status').notNullable().defaultTo('AGUARDANDO LIBERACAO');
      table.string('empresa_id').notNullable();
      table.text('permissions').notNullable().defaultTo('[]');
      table.timestamps(true, true);
      table.unique(['username', 'empresa_id']);
    });
  }

  if (!await knex.schema.hasTable('despesas_solicitacoes_itens')) {
    await knex.schema.createTable('despesas_solicitacoes_itens', function(table) {
      table.increments('id').primary();
      table.integer('solicitacao_id').unsigned().notNullable().references('id').inTable('despesas_solicitacoes').onDelete('CASCADE');
      table.string('categoria').notNullable();
      table.decimal('valor_solicitado', 10, 2).notNullable();
      table.integer('quantidade_solicitada').nullable();
      table.decimal('valor_aprovado', 10, 2).nullable();
      table.integer('quantidade_aprovada').nullable();
      table.string('status').notNullable().defaultTo('pendente');
      table.text('justificativa').nullable();
      table.date('data_aprovacao').nullable();
      table.string('usuario_aprovador').nullable();
      table.timestamps(true, true);
    });
  }

  if (!await knex.schema.hasTable('auditoria_logs')) {
    await knex.schema.createTable('auditoria_logs', function(table) {
      table.increments('id').primary();
      table.string('usuario_id').nullable();
      table.string('acao').notNullable();
      table.text('detalhes').notNullable();
      table.string('empresa_id').notNullable();
      table.timestamps(true, true);
    });
  }
};

exports.down = async function() {
  // Rollback deliberadamente nao destrutivo para preservar usuarios, despesas e auditoria.
};
