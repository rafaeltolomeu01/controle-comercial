exports.up = async function(knex) {
  if (!await knex.schema.hasTable('clientes')) return;
  if (!await knex.schema.hasColumn('clientes', 'empresa_id')) {
    await knex.schema.table('clientes', table => {
      // Nullable para preservar registros antigos. O escopo legado pode ser
      // resolvido pelo usuario dono, sem atribuir empresas por suposicao.
      table.string('empresa_id').nullable().index();
    });
  }
};

exports.down = async function() {
  // Sem rollback destrutivo: remover a coluna poderia perder a vinculacao de tenant.
};
