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
const mediaPreserver = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'preservacao-fotos-edicao-20260717.js'),
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

test('administrador pode corrigir despesa alheia mantendo empresa, status e auditoria', () => {
  const routeStart = server.indexOf("app.put('/api/despesas-reembolsos/:id/correct'");
  const routeEnd = server.indexOf("app.put('/api/despesas-reembolsos/:id/approval'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /adminCorrection = isAdminUser\(req\.user\)/);
  assert.match(route, /empresa_id: req\.user\.empresa_id/);
  assert.match(route, /status: record\.status/);
  assert.match(route, /if \(!adminCorrection\) correctionQuery\.andWhere\(\{ userId: req\.user\.id \}\)/);
  assert.match(route, /ADMIN_CORRIGIU_DESPESA/);
  assert.match(compatibility, /canCorrectExpense/);
});

test('envio de movimentacao aguarda upload e nao falha por erro de notificacao', () => {
  const appClient = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
  assert.match(appClient, /_ccUploadPromise/);
  assert.match(appClient, /await el\._ccUploadPromise/);
  const routeStart = server.indexOf("app.post('/api/equipamentos/movimentacoes'");
  const routeEnd = server.indexOf("app.get('/api/equipamentos/movimentacoes'", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /Movimentação salva, mas a notificação não foi enviada/);
  assert.match(route, /res\.json\(\{ success: true, id: newId \}\)/);
  assert.match(compatibility, /if \(id === 'movement-form'\) return/);
  assert.match(appClient, /'movimentacoes'/);
});

test('aprovacao parcial usa valor efetivamente aprovado em listas e somatorios', () => {
  const appClient = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
  assert.match(server, /total_exibicao: isLiberado \? totalAprovado : totalGeral/);
  assert.match(appClient, /getEffectiveApprovedRequestTotal\(req\)/);
  assert.match(appClient, /item\?\.valor_aprovado \?\? item\?\.valorAprovado/);
  assert.match(appClient, /status\.includes\('reprov'\) \|\| status\.includes\('correc'\)/);
  assert.match(compatibility, /e\.total_liberado \?\? e\.totalAprovado/);
  assert.match(listUpdates, /Array\.isArray\(balance\?\.itens\)/);
  assert.match(listUpdates, /item\?\.valor_aprovado \?\? item\?\.valorAprovado/);
});

test('dono pode refazer despesa reprovada mantendo dados e fotos existentes', () => {
  const routeStart = server.indexOf("app.put('/api/despesas-reembolsos/:id/correct'");
  const routeEnd = server.indexOf("app.put('/api/despesas-reembolsos/:id/approval'", routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /correctionStatus\.includes\('reprov'\)/);
  assert.match(route, /foto_odometro: b\.foto_odometro !== undefined \? b\.foto_odometro : record\.foto_odometro/);
  assert.match(route, /foto_comprovante: b\.foto_comprovante !== undefined \? b\.foto_comprovante : record\.foto_comprovante/);
  assert.match(compatibility, /expenseStatus\.includes\('reprov'\) \? 'Refazer Despesa'/);
  assert.match(compatibility, /admin \|\| String\(exp && exp\.userId\) === String\(user\.id\)/);
  assert.match(compatibility, /expenseStatus\.includes\('correc'\) \|\| expenseStatus\.includes\('reprov'\)/);
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
  assert.match(listUpdates, /approvalSupervisorName/);
  assert.match(listUpdates, /approvalFilterSource/);
  assert.match(listUpdates, /approvalPendingRecords/);
  assert.match(listUpdates, /manager\.caches\[moduleKey\] = data/);
  assert.match(listUpdates, /dynamicCompanyName/);
  assert.match(listUpdates, /supervisor_id/);
  assert.match(listUpdates, /linkedUserIds/);
  assert.match(listUpdates, /selectedName && normalize\(value\) === selectedName/);
  assert.match(listUpdates, /refreshSortHeadersEverywhere/);
  assert.match(listUpdates, /key === 'date' \? 'desc' : 'asc'/);
  assert.match(listUpdates, /window\.addEventListener\('hashchange'.*refreshSortHeadersEverywhere/);
  assert.match(listUpdates, /FiltersManager\.filterData = function/);
  assert.match(listUpdates, /applySort\(baseFilterData/);
  assert.match(listUpdates, /aria-sort/);
});

test('rotina legada nao sobrescreve filtros dinamicos da fila de aprovacao', () => {
  const finalTextLists = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'correcao-final-textos-listas.js'), 'utf8');
  assert.match(finalTextLists, /FiltersManager\.__ccDynamicSort20260716\) return/);
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
  assert.match(route, /REMOVEU_SALDO_DIRETO/);
  assert.match(route, /signedAmount/);
  assert.match(route, /availableBalance/);
  assert.match(route, /forUpdate\(\)/);
  assert.match(listUpdates, /cc-direct-operation/);
  assert.match(listUpdates, /Remover saldo disponível/);
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
  assert.match(listUpdates, /max-height:calc\(100dvh - 24px\)/);
  assert.match(listUpdates, /overflow-y:auto/);
  assert.match(listUpdates, /syncDirectBalanceRoute/);
  assert.match(listUpdates, /window\.location\.hash !== '#despesas-dashboard'/);
  assert.match(listUpdates, /modal\.style\.display = 'none'/);
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
  assert.match(listUpdates, /'solicitante'/);
  assert.match(listUpdates, /sellerIds\.has\(recordOwnerId\(item\)\)/);
  assert.match(listUpdates, /vendedor: ''/);
  const dashboardPage = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'dashboard.html'), 'utf8');
  assert.match(dashboardPage, /dash-corrections-alert/);
  assert.match(dashboardPage, /dash-correction-expenses/);
  assert.match(dashboardPage, /dash-correction-clients/);
  assert.match(listUpdates, /correctionExpenses/);
  assert.match(listUpdates, /correctionClients/);
});

