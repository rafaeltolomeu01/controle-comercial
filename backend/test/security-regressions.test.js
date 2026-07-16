const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverPath = path.join(__dirname, '..', 'src', 'index.js');
const server = fs.readFileSync(serverPath, 'utf8');
const moneyMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20260703_fix_expense_values_cents_to_decimal.js'),
  'utf8'
);

test('nao contem credencial administrativa padrao', () => {
  assert.equal(server.includes("password: '123456'"), false);
  assert.equal(server.includes("|| 'secret-key-controle-comercial'"), false);
});

test('login usa bcrypt e migracao gradual da senha', () => {
  assert.match(server, /bcrypt\.compare/);
  assert.match(server, /bcrypt\.hash/);
  assert.equal(server.includes('.andWhere({ password })'), false);
});

test('servidor nao publica a raiz inteira do projeto', () => {
  assert.equal(server.includes('express.static(FRONTEND_ROOT'), false);
  assert.match(server, /express\.static\(path\.join\(FRONTEND_ROOT, 'css'\)/);
});

test('diagnostico fica depois da autenticacao e nao retorna despesas', () => {
  const authIndex = server.indexOf('// Real JWT Authentication Middleware');
  const diagIndex = server.indexOf("app.get('/api/system-diag'");
  assert.ok(authIndex >= 0 && diagIndex > authIndex);
  const diagBlock = server.slice(diagIndex, diagIndex + 700);
  assert.equal(diagBlock.includes('sampleDespesas'), false);
});

test('nao existe conversao automatica heuristica de valores', () => {
  assert.equal(server.includes('value: val / 100'), false);
  assert.equal(moneyMigration.includes('.update({ value:'), false);
});

test('uploads de banco usam escopo da empresa', () => {
  assert.match(server, /id: req\.params\.id, empresa_id: req\.user\.empresa_id/);
  assert.match(server, /empresa_id: req\.user\.empresa_id[\s\S]{0,180}whereIn\('id', cleanIds\)/);
});
