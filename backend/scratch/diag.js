const knex = require('knex');
const config = require('../knexfile');
const db = knex(process.env.NODE_ENV === 'production' ? config.production : config.development);

async function diag() {
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'DEFINED' : 'UNDEFINED');
  console.log('Using config:', process.env.NODE_ENV === 'production' ? 'production' : 'development');
  try {
    const count = await db('despesas_reembolsos').count('* as cnt');
    console.log('Count despesas:', count[0].cnt);
    const sample = await db('despesas_reembolsos').select('id', 'value', 'finalidade', 'date', 'status').limit(5);
    console.log('Sample rows:', JSON.stringify(sample, null, 2));
  } catch (err) {
    console.error('Error querying:', err);
  } finally {
    await db.destroy();
  }
}
diag();