test('dossie visual exibe o motivo da troca usado no PDF', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
  assert.match(indexHtml, /dossie-sol-motivo-troca/);
  assert.match(appJs, /mov\.detalhe_troca_adicao \|\| mov\.motivo_troca/);
  assert.match(appJs, /exchangeReason\.textContent/);
});

test('tabela de saldos mantem selecao alinhada apos redesenhar as linhas', () => {
  assert.match(compatibility, /table\.classList\.add\('cc-bulk-table'\)/);
  assert.match(compatibility, /class="cc-bulk-cell"/);
  assert.match(compatibility, /class="cc-bulk-row"/);
  assert.equal(compatibility.includes('if (!tbody || tbody.dataset.bulkReady) return'), false);
});

test('filtro da aprovacao de saldo e reativado quando a guia e recriada', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
  assert.match(appJs, /dashboardFilterForm\.dataset\.filtersConfigured/);
  assert.match(appJs, /dashboardFilterForm\.addEventListener\('submit'/);
  assert.equal(appJs.includes('this.despesasFiltrosConfigured = true'), false);
});

test('botao de adicionar ou remover saldo reaparece depois do login', () => {
  assert.match(listUpdates, /existingButton = document\.getElementById\('cc-btn-direct-balance'\)/);
  assert.match(listUpdates, /if \(!canLaunchDirectBalance\(\)\)/);
  assert.match(listUpdates, /existingButton\?\.remove\(\)/);
  assert.match(listUpdates, /profile\.includes\('admin'\)/);
  assert.match(listUpdates, /existingButton\.parentElement !== tabs/);
  assert.match(listUpdates, /directBalanceBound/);
  assert.equal(listUpdates.includes('function installDirectBalanceCredit() {\n    if (!canLaunchDirectBalance()) return;'), false);
});

test('guias financeiras ficam abaixo da unidade e rolam no celular', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'main.css'), 'utf8');
  assert.match(css, /#view-despesas-dashboard > \.view-tabs/);
  assert.match(css, /flex-flow: row nowrap !important/);
  assert.match(css, /overflow-x: auto !important/);
  assert.match(css, /min-height: 76px !important/);
});

