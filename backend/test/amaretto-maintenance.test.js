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
  assert.match(page, /capture="environment"/);
});

test('backend exige os novos dados e preserva estruturas históricas', () => {
  const server = read('backend/src/index.js');
  const migration = read('backend/migrations/20261104_add_chamados_manutencao_fields.js');
  assert.match(server, /A marca da geladeira\/freezer é obrigatória/);
  assert.match(server, /A foto do equipamento completo é obrigatória/);
  assert.match(server, /A descrição do serviço realizado é obrigatória/);
  assert.match(server, /if \(!chamado\.maintenanceStartedAt\)/);
  assert.match(server, /solutionDescription: serviceDescription/);
  assert.doesNotMatch(migration, /dropColumn|dropTable|\.delete\(|\.del\(/);
});

test('filtro Operação integra a filtragem e exportação existentes', () => {
  const compatibility = read('js/compatibilidade-consolidada.js');
  assert.match(compatibility, /movimentacao:[^\n]+fields:[^\n]+'operation'/);
  assert.match(compatibility, /operation:'Operação'/);
  assert.match(compatibility, /tipo_solicitacao','operacao','operation','tipo_operacao/);
  assert.match(compatibility, /const compatibleRows = this\.filterData/);
  assert.match(compatibility, /if \(useFiltered\) list = this\.filterData/);
});
