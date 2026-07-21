exports.up = async function(knex) {
  if (!await knex.schema.hasTable('usuario_unidades')) {
    await knex.schema.createTable('usuario_unidades', table => {
      table.increments('id').primary();
      table.string('usuario_id').notNullable();
      table.string('empresa_id').notNullable();
      table.string('unidade_id').notNullable();
      table.timestamps(true, true);
      table.unique(['usuario_id', 'empresa_id', 'unidade_id']);
      table.index(['empresa_id', 'usuario_id']);
      table.index(['empresa_id', 'unidade_id']);
    });
  }

  if (await knex.schema.hasTable('equipamentos_movimentacoes')) {
    if (!await knex.schema.hasColumn('equipamentos_movimentacoes', 'empresa_id')) {
      await knex.schema.table('equipamentos_movimentacoes', table => {
        table.string('empresa_id').nullable().index();
      });
    }
    if (!await knex.schema.hasColumn('equipamentos_movimentacoes', 'unit_id')) {
      await knex.schema.table('equipamentos_movimentacoes', table => {
        table.string('unit_id').nullable().index();
      });
    }
  }

  if (await knex.schema.hasTable('historico_exclusoes') &&
      !await knex.schema.hasColumn('historico_exclusoes', 'empresa_id')) {
    await knex.schema.table('historico_exclusoes', table => {
      table.string('empresa_id').nullable().index();
    });
  }

  // Migra somente vinculos inequivocos. O campo legado permanece intacto.
  if (await knex.schema.hasTable('usuarios') && await knex.schema.hasTable('usuario_unidades')) {
    const users = await knex('usuarios').select('id', 'empresa_id', 'unitId');
    const rows = users
      .filter(user => user.unitId && String(user.unitId).toLowerCase() !== 'all')
      .map(user => ({
        usuario_id: String(user.id),
        empresa_id: String(user.empresa_id || '001'),
        unidade_id: String(user.unitId),
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      }));
    for (const row of rows) {
      const exists = await knex('usuario_unidades').where({
        usuario_id: row.usuario_id,
        empresa_id: row.empresa_id,
        unidade_id: row.unidade_id
      }).first();
      if (!exists) await knex('usuario_unidades').insert(row);
    }
  }
};

exports.down = async function(knex) {
  // Reversao deliberadamente conservadora: remove apenas estruturas novas.
  if (await knex.schema.hasTable('historico_exclusoes') &&
      await knex.schema.hasColumn('historico_exclusoes', 'empresa_id')) {
    await knex.schema.table('historico_exclusoes', table => table.dropColumn('empresa_id'));
  }
  if (await knex.schema.hasTable('equipamentos_movimentacoes')) {
    if (await knex.schema.hasColumn('equipamentos_movimentacoes', 'unit_id')) {
      await knex.schema.table('equipamentos_movimentacoes', table => table.dropColumn('unit_id'));
    }
    if (await knex.schema.hasColumn('equipamentos_movimentacoes', 'empresa_id')) {
      await knex.schema.table('equipamentos_movimentacoes', table => table.dropColumn('empresa_id'));
    }
  }
  await knex.schema.dropTableIfExists('usuario_unidades');
};
