exports.up = async function up(knex) {
  const tableName = 'chamados_tecnicos';
  if (!(await knex.schema.hasTable(tableName))) return;

  const columns = {
    equipmentBrand: table => table.string('equipmentBrand').nullable(),
    openingEquipmentPhoto: table => table.string('openingEquipmentPhoto').nullable(),
    openedAt: table => table.timestamp('openedAt', { useTz: true }).nullable(),
    maintenanceStartedAt: table => table.timestamp('maintenanceStartedAt', { useTz: true }).nullable(),
    serviceDescription: table => table.text('serviceDescription').nullable(),
    fotoComplementar: table => table.string('fotoComplementar').nullable()
  };

  for (const [column, addColumn] of Object.entries(columns)) {
    if (!(await knex.schema.hasColumn(tableName, column))) {
      await knex.schema.table(tableName, addColumn);
    }
  }
};

// Migração deliberadamente não destrutiva: os campos ficam preservados em rollback.
exports.down = async function down() {};
