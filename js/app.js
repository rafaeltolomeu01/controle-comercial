const App = {
  currentRoute: '',
  isLoggedIn: false,
  logoBase64Cache: null,
  autoSyncIntervalId: null,
  autoSyncInProgress: false,

  /**
   * Initialize Application
   */
  async init() {
    window.TempPhotosCache = window.TempPhotosCache || {};

    // Nunca confiar apenas no localStorage. Antes de montar o sistema,
    // valida o token no backend. Isso impede entrar direto no painel com
    // usuário antigo, token inválido ou dados "undefined".
    await this.bootstrapAuthentication();

    // Periodic validation every 5 seconds
    setInterval(() => {
      if (this.isLoggedIn && window.location.hash !== '#login') {
        this.validateSessionStatus();
      }
    }, 5000);

    this.registerServiceWorker();
    this.setupRouter();
    this.setupIdentity();
    UI.populateUnitDropdowns(); // Populate options for all unit & seller dropdown elements
    UI.populateConfigDropdowns(); // Populate configurations select dropdowns
    UI.populateMovementClientsDropdown(); // Populate client dropdown in movement form
    this.setupEventListeners();
    this.setupClientCnpjLookup();
    this.setupProspectCnpjLookup();
    this.setupLoginUX();
    this.refreshAllLists();
    this.startAutoSync();
  },

  /**
   * Login UX: campos limpos e botão de visualizar senha.
   */
  setupLoginUX() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const toggleBtn = document.getElementById('btn-toggle-login-password');

    if (usernameInput) {
      usernameInput.value = '';
      usernameInput.setAttribute('autocomplete', 'off');
      usernameInput.setAttribute('autocapitalize', 'none');
      usernameInput.setAttribute('spellcheck', 'false');
    }
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.setAttribute('autocomplete', 'new-password');
    }

    if (toggleBtn && passwordInput && toggleBtn.dataset.bound !== '1') {
      toggleBtn.dataset.bound = '1';
      toggleBtn.addEventListener('click', () => {
        const showing = passwordInput.type === 'text';
        passwordInput.type = showing ? 'password' : 'text';
        toggleBtn.textContent = showing ? '👁️' : '🙈';
        toggleBtn.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
        toggleBtn.setAttribute('title', showing ? 'Mostrar senha' : 'Ocultar senha');
      });
    }
  },

  /**
   * Atualiza dados do banco a cada minuto, sem apagar o que está na tela.
   * Assim o celular fica responsivo com cache local e sincroniza em segundo plano.
   */
  startAutoSync() {
    if (this.autoSyncIntervalId) return;
    this.autoSyncIntervalId = setInterval(async () => {
      if (!this.isLoggedIn || window.location.hash === '#login' || this.autoSyncInProgress) return;
      this.autoSyncInProgress = true;
      try {
        if (Store.syncAllFromBackend) await Store.syncAllFromBackend({ forceRemote: true });
        await this.refreshAllLists();
      } catch (err) {
        console.warn('Sincronização automática falhou:', err.message || err);
      } finally {
        this.autoSyncInProgress = false;
      }
    }, 60000);
  },

  /**
   * Register service worker for PWA support
   */
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('Service Worker registered', reg.scope))
          .catch(err => console.error('Service Worker registration failed', err));
      });
    }
  },

  /**
   * Verify authenticated session
   */
  checkAuthentication() {
    const loggedUser = Store.getLoggedUser();
    const token = Store.getToken();
    this.isLoggedIn = Boolean(loggedUser && loggedUser.id && token);
  },

  async bootstrapAuthentication() {
    const appContainer = document.getElementById('app-container');
    const loginWrapper = document.getElementById('login-wrapper-container');
    if (appContainer) appContainer.style.display = 'none';
    if (loginWrapper) loginWrapper.style.display = 'flex';

    const token = Store.getToken();
    if (!token) {
      Store.clearLoggedUser();
      this.isLoggedIn = false;
      window.location.hash = '#login';
      return false;
    }

    try {
      const fresh = await this.fetchFromApi('/api/me');
      if (!fresh || !fresh.id) throw new Error('Sessão inválida');
      Store.setLoggedUser(fresh, token);
      this.isLoggedIn = true;
      if (Store.syncAllFromBackend) {
        // Carrega do banco sem apagar itens locais recém-criados no celular.
        await Store.syncAllFromBackend();
      }
      if (!window.location.hash || window.location.hash === '#login') {
        window.location.hash = '#dashboard';
      }
      return true;
    } catch (err) {
      console.warn('Sessão inválida ou expirada:', err);
      Store.clearLoggedUser();
      this.isLoggedIn = false;
      window.location.hash = '#login';
      return false;
    }
  },

  /**
   * Refresh all cached datasets
   */
  async refreshAllLists() {
    if (!this.isLoggedIn) return;
    const clients = Store.getClients();
    const equipments = Store.getEquipments();
    await this.loadProspects();
    UI.renderClients(clients);
    UI.renderApprovals(clients);
    UI.renderEquipments(equipments);
    this.loadMovements();
    this.loadExpenses();
    this.loadBalances();
    await this.loadTickets();
    UI.renderUnits(); // Render branch units and stats
    await UI.renderUsers(); // Render users and details
    UI.populateMovementClientsDropdown(); // Repopulate clients dropdown on movements form
    UI.renderDashboard();

    // Se estiver no dashboard de despesas, a troca da unidade global também deve
    // recarregar a tabela e os cards com o mesmo filtro da unidade selecionada.
    if (window.location.hash === '#despesas-dashboard') {
      this.loadDespesasDashboard();
    }
  },

  /**
   * Setup SPA Router hashes
   */
  setupRouter() {
    const handleRoute = () => {
      const hash = window.location.hash || '#dashboard';
      this.currentRoute = hash;

      // Authentication Lock
      if (!this.isLoggedIn && hash !== '#login') {
        window.location.hash = '#login';
        return;
      }

      // Role restriction check
      if (this.isLoggedIn && hash !== '#login') {
        this.validateSessionStatus();
        const user = Store.getLoggedUser();
        const allowedHashes = Store.getUserAllowedRoutes(user);
        if (!allowedHashes.includes(hash) && hash !== '#pdf' && hash !== '#notificacoes') {
          window.location.hash = '#dashboard';
          return;
        }
        UI.applyPermissions(); // Always adjust sidebar/mobile tabs
      }

      // Close mobile sidebar on route change
      const sidebar = document.querySelector('.sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('open');

      // Hide all panels
      document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      document.querySelectorAll('.mobile-nav-item').forEach(l => l.classList.remove('active'));

      const appContainer = document.getElementById('app-container');
      const loginWrapper = document.getElementById('login-wrapper-container');

      if (hash === '#login') {
        if (appContainer) appContainer.style.display = 'none';
        if (loginWrapper) loginWrapper.style.display = 'flex';
        
        const loginPanel = document.getElementById('view-login');
        if (loginPanel) loginPanel.classList.add('active');
        return;
      }

      if (appContainer) appContainer.style.display = 'flex';
      if (loginWrapper) loginWrapper.style.display = 'none';

      // Activate corresponding view panel
      const pageName = hash.replace('#', '');
      const targetPanelId = `view-${pageName}`;
      const panel = document.getElementById(targetPanelId);
      if (panel) {
        if (panel.innerHTML.trim() === '') {
          this.loadPageContent(pageName).then(() => {
            panel.classList.add('active');
            // Highlight links
            document.querySelectorAll(`.nav-link[href="${hash}"]`).forEach(l => l.classList.add('active'));
            document.querySelectorAll(`.mobile-nav-item[href="${hash}"]`).forEach(l => l.classList.add('active'));
            this.onRouteChanged(hash);
          }).catch(err => {
            console.error('Failed to load page content:', err);
          });
          return;
        } else {
          panel.classList.add('active');
        }
      }

      // Highlight links
      document.querySelectorAll(`.nav-link[href="${hash}"]`).forEach(l => l.classList.add('active'));
      document.querySelectorAll(`.mobile-nav-item[href="${hash}"]`).forEach(l => l.classList.add('active'));

      // Injects headers titles
      this.onRouteChanged(hash);
    };

    window.addEventListener('hashchange', handleRoute);
    handleRoute();
  },

  async loadPageContent(pageName) {
    const targetPanelId = `view-${pageName}`;
    const panel = document.getElementById(targetPanelId);
    if (!panel) return;

    if (panel.innerHTML.trim() !== '') {
      return; // Already loaded!
    }

    try {
      panel.innerHTML = `
        <div class="loading-wrapper-view" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; gap: 16px; color: var(--text-muted);">
          <div class="spinner" style="width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <span style="font-family: var(--font-title); font-size: 0.9rem;">Carregando página...</span>
        </div>
      `;

      const response = await fetch(`pages/${pageName}.html`);
      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }
      const html = await response.text();
      panel.innerHTML = html;

      // Rebind specific elements for this page
      this.setupEventListeners();
      this.setupClientCnpjLookup();
      this.setupProspectCnpjLookup();
      
      // If it has inputs or dropdowns, we should populate them
      if (pageName === 'movimentacao') {
        this.fillMovEquipmentDropdown();
        UI.populateMovementClientsDropdown();
      } else if (pageName === 'chamados') {
        this.fillEquipmentsDropdown();
      } else if (pageName === 'usuarios') {
        UI.renderUsers();
      } else if (pageName === 'unidades') {
        UI.renderUnits();
      } else if (pageName === 'configuracoes') {
        UI.renderConfigSettings();
        this.loadConfigEmails();
      } else if (pageName === 'empresa') {
        this.loadCompanyIdentityForm();
      } else if (pageName === 'simulador-troca') {
        this.initSimuladorTroca();
      } else if (pageName === 'solicitacao-despesas') {
        this.initSolicitacaoForm();
      }
      
      // Re-run identity settings in case page contains brand images/logos
      this.setupIdentity();
      
      // Proactively populate unit dropdowns for new elements
      UI.populateUnitDropdowns();
      UI.populateConfigDropdowns();

    } catch (err) {
      console.error(`Error loading page ${pageName}:`, err);
      panel.innerHTML = `
        <div class="error-wrapper-view" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; gap: 16px; color: var(--danger);">
          <span style="font-family: var(--font-title); font-size: 1rem; font-weight: 600;">Falha ao carregar módulo</span>
          <p style="font-size: 0.8rem; text-align: center; max-width: 320px; color: var(--text-muted);">${err.message}</p>
          <button class="btn btn-primary" onclick="window.location.reload()">Recarregar Sistema</button>
        </div>
      `;
      throw err;
    }
  },

  /**
   * Route state change side effects
   */
  onRouteChanged(hash) {
    const headerTitle = document.getElementById('header-page-title');
    if (!headerTitle) return;

    switch(hash) {
      case '#dashboard':
        headerTitle.textContent = 'Painel Geral';
        UI.renderDashboard();
        // Em acesso direto/F5, a página pode ser montada depois do primeiro render.
        // Recarrega os dados da rota atual sempre que a rota abre.
        this.loadProspects();
        this.loadExpenses();
        this.loadBalances();
        this.loadTickets();
        this.loadMovements();
        break;
      case '#prospeccao':
        headerTitle.textContent = 'Prospecção de Clientes (Leads)';
        this.loadProspects();
        break;
      case '#clientes':
        headerTitle.textContent = 'Gestão de Clientes';
        // Garante que clientes e fila de aprovação apareçam sem precisar apertar F5.
        if (Store.syncAllFromBackend) {
          Store.syncAllFromBackend({ forceRemote: true }).finally(() => {
            const clients = Store.getClients();
            UI.renderClients(clients);
            UI.renderApprovals(clients);
          });
        } else {
          const clients = Store.getClients();
          UI.renderClients(clients);
          UI.renderApprovals(clients);
        }
        break;
      case '#aprovacao':
        headerTitle.textContent = 'Aprovação de Novos Cadastros';
        if (Store.syncAllFromBackend) {
          Store.syncAllFromBackend({ forceRemote: true }).finally(() => {
            const clients = Store.getClients();
            UI.renderClients(clients);
            UI.renderApprovals(clients);
          });
        }
        break;
      case '#equipamentos':
        headerTitle.textContent = 'Controle de Equipamentos';
        UI.renderEquipments(Store.getEquipments());
        this.loadMovements();
        break;
      case '#movimentacao':
        headerTitle.textContent = 'Movimentação de Equipamentos';
        this.fillMovEquipmentDropdown();
        UI.populateUnitDropdowns();
        UI.populateMovementCompanyDropdown();
        
        // Prefill logged seller responsavel
        const sellerInput = document.getElementById('mov-vendedor-solicitante');
        const loggedUser = Store.getLoggedUser();
        if (sellerInput && loggedUser) {
          sellerInput.value = loggedUser.name;
        }

        this.loadMovements();
        break;
      case '#chamados':
        headerTitle.textContent = 'Chamados Mecânicos';
        this.fillEquipmentsDropdown();
        this.loadTickets();
        // Auto-fill mechanic name from logged user
        {
          const mechInput = document.getElementById('ticket-mechanic');
          const loggedU = Store.getLoggedUser();
          if (mechInput && loggedU) mechInput.value = loggedU.name;
          // Auto-fill today's date
          const startDate = document.getElementById('ticket-start-date');
          if (startDate && !startDate.value) {
            startDate.value = new Date().toISOString().split('T')[0];
          }
          // Auto-fill current time
          const startTime = document.getElementById('ticket-start-time');
          if (startTime && !startTime.value) {
            const now = new Date();
            startTime.value = now.toTimeString().slice(0,5);
          }
        }
        break;
      case '#despesas':
        headerTitle.textContent = 'Despesas de Campo';
        this.loadExpenses();
        this.loadBalances();
        break;
      case '#solicitacao-despesas':
        headerTitle.textContent = 'Solicitação de Saldo';
        this.initSolicitacaoForm();
        break;
      case '#despesas-dashboard':
        headerTitle.textContent = 'Dashboard de Despesas';
        this.loadDespesasDashboard();
        break;
      case '#notificacoes':
        headerTitle.textContent = 'Notificações';
        if (window.App && App.loadNotificationPage) {
          App.loadNotificationPage();
        }
        break;
      case '#exportacao-arquivos':
        headerTitle.textContent = 'Exportação de Mídias e Documentos';
        if (window.FiltersManager && FiltersManager.renderExportacaoArquivosPage) {
          FiltersManager.renderExportacaoArquivosPage();
        }
        break;
      case '#relatorios':
        headerTitle.textContent = 'Relatórios Gerenciais';
        if (Store.syncAllFromBackend) Store.syncAllFromBackend({ forceRemote: true }).then(() => UI.renderDashboard());
        break;
      case '#unidades':
        headerTitle.textContent = 'Gestão de Unidades (Filiais)';
        UI.renderUnits();
        break;
      case '#usuarios':
        headerTitle.textContent = 'Gestão de Usuários (Acessos)';
        UI.renderUsers();
        break;
      case '#empresa':
        headerTitle.textContent = 'Identidade da Empresa';
        this.loadCompanyIdentityForm();
        break;
      case '#configuracoes':
        headerTitle.textContent = 'Configurações Gerais';
        UI.renderConfigSettings();
        this.loadConfigEmails();
        break;
      case '#pdf':
        headerTitle.textContent = 'Documento de Impressão';
        break;
      case '#simulador-troca':
        headerTitle.textContent = 'Simulador de Troca de Mercadoria';
        this.initSimuladorTroca();
        break;
    }
  },

  /**
   * Loads Company configurations into page elements
   */
  setupIdentity() {
    const config = Store.getCompanyIdentity();
    UI.applyCompanyIdentity(config);
  },

  /**
   * Load Identity form values
   */
  loadCompanyIdentityForm() {
    const config = Store.getCompanyIdentity();
    document.getElementById('comp-name').value = config.name;
    document.getElementById('comp-cnpj').value = config.cnpj;
    document.getElementById('comp-phone').value = config.phone;
    document.getElementById('comp-email').value = config.email;

    this.logoBase64Cache = config.logo;
    const preview = document.getElementById('form-logo-preview');
    if (preview) preview.src = config.logo;
  },

  /**
   * Fills equipment type select in movement form
   */
  fillMovEquipmentDropdown() {
    const select = document.getElementById('mov-modelo-adicao') || document.getElementById('mov-equipment-type');
    if (!select) return;
    const types = Store.getEquipmentTypes();
    select.innerHTML = '<option value="" selected disabled>Selecione o modelo...</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');

    // Also populate unit dropdown
    const unitSel = document.getElementById('mov-unit');
    if (unitSel) {
      const units = Store.getUnits();
      unitSel.innerHTML = units.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    }

    // Set default date to today
    const dateInput = document.getElementById('mov-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
  },

  fillEquipmentsDropdown() {
    return; // Obsolete: patrimonio typed manually
  },

  _renderTicketSerialOptions(selectedType) {
    return; // Obsolete: patrimonio typed manually
  },


  /**
   * Consulta CNPJ na BrasilAPI e preenche os dados cadastrais do cliente.
   * Os campos preenchidos pela API ficam bloqueados para preservar o dado oficial.
   */
  setupClientCnpjLookup() {
    const cnpjInput = document.getElementById('client-cnpj');
    if (!cnpjInput || cnpjInput.dataset.lookupBound === '1') return;
    cnpjInput.dataset.lookupBound = '1';

    const statusEl = document.getElementById('client-cnpj-status');
    let timer = null;
    let lastLookup = '';

    const setStatus = (msg, color = 'var(--text-muted)') => {
      if (statusEl) {
        statusEl.textContent = msg || '';
        statusEl.style.color = color;
      }
    };

    const formatCnpj = (value) => {
      const digits = (value || '').replace(/\D/g, '').slice(0, 14);
      return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    };

    const setApiValue = (id, value) => {
      const el = document.getElementById(id);
      if (!el || value === undefined || value === null || String(value).trim() === '') return;
      el.value = String(value).trim();
      el.readOnly = true;
      el.dataset.cnpjApiLocked = '1';
      el.style.backgroundColor = 'rgba(255,255,255,0.04)';
      el.title = 'Campo preenchido automaticamente pela API do CNPJ.';
    };

    const unlockPreviousApiValues = () => {
      document.querySelectorAll('[data-cnpj-api-locked="1"]').forEach(el => {
        el.readOnly = false;
        el.removeAttribute('data-cnpj-api-locked');
        el.style.backgroundColor = '';
        el.title = '';
      });
    };

    const buildAddress = (data) => {
      const street = data.logradouro || '';
      const number = data.numero || '';
      const district = data.bairro || '';
      const city = data.municipio || '';
      const uf = data.uf || '';
      const cep = data.cep || '';
      return [street, number, district, city && uf ? `${city}/${uf}` : city || uf, cep ? `CEP ${cep}` : '']
        .filter(Boolean)
        .join(', ');
    };

    const fillFromCnpj = (data) => {
      const fantasia = data.nome_fantasia || data.fantasia || '';
      const razao = data.razao_social || data.nome || '';
      if (!document.getElementById('client-name')?.value && fantasia) setApiValue('client-name', fantasia);
      setApiValue('client-company-name', razao || fantasia);
      setApiValue('client-email', data.email || '');
      setApiValue('client-phone', data.ddd_telefone_1 || data.telefone || '');
      setApiValue('client-ie', data.inscricao_estadual || data.inscricao_estadual_principal || '');
      setApiValue('client-city', data.municipio || '');
      setApiValue('client-state', data.uf || '');
      setApiValue('client-cep', data.cep || '');
      setApiValue('client-street', data.logradouro || '');
      setApiValue('client-number', data.numero || '');
      setApiValue('client-neighborhood', data.bairro || '');
      setApiValue('client-address-full', buildAddress(data));
    };

    const lookup = async () => {
      const digits = (cnpjInput.value || '').replace(/\D/g, '');
      if (!digits) {
        unlockPreviousApiValues();
        setStatus('');
        lastLookup = '';
        return;
      }
      if (digits.length !== 14) {
        unlockPreviousApiValues();
        setStatus('Digite os 14 números do CNPJ.');
        lastLookup = '';
        return;
      }
      if (digits === lastLookup) return;
      lastLookup = digits;

      unlockPreviousApiValues();
      setStatus('Consultando CNPJ...', 'var(--primary-color)');

      try {
        const data = await this.fetchFromApi(`/api/cnpj/${digits}`);
        // data já vem com logradouro, numero, bairro, cep, municipio, uf, etc.
        // fillFromCnpj espera: nome_fantasia, razao_social, ddd_telefone_1, municipio, uf,
        //                      cep, logradouro, numero, bairro, inscricao_estadual
        fillFromCnpj({
          nome_fantasia: data.nome_fantasia || data.nomeFantasia || '',
          razao_social:  data.razao_social  || data.razaoSocial  || '',
          email:         data.email         || '',
          ddd_telefone_1:data.telefone      || '',
          municipio:     data.cidade        || data.municipio    || '',
          uf:            data.estado        || data.uf           || '',
          cep:           data.cep           || '',
          logradouro:    data.logradouro    || '',
          numero:        data.numero        || '',
          bairro:        data.bairro        || '',
          inscricao_estadual: data.inscricao_estadual || ''
        });
        setStatus('Dados do CNPJ preenchidos automaticamente.', 'var(--success-color, #10b981)');
      } catch (error) {
        console.error('Erro ao consultar CNPJ:', error);
        setStatus('Não foi possível buscar este CNPJ. Preencha manualmente.', 'var(--danger-color, #ef4444)');
      }
    };


    cnpjInput.addEventListener('input', () => {
      cnpjInput.value = formatCnpj(cnpjInput.value);
      clearTimeout(timer);
      timer = setTimeout(lookup, 700);
    });
    cnpjInput.addEventListener('blur', lookup);
  },

  setupProspectCnpjLookup() {
    const checkbox = document.getElementById('prosp-has-cnpj');
    const fields = document.getElementById('prosp-cnpj-fields');
    const cnpjInput = document.getElementById('prosp-cnpj');
    if (!checkbox || !fields || !cnpjInput || checkbox.dataset.lookupBound === '1') return;
    checkbox.dataset.lookupBound = '1';

    const statusEl = document.getElementById('prosp-cnpj-status');
    let timer = null;
    let lastLookup = '';

    const setStatus = (msg, color = 'var(--text-muted)') => {
      if (statusEl) {
        statusEl.textContent = msg || '';
        statusEl.style.color = color;
      }
    };

    const formatCnpj = (value) => {
      const digits = (value || '').replace(/\D/g, '').slice(0, 14);
      return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    };

    const setValue = (id, value, lock = false) => {
      const el = document.getElementById(id);
      if (!el || value === undefined || value === null || String(value).trim() === '') return;
      el.value = String(value).trim();
      if (lock) {
        el.readOnly = true;
        el.dataset.cnpjApiLockedProspect = '1';
        el.style.backgroundColor = 'rgba(255,255,255,0.04)';
      }
    };

    const unlock = () => {
      document.querySelectorAll('[data-cnpj-api-locked-prospect="1"]').forEach(el => {
        el.readOnly = false;
        el.removeAttribute('data-cnpj-api-locked-prospect');
        el.style.backgroundColor = '';
      });
    };

    const fill = (data) => {
      setValue('prosp-razao-social', data.razao_social || data.razaoSocial || data.nome || '', true);
      setValue('prosp-nome-fantasia', data.nome_fantasia || data.nomeFantasia || data.fantasia || '', true);
      setValue('prosp-name', data.nome_fantasia || data.nomeFantasia || data.fantasia || data.razao_social || data.razaoSocial || data.nome || '', false);
      setValue('prosp-phone', data.telefone || data.ddd_telefone_1 || '', false);
      setValue('prosp-city', data.cidade || data.municipio || '', false);
      setValue('prosp-zipcode', data.cep || '', true);
      setValue('prosp-address', data.logradouro || '', true);
      setValue('prosp-number', data.numero || '', true);
      setValue('prosp-neighborhood', data.bairro || '', true);
      setValue('prosp-cnae', data.cnae_principal || data.cnaePrincipal || '', true);
      setValue('prosp-cnae-desc', data.cnae_descricao || data.cnaeDescricao || '', true);
    };

    const lookup = async () => {
      const digits = (cnpjInput.value || '').replace(/\D/g, '');
      if (digits.length !== 14) {
        unlock();
        setStatus(digits.length ? 'Digite os 14 números do CNPJ.' : '');
        lastLookup = '';
        return;
      }
      if (digits === lastLookup) return;
      lastLookup = digits;

      unlock();
      setStatus('Consultando CNPJ...', 'var(--primary-color)');
      try {
        const data = await this.fetchFromApi(`/api/cnpj/${digits}`);
        fill(data);
        setStatus('CNPJ encontrado. Endereço, CNAE e dados principais preenchidos.', 'var(--success-color, #10b981)');
      } catch (error) {
        console.error('Erro ao consultar CNPJ na prospecção:', error);
        setStatus('Não foi possível buscar este CNPJ. Preencha manualmente.', 'var(--danger-color, #ef4444)');
      }
    };

    checkbox.addEventListener('change', () => {
      fields.style.display = checkbox.checked ? 'grid' : 'none';
      if (!checkbox.checked) {
        cnpjInput.value = '';
        setStatus('');
        unlock();
        ['prosp-razao-social','prosp-nome-fantasia','prosp-zipcode','prosp-address','prosp-number','prosp-neighborhood','prosp-cnae','prosp-cnae-desc'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
      }
    });

    cnpjInput.addEventListener('input', () => {
      cnpjInput.value = formatCnpj(cnpjInput.value);
      clearTimeout(timer);
      timer = setTimeout(lookup, 700);
    });
    cnpjInput.addEventListener('blur', lookup);
  },

  /**
   * Setup form submit event listeners
   */
  setupEventListeners() {
    // Mobile Sidebar Toggle
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (btnToggleSidebar && sidebar && overlay && !btnToggleSidebar.dataset.bound) {
      btnToggleSidebar.dataset.bound = 'true';
      btnToggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
      });
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      });
    }

    // 1. Login Form Submit
    const loginForm = document.getElementById('login-form');
    if (loginForm && !loginForm.dataset.bound) {
      loginForm.dataset.bound = 'true';
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const pass = document.getElementById('login-password').value;
        const identity = Store.getCompanyIdentity();

        try {
          const result = await this.fetchFromApi('/api/login', {
            method: 'POST',
            body: JSON.stringify({
              username,
              password: pass,
              // Envia a empresa atual só como referência. O backend agora localiza o login
              // mesmo se o nome/CNPJ da empresa foi alterado depois do cadastro.
              empresa_id: (identity && identity.cnpj) || '001'
            })
          });

          Store.setLoggedUser(result.user, result.token);
          // Não use empresa_id como nome visual da empresa.
          // O usuário deve guardar apenas o vínculo; nome/logo/CNPJ vêm da identidade salva no banco.
          this.isLoggedIn = true;
          if (Store.syncAllFromBackend) {
            await Store.syncAllFromBackend({ forceRemote: true });
            UI.applyCompanyIdentity(Store.getCompanyIdentity());
          }
          UI.applyPermissions();
          this.startAutoSync();
          const loginUserEl = document.getElementById('login-username');
          const loginPassEl = document.getElementById('login-password');
          if (loginUserEl) loginUserEl.value = '';
          if (loginPassEl) loginPassEl.value = '';
          window.location.hash = '#dashboard';
          this.refreshAllLists();
        } catch (err) {
          console.error(err);
          Store.clearLoggedUser();
          this.isLoggedIn = false;
          // If 403 status is returned, show the pending message
          if (err.message.includes('liberação') || err.message.includes('aguarda')) {
            alert('Acesso negado: Seu acesso aguarda aprovação gerencial.');
          } else if (err.message.includes('inativo') || err.message.includes('excluído') || err.message.includes('desativado')) {
            alert('Seu acesso foi desativado por um administrador. Entre em contato com o responsável pelo sistema.');
          } else {
            alert('Erro ao fazer login: ' + err.message);
          }
        }
      });
    }

    // Atualiza permissões/status em tempo real quando um administrador altera este usuário em outra aba.
    if (!window.__controleCampoUserSyncBound) {
      window.__controleCampoUserSyncBound = true;
      window.addEventListener('storage', (ev) => {
        if (!ev.key || !ev.key.startsWith('controle_campo_user_updated_')) return;
        const current = Store.getLoggedUser();
        if (current && ev.key === `controle_campo_user_updated_${current.id}`) {
          this.refreshLoggedUserFromApi();
        }
      });
    }

    // 2. Logout trigger
    const logoutBtn = document.getElementById('sidebar-logout');
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = 'true';
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        Store.clearLoggedUser();
        this.isLoggedIn = false;
        const loginUserEl = document.getElementById('login-username');
        const loginPassEl = document.getElementById('login-password');
        if (loginUserEl) loginUserEl.value = '';
        if (loginPassEl) loginPassEl.value = '';
        window.location.hash = '#login';
      });
    }

    // Editar o próprio perfil pelo rodapé do menu
    const sidebarUserProfile = document.getElementById('sidebar-user-profile');
    if (sidebarUserProfile && !sidebarUserProfile.dataset.bound) {
      sidebarUserProfile.dataset.bound = 'true';
      sidebarUserProfile.addEventListener('click', () => {
        const loggedUser = Store.getLoggedUser();
        if (loggedUser && loggedUser.id) {
          this.openUserPermissionsModal(loggedUser.id, { selfEdit: true });
        }
      });
    }

    // 3. Company Identity Form Submit
    const identityForm = document.getElementById('company-identity-form');
    if (identityForm && identityForm.dataset.bound !== '1') {
      identityForm.dataset.bound = '1';
      identityForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let logoValue = this.logoBase64Cache;
        try {
          if (logoValue && String(logoValue).startsWith('data:')) {
            logoValue = await this.uploadBase64ToDatabase(logoValue, 'logo-empresa.png', 'empresa');
            this.logoBase64Cache = logoValue;
          }
        } catch (err) {
          console.error('Erro ao salvar logo:', err);
          alert('Não consegui salvar a logo. Tente uma imagem menor ou outro formato.');
          return;
        }

        const config = {
          name: document.getElementById('comp-name').value,
          logo: logoValue,
          cnpj: document.getElementById('comp-cnpj').value,
          phone: document.getElementById('comp-phone').value,
          email: document.getElementById('comp-email').value
        };

        if (Store.saveCompanyIdentity(config)) {
          UI.applyCompanyIdentity(config);
          this.showToast('Identidade salva com sucesso!');
        }
      });
    }

    // 4. Logo File upload handler
    const fileInput = document.getElementById('logo-upload-input');
    const preview = document.getElementById('form-logo-preview');
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          if (!file.type.match('image.*')) {
            alert('Escolha uma imagem válida.');
            return;
          }
          try {
            const base64 = await Store.fileToBase64(file);
            this.logoBase64Cache = base64;
            if (preview) preview.src = base64;
          } catch(err) {
            console.error(err);
          }
        }
      });
    }

    // 5. Add Prospect Form Submit
    const prospectForm = document.getElementById('prospect-form');
    if (prospectForm && prospectForm.dataset.submitBound !== '1') {
      prospectForm.dataset.submitBound = '1';
      prospectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (prospectForm.dataset.saving === '1') return;
        prospectForm.dataset.saving = '1';
        const submitBtn = prospectForm.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Salvando...';
        }

        try {
          const hasCnpj = !!document.getElementById('prosp-has-cnpj')?.checked;
          const name = document.getElementById('prosp-name').value;
          const contact = document.getElementById('prosp-contact').value;
          const phone = document.getElementById('prosp-phone').value;
          const city = document.getElementById('prosp-city').value;
          const neighborhood = hasCnpj ? (document.getElementById('prosp-neighborhood')?.value || '') : '';
          const address = hasCnpj ? (document.getElementById('prosp-address')?.value || '') : '';
          const number = hasCnpj ? (document.getElementById('prosp-number')?.value || '') : '';
          const zipcode = hasCnpj ? (document.getElementById('prosp-zipcode')?.value || '') : '';
          const category = document.getElementById('prosp-category').value;
          const competitor = document.getElementById('prosp-competitor').value;
          const observation = document.getElementById('prosp-observation').value;
          const loggedUser = Store.getLoggedUser();
          let unitId = document.getElementById('prosp-unit').value;
          if (loggedUser && loggedUser.profile === 'Vendedor' && loggedUser.unitId !== 'all') {
            unitId = loggedUser.unitId;
          }

          const prospSellerSelect = document.getElementById('prosp-seller');
          const userId = loggedUser.profile === 'Vendedor' ? loggedUser.id : (prospSellerSelect ? prospSellerSelect.value : '');

          let photoUrl = '';
          const fileInput = document.getElementById('prosp-photo');
          if (fileInput && fileInput.files && fileInput.files[0]) {
            try {
              const base64 = await Store.fileToBase64(fileInput.files[0]);
              photoUrl = await this.uploadBase64ToDatabase(base64, fileInput.files[0].name, 'prospeccao');
            } catch (err) {
              console.error('Erro ao salvar imagem da fachada:', err);
              this.showToast('A imagem não foi salva. Verifique o tamanho do arquivo.', 'error');
            }
          }

          const newLead = {
            id: 'PR-' + Date.now(),
            name,
            contact,
            phone,
            city,
            neighborhood,
            address,
            number,
            zipcode,
            category,
            competitor,
            observation,
            photo: photoUrl,
            status: 'prospectado',
            unitId,
            userId,
            lossReason: '',
            hasCnpj,
            cnpj: hasCnpj ? (document.getElementById('prosp-cnpj')?.value || '') : '',
            razaoSocial: hasCnpj ? (document.getElementById('prosp-razao-social')?.value || '') : '',
            nomeFantasia: hasCnpj ? (document.getElementById('prosp-nome-fantasia')?.value || '') : '',
            cnaePrincipal: hasCnpj ? (document.getElementById('prosp-cnae')?.value || '') : '',
            cnaeDescricao: hasCnpj ? (document.getElementById('prosp-cnae-desc')?.value || '') : '',
            date: new Date().toISOString().split('T')[0],
            time: new Date().toTimeString().slice(0, 5),
            createdAt: new Date().toISOString()
          };

          const savedLead = await this.fetchFromApi('/api/prospeccoes', {
            method: 'POST',
            body: JSON.stringify(newLead)
          });

          const prospects = Store.getProspects().filter(p => p.id !== savedLead.id);
          prospects.push(savedLead);
          Store.saveProspects(prospects);
          await this.loadProspects();
          prospectForm.reset();
          UI.populateUnitDropdowns();

          const cnpjFields = document.getElementById('prosp-cnpj-fields');
          if (cnpjFields) cnpjFields.style.display = 'none';
          const previewContainer = document.getElementById('prosp-photo-preview-container');
          if (previewContainer) previewContainer.style.display = 'none';

          const formContainer = document.getElementById('prospect-form-container');
          if (formContainer) formContainer.classList.add('hidden');

          this.showToast('Lead comercial salvo no banco com sucesso!');
        } catch (err) {
          console.error('Erro ao salvar lead:', err);
          this.showToast(err.message || 'Erro ao salvar lead no banco.', 'error');
        } finally {
          prospectForm.dataset.saving = '0';
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Registrar Lead Comercial';
          }
        }
      });
    }

    // Facade photo preview handler
    const prospPhotoInput = document.getElementById('prosp-photo');
    const prospPhotoPreview = document.getElementById('prosp-photo-preview');
    const prospPhotoPreviewContainer = document.getElementById('prosp-photo-preview-container');
    if (prospPhotoInput && prospPhotoPreview && prospPhotoPreviewContainer) {
      prospPhotoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            const base64 = await Store.fileToBase64(file);
            prospPhotoPreview.src = base64;
            prospPhotoPreviewContainer.style.display = 'block';
          } catch (err) {
            console.error(err);
          }
        } else {
          prospPhotoPreviewContainer.style.display = 'none';
        }
      });
    }

    // 6. Add Client Form Submit
    const clientForm = document.getElementById('client-form');
    if (clientForm && clientForm.dataset.submitBound !== '1') {
      clientForm.dataset.submitBound = '1';
      clientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (this._clientSubmitting) return;
        this._clientSubmitting = true;
        const clientSubmitBtn = clientForm.querySelector('button[type="submit"]');
        if (clientSubmitBtn) { clientSubmitBtn.disabled = true; clientSubmitBtn.dataset.originalText = clientSubmitBtn.textContent; clientSubmitBtn.textContent = 'Salvando...'; }
        try {
        const name = document.getElementById('client-name').value;
        const cnpj = document.getElementById('client-cnpj').value;
        const phone = document.getElementById('client-phone').value;
        const email = document.getElementById('client-email').value;
        const loggedUser = Store.getLoggedUser();
        let unitId = document.getElementById('client-unit').value;
        if (loggedUser && loggedUser.profile === 'Vendedor' && loggedUser.unitId !== 'all') {
          unitId = loggedUser.unitId;
        }
        const category = App.normalizeConfigText(document.getElementById('client-category').value);

        // Commercial fields
        const companyName = document.getElementById('client-company-name').value;
        const ie = document.getElementById('client-ie').value;
        const city = document.getElementById('client-city').value;
        const state = document.getElementById('client-state') ? document.getElementById('client-state').value : '';
        const cep = document.getElementById('client-cep') ? document.getElementById('client-cep').value : '';
        const street = document.getElementById('client-street') ? document.getElementById('client-street').value : '';
        const number = document.getElementById('client-number') ? document.getElementById('client-number').value : '';
        const neighborhood = document.getElementById('client-neighborhood') ? document.getElementById('client-neighborhood').value : '';
        const addressFull = document.getElementById('client-address-full') ? document.getElementById('client-address-full').value : '';
        const locationType = document.getElementById('client-location-type').value;
        const pavementType = document.getElementById('client-pavement-type').value;
        const deliverySchedule = document.getElementById('client-delivery-schedule').value;
        const nearbyAmaretto = document.getElementById('client-nearby-amaretto').value;
        const nearbyCompetitor = document.getElementById('client-nearby-competitor').value;
        const iceCreamExperience = document.getElementById('client-ice-cream-experience').value;
        const dualBrandPreference = document.getElementById('client-dual-brand-preference').value;
        const equipmentQty = document.getElementById('client-equipment-qty').value;
        const requestedEqType = document.getElementById('client-requested-eq-type').value;
        const sendableEqType = document.getElementById('client-sendable-eq-type').value;
        
        // Products checkboxes array
        const products = Array.from(document.querySelectorAll('input[name="client-products"]:checked')).map(el => el.value);
        
        const predictedAverage = parseFloat(document.getElementById('client-predicted-average').value) || 0;
        const firstOrderValue = parseFloat(document.getElementById('client-first-order-value').value) || 0;
        const firstOrderPayment = document.getElementById('client-first-order-payment').value;
        const firstOrderReason = document.getElementById('client-first-order-reason') ? document.getElementById('client-first-order-reason').value.trim() : '';
        const repurchasePayment = document.getElementById('client-repurchase-payment').value;
        const hasBonus = document.getElementById('client-has-bonus').value;
        const bonusValue = parseFloat(document.getElementById('client-bonus-value')?.value || '0') || 0;
        const sellerAnalysis = document.getElementById('client-seller-analysis').value;
        const route = (document.getElementById('client-route') ? document.getElementById('client-route').value : '');

        if (firstOrderPayment === 'Boleto' && !firstOrderReason) {
          alert('Por favor, informe o Motivo para não ser à vista no Primeiro Pedido.');
          return;
        }
        if (hasBonus === 'Sim') {
          if (!bonusValue || bonusValue <= 0) { alert('Informe o valor da bonificação.'); return; }
          if (firstOrderValue > 0 && bonusValue > firstOrderValue) { alert('A bonificação não pode ser maior que o valor da primeira compra.'); return; }
        }

        const userId = loggedUser.profile === 'Vendedor' ? loggedUser.id : document.getElementById('client-seller').value;

        // CNPJ without punctuation for folder naming in URL
        const cnpjVal = cnpj.replace(/\D/g, '') || '00000000000000';

        // Fotos permanentes do cadastro: salva TODAS no PostgreSQL/app_uploads em PARALELO.
        // Upload paralelo é muito mais rápido e evita timeouts do servidor.
        const suffixes = ['fachada', 'interna01', 'interna02', 'interna03', 'rua01', 'rua02', 'cnpj'];
        const photoUrls = {};
        const failedPhotos = [];

        // Primeiro comprime TODAS as fotos em paralelo
        const compressResults = await Promise.allSettled(
          suffixes.map(async (suffix) => {
            const fileInput = document.getElementById(`client-photo-${suffix}`);
            if (fileInput && fileInput.files && fileInput.files[0]) {
              const file = fileInput.files[0];
              const base64 = await this.compressImageAndGetBase64(file);
              return { suffix, base64, filename: file.name || 'foto' };
            }
            return { suffix, base64: null, filename: null };
          })
        );

        // Depois faz upload de todas em paralelo
        const uploadResults = await Promise.allSettled(
          compressResults.map(async (result) => {
            if (result.status !== 'fulfilled' || !result.value.base64) {
              return { suffix: result.value?.suffix || '?', url: '' };
            }
            const { suffix, base64, filename } = result.value;
            const savedUrl = await this.uploadBase64ToDatabase(base64, `cliente-${cnpjVal}-${suffix}-${filename}`, 'clientes');
            return { suffix, url: savedUrl || '' };
          })
        );

        // Coleta os resultados
        uploadResults.forEach((result, i) => {
          const suffix = suffixes[i];
          if (result.status === 'fulfilled' && result.value.url) {
            photoUrls[suffix] = result.value.url;
          } else {
            photoUrls[suffix] = '';
            // Só conta como falha se o usuário escolheu um arquivo
            const fileInput = document.getElementById(`client-photo-${suffix}`);
            if (fileInput && fileInput.files && fileInput.files[0]) {
              console.error(`Erro ao salvar foto do cliente (${suffix}):`, result.reason || 'url vazia');
              failedPhotos.push(suffix);
            }
          }
        });

        const clients = Store.getClients();
        const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
        if (cnpjLimpo && clients.some(c => String(c.unitId) === String(unitId) && String(c.cnpj || '').replace(/\D/g, '') === cnpjLimpo)) {
          alert('Já existe cliente com este CNPJ nesta unidade.');
          return;
        }
        const newClient = {
          id: 'CL-' + Math.floor(100 + Math.random() * 900),
          name,
          cnpj,
          phone,
          email,
          status: 'Pendente', // Sent to manager queue
          unitId,
          userId,
          date: new Date().toLocaleDateString('pt-BR'),
          category,
          companyName,
          ie,
          city,
          state,
          cep,
          street,
          number,
          neighborhood,
          addressFull,
          locationType,
          pavementType,
          deliverySchedule,
          nearbyAmaretto,
          nearbyCompetitor,
          iceCreamExperience,
          dualBrandPreference,
          equipmentQty,
          requestedEqType,
          sendableEqType,
          products,
          predictedAverage,
          firstOrderValue,
          firstOrderPayment,
          firstOrderReason,
          repurchasePayment,
          hasBonus,
          bonusValue,
          sellerAnalysis,
          route,
          rejectionReason: '',
          
          // Photo link strings
          photoFachada: photoUrls.fachada,
          photoInterna01: photoUrls.interna01,
          photoInterna02: photoUrls.interna02,
          photoInterna03: photoUrls.interna03,
          photoRua01: photoUrls.rua01,
          photoRua02: photoUrls.rua02,
          photoCnpj: photoUrls.cnpj,
        };

        // Calculate scoring for the new client
        const scoringResult = window.Scoring.calculate(newClient);
        newClient.score = scoringResult.score;
        newClient.classification = scoringResult.classification;

        clients.push(newClient);
        Store.saveClients(clients);
        this.refreshAllLists();
        clientForm.reset();
        document.querySelectorAll('[data-cnpj-api-locked="1"]').forEach(el => {
          el.readOnly = false;
          el.removeAttribute('data-cnpj-api-locked');
          el.style.backgroundColor = '';
          el.title = '';
        });
        const cnpjStatus = document.getElementById('client-cnpj-status');
        if (cnpjStatus) cnpjStatus.textContent = '';
        UI.populateUnitDropdowns();

        // Clear previews
        suffixes.forEach(suffix => {
          const container = document.getElementById(`preview-container-${suffix}`);
          const previewImg = document.getElementById(`preview-img-${suffix}`);
          if (container) container.style.display = 'none';
          if (previewImg) previewImg.src = '';
        });

        // Esconder o formulário após envio
        const formContainer = document.getElementById('client-form-container');
        if (formContainer) formContainer.classList.add('hidden');

        if (failedPhotos.length) {
          alert('Cadastro salvo, mas algumas fotos não foram salvas: ' + failedPhotos.join(', ') + '. Tente reenviar somente essas fotos na edição do cliente.');
        }
        this.showToast('Cadastro comercial completo enviado para aprovação!');
        } catch (err) {
          console.error(err);
          alert('Erro ao salvar cadastro do cliente: ' + (err.message || err));
        } finally {
          this._clientSubmitting = false;
          if (clientSubmitBtn) { clientSubmitBtn.disabled = false; clientSubmitBtn.textContent = clientSubmitBtn.dataset.originalText || 'Cadastrar Cliente'; }
        }
      });
    }

    // Forma de pagamento Primeiro Pedido toggle reason field
    const firstOrderPaymentSelect = document.getElementById('client-first-order-payment');
    const firstOrderReasonContainer = document.getElementById('client-first-order-reason-container');
    const firstOrderReasonInput = document.getElementById('client-first-order-reason');
    if (firstOrderPaymentSelect) {
      firstOrderPaymentSelect.addEventListener('change', (e) => {
        if (e.target.value === 'Boleto') {
          if (firstOrderReasonContainer) firstOrderReasonContainer.style.display = 'block';
          if (firstOrderReasonInput) firstOrderReasonInput.setAttribute('required', '');
        } else {
          if (firstOrderReasonContainer) firstOrderReasonContainer.style.display = 'none';
          if (firstOrderReasonInput) {
            firstOrderReasonInput.removeAttribute('required');
            firstOrderReasonInput.value = '';
          }
        }
      });
    }


    // Bonificação: se escolher Sim, exigir valor da bonificação para o score
    const hasBonusSelect = document.getElementById('client-has-bonus');
    const bonusContainer = document.getElementById('client-bonus-value-container');
    const bonusInput = document.getElementById('client-bonus-value');
    if (hasBonusSelect && !hasBonusSelect.dataset.boundBonus) {
      hasBonusSelect.dataset.boundBonus = '1';
      hasBonusSelect.addEventListener('change', () => {
        const show = hasBonusSelect.value === 'Sim';
        if (bonusContainer) bonusContainer.style.display = show ? 'grid' : 'none';
        if (bonusInput) {
          bonusInput.required = show;
          if (!show) bonusInput.value = '';
        }
      });
    }

    // Botão ABRIR formulário de cadastro de cliente
    const btnOpenClientForm = document.getElementById('btn-open-client-form');
    if (btnOpenClientForm) {
      btnOpenClientForm.addEventListener('click', () => {
        const formContainer = document.getElementById('client-form-container');
        if (formContainer) {
          formContainer.classList.remove('hidden');
          formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    // Botão CANCELAR formulário de cadastro de cliente
    const btnCancelClientForm = document.getElementById('btn-cancel-client-form');
    if (btnCancelClientForm) {
      btnCancelClientForm.addEventListener('click', () => {
        const formContainer = document.getElementById('client-form-container');
        const clientFormEl = document.getElementById('client-form');
        if (formContainer) formContainer.classList.add('hidden');
        if (clientFormEl) {
          clientFormEl.reset();
          UI.populateUnitDropdowns();
        }
      });
    }

    // Prospecção Form Toggle
    const btnOpenProspectForm = document.getElementById('btn-open-prospect-form');
    if (btnOpenProspectForm) {
      btnOpenProspectForm.addEventListener('click', () => {
        const formContainer = document.getElementById('prospect-form-container');
        if (formContainer) {
          formContainer.classList.remove('hidden');
          formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
    const btnCancelProspectForm = document.getElementById('btn-cancel-prospect-form');
    if (btnCancelProspectForm) {
      btnCancelProspectForm.addEventListener('click', () => {
        const formContainer = document.getElementById('prospect-form-container');
        const formEl = document.getElementById('prospect-form');
        if (formContainer) formContainer.classList.add('hidden');
        if (formEl) {
          formEl.reset();
          UI.populateUnitDropdowns();
        }
        const previewCont = document.getElementById('prosp-photo-preview-container');
        if (previewCont) previewCont.style.display = 'none';
      });
    }

    // Chamados Mecânicos Form Toggle
    const btnOpenTicketForm = document.getElementById('btn-open-ticket-form');
    if (btnOpenTicketForm) {
      btnOpenTicketForm.addEventListener('click', () => {
        const formContainer = document.getElementById('ticket-form-container');
        if (formContainer) {
          formContainer.classList.remove('hidden');
          formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
    const btnCancelTicketForm = document.getElementById('btn-cancel-ticket-form');
    if (btnCancelTicketForm) {
      btnCancelTicketForm.addEventListener('click', () => {
        const formContainer = document.getElementById('ticket-form-container');
        const formEl = document.getElementById('ticket-open-form');
        if (formContainer) formContainer.classList.add('hidden');
        if (formEl) { formEl.reset(); delete formEl.dataset.editingId; const b = formEl.querySelector('button[type="submit"]'); if (b) b.textContent = 'Cadastrar Unidade'; }
        const previewCont = document.getElementById('preview-ticket-open-photo-container');
        if (previewCont) previewCont.style.display = 'none';
      });
    }

    // Despesas Form Toggle
    const btnOpenExpenseForm = document.getElementById('btn-open-expense-form');
    if (btnOpenExpenseForm) {
      btnOpenExpenseForm.addEventListener('click', () => {
        const formContainer = document.getElementById('expense-form-container');
        if (formContainer) {
          formContainer.classList.remove('hidden');
          formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
    const btnCancelExpenseForm = document.getElementById('btn-cancel-expense-form');
    if (btnCancelExpenseForm) {
      btnCancelExpenseForm.addEventListener('click', () => {
        const formContainer = document.getElementById('expense-form-container');
        const formEl = document.getElementById('expense-form');
        if (formContainer) formContainer.classList.add('hidden');
        if (formEl) {
          formEl.reset();
          UI.populateUnitDropdowns();
        }
        const divHotel = document.getElementById('div-hotel-alim');
        if (divHotel) divHotel.style.display = 'none';
        const divAbast = document.getElementById('div-abastecimento');
        if (divAbast) divAbast.style.display = 'none';
        const divOutro = document.getElementById('div-outro');
        if (divOutro) divOutro.style.display = 'none';
        const previewCont = document.getElementById('preview-comprovante');
        if (previewCont) previewCont.style.display = 'none';
        const previewOdom = document.getElementById('preview-odometro');
        if (previewOdom) previewOdom.style.display = 'none';
      });
    }

    // Solicitação de Saldo Form Toggle
    const btnOpenBalanceForm = document.getElementById('btn-open-balance-form');
    if (btnOpenBalanceForm) {
      btnOpenBalanceForm.addEventListener('click', () => {
        const formContainer = document.getElementById('balance-form-container');
        if (formContainer) {
          formContainer.classList.remove('hidden');
          formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
    const btnCancelBalanceForm = document.getElementById('btn-cancel-balance-form');
    if (btnCancelBalanceForm) {
      btnCancelBalanceForm.addEventListener('click', () => {
        const formContainer = document.getElementById('balance-form-container');
        const formEl = document.getElementById('solicitacao-despesas-form');
        if (formContainer) formContainer.classList.add('hidden');
        if (formEl) {
          formEl.reset();
          UI.populateUnitDropdowns();
        }
        const itemsContainer = document.getElementById('sol-items-container');
        if (itemsContainer) itemsContainer.innerHTML = '';
        const totalGeral = document.getElementById('sol-total-geral');
        if (totalGeral) totalGeral.textContent = 'R$ 0,00';
      });
    }

    // Movimentação Form Toggle
    const btnOpenMovementForm = document.getElementById('btn-open-movement-form');
    if (btnOpenMovementForm) {
      btnOpenMovementForm.addEventListener('click', () => {
        const formContainer = document.getElementById('movement-form-container');
        if (formContainer) {
          formContainer.classList.remove('hidden');
          formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
    const btnCancelMovementForm = document.getElementById('btn-cancel-movement-form');
    if (btnCancelMovementForm) {
      btnCancelMovementForm.addEventListener('click', () => {
        const formContainer = document.getElementById('movement-form-container');
        const formEl = document.getElementById('movement-form');
        if (formContainer) formContainer.classList.add('hidden');
        if (formEl) formEl.reset();
        ['div-mov-troca', 'div-mov-adicao', 'div-mov-recolha', 'div-mov-adesivar'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        const prev1 = document.getElementById('preview-container-mov-foto-antes');
        if (prev1) prev1.style.display = 'none';
        const prev2 = document.getElementById('preview-container-mov-foto-depois');
        if (prev2) prev2.style.display = 'none';
        const prev3 = document.getElementById('preview-container-mov-foto-equipamento');
        if (prev3) prev3.style.display = 'none';
      });
    }

    // Unidades Form Toggle
    const btnOpenUnitForm = document.getElementById('btn-open-unit-form');
    if (btnOpenUnitForm) {
      btnOpenUnitForm.addEventListener('click', () => {
        const formContainer = document.getElementById('unit-form-container');
        if (formContainer) {
          formContainer.classList.remove('hidden');
          formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
    const btnCancelUnitForm = document.getElementById('btn-cancel-unit-form');
    if (btnCancelUnitForm) {
      btnCancelUnitForm.addEventListener('click', () => {
        const formContainer = document.getElementById('unit-form-container');
        const formEl = document.getElementById('unit-form');
        if (formContainer) formContainer.classList.add('hidden');
        if (formEl) { formEl.reset(); delete formEl.dataset.editingId; const b = formEl.querySelector('button[type="submit"]'); if (b) b.textContent = 'Cadastrar Unidade'; }
      });
    }

    // Usuários Form Toggle
    const btnOpenUserForm = document.getElementById('btn-open-user-form');
    if (btnOpenUserForm) {
      btnOpenUserForm.addEventListener('click', () => {
        const formContainer = document.getElementById('user-form-container');
        if (formContainer) {
          formContainer.classList.remove('hidden');
          formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // Vincula listener no select de perfil para exibir seção de vendedores
        const profileSel = document.getElementById('user-profile');
        const supSection = document.getElementById('new-user-supervisor-section');
        if (profileSel && supSection && !profileSel.dataset.supervisorListenerBound) {
          profileSel.addEventListener('change', async () => {
            const sellerSection = document.getElementById('new-user-seller-section');
            if (profileSel.value === 'Supervisor') {
              supSection.style.display = 'block';
              if (sellerSection) sellerSection.style.display = 'none';
              const checklist = document.getElementById('new-user-vendedores-checklist');
              if (checklist) {
                checklist.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">Carregando vendedores...</span>';
                try {
                  const sellers = await App.fetchFromApi('/api/usuarios/vendedores');
                  if (!sellers || sellers.length === 0) {
                    checklist.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">Nenhum vendedor cadastrado na empresa.</span>';
                  } else {
                    checklist.innerHTML = sellers.map(s => `
                      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0;">
                        <input type="checkbox" class="new-user-vendedor-check" value="${s.id}" style="width:16px;height:16px;cursor:pointer;">
                        <span>${s.name} (${s.username})</span>
                      </label>`).join('');
                  }
                } catch (err) {
                  checklist.innerHTML = '<span style="color:#e55;">Erro ao carregar vendedores.</span>';
                }
              }
            } else if (profileSel.value === 'Vendedor') {
              supSection.style.display = 'none';
              if (sellerSection) {
                sellerSection.style.display = 'block';
                const selectSup = document.getElementById('new-user-supervisor-id');
                if (selectSup) {
                  selectSup.innerHTML = '<option value="">Carregando supervisores...</option>';
                  try {
                    const supervisors = await App.fetchFromApi('/api/usuarios/supervisores');
                    if (!supervisors || supervisors.length === 0) {
                      selectSup.innerHTML = '<option value="">Nenhum supervisor cadastrado nesta empresa</option>';
                    } else {
                      selectSup.innerHTML = '<option value="">Selecione um Supervisor...</option>' + supervisors.map(s => `<option value="${s.id}">${s.name} (${s.username})</option>`).join('');
                    }
                  } catch (err) {
                    selectSup.innerHTML = '<option value="">Erro ao carregar supervisores</option>';
                  }
                }
              }
            } else {
              supSection.style.display = 'none';
              if (sellerSection) sellerSection.style.display = 'none';
            }
          });
          profileSel.dataset.supervisorListenerBound = 'true';
        }
      });
    }
    const btnCancelUserForm = document.getElementById('btn-cancel-user-form');
    if (btnCancelUserForm) {
      btnCancelUserForm.addEventListener('click', () => {
        const formContainer = document.getElementById('user-form-container');
        const formEl = document.getElementById('user-form');
        if (formContainer) formContainer.classList.add('hidden');
        if (formEl) formEl.reset();
        const supSection = document.getElementById('new-user-supervisor-section');
        if (supSection) supSection.style.display = 'none';
      });
    }

    // Client photo upload previews setup
    const photoSuffixes = ['fachada', 'interna01', 'interna02', 'interna03', 'rua01', 'rua02', 'cnpj'];
    photoSuffixes.forEach(suffix => {
      const inputEl = document.getElementById(`client-photo-${suffix}`);
      const previewImg = document.getElementById(`preview-img-${suffix}`);
      const containerEl = document.getElementById(`preview-container-${suffix}`);
      if (inputEl && previewImg && containerEl) {
        inputEl.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            const localUrl = URL.createObjectURL(file);
            previewImg.src = localUrl;
            containerEl.style.display = 'block';
            
            // Prévia local somente na tela; o envio real gera URL pelo backend.
            if (!window.TempPhotosCache) window.TempPhotosCache = {};
          } else {
            containerEl.style.display = 'none';
          }
        });
      }
    });

    // 7. Abertura de Chamado (Seller) - Patrimônio Event Listener
    const ticketOpenSerial = document.getElementById('ticket-open-serial');
    if (ticketOpenSerial) {
      ticketOpenSerial.addEventListener('change', async (e) => {
        const serialVal = e.target.value.trim();
        if (!serialVal) return;

        try {
          const res = await this.fetchFromApi(`/api/equipamentos/patrimonio/${serialVal}`);
          if (res && res.exists) {
            // Found equipment in SQLite DB
            const eqModel = res.modelo || '';
            const eqClientName = res.cliente_atual_nome || '';
            const eqCity = res.cliente_atual_cidade || '';
            const eqAddress = res.cliente_atual_endereco || '';

            // Prefill what we can find
            const typeInput = document.getElementById('ticket-open-eq-type');
            const clientInput = document.getElementById('ticket-open-client');
            const fantasyInput = document.getElementById('ticket-open-fantasy');
            const cityInput = document.getElementById('ticket-open-city');
            const addressInput = document.getElementById('ticket-open-address');
            const unitInput = document.getElementById('ticket-open-unit');
            const sellerInput = document.getElementById('ticket-open-seller');

            if (clientInput) clientInput.value = eqClientName;
            if (fantasyInput) fantasyInput.value = eqClientName;
            if (cityInput) cityInput.value = eqCity;
            if (addressInput) addressInput.value = eqAddress;

            // Search for client in client list to get detailed info
            const clients = Store.getClients();
            const clientObj = clients.find(c => c.name === eqClientName);
            if (clientObj) {
              if (fantasyInput) fantasyInput.value = clientObj.companyName || clientObj.name || eqClientName;
              if (cityInput) cityInput.value = clientObj.city || eqCity;
              if (addressInput) addressInput.value = clientObj.address || clientObj.street || eqAddress;
              if (unitInput && clientObj.unitId) unitInput.value = clientObj.unitId;
              if (sellerInput && clientObj.userId) sellerInput.value = clientObj.userId;
            }

            // Map model to eq type dropdown options
            if (typeInput) {
              const opt = Array.from(typeInput.options).find(o => o.value.toLowerCase().includes(eqModel.toLowerCase()) || eqModel.toLowerCase().includes(o.value.toLowerCase()));
              if (opt) typeInput.value = opt.value;
            }

            // Render history timeline
            const historyContainer = document.getElementById('ticket-open-history-container');
            if (historyContainer) {
              const tickets = Store.getTickets();
              const eqTickets = tickets.filter(t => t.equipmentSerial === serialVal);
              
              let historyHtml = `
                <div style="margin-top:8px; margin-bottom:15px; padding:12px; background:rgba(37,99,235,0.06); border:1px solid var(--primary-color); border-radius:8px;">
                  <h5 style="color:var(--primary-color); margin-bottom:8px; font-size:0.8rem; font-weight:600;">Histórico do Patrimônio (JA/JDS):</h5>
                  <div style="display:flex; flex-direction:column; gap:6px; max-height:120px; overflow-y:auto;">
              `;

              // Approved movements
              if (res.historico && res.historico.length > 0) {
                res.historico.forEach(h => {
                  historyHtml += `
                    <div style="font-size:0.75rem; color:var(--text-main); border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom:4px;">
                      📅 <strong>${new Date(h.created_at).toLocaleDateString('pt-BR')}</strong> - Movimentação: <strong>${h.tipo_solicitacao}</strong> (Status: Aprovada)
                    </div>
                  `;
                });
              }

              // Previous tickets: recarrega do backend antes de montar o histórico, evitando chamado recém-aberto sumir da tela.
              try { await this.loadTickets(); } catch (_) {}
              const freshTickets = Store.getTickets();
              const eqTicketsFresh = freshTickets.filter(t => String(t.equipmentSerial || '').trim() === serialVal);
              if (eqTicketsFresh.length > 0) {
                eqTicketsFresh.forEach(t => {
                  let badge = 'badge-warning';
                  if (t.status === 'Resolvido') badge = 'badge-success';
                  if (t.status === 'Em Atendimento') badge = 'badge-primary';
                  historyHtml += `
                    <div style="font-size:0.75rem; color:var(--text-main); border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom:4px;">
                      🛠️ <strong>${t.date || 'S/D'}</strong> - Chamado <strong>${t.id}</strong>: ${t.title} - <span class="badge-status ${badge}" style="padding:1px 5px; font-size:0.65rem;">${t.status}</span>
                    </div>
                  `;
                });
              }

              if ((!res.historico || res.historico.length === 0) && eqTicketsFresh.length === 0) {
                historyHtml += `<div style="font-size:0.72rem; color:var(--text-muted);">Nenhuma movimentação ou chamado anterior no histórico.</div>`;
              }

              historyHtml += `</div></div>`;
              historyContainer.innerHTML = historyHtml;
            }
          } else {
            // Not found
            const historyContainer = document.getElementById('ticket-open-history-container');
            if (historyContainer) historyContainer.innerHTML = '';
          }
        } catch (err) {
          console.error('Erro ao buscar histórico do patrimônio:', err);
          const historyContainer = document.getElementById('ticket-open-history-container');
          if (historyContainer) historyContainer.innerHTML = '';
        }
      });
    }

    // Defect Photo Preview in Open Form
    const ticketOpenPhotoInput = document.getElementById('ticket-open-photo-defect');
    const ticketOpenPhotoPreviewContainer = document.getElementById('preview-ticket-open-photo-container');
    const ticketOpenPhotoPreviewImg = document.getElementById('preview-img-ticket-open-photo');
    if (ticketOpenPhotoInput && ticketOpenPhotoPreviewContainer && ticketOpenPhotoPreviewImg) {
      ticketOpenPhotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          ticketOpenPhotoPreviewImg.src = URL.createObjectURL(file);
          ticketOpenPhotoPreviewContainer.style.display = 'block';
        } else {
          ticketOpenPhotoPreviewContainer.style.display = 'none';
        }
      });
    }

    // 7c. Submit Seller Abertura de Chamado
    const ticketOpenForm = document.getElementById('ticket-open-form');
    if (ticketOpenForm) {
      ticketOpenForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const unitId = document.getElementById('ticket-open-unit').value;
        const userId = document.getElementById('ticket-open-seller').value;
        const equipmentType = document.getElementById('ticket-open-eq-type').value;
        const serial = document.getElementById('ticket-open-serial').value.trim();
        const client = document.getElementById('ticket-open-client').value.trim();
        const fantasyName = document.getElementById('ticket-open-fantasy').value.trim();
        const city = document.getElementById('ticket-open-city').value.trim();
        const address = document.getElementById('ticket-open-address').value.trim();
        const title = document.getElementById('ticket-open-title').value.trim();
        const priority = document.getElementById('ticket-open-priority').value;
        const obs = document.getElementById('ticket-open-obs').value.trim();

        const ticketId = 'CH-' + Math.floor(100 + Math.random() * 900);

        // Process photos/videos
        let defectPhotoUrl = '';
        const photoInput = document.getElementById('ticket-open-photo-defect');
        if (photoInput && photoInput.files && photoInput.files[0]) {
          defectPhotoUrl = await this.uploadFile(photoInput.files[0]);
        }

        let defectVideoUrl = '';
        const videoInput = document.getElementById('ticket-open-video-defect');
        if (videoInput && videoInput.files && videoInput.files[0]) {
          defectVideoUrl = await this.uploadFile(videoInput.files[0]);
        }

        try {
          const result = await this.fetchFromApi('/api/chamados', {
            method: 'POST',
            body: JSON.stringify({
              id: ticketId,
              unitId,
              userId,
              equipmentSerial: serial,
              equipmentType,
              client,
              fantasyName,
              city,
              address,
              title,
              priority,
              defectPhoto: defectPhotoUrl,
              defectVideo: defectVideoUrl,
              observations: obs
            })
          });

          await this.loadTickets();
          ticketOpenForm.reset();
          if (ticketOpenPhotoPreviewContainer) ticketOpenPhotoPreviewContainer.style.display = 'none';
          const historyContainer = document.getElementById('ticket-open-history-container');
          if (historyContainer) historyContainer.innerHTML = '';

          const formContainer = document.getElementById('ticket-form-container');
          if (formContainer) formContainer.classList.add('hidden');

          const emails = Store.getNotificationEmails();
          console.log(`[Notificação] E-mail de novo chamado enviado para: ${emails.join(', ')}`);
          this.showToast(`Chamado aberto com sucesso! OS: ${result.id || ticketId}`);
        } catch (err) {
          alert('Erro ao abrir chamado: ' + err.message);
        }
      });
    }

    // 8. Add Support Ticket Form Submit (Mechanic Ficha Técnica)
    const ticketForm = document.getElementById('ticket-form');
    if (ticketForm) {
      ticketForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ticketId = ticketForm.dataset.ticketId;
        if (!ticketId) {
          alert('Erro: nenhum chamado ativo para atendimento.');
          return;
        }

        const endTime = document.getElementById('ticket-end-time').value;
        const faultDescription = document.getElementById('ticket-fault-description').value.trim();
        const solutionDescription = document.getElementById('ticket-solution-description').value.trim();
        const eqStatusAfter = document.getElementById('ticket-eq-status-after').value;
        const gasCharge = document.getElementById('ticket-gas-charge').value;
        const additionalNotes = document.getElementById('ticket-additional-notes').value.trim();

        // Collect selected parts
        const selectedParts = [];
        document.querySelectorAll('#ticket-parts-container .btn-part-toggle.active').forEach(btn => {
          selectedParts.push(btn.dataset.part);
        });
        const outraPecaInput = document.getElementById('ticket-outra-peca');
        if (outraPecaInput && outraPecaInput.value.trim()) {
          selectedParts.push('Outra: ' + outraPecaInput.value.trim());
        }

        // Collect selected services
        const selectedServices = [];
        document.querySelectorAll('#ticket-services-container .btn-part-toggle.active').forEach(btn => {
          selectedServices.push(btn.dataset.service);
        });
        const outroServicoInput = document.getElementById('ticket-outro-servico');
        if (outroServicoInput && outroServicoInput.value.trim()) {
          selectedServices.push('Outro: ' + outroServicoInput.value.trim());
        }

        // Photos mapping
        let fotoAntesUrl = '';
        const fotoAntesEl = document.getElementById('ticket-foto-antes');
        if (fotoAntesEl && fotoAntesEl.files && fotoAntesEl.files[0]) {
          fotoAntesUrl = await this.uploadFile(fotoAntesEl.files[0]);
        }

        let fotoDepoisUrl = '';
        const fotoDepoisEl = document.getElementById('ticket-foto-depois');
        if (fotoDepoisEl && fotoDepoisEl.files && fotoDepoisEl.files[0]) {
          fotoDepoisUrl = await this.uploadFile(fotoDepoisEl.files[0]);
        }

        let fotoPlaquetaUrl = '';
        const fotoPlaquetaEl = document.getElementById('ticket-foto-plaqueta');
        if (fotoPlaquetaEl && fotoPlaquetaEl.files && fotoPlaquetaEl.files[0]) {
          fotoPlaquetaUrl = await this.uploadFile(fotoPlaquetaEl.files[0]);
        }

        let videoAtendimentoUrl = '';
        const videoAtendimentoEl = document.getElementById('ticket-video');
        if (videoAtendimentoEl && videoAtendimentoEl.files && videoAtendimentoEl.files[0]) {
          videoAtendimentoUrl = await this.uploadFile(videoAtendimentoEl.files[0]);
        }

        try {
          await this.fetchFromApi(`/api/chamados/${encodeURIComponent(ticketId)}/ficha`, {
            method: 'PUT',
            body: JSON.stringify({
              endTime,
              faultDescription,
              solutionDescription,
              eqStatusAfter,
              gasCharge,
              additionalNotes,
              parts: selectedParts,
              services: selectedServices,
              fotoAntes: fotoAntesUrl,
              fotoDepois: fotoDepoisUrl,
              fotoPlaqueta: fotoPlaquetaUrl,
              videoAtendimento: videoAtendimentoUrl
            })
          });
          await this.loadTickets();
          
          // Reset Ficha modal form
          ticketForm.reset();
          document.querySelectorAll('#modal-ficha-tecnica .btn-part-toggle.active').forEach(btn => btn.classList.remove('active'));
          document.getElementById('ticket-outra-peca-container').style.display = 'none';
          document.getElementById('ticket-outro-servico-container').style.display = 'none';
          
          // Hide modal
          document.getElementById('modal-ficha-tecnica').style.display = 'none';

          const emails = Store.getNotificationEmails();
          console.log(`[Notificação] E-mail de OS finalizada enviado para: ${emails.join(', ')}`);
          this.showToast(`Ficha técnica da OS ${ticketId} salva com sucesso!`);
        } catch (err) {
          alert('Erro ao salvar ficha técnica: ' + err.message);
        }
      });
    }

    // 8b. Setup Photo Previews for Ticket Form
    const setupTicketPhotoPreview = (inputId, previewImgId, containerId) => {
      const input = document.getElementById(inputId);
      const img = document.getElementById(previewImgId);
      const container = document.getElementById(containerId);
      if (input && img && container) {
        input.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            img.src = URL.createObjectURL(file);
            container.style.display = 'block';
          } else {
            container.style.display = 'none';
          }
        });
      }
    };
    setupTicketPhotoPreview('ticket-foto-antes', 'preview-img-ticket-foto-antes', 'preview-ticket-foto-antes');
    setupTicketPhotoPreview('ticket-foto-depois', 'preview-img-ticket-foto-depois', 'preview-ticket-foto-depois');
    setupTicketPhotoPreview('ticket-foto-plaqueta', 'preview-img-ticket-foto-plaqueta', 'preview-ticket-foto-plaqueta');

    // --- Dynamic Expense Form Behaviors ---
    const expFinalidade = document.getElementById('exp-finalidade');
    const groupExpDescreva = document.getElementById('group-exp-descreva');
    const groupExpAbastecimento = document.getElementById('group-exp-abastecimento');
    const groupExpComuns = document.getElementById('group-exp-comuns');

    const expDescreva = document.getElementById('exp-descreva');
    const expVeiculo = document.getElementById('exp-veiculo');
    const expKm = document.getElementById('exp-km');
    const expOdometroImg = document.getElementById('exp-odometro-img');
    const expVal = document.getElementById('exp-val');
    const expComprovanteImg = document.getElementById('exp-comprovante-img');
    const expDate = document.getElementById('exp-date');

    const handleFinalidadeChange = () => {
      if (!expFinalidade) return;
      const val = expFinalidade.value;
      if (val === 'Abastecimento') {
        if (groupExpDescreva) groupExpDescreva.style.display = 'none';
        if (groupExpAbastecimento) groupExpAbastecimento.style.display = 'block';
        if (groupExpComuns) groupExpComuns.style.display = 'block';

        if (expDescreva) { expDescreva.required = false; }
        if (expVeiculo) { expVeiculo.required = true; }
        if (expKm) { expKm.required = true; }
        if (expOdometroImg) { expOdometroImg.required = true; }
        if (expVal) { expVal.required = true; }
        if (expComprovanteImg) { expComprovanteImg.required = true; }
        if (expDate) { expDate.required = true; }
      } else if (val === 'Outro') {
        if (groupExpDescreva) groupExpDescreva.style.display = 'block';
        if (groupExpAbastecimento) groupExpAbastecimento.style.display = 'none';
        if (groupExpComuns) groupExpComuns.style.display = 'none';

        if (expDescreva) { expDescreva.required = true; }
        if (expVeiculo) { expVeiculo.required = false; }
        if (expKm) { expKm.required = false; }
        if (expOdometroImg) { expOdometroImg.required = false; }
        if (expVal) { expVal.required = false; }
        if (expComprovanteImg) { expComprovanteImg.required = false; }
        if (expDate) { expDate.required = false; }
      } else if (val === 'Hospedagem' || val === 'Refeição' || val === 'Reembolso') {
        if (groupExpDescreva) groupExpDescreva.style.display = 'none';
        if (groupExpAbastecimento) groupExpAbastecimento.style.display = 'none';
        if (groupExpComuns) groupExpComuns.style.display = 'block';

        if (expDescreva) { expDescreva.required = false; }
        if (expVeiculo) { expVeiculo.required = false; }
        if (expKm) { expKm.required = false; }
        if (expOdometroImg) { expOdometroImg.required = false; }
        if (expVal) { expVal.required = true; }
        if (expComprovanteImg) { expComprovanteImg.required = true; }
        if (expDate) { expDate.required = true; }
      } else {
        if (groupExpDescreva) groupExpDescreva.style.display = 'none';
        if (groupExpAbastecimento) groupExpAbastecimento.style.display = 'none';
        if (groupExpComuns) groupExpComuns.style.display = 'none';

        if (expDescreva) expDescreva.required = false;
        if (expVeiculo) expVeiculo.required = false;
        if (expKm) expKm.required = false;
        if (expOdometroImg) expOdometroImg.required = false;
        if (expVal) expVal.required = false;
        if (expComprovanteImg) expComprovanteImg.required = false;
        if (expDate) expDate.required = false;
      }
    };

    if (expFinalidade) {
      expFinalidade.addEventListener('change', handleFinalidadeChange);
    }

    const previewImage = (inputId, previewContainerId, imgElementId) => {
      const input = document.getElementById(inputId);
      const container = document.getElementById(previewContainerId);
      const img = document.getElementById(imgElementId);
      if (input && container && img) {
        input.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            img.src = URL.createObjectURL(file);
            container.style.display = 'block';
          } else {
            img.src = '';
            container.style.display = 'none';
          }
        });
      }
    };
    previewImage('exp-odometro-img', 'preview-odometro', 'img-preview-odometro');
    previewImage('exp-comprovante-img', 'preview-comprovante', 'img-preview-comprovante');

    const resetExpensePreviews = () => {
      const pOdo = document.getElementById('preview-odometro');
      const pComp = document.getElementById('preview-comprovante');
      const imgOdo = document.getElementById('img-preview-odometro');
      const imgComp = document.getElementById('img-preview-comprovante');
      if (pOdo) pOdo.style.display = 'none';
      if (pComp) pComp.style.display = 'none';
      if (imgOdo) imgOdo.src = '';
      if (imgComp) imgComp.src = '';
    };

    // Run once initially
    handleFinalidadeChange();

    // 9. Add Expense Form Submit
    const expenseForm = document.getElementById('expense-form');
    if (expenseForm && !expenseForm.dataset.boundSubmit) {
      expenseForm.dataset.boundSubmit = 'true';
      expenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (expenseForm.dataset.saving === 'true') return;
        expenseForm.dataset.saving = 'true';
        const submitBtn = expenseForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
          const finalidade = document.getElementById('exp-finalidade').value;
          const operacao = document.getElementById('exp-operacao').value;
          const loggedUser = Store.getLoggedUser();
          if (!loggedUser || !loggedUser.id) {
            throw new Error('Usuário logado não identificado. Faça login novamente.');
          }

          // A despesa sempre pertence ao próprio usuário que está logado.
          // Não permite selecionar outro vendedor para evitar mistura de saldo/despesa.
          const userId = loggedUser.id;

          let unitId = document.getElementById('exp-unit').value;
          if (loggedUser.unitId && loggedUser.unitId !== 'all') {
            unitId = loggedUser.unitId;
          }

          let descreva = '';
          let veiculo = '';
          let km = null;
          let foto_odometro = '';
          let foto_comprovante = '';
          let value = null;
          let date = '';
          let observation = '';

          if (finalidade === 'Outro') {
            descreva = document.getElementById('exp-descreva').value;
            date = new Date().toISOString().split('T')[0];
          } else {
            value = parseFloat(document.getElementById('exp-val').value);
            date = document.getElementById('exp-date').value;
            observation = document.getElementById('exp-obs').value;

            const fileComprovante = document.getElementById('exp-comprovante-img').files[0];
            if (fileComprovante) {
              foto_comprovante = await this.uploadFile(fileComprovante);
            }

            if (finalidade === 'Abastecimento') {
              veiculo = document.getElementById('exp-veiculo').value;
              km = parseInt(document.getElementById('exp-km').value, 10);
              const fileOdometro = document.getElementById('exp-odometro-img').files[0];
              if (fileOdometro) {
                foto_odometro = await this.uploadFile(fileOdometro);
              }
            }
          }

          const now = new Date();
          const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          const optimisticExpense = {
            id: `LOCAL-DP-${Date.now()}`,
            date,
            time,
            finalidade,
            operacao,
            descreva,
            veiculo,
            km,
            foto_odometro,
            foto_comprovante,
            value: Number(value) || 0,
            observation,
            unitId,
            userId,
            userName: loggedUser.name || loggedUser.username || '',
            status: 'Pendente',
            syncing: true,
            created_at: new Date().toISOString()
          };

          const cachedExpenses = this.readFastCache('despesas_reembolsos_api', []);
          const optimisticList = [optimisticExpense, ...cachedExpenses.filter(e => e.id !== optimisticExpense.id)];
          this.writeFastCache('despesas_reembolsos_api', optimisticList);
          window.AppExpensesCache = optimisticList;
          UI.renderExpenses(optimisticList);
          UI.renderDashboard();

          this.fetchFromApi('/api/despesas-reembolsos', {
            method: 'POST',
            body: JSON.stringify({
              date,
              time,
              finalidade,
              operacao,
              descreva,
              veiculo,
              km,
              foto_odometro,
              foto_comprovante,
              value: Number(value) || 0,
              observation,
              unitId,
              userId,
              userName: loggedUser.name || loggedUser.username || ''
            })
          }).then(() => this.loadExpenses()).catch(err => {
            optimisticExpense.syncError = err.message;
            this.writeFastCache('despesas_reembolsos_api', optimisticList);
            console.error('Despesa ficou salva localmente, mas ainda não sincronizou:', err);
          });

          this.refreshAllLists();
          expenseForm.reset();
          UI.populateUnitDropdowns();
          resetExpensePreviews();
          handleFinalidadeChange();
          const formContainer = document.getElementById('expense-form-container');
          if (formContainer) formContainer.classList.add('hidden');
          this.showToast('Despesa registrada e abatida do saldo disponível!');
        } catch (err) {
          console.error(err);
          this.showToast('Erro ao salvar despesa: ' + err.message, 'danger');
        } finally {
          expenseForm.dataset.saving = 'false';
          const submitBtn = expenseForm.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // 10. Add Balance Request Form Submit
    const balanceForm = document.getElementById('balance-form');
    if (balanceForm) {
      balanceForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const sellerId = document.getElementById('bal-seller').value;
        const value = parseFloat(document.getElementById('bal-val').value);
        const purpose = document.getElementById('bal-purpose').value;
        const unitId = document.getElementById('bal-unit').value;

        const balances = Store.getBalanceRequests();
        const newRequest = {
          id: 'SL-' + Math.floor(100 + Math.random() * 900),
          seller: UI.getUserName(sellerId), // String formatted name
          value,
          purpose,
          status: 'Pendente',
          unitId,
          userId: sellerId // Owner ID linked
        };

        balances.push(newRequest);
        Store.saveBalances(balances);
        this.refreshAllLists();
        balanceForm.reset();
        
        const emails = Store.getNotificationEmails();
        console.log(`[Notificação] E-mail de novo pedido de saldo enviado para: ${emails.join(', ')}`);
        this.showToast(`Pedido de saldo enviado! Alerta enviado para: ${emails.join(', ')}`);
      });
    }

    // 11. Print PDF trigger button
    const printBtn = document.getElementById('btn-print-pdf');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // 12. Identity Reset to Default Button
    const resetIdentityBtn = document.getElementById('btn-reset-identity');
    if (resetIdentityBtn) {
      resetIdentityBtn.addEventListener('click', () => {
        if (confirm('Redefinir identidade corporativa?')) {
          const config = Store.resetIdentity();
          UI.applyCompanyIdentity(config);
          this.loadCompanyIdentityForm();
          this.showToast('Identidade redefinida!');
        }
      });
    }

    // 13. Global Unit Selector Listener
    const globalUnitSelector = document.getElementById('global-unit-selector');
    if (globalUnitSelector && !globalUnitSelector.dataset.bound) {
      globalUnitSelector.dataset.bound = 'true';
      globalUnitSelector.addEventListener('change', (e) => {
        Store.setActiveUnitId(e.target.value);
        this.refreshAllLists();
      });
    }

    // 14. Add Unit Form Submit
    const unitForm = document.getElementById('unit-form');
    if (unitForm && unitForm.dataset.submitBound !== '1') {
      unitForm.dataset.submitBound = '1';
      unitForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('unit-name').value.trim();
        if (!name) return;

        const units = Store.getUnits();
        const editingId = unitForm.dataset.editingId || '';
        if (editingId) {
          const unit = units.find(u => String(u.id) === String(editingId));
          if (unit) unit.name = name;
          delete unitForm.dataset.editingId;
        } else {
          const newUnit = { id: Date.now().toString(), name };
          units.push(newUnit);
        }
        Store.saveUnits(units);
        UI.populateUnitDropdowns(); // Refresh dropdowns across all forms
        if (UI.populateMovementCompanyDropdown) UI.populateMovementCompanyDropdown();
        UI.renderUnits();           // Refresh units list stats
        unitForm.reset();
        const submitBtn = unitForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Cadastrar Unidade';
        const formContainer = document.getElementById('unit-form-container');
        if (formContainer) formContainer.classList.add('hidden');
        this.showToast(editingId ? 'Unidade atualizada com sucesso!' : 'Unidade cadastrada com sucesso!');
      });
    }

    // 15. Add User Form Submit
    const userForm = document.getElementById('user-form');
    if (userForm) {
      userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullname = document.getElementById('user-fullname').value.trim();
        const username = document.getElementById('user-username').value.trim();
        const pass = document.getElementById('user-pass').value;
        const profile = document.getElementById('user-profile').value;
        const unitId = document.getElementById('user-unit').value;

        // Coletar vendedores vinculados se for Supervisor
        const linked_users = [];
        if (profile === 'Supervisor') {
          document.querySelectorAll('.new-user-vendedor-check:checked').forEach(cb => linked_users.push(cb.value));
        }

        let supervisor_id = null;
        if (profile === 'Vendedor') {
          const selectSup = document.getElementById('new-user-supervisor-id');
          supervisor_id = selectSup ? selectSup.value : null;
          if (!supervisor_id) {
            alert('Por favor, selecione um Supervisor Responsável para o vendedor.');
            return;
          }
        }

        try {
          const result = await this.fetchFromApi('/api/usuarios', {
            method: 'POST',
            body: JSON.stringify({
              name: fullname,
              username,
              password: pass,
              profile,
              unitId,
              linked_users,
              supervisor_id
            })
          });

          if (result.success) {
            UI.renderUsers();           // Refresh users list
            userForm.reset();
            const formContainer = document.getElementById('user-form-container');
            if (formContainer) formContainer.classList.add('hidden');
            const supSection = document.getElementById('new-user-supervisor-section');
            if (supSection) supSection.style.display = 'none';
            const sellerSection = document.getElementById('new-user-seller-section');
            if (sellerSection) sellerSection.style.display = 'none';
            const statusMsg = result.user && result.user.status === 'LIBERADO' ? 'Usuário cadastrado e liberado com sucesso!' : 'Usuário cadastrado! Acesso aguarda liberação gerencial.';
            this.showToast(statusMsg);
          }
        } catch (err) {
          console.error(err);
          alert('Erro ao cadastrar usuário: ' + err.message);
        }
      });
    }

    // Config: Client Category Form
    const clientCatForm = document.getElementById('config-client-category-form');
    if (clientCatForm) {
      clientCatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('config-client-category-name');
        const newItem = input.value.trim();
        if (!newItem) return;

        const items = Store.getClientCategories();
        if (items.includes(newItem)) {
          alert('Esta categoria já existe.');
          return;
        }

        items.push(newItem);
        Store.saveClientCategories(items);
        input.value = '';
        UI.renderConfigSettings();
        UI.populateConfigDropdowns();
        this.showToast('Categoria de cliente adicionada!');
      });
    }

    // Config: Equipment Type Form
    const eqTypeForm = document.getElementById('config-eq-type-form');
    if (eqTypeForm) {
      eqTypeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('config-eq-type-name');
        const newItem = input.value.trim();
        if (!newItem) return;

        const items = Store.getEquipmentTypes();
        if (items.includes(newItem)) {
          alert('Este tipo de equipamento já existe.');
          return;
        }

        items.push(newItem);
        Store.saveEquipmentTypes(items);
        input.value = '';
        UI.renderConfigSettings();
        UI.populateConfigDropdowns();
        this.showToast('Tipo de equipamento adicionado!');
      });
    }

    // Config: Expense Category Form
    const expCatForm = document.getElementById('config-exp-category-form');
    if (expCatForm) {
      expCatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('config-exp-category-name');
        const newItem = input.value.trim();
        if (!newItem) return;

        const items = Store.getExpenseCategories();
        if (items.includes(newItem)) {
          alert('Esta categoria de despesa já existe.');
          return;
        }

        items.push(newItem);
        Store.saveExpenseCategories(items);
        input.value = '';
        UI.renderConfigSettings();
        UI.populateConfigDropdowns();
        this.showToast('Categoria de despesa adicionada!');
      });
    }

    // Config: Rejection Reason Form
    const rejectionReasonForm = document.getElementById('config-rejection-reason-form');
    if (rejectionReasonForm) {
      rejectionReasonForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('config-rejection-reason-name');
        const newItem = input.value.trim();
        if (!newItem) return;

        const items = Store.getRejectionReasons();
        if (items.includes(newItem)) {
          alert('Este motivo de reprovação já existe.');
          return;
        }

        items.push(newItem);
        Store.saveRejectionReasons(items);
        input.value = '';
        UI.renderConfigSettings();
        UI.populateConfigDropdowns();
        this.showToast('Motivo de reprovação adicionado!');
      });
    }

    // Config: Prospect Loss Reason Form
    const lossReasonForm = document.getElementById('config-loss-reason-form');
    if (lossReasonForm) {
      lossReasonForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('config-loss-reason-name');
        const newItem = input.value.trim();
        if (!newItem) return;

        const items = Store.getProspectLossReasons();
        if (items.includes(newItem)) {
          alert('Este motivo de perda já existe.');
          return;
        }

        items.push(newItem);
        Store.saveProspectLossReasons(items);
        input.value = '';
        UI.renderConfigSettings();
        UI.populateConfigDropdowns();
        this.showToast('Motivo de perda adicionado!');
      });
    }

    // Config: Notification Emails Form
    const configEmailsForm = document.getElementById('config-emails-form');
    if (configEmailsForm) {
      configEmailsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const textarea = document.getElementById('config-emails-input');
        const emailsStr = textarea.value.trim();
        
        const emails = emailsStr.split(',')
          .map(email => email.trim())
          .filter(email => email.length > 0);

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const invalidEmails = emails.filter(email => !emailRegex.test(email));
        if (invalidEmails.length > 0) {
          alert(`E-mail(s) inválido(s): ${invalidEmails.join(', ')}`);
          return;
        }

        try {
          await this.fetchFromApi('/api/equipamentos/config/emails', {
            method: 'POST',
            body: JSON.stringify({ emails: emailsStr })
          });
          Store.saveNotificationEmails(emails);
          this.showToast('Destinatários de e-mail salvos com sucesso!');
        } catch (err) {
          console.error(err);
          alert('Erro ao salvar e-mails: ' + err.message);
        }
      });
    }

    // Modal: Capture Prospect Loss Reason Form Submit
    const modalLossForm = document.getElementById('modal-loss-form');
    if (modalLossForm) {
      modalLossForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = modalLossForm.dataset.targetId;
        const lossReason = document.getElementById('modal-loss-select').value;
        
        let prospects = Store.getProspects();
        const lead = prospects.find(p => p.id === id);
        if (lead) {
          lead.status = 'perdido';
          lead.lossReason = lossReason;
          Store.saveProspects(prospects);
          this.refreshAllLists();
          
          const modal = document.getElementById('modal-loss-reason');
          if (modal) modal.style.display = 'none';
          
          this.showToast('Lead marcado como perdido!');
        }
      });
    }

    // Modal: Capture Client Rejection Reason Form Submit
    const modalRejectionForm = document.getElementById('modal-rejection-form');
    if (modalRejectionForm) {
      modalRejectionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = modalRejectionForm.dataset.targetId;
        const rejectionReason = document.getElementById('modal-rejection-select').value;
        const notes = (document.getElementById('modal-rejection-notes') ? document.getElementById('modal-rejection-notes').value.trim() : '');
        const sendToCorrection = document.getElementById('modal-rejection-send-to-correction') ? document.getElementById('modal-rejection-send-to-correction').checked : false;

        const clients = Store.getClients();
        const client = clients.find(c => c.id === id);
        if (client) {
          // Se marcado "Enviar para correção", status fica Aguardando Ajuste
          client.status = sendToCorrection ? 'Aguardando Ajuste' : 'Reprovado';
          client.rejectionReason = rejectionReason + (notes ? ' — ' + notes : '');
          Store.saveClients(clients);
          this.refreshAllLists();

          const modal = document.getElementById('modal-rejection-reason');
          if (modal) modal.style.display = 'none';

          // Reset campos do modal
          const notesEl = document.getElementById('modal-rejection-notes');
          const checkEl = document.getElementById('modal-rejection-send-to-correction');
          if (notesEl) notesEl.value = '';
          if (checkEl) checkEl.checked = false;

          const msg = sendToCorrection ? 'Cadastro enviado para correção pelo vendedor!' : 'Cadastro de cliente reprovado!';
          this.showToast(msg);
        }
      });
    }

    // 8. Identificação de cliente na movimentação: preenchimento manual.
    // Não buscar cliente no cadastro oficial, pois a movimentação pode ser aberta para cliente ainda não cadastrado.
    ['mov-client-name','mov-client-city','mov-client-address','mov-client-seller'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.removeAttribute('readonly');
        el.style.backgroundColor = '';
      }
    });

    // 9. Tipo de Solicitação change listener para alternar campos
    const tipoSolicitacao = document.getElementById('mov-tipo-solicitacao');
    if (tipoSolicitacao) {
      tipoSolicitacao.addEventListener('change', () => {
        const val = tipoSolicitacao.value;
        
        // Hide all panels
        document.getElementById('div-mov-troca').style.display = 'none';
        document.getElementById('div-mov-adicao').style.display = 'none';
        document.getElementById('div-mov-recolha').style.display = 'none';
        document.getElementById('div-mov-adesivar').style.display = 'none';

        // Remove required attribute from all dynamic inputs first
        const allDynamicInputs = document.querySelectorAll('#div-mov-campos-especificos input, #div-mov-campos-especificos select, #div-mov-campos-especificos textarea');
        allDynamicInputs.forEach(input => {
          input.removeAttribute('required');
        });

        if (val === 'Troca') {
          document.getElementById('div-mov-troca').style.display = 'block';
          // Only old equipment fields are required from the vendor
          document.getElementById('mov-patrimonio-antigo').setAttribute('required', '');
          document.getElementById('mov-modelo-antigo').setAttribute('required', '');
          document.getElementById('mov-voltagem-antiga').setAttribute('required', '');
          document.getElementById('mov-detalhe-troca').setAttribute('required', '');
          document.getElementById('mov-foto-troca').setAttribute('required', '');
          // New equipment block: always hidden — vendor does NOT fill this
          const newEqBlock = document.getElementById('mov-novo-eq-block');
          if (newEqBlock) newEqBlock.style.display = 'none';
        } else if (val === 'Adição') {
          document.getElementById('div-mov-adicao').style.display = 'block';
          document.getElementById('mov-modelo-adicao').setAttribute('required', '');
          document.getElementById('mov-voltagem-adicao').setAttribute('required', '');
          document.getElementById('mov-quantidade-adicao').setAttribute('required', '');
          document.getElementById('mov-detalhe-adicao').setAttribute('required', '');
        } else if (val === 'Recolha') {
          document.getElementById('div-mov-recolha').style.display = 'block';
          document.getElementById('mov-patrimonio-recolha').setAttribute('required', '');
          document.getElementById('mov-modelo-recolha').setAttribute('required', '');
          document.getElementById('mov-voltagem-recolha').setAttribute('required', '');
          document.getElementById('mov-foto-recolhido').setAttribute('required', '');
          document.getElementById('mov-motivo-recolhimento').setAttribute('required', '');
        } else if (val === 'Adesivar') {
          document.getElementById('div-mov-adesivar').style.display = 'block';
          document.getElementById('mov-patrimonio-adesivar').setAttribute('required', '');
          document.getElementById('mov-modelo-adesivar').setAttribute('required', '');
          document.getElementById('mov-voltagem-adesivar').setAttribute('required', '');
          document.getElementById('mov-foto-antes').setAttribute('required', '');
          document.getElementById('mov-foto-depois').setAttribute('required', '');
          document.getElementById('mov-obs-adesivar').setAttribute('required', '');
        }
      });
    }

    // 10. Listeners para blur de patrimônio para autopreencher modelo/voltagem
    const bindPatrimonioBlur = (patId, modelId, voltId, linkId) => {
      const patEl = document.getElementById(patId);
      if (patEl) {
        patEl.addEventListener('blur', () => {
          this.checkPatrimonio(
            patEl,
            document.getElementById(modelId),
            document.getElementById(voltId),
            document.getElementById(linkId)
          );
        });
      }
    };
    bindPatrimonioBlur('mov-patrimonio-antigo', 'mov-modelo-antigo', 'mov-voltagem-antiga', 'hist-patrimonio-antigo-link');
    bindPatrimonioBlur('mov-patrimonio-novo', 'mov-modelo-novo', 'mov-voltagem-nova', 'hist-patrimonio-novo-link');
    bindPatrimonioBlur('mov-patrimonio-recolha', 'mov-modelo-recolha', 'mov-voltagem-recolha', 'hist-patrimonio-recolha-link');
    bindPatrimonioBlur('mov-patrimonio-adesivar', 'mov-modelo-adesivar', 'mov-voltagem-adesivar', 'hist-patrimonio-adesivar-link');

    // 11. Listeners para uploads de foto para preview
    const setupPhotoPreviewListener = (inputId, previewImgId, containerId) => {
      const input = document.getElementById(inputId);
      const img = document.getElementById(previewImgId);
      const container = document.getElementById(containerId);
      if (input && img && container) {
        input.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            img.src = URL.createObjectURL(file);
            container.style.display = 'block';
          } else {
            container.style.display = 'none';
          }
        });
      }
    };
    setupPhotoPreviewListener('mov-foto-antigo', 'preview-img-mov-foto-antigo', 'preview-container-mov-foto-antigo');
    setupPhotoPreviewListener('mov-foto-troca', 'preview-img-mov-foto-troca', 'preview-container-mov-foto-troca');
    setupPhotoPreviewListener('mov-foto-instalado', 'preview-img-mov-foto-instalado', 'preview-container-mov-foto-instalado');
    setupPhotoPreviewListener('mov-foto-recolhido', 'preview-img-mov-foto-recolhido', 'preview-container-mov-foto-recolhido');
    setupPhotoPreviewListener('mov-foto-antes', 'preview-img-mov-foto-antes', 'preview-container-mov-foto-antes');
    setupPhotoPreviewListener('mov-foto-depois', 'preview-img-mov-foto-depois', 'preview-container-mov-foto-depois');

    // 12. Submit do formulário de movimentação
    const movementForm = document.getElementById('movement-form');
    if (movementForm && movementForm.dataset.submitBound !== '1') {
      movementForm.dataset.submitBound = '1';
      movementForm.addEventListener('submit', (e) => this.submitMovementForm(e));
    }
  },

  /**
   * Advance or retreat a lead on the Kanban
   */
  moveProspect(id, newStatus) {
    const prospects = Store.getProspects();
    const lead = prospects.find(p => p.id === id);
    if (lead) {
      lead.status = newStatus;
      Store.saveProspects(prospects);
      UI.renderProspects(prospects);
      this.showToast('Status do lead atualizado!');
    }
  },

  /**
   * Delete lead from Kanban
   */
  deleteProspect(id) {
    const modal = document.getElementById('modal-loss-reason');
    if (modal) {
      modal.style.display = 'flex';
      const form = document.getElementById('modal-loss-form');
      form.dataset.targetId = id;
    }
  },

  /**
   * Transition prospect to a new status
   */
  changeProspectStatus(id, newStatus) {
    if (newStatus === 'perdido') {
      this.deleteProspect(id);
    } else if (newStatus === 'convertido') {
      this.convertProspectToClient(id);
    } else {
      const prospects = Store.getProspects();
      const lead = prospects.find(p => p.id === id);
      if (lead) {
        lead.status = newStatus;
        Store.saveProspects(prospects);
        this.refreshAllLists();
        this.showToast('Status do lead comercial atualizado!');
      }
    }
  },

  /**
   * Delete a prospect permanently from the database
   */
  deleteProspectReal(id) {
    if (confirm('Deseja excluir permanentemente este lead de prospecção?')) {
      let prospects = Store.getProspects();
      prospects = prospects.filter(p => p.id !== id);
      Store.saveProspects(prospects);
      this.refreshAllLists();
      this.showToast('Lead comercial removido permanentemente!');
    }
  },

  /**
   * Open full size facade image preview modal
   */
  showFacadeImage(src) {
    const modal = document.getElementById('modal-image-preview');
    const img = document.getElementById('modal-preview-img');
    if (modal && img) {
      img.src = src;
      modal.style.display = 'flex';
    }
  },

  /**
   * Open prospect dossier modal
   */
  showProspectDetails(id) {
    const prospects = Store.getProspects();
    const lead = prospects.find(p => p.id === id);
    if (!lead) {
      alert('Lead não encontrado.');
      return;
    }

    const statusLabels = {
      prospectado: 'Prospectado',
      negociacao: 'Em negociação',
      retornar: 'Retornar depois',
      sem_interesse: 'Sem interesse',
      perdido: 'Perdido',
      convertido: 'Convertido'
    };

    let statusKey = lead.status;
    if (statusKey === 'contato') statusKey = 'prospectado';
    if (statusKey === 'ganho') statusKey = 'convertido';
    if (!statusLabels[statusKey]) statusKey = 'prospectado';

    const addressParts = [lead.address, lead.neighborhood].filter(Boolean).join(', ');
    const localStr = [addressParts, lead.city].filter(Boolean).join(' - ') || 'Não informada';
    const createdAt = lead.createdAt || lead.date || '';
    const createdAtText = createdAt ? new Date(createdAt).toLocaleString('pt-BR') : 'Não informado';

    let modal = document.getElementById('modal-prospect-details');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-prospect-details';
      modal.className = 'login-wrapper';
      modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:2500; background-color:rgba(0,0,0,0.68); width:100vw; height:100vh; align-items:center; justify-content:center; padding:18px;';
      modal.innerHTML = `
        <div class="login-card prospect-dossier-modal">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
            <div>
              <h3 id="prospect-dossier-title" style="font-family: var(--font-title); margin:0 0 4px;"></h3>
              <p id="prospect-dossier-subtitle" style="font-size:.78rem; color:var(--text-muted); margin:0;"></p>
            </div>
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-prospect-details').style.display='none'" style="width:auto; padding:8px 12px;">Fechar</button>
          </div>
          <div id="prospect-dossier-content"></div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }

    document.getElementById('prospect-dossier-title').textContent = lead.name || 'Lead sem nome';
    document.getElementById('prospect-dossier-subtitle').textContent = `${statusLabels[statusKey]} • ${lead.category || 'Categoria não definida'}`;
    document.getElementById('prospect-dossier-content').innerHTML = `
      ${lead.photo ? `<img src="${lead.photo}" alt="Foto da fachada" class="prospect-dossier-photo" onclick="App.showFacadeImage('${lead.photo.replace(/'/g, "\\'")}')">` : ''}
      <div class="prospect-dossier-grid">
        <div><span>Responsável</span><strong>${lead.contact || '-'}</strong></div>
        <div><span>Telefone</span><strong><a href="tel:${lead.phone || ''}">${lead.phone || '-'}</a></strong></div>
        <div><span>Cidade / Local</span><strong>${localStr}</strong></div>
        <div><span>Categoria</span><strong>${lead.category || 'Não definida'}</strong></div>
        <div><span>Concorrente atual</span><strong>${lead.competitor || 'Não informado'}</strong></div>
        <div><span>Unidade</span><strong>${UI.getUnitName(lead.unitId)}</strong></div>
        <div><span>Vendedor vinculado</span><strong>${UI.getUserName(lead.userId)}</strong></div>
        <div><span>Data do cadastro</span><strong>${createdAtText}</strong></div>
        ${lead.lossReason ? `<div><span>Motivo da perda</span><strong>${lead.lossReason}</strong></div>` : ''}
      </div>
      <div class="prospect-dossier-notes">
        <span>Observação</span>
        <p>${lead.observation || 'Nenhuma observação registrada.'}</p>
      </div>
      <div class="prospect-dossier-actions">
        <select onchange="App.changeProspectStatus('${lead.id}', this.value); document.getElementById('modal-prospect-details').style.display='none';">
          <option value="prospectado" ${statusKey === 'prospectado' ? 'selected' : ''}>Prospectado</option>
          <option value="negociacao" ${statusKey === 'negociacao' ? 'selected' : ''}>Em Negociação</option>
          <option value="retornar" ${statusKey === 'retornar' ? 'selected' : ''}>Retornar Depois</option>
          <option value="sem_interesse" ${statusKey === 'sem_interesse' ? 'selected' : ''}>Sem Interesse</option>
          <option value="perdido" ${statusKey === 'perdido' ? 'selected' : ''}>Perdido</option>
          <option value="convertido" ${statusKey === 'convertido' ? 'selected' : ''}>Convertido</option>
        </select>
        <button class="btn btn-primary" onclick="App.convertProspectToClient('${lead.id}'); document.getElementById('modal-prospect-details').style.display='none';">Converter em cliente</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  /**
   * Convert prospect to client registration workflow
   */
  convertProspectToClient(id) {
    const prospects = Store.getProspects();
    const lead = prospects.find(p => p.id === id);
    if (lead) {
      if (confirm(`Deseja converter o lead "${lead.name}" em cliente e iniciar o processo de cadastro?`)) {
        lead.status = 'convertido';
        Store.saveProspects(prospects);
        this.refreshAllLists();

        // Redirect to clientes page
        window.location.hash = '#clientes';

        // Pre-fill the client form with delay to ensure DOM is ready
        setTimeout(() => {
          const clientName = document.getElementById('client-name');
          const clientPhone = document.getElementById('client-phone');
          const clientUnit = document.getElementById('client-unit');
          const clientSeller = document.getElementById('client-seller');
          const clientCategory = document.getElementById('client-category');

          if (clientName) clientName.value = lead.name || '';
          if (clientPhone) clientPhone.value = lead.phone || '';
          if (clientUnit) clientUnit.value = lead.unitId || '';
          if (clientSeller) clientSeller.value = lead.userId || '';
          if (clientCategory) clientCategory.value = lead.category || '';
          
          const clientCnpj = document.getElementById('client-cnpj');
          if (clientCnpj && lead.cnpj) {
            clientCnpj.value = lead.cnpj;
            
            const clientCompanyName = document.getElementById('client-company-name');
            if (clientCompanyName) clientCompanyName.value = lead.razaoSocial || lead.companyName || lead.name || '';
            
            const clientCity = document.getElementById('client-city');
            if (clientCity) clientCity.value = lead.city || '';
            
            const clientCep = document.getElementById('client-cep');
            if (clientCep) clientCep.value = lead.zipcode || lead.cep || '';
            
            const clientStreet = document.getElementById('client-street');
            if (clientStreet) clientStreet.value = lead.address || lead.logradouro || '';
            
            const clientNumber = document.getElementById('client-number');
            if (clientNumber) clientNumber.value = lead.number || lead.numero || '';
            
            const clientNeighborhood = document.getElementById('client-neighborhood');
            if (clientNeighborhood) clientNeighborhood.value = lead.neighborhood || lead.bairro || '';
            
            const clientAddressFull = document.getElementById('client-address-full');
            if (clientAddressFull) {
              const street = lead.address || lead.logradouro || '';
              const num = lead.number || lead.numero || '';
              const dist = lead.neighborhood || lead.bairro || '';
              const city = lead.city || '';
              const cep = lead.zipcode || lead.cep || '';
              clientAddressFull.value = [street, num, dist, city, cep ? `CEP ${cep}` : '']
                .filter(Boolean)
                .join(', ');
            }
          }
          
          this.showToast('Dados da prospecção importados! Envie para aprovação.');
        }, 150);
      } else {
        // Reset select values
        this.refreshAllLists();
      }
    }
  },

  /**
   * Display the comprehensive client commercial profile modal details
   */
  showClientDetails(id) {
    const clients = Store.getClients();
    const client = clients.find(c => c.id === id);
    if (client) {
      UI.showClientDetails(client);
    } else {
      alert('Cliente não encontrado.');
    }
  },

  /**
   * Manager approves/rejects client registration
   */
  approveClient(id, newStatus) {
    if (newStatus === 'Reprovado') {
      const modal = document.getElementById('modal-rejection-reason');
      if (modal) {
        modal.style.display = 'flex';
        const form = document.getElementById('modal-rejection-form');
        form.dataset.targetId = id;
      }
    } else {
      const clients = Store.getClients();
      const client = clients.find(c => c.id === id);
      if (client) {
        client.status = newStatus;
        Store.saveClients(clients);
        this.refreshAllLists();
        this.showToast('Cadastro aprovado!');
      }
    }
  },

  /**
   * Delete item from dynamic settings lists
   */
  deleteConfigItem(listKey, item) {
    if (confirm(`Deseja remover "${item}" das configurações?`)) {
      let items;
      if (listKey === 'client_categories') {
        items = Store.getClientCategories().filter(i => i !== item);
        Store.saveClientCategories(items);
      } else if (listKey === 'equipment_types') {
        items = Store.getEquipmentTypes().filter(i => i !== item);
        Store.saveEquipmentTypes(items);
      } else if (listKey === 'expense_categories') {
        items = Store.getExpenseCategories().filter(i => i !== item);
        Store.saveExpenseCategories(items);
      } else if (listKey === 'rejection_reasons') {
        items = Store.getRejectionReasons().filter(i => i !== item);
        Store.saveRejectionReasons(items);
      } else if (listKey === 'prospect_loss_reasons') {
        items = Store.getProspectLossReasons().filter(i => i !== item);
        Store.saveProspectLossReasons(items);
      }

      UI.renderConfigSettings();
      UI.populateConfigDropdowns();
      this.showToast('Item de configuração removido!');
    }
  },

  /**
   * Update support ticket status
   */
  async updateTicketStatus(id, newStatus) {
    try {
      await this.fetchFromApi(`/api/chamados/${encodeURIComponent(id)}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      await this.loadTickets();
      this.showToast('Status do chamado técnico atualizado!');
    } catch (err) {
      alert('Erro ao atualizar chamado: ' + err.message);
    }
  },

  /**
   * Start support ticket service (Mechanic)
   */
  async startTicketService(id) {
    try {
      await this.fetchFromApi(`/api/chamados/${encodeURIComponent(id)}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'Em Atendimento' })
      });
      await this.loadTickets();
      this.showToast(`Atendimento do chamado ${id} iniciado!`);
      this.openFichaTecnica(id);
    } catch (err) {
      alert('Erro ao iniciar atendimento: ' + err.message);
    }
  },

  /**
   * Open Ficha Técnica modal (Mechanic)
   */
  openFichaTecnica(id) {
    const tickets = Store.getTickets();
    const ticket = tickets.find(t => t.id === id);
    if (!ticket) return;

    const modal = document.getElementById('modal-ficha-tecnica');
    if (!modal) return;

    // Prefill title OS
    const titleSpan = document.getElementById('ficha-ticket-id-title');
    if (titleSpan) titleSpan.textContent = id;

    // Prefill fields
    const form = document.getElementById('ticket-form');
    if (form) {
      form.dataset.ticketId = id;
      
      const isResolved = ticket.status === 'Resolvido';
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        if (isResolved) {
          submitBtn.style.display = 'none';
        } else {
          submitBtn.style.display = 'block';
        }
      }

      // Enable/Disable inputs based on status
      const inputs = form.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        if (input.id === 'ticket-mechanic' || input.id === 'ticket-eq-type-text' || 
            input.id === 'ticket-eq-serial' || input.id === 'ticket-client-name' || 
            input.id === 'ticket-seller-text' || input.id === 'ticket-unit-text' || 
            input.id === 'ticket-title' || input.id === 'ticket-priority-text') {
          return; // Always read-only
        }
        input.disabled = isResolved;
      });

      // Enable/Disable toggle buttons based on status
      const toggleBtns = form.querySelectorAll('.btn-part-toggle');
      toggleBtns.forEach(btn => {
        if (isResolved) {
          btn.style.pointerEvents = 'none';
          btn.style.opacity = '0.7';
        } else {
          btn.style.pointerEvents = 'auto';
          btn.style.opacity = '1';
        }
      });

      const loggedUser = Store.getLoggedUser();
      const mechInput = document.getElementById('ticket-mechanic');
      if (mechInput) mechInput.value = ticket.mechanic || (loggedUser ? loggedUser.name : '');
      
      // Convert DD/MM/YYYY to YYYY-MM-DD for date input
      let parts = (ticket.date || '').split('/');
      let formattedDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : new Date().toISOString().split('T')[0];
      const startDateInput = document.getElementById('ticket-start-date');
      if (startDateInput) startDateInput.value = formattedDate;
      
      const now = new Date();
      const startTimeInput = document.getElementById('ticket-start-time');
      if (startTimeInput) startTimeInput.value = ticket.startTime || now.toTimeString().slice(0,5);
      
      const endTimeInput = document.getElementById('ticket-end-time');
      if (endTimeInput) endTimeInput.value = ticket.endTime || '';

      const eqTypeInput = document.getElementById('ticket-eq-type-text');
      if (eqTypeInput) eqTypeInput.value = ticket.equipmentType || '';
      
      const eqSerialInput = document.getElementById('ticket-eq-serial');
      if (eqSerialInput) eqSerialInput.value = ticket.equipmentSerial || '';
      
      const clientInput = document.getElementById('ticket-client-name');
      if (clientInput) clientInput.value = ticket.client || '';
      
      const sellerInput = document.getElementById('ticket-seller-text');
      if (sellerInput) sellerInput.value = UI.getUserName(ticket.userId) || ticket.userId || '';
      
      const unitInput = document.getElementById('ticket-unit-text');
      if (unitInput) unitInput.value = UI.getUnitName(ticket.unitId) || ticket.unitId || '';
      
      const titleInput = document.getElementById('ticket-title');
      if (titleInput) titleInput.value = ticket.title || '';
      
      const priorityInput = document.getElementById('ticket-priority-text');
      if (priorityInput) priorityInput.value = ticket.priority || '';

      const faultDescInput = document.getElementById('ticket-fault-description');
      if (faultDescInput) faultDescInput.value = ticket.faultDescription || '';
      
      const solDescInput = document.getElementById('ticket-solution-description');
      if (solDescInput) solDescInput.value = ticket.solutionDescription || '';
      
      const eqStatusInput = document.getElementById('ticket-eq-status-after');
      if (eqStatusInput) eqStatusInput.value = ticket.eqStatusAfter || '';
      
      const gasInput = document.getElementById('ticket-gas-charge');
      if (gasInput) gasInput.value = ticket.gasCharge || '';
      
      const notesInput = document.getElementById('ticket-additional-notes');
      if (notesInput) notesInput.value = ticket.additionalNotes || '';

      // Reset part and service toggle buttons first
      document.querySelectorAll('#modal-ficha-tecnica .btn-part-toggle').forEach(btn => btn.classList.remove('active'));
      const otherPartContainer = document.getElementById('ticket-outra-peca-container');
      if (otherPartContainer) otherPartContainer.style.display = 'none';
      const otherServiceContainer = document.getElementById('ticket-outro-servico-container');
      if (otherServiceContainer) otherServiceContainer.style.display = 'none';

      // Toggle saved parts
      const savedParts = ticket.parts || [];
      savedParts.forEach(p => {
        if (p.startsWith('Outra: ')) {
          const value = p.replace('Outra: ', '');
          const input = document.getElementById('ticket-outra-peca');
          if (input) input.value = value;
          const otherBtn = document.querySelector('#modal-ficha-tecnica .btn-part-toggle[data-part="Outra Peça"]');
          if (otherBtn) {
            otherBtn.classList.add('active');
            if (otherPartContainer) otherPartContainer.style.display = 'block';
          }
        } else {
          const btn = document.querySelector(`#modal-ficha-tecnica .btn-part-toggle[data-part="${p}"]`);
          if (btn) btn.classList.add('active');
        }
      });

      // Toggle saved services
      const savedServices = ticket.services || [];
      savedServices.forEach(s => {
        if (s.startsWith('Outro: ')) {
          const value = s.replace('Outro: ', '');
          const input = document.getElementById('ticket-outro-servico');
          if (input) input.value = value;
          const otherBtn = document.querySelector('#modal-ficha-tecnica .btn-part-toggle[data-service="Outro Serviço"]');
          if (otherBtn) {
            otherBtn.classList.add('active');
            if (otherServiceContainer) otherServiceContainer.style.display = 'block';
          }
        } else {
          const btn = document.querySelector(`#modal-ficha-tecnica .btn-part-toggle[data-service="${s}"]`);
          if (btn) btn.classList.add('active');
        }
      });

      // Display previews of already selected files
      const renderPreviewIfExists = (url, imgId, containerId) => {
        const img = document.getElementById(imgId);
        const container = document.getElementById(containerId);
        const finalUrl = (window.TempPhotosCache && window.TempPhotosCache[url]) || url;
        const isValid = finalUrl && finalUrl !== 'null' && finalUrl !== 'undefined' && finalUrl !== '/uploads/null' && finalUrl !== '/uploads/undefined' && finalUrl !== '/uploads/';
        if (isValid && img && container) {
          img.src = finalUrl;
          container.style.display = 'block';
          img.style.cursor = 'pointer';
          img.onclick = () => App.showFacadeImage(finalUrl);
        } else if (container) {
          container.style.display = 'none';
        }
      };

      renderPreviewIfExists(ticket.fotoAntes, 'preview-img-ticket-foto-antes', 'preview-ticket-foto-antes');
      renderPreviewIfExists(ticket.fotoDepois, 'preview-img-ticket-foto-depois', 'preview-ticket-foto-depois');
      renderPreviewIfExists(ticket.fotoPlaqueta, 'preview-img-ticket-foto-plaqueta', 'preview-ticket-foto-plaqueta');
    }

    modal.style.display = 'flex';
  },

  /**
   * Toggle a part button in the Chamados form
   */
  togglePartBtn(btn) {
    btn.classList.toggle('active');
  },

  /**
   * Toggle a service button in the Chamados form
   */
  toggleServiceBtn(btn) {
    btn.classList.toggle('active');
  },

  /**
   * Toggle the "Outra Peça" button and show/hide its input
   */
  toggleOtherPart(btn) {
    btn.classList.toggle('active');
    const container = document.getElementById('ticket-outra-peca-container');
    if (container) {
      container.style.display = btn.classList.contains('active') ? 'block' : 'none';
    }
  },

  /**
   * Toggle the "Outro Serviço" button and show/hide its input
   */
  toggleOtherService(btn) {
    btn.classList.toggle('active');
    const container = document.getElementById('ticket-outro-servico-container');
    if (container) {
      container.style.display = btn.classList.contains('active') ? 'block' : 'none';
    }
  },

  /**
   * Manager approves/rejects salesperson credit limits request
   */
  updateBalanceStatus(id, newStatus) {
    const balances = Store.getBalanceRequests();
    const req = balances.find(b => b.id === id);
    if (req) {
      req.status = newStatus;
      Store.saveBalances(balances);
      this.refreshAllLists();
      this.showToast(`Pedido de saldo ${newStatus === 'Aprovado' ? 'aprovado' : 'reprovado'}!`);
    }
  },

  async loadProspects() {
    try {
      const activeUnit = Store.getActiveUnitId ? Store.getActiveUnitId() : 'all';
      const query = activeUnit && activeUnit !== 'all' ? `?unitId=${encodeURIComponent(activeUnit)}` : '';
      const prospects = await this.fetchFromApi(`/api/prospeccoes${query}`);
      const list = Array.isArray(prospects) ? prospects : [];
      Store.saveProspects(list);
      UI.renderProspects(list);
      return list;
    } catch (err) {
      console.error('Erro ao carregar prospecções do banco:', err);
      UI.renderProspects(Store.getProspects());
      return Store.getProspects();
    }
  },

  async loadTickets() {
    try {
      const activeUnit = Store.getActiveUnitId ? Store.getActiveUnitId() : 'all';
      const query = activeUnit && activeUnit !== 'all' ? `?unitId=${encodeURIComponent(activeUnit)}` : '';
      const tickets = await this.fetchFromApi(`/api/chamados${query}`);
      Store.saveTickets(Array.isArray(tickets) ? tickets : []);
      UI.renderTickets(Array.isArray(tickets) ? tickets : []);
    } catch (err) {
      console.error('Erro ao carregar chamados do backend:', err);
      UI.renderTickets(Store.getTickets());
    }
  },

  getApiBaseUrl() {
    let apiBase = window.API_BASE_URL;
    if (!apiBase) {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol;
      if (protocol === 'file:') {
        apiBase = 'http://localhost:3001';
      } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
        apiBase = 'http://localhost:3001';
      } else if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
        apiBase = `${protocol}//${hostname}:3001`;
      } else {
        apiBase = '';
      }
    }
    return apiBase;
  },

  async uploadBase64ToDatabase(dataUrl, filename = 'arquivo', module = 'geral') {
    if (!dataUrl) return '';
    const result = await this.fetchFromApi('/api/uploads/base64', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, filename, module })
    });
    return result.url || '';
  },

  compressImageAndGetBase64(file, maxWidth = 1200, maxHeight = 1200, quality = 0.75) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      };
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  },

  async uploadFile(file) {
    if (!file) return '';
    // Em Render Free o disco pode reiniciar e sumir arquivos. Por isso o padrão
    // agora é salvar o arquivo no PostgreSQL e devolver uma URL /api/uploads/:id.
    try {
      const base64 = await Store.fileToBase64(file);
      return await this.uploadBase64ToDatabase(base64, file.name, 'geral');
    } catch (err) {
      console.warn('Upload persistente falhou, tentando upload físico antigo:', err.message || err);
      const formData = new FormData();
      formData.append('file', file);
      const token = Store.getToken();
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const apiBase = this.getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/upload`, { method: 'POST', headers, body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro de upload: ${res.statusText}`);
      }
      const data = await res.json();
      return data.url;
    }
  },

  /**
   * Helper to perform AJAX calls to the backend
   */
  async fetchFromApi(endpoint, options = {}) {
    const user = Store.getLoggedUser() || {};
    const identity = Store.getCompanyIdentity();
    const companyId = user.empresa_id || (identity && identity.cnpj) || '001';
    const headers = {
      'Content-Type': 'application/json',
      'X-User-Id': user.id || 'demo_user',
      'X-User-Profile': user.profile || 'Vendedor',
      // Depois que o usuário está logado, a empresa vem do cadastro dele.
      // Assim, mudar nome/CNPJ visual da empresa não faz sumir usuários/dados.
      'X-Company-Id': companyId,
      'X-Company-Name': (identity && identity.name) || 'JDS Distribuidora',
      'X-Unit-Id': Store.getActiveUnitId ? Store.getActiveUnitId() : (user.unitId || 'all')
    };

    const token = Store.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const apiBase = this.getApiBaseUrl();

    const response = await fetch(`${apiBase}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        App.forceLogout('Sessão expirada ou inválida. Por favor, faça login novamente.');
      }
      throw new Error(errData.error || `Erro de API status: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Initialize Solicitação de Despesas form fields
   */
  initSolicitacaoForm() {
    const user = Store.getLoggedUser();
    const solicitanteInput = document.getElementById('sol-solicitante');
    if (solicitanteInput && user) {
      solicitanteInput.value = user.name || '';
    }

    // Set default value for Company
    const empresaSelect = document.getElementById('sol-empresa');
    if (empresaSelect) {
      empresaSelect.value = "JDS Distribuidora"; // default
    }

    // Reset input fields
    document.getElementById('sol-justificativa').value = '';
    document.getElementById('sol-abastecimento').value = '';
    document.getElementById('sol-placa').value = '';
    document.getElementById('sol-rota').value = '';

    // Reset radios
    const radios = document.getElementsByName('sol-noites');
    radios.forEach(r => r.checked = r.value === '0');

    // Clear extra items list
    const extrasContainer = document.getElementById('sol-extras-container');
    if (extrasContainer) extrasContainer.innerHTML = '';

    this.updateSolicitacaoTotal();

    // Event listener setup if not already done
    if (!this.solicitacaoFormEventsConfigured) {
      this.setupSolicitacaoFormEvents();
      this.solicitacaoFormEventsConfigured = true;
    }
  },

  /**
   * Configure form events
   */
  setupSolicitacaoFormEvents() {
    const radios = document.getElementsByName('sol-noites');
    radios.forEach(r => {
      r.addEventListener('change', () => this.updateSolicitacaoTotal());
    });

    const abasInput = document.getElementById('sol-abastecimento');
    if (abasInput) {
      abasInput.addEventListener('input', () => this.updateSolicitacaoTotal());
    }

    const btnAddExtra = document.getElementById('btn-add-extra');
    if (btnAddExtra) {
      btnAddExtra.addEventListener('click', () => {
        this.addSolicitacaoExtraRow();
      });
    }

    const form = document.getElementById('solicitacao-despesas-form');
    if (form) {
      // Recreate to clear previous listeners if any
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);
      
      newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.submitSolicitacaoDespesas();
      });

      // Re-bind other elements in the new form
      const newRadios = document.getElementsByName('sol-noites');
      newRadios.forEach(r => {
        r.addEventListener('change', () => this.updateSolicitacaoTotal());
      });
      const newAbasInput = document.getElementById('sol-abastecimento');
      if (newAbasInput) {
        newAbasInput.addEventListener('input', () => this.updateSolicitacaoTotal());
      }
      const newBtnAddExtra = document.getElementById('btn-add-extra');
      if (newBtnAddExtra) {
        newBtnAddExtra.addEventListener('click', () => {
          this.addSolicitacaoExtraRow();
        });
      }
    }
  },

  /**
   * Add a row in extra expenses
   */
  addSolicitacaoExtraRow(desc = '', val = '') {
    const container = document.getElementById('sol-extras-container');
    if (!container) return;

    const rowId = 'extra-row-' + Math.floor(Math.random() * 1000000);
    const row = document.createElement('div');
    row.id = rowId;
    row.className = 'form-row';
    row.style.alignItems = 'flex-end';
    row.style.marginBottom = '8px';
    row.innerHTML = `
      <div class="form-group" style="flex-grow: 1; margin-bottom: 0;">
        <label style="font-size: 0.7rem; color: var(--text-muted);">Descrição do Gasto Extra</label>
        <input type="text" class="extra-desc" required value="${desc}" placeholder="Ex: Estacionamento, pedágio, etc.">
      </div>
      <div class="form-group" style="width: 150px; margin-bottom: 0;">
        <label style="font-size: 0.7rem; color: var(--text-muted);">Valor (R$)</label>
        <input type="number" class="extra-val" required value="${val}" step="0.01" min="0.01" placeholder="0.00">
      </div>
      <button type="button" class="btn btn-danger" style="height: 38px; padding: 0 12px; margin-bottom: 0;" onclick="document.getElementById('${rowId}').remove(); App.updateSolicitacaoTotal();">✕</button>
    `;
    container.appendChild(row);

    row.querySelector('.extra-val').addEventListener('input', () => this.updateSolicitacaoTotal());
    this.updateSolicitacaoTotal();
  },

  /**
   * Update real-time total sum
   */
  updateSolicitacaoTotal() {
    const radios = document.getElementsByName('sol-noites');
    let noites = 0;
    radios.forEach(r => {
      if (r.checked) noites = parseInt(r.value) || 0;
    });

    const rates = { 0: 0, 1: 120.00, 2: 240.00, 3: 360.00, 4: 480.00 };
    const hotelAlimVal = rates[noites] || 0;

    const displayEl = document.getElementById('sol-hotel-alim-display');
    if (displayEl) {
      displayEl.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(hotelAlimVal);
    }

    const abasInput = document.getElementById('sol-abastecimento');
    const abasVal = abasInput ? parseFloat(abasInput.value) || 0 : 0;

    let extrasVal = 0;
    const extraValInputs = document.querySelectorAll('.extra-val');
    extraValInputs.forEach(input => {
      extrasVal += parseFloat(input.value) || 0;
    });

    const total = hotelAlimVal + abasVal + extrasVal;

    const totalEl = document.getElementById('sol-total-geral');
    if (totalEl) {
      totalEl.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);
    }
  },

  /**
   * Submit to API
   */
  async submitSolicitacaoDespesas() {
    const formEl = document.getElementById('solicitacao-despesas-form');
    if (formEl && formEl.dataset.saving === 'true') return;
    if (formEl) {
      formEl.dataset.saving = 'true';
      const submitBtn = formEl.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
    }
    try {
      const empresa = document.getElementById('sol-empresa').value;
      const solicitante = document.getElementById('sol-solicitante').value.trim();
      const justificativa = document.getElementById('sol-justificativa').value.trim();

      const radios = document.getElementsByName('sol-noites');
      let noites = 0;
      radios.forEach(r => {
        if (r.checked) noites = parseInt(r.value) || 0;
      });
      const rates = { 0: 0, 1: 120.00, 2: 240.00, 3: 360.00, 4: 480.00 };
      const valor_hotel_alim = rates[noites] || 0;

      const abasInput = document.getElementById('sol-abastecimento');
      const valor_abastecimento = abasInput ? parseFloat(abasInput.value) || 0 : 0;

      const placa_veiculo = document.getElementById('sol-placa').value.trim().toUpperCase();
      const rota_destino = document.getElementById('sol-rota').value.trim();

      const extras = [];
      const rows = document.querySelectorAll('#sol-extras-container > div');
      rows.forEach(row => {
        const desc = row.querySelector('.extra-desc').value.trim();
        const val = parseFloat(row.querySelector('.extra-val').value) || 0;
        if (desc && val > 0) {
          extras.push({ descricao: desc, valor: val });
        }
      });

      const user = Store.getLoggedUser() || {};
      const body = {
        empresa_id: user.empresa_id || '001',
        empresa,
        solicitante,
        justificativa,
        valor_hotel_alim,
        valor_abastecimento,
        placa_veiculo,
        rota_destino,
        extras
      };

      const result = await this.fetchFromApi('/api/despesas', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (result.success) {
        this.showToast('Solicitação de saldo enviada com sucesso!');
        const formContainer = document.getElementById('balance-form-container');
        const formEl = document.getElementById('solicitacao-despesas-form');
        if (formContainer) formContainer.classList.add('hidden');
        if (formEl) formEl.reset();
        const itemsContainer = document.getElementById('sol-items-container');
        if (itemsContainer) itemsContainer.innerHTML = '';
        const totalGeral = document.getElementById('sol-total-geral');
        if (totalGeral) totalGeral.textContent = 'R$ 0,00';
        
        const loggedUser = Store.getLoggedUser() || {};
        if (loggedUser.profile === 'Vendedor') {
          window.location.hash = '#solicitacao-despesas';
        } else {
          window.location.hash = '#despesas-dashboard';
        }
        this.refreshAllLists();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar solicitação: ' + err.message);
    } finally {
      if (formEl) {
        formEl.dataset.saving = 'false';
        const submitBtn = formEl.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = false;
      }
    }
  },

  /**
   * Load dashboard metrics and list
   */
  async loadDespesasDashboard() {
    try {
      const fmt = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

      let query = '';
      const solicitante = document.getElementById('filter-despesa-solicitante').value.trim();
      const status = document.getElementById('filter-despesa-status').value;
      const inicio = document.getElementById('filter-despesa-inicio').value;
      const fim = document.getElementById('filter-despesa-fim').value;
      const activeUnitId = Store.getActiveUnitId ? Store.getActiveUnitId() : 'all';

      const params = new URLSearchParams();
      if (solicitante) params.append('solicitante', solicitante);
      if (status) params.append('status', status);
      if (inicio) params.append('data_inicio', inicio);
      if (fim) params.append('data_fim', fim);
      if (activeUnitId && activeUnitId !== 'all') params.append('unitId', activeUnitId);

      if (params.toString()) {
        query = '?' + params.toString();
      }

      const list = await this.fetchFromApi(`/api/despesas${query}`);
      this.renderDespesasTable(list);

      // Os cards do dashboard devem refletir exatamente o filtro aplicado na lista.
      const getTotalGeral = (req) => Number(req.totalGeral ?? req.total_geral ?? 0) || 0;
      const getTotalAprovado = (req) => {
        const aprovado = Number(req.totalAprovado ?? req.total_aprovado ?? 0) || 0;
        return aprovado > 0 ? aprovado : getTotalGeral(req);
      };
      const isAprovada = (req) => String(req.status || '').toLowerCase().includes('aprovad');
      const isRejeitada = (req) => String(req.status || '').toLowerCase().includes('rejeitad') || String(req.status || '').toLowerCase().includes('reprovad');
      const isPendente = (req) => String(req.status || '').toLowerCase() === 'pendente';

      const summary = list.reduce((acc, req) => {
        const totalGeral = getTotalGeral(req);
        acc.totalSolicitado += totalGeral;
        if (isAprovada(req)) acc.totalAprovado += getTotalAprovado(req);
        else if (isRejeitada(req)) acc.totalRejeitado += totalGeral;
        else if (isPendente(req)) acc.countPendente += 1;
        return acc;
      }, { totalSolicitado: 0, totalAprovado: 0, totalRejeitado: 0, countPendente: 0 });

      document.getElementById('metric-despesas-solicitado').textContent = fmt(summary.totalSolicitado);
      document.getElementById('metric-despesas-aprovado').textContent = fmt(summary.totalAprovado);
      document.getElementById('metric-despesas-rejeitado').textContent = fmt(summary.totalRejeitado);
      document.getElementById('metric-despesas-pendentes').textContent = summary.countPendente;

      if (!this.despesasFiltrosConfigured) {
        document.getElementById('despesas-filtro-form').addEventListener('submit', (e) => {
          e.preventDefault();
          this.loadDespesasDashboard();
        });
        document.getElementById('btn-limpar-filtros-despesas').addEventListener('click', () => {
          document.getElementById('filter-despesa-solicitante').value = '';
          document.getElementById('filter-despesa-status').value = '';
          document.getElementById('filter-despesa-inicio').value = '';
          document.getElementById('filter-despesa-fim').value = '';
          this.loadDespesasDashboard();
        });
        this.despesasFiltrosConfigured = true;
      }
    } catch (err) {
      console.error(err);
      this.showToast('Erro ao carregar dashboard de despesas.');
    }
  },

  /**
   * Render table rows
   */
  renderDespesasTable(list) {
    const tbody = document.getElementById('despesas-solicitacoes-table-body');
    if (!tbody) return;

    const safeDateBR = (value) => {
      if (!value) return '—';
      const raw = String(value);
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        const [y, m, d] = raw.slice(0, 10).split('-');
        return `${d}/${m}/${y}`;
      }
      const dt = new Date(raw);
      return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR');
    };

    const isAdminLike = (user) => {
      const perms = Array.isArray(user?.permissions) ? user.permissions : [];
      return user?.profile === 'Administrador' || perms.includes('Administrador');
    };

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted);">Nenhuma solicitação encontrada.</td></tr>`;
      return;
    }

    const fmt = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    const loggedUser = Store.getLoggedUser() || {};
    const adminUser = isAdminLike(loggedUser);

    // Garante botão de excluir selecionados acima da tabela
    this._ensureBulkDeleteSolicitacoes();

    tbody.innerHTML = list.map(req => {
      let statusClass = 'badge-warning';
      if (req.status === 'Aprovada') statusClass = 'badge-success';
      if (req.status === 'Rejeitada') statusClass = 'badge-danger';
      if (req.status === 'Aprovada (não valor total)') statusClass = 'badge-primary';

      const isOwner = String(req.usuario_id || req.userId || '') === String(loggedUser.id || '');
      const canEdit = req.status === 'Pendente' && isOwner;
      // Admin pode excluir qualquer status; dono só pode excluir Pendente
      const canDelete = adminUser || (req.status === 'Pendente' && isOwner);
      const editButton = canEdit ? `<button class="btn btn-secondary btn-sm" onclick="App.editExpenseRequest('${req.id}')" style="padding: 2px 6px; font-size: 0.7rem;">Editar</button>` : '';
      const deleteButton = canDelete ? `<button class="btn btn-danger btn-sm" onclick="App.deleteExpenseRequest('${req.id}')" style="padding: 2px 6px; font-size: 0.7rem;">Excluir</button>` : '';
      // Checkbox apenas para admin
      const checkboxCol = adminUser ? `<td onclick="event.stopPropagation()" style="width:34px;text-align:center;"><input type="checkbox" class="cc-sol-check" value="${req.id}" style="width:16px;height:16px;cursor:pointer;"></td>` : '<td></td>';

      const statusLower = String(req.status || '').toLowerCase();
      const foiAvaliada = statusLower.includes('aprovada') || statusLower.includes('rejeitada');
      const valorHotelExibicao = foiAvaliada ? Number(req.valor_hotel_alim_aprovado || 0) : Number(req.valor_hotel_alim || 0);
      const valorAbastecimentoExibicao = foiAvaliada ? Number(req.valor_abastecimento_aprovado || 0) : Number(req.valor_abastecimento || 0);
      const totalGeralExibicao = foiAvaliada ? Number(req.total_liberado ?? req.totalAprovado ?? 0) : Number(req.totalGeral || 0);

      return `
        <tr data-id="${req.id}">
          ${checkboxCol}
          <td style="font-family: monospace; font-size: 0.75rem;">#${req.id}</td>
          <td>${safeDateBR(req.data_solicitacao || req.created_at || req.createdAt)}</td>
          <td style="font-weight: 600;">${req.solicitante}</td>
          <td style="font-family: monospace;">${req.placa_veiculo || '-'}</td>
          <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${req.rota_destino}</td>
          <td style="text-align: right;">${fmt(valorHotelExibicao)}</td>
          <td style="text-align: right;">${fmt(valorAbastecimentoExibicao)}</td>
          <td style="text-align: right; font-weight: bold; color: var(--primary-color);">${fmt(totalGeralExibicao)}</td>
          <td><span class="badge-status ${statusClass}">${req.status}</span></td>
          <td>
            <div style="display: flex; gap: 4px; justify-content: center;">
              <button class="btn btn-primary btn-sm" onclick="App.showDespesaDetails('${req.id}')" style="padding: 2px 6px; font-size: 0.7rem;">Ver</button>
              <button class="btn btn-success btn-sm" onclick="App.generateExpensePdf('${req.id}')" style="padding: 2px 6px; font-size: 0.7rem;">PDF</button>
              ${editButton}
              ${deleteButton}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Atualiza visibilidade do botão de excluir selecionados conforme checkboxes
    this._updateBulkDeleteBtn();
  },

  _ensureBulkDeleteSolicitacoes() {
    const tbody = document.getElementById('despesas-solicitacoes-table-body');
    if (!tbody) return;
    const table = tbody.closest('table');
    if (!table) return;

    // Cabeçalho: adiciona coluna de checkbox se não tiver
    const thead = table.querySelector('thead tr');
    if (thead && !thead.querySelector('.cc-sol-check-all-th')) {
      const th = document.createElement('th');
      th.className = 'cc-sol-check-all-th';
      th.style.cssText = 'width:34px;text-align:center;';
      th.innerHTML = '<input type="checkbox" id="cc-sol-check-all" title="Selecionar todos" style="width:16px;height:16px;cursor:pointer;">';
      thead.insertBefore(th, thead.firstChild);
      document.getElementById('cc-sol-check-all')?.addEventListener('change', (e) => {
        document.querySelectorAll('.cc-sol-check').forEach(cb => cb.checked = e.target.checked);
        this._updateBulkDeleteBtn();
      });
    }

    // Botão excluir selecionados
    const card = tbody.closest('.card');
    if (card && !document.getElementById('cc-btn-excluir-selecionados')) {
      const btn = document.createElement('button');
      btn.id = 'cc-btn-excluir-selecionados';
      btn.className = 'btn btn-danger btn-sm';
      btn.textContent = 'Excluir Selecionados';
      btn.style.cssText = 'display:none; margin: 0 0 10px 8px; float:right;';
      btn.onclick = () => this._deleteSelectedSolicitacoes();
      const cardHeader = card.querySelector('.card-header');
      if (cardHeader) cardHeader.appendChild(btn);
    }

    // Listener para atualizar botão ao marcar/desmarcar
    if (!tbody.dataset.bulkListenerAdded) {
      tbody.dataset.bulkListenerAdded = '1';
      tbody.addEventListener('change', (e) => {
        if (e.target.classList.contains('cc-sol-check')) this._updateBulkDeleteBtn();
      });
    }
  },

  _updateBulkDeleteBtn() {
    const n = document.querySelectorAll('.cc-sol-check:checked').length;
    const btn = document.getElementById('cc-btn-excluir-selecionados');
    if (btn) btn.style.display = n > 0 ? 'inline-block' : 'none';
  },

  async _deleteSelectedSolicitacoes() {
    const ids = [...document.querySelectorAll('.cc-sol-check:checked')].map(cb => cb.value).filter(Boolean);
    if (!ids.length) return;
    if (!confirm(`Confirma exclusão de ${ids.length} solicitação(ões) selecionada(s)?`)) return;
    let erros = 0;
    for (const id of ids) {
      try {
        await this.fetchFromApi(`/api/despesas/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (e) {
        erros++;
        console.error('Erro ao excluir solicitação ' + id, e);
      }
    }
    this.showToast(erros === 0 ? `${ids.length} solicitação(ões) excluída(s)!` : `Concluído com ${erros} erro(s).`);
    // Desmarcar tudo e recarregar
    const chkAll = document.getElementById('cc-sol-check-all');
    if (chkAll) chkAll.checked = false;
    this._updateBulkDeleteBtn();
    await this.loadDespesasDashboard?.();
  },


  /**
   * Detail expense request modal
   */
  async showDespesaDetails(id) {
    try {
      const data = await this.fetchFromApi(`/api/despesas/${id}`);

      document.getElementById('det-despesa-id').textContent = data.id;
      document.getElementById('det-despesa-empresa').textContent = (window.CC_pdfCompanyName ? window.CC_pdfCompanyName(data) : (data.empresa || 'Não informada'));
      document.getElementById('det-despesa-solicitante').textContent = data.solicitante;
      document.getElementById('det-despesa-data-hora').textContent = `${(window.CC_pdfEmissionText ? window.CC_pdfEmissionText(data.data_solicitacao).split(' às ')[0] : new Date().toLocaleDateString('pt-BR'))} às ${data.hora_solicitacao}`;
      document.getElementById('det-despesa-placa').textContent = data.placa_veiculo || '-';
      document.getElementById('det-despesa-rota').textContent = data.rota_destino;
      document.getElementById('det-despesa-justificativa').textContent = data.justificativa;

      const fmt = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

      const tbody = document.getElementById('det-despesa-items-tbody');
      tbody.innerHTML = '';

      let totalSolicitado = 0;
      let totalAprovado = 0;

      if (Array.isArray(data.itens) && data.itens.length) {
        totalSolicitado = data.itens.reduce((sum, item) => sum + (parseFloat(item.valor_solicitado) || 0), 0);
        totalAprovado = data.itens.reduce((sum, item) => sum + (parseFloat(item.valor_aprovado) || 0), 0);

        tbody.innerHTML = data.itens.map(item => {
          const qSol = item.quantidade_solicitada !== null ? item.quantidade_solicitada : '-';
          const qApr = item.quantidade_aprovada !== null ? item.quantidade_aprovada : '-';
          const vSol = fmt(item.valor_solicitado);
          const vApr = item.valor_aprovado !== null ? fmt(item.valor_aprovado) : '-';
          const statusText = item.status ? item.status.toUpperCase() : 'PENDENTE';
          const statusClass = statusText === 'REPROVADO' ? 'badge-danger' : (statusText.startsWith('APROVADO') ? 'badge-success' : 'badge-warning');
          const justification = item.justificativa || '-';
          return `
            <tr>
              <td>${item.categoria}</td>
              <td style="text-align: center;">${qSol}</td>
              <td style="text-align: center;">${qApr}</td>
              <td style="text-align: right;">${vSol}</td>
              <td style="text-align: right;">${vApr}</td>
              <td style="text-align: center;"><span class="badge-status ${statusClass}" style="font-size:0.75rem; padding:2px 6px;">${statusText}</span></td>
              <td>${justification}</td>
            </tr>
          `;
        }).join('');
      } else {
        // Fallback for legacy requests
        totalSolicitado = Number(data.valor_hotel_alim || 0) + Number(data.valor_abastecimento || 0);
        if (Array.isArray(data.extras)) {
          data.extras.forEach(ext => { totalSolicitado += Number(ext.valor || 0); });
        }
        totalAprovado = (data.status === 'Aprovada' || data.status === 'Aprovada (não valor total)') ? totalSolicitado : 0;

        let rowsHtml = '';
        if (data.valor_hotel_alim > 0) {
          const noites = Math.round(data.valor_hotel_alim / 120.00) || 1;
          const statusText = (data.status === 'Aprovada' || data.status === 'Aprovada (não valor total)') ? 'APROVADO' : (data.status === 'Rejeitada' ? 'REPROVADO' : 'PENDENTE');
          const statusClass = statusText === 'REPROVADO' ? 'badge-danger' : (statusText === 'APROVADO' ? 'badge-success' : 'badge-warning');
          rowsHtml += `
            <tr>
              <td>Hotel e Alimentação (Hospedagem)</td>
              <td style="text-align: center;">${noites}</td>
              <td style="text-align: center;">${statusText === 'APROVADO' ? noites : '-'}</td>
              <td style="text-align: right;">${fmt(data.valor_hotel_alim)}</td>
              <td style="text-align: right;">${statusText === 'APROVADO' ? fmt(data.valor_hotel_alim) : '-'}</td>
              <td style="text-align: center;"><span class="badge-status ${statusClass}" style="font-size:0.75rem; padding:2px 6px;">${statusText}</span></td>
              <td>-</td>
            </tr>
          `;
        }
        if (data.valor_abastecimento > 0) {
          const statusText = (data.status === 'Aprovada' || data.status === 'Aprovada (não valor total)') ? 'APROVADO' : (data.status === 'Rejeitada' ? 'REPROVADO' : 'PENDENTE');
          const statusClass = statusText === 'REPROVADO' ? 'badge-danger' : (statusText === 'APROVADO' ? 'badge-success' : 'badge-warning');
          rowsHtml += `
            <tr>
              <td>Combustível / Abastecimento</td>
              <td style="text-align: center;">-</td>
              <td style="text-align: center;">-</td>
              <td style="text-align: right;">${fmt(data.valor_abastecimento)}</td>
              <td style="text-align: right;">${statusText === 'APROVADO' ? fmt(data.valor_abastecimento) : '-'}</td>
              <td style="text-align: center;"><span class="badge-status ${statusClass}" style="font-size:0.75rem; padding:2px 6px;">${statusText}</span></td>
              <td>-</td>
            </tr>
          `;
        }
        if (Array.isArray(data.extras)) {
          data.extras.forEach(ext => {
            const statusText = (data.status === 'Aprovada' || data.status === 'Aprovada (não valor total)') ? 'APROVADO' : (data.status === 'Rejeitada' ? 'REPROVADO' : 'PENDENTE');
            const statusClass = statusText === 'REPROVADO' ? 'badge-danger' : (statusText === 'APROVADO' ? 'badge-success' : 'badge-warning');
            rowsHtml += `
              <tr>
                <td>Extra: ${ext.descricao}</td>
                <td style="text-align: center;">-</td>
                <td style="text-align: center;">-</td>
                <td style="text-align: right;">${fmt(ext.valor)}</td>
                <td style="text-align: right;">${statusText === 'APROVADO' ? fmt(ext.valor) : '-'}</td>
                <td style="text-align: center;"><span class="badge-status ${statusClass}" style="font-size:0.75rem; padding:2px 6px;">${statusText}</span></td>
                <td>-</td>
              </tr>
            `;
          });
        }
        tbody.innerHTML = rowsHtml;
      }

      document.getElementById('det-despesa-total-solicitado').textContent = fmt(totalSolicitado);
      document.getElementById('det-despesa-total-aprovado').textContent = fmt(totalAprovado);
      document.getElementById('det-despesa-total-geral').textContent = fmt(data.totalGeral);

      const approvalsSec = document.getElementById('det-despesa-aprovacoes-secao');
      const approvalsList = document.getElementById('det-despesa-aprovacoes-lista');
      approvalsList.innerHTML = '';

      if (Array.isArray(data.aprovacoes) && data.aprovacoes.length) {
        approvalsSec.style.display = 'block';
        data.aprovacoes.forEach(ap => {
          let statusBadgeClass = 'badge-success';
          if (ap.status === 'Rejeitada') statusBadgeClass = 'badge-danger';
          if (ap.status === 'Aprovada (não valor total)') statusBadgeClass = 'badge-primary';

          approvalsList.innerHTML += `
            <div style="padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; margin-top: 8px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong>Aprovador: ${ap.gerente_id}</strong>
                <span class="badge-status ${statusBadgeClass}">${ap.status}</span>
              </div>
              <p style="margin: 4px 0; font-size: 0.8rem; color: var(--text-muted);">${ap.observacao || 'Sem observações.'}</p>
              <div style="font-size: 0.7rem; color: var(--text-muted); text-align: right;">
                Ação realizada em ${new Date(ap.data_aprovacao + 'T00:00:00').toLocaleDateString('pt-BR')} às ${ap.hora_aprovacao}
              </div>
            </div>
          `;
        });
      } else {
        approvalsSec.style.display = 'none';
      }

      const user = Store.getLoggedUser() || {};
      const userPerms = Array.isArray(user.permissions) ? user.permissions : [];
      const canApproveExpense = ['Administrador', 'Financeiro', 'Responsável Financeiro', 'Responsavel Financeiro'].includes(user.profile)
        || userPerms.includes('Administrador')
        || userPerms.includes('Financeiro')
        || userPerms.includes('Aprovação de Saldo')
        || userPerms.includes('Aprovação de Despesas')
        || userPerms.includes('Despesas');
      const approvalPanel = document.getElementById('manager-approval-panel');

      if (canApproveExpense) {
        approvalPanel.dataset.reqId = data.id;
        document.getElementById('review-obs').value = '';

        const listDiv = document.getElementById('manager-approval-items-list');
        listDiv.innerHTML = '';

        if (Array.isArray(data.itens) && data.itens.length) {
          data.itens.forEach(item => {
            let qtyHtml = '';
            // Match DB status values back to form option values
            let statusVal = item.status || 'aprovado';
            if (statusVal === 'Aprovado' || statusVal === 'aprovado') statusVal = 'aprovado';
            else if (statusVal === 'Reprovado' || statusVal === 'reprovado') statusVal = 'reprovado';
            else statusVal = 'aprovado parcialmente';

            const approvedVal = item.valor_aprovado !== null && item.valor_aprovado !== undefined ? item.valor_aprovado : item.valor_solicitado;
            const approvedQty = item.quantidade_aprovada !== null && item.quantidade_aprovada !== undefined ? item.quantidade_aprovada : item.quantidade_solicitada;
            const justificationText = item.justificativa || '';

            if (item.quantidade_solicitada !== null && item.quantidade_solicitada !== undefined) {
              qtyHtml = `
                <div class="form-group" style="margin: 0; min-width: 120px;">
                  <label style="font-size: 0.75rem; margin-bottom: 2px;">Qtd Aprovada</label>
                  <input type="number" class="item-qty-approved" data-item-id="${item.id}" data-item-qty-sol="${item.quantidade_solicitada}" value="${approvedQty}" min="0" max="${item.quantidade_solicitada}" style="padding: 6px 10px; font-size: 0.8rem; height: auto; min-height: 32px; width: 100%;">
                </div>
              `;
            }

            listDiv.innerHTML += `
              <div class="approval-item-row" data-item-id="${item.id}" style="padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                  <strong style="color: var(--primary-color); font-size: 0.9rem;">${item.categoria}</strong>
                  <span style="color: var(--text-muted); font-size: 0.8rem;">Solicitado: R$ ${(window.CC_num ? window.CC_num(item.valor_solicitado).toFixed(2) : (parseFloat(item.valor_solicitado)||0).toFixed(2))}${item.quantidade_solicitada ? ' (' + item.quantidade_solicitada + ' diárias)' : ''}</span>
                </div>
                
                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;">
                  <div class="form-group" style="margin: 0; flex-grow: 1; min-width: 140px;">
                    <label style="font-size: 0.75rem; margin-bottom: 2px;">Avaliação</label>
                    <select class="item-evaluation-status" data-item-id="${item.id}" style="padding: 6px 10px; font-size: 0.8rem; height: auto; min-height: 32px; width: 100%;">
                      <option value="aprovado" ${statusVal === 'aprovado' ? 'selected' : ''}>Aprovar Total</option>
                      <option value="aprovado parcialmente" ${statusVal === 'aprovado parcialmente' ? 'selected' : ''}>Aprovar Valor Menor</option>
                      <option value="reprovado" ${statusVal === 'reprovado' ? 'selected' : ''}>Reprovar Item</option>
                    </select>
                  </div>
                  
                  <div class="form-group" style="margin: 0; min-width: 120px;">
                    <label style="font-size: 0.75rem; margin-bottom: 2px;">Valor Aprovado (R$)</label>
                    <input type="number" class="item-val-approved" data-item-id="${item.id}" data-item-val-sol="${item.valor_solicitado}" value="${approvedVal}" step="0.01" min="0" max="${window.CC_num ? window.CC_num(item.valor_solicitado) : (parseFloat(item.valor_solicitado)||0)}" style="padding: 6px 10px; font-size: 0.8rem; height: auto; min-height: 32px; width: 100%;">
                  </div>

                  ${qtyHtml}
                </div>

                <div class="form-group" style="margin: 0;">
                  <label style="font-size: 0.75rem; margin-bottom: 2px;">Justificativa (obrigatória para parcial/reprovado)</label>
                  <input type="text" class="item-justification" data-item-id="${item.id}" value="${justificationText}" placeholder="Digite a justificativa..." style="padding: 6px 10px; font-size: 0.8rem; height: auto; min-height: 32px; width: 100%;">
                </div>
              </div>
            `;
          });

          // Add change listeners to update total approved in real-time
          const updateCalculatedTotal = () => {
            let total = 0;
            document.querySelectorAll('.approval-item-row').forEach(row => {
              const itemId = row.dataset.itemId;
              const select = row.querySelector(`.item-evaluation-status[data-item-id="${itemId}"]`);
              const valInput = row.querySelector(`.item-val-approved[data-item-id="${itemId}"]`);
              
              let status = select.value;
              let val = parseFloat(valInput.value) || 0;
              
              if (status !== 'reprovado') {
                total += val;
              }
            });
            document.getElementById('det-despesa-total-aprovado-display').textContent = fmt(total);
          };

          // Setup dynamic behaviour for each row
          document.querySelectorAll('.approval-item-row').forEach(row => {
            const itemId = row.dataset.itemId;
            const select = row.querySelector(`.item-evaluation-status[data-item-id="${itemId}"]`);
            const valInput = row.querySelector(`.item-val-approved[data-item-id="${itemId}"]`);
            const qtyInput = row.querySelector(`.item-qty-approved[data-item-id="${itemId}"]`);
            
            const originalVal = parseFloat(valInput.getAttribute('data-item-val-sol'));
            const originalQty = qtyInput ? parseInt(qtyInput.getAttribute('data-item-qty-sol'), 10) : null;

            const handleStatusChange = (isInit = false) => {
              if (select.value === 'aprovado') {
                if (!isInit) valInput.value = originalVal;
                valInput.disabled = true;
                if (qtyInput) {
                  if (!isInit) qtyInput.value = originalQty;
                  qtyInput.disabled = true;
                }
              } else if (select.value === 'reprovado') {
                if (!isInit) valInput.value = 0;
                valInput.disabled = true;
                if (qtyInput) {
                  if (!isInit) qtyInput.value = 0;
                  qtyInput.disabled = true;
                }
              } else {
                // aprovado parcialmente
                valInput.disabled = false;
                if (qtyInput) {
                  qtyInput.disabled = false;
                }
              }
              updateCalculatedTotal();
            };

            select.addEventListener('change', () => handleStatusChange(false));
            valInput.addEventListener('input', updateCalculatedTotal);
            if (qtyInput) {
              qtyInput.addEventListener('input', updateCalculatedTotal);
            }

            // Init state
            handleStatusChange(true);
          });

          updateCalculatedTotal();
        } else {
          listDiv.innerHTML = '<p style="color:var(--warning);">Erro: Solicitação sem itens cadastrados no banco de dados.</p>';
        }

        // Toggle panel display & reevaluation button
        const reavaliarBtn = document.getElementById('btn-reavaliar-despesa');
        if (data.status === 'Pendente') {
          approvalPanel.style.display = 'block';
          if (reavaliarBtn) reavaliarBtn.style.display = 'none';
        } else {
          approvalPanel.style.display = 'none';
          if (reavaliarBtn) reavaliarBtn.style.display = 'block';
        }
      } else {
        approvalPanel.style.display = 'none';
        const reavaliarBtn = document.getElementById('btn-reavaliar-despesa');
        if (reavaliarBtn) reavaliarBtn.style.display = 'none';
      }

      document.getElementById('modal-despesa-details').style.display = 'flex';
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar detalhes: ' + err.message);
    }
  },

  enableExpenseReevaluation() {
    const approvalPanel = document.getElementById('manager-approval-panel');
    const reavaliarBtn = document.getElementById('btn-reavaliar-despesa');
    if (approvalPanel) approvalPanel.style.display = 'block';
    if (reavaliarBtn) reavaliarBtn.style.display = 'none';
    if (approvalPanel) {
      approvalPanel.scrollIntoView({ behavior: 'smooth' });
    }
  },

  async submitExpenseApproval() {
    const approvalPanel = document.getElementById('manager-approval-panel');
    const id = approvalPanel.dataset.reqId;
    const observacao = document.getElementById('review-obs').value.trim();

    const items = [];
    let validationError = null;

    document.querySelectorAll('.approval-item-row').forEach(row => {
      const itemId = parseInt(row.dataset.itemId, 10);
      const select = row.querySelector(`.item-evaluation-status[data-item-id="${itemId}"]`);
      const valInput = row.querySelector(`.item-val-approved[data-item-id="${itemId}"]`);
      const qtyInput = row.querySelector(`.item-qty-approved[data-item-id="${itemId}"]`);
      const justInput = row.querySelector(`.item-justification[data-item-id="${itemId}"]`);

      const status = select.value;
      const valAprovado = parseFloat(valInput.value) || 0;
      const qtyAprovada = qtyInput ? parseInt(qtyInput.value, 10) : null;
      const justificativa = justInput.value.trim();

      const originalVal = parseFloat(valInput.getAttribute('data-item-val-sol'));

      if (status !== 'aprovado' && !justificativa) {
        validationError = `Justificativa é obrigatória para itens reprovados ou aprovados parcialmente.`;
      }

      if (valAprovado > originalVal) {
        validationError = `O valor aprovado não pode ser maior que o valor solicitado.`;
      }

      items.push({
        id: itemId,
        status: status === 'aprovado' ? 'aprovado' : (status === 'reprovado' ? 'reprovado' : 'aprovado parcialmente'),
        valor_aprovado: valAprovado,
        quantidade_aprovada: qtyAprovada,
        justificativa
      });
    });

    if (validationError) {
      alert(validationError);
      return;
    }

    try {
      const result = await this.fetchFromApi(`/api/despesas/${id}/approval`, {
        method: 'POST',
        body: JSON.stringify({ items, observacao })
      });

      if (result.success) {
        this.showToast(`Solicitação #${id} avaliada com sucesso!`);
        document.getElementById('modal-despesa-details').style.display = 'none';
        this.loadDespesasDashboard();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao registrar parecer: ' + err.message);
    }
  },

  /**
   * Open User access permissions modal
   */
  async openUserPermissionsModal(userId, options = {}) {
    try {
      let user = null;
      try {
        user = await this.fetchFromApi(`/api/usuarios/${encodeURIComponent(userId)}`);
      } catch (e) {
        const users = await this.fetchFromApi('/api/usuarios').catch(() => []);
        user = users.find(u => String(u.id) === String(userId));
      }
      if (!user) {
        alert('Usuário não encontrado. Atualize a página e tente novamente.');
        return;
      }

      const loggedUser = Store.getLoggedUser();
      const selfEdit = !!options.selfEdit;
      const isAdmin = loggedUser && (loggedUser.profile === 'Administrador' || (loggedUser.permissions || []).includes('Administrador') || (loggedUser.permissions || []).includes('Usuários'));
      if (selfEdit && !isAdmin) {
        user.profile = loggedUser.profile;
        user.status = loggedUser.status;
        user.permissions = loggedUser.permissions || [];
        user.empresa_id = loggedUser.empresa_id || user.empresa_id;
        user.unitId = loggedUser.unitId || user.unitId;
      }

      document.getElementById('perm-user-id').value = user.id;
      document.getElementById('perm-user-name').textContent = user.name;
      document.getElementById('perm-user-fullname').value = user.name || '';
      document.getElementById('perm-user-username').value = user.username || user.login || '';
      document.getElementById('perm-user-email').value = user.email || '';
      document.getElementById('perm-user-phone').value = user.phone || '';
      document.getElementById('perm-user-password').value = user.password || '';
      document.getElementById('perm-user-profile').value = user.profile;
      document.getElementById('perm-user-status').value = user.status;
      document.getElementById('perm-user-empresa').value = user.empresa_id || '';
      document.getElementById('perm-user-unit').value = user.unitId || 'all';

      // Photo preview setup
      const preview = document.getElementById('perm-user-photo-preview');
      const placeholder = document.getElementById('perm-user-photo-placeholder');
      const photoInput = document.getElementById('perm-user-photo');
      if (photoInput) photoInput.value = '';

      window.CurrentUserModalPhotoBase64 = user.photo || '';

      if (user.photo) {
        preview.src = user.photo;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
      } else {
        preview.src = '';
        preview.style.display = 'none';
        placeholder.style.display = 'block';
      }

      const fileInput = document.getElementById('perm-user-photo');
      if (fileInput && !fileInput.dataset.listenerBound) {
        fileInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (file) {
            try {
              const base64 = await Store.fileToBase64(file);
              const url = await this.uploadBase64ToDatabase(base64, file.name, 'perfil');
              window.CurrentUserModalPhotoBase64 = url;
              preview.src = url;
              preview.style.display = 'block';
              placeholder.style.display = 'none';
            } catch (err) {
              console.error('Erro ao fazer upload da foto:', err);
            }
          }
        });
        fileInput.dataset.listenerBound = 'true';
      }

      // Uncheck all boxes
      document.querySelectorAll('.perm-checkbox').forEach(cb => {
        cb.checked = false;
      });

      // Check current user permissions
      const perms = user.permissions || [];
      document.querySelectorAll('.perm-checkbox').forEach(cb => {
        if (perms.includes(cb.value)) {
          cb.checked = true;
        }
      });

      const adminOnlyIds = ['perm-user-profile', 'perm-user-status', 'perm-user-empresa', 'perm-user-unit'];
      adminOnlyIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = selfEdit && !isAdmin;
      });
      document.querySelectorAll('.perm-checkbox').forEach(cb => {
        cb.disabled = selfEdit && !isAdmin;
      });
      const title = document.querySelector('#modal-user-permissions h3');
      if (title) title.childNodes[0].nodeValue = selfEdit ? 'Meu Perfil: ' : 'Controle de Permissões: ';

      // Populate and handle supervisor/manager linked checkboxes
      const profileSelect = document.getElementById('perm-user-profile');
      const vGrid = document.getElementById('perm-user-links-vendedores-list');
      const sGrid = document.getElementById('perm-user-links-supervisores-list');

      const toggleLinksContainers = () => {
        const val = profileSelect.value;
        const vendContainer = document.getElementById('perm-user-links-vendedores-container');
        const supContainer = document.getElementById('perm-user-links-supervisores-container');
        const gerVendContainer = document.getElementById('perm-user-links-gerente-vendedores-container');
        const supervisorSelectContainer = document.getElementById('perm-user-supervisor-container');
        
        if (val === 'Supervisor') {
          vendContainer?.classList.remove('hidden');
          supContainer?.classList.add('hidden');
          gerVendContainer?.classList.add('hidden');
          supervisorSelectContainer?.classList.add('hidden');
        } else if (val === 'Gerente') {
          vendContainer?.classList.add('hidden');
          supContainer?.classList.remove('hidden');
          gerVendContainer?.classList.remove('hidden');
          supervisorSelectContainer?.classList.add('hidden');
        } else if (val === 'Vendedor') {
          vendContainer?.classList.add('hidden');
          supContainer?.classList.add('hidden');
          gerVendContainer?.classList.add('hidden');
          supervisorSelectContainer?.classList.remove('hidden');
        } else {
          vendContainer?.classList.add('hidden');
          supContainer?.classList.add('hidden');
          gerVendContainer?.classList.add('hidden');
          supervisorSelectContainer?.classList.add('hidden');
        }
      };

      if (profileSelect && !profileSelect.dataset.listenerBound) {
        profileSelect.addEventListener('change', () => {
          toggleLinksContainers();
          rebuildHierarchyLists();
        });
        profileSelect.dataset.listenerBound = 'true';
      }

      // Fetch users list to populate options
      const usersList = await this.fetchFromApi('/api/usuarios').catch(() => []);
      const savedLinks = user.linked_users || [];

      const rebuildHierarchyLists = () => {
        const currentCompany = document.getElementById('perm-user-empresa').value.trim();
        const currentUnit = document.getElementById('perm-user-unit').value;
        
        const sellers = usersList.filter(u => 
          (u.profile === 'Vendedor' || u.role === 'Vendedor' || u.tipo === 'Vendedor' || u.user_type === 'Vendedor') && 
          u.status === 'LIBERADO' &&
          (u.empresa_id === currentCompany || u.company_id === currentCompany) && 
          (String(u.unitId) === String(currentUnit) || String(u.unit_id) === String(currentUnit) || !currentUnit || String(currentUnit) === 'all' || String(u.unitId) === 'all' || String(u.unit_id) === 'all') &&
          u.id !== user.id
        );
        
        const supervisors = usersList.filter(u => 
          (u.profile === 'Supervisor' || u.role === 'Supervisor' || u.tipo === 'Supervisor' || u.user_type === 'Supervisor') && 
          u.status === 'LIBERADO' &&
          (u.empresa_id === currentCompany || u.company_id === currentCompany) && 
          (String(u.unitId) === String(currentUnit) || String(u.unit_id) === String(currentUnit) || !currentUnit || String(currentUnit) === 'all' || String(u.unitId) === 'all' || String(u.unit_id) === 'all') &&
          u.id !== user.id
        );
        
        if (vGrid) {
          if (sellers.length === 0) {
            vGrid.innerHTML = `<span style="color: var(--text-muted); font-size: 0.8rem; padding: 6px 0;">Nenhum vendedor encontrado nesta empresa/unidade.</span>`;
          } else {
            vGrid.innerHTML = sellers.map(seller => {
              const checked = savedLinks.includes(seller.id) ? 'checked' : '';
              return `
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 0;">
                  <input type="checkbox" class="perm-link-vendedor-checkbox" value="${seller.id}" ${checked} style="width: 16px; height: 16px; cursor: pointer;">
                  <span>${seller.name} (${seller.username})</span>
                </label>
              `;
            }).join('');
          }
        }

        const gvGrid = document.getElementById('perm-user-links-gerente-vendedores-list');
        if (gvGrid) {
          if (sellers.length === 0) {
            gvGrid.innerHTML = `<span style="color: var(--text-muted); font-size: 0.8rem; padding: 6px 0;">Nenhum vendedor encontrado nesta empresa/unidade.</span>`;
          } else {
            gvGrid.innerHTML = sellers.map(seller => {
              const checked = savedLinks.includes(seller.id) ? 'checked' : '';
              return `
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 0;">
                  <input type="checkbox" class="perm-link-gerente-vendedor-checkbox" value="${seller.id}" ${checked} style="width: 16px; height: 16px; cursor: pointer;">
                  <span>${seller.name} (${seller.username})</span>
                </label>
              `;
            }).join('');
          }
        }
        
        if (sGrid) {
          if (supervisors.length === 0) {
            sGrid.innerHTML = `<span style="color: var(--text-muted); font-size: 0.8rem; padding: 6px 0;">Nenhum supervisor encontrado nesta empresa/unidade.</span>`;
          } else {
            sGrid.innerHTML = supervisors.map(sup => {
              const checked = savedLinks.includes(sup.id) ? 'checked' : '';
              return `
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 0;">
                  <input type="checkbox" class="perm-link-supervisor-checkbox" value="${sup.id}" ${checked} style="width: 16px; height: 16px; cursor: pointer;">
                  <span>${sup.name} (${sup.username})</span>
                </label>
              `;
            }).join('');
          }
        }

        const supervisorSelect = document.getElementById('perm-user-supervisor-id');
        if (supervisorSelect) {
          if (supervisors.length === 0) {
            supervisorSelect.innerHTML = '<option value="">Nenhum supervisor encontrado nesta empresa/unidade</option>';
          } else {
            const currentSupId = user.supervisor_id || '';
            supervisorSelect.innerHTML = '<option value="">Selecione um Supervisor...</option>' + 
              supervisors.map(sup => `<option value="${sup.id}" ${String(sup.id) === String(currentSupId) ? 'selected' : ''}>${sup.name} (${sup.username})</option>`).join('');
          }
        }
      };

      const unitSelect = document.getElementById('perm-user-unit');
      const companyInput = document.getElementById('perm-user-empresa');
      
      if (unitSelect && !unitSelect.dataset.hierarchyListenerBound) {
        unitSelect.addEventListener('change', rebuildHierarchyLists);
        unitSelect.dataset.hierarchyListenerBound = 'true';
      }
      if (companyInput && !companyInput.dataset.hierarchyListenerBound) {
        companyInput.addEventListener('input', rebuildHierarchyLists);
        companyInput.dataset.hierarchyListenerBound = 'true';
      }
      
      rebuildHierarchyLists();
      toggleLinksContainers();

      document.getElementById('modal-user-permissions').style.display = 'flex';
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar permissões: ' + err.message);
    }
  },

  /**
   * Save User access permissions
   */
  async saveUserPermissions() {
    const userId = document.getElementById('perm-user-id').value;
    const status = document.getElementById('perm-user-status').value;
    const profile = document.getElementById('perm-user-profile').value;
    const name = document.getElementById('perm-user-fullname').value.trim();
    const username = document.getElementById('perm-user-username').value.trim();
    const email = document.getElementById('perm-user-email').value.trim();
    const phone = document.getElementById('perm-user-phone').value.trim();
    const password = document.getElementById('perm-user-password').value;
    const empresa_id = document.getElementById('perm-user-empresa').value.trim();
    const unitId = document.getElementById('perm-user-unit').value;
    const photo = window.CurrentUserModalPhotoBase64 || '';

    if (!name) {
      alert('O nome do usuário é obrigatório.');
      return;
    }
    if (!username) {
      alert('O login do usuário é obrigatório.');
      return;
    }

    let permissions = [];
    document.querySelectorAll('.perm-checkbox:checked').forEach(cb => {
      permissions.push(cb.value);
    });

    const loggedUserBeforeSave = Store.getLoggedUser();
    const isSelfSave = loggedUserBeforeSave && loggedUserBeforeSave.id === userId;
    const isAdminSave = loggedUserBeforeSave && (loggedUserBeforeSave.profile === 'Administrador' || (loggedUserBeforeSave.permissions || []).includes('Administrador') || (loggedUserBeforeSave.permissions || []).includes('Usuários'));
    const safeStatus = (isSelfSave && !isAdminSave) ? loggedUserBeforeSave.status : status;
    const safeProfile = (isSelfSave && !isAdminSave) ? loggedUserBeforeSave.profile : profile;
    const safeEmpresa = (isSelfSave && !isAdminSave) ? loggedUserBeforeSave.empresa_id : empresa_id;
    const safeUnit = (isSelfSave && !isAdminSave) ? loggedUserBeforeSave.unitId : unitId;
    if (isSelfSave && !isAdminSave) permissions = loggedUserBeforeSave.permissions || permissions;

    let linked_users = [];
    if (safeProfile === 'Supervisor') {
      document.querySelectorAll('.perm-link-vendedor-checkbox:checked').forEach(cb => {
        linked_users.push(cb.value);
      });
    } else if (safeProfile === 'Gerente') {
      document.querySelectorAll('.perm-link-supervisor-checkbox:checked').forEach(cb => {
        linked_users.push(cb.value);
      });
      document.querySelectorAll('.perm-link-gerente-vendedor-checkbox:checked').forEach(cb => {
        linked_users.push(cb.value);
      });
    }

    let supervisor_id = null;
    if (safeProfile === 'Vendedor') {
      const selectSup = document.getElementById('perm-user-supervisor-id');
      supervisor_id = selectSup ? selectSup.value : null;
      if (!supervisor_id) {
        alert('Por favor, selecione um Supervisor Responsável para o vendedor.');
        return;
      }
    }

    try {
      const result = await this.fetchFromApi(`/api/usuarios/${userId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({
          status: safeStatus,
          profile: safeProfile,
          permissions,
          name,
          username,
          email,
          phone,
          ...(password ? { password } : {}),
          empresa_id: safeEmpresa,
          unitId: safeUnit,
          photo,
          linked_users,
          supervisor_id
        })
      });

      if (result.success) {
        this.showToast('Cadastro e permissões do usuário atualizados!');
        document.getElementById('modal-user-permissions').style.display = 'none';
        
        // If the edited user is the logged in user, refresh their details in memory
        const loggedUser = Store.getLoggedUser();
        if (loggedUser && loggedUser.id === userId) {
          loggedUser.status = safeStatus;
          loggedUser.profile = safeProfile;
          loggedUser.permissions = permissions;
          loggedUser.name = name;
          loggedUser.username = username;
          loggedUser.email = email;
          loggedUser.phone = phone;
          loggedUser.photo = photo;
          loggedUser.empresa_id = safeEmpresa;
          loggedUser.unitId = safeUnit;
          Store.setLoggedUser(loggedUser);
          UI.applyPermissions();

          // If status became block or permissions changed, route them back to dashboard
          const allowed = Store.getUserAllowedRoutes(loggedUser);
          if (!allowed.includes(window.location.hash)) {
            window.location.hash = '#dashboard';
          }
        }

        try {
          localStorage.setItem(`controle_campo_user_updated_${userId}`, String(Date.now()));
        } catch (e) {}
        await this.refreshLoggedUserFromApi().catch(() => {});
        UI.populateUnitDropdowns();
        await UI.renderUsers();
        await this.refreshAllLists();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar permissões: ' + err.message);
    }
  },

  /**
   * Delete user permanently from the system.
   */
  editUnit(unitId) {
    const user = Store.getLoggedUser();
    if (!user || user.profile !== 'Administrador') {
      alert('Somente administrador pode editar unidades.');
      return;
    }
    const units = Store.getUnits();
    const unit = units.find(u => String(u.id) === String(unitId));
    if (!unit) return;
    const formContainer = document.getElementById('unit-form-container');
    const formEl = document.getElementById('unit-form');
    const nameInput = document.getElementById('unit-name');
    if (formContainer) formContainer.classList.remove('hidden');
    if (formEl) formEl.dataset.editingId = unit.id;
    if (nameInput) {
      nameInput.value = unit.name;
      nameInput.focus();
    }
    const submitBtn = formEl ? formEl.querySelector('button[type="submit"]') : null;
    if (submitBtn) submitBtn.textContent = 'Atualizar Unidade';
  },

  async deleteUser(userId, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const loggedUser = Store.getLoggedUser();
    if (loggedUser && loggedUser.id === userId) {
      alert('Você não pode excluir o próprio usuário logado.');
      return;
    }

    if (!confirm('Deseja realmente excluir este usuário permanentemente?')) return;

    try {
      const result = await this.fetchFromApi(`/api/usuarios/${userId}`, { method: 'DELETE' });
      if (result && result.success) {
        // Limpa também qualquer base local antiga, para o usuário não voltar por cache/default.
        try {
          const users = Store.getUsers().filter(u => u.id !== userId);
          Store.saveUsers(users);
          if (Store.markUserDeleted) Store.markUserDeleted(userId);
        } catch (e) {}
        try { localStorage.setItem(`controle_campo_user_updated_${userId}`, String(Date.now())); } catch (e) {}
        this.showToast('Usuário excluído permanentemente.');
        UI.renderUsers();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir usuário: ' + err.message);
    }
  },

  /**
   * Delete solicitation
   */
  async deleteExpenseRequest(id) {
    if (!confirm(`Deseja realmente excluir a solicitação #${id}?`)) return;

    try {
      const result = await this.fetchFromApi(`/api/despesas/${id}`, {
        method: 'DELETE'
      });

      if (result.success) {
        this.showToast(`Solicitação #${id} excluída com sucesso!`);
        this.loadDespesasDashboard();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir solicitação: ' + err.message);
    }
  },

  /**
   * Edit solicitation
   */
  async editExpenseRequest(id) {
    try {
      const data = await this.fetchFromApi(`/api/despesas/${id}`);
      if (data.status !== 'Pendente') {
        alert('Apenas solicitações com status Pendente podem ser editadas.');
        return;
      }

      window.location.hash = '#solicitacao-despesas';

      setTimeout(() => {
        const formContainer = document.getElementById('balance-form-container');
        if (formContainer) formContainer.classList.remove('hidden');

        document.getElementById('sol-empresa').value = data.empresa || '';
        document.getElementById('sol-solicitante').value = data.solicitante || '';
        document.getElementById('sol-justificativa').value = data.justificativa || '';

        let noites = 0;
        if (data.valor_hotel_alim === 120.00) noites = 1;
        else if (data.valor_hotel_alim === 240.00) noites = 2;
        else if (data.valor_hotel_alim === 360.00) noites = 3;
        else if (data.valor_hotel_alim === 480.00) noites = 4;

        const radios = document.getElementsByName('sol-noites');
        radios.forEach(r => r.checked = parseInt(r.value) === noites);

        document.getElementById('sol-abastecimento').value = data.valor_abastecimento || '';
        document.getElementById('sol-placa').value = data.placa_veiculo || '';
        document.getElementById('sol-rota').value = data.rota_destino || '';

        const container = document.getElementById('sol-extras-container');
        container.innerHTML = '';
        if (Array.isArray(data.extras)) {
          data.extras.forEach(ext => {
            this.addSolicitacaoExtraRow(ext.descricao, ext.valor);
          });
        }

        const form = document.getElementById('solicitacao-despesas-form');
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        this.solicitacaoFormEventsConfigured = false;

        newForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const empresa = document.getElementById('sol-empresa').value;
            const solicitante = document.getElementById('sol-solicitante').value.trim();
            const justificativa = document.getElementById('sol-justificativa').value.trim();

            const radios = document.getElementsByName('sol-noites');
            let noites = 0;
            radios.forEach(r => {
              if (r.checked) noites = parseInt(r.value) || 0;
            });
            const rates = { 0: 0, 1: 120.00, 2: 240.00, 3: 360.00, 4: 480.00 };
            const valor_hotel_alim = rates[noites] || 0;

            const abasInput = document.getElementById('sol-abastecimento');
            const valor_abastecimento = abasInput ? parseFloat(abasInput.value) || 0 : 0;

            const placa_veiculo = document.getElementById('sol-placa').value.trim().toUpperCase();
            const rota_destino = document.getElementById('sol-rota').value.trim();

            const extras = [];
            const rows = document.querySelectorAll('#sol-extras-container > div');
            rows.forEach(row => {
              const desc = row.querySelector('.extra-desc').value.trim();
              const val = parseFloat(row.querySelector('.extra-val').value) || 0;
              if (desc && val > 0) {
                extras.push({ descricao: desc, valor: val });
              }
            });

            const body = {
              empresa,
              solicitante,
              justificativa,
              valor_hotel_alim,
              valor_abastecimento,
              placa_veiculo,
              rota_destino,
              extras
            };

            const result = await this.fetchFromApi(`/api/despesas/${id}`, {
              method: 'PUT',
              body: JSON.stringify(body)
            });

            if (result.success) {
              this.showToast('Solicitação atualizada com sucesso!');
              window.location.hash = '#despesas-dashboard';
            }
          } catch (err) {
            console.error(err);
            alert('Erro ao atualizar solicitação: ' + err.message);
          }
        });

        this.setupSolicitacaoFormEventsForClonedForm(newForm);
        this.updateSolicitacaoTotal();
      }, 100);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar solicitação para edição: ' + err.message);
    }
  },

  /**
   * Helper to configure event listeners on cloned form elements
   */
  setupSolicitacaoFormEventsForClonedForm(form) {
    const radios = document.getElementsByName('sol-noites');
    radios.forEach(r => {
      r.addEventListener('change', () => this.updateSolicitacaoTotal());
    });

    const abasInput = document.getElementById('sol-abastecimento');
    if (abasInput) {
      abasInput.addEventListener('input', () => this.updateSolicitacaoTotal());
    }

    const btnAddExtra = document.getElementById('btn-add-extra');
    if (btnAddExtra) {
      const newBtn = btnAddExtra.cloneNode(true);
      btnAddExtra.parentNode.replaceChild(newBtn, btnAddExtra);
      newBtn.addEventListener('click', () => {
        this.addSolicitacaoExtraRow();
      });
    }
  },

  /**
   * PDF Document generator via jsPDF (client side)
   */
  async generateExpensePdf(id) {
    try {
      const data = await this.fetchFromApi(`/api/despesas/${id}`);
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(1);
      doc.rect(5, 5, 200, 287);

      doc.setFillColor(37, 99, 235);
      doc.rect(5, 5, 200, 20, 'F');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text('SOLICITAÇÃO DE SALDO / ADIANTAMENTO DE SALDO', 10, 17);

      doc.setTextColor(0, 0, 0);

      doc.setFontSize(9);
      doc.setFont('Helvetica', 'normal');
      doc.text(`Solicitação ID: #${data.id}`, 15, 33);
      doc.text(`Emissão: ${window.CC_pdfEmissionText ? window.CC_pdfEmissionText(new Date()) : new Date().toLocaleString('pt-BR')}`, 110, 33);
      doc.text(`Status: ${data.status.toUpperCase()}`, 15, 39);
      doc.text(`Empresa: ${(window.CC_pdfCompanyName ? window.CC_pdfCompanyName(data) : (data.empresa || 'Não informada'))}`, 110, 39);

      doc.setDrawColor(220, 220, 220);
      doc.line(10, 44, 200, 44);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('DADOS OPERACIONAIS', 15, 51);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Solicitante: ${data.solicitante}`, 15, 58);
      doc.text(`Placa do Veículo: ${data.placa_veiculo || '-'}`, 110, 58);
      doc.text(`Rota / Cidades Destino: ${data.rota_destino}`, 15, 65);

      doc.setFont('Helvetica', 'bold');
      doc.text('JUSTIFICATIVA:', 15, 75);
      doc.setFont('Helvetica', 'normal');

      const justLines = doc.splitTextToSize(data.justificativa || 'Nenhuma justificativa informada.', 180);
      doc.text(justLines, 15, 81);

      const yOffsetTable = 81 + (justLines.length * 5) + 8;

      doc.line(10, yOffsetTable - 4, 200, yOffsetTable - 4);

      doc.setFont('Helvetica', 'bold');
      doc.setFillColor(240, 240, 240);
      doc.rect(15, yOffsetTable + 4, 180, 7, 'F');
      doc.setFontSize(8);
      doc.text('Item / Descrição', 17, yOffsetTable + 9);
      doc.text('Qtd S.', 62, yOffsetTable + 9);
      doc.text('Qtd A.', 74, yOffsetTable + 9);
      doc.text('Vl. Sol.', 86, yOffsetTable + 9);
      doc.text('Vl. Apr.', 108, yOffsetTable + 9);
      doc.text('Status', 130, yOffsetTable + 9);
      doc.text('Justificativa', 152, yOffsetTable + 9);

      doc.setFont('Helvetica', 'normal');
      let currY = yOffsetTable + 17;
      const fmt = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

      let totalSol = 0;
      let totalApr = 0;

      const printRow = (desc, qS, qA, vS, vA, st, just) => {
        doc.text(desc, 17, currY);
        doc.text(String(qS), 62, currY);
        doc.text(String(qA), 74, currY);
        doc.text(fmt(vS), 86, currY);
        doc.text(vA !== null && vA !== undefined ? fmt(vA) : '-', 108, currY);
        doc.text(st ? String(st).toUpperCase() : 'PENDENTE', 130, currY);
        const truncatedJust = just && just.length > 25 ? just.substring(0, 22) + '...' : (just || '-');
        doc.text(truncatedJust, 152, currY);
        currY += 8;
      };

      if (Array.isArray(data.itens) && data.itens.length) {
        data.itens.forEach(item => {
          printRow(
            item.categoria,
            item.quantidade_solicitada !== null ? item.quantidade_solicitada : '-',
            item.quantidade_aprovada !== null ? item.quantidade_aprovada : '-',
            item.valor_solicitado,
            item.valor_aprovado,
            item.status,
            item.justificativa
          );
          totalSol += parseFloat(item.valor_solicitado) || 0;
          totalApr += parseFloat(item.valor_aprovado) || 0;
        });
      } else {
        const hotelVal = parseFloat(data.valor_hotel_alim) || 0;
        const abasVal = parseFloat(data.valor_abastecimento) || 0;
        const statusText = (data.status === 'Aprovada' || data.status === 'Aprovada (não valor total)') ? 'APROVADO' : (data.status === 'Rejeitada' ? 'REPROVADO' : 'PENDENTE');
        if (hotelVal > 0) {
          const noites = Math.round(hotelVal / 120.00) || 1;
          printRow('Hotel e Alimentação (Hospedagem)', noites, statusText === 'APROVADO' ? noites : '-', hotelVal, statusText === 'APROVADO' ? hotelVal : 0, statusText, '');
          totalSol += hotelVal;
          if (statusText === 'APROVADO') totalApr += hotelVal;
        }
        if (abasVal > 0) {
          printRow('Combustível / Abastecimento', '-', '-', abasVal, statusText === 'APROVADO' ? abasVal : 0, statusText, '');
          totalSol += abasVal;
          if (statusText === 'APROVADO') totalApr += abasVal;
        }
        if (Array.isArray(data.extras)) {
          data.extras.forEach(ext => {
            const val = parseFloat(ext.valor) || 0;
            printRow(`Extra: ${ext.descricao}`, '-', '-', val, statusText === 'APROVADO' ? val : 0, statusText, '');
            totalSol += val;
            if (statusText === 'APROVADO') totalApr += val;
          });
        }
      }

      doc.line(15, currY - 2, 195, currY - 2);
      doc.setFont('Helvetica', 'bold');
      doc.text('VALORES TOTAIS (SOLICITADO / APROVADO)', 17, currY + 4);
      doc.text(fmt(totalSol), 86, currY + 4);
      doc.text(fmt(totalApr), 108, currY + 4);

      currY += 15;

      if (Array.isArray(data.aprovacoes) && data.aprovacoes.length) {
        doc.line(10, currY - 2, 200, currY - 2);
        currY += 6;
        doc.setFont('Helvetica', 'bold');
        doc.text('HISTÓRICO DE PARECERES E APROVAÇÕES', 15, currY);
        doc.setFont('Helvetica', 'normal');
        currY += 8;

        data.aprovacoes.forEach(ap => {
          doc.text(`Aprovador: ${UI.getUserName(ap.gerente_id)} | Ação: ${ap.status.toUpperCase()}`, 15, currY);
          doc.text(`Data: ${new Date(ap.data_aprovacao + 'T00:00:00').toLocaleDateString('pt-BR')} às ${ap.hora_aprovacao}`, 120, currY);
          currY += 6;
          const obsLines = doc.splitTextToSize(`Observações: ${ap.observacao || 'Sem observações'}`, 170);
          doc.text(obsLines, 15, currY);
          currY += (obsLines.length * 5) + 6;
        });
      }

      const signatureY = 250;
      doc.line(20, signatureY, 80, signatureY);
      doc.text('Assinatura Solicitante', 30, signatureY + 5);

      doc.line(120, signatureY, 180, signatureY);
      doc.text('Assinatura Aprovador', 130, signatureY + 5);

      doc.save(`Solicitacao-Despesa-${data.id}.pdf`);
      this.showToast('Documento PDF gerado com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF: ' + err.message);
    }
  },
 
  /**
   * PDF Document generator for travel expense voucher (client side)
   */
  async deleteRegisteredExpense(id) {
    if (!confirm(`Deseja realmente excluir a despesa #${id}?`)) return;
    try {
      const result = await this.fetchFromApi(`/api/despesas-reembolsos/${id}`, { method: 'DELETE' });
      if (result?.success) {
        const cached = this.readFastCache('despesas_reembolsos_api', []);
        const next = cached.filter(item => String(item.id) !== String(id));
        this.writeFastCache('despesas_reembolsos_api', next);
        window.AppExpensesCache = next;
        if (UI?.renderExpenses) UI.renderExpenses(next);
        if (UI?.renderDashboard) UI.renderDashboard();
        this.showToast('Despesa excluída com sucesso!');
        this.loadExpenses();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir despesa: ' + err.message);
    }
  },

  async generateExpenseComprovantePdf(id) {
    try {
      const exp = await this.fetchFromApi(`/api/despesas-reembolsos/${id}`);
      if (!exp) {
        this.showToast('Despesa não encontrada!', 'danger');
        return;
      }
 
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
 
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(1);
      doc.rect(5, 5, 200, 287);
 
      doc.setFillColor(37, 99, 235);
      doc.rect(5, 5, 200, 20, 'F');
 
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text('COMPROVANTE DE DESPESA DE VIAGEM', 10, 17);
 
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont('Helvetica', 'normal');
 
      // Date formatting helper
      const dateParts = exp.date ? exp.date.split('-') : [];
      const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : (exp.date || '');
 
      doc.text(`Comprovante ID: #${exp.id}`, 15, 33);
      doc.text(`Data / Hora: ${formattedDate} ${exp.time ? ' às ' + exp.time : ''}`, 110, 33);
      doc.text(`Vendedor: ${UI.getExpenseUserName(exp)}`, 15, 39);
      doc.text(`Unidade: ${UI.getUnitName(exp.unitId)}`, 110, 39);
      doc.text(`Finalidade: ${exp.finalidade}`, 15, 45);
      doc.text(`Tipo de Operação: ${exp.operacao}`, 110, 45);
      doc.text(`Status: ${exp.status}`, 15, 51);
 
      doc.setDrawColor(220, 220, 220);
      doc.line(10, 56, 200, 56);
      let y = 63;
 
      if (exp.finalidade === 'Outro') {
        doc.setFont('Helvetica', 'bold');
        doc.text('DESCRIÇÃO DA FINALIDADE:', 15, y);
        doc.setFont('Helvetica', 'normal');
        y += 6;
        const descLines = doc.splitTextToSize(exp.descreva || 'Não informada.', 180);
        doc.text(descLines, 15, y);
        y += (descLines.length * 5) + 5;
      } else if (exp.finalidade === 'Abastecimento') {
        doc.setFont('Helvetica', 'bold');
        doc.text('DADOS DO ABASTECIMENTO', 15, y);
        doc.setFont('Helvetica', 'normal');
        y += 7;
        doc.text(`Veículo: ${exp.veiculo || '-'}`, 15, y);
        doc.text(`Quilometragem: ${exp.km ? exp.km + ' KM' : '-'}`, 110, y);
        y += 7;
        const fmt = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
        doc.text(`Valor: ${fmt(exp.value)}`, 15, y);
        y += 7;
        if (exp.observation) {
          const obsLines = doc.splitTextToSize(`Observação: ${exp.observation}`, 180);
          doc.text(obsLines, 15, y);
          y += (obsLines.length * 5) + 5;
        }
      } else {
        doc.setFont('Helvetica', 'bold');
        doc.text('DETALHES DA DESPESA', 15, y);
        doc.setFont('Helvetica', 'normal');
        y += 7;
        const fmt = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
        doc.text(`Valor: ${fmt(exp.value)}`, 15, y);
        y += 7;
        if (exp.observation) {
          const obsLines = doc.splitTextToSize(`Observação: ${exp.observation}`, 180);
          doc.text(obsLines, 15, y);
          y += (obsLines.length * 5) + 5;
        }
      }
 
      const mediaToDataUrlForPdf = async (url) => {
        if (!url) return '';
        const raw = String(url).trim();
        if (raw.startsWith('data:')) return raw;
        const src = raw.startsWith('http') || raw.startsWith('/') ? raw : '/' + raw.replace(/^\/+/, '');
        try {
          const token = Store.getToken && Store.getToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await fetch(src, { headers });
          if (!res.ok) throw new Error('Arquivo não encontrado');
          const blob = await res.blob();
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.warn('Não foi possível carregar imagem para PDF:', src, e.message || e);
          return '';
        }
      };
      const fotoOdometroPdf = await mediaToDataUrlForPdf(exp.foto_odometro);
      const fotoComprovantePdf = await mediaToDataUrlForPdf(exp.foto_comprovante);

      // Check for attached photos
      if (fotoOdometroPdf || fotoComprovantePdf) {
        y += 5;
        if (y > 200) {
          doc.addPage();
          doc.setDrawColor(37, 99, 235);
          doc.setLineWidth(1);
          doc.rect(5, 5, 200, 287);
          y = 20;
        }
        doc.setDrawColor(220, 220, 220);
        doc.line(10, y, 200, y);
        y += 8;
 
        doc.setFont('Helvetica', 'bold');
        doc.text('ANEXOS / COMPROVANTES FOTOGRÁFICOS', 15, y);
        doc.setFont('Helvetica', 'normal');
        y += 8;
 
        if (fotoOdometroPdf && fotoComprovantePdf) {
          if (y + 65 > 280) {
            doc.addPage();
            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(1);
            doc.rect(5, 5, 200, 287);
            y = 20;
          }
          try {
            doc.text('Odômetro:', 15, y);
            doc.text('Comprovante:', 110, y);
            y += 4;
            doc.addImage(fotoOdometroPdf, 'JPEG', 15, y, 80, 60);
            doc.addImage(fotoComprovantePdf, 'JPEG', 110, y, 80, 60);
            y += 65;
          } catch (imgErr) {
            console.error('Error adding images to PDF:', imgErr);
            doc.text('[Erro ao renderizar imagens no PDF]', 15, y);
            y += 10;
          }
        } else if (fotoComprovantePdf) {
          if (y + 80 > 280) {
            doc.addPage();
            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(1);
            doc.rect(5, 5, 200, 287);
            y = 20;
          }
          try {
            doc.text('Comprovante:', 15, y);
            y += 4;
            doc.addImage(fotoComprovantePdf, 'JPEG', 15, y, 100, 75);
            y += 80;
          } catch (imgErr) {
            console.error('Error adding comprovante to PDF:', imgErr);
            doc.text('[Erro ao renderizar comprovante no PDF]', 15, y);
            y += 10;
          }
        }
      }
 
      doc.save(`Comprovante-Despesa-${exp.id}.pdf`);
      this.showToast('Documento PDF gerado com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF: ' + err.message);
    }
  },

  /**
   * Direct generation and printing preview triggers
   */
  generatePdf(type) {
    UI.renderPrintSheet(type);
    window.location.hash = '#pdf';
  },

  openReportFilterModal(type) {
    document.getElementById('report-filter-type').value = type;
    
    // Reset form
    document.getElementById('report-filter-form').reset();
    
    // Get elements
    const groupCommon = document.getElementById('filter-group-common');
    const groupMovements = document.getElementById('filter-group-movements');
    const title = document.getElementById('report-filter-modal-title');
    const btnExcel = document.getElementById('btn-export-excel');
    
    const containerVendedor = document.getElementById('filter-vendedor-container');
    const containerStatus = document.getElementById('filter-status-container');
    const containerCategoria = document.getElementById('filter-categoria-container');
    const containerPrioridade = document.getElementById('filter-prioridade-container');
    
    // Hide all first
    groupCommon.style.display = 'none';
    groupMovements.style.display = 'none';
    btnExcel.style.display = 'none';
    containerVendedor.style.display = 'none';
    containerStatus.style.display = 'none';
    containerCategoria.style.display = 'none';
    containerPrioridade.style.display = 'none';
    
    // Populate dynamic sellers
    const filterVend = document.getElementById('filter-vendedor');
    filterVend.innerHTML = '<option value="">Todos os Vendedores</option>';
    const users = Store.getUsers();
    users.forEach(u => {
      filterVend.innerHTML += `<option value="${u.id}">${u.name}</option>`;
    });
    
    if (type === 'movements') {
      title.textContent = 'Filtros: Movimentação de Equipamentos';
      groupMovements.style.display = 'block';
      btnExcel.style.display = 'inline-block';
    } else {
      groupCommon.style.display = 'block';
      containerVendedor.style.display = 'block';
      containerStatus.style.display = 'block';
      
      const statusSelect = document.getElementById('filter-status');
      statusSelect.innerHTML = '<option value="">Todos os Status</option>';
      
      if (type === 'prospects') {
        title.textContent = 'Filtros: Prospecção de Clientes';
        containerCategoria.style.display = 'block';
        
        // Populate categories
        const catSelect = document.getElementById('filter-categoria');
        catSelect.innerHTML = '<option value="">Todas as Categorias</option>';
        Store.getClientCategories().forEach(c => {
          catSelect.innerHTML += `<option value="${c}">${c}</option>`;
        });
        
        // Populate statuses
        const statuses = ['novo', 'contato', 'visita', 'proposta', 'negociacao', 'convertido', 'ganho', 'perdido'];
        statuses.forEach(s => {
          statusSelect.innerHTML += `<option value="${s}">${s.toUpperCase()}</option>`;
        });
      } 
      else if (type === 'tickets') {
        title.textContent = 'Filtros: Assistência / Chamados Mecânicos';
        containerPrioridade.style.display = 'block';
        
        // Populate statuses
        const statuses = ['Aberto', 'Em Andamento', 'Pendente', 'Resolvido'];
        statuses.forEach(s => {
          statusSelect.innerHTML += `<option value="${s}">${s}</option>`;
        });
      } 
      else if (type === 'expenses') {
        title.textContent = 'Filtros: Despesas Reembolsáveis';
        
        // Populate statuses
        const statuses = ['Pendente', 'Aprovado', 'Reprovado'];
        statuses.forEach(s => {
          statusSelect.innerHTML += `<option value="${s}">${s}</option>`;
        });
      }
    }
    
    document.getElementById('modal-report-filters').style.display = 'flex';
  },

  async submitReportFilter() {
    const type = document.getElementById('report-filter-type').value;
    
    // Save current filters to a global variable
    window.CurrentReportFilters = {};
    
    if (type === 'movements') {
      const filters = {
        empresa: document.getElementById('filter-mov-empresa').value,
        cidade: document.getElementById('filter-mov-cidade').value.trim(),
        vendedor: document.getElementById('filter-mov-vendedor').value.trim(),
        patrimonio: document.getElementById('filter-mov-patrimonio').value.trim(),
        tipo_solicitacao: document.getElementById('filter-mov-tipo').value,
        status: document.getElementById('filter-mov-status').value,
        data_inicio: document.getElementById('filter-mov-data-inicio').value,
        data_fim: document.getElementById('filter-mov-data-fim').value
      };

      Object.keys(filters).forEach(key => {
        const val = String(filters[key] || '').trim();
        if (!val || ['todos', 'todas', 'all', 'null', 'undefined'].includes(val.toLowerCase())) {
          delete filters[key];
        }
      });

      try {
        const query = '?' + new URLSearchParams(filters).toString();
        const list = await this.fetchFromApi(`/api/equipamentos/movimentacoes${query}`);
        window.CurrentFilteredMovements = list;
        
        window.CurrentReportFilters = filters;
        
        document.getElementById('modal-report-filters').style.display = 'none';
        this.generatePdf('movements');
      } catch (err) {
        console.error(err);
        alert('Erro ao gerar PDF de movimentações: ' + err.message);
      }
    } else {
      const filters = {
        data_inicio: document.getElementById('filter-data-inicio').value,
        data_fim: document.getElementById('filter-data-fim').value,
        vendedor: document.getElementById('filter-vendedor').value,
        status: document.getElementById('filter-status').value,
        categoria: document.getElementById('filter-categoria').value,
        prioridade: document.getElementById('filter-prioridade').value
      };
      
      window.CurrentReportFilters = filters;
      document.getElementById('modal-report-filters').style.display = 'none';
      this.generatePdf(type);
    }
  },

  async submitReportExcel() {
    const filters = {
      empresa: document.getElementById('filter-mov-empresa').value,
      cidade: document.getElementById('filter-mov-cidade').value.trim(),
      vendedor: document.getElementById('filter-mov-vendedor').value.trim(),
      patrimonio: document.getElementById('filter-mov-patrimonio').value.trim(),
      tipo_solicitacao: document.getElementById('filter-mov-tipo').value,
      status: document.getElementById('filter-mov-status').value,
      data_inicio: document.getElementById('filter-mov-data-inicio').value,
      data_fim: document.getElementById('filter-mov-data-fim').value
    };

    Object.keys(filters).forEach(key => {
      const val = String(filters[key] || '').trim();
      if (!val || ['todos', 'todas', 'all', 'null', 'undefined'].includes(val.toLowerCase())) {
        delete filters[key];
      }
    });

    try {
      const query = '?' + new URLSearchParams(filters).toString();
      const list = await this.fetchFromApi(`/api/equipamentos/movimentacoes${query}`);

      if (list.length === 0) {
        alert('Nenhum dado encontrado para exportar.');
        return;
      }

      const headers = [
        'ID', 'Data', 'Tipo de Solicitação', 'Empresa', 'Código do Cliente', 
        'Nome Fantasia', 'Cidade', 'Endereço', 'Solicitante', 'Patrimônio Antigo', 
        'Modelo Antigo', 'Voltagem Antiga', 'Patrimônio Novo', 'Modelo Novo', 
        'Voltagem Nova', 'Quantidade', 'Detalhe Troca/Adição', 'Motivo Recolha', 
        'Observação', 'Status'
      ];

      const csvRows = [headers.join(';')];

      list.forEach(m => {
        const row = [
          m.id,
          m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR') : '',
          m.tipo_solicitacao || '',
          m.empresa || '',
          m.cliente_codigo || '',
          `"${(m.cliente_nome || '').replace(/"/g, '""')}"`,
          `"${(m.cliente_cidade || '').replace(/"/g, '""')}"`,
          `"${(m.cliente_endereco || '').replace(/"/g, '""')}"`,
          `"${(m.vendedor_solicitante || '').replace(/"/g, '""')}"`,
          m.patrimonio || '',
          `"${(m.modelo || '').replace(/"/g, '""')}"`,
          m.voltagem || '',
          m.patrimonio_novo || '',
          `"${(m.modelo_novo || '').replace(/"/g, '""')}"`,
          m.voltagem_nova || '',
          m.quantidade || 1,
          `"${(m.detalhe_troca_adicao || '').replace(/"/g, '""')}"`,
          `"${(m.motivo_recolhimento || '').replace(/"/g, '""')}"`,
          `"${(m.observacao || '').replace(/"/g, '""')}"`,
          m.status || ''
        ];
        csvRows.push(row.join(';'));
      });

      const csvContent = '\uFEFF' + csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `relatorio-movimentacao-${new Date().toISOString().slice(0,10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      document.getElementById('modal-report-filters').style.display = 'none';
      this.showToast('Planilha Excel (CSV) exportada com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao exportar Excel: ' + err.message);
    }
  },

  /**
   * Check patrimony exists and autofill model/voltage
   */
  async checkPatrimonio(inputEl, modelEl, voltagemEl, linkEl) {
    const val = (inputEl.value || '').trim().toUpperCase();
    if (!val) {
      if (linkEl) linkEl.style.display = 'none';
      return;
    }

    try {
      const data = await this.fetchFromApi(`/api/equipamentos/patrimonio/${val}`);
      if (data.exists) {
        if (modelEl) {
          modelEl.value = data.modelo || '';
          modelEl.setAttribute('readonly', '');
          modelEl.style.backgroundColor = 'rgba(255,255,255,0.03)';
        }
        if (voltagemEl) {
          voltagemEl.value = data.voltagem || '110';
          voltagemEl.setAttribute('disabled', '');
          voltagemEl.style.backgroundColor = 'rgba(255,255,255,0.03)';
        }
        if (linkEl) {
          linkEl.style.display = 'block';
          const anchor = linkEl.querySelector('a');
          if (anchor) {
            anchor.setAttribute('onclick', `App.openPatrimonioTimeline('${val}')`);
          }
        }
        this.showToast(`Equipamento patrimônio "${val}" localizado na base.`);
      } else {
        if (modelEl) {
          modelEl.value = '';
          modelEl.removeAttribute('readonly');
          modelEl.style.backgroundColor = '';
        }
        if (voltagemEl) {
          voltagemEl.value = '';
          voltagemEl.removeAttribute('disabled');
          voltagemEl.style.backgroundColor = '';
        }
        if (linkEl) {
          linkEl.style.display = 'none';
        }
      }
    } catch (err) {
      console.error(err);
    }
  },

  /**
   * Submit equipment movement form to API
   */
  async submitMovementForm(e) {
    e.preventDefault();
    const loggedUser = Store.getLoggedUser();
    if (!loggedUser) {
      alert('Você precisa estar logado.');
      return;
    }

    if (this._movementSubmitting) return;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    const tipo_solicitacao = document.getElementById('mov-tipo-solicitacao').value;
    if (!tipo_solicitacao) {
      alert('Por favor, selecione o tipo de solicitação.');
      return;
    }

    const cliente_codigo = document.getElementById('mov-client-id').value;
    const cliente_nome = document.getElementById('mov-client-name').value.trim();
    const cliente_cidade = document.getElementById('mov-client-city').value.trim();
    const cliente_endereco = document.getElementById('mov-client-address').value.trim();
    const cliente_vendedor = document.getElementById('mov-client-seller').value.trim();
    const movEmpresaSelect = document.getElementById('mov-empresa');
    const empresa = movEmpresaSelect ? (movEmpresaSelect.options[movEmpresaSelect.selectedIndex]?.text || movEmpresaSelect.value) : '';
    const vendedor_solicitante = document.getElementById('mov-vendedor-solicitante').value;

    if (!cliente_nome || !cliente_cidade) {
      alert('Preencha os dados do cliente.');
      return;
    }

    let patrimonio = '';
    let modelo = '';
    let voltagem = '';
    let patrimonio_novo = '';
    let modelo_novo = '';
    let voltagem_nova = '';
    let quantidade = 1;
    let detalhe_troca_adicao = '';
    let motivo_recolhimento = '';
    let observacao = '';

    let foto_equipamento_url = '';
    let foto_antes_url = '';
    let foto_depois_url = '';
    let video_url = '';

    if (tipo_solicitacao === 'Troca') {
      patrimonio = document.getElementById('mov-patrimonio-antigo').value.trim().toUpperCase();
      modelo = document.getElementById('mov-modelo-antigo').value.trim();
      voltagem = document.getElementById('mov-voltagem-antiga').value;
      patrimonio_novo = document.getElementById('mov-patrimonio-novo').value.trim().toUpperCase();
      modelo_novo = document.getElementById('mov-modelo-novo').value.trim();
      voltagem_nova = document.getElementById('mov-voltagem-nova').value;
      detalhe_troca_adicao = document.getElementById('mov-detalhe-troca').value.trim();
      
      const fAntigo = document.getElementById('mov-foto-antigo').files[0];
      const fTroca = document.getElementById('mov-foto-troca').files[0];
      const vTroca = document.getElementById('mov-video-troca').files[0];

      if (fAntigo) {
        foto_equipamento_url = await this.uploadFile(fAntigo);
      }
      if (fTroca) {
        foto_antes_url = await this.uploadFile(fTroca);
      }
      if (vTroca) {
        video_url = await this.uploadFile(vTroca);
      }
    } else if (tipo_solicitacao === 'Adição') {
      patrimonio = ''; // patrimônio será informado apenas pelo gestor na aprovação
      modelo = document.getElementById('mov-modelo-adicao').value.trim();
      voltagem = document.getElementById('mov-voltagem-adicao').value;
      quantidade = parseInt(document.getElementById('mov-quantidade-adicao').value) || 1;
      detalhe_troca_adicao = document.getElementById('mov-detalhe-adicao').value.trim();
    } else if (tipo_solicitacao === 'Recolha') {
      patrimonio = document.getElementById('mov-patrimonio-recolha').value.trim().toUpperCase();
      modelo = document.getElementById('mov-modelo-recolha').value.trim();
      voltagem = document.getElementById('mov-voltagem-recolha').value;
      motivo_recolhimento = document.getElementById('mov-motivo-recolhimento').value.trim();

      const fRecolhido = document.getElementById('mov-foto-recolhido').files[0];
      if (fRecolhido) {
        foto_equipamento_url = await this.uploadFile(fRecolhido);
      }
    } else if (tipo_solicitacao === 'Adesivar') {
      patrimonio = document.getElementById('mov-patrimonio-adesivar').value.trim().toUpperCase();
      modelo = document.getElementById('mov-modelo-adesivar').value.trim();
      voltagem = document.getElementById('mov-voltagem-adesivar').value;
      observacao = document.getElementById('mov-obs-adesivar').value.trim();

      const fAntes = document.getElementById('mov-foto-antes').files[0];
      const fDepois = document.getElementById('mov-foto-depois').files[0];
      if (fAntes) {
        foto_antes_url = await this.uploadFile(fAntes);
      }
      if (fDepois) {
        foto_depois_url = await this.uploadFile(fDepois);
      }
    }

    const payload = {
      empresa,
      tipo_solicitacao,
      vendedor_solicitante,
      cliente_codigo,
      cliente_nome,
      cliente_cidade,
      cliente_endereco,
      cliente_vendedor,
      observacao,
      patrimonio,
      modelo,
      voltagem,
      patrimonio_novo,
      modelo_novo,
      voltagem_nova,
      quantidade,
      detalhe_troca_adicao,
      motivo_recolhimento,
      foto_equipamento_url,
      foto_antes_url,
      foto_depois_url,
      video_url
    };

    try {
      this._movementSubmitting = true;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.dataset.originalText = submitBtn.textContent; submitBtn.textContent = 'Salvando...'; }
      const res = await this.fetchFromApi('/api/equipamentos/movimentacoes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.success) {
        this.showToast('Solicitação de movimentação registrada com sucesso!');
        
        document.getElementById('movement-form').reset();
        
        ['mov-client-name','mov-client-city','mov-client-address','mov-client-seller'].forEach(id => {
          const el = document.getElementById(id);
          if (el) { el.removeAttribute('readonly'); el.style.backgroundColor = ''; }
        });

        document.getElementById('div-mov-troca').style.display = 'none';
        document.getElementById('div-mov-adicao').style.display = 'none';
        document.getElementById('div-mov-recolha').style.display = 'none';
        document.getElementById('div-mov-adesivar').style.display = 'none';
        
        document.querySelectorAll("[id^='preview-container-mov-foto']").forEach(el => el.style.display = 'none');
        
        const sellerInput = document.getElementById('mov-vendedor-solicitante');
        if (sellerInput && loggedUser) sellerInput.value = loggedUser.name;
        UI.populateMovementCompanyDropdown();

        const formContainer = document.getElementById('movement-form-container');
        if (formContainer) formContainer.classList.add('hidden');

        await this.loadMovements();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao registrar movimentação: ' + err.message);
    } finally {
      this._movementSubmitting = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.originalText || 'Registrar Movimentação de Equipamento'; }
    }
  },


  async loadDeletionHistory() {
    const body = document.getElementById('deletion-history-table-body');
    if (!body) return;
    try {
      const rows = await this.fetchFromApi('/api/historico-exclusoes');
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Nenhuma exclusão registrada.</td></tr>';
        return;
      }
      body.innerHTML = rows.map(row => `
        <tr>
          <td>${row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : '-'}</td>
          <td>${row.modulo || '-'}</td>
          <td>#${row.registro_id || '-'}</td>
          <td>${row.criado_por || '-'}</td>
          <td>${row.excluido_por || '-'}</td>
          <td>${row.motivo || '-'}</td>
        </tr>
      `).join('');
    } catch (err) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);">Erro ao carregar histórico: ${err.message}</td></tr>`;
    }
  },


  getFastCacheKey(key) {
    const user = Store.getLoggedUser ? (Store.getLoggedUser() || {}) : {};
    const companyId = user.empresa_id || '001';
    return `controle_campo_fast_${companyId}_${key}`;
  },

  readFastCache(key, fallback = []) {
    try {
      const raw = localStorage.getItem(this.getFastCacheKey(key));
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  },

  writeFastCache(key, value) {
    try {
      localStorage.setItem(this.getFastCacheKey(key), JSON.stringify(value || []));
      localStorage.setItem(`${this.getFastCacheKey(key)}_updated_at`, new Date().toISOString());
    } catch (err) {
      console.warn('Cache local cheio ou indisponível:', err.message);
    }
  },

  async loadListFast({ key, endpoint, render, assign }) {
    const cached = this.readFastCache(key, []);
    if (cached && cached.length) {
      if (assign) assign(cached);
      render(cached);
      if (UI && UI.renderDashboard) UI.renderDashboard();
    }
    try {
      const fresh = await this.fetchFromApi(endpoint);
      const list = Array.isArray(fresh) ? fresh : [];
      this.writeFastCache(key, list);
      if (assign) assign(list);
      render(list);
      if (UI && UI.renderDashboard) UI.renderDashboard();
      return list;
    } catch (err) {
      console.error(`Erro ao carregar ${key}:`, err);
      if (cached && cached.length) return cached;
      throw err;
    }
  },

  /**
   * Load movements list from backend API
   */
  async loadMovements() {
    try {
      await this.loadListFast({
        key: 'movements_api',
        endpoint: '/api/equipamentos/movimentacoes',
        render: (list) => UI.renderMovements(list)
      });
    } catch (err) {
      console.error('Erro ao carregar movimentações:', err);
    }
  },

  async syncLocalExpenses() {
    try {
      const cached = this.readFastCache('despesas_reembolsos_api', []);
      const unsynced = cached.filter(e => String(e.id || '').startsWith('LOCAL-DP-'));
      if (!unsynced.length) return;
      for (const exp of unsynced) {
        const result = await this.fetchFromApi('/api/despesas-reembolsos', {
          method: 'POST',
          body: JSON.stringify({
            date: exp.date,
            time: exp.time,
            finalidade: exp.finalidade,
            operacao: exp.operacao,
            descreva: exp.descreva,
            veiculo: exp.veiculo,
            km: exp.km,
            foto_odometro: exp.foto_odometro,
            foto_comprovante: exp.foto_comprovante,
            value: exp.value,
            observation: exp.observation,
            unitId: exp.unitId,
            userId: exp.userId,
            userName: exp.userName
          })
        });
        if (result && (result.success || result.id)) {
          const freshList = this.readFastCache('despesas_reembolsos_api', []);
          const next = freshList.filter(e => e.id !== exp.id);
          this.writeFastCache('despesas_reembolsos_api', next);
        }
      }
    } catch (err) {
      console.warn('Falha na sincronização de despesas locais:', err);
    }
  },

  async loadExpenses() {
    try {
      await this.syncLocalExpenses();
      await this.loadListFast({
        key: 'despesas_reembolsos_api',
        endpoint: '/api/despesas-reembolsos',
        assign: (list) => { window.AppExpensesCache = list; },
        render: (list) => UI.renderExpenses(list)
      });
    } catch (err) {
      console.error('Erro ao carregar despesas registradas:', err);
    }
  },

  async loadBalances() {
    try {
      await this.loadListFast({
        key: 'despesas_solicitacoes_api',
        endpoint: '/api/despesas',
        assign: (list) => { window.AppBalancesCache = list; },
        render: (list) => UI.renderBalances(list)
      });
    } catch (err) {
      console.error('Erro ao carregar solicitações de saldo:', err);
    }
  },

  /**
   * Show detailed movement dossier modal
   */
  async showMovementDetails(id) {
    try {
      const mov = await this.fetchFromApi(`/api/equipamentos/movimentacoes/${id}`);
      this.currentMovementDossier = mov;
      
      document.getElementById('dossie-mov-id').textContent = mov.id;
      document.getElementById('dossie-mov-tipo').textContent = mov.tipo_solicitacao;
      
      const statusBadge = document.getElementById('dossie-mov-status');
      statusBadge.textContent = mov.status;
      statusBadge.className = 'badge-status';
      if (mov.status === 'Aprovado') statusBadge.classList.add('badge-success');
      else if (mov.status === 'Reprovado') statusBadge.classList.add('badge-danger');
      else statusBadge.classList.add('badge-warning');

      document.getElementById('dossie-cliente-codigo').textContent = mov.cliente_codigo || '-';
      document.getElementById('dossie-cliente-nome').textContent = mov.cliente_nome;
      document.getElementById('dossie-cliente-cidade').textContent = mov.cliente_cidade;
      document.getElementById('dossie-cliente-endereco').textContent = mov.cliente_endereco || '-';
      document.getElementById('dossie-cliente-vendedor').textContent = mov.cliente_vendedor || '-';

      document.getElementById('dossie-sol-empresa').textContent = mov.empresa;
      document.getElementById('dossie-sol-vendedor').textContent = mov.vendedor_solicitante;
      document.getElementById('dossie-sol-data').textContent = mov.created_at ? new Date(mov.created_at).toLocaleString('pt-BR') : '-';
      document.getElementById('dossie-sol-observacao').textContent = mov.observacao || 'Sem observações';

      const divTroca = document.getElementById('dossie-eq-troca-container');
      const divPadrao = document.getElementById('dossie-eq-padrao-container');
      const qtyCont = document.getElementById('dossie-quantidade-container');
      const recCont = document.getElementById('dossie-recolha-container');
      const detCont = document.getElementById('dossie-troca-detalhe-container');

      qtyCont.style.display = 'none';
      recCont.style.display = 'none';
      detCont.style.display = 'none';

      if (mov.tipo_solicitacao === 'Troca') {
        divTroca.style.display = 'grid';
        divPadrao.style.display = 'none';

        document.getElementById('dossie-patrimonio-antigo').textContent = mov.patrimonio;
        document.getElementById('dossie-modelo-antigo').textContent = mov.modelo;
        document.getElementById('dossie-voltagem-antiga').textContent = mov.voltagem;

        document.getElementById('dossie-patrimonio-novo').textContent = mov.patrimonio_novo;
        document.getElementById('dossie-modelo-novo').textContent = mov.modelo_novo;
        document.getElementById('dossie-voltagem-nova').textContent = mov.voltagem_nova;

        if (mov.detalhe_troca_adicao) {
          detCont.style.display = 'block';
          document.getElementById('dossie-troca-detalhe').textContent = mov.detalhe_troca_adicao;
        }
      } else {
        divTroca.style.display = 'none';
        divPadrao.style.display = 'block';

        document.getElementById('dossie-patrimonio-padrao').textContent = mov.patrimonio || mov.patrimonio_novo;
        document.getElementById('dossie-modelo-padrao').textContent = mov.modelo || mov.modelo_novo;
        document.getElementById('dossie-voltagem-padrao').textContent = mov.voltagem || mov.voltagem_nova;

        if (mov.tipo_solicitacao === 'Adição') {
          qtyCont.style.display = 'block';
          document.getElementById('dossie-quantidade-padrao').textContent = mov.quantidade;
          if (mov.detalhe_troca_adicao) {
            detCont.style.display = 'block';
            document.getElementById('dossie-troca-detalhe').textContent = mov.detalhe_troca_adicao;
          }
        } else if (mov.tipo_solicitacao === 'Recolha') {
          recCont.style.display = 'block';
          document.getElementById('dossie-recolhimento-motivo').textContent = mov.motivo_recolhimento;
        }
      }

      const mainPatrimony = mov.patrimonio || mov.patrimonio_novo;
      const timelineLink = document.getElementById('btn-show-timeline-dossie');
      if (timelineLink) {
        timelineLink.setAttribute('onclick', `App.openPatrimonioTimeline('${mainPatrimony}')`);
      }

      const gallery = document.getElementById('dossie-media-gallery');
      gallery.innerHTML = '';
      
      const mediaList = [];
      if (mov.foto_equipamento_url) mediaList.push({ url: mov.foto_equipamento_url, label: 'Equipamento', type: 'image' });
      if (mov.foto_antes_url) mediaList.push({ url: mov.foto_antes_url, label: mov.tipo_solicitacao === 'Adesivar' ? 'Antes' : 'Troca', type: 'image' });
      if (mov.foto_depois_url) mediaList.push({ url: mov.foto_depois_url, label: 'Depois', type: 'image' });
      if (mov.video_url) mediaList.push({ url: mov.video_url, label: 'Vídeo da Troca', type: 'video' });

      if (mediaList.length === 0) {
        gallery.innerHTML = '<span style="color:var(--text-muted); font-size:0.8rem; font-style:italic;">Nenhuma mídia registrada para esta movimentação.</span>';
      } else {
        gallery.innerHTML = mediaList.map(item => {
          const finalUrl = window.TempPhotosCache[item.url] || item.url;
          if (item.type === 'image') {
            return `
              <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; text-align: center;">
                <span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 6px;">${item.label}</span>
                <img src="${finalUrl}" style="max-width: 100%; max-height: 120px; border-radius: 4px; cursor: pointer;" onclick="App.showImagePreview('${finalUrl}')">
              </div>
            `;
          } else {
            return `
              <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; text-align: center;">
                <span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 6px;">${item.label}</span>
                <video src="${finalUrl}" controls style="max-width: 100%; max-height: 120px; border-radius: 4px;"></video>
              </div>
            `;
          }
        }).join('');
      }

      const reprovSecao = document.getElementById('dossie-reprovacao-secao');
      if (mov.status === 'Reprovado') {
        reprovSecao.style.display = 'block';
        document.getElementById('dossie-reprovacao-motivo').textContent = mov.motivo_reprovacao || 'Sem justificativa detalhada.';
      } else {
        reprovSecao.style.display = 'none';
      }

      const user = Store.getLoggedUser();
      const normalizeProfile = (value) => String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim();
      const userProfile = normalizeProfile(user && user.profile);
      const userPermissions = Array.isArray(user && user.permissions) ? user.permissions.map(normalizeProfile) : [];
      const isManager = user && (
        ['administrador', 'administrador sistema', 'responsavel equipamentos', 'gestor equipamentos', 'gestor de equipamentos'].includes(userProfile)
        || userPermissions.some(p => ['administrador', 'administrador acesso total', 'responsavel equipamentos', 'gestor equipamentos', 'gestor de equipamentos', 'confirmacao de movimentacao', 'confirmacao de troca', 'avaliacao de movimentacao', 'equipamentos'].includes(p))
      );
      const managerPanel = document.getElementById('dossie-manager-panel');
      
      if (isManager && mov.status === 'Pendente') {
        managerPanel.style.display = 'block';
        document.getElementById('dossie-review-notes').value = '';
        managerPanel.dataset.targetId = id;

        // Show EQUIPAMENTO DE SUBSTITUIÇÃO only for TROCA type
        const subBlock = document.getElementById('dossie-substituicao-block');
        if (subBlock) {
          const needsManagerEquipment = ['Troca', 'Adição'].includes(mov.tipo_solicitacao);
          subBlock.style.display = needsManagerEquipment ? 'block' : 'none';
          const subTitle = document.getElementById('dossie-sub-titulo');
          const subHelp = document.getElementById('dossie-sub-ajuda');
          if (subTitle) subTitle.textContent = mov.tipo_solicitacao === 'Adição' ? '✅ EQUIPAMENTO CONFIRMADO NA ADIÇÃO' : '🔄 EQUIPAMENTO DE SUBSTITUIÇÃO';
          if (subHelp) subHelp.textContent = mov.tipo_solicitacao === 'Adição' ? 'Preencha o patrimônio, modelo e voltagem confirmados para instalar no cliente.' : 'Preencha os dados do equipamento que será enviado para substituição. Não use listas pré-definidas — preencha manualmente.';
          // Clear previous values
          const subPat = document.getElementById('dossie-sub-patrimonio');
          const subMod = document.getElementById('dossie-sub-modelo');
          const subVolt = document.getElementById('dossie-sub-voltagem');
          if (subPat) subPat.value = '';
          if (subMod) subMod.value = '';
          if (subVolt) subVolt.value = '';
        }
      } else {
        managerPanel.style.display = 'none';
      }


      document.getElementById('modal-movimentacao-details').style.display = 'flex';

    } catch (err) {
      console.error(err);
      alert('Erro ao carregar detalhes: ' + err.message);
    }
  },

  /**
   * Submit manager approval or rejection for equipment movements
   */
  async submitMovementApproval(status) {
    const managerPanel = document.getElementById('dossie-manager-panel');
    const id = managerPanel.dataset.targetId;
    const notes = document.getElementById('dossie-review-notes').value.trim();

    if (status === 'Reprovado' && !notes) {
      alert('O motivo da reprovação é obrigatório.');
      return;
    }

    // Collect replacement equipment data if visible (TROCA type)
    const subBlock = document.getElementById('dossie-substituicao-block');
    let patrimonioNovo = '', modeloNovo = '', voltagemNova = '';
    if (subBlock && subBlock.style.display !== 'none' && status === 'Aprovado') {
      patrimonioNovo = (document.getElementById('dossie-sub-patrimonio')?.value || '').trim();
      modeloNovo = (document.getElementById('dossie-sub-modelo')?.value || '').trim();
      voltagemNova = (document.getElementById('dossie-sub-voltagem')?.value || '').trim();
      if (!patrimonioNovo || !modeloNovo || !voltagemNova) {
        alert('Preencha todos os campos do EQUIPAMENTO DE SUBSTITUIÇÃO antes de aprovar.');
        return;
      }
    }

    try {
      const res = await this.fetchFromApi(`/api/equipamentos/movimentacoes/${id}/approval`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          motivo_reprovacao: notes,
          patrimonio_novo: patrimonioNovo || undefined,
          modelo_novo: modeloNovo || undefined,
          voltagem_nova: voltagemNova || undefined
        })
      });

      if (res.success) {
        this.showToast(`Movimentação marcada como ${status}!`);
        document.getElementById('modal-movimentacao-details').style.display = 'none';
        await this.loadMovements();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar parecer gerencial: ' + err.message);
    }
  },


  async generateMovementDossierPdf() {
    const mov = this.currentMovementDossier;
    if (!mov) {
      alert('Abra um dossiê antes de gerar o PDF.');
      return;
    }
    const user = Store.getLoggedUser();
    const isSeller = user && String(user.profile || '').toLowerCase() === 'vendedor';

    const mediaHtml = [];
    const addImg = (url, label) => {
      if (!url) return;
      const finalUrl = (window.TempPhotosCache && window.TempPhotosCache[url]) || url;
      mediaHtml.push(`<div class="pdf-photo"><div class="pdf-photo-label">${label}</div><img src="${finalUrl}"></div>`);
    };
    addImg(mov.foto_equipamento_url, 'Equipamento');
    addImg(mov.foto_antes_url, mov.tipo_solicitacao === 'Adesivar' ? 'Antes' : 'Troca');
    addImg(mov.foto_depois_url, 'Depois');

    const isTroca = mov.tipo_solicitacao === 'Troca';
    let equipmentHtml = '';
    if (isSeller) {
      if (isTroca) {
        equipmentHtml = `
          <div class="pdf-box danger"><h4>RETIRADO (Antigo)</h4><p><b>Patrimônio:</b> ${mov.patrimonio || '-'}</p><p><b>Modelo:</b> ${mov.modelo || '-'}</p><p><b>Voltagem:</b> ${mov.voltagem || '-'} V</p></div>`;
      } else if (mov.tipo_solicitacao === 'Adição') {
        equipmentHtml = `
          <div class="pdf-box"><p><b>Quantidade:</b> ${mov.quantidade || 1}</p></div>`;
      } else {
        equipmentHtml = `
          <div class="pdf-box"><p><b>Patrimônio:</b> ${mov.patrimonio || ''}</p><p><b>Modelo:</b> ${mov.modelo || ''}</p><p><b>Voltagem:</b> ${mov.voltagem || ''} V</p><p><b>Quantidade:</b> ${mov.quantidade || 1}</p></div>`;
      }
    } else {
      equipmentHtml = isTroca ? `
        <div class="pdf-two">
          <div class="pdf-box danger"><h4>RETIRADO (Antigo)</h4><p><b>Patrimônio:</b> ${mov.patrimonio || '-'}</p><p><b>Modelo:</b> ${mov.modelo || '-'}</p><p><b>Voltagem:</b> ${mov.voltagem || '-'} V</p></div>
          <div class="pdf-box success"><h4>INSTALADO (Novo)</h4><p><b>Patrimônio:</b> ${mov.patrimonio_novo || ''}</p><p><b>Modelo:</b> ${mov.modelo_novo || ''}</p><p><b>Voltagem:</b> ${mov.voltagem_nova || ''}</p></div>
        </div>` : `
        <div class="pdf-box"><p><b>Patrimônio:</b> ${mov.patrimonio || mov.patrimonio_novo || ''}</p><p><b>Modelo:</b> ${mov.modelo || mov.modelo_novo || ''}</p><p><b>Voltagem:</b> ${mov.voltagem || mov.voltagem_nova || ''} V</p><p><b>Quantidade:</b> ${mov.quantidade || 1}</p></div>`;
    }

    const managerDecisionHtml = isSeller ? '' : `
      <h3>Decisão do Gestor de Equipamentos</h3>
      <div class="pdf-box"><b>Número do Patrimônio Novo</b><div class="blank"></div><b>Modelo do Equipamento Novo</b><div class="blank"></div><b>Voltagem do Equipamento Novo</b><div class="blank"></div><b>Parecer / Justificativa</b><div class="parecer"></div></div>`;

    const printWin = window.open('', '_blank');
    printWin.document.write(`<!doctype html><html><head><title>Dossiê de Movimentação #${mov.id}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111;background:#fff;margin:24px;font-size:12px} h1{font-size:20px;color:#2563eb;margin:0 0 12px} h3{font-size:14px;color:#2563eb;border-bottom:1px solid #bbb;padding-bottom:5px} .header{display:flex;justify-content:space-between;border:1px solid #bbb;padding:10px;border-radius:8px;margin-bottom:14px}.pdf-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pdf-box{border:1px solid #bbb;border-radius:8px;padding:10px;margin-bottom:12px}.danger h4{color:#dc2626}.success h4{color:#059669}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.photos{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.pdf-photo{border:1px solid #bbb;padding:8px;text-align:center;border-radius:8px}.pdf-photo img{max-width:100%;max-height:180px}.pdf-photo-label{font-weight:bold;margin-bottom:6px}.blank{height:26px;border-bottom:1px solid #111;margin:6px 0 12px}.parecer{height:80px;border:1px solid #111;margin-top:6px}
      </style></head><body>
      <h1>Dossiê de Movimentação #${mov.id}</h1>
      <div class="header"><div><b>Tipo de Operação:</b> ${mov.tipo_solicitacao}</div><div><b>Status:</b> ${mov.status}</div></div>
      <div class="grid"><div class="pdf-box"><h3>Dados do Cliente</h3><p><b>Código:</b> ${mov.cliente_codigo || '-'}</p><p><b>Nome Fantasia:</b> ${mov.cliente_nome || '-'}</p><p><b>Cidade:</b> ${mov.cliente_cidade || '-'}</p><p><b>Endereço:</b> ${mov.cliente_endereco || '-'}</p><p><b>Vendedor do Cliente:</b> ${mov.cliente_vendedor || '-'}</p></div>
      <div class="pdf-box"><h3>Dados da Solicitação</h3><p><b>Empresa Base:</b> ${mov.empresa || '-'}</p><p><b>Solicitante:</b> ${mov.vendedor_solicitante || '-'}</p><p><b>Data de Criação:</b> ${mov.created_at ? new Date(mov.created_at).toLocaleString('pt-BR') : '-'}</p><p><b>Observações:</b> ${mov.observacao || '-'}</p></div></div>
      <h3>Especificações de Equipamento</h3>${equipmentHtml}
      ${mov.detalhe_troca_adicao ? `<div class="pdf-box"><b>Detalhes:</b><br>${mov.detalhe_troca_adicao}</div>` : ''}
      ${mov.motivo_recolhimento ? `<div class="pdf-box"><b>Motivo do Recolhimento:</b><br>${mov.motivo_recolhimento}</div>` : ''}
      <h3>Comprovações de Mídia</h3><div class="photos">${mediaHtml.join('') || '<p>Nenhuma mídia registrada.</p>'}</div>
      ${managerDecisionHtml}
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    printWin.document.close();
  },

  toggleAllMovementSelection(source) {
    document.querySelectorAll('.movement-select-checkbox').forEach(cb => cb.checked = source.checked);
  },

  async deleteSelectedMovements() {
    const user = Store.getLoggedUser();
    const normalizeProfile = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim();
    const userProfile = normalizeProfile(user && user.profile);
    const userPermissions = Array.isArray(user && user.permissions) ? user.permissions.map(normalizeProfile) : [];
    const isAdmin = user && (
      ['administrador', 'administrador sistema'].includes(userProfile)
      || userPermissions.some(p => ['administrador', 'administrador acesso total'].includes(p))
    );
    if (!isAdmin) {
      alert('Somente administrador pode excluir movimentações.');
      return;
    }
    const ids = Array.from(document.querySelectorAll('.movement-select-checkbox:checked')).map(cb => cb.value);
    if (!ids.length) {
      alert('Selecione pelo menos uma movimentação para excluir.');
      return;
    }
    const motivo = prompt(`Confirma excluir ${ids.length} movimentação(ões)? Informe o motivo da exclusão:`);
    if (motivo === null) return;
    try {
      await this.fetchFromApi('/api/equipamentos/movimentacoes/delete', {
        method: 'POST',
        body: JSON.stringify({ ids, motivo_exclusao: motivo || 'Sem motivo informado' })
      });
      this.showToast('Movimentação(ões) excluída(s) e registradas no histórico de exclusões.');
      await this.loadMovements();
    } catch (err) {
      alert('Erro ao excluir movimentações: ' + err.message);
    }
  },


  /**
   * Open historical timeline/dossier for specific equipment patrimonio
   */
  async openPatrimonioTimeline(patrimonio) {
    if (!patrimonio) return;
    try {
      const res = await this.fetchFromApi(`/api/equipamentos/patrimonio/${patrimonio}`);
      if (!res.exists) {
        alert(`Patrimônio "${patrimonio}" não possui histórico cadastrado.`);
        return;
      }

      document.getElementById('timeline-patrimonio-id').textContent = res.patrimonio;
      document.getElementById('timeline-eq-modelo').textContent = res.modelo || 'Não especificado';
      document.getElementById('timeline-eq-voltagem').textContent = res.voltagem || '110';
      
      const statusBadge = document.getElementById('timeline-eq-status');
      statusBadge.textContent = res.status || 'Pendente';
      statusBadge.className = 'badge-status';
      if (res.status === 'Instalado') statusBadge.classList.add('badge-success');
      else if (res.status === 'Recolhido') statusBadge.classList.add('badge-danger');
      else statusBadge.classList.add('badge-warning');

      document.getElementById('timeline-eq-empresa').textContent = res.empresa || '-';
      document.getElementById('timeline-eq-cliente-atual').textContent = res.cliente_atual_nome || 'Sem cliente associado (Em Base)';
      document.getElementById('timeline-eq-cidade').textContent = res.cliente_atual_cidade || '-';

      const flowContainer = document.getElementById('timeline-flow-container');
      flowContainer.innerHTML = '';
      
      flowContainer.innerHTML = `<div style="position: absolute; left: 7px; top: 5px; bottom: 5px; width: 2px; background-color: var(--border-color);"></div>`;

      const hist = res.historico || [];
      if (hist.length === 0) {
        flowContainer.innerHTML += `<span style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; padding-left: 10px;">Sem movimentações registradas para este patrimônio.</span>`;
      } else {
        hist.forEach(mov => {
          const itemDate = new Date(mov.created_at).toLocaleString('pt-BR');
          let opColor = 'var(--primary-color)';
          if (mov.tipo_solicitacao === 'Adição') opColor = 'var(--success)';
          if (mov.tipo_solicitacao === 'Recolha') opColor = 'var(--danger)';
          if (mov.tipo_solicitacao === 'Troca') opColor = 'var(--warning)';
          
          const timelineItem = document.createElement('div');
          timelineItem.style.position = 'relative';
          timelineItem.style.paddingLeft = '20px';
          timelineItem.style.marginBottom = '10px';
          
          timelineItem.innerHTML = `
            <div style="position: absolute; left: -20px; top: 4px; width: 14px; height: 14px; border-radius: 50%; background-color: ${opColor}; border: 3px solid var(--bg-card);"></div>
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong style="text-transform: uppercase; font-size:0.75rem; color: ${opColor};">${mov.tipo_solicitacao}</strong>
                <span style="font-size:0.7rem; color: var(--text-muted);">${itemDate}</span>
              </div>
              <div style="font-size:0.8rem;">
                <strong>Cliente:</strong> ${mov.cliente_nome} (${mov.cliente_cidade})<br>
                <strong>Vendedor Responsável:</strong> ${mov.vendedor_solicitante}<br>
                ${mov.detalhe_troca_adicao ? `<strong>Detalhes:</strong> ${mov.detalhe_troca_adicao}<br>` : ''}
                ${mov.motivo_recolhimento ? `<strong>Motivo:</strong> ${mov.motivo_recolhimento}<br>` : ''}
                ${mov.observacao ? `<strong>Obs:</strong> ${mov.observacao}` : ''}
              </div>
            </div>
          `;
          flowContainer.appendChild(timelineItem);
        });
      }

      document.getElementById('modal-patrimonio-historico').style.display = 'flex';
      
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar linha do tempo: ' + err.message);
    }
  },

  /**
   * Export movement list to Excel (CSV)
   */
  async exportMovementsExcel() {
    try {
      const filters = {
        empresa: document.getElementById('rep-mov-empresa').value,
        cidade: document.getElementById('rep-mov-cidade').value.trim(),
        vendedor: document.getElementById('rep-mov-vendedor').value.trim(),
        patrimonio: document.getElementById('rep-mov-patrimonio').value.trim(),
        tipo_solicitacao: document.getElementById('rep-mov-tipo').value,
        status: document.getElementById('rep-mov-status').value,
        data_inicio: document.getElementById('rep-mov-data-inicio').value,
        data_fim: document.getElementById('rep-mov-data-fim').value
      };

      Object.keys(filters).forEach(key => {
        const val = String(filters[key] || '').trim();
        if (!val || ['todos', 'todas', 'all', 'null', 'undefined'].includes(val.toLowerCase())) {
          delete filters[key];
        }
      });

      const query = '?' + new URLSearchParams(filters).toString();
      const list = await this.fetchFromApi(`/api/equipamentos/movimentacoes${query}`);

      if (list.length === 0) {
        alert('Nenhum dado encontrado para exportar.');
        return;
      }

      const headers = [
        'ID', 'Data', 'Tipo de Solicitação', 'Empresa', 'Código do Cliente', 
        'Nome Fantasia', 'Cidade', 'Endereço', 'Solicitante', 'Patrimônio Antigo', 
        'Modelo Antigo', 'Voltagem Antiga', 'Patrimônio Novo', 'Modelo Novo', 
        'Voltagem Nova', 'Quantidade', 'Detalhe Troca/Adição', 'Motivo Recolha', 
        'Observação', 'Status'
      ];

      const csvRows = [headers.join(';')];

      list.forEach(m => {
        const row = [
          m.id,
          m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR') : '',
          m.tipo_solicitacao || '',
          m.empresa || '',
          m.cliente_codigo || '',
          `"${(m.cliente_nome || '').replace(/"/g, '""')}"`,
          `"${(m.cliente_cidade || '').replace(/"/g, '""')}"`,
          `"${(m.cliente_endereco || '').replace(/"/g, '""')}"`,
          `"${(m.vendedor_solicitante || '').replace(/"/g, '""')}"`,
          m.patrimonio || '',
          `"${(m.modelo || '').replace(/"/g, '""')}"`,
          m.voltagem || '',
          m.patrimonio_novo || '',
          `"${(m.modelo_novo || '').replace(/"/g, '""')}"`,
          m.voltagem_nova || '',
          m.quantidade || 1,
          `"${(m.detalhe_troca_adicao || '').replace(/"/g, '""')}"`,
          `"${(m.motivo_recolhimento || '').replace(/"/g, '""')}"`,
          `"${(m.observacao || '').replace(/"/g, '""')}"`,
          m.status || ''
        ];
        csvRows.push(row.join(';'));
      });

      const csvContent = '\uFEFF' + csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `relatorio-movimentacao-${new Date().toISOString().slice(0,10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.showToast('Planilha Excel (CSV) exportada com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao exportar Excel: ' + err.message);
    }
  },

  /**
   * Export movement list to PDF print preview
   */
  async exportMovementsPdf() {
    try {
      const filters = {
        empresa: document.getElementById('rep-mov-empresa').value,
        cidade: document.getElementById('rep-mov-cidade').value.trim(),
        vendedor: document.getElementById('rep-mov-vendedor').value.trim(),
        patrimonio: document.getElementById('rep-mov-patrimonio').value.trim(),
        tipo_solicitacao: document.getElementById('rep-mov-tipo').value,
        status: document.getElementById('rep-mov-status').value,
        data_inicio: document.getElementById('rep-mov-data-inicio').value,
        data_fim: document.getElementById('rep-mov-data-fim').value
      };

      Object.keys(filters).forEach(key => {
        const val = String(filters[key] || '').trim();
        if (!val || ['todos', 'todas', 'all', 'null', 'undefined'].includes(val.toLowerCase())) {
          delete filters[key];
        }
      });

      const query = '?' + new URLSearchParams(filters).toString();
      const list = await this.fetchFromApi(`/api/equipamentos/movimentacoes${query}`);
      
      window.CurrentFilteredMovements = list;
      this.generatePdf('movements');
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF: ' + err.message);
    }
  },

  /**
   * Load email configuration from API
   */
  async loadConfigEmails() {
    try {
      const data = await this.fetchFromApi('/api/equipamentos/config/emails');
      const input = document.getElementById('config-emails-input');
      if (input && data && data.emails) {
        input.value = data.emails;
      }
    } catch (err) {
      console.error(err);
    }
  },

  /**
   * Preview a selected photo in full-screen modal
   */

  generateClientPdfFromCurrent() {
    const client = this.currentClientFicha;
    if (!client) { alert('Abra uma ficha antes de gerar o PDF.'); return; }
    const esc = (v) => String(v ?? '-').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
    const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
    const addPhoto = (url, label) => {
      const finalUrl = (window.TempPhotosCache && window.TempPhotosCache[url]) || url;
      if (!finalUrl) return `<div class="photo"><b>${esc(label)}</b><div class="empty">Imagem não enviada</div></div>`;
      return `<div class="photo"><b>${esc(label)}</b><img src="${esc(finalUrl)}"></div>`;
    };
    const html = `<!doctype html><html><head><title>Ficha Comercial ${esc(client.id)}</title><style>
      body{font-family:Arial,sans-serif;background:#fff;color:#111;margin:24px;font-size:12px} h1{color:#2563eb;font-size:20px;margin:0 0 8px} h3{color:#2563eb;font-size:14px;border-bottom:1px solid #bbb;padding-bottom:5px}.header{display:flex;justify-content:space-between;border:1px solid #bbb;border-radius:8px;padding:10px;margin-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{border:1px solid #bbb;border-radius:8px;padding:10px;margin-bottom:12px} p{margin:5px 0}.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.photo{border:1px solid #bbb;border-radius:8px;padding:8px;text-align:center;break-inside:avoid}.photo img{max-width:100%;height:120px;object-fit:cover}.empty{height:80px;display:flex;align-items:center;justify-content:center;color:#777;border:1px dashed #bbb;margin-top:8px}.footer{margin-top:18px;font-size:10px;color:#555;border-top:1px solid #bbb;padding-top:8px}@media print{button{display:none}.grid{grid-template-columns:1fr 1fr}}
    </style></head><body><h1>Ficha Comercial Completa do Cliente</h1><div class="header"><div><b>ID:</b> ${esc(client.id)}</div><div><b>Status:</b> ${esc(client.status)}</div></div>
    <div class="grid"><div class="box"><h3>1. Identificação Comercial</h3><p><b>Nome Fantasia:</b> ${esc(client.name)}</p><p><b>Razão Social:</b> ${esc(client.companyName)}</p><p><b>CNPJ:</b> ${esc(client.cnpj)}</p><p><b>Inscrição Estadual:</b> ${esc(client.ie)}</p><p><b>Categoria:</b> ${esc(client.category)}</p><p><b>Telefone:</b> ${esc(client.phone)}</p><p><b>E-mail:</b> ${esc(client.email)}</p><p><b>Vendedor:</b> ${esc(UI.getUserName(client.userId))}</p><p><b>Unidade:</b> ${esc(UI.getUnitName(client.unitId))}</p><p><b>Score:</b> ${esc(client.score)} ${esc(client.classification)}</p></div>
    <div class="box"><h3>2. Logística e Localização</h3><p><b>Cidade:</b> ${esc(client.city)}</p><p><b>Endereço:</b> ${esc(client.addressFull || [client.street, client.number, client.neighborhood].filter(Boolean).join(', '))}</p><p><b>Pavimentação:</b> ${esc(client.pavementType)}</p><p><b>Horário:</b> ${esc(client.deliverySchedule)}</p><p><b>Primeiro Pedido:</b> ${esc(client.firstOrderPayment)}</p><p><b>Forma de Recompra:</b> ${esc(client.repurchasePayment)}</p></div>
    <div class="box"><h3>3. Mapeamento de Mercado</h3><p><b>Amaretto Próximo:</b> ${esc(client.nearbyAmaretto)}</p><p><b>Concorrência Próxima:</b> ${esc(client.nearbyCompetitor)}</p><p><b>Já trabalha com sorvetes:</b> ${esc(client.iceCreamExperience)}</p><p><b>Trabalhará com ambas as marcas:</b> ${esc(client.dualBrandPreference)}</p></div>
    <div class="box"><h3>4. Equipamentos & Financeiro</h3><p><b>Qtd Equipamentos:</b> ${esc(client.equipmentQty)}</p><p><b>Equipamento Solicitado:</b> ${esc(client.requestedEqType)}</p><p><b>Padrão que pode enviar:</b> ${esc(client.sendableEqType)}</p><p><b>Valor 1ª Compra:</b> ${money(client.firstOrderValue)}</p><p><b>Média Prevista:</b> ${money(client.predictedAverage)}</p><p><b>Bonificação:</b> ${esc(client.hasBonus)} ${client.bonusValue ? '('+money(client.bonusValue)+')' : ''}</p></div></div>
    <div class="box"><h3>5. Análise do Vendedor</h3><p>${esc(client.sellerAnalysis)}</p></div><div class="box"><h3>6. Fotos do Cadastro</h3><div class="photos">${addPhoto(client.photoFachada,'Fachada')}${addPhoto(client.photoInterna01,'Interna 01')}${addPhoto(client.photoInterna02,'Interna 02')}${addPhoto(client.photoInterna03,'Interna 03')}${addPhoto(client.photoRua01,'Externa Rua 01')}${addPhoto(client.photoRua02,'Externa Rua 02')}${addPhoto(client.photoCnpj,'Foto CNPJ')}</div></div><div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')} por ${(Store.getLoggedUser()||{}).name || '-'} - Controle de Campo</div><script>setTimeout(()=>window.print(),500)<\/script></body></html>`;
    this.showPdfPreviewModal(html, `Ficha Comercial ${esc(client.id)}`);
  },

  showPdfPreviewModal(html, title = 'Visualização do PDF') {
    let modal = document.getElementById('modal-pdf-preview-corrigido');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-pdf-preview-corrigido';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:99999;display:none;align-items:center;justify-content:center;padding:12px;';
      modal.innerHTML = `
        <div style="background:#fff;color:#111;width:min(1100px,100%);height:min(92vh,900px);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,.35);">
          <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #ddd;">
            <strong id="pdf-preview-title">Visualização do PDF</strong>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
              <button type="button" id="pdf-preview-print" class="btn btn-primary">Imprimir</button>
              <button type="button" id="pdf-preview-download" class="btn btn-secondary">Baixar HTML</button>
              <button type="button" id="pdf-preview-close" class="btn btn-danger">Fechar</button>
            </div>
          </div>
          <iframe id="pdf-preview-frame" title="Visualização do PDF" style="border:0;width:100%;height:100%;background:#fff;"></iframe>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('#pdf-preview-close').addEventListener('click', () => { modal.style.display = 'none'; });
      modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.style.display = 'none'; });
    }
    const cleanHtml = String(html || '').replace(/<script>[\s\S]*?window\.print\([\s\S]*?<\/script>/gi, '');
    modal.querySelector('#pdf-preview-title').textContent = title;
    const frame = modal.querySelector('#pdf-preview-frame');
    frame.srcdoc = cleanHtml;
    modal.style.display = 'flex';
    modal.querySelector('#pdf-preview-print').onclick = () => {
      if (frame.contentWindow) { frame.contentWindow.focus(); frame.contentWindow.print(); }
    };
    modal.querySelector('#pdf-preview-download').onclick = () => {
      const blob = new Blob([cleanHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${String(title || 'ficha').replace(/[^a-z0-9_-]+/gi, '-')}.html`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  },

  async deleteClient(clientId, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    const loggedUser = Store.getLoggedUser && Store.getLoggedUser();
    const isAdmin = loggedUser && (loggedUser.profile === 'Administrador' || (loggedUser.permissions || []).includes('Administrador') || (loggedUser.permissions || []).includes('Admin'));
    if (!isAdmin) { alert('Somente Administrador pode apagar cadastro definitivamente.'); return; }
    if (!confirm('Tem certeza que deseja apagar definitivamente este cadastro? Esta ação não poderá ser desfeita.')) return;
    try {
      const current = Store.getClients ? Store.getClients() : [];
      const removed = current.find(c => String(c.id) === String(clientId));
      const next = current.filter(c => String(c.id) !== String(clientId));
      if (next.length === current.length) { alert('Cadastro não encontrado.'); return; }
      Store.saveClients(next);
      if (Store.saveToBackend) Store.saveToBackend('clients', next);
      try {
        await this.fetchFromApi(`/api/store/${encodeURIComponent('clients')}`, { method: 'POST', body: JSON.stringify({ data: next, hardDeleteId: clientId }) });
      } catch (e) {
        console.warn('Exclusão já foi aplicada localmente; sincronização direta falhou:', e.message || e);
      }
      if (Store.syncAllFromBackend) await Store.syncAllFromBackend({ forceRemote: true });
      this.currentClientFicha = null;
      const fichaModal = document.getElementById('modal-client-ficha');
      if (fichaModal) fichaModal.style.display = 'none';
      UI.renderClients(Store.getClients());
      UI.renderApprovals(Store.getClients());
      UI.renderDashboard();
      this.showToast('Cadastro apagado definitivamente do banco/listas.');
    } catch (err) {
      console.error(err);
      alert('Erro ao apagar cadastro: ' + (err.message || err));
    }
  },

  showImagePreview(url) {
    const modal = document.getElementById('modal-image-preview');
    const img = document.getElementById('modal-preview-img');
    if (modal && img) {
      img.src = url;
      modal.style.display = 'flex';
    }
  },

  /**
   * Recarrega do backend os dados/permissões do usuário logado.
   * Usado quando o administrador altera perfil/status em outra aba.
   */
  async refreshLoggedUserFromApi() {
    const current = Store.getLoggedUser();
    if (!current || !current.id) return null;
    try {
      const fresh = await this.fetchFromApi('/api/me');
      if (fresh && fresh.id) {
        Store.setLoggedUser(fresh);
        UI.applyPermissions();
        if (typeof UI.populateUnitDropdowns === 'function') UI.populateUnitDropdowns();
        const allowed = Store.getUserAllowedRoutes(fresh);
        if (!allowed.includes(window.location.hash)) window.location.hash = '#dashboard';
        return fresh;
      }
    } catch (err) {
      console.warn('Não foi possível atualizar usuário logado:', err);
      if (String(err.message || '').includes('inativo') || String(err.message || '').includes('excluído')) {
        this.forceLogout('Seu acesso foi desativado por um administrador. Entre em contato com o responsável pelo sistema.');
      }
    }
    return null;
  },

  async validateSessionStatus() {
    if (!this.isLoggedIn) return;
    const current = Store.getLoggedUser();
    const token = Store.getToken();
    if (!current || !current.id || !token) {
      this.forceLogout();
      return;
    }
    try {
      const fresh = await this.fetchFromApi('/api/me');
      if (!fresh || !fresh.id) {
        this.forceLogout();
        return;
      }
      Store.setLoggedUser(fresh, token);
      if (fresh.status === 'INATIVO') {
        this.forceLogout('Seu acesso foi desativado por um administrador. Entre em contato com o responsável pelo sistema.');
      }
    } catch (err) {
      console.warn('Erro ao validar sessão:', err);
      // Qualquer falha de validação da sessão deve derrubar o usuário.
      // Não pode manter painel aberto com token inválido/ausente/expirado.
      this.forceLogout();
    }
  },

  forceLogout(message) {
    Store.clearLoggedUser();
    this.isLoggedIn = false;
    window.location.hash = '#login';
    if (message) {
      alert(message);
    }
  },

  /**
   * Helper to display a top toast alert message
   */
  showToast(message) {
    const toast = document.getElementById('save-toast');
    if (toast) {
      toast.textContent = message;
      toast.style.display = 'block';
      setTimeout(() => {
        toast.style.display = 'none';
      }, 3000);
    } else {
      alert(message);
    }
  }
};

window.App = App;


// Detalhe rápido de chamado para mobile/lista em cards
App.showTicketDetails = function(id) {
  const tickets = (Store.getTickets && Store.getTickets()) || [];
  const ticket = tickets.find(t => String(t.id) === String(id));
  if (!ticket) return alert('Chamado não encontrado.');

  let modal = document.getElementById('modal-ticket-details-mobile');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-ticket-details-mobile';
    modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:3000; background:rgba(0,0,0,.72); align-items:center; justify-content:center; padding:14px;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="login-card" style="max-width:640px; width:100%; max-height:90vh; overflow:auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px;">
        <h3 style="margin:0; color:var(--primary-color);">Detalhes do Chamado</h3>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" onclick="App.generateTicketPdf('${String(ticket.id).replace(/'/g, "\\'")}')" style="width:auto; font-size:0.85rem; padding:6px 12px;">Gerar PDF</button>
          <button class="btn btn-secondary" onclick="document.getElementById('modal-ticket-details-mobile').style.display='none'" style="width:auto; font-size:0.85rem; padding:6px 12px;">Fechar</button>
        </div>
      </div>
      <div id="modal-ticket-details-mobile-content"></div>
    </div>`;

  const content = document.getElementById('modal-ticket-details-mobile-content');
  const row = (label, value) => `<div style="display:flex; justify-content:space-between; gap:14px; border-bottom:1px solid var(--border-color); padding:9px 0;"><strong style="color:var(--text-muted);">${label}</strong><span style="text-align:right;">${value || '—'}</span></div>`;
  
  const isValidPhoto = (url) => url && url !== 'null' && url !== 'undefined' && url !== '/uploads/null' && url !== '/uploads/undefined' && url !== '/uploads/';

  const mediaList = [];
  if (isValidPhoto(ticket.defectPhoto)) mediaList.push({ url: ticket.defectPhoto, label: 'Foto Defeito' });
  if (isValidPhoto(ticket.fotoAntes)) mediaList.push({ url: ticket.fotoAntes, label: 'Foto Antes' });
  if (isValidPhoto(ticket.fotoDepois)) mediaList.push({ url: ticket.fotoDepois, label: 'Foto Depois' });
  if (isValidPhoto(ticket.fotoPlaqueta)) mediaList.push({ url: ticket.fotoPlaqueta, label: 'Foto Plaqueta' });

  let photosHtml = '';
  if (mediaList.length > 0) {
    photosHtml = `
      <div style="margin-top:14px;">
        <strong style="color:var(--text-muted); display:block; margin-bottom:8px;">Fotos Anexadas:</strong>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:10px;">
          ${mediaList.map(item => {
            const finalUrl = window.TempPhotosCache?.[item.url] || item.url;
            return `
              <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; text-align: center;">
                <span style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 6px;">${item.label}</span>
                <img src="${finalUrl}" style="max-width: 100%; max-height: 80px; border-radius: 4px; cursor: pointer;" onclick="App.showFacadeImage('${finalUrl.replace(/'/g, "\\'")}')" onerror="this.parentElement.style.display='none'">
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  let techDetailsHtml = '';
  if (ticket.status === 'Resolvido') {
    const partsStr = Array.isArray(ticket.parts) ? ticket.parts.join(', ') : (ticket.parts || '—');
    const servicesStr = Array.isArray(ticket.services) ? ticket.services.join(', ') : (ticket.services || '—');
    techDetailsHtml = `
      <div style="margin-top:16px; border-top:2px solid var(--primary-color); padding-top:14px;">
        <h4 style="margin:0 0 10px 0; color:var(--primary-color); font-size:0.95rem;">Laudo Técnico de Manutenção</h4>
        ${row('Início do Atendimento', (ticket.date || '') + ' ' + (ticket.startTime || ''))}
        ${row('Hora de Conclusão', ticket.endTime || '—')}
        ${row('Peças Utilizadas', partsStr)}
        ${row('Serviços Executados', servicesStr)}
        ${row('Problema Encontrado', ticket.faultDescription)}
        ${row('Solução Aplicada', ticket.solutionDescription)}
        ${row('Carga de Gás (g)', ticket.gasCharge ? (ticket.gasCharge + 'g') : '—')}
        ${row('Observações Adicionais', ticket.additionalNotes)}
      </div>
    `;
  }

  content.innerHTML = `
    ${row('OS', ticket.id)}
    ${row('Data', ticket.date)}
    ${row('Cliente', ticket.client)}
    ${row('Equipamento', ticket.equipmentSerial)}
    ${row('Chamado', ticket.title)}
    ${row('Prioridade', ticket.priority)}
    ${row('Status', ticket.status)}
    ${row('Mecânico', ticket.mechanic || (UI.getUserName ? UI.getUserName(ticket.userId) : ''))}
    ${row('Situação após atendimento', ticket.eqStatusAfter)}
    ${photosHtml}
    ${techDetailsHtml}
    <div style="padding-top:12px; color:var(--text-muted); font-size:.9rem;">Clique fora ou em Fechar para voltar à lista.</div>
  `;
  modal.style.display = 'flex';
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
};

App.generateTicketPdf = function(id) {
  const tickets = (Store.getTickets && Store.getTickets()) || [];
  const ticket = tickets.find(t => String(t.id) === String(id));
  if (!ticket) return alert('Chamado não encontrado.');

  App.printTicketData({
    id: ticket.id,
    date: ticket.date,
    status: ticket.status,
    mechanic: ticket.mechanic || (UI.getUserName ? UI.getUserName(ticket.userId) : ''),
    startTime: ticket.startTime,
    endTime: ticket.endTime,
    equipmentType: ticket.equipmentType,
    equipmentSerial: ticket.equipmentSerial,
    client: ticket.client,
    seller: UI.getUserName ? UI.getUserName(ticket.userId) : ticket.userId,
    unit: UI.getUnitName ? UI.getUnitName(ticket.unitId) : ticket.unitId,
    title: ticket.title,
    priority: ticket.priority,
    faultDescription: ticket.faultDescription,
    solutionDescription: ticket.solutionDescription,
    eqStatusAfter: ticket.eqStatusAfter,
    gasCharge: ticket.gasCharge,
    additionalNotes: ticket.additionalNotes,
    parts: ticket.parts,
    services: ticket.services,
    fotoAntes: ticket.fotoAntes,
    fotoDepois: ticket.fotoDepois,
    fotoPlaqueta: ticket.fotoPlaqueta,
    defectPhoto: ticket.defectPhoto
  });
};

App.generateTicketPdfFromForm = function() {
  const form = document.getElementById('ticket-form');
  if (!form) return;
  const id = form.dataset.ticketId;
  if (!id) return alert('Nenhuma Ordem de Serviço carregada no formulário.');

  const tickets = (Store.getTickets && Store.getTickets()) || [];
  const ticket = tickets.find(t => String(t.id) === String(id)) || {};

  // Gather current values from form
  const mechanic = document.getElementById('ticket-mechanic')?.value || '';
  const startDateVal = document.getElementById('ticket-start-date')?.value || '';
  const dateFormatted = startDateVal ? startDateVal.split('-').reverse().join('/') : '';
  const startTime = document.getElementById('ticket-start-time')?.value || '';
  const endTime = document.getElementById('ticket-end-time')?.value || '';
  
  const equipmentType = document.getElementById('ticket-eq-type-text')?.value || '';
  const equipmentSerial = document.getElementById('ticket-eq-serial')?.value || '';
  const client = document.getElementById('ticket-client-name')?.value || '';
  const seller = document.getElementById('ticket-seller-text')?.value || '';
  const unit = document.getElementById('ticket-unit-text')?.value || '';
  const title = document.getElementById('ticket-title')?.value || '';
  const priority = document.getElementById('ticket-priority-text')?.value || '';

  const faultDescription = document.getElementById('ticket-fault-description')?.value || '';
  const solutionDescription = document.getElementById('ticket-solution-description')?.value || '';
  const eqStatusAfter = document.getElementById('ticket-eq-status-after')?.value || '';
  const gasCharge = document.getElementById('ticket-gas-charge')?.value || '';
  const additionalNotes = document.getElementById('ticket-additional-notes')?.value || '';

  // Parts
  const parts = [];
  document.querySelectorAll('#modal-ficha-tecnica .btn-part-toggle[data-part].active').forEach(btn => {
    parts.push(btn.getAttribute('data-part'));
  });
  const outraPecaInput = document.getElementById('ticket-outra-peca');
  if (outraPecaInput && outraPecaInput.value.trim() && document.querySelector('#modal-ficha-tecnica .btn-part-toggle[data-part="Outra Peça"].active')) {
    parts.push('Outra: ' + outraPecaInput.value.trim());
  }

  // Services
  const services = [];
  document.querySelectorAll('#modal-ficha-tecnica .btn-part-toggle[data-service].active').forEach(btn => {
    services.push(btn.getAttribute('data-service'));
  });
  const outroServicoInput = document.getElementById('ticket-outro-servico');
  if (outroServicoInput && outroServicoInput.value.trim() && document.querySelector('#modal-ficha-tecnica .btn-part-toggle[data-service="Outro Serviço"].active')) {
    services.push('Outro: ' + outroServicoInput.value.trim());
  }

  // Photos
  const getPhotoUrl = (imgId, defaultUrl) => {
    const img = document.getElementById(imgId);
    if (img && img.parentElement && img.parentElement.style.display !== 'none' && img.src) {
      return img.src;
    }
    return defaultUrl || '';
  };
  
  const fotoAntes = getPhotoUrl('preview-img-ticket-foto-antes', ticket.fotoAntes);
  const fotoDepois = getPhotoUrl('preview-img-ticket-foto-depois', ticket.fotoDepois);
  const fotoPlaqueta = getPhotoUrl('preview-img-ticket-foto-plaqueta', ticket.fotoPlaqueta);
  const defectPhoto = ticket.defectPhoto || '';

  App.printTicketData({
    id,
    date: dateFormatted,
    status: ticket.status || 'Em Atendimento',
    mechanic,
    startTime,
    endTime,
    equipmentType,
    equipmentSerial,
    client,
    seller,
    unit,
    title,
    priority,
    faultDescription,
    solutionDescription,
    eqStatusAfter,
    gasCharge,
    additionalNotes,
    parts,
    services,
    fotoAntes,
    fotoDepois,
    fotoPlaqueta,
    defectPhoto
  });
};

App.printTicketData = function(ticket) {
  const esc = (v) => String(v ?? '—').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  
  const partsArray = Array.isArray(ticket.parts) ? ticket.parts : (ticket.parts ? String(ticket.parts).split(',').map(x => x.trim()) : []);
  const servicesArray = Array.isArray(ticket.services) ? ticket.services : (ticket.services ? String(ticket.services).split(',').map(x => x.trim()) : []);
  
  const partsHtml = partsArray.map(p => `<span class="badge-item">${esc(p)}</span>`).join(' ') || '—';
  const servicesHtml = servicesArray.map(s => `<span class="badge-item">${esc(s)}</span>`).join(' ') || '—';

  const addPhoto = (url, label) => {
    const finalUrl = (window.TempPhotosCache && window.TempPhotosCache[url]) || url;
    const isValid = finalUrl && finalUrl !== 'null' && finalUrl !== 'undefined' && finalUrl !== '/uploads/null' && finalUrl !== '/uploads/undefined' && finalUrl !== '/uploads/';
    if (!isValid) return `<div class="photo"><b>${esc(label)}</b><div class="empty">Imagem não enviada</div></div>`;
    return `<div class="photo"><b>${esc(label)}</b><img src="${esc(finalUrl)}"></div>`;
  };

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ficha Técnica de Manutenção - OS #${esc(ticket.id)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #fff;
      color: #000;
      margin: 20px;
      font-size: 11px;
      line-height: 1.4;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    .header-table td {
      border: 1px solid #000;
      padding: 10px;
    }
    .title-cell {
      text-align: center;
      font-weight: bold;
      font-size: 14px;
      text-transform: uppercase;
    }
    h3 {
      font-size: 11px;
      border-bottom: 1.5px solid #000;
      padding-bottom: 3px;
      margin-top: 15px;
      margin-bottom: 8px;
      text-transform: uppercase;
      font-weight: bold;
    }
    .section-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    .section-table td {
      border: 1px solid #000;
      padding: 8px;
      vertical-align: top;
    }
    .label {
      font-weight: bold;
      text-transform: uppercase;
      font-size: 9px;
      color: #333;
      display: block;
      margin-bottom: 3px;
    }
    .val {
      font-size: 11px;
      font-family: monospace;
    }
    .badge-item {
      display: inline-block;
      border: 1px solid #000;
      border-radius: 3px;
      padding: 3px 6px;
      font-size: 10px;
      margin: 2px;
      background: #fff;
      text-transform: uppercase;
      font-weight: bold;
    }
    .photos {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 5px;
    }
    .photo {
      border: 1px solid #000;
      padding: 6px;
      text-align: center;
      break-inside: avoid;
    }
    .photo img {
      max-width: 100%;
      height: 120px;
      object-fit: contain;
      margin-top: 4px;
      filter: grayscale(100%);
      -webkit-filter: grayscale(100%);
    }
    .empty {
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #555;
      border: 1px dashed #000;
      margin-top: 4px;
      font-size: 11px;
    }
    .signature {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      break-inside: avoid;
    }
    .sig-box {
      width: 45%;
      border-top: 1.5px solid #000;
      text-align: center;
      margin-top: 40px;
      padding-top: 5px;
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .footer {
      margin-top: 25px;
      font-size: 9px;
      color: #555;
      border-top: 1px solid #000;
      padding-top: 6px;
      text-align: center;
    }
    @media print {
      button { display: none; }
      body { margin: 10px; }
    }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td class="title-cell" colspan="2">Ficha Técnica de Manutenção - Ordem de Serviço</td>
    </tr>
    <tr>
      <td style="width: 50%;"><b>OS:</b> #${esc(ticket.id)}</td>
      <td style="width: 50%;"><b>Status:</b> ${esc(ticket.status)}</td>
    </tr>
  </table>

  <h3>1. Identificação do Atendimento</h3>
  <table class="section-table">
    <tr>
      <td style="width: 50%;">
        <span class="label">Mecânico Responsável</span>
        <span class="val">${esc(ticket.mechanic)}</span>
      </td>
      <td style="width: 50%;">
        <span class="label">Data de Realização</span>
        <span class="val">${esc(ticket.date)}</span>
      </td>
    </tr>
    <tr>
      <td style="width: 50%;">
        <span class="label">Hora de Início / Conclusão</span>
        <span class="val">${esc(ticket.startTime || '—')} / ${esc(ticket.endTime || '—')}</span>
      </td>
      <td style="width: 50%;">
        <span class="label">Unidade Vinculada</span>
        <span class="val">${esc(ticket.unit)}</span>
      </td>
    </tr>
  </table>

  <h3>2. Identificação do Equipamento</h3>
  <table class="section-table">
    <tr>
      <td style="width: 33%;">
        <span class="label">Tipo de Equipamento</span>
        <span class="val">${esc(ticket.equipmentType)}</span>
      </td>
      <td style="width: 33%;">
        <span class="label">Nº Patrimônio / Serial</span>
        <span class="val">${esc(ticket.equipmentSerial)}</span>
      </td>
      <td style="width: 34%;">
        <span class="label">Cliente Vinculado</span>
        <span class="val">${esc(ticket.client)}</span>
      </td>
    </tr>
    <tr>
      <td style="width: 33%;">
        <span class="label">Vendedor Responsável</span>
        <span class="val">${esc(ticket.seller)}</span>
      </td>
      <td style="width: 33%;">
        <span class="label">Prioridade da OS</span>
        <span class="val">${esc(ticket.priority)}</span>
      </td>
      <td style="width: 34%;">
        <span class="label">Situação após Atendimento</span>
        <span class="val">${esc(ticket.eqStatusAfter)}</span>
      </td>
    </tr>
    <tr>
      <td colspan="3">
        <span class="label">Descrição Simplificada da Falha</span>
        <span class="val">${esc(ticket.title)}</span>
      </td>
    </tr>
  </table>

  <h3>3. Peças Utilizadas</h3>
  <div style="border: 1px solid #000; padding: 10px; margin-bottom: 12px;">
    ${partsHtml}
  </div>

  <h3>4. Serviços Executados</h3>
  <div style="border: 1px solid #000; padding: 10px; margin-bottom: 12px;">
    ${servicesHtml}
  </div>

  <h3>5. Laudo e Diagnóstico Técnico</h3>
  <table class="section-table">
    <tr>
      <td colspan="2">
        <span class="label">Descrição Detalhada do Problema Encontrado</span>
        <span class="val" style="white-space: pre-wrap;">${esc(ticket.faultDescription)}</span>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <span class="label">Solução Aplicada / Laudo Técnico</span>
        <span class="val" style="white-space: pre-wrap;">${esc(ticket.solutionDescription)}</span>
      </td>
    </tr>
    <tr>
      <td style="width: 50%;">
        <span class="label">Carga de Gás (gramas)</span>
        <span class="val">${ticket.gasCharge ? (esc(ticket.gasCharge) + 'g') : '—'}</span>
      </td>
      <td style="width: 50%;">
        <span class="label">Observações Adicionais</span>
        <span class="val">${esc(ticket.additionalNotes)}</span>
      </td>
    </tr>
  </table>

  <h3>6. Fotos da Visita</h3>
  <div class="photos">
    ${addPhoto(ticket.defectPhoto, 'Foto Defeito')}
    ${addPhoto(ticket.fotoAntes, 'Foto Antes')}
    ${addPhoto(ticket.fotoDepois, 'Foto Depois')}
    ${addPhoto(ticket.fotoPlaqueta, 'Foto Plaqueta')}
  </div>

  <div class="signature">
    <div class="sig-box">Assinatura do Técnico</div>
    <div class="sig-box">Assinatura do Cliente / Responsável</div>
  </div>

  <div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')} - Controle de Campo</div>
  <script>setTimeout(() => window.print(), 500);<\/script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    alert('Por favor, permita popups para gerar o PDF.');
  }
};

// -------------------------------------------------------------
// SIMULADOR DE TROCA DE MERCADORIA METHODS
// -------------------------------------------------------------

/**
 * Initializes the Exchange Simulator view and sets up event listeners
 */
App.initSimuladorTroca = async function() {
  window.CurrentExchange = window.CurrentExchange || { clientCode: '', clientName: '', items: [] };
  window.ExchangeCategories = window.ExchangeCategories || ['Açaí', 'Picolés', 'Copo', 'Linha especial', 'Outros'];
  
  // Switch to Nova Troca tab by default on load
  App.switchExchangeTab('nova');
  App.renderCurrentExchangeState();
  
  // Fetch products from backend
  await App.fetchExchangeProducts();
  
  // If listeners are already bound, we're done
  if (App.exchangeListenersBound) return;
  App.exchangeListenersBound = true;
  
  // Bind Tab Click Buttons
  document.getElementById('tab-exchange-nova-btn')?.addEventListener('click', () => App.switchExchangeTab('nova'));
  document.getElementById('tab-exchange-historico-btn')?.addEventListener('click', () => {
    App.switchExchangeTab('historico');
    App.loadExchangeHistory();
  });
  document.getElementById('tab-exchange-importar-btn')?.addEventListener('click', () => {
    App.switchExchangeTab('importar');
    App.loadExchangeAdminProducts();
  });
  
  // Step 1 Form: Client Info
  document.getElementById('exchange-client-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('exchange-client-code').value.trim();
    const name = document.getElementById('exchange-client-name').value.trim();
    if (!code || !name) return alert('Por favor, preencha todos os campos do cliente.');
    
    window.CurrentExchange.clientCode = code;
    window.CurrentExchange.clientName = name;
    
    App.renderCurrentExchangeState();
  });
  
  // Change Client button
  document.getElementById('btn-exchange-change-client')?.addEventListener('click', () => {
    if (window.CurrentExchange.items.length > 0 && !confirm('Se você alterar o cliente, os itens já lançados nesta simulação serão perdidos. Deseja continuar?')) {
      return;
    }
    window.CurrentExchange.clientCode = '';
    window.CurrentExchange.clientName = '';
    window.CurrentExchange.items = [];
    App.renderCurrentExchangeState();
  });
  
  // Back to categories button
  document.getElementById('btn-exchange-back-categories')?.addEventListener('click', () => {
    App.goBackToExchangeCategories();
  });
  
  // Product Search Input (in-category filter)
  document.getElementById('exchange-product-search')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = (window.FilteredExchangeProducts || []).filter(p => 
      p.codigo.toLowerCase().includes(term) || p.produto.toLowerCase().includes(term)
    );
    UI.renderExchangeProducts(filtered);
  });
  
  // Modal Quantity Type Select buttons event (radios)
  const radios = document.getElementsByName('exchange-item-type');
  radios.forEach(r => {
    r.addEventListener('change', () => {
      App.recalculateExchangeModalTotal();
    });
  });
  
  // Modal Quantity Input change listener
  document.getElementById('exchange-item-qty')?.addEventListener('input', () => {
    App.recalculateExchangeModalTotal();
  });
  
  // Modal Form Submit (add item to cart)
  document.getElementById('exchange-item-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    App.addExchangeItemFromModal();
  });
  
  // Modal Delete Item Button (for editing mode)
  document.getElementById('btn-exchange-modal-delete')?.addEventListener('click', () => {
    if (window.EditingExchangeItemIndex !== undefined && window.EditingExchangeItemIndex !== null && window.EditingExchangeItemIndex >= 0) {
      if (confirm('Deseja realmente remover este item da simulação?')) {
        App.removeExchangeCartItem(window.EditingExchangeItemIndex);
        document.getElementById('modal-exchange-item-qty').style.display = 'none';
      }
    }
  });
  
  // Cart Actions (Clear all, Finalize, Add item triggers)
  document.getElementById('btn-exchange-clear')?.addEventListener('click', () => {
    if (confirm('Deseja realmente limpar todos os itens adicionados?')) {
      window.CurrentExchange.items = [];
      UI.renderExchangeCart(window.CurrentExchange.items);
    }
  });

  document.getElementById('btn-exchange-clear-mobile')?.addEventListener('click', () => {
    if (confirm('Deseja realmente limpar todos os itens adicionados?')) {
      window.CurrentExchange.items = [];
      UI.renderExchangeCart(window.CurrentExchange.items);
    }
  });

  document.getElementById('btn-exchange-add-item-trigger')?.addEventListener('click', () => {
    App.showExchangeCategoriesCard();
    App.goBackToExchangeCategories();
  });

  document.getElementById('btn-exchange-add-item-trigger-mobile')?.addEventListener('click', () => {
    App.showExchangeCategoriesCard();
    App.goBackToExchangeCategories();
  });
  
  document.getElementById('btn-exchange-finalize')?.addEventListener('click', () => {
    App.finalizeExchange();
  });
  
  document.getElementById('btn-exchange-sticky-finalize')?.addEventListener('click', () => {
    App.finalizeExchange();
  });
  
  // Finalized Actions (Copy WhatsApp, New simulation)
  document.getElementById('btn-exchange-copy-text')?.addEventListener('click', () => {
    App.copyExchangeMessageText('exchange-message-output');
  });
  document.getElementById('btn-exchange-new-simulation')?.addEventListener('click', () => {
    window.CurrentExchange = { clientCode: '', clientName: '', items: [] };
    document.getElementById('exchange-client-form').reset();
    App.renderCurrentExchangeState();
  });
  
  // Details Modal copy button
  document.getElementById('btn-exchange-det-copy')?.addEventListener('click', () => {
    App.copyExchangeMessageText('det-exchange-message-text');
  });
  
  // History Filter Search Input
  document.getElementById('exchange-history-search')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = (window.AllExchangeSimulations || []).filter(sim => 
      sim.cliente_codigo.toLowerCase().includes(term) || 
      sim.cliente_nome_fantasia.toLowerCase().includes(term) ||
      (sim.seller_name || '').toLowerCase().includes(term)
    );
    UI.renderExchangeHistory(filtered);
  });
  
  // Admin Products Filter Search Input
  document.getElementById('exchange-products-admin-search')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = (window.AllExchangeProducts || []).filter(p => 
      p.codigo.toLowerCase().includes(term) || 
      p.produto.toLowerCase().includes(term) ||
      (p.categoria || '').toLowerCase().includes(term)
    );
    UI.renderExchangeAdminProducts(filtered);
  });
  
  // Import File Selector
  document.getElementById('exchange-file-input')?.addEventListener('change', (e) => {
    App.handleExchangeFileUpload(e);
  });
  
  // Import Column Mapper Submit
  document.getElementById('exchange-mapper-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    App.submitExchangeMapper();
  });
  document.getElementById('btn-exchange-mapper-cancel')?.addEventListener('click', () => {
    document.getElementById('exchange-mapper-card').classList.add('hidden');
    document.getElementById('exchange-file-input').value = '';
    document.getElementById('exchange-file-name').textContent = 'Nenhum arquivo selecionado';
  });
};

/**
 * Helper to switch sub-tabs in exchange panel
 */
App.switchExchangeTab = function(tabName) {
  // Hide all panels
  document.querySelectorAll('.exchange-tab-content').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('#view-simulador-troca .view-tabs .view-tab-btn').forEach(btn => btn.classList.remove('active'));
  
  // Show selected
  document.getElementById(`exchange-tab-${tabName}`)?.classList.remove('hidden');
  
  // Set active btn class
  const btnMap = {
    'nova': 'tab-exchange-nova-btn',
    'historico': 'tab-exchange-historico-btn',
    'importar': 'tab-exchange-importar-btn'
  };
  document.getElementById(btnMap[tabName])?.classList.add('active');
};

/**
 * Renders the current view state based on current client state
 */
App.renderCurrentExchangeState = function() {
  const isClientSelected = !!window.CurrentExchange.clientCode;
  
  const clientCard = document.getElementById('exchange-client-card');
  const workspace = document.getElementById('exchange-workspace');
  const receiptContainer = document.getElementById('exchange-receipt-container');
  const activeClientLabel = document.getElementById('exchange-active-client-label');
  
  // ALWAYS render cart first to keep sticky footer and finalize button disabled/hidden states synchronized
  UI.renderExchangeCart(window.CurrentExchange.items || []);
  App.hideExchangeCategoriesCard();

  if (isClientSelected) {
    clientCard?.classList.add('hidden');
    workspace?.classList.remove('hidden');
    receiptContainer?.classList.add('hidden');
    
    if (activeClientLabel) {
      activeClientLabel.textContent = `CÓD: ${window.CurrentExchange.clientCode} | NOME: ${window.CurrentExchange.clientName.toUpperCase()}`;
    }
    
    App.goBackToExchangeCategories();
  } else {
    clientCard?.classList.remove('hidden');
    workspace?.classList.add('hidden');
    receiptContainer?.classList.add('hidden');
  }
};

/**
 * Fetch all simulator products from the API
 */
App.fetchExchangeProducts = async function() {
  try {
    const data = await App.fetchFromApi('/api/exchange/products');
    window.AllExchangeProducts = (data || []).map(p => {
      p.categoria = (p.categoria || '').trim() || 'Açaí';
      const precoTotal = parseFloat(p.preco_total) || 0;
      const unidadesPorCaixa = parseInt(p.unidades_por_caixa, 10) || 1;
      const valorUnitario = parseFloat(p.valor_unitario) || (precoTotal / unidadesPorCaixa) || 0;
      p.preco_total = precoTotal;
      p.unidades_por_caixa = unidadesPorCaixa;
      p.valor_unitario = valorUnitario;
      return p;
    });
    
    // Update categories dynamically
    const cats = [...new Set((window.AllExchangeProducts || []).map(p => p.categoria))].filter(Boolean);
    window.ExchangeCategories = cats.length > 0 ? cats : ['Açaí'];
    
    UI.renderExchangeCategories(window.ExchangeCategories);
  } catch (err) {
    console.error('Erro ao buscar produtos do simulador:', err);
  }
};

/**
 * Handler to select exchange category
 */
App.selectExchangeCategory = function(category) {
  window.ActiveExchangeCategory = category;
  
  // Set title
  const title = document.getElementById('exchange-workspace-title');
  if (title) title.textContent = `Categoria: ${category.toUpperCase()}`;
  
  // Show back button
  document.getElementById('btn-exchange-back-categories')?.classList.remove('hidden');
  
  // Filter and show products
  window.FilteredExchangeProducts = (window.AllExchangeProducts || []).filter(p => p.categoria === category);
  UI.renderExchangeProducts(window.FilteredExchangeProducts);
  
  document.getElementById('exchange-categories-grid')?.classList.add('hidden');
  document.getElementById('exchange-products-grid-container')?.classList.remove('hidden');
  
  // Reset search query
  const search = document.getElementById('exchange-product-search');
  if (search) search.value = '';
};

/**
 * Go back to categories view inside workspace
 */
App.goBackToExchangeCategories = function() {
  const title = document.getElementById('exchange-workspace-title');
  if (title) title.textContent = 'Selecione uma Categoria';
  
  document.getElementById('btn-exchange-back-categories')?.classList.add('hidden');
  document.getElementById('exchange-categories-grid')?.classList.remove('hidden');
  document.getElementById('exchange-products-grid-container')?.classList.add('hidden');
};

/**
 * Open the selection modal for box/fractional quantities
 */
App.openExchangeItemModal = function(product) {
  window.ActiveExchangeProduct = product;
  window.EditingExchangeItemIndex = null;
  
  document.getElementById('exchange-modal-product-name').textContent = product.produto;
  document.getElementById('exchange-modal-product-info').textContent = `Código: ${product.codigo} | Categoria: ${product.categoria}`;
  
  // Reset inputs
  document.getElementById('exchange-item-qty').value = 1;
  
  // Check if Caixa has a valid price, otherwise default to fractional or check product properties
  const hasBox = Number(product.preco_total) > 0;
  const hasUnit = Number(product.valor_unitario) > 0;
  
  // Select Caixa by default if available
  const radioCaixa = document.querySelector('input[name="exchange-item-type"][value="caixa"]');
  const radioFracionado = document.querySelector('input[name="exchange-item-type"][value="fracionado"]');
  
  if (radioCaixa) radioCaixa.checked = hasBox || !hasUnit;
  if (radioFracionado) radioFracionado.checked = !hasBox && hasUnit;
  
  // Reset buttons
  const submitBtn = document.getElementById('btn-exchange-modal-submit');
  if (submitBtn) submitBtn.textContent = 'Adicionar Item';
  
  const deleteBtn = document.getElementById('btn-exchange-modal-delete');
  if (deleteBtn) deleteBtn.classList.add('hidden');
  
  App.recalculateExchangeModalTotal();
  
  document.getElementById('modal-exchange-item-qty').style.display = 'flex';
};

/**
 * Open the modal to edit an already added exchange item
 */
App.openEditExchangeItemModal = function(idx) {
  const item = window.CurrentExchange.items[idx];
  if (!item) return;
  
  window.EditingExchangeItemIndex = idx;
  
  // Find matching product
  const product = (window.AllExchangeProducts || []).find(p => p.codigo === item.codigo || p.id === item.product_id);
  if (!product) return;
  
  window.ActiveExchangeProduct = product;
  
  // Prefill fields
  document.getElementById('exchange-modal-product-name').textContent = item.produto;
  document.getElementById('exchange-modal-product-info').textContent = `Código: ${item.codigo} | Categoria: ${item.categoria}`;
  document.getElementById('exchange-item-qty').value = item.quantidade;
  
  const radioCaixa = document.querySelector('input[name="exchange-item-type"][value="caixa"]');
  const radioFracionado = document.querySelector('input[name="exchange-item-type"][value="fracionado"]');
  
  if (radioCaixa) radioCaixa.checked = (item.tipo === 'caixa');
  if (radioFracionado) radioFracionado.checked = (item.tipo === 'fracionado');
  
  // Set button text to Save
  const submitBtn = document.getElementById('btn-exchange-modal-submit');
  if (submitBtn) submitBtn.textContent = 'Salvar Alterações';
  
  // Show delete button
  const deleteBtn = document.getElementById('btn-exchange-modal-delete');
  if (deleteBtn) deleteBtn.classList.remove('hidden');
  
  App.recalculateExchangeModalTotal();
  
  document.getElementById('modal-exchange-item-qty').style.display = 'flex';
};

/**
 * Recalculates total values inside item selection modal in real time
 */
App.recalculateExchangeModalTotal = function() {
  const product = window.ActiveExchangeProduct;
  if (!product) return;
  
  const types = document.getElementsByName('exchange-item-type');
  let selectedType = 'caixa';
  types.forEach(t => {
    if (t.checked) selectedType = t.value;
  });
  
  const qtyInput = document.getElementById('exchange-item-qty');
  const qty = parseFloat(qtyInput.value) || 1;
  
  const labelQty = document.getElementById('label-exchange-qty');
  const priceSpan = document.getElementById('exchange-modal-price-val');
  const totalSpan = document.getElementById('exchange-modal-total-val');
  
  const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  
  let basePrice = 0;
  if (selectedType === 'caixa') {
    basePrice = parseFloat(product.preco_total) || 0;
    if (labelQty) labelQty.textContent = 'Quantidade de Caixas';
    qtyInput.placeholder = 'Digite a quantidade de caixas';
  } else {
    basePrice = parseFloat(product.valor_unitario) || 0;
    if (labelQty) labelQty.textContent = 'Quantidade de Unidades (Fracionado)';
    qtyInput.placeholder = 'Digite a quantidade de unidades';
  }
  
  const total = basePrice * qty;
  if (priceSpan) priceSpan.textContent = money(basePrice);
  if (totalSpan) totalSpan.textContent = money(total);
};

/**
 * Confirms selection and adds or updates item inside exchange checklist
 */
App.addExchangeItemFromModal = function() {
  const product = window.ActiveExchangeProduct;
  if (!product) return;
  
  const types = document.getElementsByName('exchange-item-type');
  let selectedType = 'caixa';
  types.forEach(t => {
    if (t.checked) selectedType = t.value;
  });
  
  const qty = parseFloat(document.getElementById('exchange-item-qty').value) || 0;
  if (qty <= 0) return alert('Por favor, informe uma quantidade maior do que zero.');
  
  const basePrice = selectedType === 'caixa' ? parseFloat(product.preco_total) : parseFloat(product.valor_unitario);
  const totalItem = basePrice * qty;
  
  const newItem = {
    product_id: product.id,
    codigo: product.codigo,
    produto: product.produto,
    categoria: product.categoria,
    tipo: selectedType,
    quantidade: qty,
    valor_base: basePrice,
    total_item: totalItem
  };
  
  if (window.EditingExchangeItemIndex !== undefined && window.EditingExchangeItemIndex !== null && window.EditingExchangeItemIndex >= 0) {
    window.CurrentExchange.items[window.EditingExchangeItemIndex] = newItem;
    window.EditingExchangeItemIndex = null;
    App.showToast('Item atualizado com sucesso!');
  } else {
    window.CurrentExchange.items.push(newItem);
    App.showToast('Item adicionado à simulação!');
  }
  
  // Close modal
  document.getElementById('modal-exchange-item-qty').style.display = 'none';
  
  // Render cart
  UI.renderExchangeCart(window.CurrentExchange.items);
  
  // Hide categories view automatically, returning to the cart summary page
  App.hideExchangeCategoriesCard();
};

/**
 * Remove single item from current exchange cart list
 */
App.removeExchangeCartItem = function(idx) {
  if (window.CurrentExchange && window.CurrentExchange.items) {
    window.CurrentExchange.items.splice(idx, 1);
    UI.renderExchangeCart(window.CurrentExchange.items);
    App.showToast('Item removido da simulação.');
  }
};

/**
 * Submit and finalize simulation
 */
App.finalizeExchange = async function() {
  const clientCode = window.CurrentExchange.clientCode;
  const clientName = window.CurrentExchange.clientName;
  const items = window.CurrentExchange.items;
  
  if (!clientCode || !clientName) {
    alert('Identificação do cliente inválida.');
    return;
  }
  
  if (!items || items.length === 0) {
    alert('Adicione pelo menos um produto de troca antes de finalizar.');
    return;
  }
  
  const totalGeral = items.reduce((acc, curr) => acc + parseFloat(curr.total_item), 0);
  const loggedUser = Store.getLoggedUser() || {};
  
  // Format message
  const now = new Date();
  const dateFormatted = now.toLocaleString('pt-BR');
  
  const separator = "-------------------------------";
  let msg = "";
  msg += separator + "\n";
  msg += "SIMULADOR DE TROCA\n";
  msg += separator + "\n\n";
  msg += `CLIENTE: ${clientCode}\n`;
  msg += `NOME: ${clientName.toUpperCase()}\n\n`;
  msg += "PRODUTOS:\n\n";
  
  const moneyFormat = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  
  items.forEach((it, index) => {
    msg += `${index + 1}) ${it.codigo} - ${it.produto.toUpperCase()}\n`;
    msg += `TIPO: ${it.tipo.toUpperCase()}\n`;
    if (it.tipo === 'caixa') {
      msg += `QTD: ${it.quantidade}\n`;
      msg += `VL. CAIXA: ${moneyFormat(it.valor_base)}\n`;
    } else {
      msg += `QTD: ${it.quantidade} UN\n`;
      msg += `VL. UNIT: ${moneyFormat(it.valor_base)}\n`;
    }
    msg += `TOTAL: ${moneyFormat(it.total_item)}\n\n`;
  });
  
  msg += separator + "\n";
  msg += `TOTAL DA TROCA: ${moneyFormat(totalGeral)}\n`;
  msg += separator + "\n\n";
  msg += `VENDEDOR: ${loggedUser.name || loggedUser.username}\n`;
  msg += `DATA: ${dateFormatted}\n`;
  
  try {
    const res = await App.fetchFromApi('/api/exchange/simulations', {
      method: 'POST',
      body: JSON.stringify({
        cliente_codigo: clientCode,
        cliente_nome_fantasia: clientName,
        total: totalGeral,
        generated_message: msg,
        items: items
      })
    });
    
    if (res.success) {
      App.showToast('Lançamento da troca finalizado!');
      
      // Render receipt view
      document.getElementById('exchange-workspace').classList.add('hidden');
      document.getElementById('exchange-receipt-container').classList.remove('hidden');
      document.getElementById('exchange-message-output').value = msg;
      
      // Reset in-memory cart and update UI
      window.CurrentExchange = { clientCode: '', clientName: '', items: [] };
      UI.renderExchangeCart(window.CurrentExchange.items);
      
      // Refresh history list immediately
      App.loadExchangeHistory();
    }
  } catch (err) {
    console.error(err);
    alert('Erro ao finalizar e salvar simulação: ' + err.message);
  }
};

/**
 * Copy specific text to clipboard
 */
App.copyExchangeMessageText = async function(elementId) {
  const textEl = document.getElementById(elementId);
  if (!textEl) return;
  
  try {
    await navigator.clipboard.writeText(textEl.value);
    App.showToast('Mensagem de texto copiada com sucesso!');
  } catch (e) {
    // Fallback
    textEl.select();
    document.execCommand('copy');
    App.showToast('Mensagem de texto copiada com sucesso!');
  }
};

/**
 * Fetch simulations history and render it
 */
App.loadExchangeHistory = async function() {
  try {
    const data = await App.fetchFromApi('/api/exchange/simulations');
    window.AllExchangeSimulations = data || [];
    UI.renderExchangeHistory(window.AllExchangeSimulations);
  } catch (err) {
    console.error('Erro ao buscar histórico de simulações:', err);
  }
};

/**
 * Load detailed simulation into modal
 */
App.showExchangeSimulationDetails = async function(id) {
  try {
    const data = await App.fetchFromApi(`/api/exchange/simulations/${id}`);
    
    document.getElementById('det-exchange-id').textContent = data.id;
    document.getElementById('det-exchange-vendedor').textContent = data.seller_name || data.seller_id;
    document.getElementById('det-exchange-data-hora').textContent = new Date(data.created_at).toLocaleString('pt-BR');
    document.getElementById('det-exchange-cliente-codigo').textContent = data.cliente_codigo;
    document.getElementById('det-exchange-cliente-nome').textContent = data.cliente_nome_fantasia;
    
    const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    document.getElementById('det-exchange-total-geral').textContent = money(data.total);
    
    const tbody = document.getElementById('det-exchange-items-tbody');
    tbody.innerHTML = '';
    
    if (Array.isArray(data.items)) {
      tbody.innerHTML = data.items.map(it => {
        return `
          <tr>
            <td><strong>${it.codigo}</strong></td>
            <td>${it.produto}</td>
            <td><span class="badge-status ${it.tipo === 'caixa' ? 'badge-success' : 'badge-primary'}" style="text-transform: uppercase;">${it.tipo}</span></td>
            <td style="text-align: center;">${it.quantidade} ${it.tipo === 'caixa' ? 'CX' : 'UN'}</td>
            <td style="text-align: right;">${money(it.valor_base)}</td>
            <td style="text-align: right; font-weight: bold; color: var(--primary-color);">${money(it.total_item)}</td>
          </tr>
        `;
      }).join('');
    }
    
    document.getElementById('det-exchange-message-text').value = data.generated_message || '';
    
    document.getElementById('modal-exchange-details').style.display = 'flex';
  } catch (err) {
    console.error(err);
    alert('Erro ao carregar detalhes da simulação: ' + err.message);
  }
};

/**
 * Handle spreadsheet upload via SheetJS
 */
App.handleExchangeFileUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  document.getElementById('exchange-file-name').textContent = file.name;
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const data = e.target.result;
      const workbook = XLSX.read(data, { type: 'binary' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Parse sheet to JSON array
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      if (json.length === 0) {
        alert('A planilha está vazia.');
        return;
      }
      
      window.UploadedExchangeRows = json;
      
      // Extract headers from first row
      const headers = Object.keys(json[0]);
      
      // Show Column Mapper Card
      const mapperCard = document.getElementById('exchange-mapper-card');
      mapperCard.classList.remove('hidden');
      
      // Populate mapper selects
      const selects = document.querySelectorAll('.mapper-select');
      selects.forEach(sel => {
        sel.innerHTML = '<option value="" disabled selected>Selecione a coluna...</option>';
        headers.forEach(h => {
          sel.innerHTML += `<option value="${h}">${h}</option>`;
        });
      });
      
      // Smart/Auto mapping helper
      const smartMap = {
        'map-codigo': ['codigo', 'código', 'cod', 'id'],
        'map-produto': ['produto', 'nome', 'descrição', 'descricao', 'product'],
        'map-categoria': ['categoria', 'grupo', 'seção', 'secao', 'category'],
        'map-preco-total': ['preco total', 'preço total', 'valor total', 'caixa', 'valor caixa', 'preco_total'],
        'map-quantidade-caixa': ['quantidade na caixa', 'qtd na caixa', 'quantidade caixa', 'caixa_qtd', 'quantidade_na_caixa'],
        'map-valor-unitario': ['valor unitario', 'valor unitário', 'preco unitario', 'unitario', 'valor_unitario']
      };
      
      Object.entries(smartMap).forEach(([selectId, terms]) => {
        const select = document.getElementById(selectId);
        if (!select) return;
        const found = headers.find(h => 
          terms.includes(h.toLowerCase().trim()) || 
          terms.some(term => h.toLowerCase().trim().includes(term))
        );
        if (found) {
          select.value = found;
        }
      });
      
    } catch (err) {
      console.error(err);
      alert('Erro ao ler a planilha. Certifique-se de que é um formato CSV ou Excel válido.');
    }
  };
  
  reader.readAsBinaryString(file);
};

/**
 * Submit mapped columns, format products and send bulk to api
 */
App.submitExchangeMapper = async function() {
  const rows = window.UploadedExchangeRows;
  if (!rows || rows.length === 0) return alert('Nenhum data carregado.');
  
  const mapCodigo = document.getElementById('map-codigo').value;
  const mapProduto = document.getElementById('map-produto').value;
  const mapCategoria = document.getElementById('map-categoria').value;
  const mapPrecoTotal = document.getElementById('map-preco-total').value;
  const mapQtdCaixa = document.getElementById('map-quantidade-caixa').value;
  const mapValorUnitario = document.getElementById('map-valor-unitario').value;
  
  if (!mapCodigo || !mapProduto || !mapCategoria || !mapPrecoTotal || !mapQtdCaixa || !mapValorUnitario) {
    alert('Por favor, mapeie todas as colunas obrigatórias.');
    return;
  }
  
  const cleanNum = (val) => {
    if (typeof val === 'number') return val;
    const clean = String(val).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  };
  
  const products = rows.map(r => {
    return {
      codigo: String(r[mapCodigo]).trim(),
      produto: String(r[mapProduto]).trim(),
      categoria: String(r[mapCategoria]).trim() || 'Outros',
      preco_total: cleanNum(r[mapPrecoTotal]),
      quantidade_na_caixa: parseInt(r[mapQtdCaixa], 10) || 1,
      valor_unitario: cleanNum(r[mapValorUnitario])
    };
  }).filter(p => p.codigo); // remove empty rows
  
  try {
    const res = await App.fetchFromApi('/api/exchange/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ products })
    });
    
    if (res.success) {
      App.showToast('Importação de produtos realizada com sucesso!');
      document.getElementById('exchange-mapper-card').classList.add('hidden');
      document.getElementById('exchange-file-input').value = '';
      document.getElementById('exchange-file-name').textContent = 'Nenhum arquivo selecionado';
      
      // Refresh products list
      await App.fetchExchangeProducts();
      App.loadExchangeAdminProducts();
    }
  } catch (err) {
    console.error(err);
    alert('Erro ao importar produtos no simulador: ' + err.message);
  }
};

/**
 * Load and render products inside administrative tab
 */
App.loadExchangeAdminProducts = function() {
  const products = window.AllExchangeProducts || [];
  UI.renderExchangeAdminProducts(products);
};

/**
 * Show the categories selection card and scroll it into view
 */
App.showExchangeCategoriesCard = function() {
  const card = document.getElementById('exchange-categories-card');
  if (card) {
    card.classList.remove('hidden');
    card.scrollIntoView({ behavior: 'smooth' });
  }
};

/**
 * Hide the categories selection card
 */
App.hideExchangeCategoriesCard = function() {
  const card = document.getElementById('exchange-categories-card');
  if (card) {
    card.classList.add('hidden');
  }
};

/**
 * Toggle expanding/collapsing details for a history item, lazy-loading details if needed
 */
App.toggleExchangeHistoryItem = async function(id) {
  const itemEl = document.getElementById(`exchange-history-item-${id}`);
  const detailsEl = document.getElementById(`exchange-history-details-${id}`);
  if (!itemEl || !detailsEl) return;
  
  const isExpanded = itemEl.classList.contains('expanded');
  
  // Close all other expanded items first to make the layout cleaner
  document.querySelectorAll('.exchange-history-item.expanded').forEach(el => {
    if (el.id !== `exchange-history-item-${id}`) {
      el.classList.remove('expanded');
      const details = el.querySelector('.exchange-history-item-details');
      if (details) details.style.display = 'none';
    }
  });
  
  if (isExpanded) {
    itemEl.classList.remove('expanded');
    detailsEl.style.display = 'none';
  } else {
    itemEl.classList.add('expanded');
    detailsEl.style.display = 'block';
    
    // Load details if not already loaded (check if placeholder "Carregando" is present)
    const listDiv = document.getElementById(`exchange-history-details-list-${id}`);
    if (listDiv && listDiv.innerText.includes('Carregando')) {
      try {
        const data = await App.fetchFromApi(`/api/exchange/simulations/${id}`);
        
        // Cache message for copying
        window.ExchangeMessagesCache = window.ExchangeMessagesCache || {};
        window.ExchangeMessagesCache[id] = data.generated_message;
        
        const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
        
        if (Array.isArray(data.items) && data.items.length > 0) {
          listDiv.innerHTML = data.items.map(it => {
            const labelTipo = it.tipo === 'caixa' ? 'Caixa' : 'Fracionado';
            const labelQtd = `${it.quantidade} ${it.tipo === 'caixa' ? 'cx' : 'un'}`;
            return `
              <div style="font-size: 0.82rem; text-align: left; color: #222 !important; font-family: 'Courier New', Courier, monospace !important; line-height: 1.35; word-wrap: break-word !important; overflow-wrap: break-word !important; white-space: normal !important; margin-bottom: 6px;">
                ${it.codigo} - ${it.produto.toUpperCase()}<br>
                Tipo: ${labelTipo}<br>
                Qtd: ${labelQtd}<br>
                Vlr Unit: ${money(it.valor_base)}<br>
                Total: ${money(it.total_item)}<br>
                --------------------------
              </div>
            `;
          }).join('');
        } else {
          listDiv.innerHTML = `<div style="text-align: center; color: #666; padding: 10px; font-family: monospace;">Nenhum item encontrado nesta troca.</div>`;
        }
      } catch (err) {
        console.error(err);
        listDiv.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 10px; font-family: monospace;">Erro ao carregar itens: ${err.message}</div>`;
      }
    }
  }
};

