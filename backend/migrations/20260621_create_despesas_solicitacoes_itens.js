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
    })
    .then(async () => {
      // Seed default users for both 001 and default CNPJ JDS
      const defaultUsers = [
        // Company 001
        { id: 'admin', username: 'admin', password: '123', name: 'Admin Geral', profile: 'Administrador', unitId: 'all', status: 'LIBERADO', empresa_id: '001', permissions: '["Dashboard","Clientes","Produtos","Estoque","Financeiro","Solicitação de Saldo","Aprovação de Saldo","Despesas","Aprovação de Despesas","Relatórios","Usuários","Configurações","Administrador"]' },
        { id: 'supervisor', username: 'supervisor', password: '123', name: 'Sup. Carlos', profile: 'Supervisor', unitId: '1', status: 'LIBERADO', empresa_id: '001', permissions: '["Dashboard","Clientes","Solicitação de Saldo","Aprovação de Saldo","Despesas","Relatórios"]' },
        { id: 'financeiro', username: 'financeiro', password: '123', name: 'Fin. Ana', profile: 'Financeiro', unitId: 'all', status: 'LIBERADO', empresa_id: '001', permissions: '["Dashboard","Financeiro","Solicitação de Saldo","Aprovação de Saldo","Despesas","Aprovação de Despesas","Relatórios"]' },
        { id: 'conferente', username: 'conferente', password: '123', name: 'Conf. João', profile: 'Conferente', unitId: '1', status: 'LIBERADO', empresa_id: '001', permissions: '["Dashboard","Produtos","Estoque"]' },
        { id: 'resp_eq', username: 'resp_eq', password: '123', name: 'Resp. Roberto', profile: 'Responsável Equipamentos', unitId: '2', status: 'LIBERADO', empresa_id: '001', permissions: '["Dashboard","Produtos","Estoque"]' },
        { id: 'mecanico', username: 'mecanico', password: '123', name: 'Mec. Marcelo', profile: 'Mecânico', unitId: '1', status: 'LIBERADO', empresa_id: '001', permissions: '["Dashboard","Produtos"]' },
        { id: 'vendedor1', username: 'vendedor1', password: '123', name: 'Carlos Silva', profile: 'Vendedor', unitId: '1', status: 'LIBERADO', empresa_id: '001', permissions: '["Dashboard","Clientes","Solicitação de Saldo","Despesas"]' },
        { id: 'vendedor2', username: 'vendedor2', password: '123', name: 'Ana Julia Reis', profile: 'Vendedor', unitId: '2', status: 'LIBERADO', empresa_id: '001', permissions: '["Dashboard","Clientes","Solicitação de Saldo","Despesas"]' },
        { id: 'vendedor3', username: 'vendedor3', password: '123', name: 'Marcos Silveira', profile: 'Vendedor', unitId: '1', status: 'LIBERADO', empresa_id: '001', permissions: '["Dashboard","Clientes","Solicitação de Saldo","Despesas"]' },

        // Company 12.345.678/0001-90 (JDS default)
        { id: 'admin_jds', username: 'admin', password: '123', name: 'Admin Geral', profile: 'Administrador', unitId: 'all', status: 'LIBERADO', empresa_id: '12.345.678/0001-90', permissions: '["Dashboard","Clientes","Produtos","Estoque","Financeiro","Solicitação de Saldo","Aprovação de Saldo","Despesas","Aprovação de Despesas","Relatórios","Usuários","Configurações","Administrador"]' },
        { id: 'supervisor_jds', username: 'supervisor', password: '123', name: 'Sup. Carlos', profile: 'Supervisor', unitId: '1', status: 'LIBERADO', empresa_id: '12.345.678/0001-90', permissions: '["Dashboard","Clientes","Solicitação de Saldo","Aprovação de Saldo","Despesas","Relatórios"]' },
        { id: 'financeiro_jds', username: 'financeiro', password: '123', name: 'Fin. Ana', profile: 'Financeiro', unitId: 'all', status: 'LIBERADO', empresa_id: '12.345.678/0001-90', permissions: '["Dashboard","Financeiro","Solicitação de Saldo","Aprovação de Saldo","Despesas","Aprovação de Despesas","Relatórios"]' },
        { id: 'conferente_jds', username: 'conferente', password: '123', name: 'Conf. João', profile: 'Conferente', unitId: '1', status: 'LIBERADO', empresa_id: '12.345.678/0001-90', permissions: '["Dashboard","Produtos","Estoque"]' },
        { id: 'resp_eq_jds', username: 'resp_eq', password: '123', name: 'Resp. Roberto', profile: 'Responsável Equipamentos', unitId: '2', status: 'LIBERADO', empresa_id: '12.345.678/0001-90', permissions: '["Dashboard","Produtos","Estoque"]' },
        { id: 'mecanico_jds', username: 'mecanico', password: '123', name: 'Mec. Marcelo', profile: 'Mecânico', unitId: '1', status: 'LIBERADO', empresa_id: '12.345.678/0001-90', permissions: '["Dashboard","Produtos"]' },
        { id: 'vendedor1_jds', username: 'vendedor1', password: '123', name: 'Carlos Silva', profile: 'Vendedor', unitId: '1', status: 'LIBERADO', empresa_id: '12.345.678/0001-90', permissions: '["Dashboard","Clientes","Solicitação de Saldo","Despesas"]' },
        { id: 'vendedor2_jds', username: 'vendedor2', password: '123', name: 'Ana Julia Reis', profile: 'Vendedor', unitId: '2', status: 'LIBERADO', empresa_id: '12.345.678/0001-90', permissions: '["Dashboard","Clientes","Solicitação de Saldo","Despesas"]' },
        { id: 'vendedor3_jds', username: 'vendedor3', password: '123', name: 'Marcos Silveira', profile: 'Vendedor', unitId: '1', status: 'LIBERADO', empresa_id: '12.345.678/0001-90', permissions: '["Dashboard","Clientes","Solicitação de Saldo","Despesas"]' }
      ];
      await knex('usuarios').insert(defaultUsers);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('auditoria_logs')
    .dropTableIfExists('despesas_solicitacoes_itens')
    .dropTableIfExists('usuarios');
};
