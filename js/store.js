const IDENTITY_KEY = 'controle_campo_company_identity';
const DATA_KEY_PREFIX = 'controle_campo_db_';
const DATA_GLOBAL_SCOPE = 'global';
const STORE_SYNC_KEYS = ['company_identity', 'prospects', 'clients', 'equipments', 'movements', 'tickets', 'expenses', 'balances', 'units', 'client_categories', 'equipment_types', 'rejection_reasons', 'prospect_loss_reasons', 'expense_categories', 'notification_emails'];

const DEFAULT_LOGO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%230f172a' stroke='%231e293b' stroke-width='2'/><path d='M50,15 L80,30 C80,60 50,80 50,80 C50,80 20,60 20,30 Z' fill='none' stroke='%233b82f6' stroke-width='6'/><path d='M38,46 L46,54 L62,34' fill='none' stroke='%2310b981' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'/></svg>";

const DEFAULT_IDENTITY = {
  name: 'Distribuidora JDS',
  logo: DEFAULT_LOGO,
  cnpj: '12.345.678/0001-90',
  phone: '(11) 3200-9876',
  email: 'contato@distribuidorajds.com.br'
};

// Initial Operational Database
const DEFAULT_UNITS = [
  { id: '1', name: 'Distribuidora Minas Gerais' },
  { id: '2', name: 'Distribuidora Espírito Santo' }
];

const DEFAULT_CLIENT_CATEGORIES = ['Sorveteria', 'Lanchonete', 'Supermercado', 'Mercearia', 'Restaurante', 'Padaria', 'Outros'];
const DEFAULT_EQUIPMENT_TYPES = ['Geladeira Expositora Slim', 'Freezer Horizontal', 'Display Promocional', 'Cervejeira Grande'];
const DEFAULT_REJECTION_REASONS = ['CNPJ Inválido', 'Restrição de Crédito', 'Falta de Documentação', 'Região não atendida'];
const DEFAULT_PROSPECT_LOSS_REASONS = ['Preço da concorrência menor', 'Sem espaço físico', 'Desistência do cliente', 'Sem interesse comercial'];
const DEFAULT_EXPENSE_CATEGORIES = ['Combustível', 'Pedágio', 'Alimentação', 'Hospedagem', 'Manutenção Veículo', 'Outros'];
const DEFAULT_NOTIFICATION_EMAILS = ['notificacoes@distribuidorajds.com.br', 'financeiro@distribuidorajds.com.br'];

const DEFAULT_USERS = [
  { id: 'admin', username: 'admin', password: '123', name: 'Admin Geral', profile: 'Administrador', unitId: 'all' },
  { id: 'supervisor', username: 'supervisor', password: '123', name: 'Sup. Carlos', profile: 'Supervisor', unitId: '1' },
  { id: 'financeiro', username: 'financeiro', password: '123', name: 'Fin. Ana', profile: 'Financeiro', unitId: 'all' },
  { id: 'conferente', username: 'conferente', password: '123', name: 'Conf. João', profile: 'Conferente', unitId: '1' },
  { id: 'resp_eq', username: 'resp_eq', password: '123', name: 'Resp. Roberto', profile: 'Responsável Equipamentos', unitId: '2' },
  { id: 'mecanico', username: 'mecanico', password: '123', name: 'Mec. Marcelo', profile: 'Mecânico', unitId: '1' },
  { id: 'vendedor1', username: 'vendedor1', password: '123', name: 'Carlos Silva', profile: 'Vendedor', unitId: '1' },
  { id: 'vendedor2', username: 'vendedor2', password: '123', name: 'Ana Julia Reis', profile: 'Vendedor', unitId: '2' },
  { id: 'vendedor3', username: 'vendedor3', password: '123', name: 'Marcos Silveira', profile: 'Vendedor', unitId: '1' }
];

const DEFAULT_PROSPECTS = [];

const DEFAULT_CLIENTS = [];

const DEFAULT_EQUIPMENTS = [];

const DEFAULT_TICKETS = [];