/**
 * Copy simulation WhatsApp message again from history view
 */
App.copyExchangeHistoryMessage = async function(simId) {
  const msg = window.ExchangeMessagesCache && window.ExchangeMessagesCache[simId];
  if (msg) {
    try {
      await navigator.clipboard.writeText(msg);
      App.showToast('Mensagem de texto copiada com sucesso!');
    } catch (e) {
      // Fallback copy using temporary textarea
      const el = document.createElement('textarea');
      el.value = msg;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      App.showToast('Mensagem de texto copiada com sucesso!');
    }
  } else {
    // If not in cache, fetch it from backend, copy, and cache
    try {
      const data = await App.fetchFromApi(`/api/exchange/simulations/${simId}`);
      window.ExchangeMessagesCache = window.ExchangeMessagesCache || {};
      window.ExchangeMessagesCache[simId] = data.generated_message;
      
      await navigator.clipboard.writeText(data.generated_message);
      App.showToast('Mensagem de texto copiada com sucesso!');
    } catch (err) {
      console.error(err);
      App.showToast('Erro ao carregar e copiar mensagem.');
    }
  }
};



/**
 * Correções 30/06 - categorias, padrão de equipamentos e upload resiliente de fotos.
 * Não reescreve módulos: apenas normaliza dados vindos de configuração e ajusta selects.
 */
