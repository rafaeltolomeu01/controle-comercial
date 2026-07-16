exports.up = async function(knex) {
  if (!await knex.schema.hasTable('despesas_solicitacoes')) return;
  if (!await knex.schema.hasColumn('despesas_solicitacoes', 'unitId')) {
    await knex.schema.table('despesas_solicitacoes', table => {
      table.string('unitId').nullable().index();
    });

    // Preserva os registros existentes, usando a unidade atual do solicitante.
    // Registros sem usuario vinculado permanecem nulos, sem inventar uma unidade.
    if (knex.client.config.client === 'pg') {
      await knex.raw(`
        UPDATE despesas_solicitacoes AS ds
        SET "unitId" = u."unitId"
        FROM usuarios AS u
        WHERE ds.usuario_id = u.id AND ds."unitId" IS NULL
      `);
    } else {
      await knex.raw(`
        UPDATE despesas_solicitacoes
        SET unitId = (SELECT unitId FROM usuarios WHERE usuarios.id = despesas_solicitacoes.usuario_id)
        WHERE unitId IS NULL
      `);
    }
  }
};

exports.down = async function() {
  // Sem rollback destrutivo: a unidade faz parte do historico financeiro.
};
