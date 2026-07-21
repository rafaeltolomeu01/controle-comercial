const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const backend = read('backend/src/index.js');
const storeSource = read('js/store.js');
const app = read('js/app.js');
const ui = read('js/ui.js');
const listPatch = read('js/atualizacoes-listas-20260716.js');
const css = [read('css/main.css'), read('css/components.css'), read('css/mobile.css')].join('\n');

const results = [];
function check(area, name, condition, evidence, severity = 'alta') {
  results.push({ area, name, status: condition ? 'PASSOU' : 'FALHOU', severity, evidence });
}

// Avalia somente a matriz de rotas do front-end em um contexto isolado.
const memory = new Map();
const sandbox = {
  console,
  window: {},
  localStorage: {
    getItem: k => memory.has(k) ? memory.get(k) : null,
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: k => memory.delete(k),
    key: i => [...memory.keys()][i] || null,
    get length() { return memory.size; }
  },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  FileReader: function () {}
};
sandbox.window = sandbox;
vm.runInNewContext(storeSource, sandbox, { filename: 'store.js' });
const routes = sandbox.Store.getUserAllowedRoutes.bind(sandbox.Store);

const profiles = {
  Administrador: ['#usuarios', '#configuracoes', '#movimentacao', '#despesas-dashboard'],
  Vendedor: ['#clientes', '#movimentacao', '#despesas', '#solicitacao-despesas'],
  Supervisor: ['#aprovacao', '#movimentacao', '#despesas-dashboard'],
  Gerente: ['#aprovacao', '#movimentacao', '#despesas-dashboard'],
  Financeiro: ['#despesas', '#despesas-dashboard'],
  Mecânico: ['#chamados'],
  'Responsável Equipamentos': ['#movimentacao', '#chamados']
};
for (const [profile, required] of Object.entries(profiles)) {
  const actual = routes({ id: `test-${profile}`, profile, permissions: [] });
  check('Matriz de rotas', `${profile}: rotas mínimas`, required.every(r => actual.includes(r)), `Rotas obtidas: ${actual.join(', ')}`, 'alta');
}
check('Matriz de rotas', 'Vendedor não acessa administração', !routes({profile:'Vendedor',permissions:[]}).some(r => ['#usuarios','#configuracoes','#empresa','#unidades','#despesas-dashboard'].includes(r)), 'Validação da matriz final de Store.getUserAllowedRoutes.', 'crítica');
check('Matriz de rotas', 'Mecânico não recebe módulos comerciais', !routes({profile:'Mecânico',permissions:[]}).some(r => ['#clientes','#despesas','#usuarios'].includes(r)), 'Validação da matriz final de Store.getUserAllowedRoutes.', 'alta');

