const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cwd = process.cwd();
const root = fs.existsSync(path.join(cwd, 'js')) ? cwd : path.resolve(cwd, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function loadMaintenanceHelpers() {
  const document = {
    getElementById: () => null,
    createElement: () => ({ id: '', style: {}, textContent: '' }),
    addEventListener: () => {},
    head: { appendChild: () => {} }
  };
  const sandbox = { console, document, Intl, Date, setTimeout, clearTimeout, addEventListener: () => {} };
  sandbox.window = sandbox;
  vm.runInNewContext(read('js/amaretto-manutencao-20261104.js'), sandbox, { filename: 'amaretto-manutencao-20261104.js' });
  return sandbox.AmarettoMaintenance;
}

test('tempo de espera usa timestamps persistidos e não arredonda dias para cima', () => {
  const helpers = loadMaintenanceHelpers();
  assert.equal(helpers.waitingTime({
    openedAt: '2026-11-01T12:00:00.000Z',
    maintenanceStartedAt: '2026-11-04T15:30:00.000Z'
  }), '3 dias e 3h');
  assert.equal(helpers.waitingTime({ openedAt: '2026-11-01T12:00:00.000Z' }), 'Aguardando início');
  assert.equal(helpers.waitingTime({
    openedAt: '2026-11-04T12:00:00.000Z',
    maintenanceStartedAt: '2026-11-03T12:00:00.000Z'
  }), 'Não disponível');
});

test('formulário novo remove entradas redundantes sem excluir suporte histórico', () => {
  const html = read('index.html');
  const page = read('pages/chamados.html');
  assert.match(html, /id="ticket-service-description"/);
  assert.doesNotMatch(html, /id="ticket-parts-container"/);
  assert.doesNotMatch(html, /id="ticket-services-container"/);
  assert.doesNotMatch(html, /id="ticket-video"/);
  assert.match(page, /id="ticket-open-brand"[^>]*required/);
  assert.match(page, /Foto do Equipamento Completo \*/);
  assert.match(page, /id="ticket-open-photo-defect-1"[^>]*required/);
  assert.match(page, /id="ticket-open-photo-defect-2"[^>]*required/);
  assert.doesNotMatch(page, /id="ticket-open-video-defect"/);
  assert.match(page, /capture="environment"/);
  assert.match(html, /Enviar Finalização da Manutenção/);
});

test('backend exige os novos dados e preserva estruturas históricas', () => {
  const server = read('backend/src/index.js');
  const migration = read('backend/migrations/20261104_add_chamados_manutencao_fields.js');
  assert.match(server, /A marca da geladeira\/freezer é obrigatória/);
  assert.match(server, /A foto do equipamento completo é obrigatória/);
  assert.match(server, /As duas fotos do defeito são obrigatórias/);
  assert.match(migration, /defectPhoto2/);
  assert.match(server, /A descrição do serviço realizado é obrigatória/);
  assert.match(server, /if \(!chamado\.maintenanceStartedAt\)/);
  assert.match(server, /maintenanceStartedAt: chamado\.maintenanceStartedAt \|\| finalizedAt\.toISOString\(\)/);
  assert.match(server, /endTime: b\.endTime \|\| chamado\.endTime \|\| finalizedTime/);
  assert.match(server, /solutionDescription: serviceDescription/);
  assert.doesNotMatch(migration, /dropColumn|dropTable|\.delete\(|\.del\(/);
});

test('lista desktop usa tabela completa e status de manutenção', () => {
  const maintenance = read('js/amaretto-manutencao-20261104.js');
  const compatibility = read('js/compatibilidade-consolidada.js');
  const store = read('js/store.js');
  assert.match(maintenance, /@media\(min-width:901px\)/);
  assert.match(maintenance, /table-layout:fixed!important/);
  assert.match(maintenance, /Em manutenção/);
  assert.match(maintenance, /renderTickets \}/);
  assert.match(maintenance, /App\.showTicketDetails\('\$\{esc\(ticket\.id\)\}'\)\">VER LAUDO/);
  assert.match(maintenance, /__ccPaginationWrapper/);
  assert.match(compatibility, /AmarettoMaintenance && window\.AmarettoMaintenance\.renderTickets/);
  assert.match(compatibility, /'Foto do Defeito 2', ticket\.defectPhoto2/);
  assert.match(compatibility, /moduleKey === 'chamados' \? 10 : PAGE_SIZE/);
  assert.match(store, /saveTickets\(data\) \{ return this\.saveListLocal\('tickets', data\); \}/);
});

test('filtro Operação integra a filtragem e exportação existentes', () => {
  const compatibility = read('js/compatibilidade-consolidada.js');
  assert.match(compatibility, /movimentacao:[^\n]+fields:[^\n]+'operation'/);
  assert.match(compatibility, /operation:'Operação'/);
  assert.match(compatibility, /tipo_solicitacao','operacao','operation','tipo_operacao/);
  assert.match(compatibility, /const compatibleRows = this\.filterData/);
  assert.match(compatibility, /if \(useFiltered\) list = this\.filterData/);
});

test('visualizações de PDF possuem ação visível para fechar', () => {
  const app = read('js/app.js');
  const compatibility = read('js/compatibilidade-consolidada.js');
  const page = read('pages/pdf.html');
  assert.match(page, />Fechar<\/button>/);
  assert.match(app, /class="close-btn" onclick="window\.close\(\)">Fechar<\/button>/);
  assert.match(app, /id="pdf-preview-close"[^>]*>Fechar<\/button>/);
  assert.match(compatibility, /onclick="window\.close\(\)">Fechar<\/button>/);
});

test('abertura de chamado evita colisão e trata o envio das fotos', () => {
  const app = read('js/app.js');
  const server = read('backend/src/index.js');
  assert.doesNotMatch(app, /id: ticketId/);
  assert.match(app, /inputEl\._instantUploadPromise = uploadPromise/);
  assert.match(app, /if \(input\._instantUploadPromise\) await input\._instantUploadPromise/);
  assert.match(app, /Não foi possível salvar todas as fotos obrigatórias/);
  assert.match(server, /const generateTicketId = \(\) => `CH-\$\{Date\.now\(\)\.toString\(36\)/);
  assert.match(server, /if \(await db\('chamados_tecnicos'\)\.where\(\{ id \}\)\.first\(\)\) id = generateTicketId\(\)/);
});

test('listas exibem fantasia, vendedores e cidade em computador e celular', () => {
  const ticketsPage = read('pages/chamados.html');
  const movementsPage = read('pages/movimentacao.html');
  const ui = read('js/ui.js');
  const maintenance = read('js/amaretto-manutencao-20261104.js');
  assert.match(ticketsPage, /<th>Razão Social<\/th>\s*<th>Nome Fantasia<\/th>/);
  assert.match(maintenance, /data-label="Nome Fantasia">\$\{esc\(ticket\.fantasyName/);
  assert.match(movementsPage, /<th>Nome Fantasia<\/th>[\s\S]*<th>Cidade<\/th>[\s\S]*<th>Vendedor do Cliente<\/th>[\s\S]*<th>Solicitante<\/th>/);
  assert.match(ui, /data-label="Vendedor do Cliente"/);
  assert.match(ui, /data-label="Solicitante"/);
  assert.match(maintenance, /#movements-table-body td\[data-label="Cidade"\]/);
});

test('rascunhos preservam formulários em erro e só limpam no reset confirmado', () => {
  const drafts = read('js/form-drafts-20261106.js');
  const compatibility = read('js/compatibilidade-consolidada.js');
  const html = read('index.html');
  assert.match(drafts, /'ticket-open-form', 'ticket-form', 'client-form', 'movement-form'/);
  assert.match(drafts, /'prospect-form', 'expense-form', 'solicitacao-despesas-form'/);
  assert.match(drafts, /document\.addEventListener\('submit', event => save\(event\.target\), true\)/);
  assert.match(drafts, /document\.addEventListener\('reset'/);
  assert.match(drafts, /localStorage\.removeItem\(storageKey\(form\)\)/);
  assert.match(drafts, /\['password', 'submit', 'button', 'reset', 'image'\]/);
  assert.match(compatibility, /controle_campo_form_draft_v1/);
  assert.doesNotMatch(compatibility, /setTimeout\(\(\) => \{[\s\S]{0,250}e\.target\.reset\(\)/);
  assert.match(html, /js\/form-drafts-20261106\.js/);
});