App.normalizeConfigText = function(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'number') return String(item).trim();
  if (typeof item === 'object') {
    return String(item.name || item.nome || item.title || item.titulo || item.label || item.descricao || item.description || item.value || '').trim();
  }
  return String(item).trim();
};

App.getCleanClientCategories = function() {
  const raw = (window.Store && typeof Store.getClientCategories === 'function') ? Store.getClientCategories() : [];
  const seen = new Set();
  return (Array.isArray(raw) ? raw : [])
    .map(App.normalizeConfigText)
    .filter(v => v && v !== '[object Object]' && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
};

App.getCleanEquipmentTypes = function() {
  const raw = (window.Store && typeof Store.getEquipmentTypes === 'function') ? Store.getEquipmentTypes() : [];
  const seen = new Set();
  return (Array.isArray(raw) ? raw : [])
    .map(App.normalizeConfigText)
    .filter(v => v && v !== '[object Object]' && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
};

App.applyClientCorrectionsToSelects = function() {
  const cat = document.getElementById('client-category');
  if (cat) {
    const current = App.normalizeConfigText(cat.value);
    const categories = App.getCleanClientCategories();
    cat.innerHTML = '<option value="" disabled>Selecione...</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
    if (current && categories.includes(current)) cat.value = current;
  }

  const requested = document.getElementById('client-requested-eq-type');
  if (requested) {
    const current = App.normalizeConfigText(requested.value);
    const types = App.getCleanEquipmentTypes();
    requested.innerHTML = '<option value="" disabled>Selecione...</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
    if (current && types.includes(current)) requested.value = current;
  }

  const sendable = document.getElementById('client-sendable-eq-type');
  if (sendable) {
    const current = App.normalizeConfigText(sendable.value);
    const patterns = ['Alto padrão', 'Médio padrão', 'Baixo padrão'];
    sendable.innerHTML = '<option value="" disabled>Selecione o padrão...</option>' + patterns.map(p => `<option value="${p}">${p}</option>`).join('');
    if (current && patterns.includes(current)) sendable.value = current;
  }
};

(function patchClientConfigDropdowns() {
  const originalSetup = App.setupEventListeners;
  if (typeof originalSetup === 'function' && !App._clientCorrectionsSetupPatched) {
    App._clientCorrectionsSetupPatched = true;
    App.setupEventListeners = function(...args) {
      const result = originalSetup.apply(this, args);
      setTimeout(() => App.applyClientCorrectionsToSelects(), 0);
      return result;
    };
  }

  const originalNavigate = App.navigate;
  if (typeof originalNavigate === 'function' && !App._clientCorrectionsNavigatePatched) {
    App._clientCorrectionsNavigatePatched = true;
    App.navigate = function(...args) {
      const result = originalNavigate.apply(this, args);
      setTimeout(() => App.applyClientCorrectionsToSelects(), 0);
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(() => App.applyClientCorrectionsToSelects(), 300));
  window.addEventListener('hashchange', () => setTimeout(() => App.applyClientCorrectionsToSelects(), 300));
})();
