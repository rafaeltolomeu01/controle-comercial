const knex = require('knex');
const config = require('../knexfile');
const db = knex(config.development);

async function check() {
  try {
    const list = await db('knex_migrations').select('*');
    console.log('Migrations in DB:', JSON.stringify(list, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await db.destroy();
  }
}
check();