test('unidade global limita listas, filtros dinamicos e paginacao inclusive para administrador', () => {
  assert.match(listUpdates, /UNIT_SCOPED_MODULES/);
  assert.match(listUpdates, /scopeByGlobalUnit\(data, moduleKey\)/);
  assert.match(listUpdates, /const unitScopedData = scopeByGlobalUnit\(data, moduleKey\)/);
  assert.match(listUpdates, /rebuildCascadingFilters\(moduleKey, ''\)/);
  const visibilityStart = compatibility.indexOf('function visibilityFilter(moduleKey, list)');
  const visibilityEnd = compatibility.indexOf('function fullFilter(moduleKey, raw)', visibilityStart);
  const visibility = compatibility.slice(visibilityStart, visibilityEnd);
  assert.match(visibility, /activeUnitId && activeUnitId !== 'all'/);
  assert.equal(visibility.includes("!isAdminOrAllUnits(user) && activeUnitId !== 'all'"), false);
});

test('cartoes de despesas usam somente saldos e despesas aprovados do mesmo filtro', () => {
  assert.match(listUpdates, /const totalApproved = balances\.filter\(isApproved\)/);
  assert.match(listUpdates, /const totalSpent = expenses\.filter\(isApproved\)/);
  assert.match(listUpdates, /metric-balance-remaining/);
  assert.match(listUpdates, /totalApproved - totalSpent/);
});

test('painel de aprovacao zera graficos sem saldo correspondente e atualiza opcoes dinamicas', () => {
  assert.match(listUpdates, /refreshApprovalDashboardFromFilters/);
  assert.match(listUpdates, /renderApprovalFinanceCharts\(filteredBalances, expenses\)/);
  assert.match(listUpdates, /if \(filteredBalances\.length && matchingNames\.size\)/);
  assert.match(listUpdates, /statusSelect\.innerHTML/);
  assert.match(listUpdates, /statusCandidates/);
  assert.match(listUpdates, /availableDates/);
});

test('consultas operacionais enviam e aplicam a unidade global sem ampliar permissoes', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
  assert.match(appJs, /\/api\/equipamentos\/movimentacoes\$\{query\}/);
  assert.match(appJs, /\/api\/despesas-reembolsos\$\{query\}/);
  assert.match(appJs, /\/api\/despesas\$\{query\}/);
  const movementStart = server.indexOf("app.get('/api/equipamentos/movimentacoes'");
  const movementEnd = server.indexOf("app.put('/api/equipamentos/movimentacoes/:id'", movementStart);
  const movementRoute = server.slice(movementStart, movementEnd);
  assert.match(movementRoute, /requestedUnitId/);
  assert.match(movementRoute, /unitsByKey\.get\(normalizeRole\(row\.empresa\)\)/);
  assert.match(movementRoute, /unitId: inferredId/);
  assert.match(movementRoute, /enriched\.filter\(row => String\(row\.unitId/);
  const expenseStart = server.indexOf("app.get('/api/despesas-reembolsos'");
  const expenseEnd = server.indexOf("app.get('/api/despesas-reembolsos/:id'", expenseStart);
  const expenseRoute = server.slice(expenseStart, expenseEnd);
  assert.match(expenseRoute, /requestedUnitId/);
  assert.match(expenseRoute, /dr\.unitId/);
  assert.match(expenseRoute, /getPermittedSellerIds/);
});

test('movimentacoes antigas sao separadas pela empresa base sem regravar o banco', () => {
  const movementStart = server.indexOf("app.get('/api/equipamentos/movimentacoes'");
  const movementEnd = server.indexOf("app.put('/api/equipamentos/movimentacoes/:id'", movementStart);
  const route = server.slice(movementStart, movementEnd);
  assert.match(route, /db\('unidades'\).*select\('id', 'name'\)/s);
  assert.match(route, /const baseUnit = unitsByKey\.get\(normalizeRole\(row\.empresa\)\)/);
  assert.match(route, /responsibleUser\?\.unitId/);
  assert.equal(route.includes("update('equipamentos_movimentacoes'"), false);
});

test('painel pessoal usa somente usuario logado e nao desconta despesa pendente', () => {
  assert.match(listUpdates, /const own = list => .*belongsToUser/s);
  assert.match(listUpdates, /'userName', 'usuario_nome', 'name', 'nome'/);
  assert.match(listUpdates, /const approvedExpenses = expenses\.filter\(isApproved\)/);
  assert.match(listUpdates, /const spent = approvedExpenses/);
  assert.match(listUpdates, /set\('dash-pending-expenses', formatMoney\(approvedExpenses\)\)/);
  assert.match(listUpdates, /const pendingExpenses = expenses\.filter/);
});

test('html operacional permanece inerte e oculto ate a autenticacao', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
  assert.match(indexHtml, /id="app-container"[^>]*hidden inert aria-hidden="true"/);
  assert.match(appJs, /appContainer\.setAttribute\('inert', ''\)/);
  assert.match(appJs, /appContainer\.removeAttribute\('inert'\)/);
  assert.match(appJs, /appContainer\.hidden = false/);
});

