exports.up = function(knex) {
  return knex.schema
    .createTable('usuarios', function(table) {
      table.string('id').primary();
      table.string('name').notNullable();
      table.string('username').notNullable();
      table.string('password').notNullable();
      table.string('profile').notNullable();
      table.string('unitId').notNullable();
      table.string('status').notNullable().defaultTo('AGUARDANDO LIBERAÇÃO');
      table.string('empresa_id').notNullable();
      table.text('permissions').notNullable().defaultTo('[]'); // JSON array
      table.timestamps(true, true);
      // Ensure username + company unique
      table.unique(['username', 'empresa_id']);
    })
    .createTable('despesas_solicitacoes_itens', function(table) {
      table.increments('id').primary();
      table.integer('solicitacao_id').unsigned().notNullable().references('id').inTable('despesas_solicitacoes').onDelete('CASCADE');
      table.string('categoria').notNullable();
      table.decimal('valor_solicitado', 10, 2).notNullable();
      table.integer('quantidade_solicitada').nullable();
      table.decimal('valor_aprovado', 10, 2).nullable();
      table.integer('quantidade_aprovada').nullable();
      table.string('status').notNullable().defaultTo('pendente'); // pendente, aprovado, aprovado parcialmente, reprovado
      table.text('justificativa').nullable();
      table.date('data_aprovacao').nullable();
      table.string('usuario_aprovador').nullable(); // Name or ID of the approver
      table.timestamps(true, true);
    })
    .createTable('auditoria_logs', function(table) {
      table.increments('id').primary();
      table.string('usuario_id').notNullable();
      table.string('acao').notNullable();
      table.text('detalhes').notNullable();
      table.string('empresa_id').notNullable();
      table.timestamps(true, true);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('auditoria_logs')
    .dropTableIfExists('despesas_solicitacoes_itens')
    .dropTableIfExists('usuarios');
};
