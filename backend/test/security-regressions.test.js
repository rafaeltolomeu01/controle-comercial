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
const balanceUnitMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20260716_add_expense_request_unit_scope.js'),
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

test('lancamento direto de saldo exige aprovador, usuario da mesma empresa e transacao auditada', () => {
  const routeStart = server.indexOf("app.post('/api/despesas/direct-credit'");
  const routeEnd = server.indexOf("app.get('/api/despesas'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /canLaunchDirectCredit/);
  assert.match(route, /empresa_id: req\.user\.empresa_id/);
  assert.match(route, /recipient_id/);
  assert.match(route, /recipient\.status/);
  assert.match(route, /db\.transaction/);
  assert.match(route, /LANCOU_SALDO_DIRETO/);
  assert.match(route, /status: 'Aprovada'/);
  assert.match(route, /direct-credit\/recipients/);
  assert.match(route, /select\('id', 'name', 'profile', 'unitId', 'status'\)/);
  assert.match(listUpdates, /cc-btn-direct-balance/);
  assert.match(listUpdates, /\/api\/despesas\/direct-credit/);
  assert.match(listUpdates, /cc-direct-profile/);
  assert.match(listUpdates, /renderDirectBalanceRecipients/);
});

test('cadastro oferece perfis motorista e ajudante com acesso inicial de despesas', () => {
  assert.match(server, /'Motorista': \['Dashboard','Despesas','Despesas de Campo','Solicitação de Saldo'\]/);
  assert.match(server, /'Ajudante de Motorista': \['Dashboard','Despesas','Despesas de Campo','Solicitação de Saldo'\]/);
  const usersPage = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'usuarios.html'), 'utf8');
  assert.match(usersPage, /option value="Motorista"/);
  assert.match(usersPage, /option value="Ajudante de Motorista"/);
});

test('resumo do saldo direto considera usuario, unidade e periodo sem misturar empresas', () => {
  const summaryStart = server.indexOf("app.get('/api/despesas/direct-credit/summary'");
  const summaryEnd = server.indexOf("app.get('/api/despesas'", summaryStart + 20);
  const summary = server.slice(summaryStart, summaryEnd);
  assert.match(summary, /canLaunchDirectCredit/);
  assert.match(summary, /unit_id/);
  assert.match(summary, /empresa_id: req\.user\.empresa_id/);
  assert.match(summary, /notes_total/);
  assert.match(summary, /pending_balance/);
  assert.match(summary, /suggested_credit/);
  assert.match(listUpdates, /cc-direct-summary/);
  assert.match(listUpdates, /data-use-direct-suggestion/);
  assert.match(listUpdates, /unit_id: unitSelect\.value/);
});

test('unidade do saldo e persistida com migracao aditiva e historico preservado', () => {
  assert.match(balanceUnitMigration, /hasColumn\('despesas_solicitacoes', 'unitId'\)/);
  assert.match(balanceUnitMigration, /table\.string\('unitId'\)\.nullable\(\)\.index\(\)/);
  assert.equal(balanceUnitMigration.includes('dropColumn'), false);
  const directStart = server.indexOf("app.post('/api/despesas/direct-credit'");
  const directEnd = server.indexOf("app.get('/api/despesas/direct-credit/recipients'", directStart);
  const direct = server.slice(directStart, directEnd);
  assert.match(direct, /db\('unidades'\)\.where\(\{ id: unitId, empresa_id: req\.user\.empresa_id \}\)/);
  assert.match(direct, /unitId: selectedUnit\.id/);
  const normalStart = server.indexOf("app.post('/api/despesas',");
  const normalEnd = server.indexOf("app.post('/api/despesas/direct-credit'", normalStart);
  const normalRequest = server.slice(normalStart, normalEnd);
  assert.match(normalRequest, /requestUnitId/);
  assert.match(normalRequest, /unitId: requestUnit\.id/);
});

test('painel pessoal e cartoes de despesas seguem o usuario e filtros locais', () => {
  assert.match(listUpdates, /updatePersonalDashboard/);
  assert.match(listUpdates, /belongsToUser/);
  assert.match(listUpdates, /updateExpenseCardsForLocalFilters/);
  assert.match(listUpdates, /FiltersManager\.getFilterValues\('despesas'\)/);
  assert.match(listUpdates, /metric-balance-available/);
});

test('dossie visual exibe o motivo da troca usado no PDF', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
  assert.match(indexHtml, /dossie-sol-motivo-troca/);
  assert.match(appJs, /mov\.detalhe_troca_adicao \|\| mov\.motivo_troca/);
  assert.match(appJs, /exchangeReason\.textContent/);
});
