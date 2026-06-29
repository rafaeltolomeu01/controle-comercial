const knex = require('knex');
const config = require('../knexfile');
const db = knex(config.development);

async function check() {
  try {
    const list = await db('usuarios').select('*');
    console.log('Registered Users inside SQLite:');
    console.log(list.map(u => ({ id: u.id, name: u.name, username: u.username, profile: u.profile, status: u.status, empresa_id: u.empresa_id })));

    const despesas = await db('despesas_solicitacoes').select('*');
    console.log('\nRegistered Despesas inside SQLite:');
    console.log(despesas);

    const itens = await db('despesas_solicitacoes_itens').select('*');
    console.log('\nRegistered Despesas Itens inside SQLite:');
    console.log(itens);
  } catch (e) {
    console.error(e);
  } finally {
    db.destroy();
  }
}
check();