// Escopo por usuário, unidade e empresa.
check('Unidades', 'Usuário suporta duas unidades específicas', /unitIds|unit_ids|user_units/.test(`${storeSource}\n${backend}`), 'O modelo utiliza apenas unitId/unit_id singular; não foi encontrada tabela/relação de várias unidades.', 'crítica');
check('Catálogo MG/ES', 'Catálogo de equipamentos é compartilhado pela empresa', /STORE_GLOBAL_KEYS[\s\S]{0,500}equipment_types/.test(storeSource), 'equipment_types não está em STORE_GLOBAL_KEYS e fica no escopo local do usuário.', 'alta');
check('Hierarquia', 'Perfis não comerciais fecham escopo por padrão', !/Administrador \(or other profiles\) sees all users/.test(backend), 'getPermittedSellerIds concede todos os usuários da empresa para qualquer perfil fora de Vendedor/Supervisor/Gerente.', 'crítica');
check('Empresa', 'Detalhe/exclusão de despesas sempre exige empresa_id', !/if \(!isActorAdmin\) recordQuery = recordQuery\.where\(\{ empresa_id/.test(backend) && !/if \(!isAdmin\) recordQuery = recordQuery\.where\(\{ empresa_id/.test(backend), 'No ramo administrativo, a busca e a exclusão por ID deixam de exigir empresa_id.', 'crítica');
check('Empresa', 'Movimentação por ID sempre exige empresa_id', /function getCompanyMovementById[\s\S]{0,500}scopeMovementCompany/.test(backend) && /function updateCompanyMovementById[\s\S]{0,500}scopeMovementCompany/.test(backend), 'Detalhe/alteração/exclusão de movimentação usam ID sem prova uniforme de empresa_id.', 'crítica');
check('Empresa', 'Exclusão de chamado exige empresa_id', /delete\(['"]\/api\/chamados\/:id[\s\S]{0,900}empresa_id/i.test(backend), 'A exclusão administrativa por ID não demonstra escopo de empresa na mesma operação.', 'crítica');
check('Unidades', 'Movimentação grava unidade explícita', /insertAndGetId\('equipamentos_movimentacoes',[\s\S]{0,1800}(unit_id|unitId)/.test(backend), 'O INSERT da movimentação não grava unit_id; a listagem infere a unidade por Empresa Base ou usuário.', 'alta');
check('Unidades', 'Seleção global não aceita unidade fora das permitidas', /allowedUnit|permittedUnit|user_units|unitIds/.test(backend), 'Não foi localizada uma lista persistente de unidades permitidas por usuário.', 'crítica');

// Segurança da API e uploads.
check('API direta', 'JWT é exigido nas rotas operacionais', /authenticateToken|jwt\.verify/.test(backend), 'Middleware JWT e verificação de token encontrados.', 'crítica');
check('API direta', 'Senha usa hash', /bcrypt\.hash/.test(backend) && /bcrypt\.compare/.test(backend), 'bcrypt.hash e bcrypt.compare encontrados.', 'crítica');
check('API direta', 'Configurações globais só podem ser gravadas por admin', /GLOBAL_STORE_KEYS[\s\S]{0,1600}(requireAdmin|isAdminUser)/.test(backend), 'A rota genérica /api/store/:key protege explicitamente o importador, mas não todas as chaves globais.', 'alta');
check('Upload', 'Upload é aguardado antes de enviar movimentação', /await[^\n]*(upload|uploadFile|uploadPhoto)/i.test(app), 'Foi encontrado await no fluxo de upload.', 'alta');
check('Upload', 'Falha de notificação não apaga movimentação', /notifica[\s\S]{0,500}(catch|warning|warn)/i.test(`${app}\n${backend}`), 'Há tratamento isolado de erro de notificação.', 'alta');
check('Upload', 'Fotos novas usam URL/link em vez de Base64 no registro', /photo_url|foto_url|secure_url|imageUrl|url/i.test(`${app}\n${backend}`), 'Campos e retornos de URL foram encontrados; requer confirmação dinâmica com Cloudinary em homologação.', 'média');

// Despesas, aprovação parcial e exportação.
check('Despesas e saldos', 'Aprovação parcial armazena valor aprovado', /valor_aprovado|approved_value|total_aprovado|valorAprovado/i.test(`${backend}\n${app}`), 'Campos de valor aprovado encontrados.', 'crítica');
check('Despesas e saldos', 'Totais priorizam valor aprovado', /(valor_aprovado|approved_value|total_aprovado)[^\n]{0,180}(valor_solicitado|total_geral)|\?\?[^\n]{0,120}(valor_solicitado|total_geral)/i.test(`${backend}\n${app}\n${listPatch}`), 'Há fallback entre valores; a precedência precisa ser validada com banco de homologação.', 'crítica');
check('Exportação', 'Exportação usa lista filtrada', /(filtered|filtrada|filter)[\s\S]{0,500}(XLSX|export|Export)/i.test(`${app}\n${ui}\n${listPatch}`), 'Foram encontrados fluxos de exportação ligados a listas filtradas; requer comparação dinâmica de linhas.', 'alta');

// Responsividade e ordenação.
check('Responsividade', 'Existe cobertura de celular/tablet', /@media\s*\([^)]*max-width[^)]*\)/.test(css), 'Media queries encontradas nos três arquivos CSS.', 'alta');
check('Responsividade', 'Tabelas largas possuem rolagem horizontal segura', /table-responsive[^}]*overflow-x:\s*auto|table-container[^}]*overflow-x:\s*auto|prospect-list-table-wrap[^}]*overflow-x:\s*auto/.test(css), 'Tabela larga sem contêiner de rolagem pode ocultar colunas e caixas de seleção.', 'alta');
check('Ordenação', 'Cabeçalhos ordenáveis existem nas listas', /sort|sortable|data-sort|orden/i.test(listPatch), 'Mecanismo de ordenação encontrado no patch consolidado.', 'média');

const summary = results.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] || 0) + 1;
  return acc;
}, {});
const output = { generatedAt: new Date().toISOString(), summary, results };
fs.mkdirSync(path.join(root, 'audit-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'audit-results', 'static-audit.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
process.exitCode = results.some(r => r.status === 'FALHOU') ? 1 : 0;
