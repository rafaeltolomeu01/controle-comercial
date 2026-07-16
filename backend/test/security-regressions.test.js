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
const listUpdates = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'atualizacoes-listas-20260716.js'),
  'utf8'
);
const compatibility = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'compatibilidade-consolidada.js'),
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

test('edicao de despesa pendente e bloqueada no servidor por dono, empresa e status', () => {
  const routeStart = server.indexOf("app.put('/api/despesas-reembolsos/:id',");
  const routeEnd = server.indexOf("app.put('/api/despesas-reembolsos/:id/correct'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /empresa_id: req\.user\.empresa_id/);
  assert.match(route, /String\(record\.userId\) !== String\(req\.user\.id\)/);
  assert.match(route, /record\.status !== 'Pendente'/);
  assert.match(route, /status: 'Pendente'/);
  assert.equal(route.includes("status: 'Aprovado'"), false);
});

test('acoes de despesa nao duplicam corrigir e oferecem editar ao dono enquanto pendente', () => {
  assert.match(compatibility, /cc-btn-corrigir-despesa/);
  assert.match(compatibility, /cc-btn-editar-despesa/);
  assert.match(compatibility, /App\.editPendingExpense/);
});

test('visualizador usa imagem original e oferece zoom, arraste e gesto de pinça', () => {
  assert.match(listUpdates, /cc-image-original/);
  assert.match(listUpdates, /data-action="plus"/);
  assert.match(listUpdates, /pointermove/);
  assert.match(listUpdates, /pinchStart/);
  assert.equal(listUpdates.includes('canvas.toDataURL'), false);
});

test('listas possuem filtros encadeados e ordenacao antes da paginacao', () => {
  assert.match(listUpdates, /rebuildCascadingFilters/);
  assert.match(listUpdates, /FiltersManager\.filterData = function/);
  assert.match(listUpdates, /applySort\(baseFilterData/);
  assert.match(listUpdates, /aria-sort/);
});

test('movimentacoes antigas usam escopo seguro por empresa sem depender de nome opcional', () => {
  const routeStart = server.indexOf("app.get('/api/equipamentos/movimentacoes'");
  const routeEnd = server.indexOf("app.put('/api/equipamentos/movimentacoes/:id'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /companyCandidates/);
  assert.match(route, /leftJoin\('usuarios as movement_seller'/);
  assert.match(route, /orWhere\('movement_seller\.empresa_id', req\.user\.empresa_id\)/);
  assert.equal(route.includes("where('equipamentos_movimentacoes.empresa', req.user.empresa_name)"), false);
});

test('lancamento direto de saldo exige aprovador, vendedor da mesma empresa e transacao auditada', () => {
  const routeStart = server.indexOf("app.post('/api/despesas/direct-credit'");
  const routeEnd = server.indexOf("app.get('/api/despesas'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /canLaunchDirectCredit/);
  assert.match(route, /empresa_id: req\.user\.empresa_id/);
  assert.match(route, /normalizeRole\(vendor\.profile/);
  assert.match(route, /db\.transaction/);
  assert.match(route, /LANCOU_SALDO_DIRETO/);
  assert.match(route, /status: 'Aprovada'/);
  assert.match(listUpdates, /cc-btn-direct-balance/);
  assert.match(listUpdates, /\/api\/despesas\/direct-credit/);
});