test('edicao de cliente preserva fotos antigas salvo remocao explicita', () => {
  assert.match(mediaPreserver, /removeExisting === '1'/);
  assert.match(mediaPreserver, /Foto atual — será mantida se nenhuma nova for escolhida/);
  assert.match(mediaPreserver, /Remover foto atual/);
  assert.match(compatibility, /CCMediaPreserver\.clientValue\(old, map\[suffix\], input\)/);
  assert.match(compatibility, /CCMediaPreserver\.clientValue\(existingClient, field, input\)/);
});

test('edicao de despesa preserva comprovante e odometro antigos', () => {
  assert.match(mediaPreserver, /foto_comprovante/);
  assert.match(mediaPreserver, /foto_odometro/);
  assert.match(listUpdates, /expenseMedia\(original, 'foto_comprovante'/);
  assert.match(listUpdates, /expenseMedia\(original, 'foto_odometro'/);
  assert.match(listUpdates, /CCMediaPreserver\.renderExpensePhotos\(record\)/);
});

test('camada de midia reconhece nomes legados sem alterar o banco', () => {
  assert.match(mediaPreserver, /photoComprovante/);
  assert.match(mediaPreserver, /receiptPhoto/);
  assert.match(mediaPreserver, /photo_interna_01/);
  assert.match(mediaPreserver, /foto_rua_02/);
  assert.equal(mediaPreserver.includes("method: 'DELETE'"), false);
});

test('foto da troca de equipamento e opcional e continua sendo enviada quando escolhida', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
  const movementPage = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'movimentacao.html'), 'utf8');
  assert.match(appJs, /mov-foto-troca'\)\.removeAttribute\('required'\)/);
  assert.equal(appJs.includes("mov-foto-troca').setAttribute('required'"), false);
  assert.match(appJs, /if \(fTroca\)[\s\S]*uploadFile\(fTroca, 'mov-foto-troca'\)/);
  assert.match(movementPage, /Foto da Troca \(opcional\)/);
});

test('fotos antigas do banco sao carregadas com token e sem regravar dados', () => {
  assert.match(mediaPreserver, /\/api\\\/uploads\\\/UP-/);
  assert.match(mediaPreserver, /headers:authenticatedHeaders\(\)/);
  assert.match(mediaPreserver, /headers\.Authorization = `Bearer \$\{token\}`/);
  assert.match(mediaPreserver, /response\.blob\(\)/);
  assert.match(mediaPreserver, /URL\.createObjectURL\(blob\)/);
  assert.match(mediaPreserver, /MutationObserver/);
  assert.equal(mediaPreserver.includes("method:'POST'"), false);
  assert.equal(mediaPreserver.includes("method:'DELETE'"), false);
});