const DEFAULT_EXPENSES = [];

const DEFAULT_BALANCE_REQUESTS = [];

const Store = {
  /**
   * Get dynamic identity of the company
   */
  getCompanyIdentity() {
    try {
      const stored = localStorage.getItem(IDENTITY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          name: parsed.name || DEFAULT_IDENTITY.name,
          logo: parsed.logo || DEFAULT_IDENTITY.logo,
          cnpj: parsed.cnpj || DEFAULT_IDENTITY.cnpj,
          phone: parsed.phone || DEFAULT_IDENTITY.phone,
          email: parsed.email || DEFAULT_IDENTITY.email
        };
      }
    } catch (e) {
      console.error(e);
    }
    return { ...DEFAULT_IDENTITY };
  },

  /**
   * Save identity to storage
   */
  saveCompanyIdentity(config) {
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(config));
      this.saveToBackend('company_identity', config);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  /**
   * Reset identity parameters
   */
  resetIdentity() {
    this.saveCompanyIdentity(DEFAULT_IDENTITY);
    return { ...DEFAULT_IDENTITY };
  },

  getApiBaseUrl() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3001';
    return '';
  },

  async backendRequest(endpoint, options = {}) {
    const token = this.getToken ? this.getToken() : (localStorage.getItem('controle_campo_token') || '');
    if (!token) throw new Error('Sem token para sincronizar com o banco.');
    const user = this.getLoggedUser ? (this.getLoggedUser() || {}) : {};
    const response = await fetch(`${this.getApiBaseUrl()}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-User-Id': user.id || '',
        'X-User-Profile': user.profile || '',
        'X-Company-Id': user.empresa_id || '001',
        'X-Unit-Id': user.unitId || 'all',
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Erro de banco: ${response.status}`);
    }
    return response.json();
  },

  saveToBackend(key, data) {
    const token = this.getToken ? this.getToken() : '';
    if (!token || !STORE_SYNC_KEYS.includes(key)) return;
    // Sincronização em segundo plano para não travar a tela.
    this.backendRequest(`/api/store/${encodeURIComponent(key)}`, {
      method: 'POST',
      body: JSON.stringify({ data })
    }).catch(err => console.error(`Falha ao salvar ${key} no banco:`, err.message));
  },

  normalizeArrayRecord(item) {
    if (!item || typeof item !== 'object') return item;
    return { ...item };
  },

  mergeArrayById(localArr, remoteArr) {
    const local = Array.isArray(localArr) ? localArr : [];
    const remote = Array.isArray(remoteArr) ? remoteArr : [];
    const map = new Map();
    const getKey = (item, idx, prefix) => String(item && (item.id || item.codigo || item.username || item.name) || `${prefix}-${idx}`);
    remote.forEach((item, idx) => map.set(getKey(item, idx, 'remote'), this.normalizeArrayRecord(item)));
    local.forEach((item, idx) => {
      const key = getKey(item, idx, 'local');
      const existing = map.get(key);
      // Local vence quando é mais novo ou quando o remoto está incompleto.
      map.set(key, { ...(existing || {}), ...(this.normalizeArrayRecord(item) || {}) });
    });
    return Array.from(map.values());
  },

  async syncAllFromBackend(options = {}) {
    const token = this.getToken ? this.getToken() : '';
    if (!token) return false;
    const forceRemote = options.forceRemote === true;
    try {
      const payload = await this.backendRequest('/api/store');
      if (payload && typeof payload === 'object') {
        for (const key of STORE_SYNC_KEYS) {
          if (!Object.prototype.hasOwnProperty.call(payload, key) || payload[key] == null) continue;

          if (key === 'company_identity') {
            const localIdentity = this.getCompanyIdentity();
            const remoteIdentity = payload[key] || {};
            // A identidade da empresa deve vir do banco.
            // Se o admin alterar nome/logo/CNPJ, todos os usuários vinculados recebem a alteração.
            // O localStorage não pode vencer o banco, senão vendedor continua vendo nome antigo.
            const hasRemoteIdentity = remoteIdentity && typeof remoteIdentity === 'object' && Object.keys(remoteIdentity).length > 0;
            const mergedIdentity = hasRemoteIdentity ? { ...localIdentity, ...remoteIdentity } : localIdentity;
            localStorage.setItem(IDENTITY_KEY, JSON.stringify(mergedIdentity));
            continue;
          }

          const storageKey = DATA_KEY_PREFIX + DATA_GLOBAL_SCOPE + '_' + key;
          let localValue = [];
          try { localValue = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch (_) { localValue = []; }
          const remoteValue = payload[key];

          let nextValue = remoteValue;
          if (!forceRemote && Array.isArray(localValue) && Array.isArray(remoteValue)) {
            // Se o banco ainda está vazio, não apaga o que acabou de ser criado no celular.
            nextValue = this.mergeArrayById(localValue, remoteValue);
            if (localValue.length && !remoteValue.length) this.saveToBackend(key, nextValue);
          }
          localStorage.setItem(storageKey, JSON.stringify(nextValue));
        }
      }

      // Primeiro acesso: envia para o banco o que ainda existe somente neste navegador.
      for (const key of STORE_SYNC_KEYS) {
        const localValue = key === 'company_identity'
          ? this.getCompanyIdentity()
          : this.getList(key, []);
        if (!Object.prototype.hasOwnProperty.call(payload || {}, key) && localValue != null) {
          this.saveToBackend(key, localValue);
        }
      }
      localStorage.setItem('controle_campo_last_sync_at', new Date().toISOString());
      return true;
    } catch (err) {
      console.error('Falha ao sincronizar dados do banco:', err.message);
      return false;
    }
  },

  /**
   * Generic List getter
   */
  getList(key, defaultData) {
    try {
      // A chave dos dados não pode depender do nome/CNPJ visual da empresa.
      // Se a empresa for renomeada nas configurações, usuários, clientes e saldos não podem sumir.
      const stableKey = DATA_KEY_PREFIX + DATA_GLOBAL_SCOPE + '_' + key;
      const stableData = localStorage.getItem(stableKey);
      if (stableData) return JSON.parse(stableData);

      // Migração automática das versões antigas que usavam o CNPJ da empresa na chave.
      const identity = this.getCompanyIdentity();
      const cnpjClean = identity && identity.cnpj ? identity.cnpj.replace(/[^a-zA-Z0-9]/g, '') : 'default';
      const legacyKey = DATA_KEY_PREFIX + cnpjClean + '_' + key;
      const legacyData = localStorage.getItem(legacyKey);
      if (legacyData) {
        localStorage.setItem(stableKey, legacyData);
        return JSON.parse(legacyData);
      }

      // Busca qualquer chave antiga do mesmo tipo, caso o CNPJ/nome já tenha sido alterado.
      for (let i = 0; i < localStorage.length; i += 1) {
        const storageKey = localStorage.key(i);
        if (storageKey && storageKey.startsWith(DATA_KEY_PREFIX) && storageKey.endsWith('_' + key)) {
          const migrated = localStorage.getItem(storageKey);
          if (migrated) {
            localStorage.setItem(stableKey, migrated);
            return JSON.parse(migrated);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
    // Set default and return
    this.saveList(key, defaultData);
    return defaultData;
  },

  /**
   * Generic List saver
   */
  saveList(key, data) {
    try {
      const stableKey = DATA_KEY_PREFIX + DATA_GLOBAL_SCOPE + '_' + key;
      localStorage.setItem(stableKey, JSON.stringify(data));
      this.saveToBackend(key, data);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  // Specialized getters/setters for operations
  getProspects() { return this.getList('prospects', DEFAULT_PROSPECTS); },
  saveProspects(data) { return this.saveList('prospects', data); },

  getClients() { return this.getList('clients', DEFAULT_CLIENTS); },
  saveClients(data) { return this.saveList('clients', data); },

  getEquipments() { return this.getList('equipments', DEFAULT_EQUIPMENTS); },
  saveEquipments(data) { return this.saveList('equipments', data); },

  // Movements of equipment
  getMovements() { return this.getList('movements', []); },
  saveMovements(data) { return this.saveList('movements', data); },

  getTickets() { return this.getList('tickets', DEFAULT_TICKETS); },
  saveTickets(data) { return this.saveList('tickets', data); },

  getExpenses() { return this.getList('expenses', DEFAULT_EXPENSES); },
  saveExpenses(data) { return this.saveList('expenses', data); },

  getBalanceRequests() { return this.getList('balances', DEFAULT_BALANCE_REQUESTS); },
  saveBalances(data) { return this.saveList('balances', data); },

  getUnits() { return this.getList('units', DEFAULT_UNITS); },
  saveUnits(data) { return this.saveList('units', data); },

  getDeletedUserIds() {
    try { return JSON.parse(localStorage.getItem('controle_campo_deleted_users') || '[]'); } catch(e) { return []; }
  },
  markUserDeleted(id) {
    const ids = this.getDeletedUserIds();
    if (!ids.includes(id)) {
      ids.push(id);
      localStorage.setItem('controle_campo_deleted_users', JSON.stringify(ids));
    }
  },
  getUsers() {
    const deleted = this.getDeletedUserIds();
    return this.getList('users', DEFAULT_USERS).filter(u => !deleted.includes(u.id));
  },
  saveUsers(data) { return this.saveList('users', data); },

  getClientCategories() { return this.getList('client_categories', DEFAULT_CLIENT_CATEGORIES); },
  saveClientCategories(data) { return this.saveList('client_categories', data); },

  getEquipmentTypes() { return this.getList('equipment_types', DEFAULT_EQUIPMENT_TYPES); },
  saveEquipmentTypes(data) { return this.saveList('equipment_types', data); },

  getRejectionReasons() { return this.getList('rejection_reasons', DEFAULT_REJECTION_REASONS); },
  saveRejectionReasons(data) { return this.saveList('rejection_reasons', data); },

  getProspectLossReasons() { return this.getList('prospect_loss_reasons', DEFAULT_PROSPECT_LOSS_REASONS); },
  saveProspectLossReasons(data) { return this.saveList('prospect_loss_reasons', data); },

  getExpenseCategories() { return this.getList('expense_categories', DEFAULT_EXPENSE_CATEGORIES); },
  saveExpenseCategories(data) { return this.saveList('expense_categories', data); },

  getNotificationEmails() { return this.getList('notification_emails', DEFAULT_NOTIFICATION_EMAILS); },
  saveNotificationEmails(data) { return this.saveList('notification_emails', data); },

  getLoggedUser() {
    try {
      const stored = localStorage.getItem('controle_campo_logged_user');
      if (stored) return JSON.parse(stored);
    } catch(e) {
      console.error(e);
    }
    return null;
  },

  setLoggedUser(user, token) {
    try {
      localStorage.setItem('controle_campo_logged_user', JSON.stringify(user));
      localStorage.setItem('controle_campo_auth', 'true');
      if (token) {
        localStorage.setItem('controle_campo_token', token);
      }
    } catch(e) {
      console.error(e);
    }
  },

  clearLoggedUser() {
    localStorage.removeItem('controle_campo_logged_user');
    localStorage.removeItem('controle_campo_auth');
    localStorage.removeItem('controle_campo_token');
  },

  getToken() {
    return localStorage.getItem('controle_campo_token') || '';
  },

  getActiveUnitId() {
    return localStorage.getItem('controle_campo_active_unit') || 'all';
  },
  setActiveUnitId(id) {
    localStorage.setItem('controle_campo_active_unit', id);
  },

  /**
   * Helper to convert File to Base64
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  },

  /**
   * Get list of allowed hashes for a user based on permissions checkboxes or profile
   */
  getUserAllowedRoutes(user) {
    if (!user) return ['#dashboard'];
    
    const perms = user.permissions || [];
    
    // If user has the 'Administrador' profile, OR has the 'Administrador' permission (Acesso Total)
    if (user.profile === 'Administrador' || perms.includes('Administrador')) {
      return ['#dashboard', '#prospeccao', '#clientes', '#aprovacao', '#equipamentos', '#movimentacao', '#chamados', '#despesas', '#solicitacao-despesas', '#despesas-dashboard', '#relatorios', '#unidades', '#usuarios', '#empresa', '#configuracoes', '#pdf', '#simulador-troca'];
    }
    
    // Fallback if no permissions are set
    if (perms.length === 0) {
      const allowed = ['#dashboard'];
      const profileRoutes = {
        'Supervisor': ['#dashboard', '#prospeccao', '#clientes', '#aprovacao', '#relatorios', '#empresa', '#despesas', '#solicitacao-despesas', '#despesas-dashboard', '#unidades', '#usuarios', '#simulador-troca'],
        'Financeiro': ['#dashboard', '#despesas', '#solicitacao-despesas', '#despesas-dashboard', '#relatorios'],
        'Conferente': ['#dashboard', '#equipamentos', '#movimentacao'],
        'Responsável Equipamentos': ['#dashboard', '#equipamentos', '#movimentacao', '#chamados'],
        'Mecânico': ['#dashboard', '#chamados'],
        'Vendedor': ['#dashboard', '#prospeccao', '#clientes', '#movimentacao', '#chamados', '#despesas', '#solicitacao-despesas', '#relatorios', '#simulador-troca']
      };
      const extra = profileRoutes[user.profile] || [];
      extra.forEach(r => {
        if (!allowed.includes(r)) allowed.push(r);
      });
      if (!allowed.includes('#pdf')) allowed.push('#pdf');
      return allowed;
    }
    
    // If perms.length > 0, we strictly map the checkboxes selected
    const allowed = ['#dashboard'];
    
    if (perms.includes('Clientes')) {
      allowed.push('#clientes');
      allowed.push('#prospeccao');
      allowed.push('#aprovacao');
    }
    if (perms.includes('Produtos') || perms.includes('Equipamentos')) {
      allowed.push('#equipamentos');
    }
    if (perms.includes('Estoque')) {
      allowed.push('#movimentacao');
    }
    if (perms.includes('Chamados') || perms.includes('Chamados Mecânicos')) {
      allowed.push('#chamados');
    }
    if (perms.includes('Financeiro')) {
      allowed.push('#despesas');
      allowed.push('#solicitacao-despesas');
    }
    if (perms.includes('Solicitação de Saldo')) {
      allowed.push('#solicitacao-despesas');
      allowed.push('#despesas');
    }
    if (perms.includes('Aprovação de Saldo')) {
      allowed.push('#despesas-dashboard');
    }
    if (perms.includes('Despesas') || perms.includes('Despesas de Campo')) {
      allowed.push('#despesas');
      allowed.push('#solicitacao-despesas');
    }
    if (perms.includes('Aprovação de Despesas')) {
      allowed.push('#despesas-dashboard');
    }
    if (perms.includes('Relatórios')) {
      allowed.push('#relatorios');
    }
    if (perms.includes('Usuários') || perms.includes('Usuários e Permissões')) {
      allowed.push('#usuarios');
    }
    if (perms.includes('Configurações') || perms.includes('Configurações Gerais')) {
      allowed.push('#configuracoes');
      allowed.push('#empresa');
      allowed.push('#unidades');
    }
    
    if (!allowed.includes('#pdf')) allowed.push('#pdf');
    
    if (['Administrador', 'Supervisor', 'Vendedor'].includes(user.profile)) {
      if (!allowed.includes('#simulador-troca')) allowed.push('#simulador-troca');
    }
    
    return allowed;
  }
};

window.Store = Store;


// =============================================================
// PATCH FINAL STORE - chave estável, sync sem apagar dados locais e rotas coerentes
// =============================================================
(function(){
  if (!window.Store || window.__ccFinalStorePatch) return;
  window.__ccFinalStorePatch = true;
  Store.DEFAULT_IDENTITY = DEFAULT_IDENTITY;

  const oldSetLoggedUser = Store.setLoggedUser.bind(Store);
  Store.setLoggedUser = function(user, token) {
    const clean = Object.assign({}, user || {});
    clean.permissions = Array.isArray(clean.permissions) ? clean.permissions : [];
    if (!clean.unitId) clean.unitId = clean.profile === 'Administrador' ? 'all' : '1';
    oldSetLoggedUser(clean, token);
    if (clean.companyIdentity) localStorage.setItem('controle_campo_company_identity', JSON.stringify(clean.companyIdentity));
  };

  Store.mergeArrayById = function(localArr, remoteArr) {
    const local = Array.isArray(localArr) ? localArr : [];
    const remote = Array.isArray(remoteArr) ? remoteArr : [];
    const map = new Map();
    const keyOf = (item, idx, prefix) => String(item && (item.id || item.codigo || item.username || item.cnpj || item.name) || `${prefix}-${idx}`);
    remote.forEach((item, idx) => map.set(keyOf(item, idx, 'remote'), item));
    local.forEach((item, idx) => {
      const key = keyOf(item, idx, 'local');
      const existing = map.get(key) || {};
      const localDate = Date.parse(item && (item.updated_at || item.updatedAt || item.createdAt || item.created_at || item.date)) || 0;
      const remoteDate = Date.parse(existing && (existing.updated_at || existing.updatedAt || existing.createdAt || existing.created_at || existing.date)) || 0;
      map.set(key, localDate >= remoteDate ? Object.assign({}, existing, item) : Object.assign({}, item, existing));
    });
    return Array.from(map.values());
  };

  Store.getUserAllowedRoutes = function(user) {
    if (!user) return ['#dashboard'];
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    if (user.profile === 'Administrador' || perms.includes('Administrador')) {
      return ['#dashboard','#prospeccao','#clientes','#aprovacao','#equipamentos','#movimentacao','#chamados','#despesas','#solicitacao-despesas','#despesas-dashboard','#relatorios','#unidades','#usuarios','#empresa','#configuracoes','#pdf','#simulador-troca'];
    }
    const allowed = ['#dashboard','#pdf'];
    const add = (...arr) => arr.forEach(x => { if (!allowed.includes(x)) allowed.push(x); });
    if (user.profile === 'Vendedor') add('#prospeccao','#clientes','#movimentacao','#chamados','#despesas','#solicitacao-despesas','#relatorios','#simulador-troca');
    if (user.profile === 'Supervisor' || user.profile === 'Gerente') add('#prospeccao','#clientes','#aprovacao','#equipamentos','#movimentacao','#chamados','#despesas','#solicitacao-despesas','#despesas-dashboard','#relatorios','#usuarios','#simulador-troca');
    if (user.profile === 'Financeiro' || perms.includes('Financeiro')) add('#despesas','#solicitacao-despesas','#despesas-dashboard','#relatorios');
    if (perms.includes('Clientes')) add('#clientes','#prospeccao','#aprovacao');
    if (perms.includes('Produtos') || perms.includes('Equipamentos')) add('#equipamentos','#movimentacao');
    if (perms.includes('Chamados') || perms.includes('Chamados Mecânicos')) add('#chamados');
    if (perms.includes('Solicitação de Saldo') || perms.includes('Despesas') || perms.includes('Despesas de Campo')) add('#despesas','#solicitacao-despesas');
    if (perms.includes('Aprovação de Saldo') || perms.includes('Aprovação de Despesas')) add('#despesas-dashboard','#despesas');
    if (perms.includes('Relatórios')) add('#relatorios');
    if (perms.includes('Usuários') || perms.includes('Usuários e Permissões')) add('#usuarios');
    if (perms.includes('Configurações') || perms.includes('Configurações Gerais')) add('#configuracoes','#empresa','#unidades');
    return allowed;
  };
})();
