const UI = {
  normalizeRole(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim();
  },

  isAdminUser(user) {
    const profile = this.normalizeRole(user && user.profile);
    const perms = Array.isArray(user && user.permissions) ? user.permissions.map(p => this.normalizeRole(p)) : [];
    return ['administrador', 'admin', 'administrador geral'].includes(profile) || perms.includes('administrador') || perms.includes('admin');
  },

  safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  },

  formatClientScore(client) {
    if (!client || client.score === undefined || client.score === null || client.score === '') return '-';
    const cls = client.classification || (window.Scoring ? window.Scoring.classify(Number(client.score) || 0) : '');
    return `${client.score} ${cls}`;
  },

  formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(this.safeNumber(value));
  },

  /**
   * Apply company configuration to the header, sidebar, login card and page titles
   * @param {Object} config - Config containing Name, Logo, CNPJ, Phone, Email
   */
  applyCompanyIdentity(config) {
    if (!config) return;

    // Set page tab title
    document.title = `${config.name} | Controle de Campo`;

    // Apply logo to image tags
    const logos = document.querySelectorAll('.brand-logo-img, .badge-logo, .login-logo, .pdf-logo-img');
    logos.forEach(img => { if (img) img.src = config.logo; });

    // Apply company name
    const names = document.querySelectorAll('.brand-name, .badge-name, .login-company-name, .pdf-company-name');
    names.forEach(el => { if (el) el.textContent = config.name; });

    // Apply metadata info specifically to the PDF sheet
    const pdfCnpj = document.getElementById('pdf-header-cnpj');
    if (pdfCnpj) pdfCnpj.textContent = `CNPJ: ${config.cnpj}`;

    const pdfContato = document.getElementById('pdf-header-contato');
    if (pdfContato) pdfContato.textContent = `Tel: ${config.phone} | E-mail: ${config.email}`;
  },

  /**
   * Helper to resolve branch unit name by its ID
   * @param {string} unitId 
   */
  getUnitName(unitId) {
    if (unitId === 'all') return 'Todas as Unidades';
    const units = Store.getUnits();
    const unit = units.find(u => u.id === unitId);
    return unit ? unit.name : 'Unidade Geral';
  },

  /**
   * Helper to resolve user name by its ID
   * @param {string} userId 
   */
  getUserName(userId) {
    const users = Store.getUsers();
    const user = users.find(u => u.id === userId);
    return user ? user.name : 'Usuário não localizado';
  },

  /**
   * Resolve o nome real do responsável por uma despesa.
   * Prioriza o nome vindo do backend e, depois, busca pelo userId na lista de usuários.
   */
  getExpenseUserName(exp) {
    if (!exp) return 'Usuário não localizado';
    const directName = exp.userName || exp.usuario_nome || exp.nome_usuario || exp.nomeUsuario || exp.vendedor_nome || exp.vendedor || exp.seller_name || exp.responsavel_nome;
    if (directName && String(directName).trim() && String(directName).trim() !== 'Outro Vendedor') {
      return String(directName).trim();
    }

    const possibleIds = [exp.userId, exp.usuario_id, exp.user_id, exp.seller_id, exp.created_by].filter(Boolean).map(String);
    const users = Store.getUsers ? Store.getUsers() : [];
    const found = users.find(u => possibleIds.includes(String(u.id)) || possibleIds.includes(String(u.username)) || possibleIds.includes(String(u.email)));
    if (found && found.name) return found.name;

    return 'Usuário não localizado';
  },

  /**
   * Apply role-based screen visibility configuration
   */
  applyPermissions() {
    const user = Store.getLoggedUser();
    if (!user) return;

    const allowedHashes = Store.getUserAllowedRoutes(user);

    // Sidebar links mapping (only 9 main pages)
    const sidebarLinks = {
      '#dashboard': 'menu-dashboard',
      '#prospeccao': 'menu-prospeccao',
      '#clientes': 'menu-clientes',
      '#equipamentos': 'menu-equipamentos',
      '#chamados': 'menu-chamados',
      '#despesas': 'menu-despesas',
      '#relatorios': 'menu-relatorios',
      '#tutorial': 'menu-tutorial',
      '#configuracoes': 'menu-configuracoes',
      '#simulador-troca': 'menu-simulador-troca',
      '#historico-exclusoes': 'menu-historico-exclusoes'
    };

    // Mobile tab links mapping
    const mobileLinks = {
      '#dashboard': 'mobile-menu-dashboard',
      '#clientes': 'mobile-menu-clientes',
      '#chamados': 'mobile-menu-chamados',
      '#relatorios': 'mobile-menu-relatorios',
      '#configuracoes': 'mobile-menu-configuracoes'
    };

    // Apply sidebar links display
    Object.entries(sidebarLinks).forEach(([hash, elementId]) => {
      const el = document.getElementById(elementId);
      if (el) {
        el.style.display = allowedHashes.includes(hash) ? 'flex' : 'none';
      }
    });

    // Apply mobile links display
    Object.entries(mobileLinks).forEach(([hash, elementId]) => {
      const el = document.getElementById(elementId);
      if (el) {
        el.style.display = allowedHashes.includes(hash) ? 'flex' : 'none';
      }
    });

    // Control visibility of tab buttons based on permissions
    const clientApprovalsAllowed = allowedHashes.includes('#aprovacao');
    const tabClientApprovals = document.getElementById('tab-client-approvals');
    const tabClientApprovalsQueue = document.getElementById('tab-client-approvals-queue');
    if (tabClientApprovals) tabClientApprovals.style.display = clientApprovalsAllowed ? 'flex' : 'none';
    if (tabClientApprovalsQueue) tabClientApprovalsQueue.style.display = clientApprovalsAllowed ? 'flex' : 'none';

    const balanceSolicitationAllowed = allowedHashes.includes('#solicitacao-despesas');
    const tabBalSol = document.getElementById('tab-balance-solicitation');
    const tabBalSolForm = document.getElementById('tab-balance-solicitation-form');
    if (tabBalSol) tabBalSol.style.display = balanceSolicitationAllowed ? 'flex' : 'none';
    if (tabBalSolForm) tabBalSolForm.style.display = balanceSolicitationAllowed ? 'flex' : 'none';

    const balanceApprovalsAllowed = allowedHashes.includes('#despesas-dashboard');
    const tabBalApp = document.getElementById('tab-balance-approvals');
    const tabBalAppFromSol = document.getElementById('tab-balance-approvals-from-sol');
    if (tabBalApp) tabBalApp.style.display = balanceApprovalsAllowed ? 'flex' : 'none';
    if (tabBalAppFromSol) tabBalAppFromSol.style.display = balanceApprovalsAllowed ? 'flex' : 'none';

    const movementAllowed = allowedHashes.includes('#movimentacao');
    const tabMovements = document.querySelectorAll('.view-tab-btn[href="#movimentacao"]');
    tabMovements.forEach(el => {
      el.style.display = movementAllowed ? 'flex' : 'none';
    });

    const equipmentsAllowed = allowedHashes.includes('#equipamentos');
    const tabEquipments = document.querySelectorAll('.view-tab-btn[href="#equipamentos"]');
    tabEquipments.forEach(el => {
      el.style.display = equipmentsAllowed ? 'flex' : 'none';
    });

    // Enforce unit selection locking for common users
    const globalSelector = document.getElementById('global-unit-selector');
    if (globalSelector) {
      if (user.profile !== 'Administrador' && user.unitId !== 'all') {
        Store.setActiveUnitId(user.unitId);
        globalSelector.value = user.unitId;
        globalSelector.disabled = true;
        const container = globalSelector.closest('.header-unit-selector') || globalSelector.parentElement;
        if (container) container.style.display = 'none';
      } else {
        globalSelector.disabled = false;
        const container = globalSelector.closest('.header-unit-selector') || globalSelector.parentElement;
        if (container) container.style.display = 'flex';
      }
    }

    // Render logged user details in sidebar footer
    const userAvatar = document.querySelector('.user-avatar');
    if (userAvatar) {
      if (user.photo) {
        userAvatar.innerHTML = `<img src="${user.photo}" alt="Perfil" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        userAvatar.textContent = user.name ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'US';
      }
    }
    const userName = document.querySelector('.user-name');
    if (userName) {
      userName.textContent = user.name;
    }
    const userRole = document.querySelector('.user-role');
    if (userRole) {
      userRole.textContent = `${user.profile} | ${UI.getUnitName(user.unitId)}`;
    }

    // Hide/Show seller select dropdown groups in forms based on profile
    const sellerDropdownGroups = ['group-prosp-seller', 'group-client-seller', 'group-ticket-seller', 'group-exp-seller', 'group-bal-seller', 'group-ticket-open-seller'];
    sellerDropdownGroups.forEach(groupId => {
      const group = document.getElementById(groupId);
      if (group) {
        const isVendedor = user.profile === 'Vendedor';
        group.style.display = isVendedor ? 'none' : 'block';
        const selectEl = group.querySelector('select');
        if (selectEl) {
          if (isVendedor) {
            selectEl.removeAttribute('required');
          } else {
            selectEl.setAttribute('required', 'required');
          }
        }
      }
    });

    // Hide dashboard card and quick button if expenses not allowed
    const showExpenses = allowedHashes.includes('#despesas');
    const cardExpenses = document.getElementById('dash-card-expenses');
    if (cardExpenses) {
      cardExpenses.style.display = showExpenses ? 'flex' : 'none';
    }
    const quickBtnExpenses = document.getElementById('quick-btn-expenses');
    if (quickBtnExpenses) {
      quickBtnExpenses.style.display = showExpenses ? 'inline-block' : 'none';
    }

    // Exchange Simulator Import Tab permission check
    const tabExchangeImportarBtn = document.getElementById('tab-exchange-importar-btn');
    if (tabExchangeImportarBtn) {
      tabExchangeImportarBtn.style.display = user.profile === 'Administrador' ? 'inline-block' : 'none';
    }
  },

  /**
   * Calculate and update balance cards (available, used, remaining) dynamically
   */
  updateBalanceCards() {
    const user = Store.getLoggedUser();
    if (!user) return;
    let balances = window.AppBalancesCache || Store.getBalanceRequests() || [];
    let expenses = window.AppExpensesCache || Store.getExpenses() || [];
    const activeUnitId = Store.getActiveUnitId();
    
    // Filter by unit
    if (activeUnitId !== 'all') {
      balances = balances.filter(b => b.unitId === activeUnitId);
      expenses = expenses.filter(e => e.unitId === activeUnitId);
    }
    
    // Filter by seller
    if (user && this.normalizeRole(user.profile) === 'vendedor' && !this.isAdminUser(user)) {
      balances = balances.filter(b => (b.usuario_id || b.userId || b.user_id) === user.id);
      expenses = expenses.filter(e => (e.userId || e.user_id || e.usuario_id) === user.id);
    }
    
    const totalApproved = balances
      .filter(b => b.status === 'Aprovada' || b.status === 'Aprovada (não valor total)' || b.status === 'Aprovado')
      .reduce((sum, curr) => sum + (Number(curr.totalAprovado) || 0), 0);
      
    const totalSpent = expenses
      .filter(e => e.status === 'Aprovado' || e.status === 'Pendente')
      .reduce((sum, curr) => sum + (Number(curr.value) || 0), 0);
      
    const balanceRemaining = totalApproved - totalSpent;
    
    const fmt = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    
    // Populate cards if they exist in the DOM
    const elAvailable = document.getElementById('metric-balance-available');
    if (elAvailable) elAvailable.textContent = fmt(totalApproved);
    
    const elUsed = document.getElementById('metric-balance-used');
    if (elUsed) elUsed.textContent = fmt(totalSpent);
    
    const elRemaining = document.getElementById('metric-balance-remaining');
    if (elRemaining) elRemaining.textContent = fmt(balanceRemaining);
    
    // Also update the dashboard card if it exists
    const dashBalances = document.getElementById('dash-pending-balances');
    if (dashBalances) dashBalances.textContent = fmt(balanceRemaining);
  },

  /**
   * Refresh metrics cards and list summaries on the main dashboard view
   */
  renderDashboard() {
    this.updateBalanceCards();
    const activeUnitId = Store.getActiveUnitId();
    const user = Store.getLoggedUser();
    let prospects = Store.getProspects();
    let clients = Store.getClients();
    let tickets = Store.getTickets();
    let expenses = window.AppExpensesCache || Store.getExpenses();
    let balances = window.AppBalancesCache || Store.getBalanceRequests();

    // Filter by active unit if selected
    if (activeUnitId !== 'all') {
      prospects = prospects.filter(p => p.unitId === activeUnitId);
      clients = clients.filter(c => c.unitId === activeUnitId);
      tickets = tickets.filter(t => t.unitId === activeUnitId);
      expenses = expenses.filter(e => e.unitId === activeUnitId);
      balances = balances.filter(b => b.unitId === activeUnitId);
    }

    // Vendedor filter constraint
    if (user && this.normalizeRole(user.profile) === 'vendedor' && !this.isAdminUser(user)) {
      prospects = prospects.filter(p => (p.userId || p.user_id) === user.id);
      clients = clients.filter(c => (c.userId || c.user_id) === user.id);
      tickets = tickets.filter(t => (t.userId || t.user_id) === user.id);
      expenses = expenses.filter(e => (e.userId || e.user_id || e.usuario_id) === user.id);
      balances = balances.filter(b => (b.usuario_id || b.userId || b.user_id) === user.id);
    }

    // 1. Calculate values
    const pendingApprovals = clients.filter(c => c.status === 'Pendente').length;
    const openTickets = tickets.filter(t => t.status === 'Aberto' || t.status === 'Em Atendimento').length;
    const pendingExpenses = expenses.filter(e => e.status === 'Pendente').reduce((acc, curr) => acc + UI.safeNumber(curr.value), 0);
    const pendingBalances = balances.filter(b => b.status === 'Pendente').length;

    // 2. Set dashboard metrics tags
    const dashClients = document.getElementById('dash-pending-approvals');
    if (dashClients) dashClients.textContent = pendingApprovals;

    const dashTickets = document.getElementById('dash-open-tickets');
    if (dashTickets) dashTickets.textContent = openTickets;

    const dashExpenses = document.getElementById('dash-pending-expenses');
    if (dashExpenses) {
      dashExpenses.textContent = UI.formatCurrency(pendingExpenses);
    }

    // Saldo disponível aprovado é atualizado via updateBalanceCards(), não substituir pela quantidade de pendentes
    // const dashBalances = document.getElementById('dash-pending-balances');
    // if (dashBalances) dashBalances.textContent = pendingBalances;

    const renderMiniBars = (elementId, rows, valueFormatter = (v) => v) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      const max = Math.max(...rows.map(r => Number(r.value) || 0), 1);
      el.innerHTML = rows.map(r => {
        const width = Math.max(4, Math.round(((Number(r.value) || 0) / max) * 100));
        return `<div class="mini-chart-row"><span>${r.label}</span><div class="mini-chart-track"><div class="mini-chart-fill" style="width:${width}%"></div></div><span class="mini-chart-value">${valueFormatter(r.value)}</span></div>`;
      }).join('') || '<div style="color:var(--text-muted); font-size:.85rem;">Nenhum dado liberado para este usuário.</div>';
    };
    const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    const expenseRows = [
      { label: 'Pendentes', value: expenses.filter(e => e.status === 'Pendente').reduce((a, e) => a + (Number(e.value) || 0), 0) },
      { label: 'Aprovadas', value: expenses.filter(e => (e.status || '').includes('Aprov')).reduce((a, e) => a + (Number(e.value) || 0), 0) },
      { label: 'Reprovadas', value: expenses.filter(e => (e.status || '').includes('Reprov')).reduce((a, e) => a + (Number(e.value) || 0), 0) }
    ];
    const balanceRows = [
      { label: 'Pendentes', value: balances.filter(b => b.status === 'Pendente').length },
      { label: 'Aprovadas', value: balances.filter(b => (b.status || '').includes('Aprov')).length },
      { label: 'Reprovadas', value: balances.filter(b => (b.status || '').includes('Reprov')).length }
    ];
    renderMiniBars('dash-expense-bars', expenseRows, money);
    renderMiniBars('dash-balance-bars', balanceRows, (v) => String(v || 0));
  },

  /**
   * Render Prospects (list layout)
   */
  renderProspects(prospects) {
    const activeUnitId = Store.getActiveUnitId();
    const user = Store.getLoggedUser();

    if (activeUnitId !== 'all') {
      prospects = prospects.filter(p => p.unitId === activeUnitId);
    }

    if (user && this.normalizeRole(user.profile) === 'vendedor' && !this.isAdminUser(user)) {
      prospects = prospects.filter(p => String(p.userId || p.user_id || '') === String(user.id));
    }

    const container = document.getElementById('prospect-list-container');
    const summary = document.getElementById('prospect-status-summary');
    if (!container) return;

    const statusLabels = {
      prospectado: 'Prospectado',
      negociacao: 'Em negociação',
      retornar: 'Retornar depois',
      sem_interesse: 'Sem interesse',
      perdido: 'Perdido',
      convertido: 'Convertido'
    };

    const normalizeStatus = (status) => {
      if (status === 'contato') return 'prospectado';
      if (status === 'ganho') return 'convertido';
      return statusLabels[status] ? status : 'prospectado';
    };

    const counts = { prospectado: 0, negociacao: 0, retornar: 0, sem_interesse: 0, perdido: 0, convertido: 0 };
    prospects.forEach(lead => counts[normalizeStatus(lead.status)]++);

    if (summary) {
      summary.innerHTML = Object.keys(statusLabels).map(key => `
        <span class="prospect-summary-pill ${key}">${statusLabels[key]}: <strong>${counts[key]}</strong></span>
      `).join('');
    }

    if (!prospects.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 28px; text-align:center; color:var(--text-muted);">
          Nenhum lead encontrado para esta unidade/vendedor.
        </div>
      `;
      return;
    }

    const sortedProspects = [...prospects].sort((a, b) => {
      const da = new Date(a.createdAt || a.date || 0).getTime();
      const db = new Date(b.createdAt || b.date || 0).getTime();
      return db - da;
    });

    container.innerHTML = `
      <div class="prospect-list-table-wrap">
        <table class="prospect-list-table">
          <thead>
            <tr>
              <th>Comércio</th>
              <th>Responsável</th>
              <th>Telefone</th>
              <th>CNPJ / CNAE</th>
              <th>Cidade / Local</th>
              <th>Categoria</th>
              <th>Status</th>
              <th>Unidade</th>
              <th>Vendedor</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${sortedProspects.map(lead => {
              const statusKey = normalizeStatus(lead.status);
              const addressParts = [lead.address, lead.neighborhood].filter(Boolean).join(', ');
              const localStr = [addressParts, lead.city].filter(Boolean).join(' - ') || 'Não informada';
              return `
                <tr class="prospect-row" onclick="App.showProspectDetails('${lead.id}')">
                  <td>
                    <strong>${lead.name || '-'}</strong>
                    ${lead.competitor ? `<small>Concorrente: ${lead.competitor}</small>` : ''}
                  </td>
                  <td>${lead.contact || '-'}</td>
                  <td><a href="tel:${lead.phone || ''}" onclick="event.stopPropagation()">${lead.phone || '-'}</a></td>
                  <td>
                    <strong>${lead.cnpj || '-'}</strong>
                    ${lead.cnaeDescricao ? `<small>${lead.cnaePrincipal || ''} - ${lead.cnaeDescricao}</small>` : ''}
                  </td>
                  <td>${localStr}</td>
                  <td><span class="badge-status badge-primary">${lead.category || 'Não definida'}</span></td>
                  <td><span class="prospect-status-badge ${statusKey}">${statusLabels[statusKey]}</span></td>
                  <td>${UI.getUnitName(lead.unitId)}</td>
                  <td>${UI.getUserName(lead.userId)}</td>
                  <td onclick="event.stopPropagation()">
                    <div class="prospect-actions-inline">
                      <select onchange="App.changeProspectStatus('${lead.id}', this.value)">
                        <option value="prospectado" ${statusKey === 'prospectado' ? 'selected' : ''}>Prospectado</option>
                        <option value="negociacao" ${statusKey === 'negociacao' ? 'selected' : ''}>Em Negociação</option>
                        <option value="retornar" ${statusKey === 'retornar' ? 'selected' : ''}>Retornar Depois</option>
                        <option value="sem_interesse" ${statusKey === 'sem_interesse' ? 'selected' : ''}>Sem Interesse</option>
                        <option value="perdido" ${statusKey === 'perdido' ? 'selected' : ''}>Perdido</option>
                        <option value="convertido" ${statusKey === 'convertido' ? 'selected' : ''}>Convertido</option>
                      </select>
                      <button class="kanban-action-btn" style="color: var(--danger);" onclick="App.deleteProspectReal('${lead.id}')">Excluir</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  /**
   * Render registered clients list
   */
  renderClients(clients) {
    const activeUnitId = Store.getActiveUnitId();
    const user = Store.getLoggedUser();

    if (activeUnitId !== 'all') {
      clients = clients.filter(c => c.unitId === activeUnitId);
    }

    if (user && user.profile === 'Vendedor') {
      clients = clients.filter(c => c.userId === user.id);
    }

    const listBody = document.getElementById('clients-table-body');
    if (!listBody) return;

    listBody.innerHTML = clients.map(client => {
      let statusClass = 'badge-success';
      if (client.status === 'Pendente') statusClass = 'badge-warning';
      if (client.status === 'Reprovado') statusClass = 'badge-danger';
      if (client.status === 'Aguardando Ajuste') statusClass = 'badge-primary';

      const statusText = (client.status === 'Reprovado' || client.status === 'Aguardando Ajuste') && client.rejectionReason
        ? `${client.status} (${client.rejectionReason})`
        : client.status;

      return `
        <tr class="mobile-summary-row" onclick="App.showClientDetails('${client.id}')">
          <td data-label="Cliente" style="font-weight: 600;">
            ${client.name}
            <div class="mobile-only-subtext" style="font-size:0.75rem; color:var(--text-muted); font-weight:normal; margin-top:4px;">
              ${client.city || ''} ${client.date ? '• ' + client.date : ''}
            </div>
          </td>
          <td data-label="CNPJ">${client.cnpj || '-'}</td>
          <td data-label="Categoria">${client.category || 'Não definida'}</td>
          <td data-label="Telefone">${client.phone || '-'}</td>
          <td data-label="E-mail">${client.email || '-'}</td>
          <td data-label="Unidade"><span class="badge-status badge-primary" style="font-size:0.7rem; font-weight:500;">${UI.getUnitName(client.unitId)}</span></td>
          <td data-label="Responsável"><span style="font-size:0.75rem; color:var(--text-muted);">${UI.getUserName(client.userId)}</span></td>
          <td data-label="Score">${UI.formatClientScore(client)}</td>
          <td data-label="Status"><span class="badge-status ${statusClass}">${statusText}</span></td>
          <td data-label="Ação"><button class="btn btn-primary btn-sm" style="padding: 2px 8px; font-size: 0.75rem; border-radius: 4px;" onclick="App.showClientDetails('${client.id}')">Ver Ficha</button></td>
        </tr>
      `;
    }).join('');
  },

  /**
   * Render Manager Approvals Queue
   */
  renderApprovals(clients) {
    const activeUnitId = Store.getActiveUnitId();
    const user = Store.getLoggedUser();

    if (activeUnitId !== 'all') {
      clients = clients.filter(c => c.unitId === activeUnitId);
    }

    // Approvals are viewable by Supervisor / Admin, normally see all within allowed scope
    if (user && user.profile === 'Vendedor') {
      clients = clients.filter(c => c.userId === user.id);
    }

    const approvalsBody = document.getElementById('approvals-table-body');
    if (!approvalsBody) return;

    // Mostrar Pendentes + Aguardando Ajuste na fila
    const pending = clients.filter(c => c.status === 'Pendente' || c.status === 'Aguardando Ajuste');

    if (pending.length === 0) {
      approvalsBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Nenhum cadastro pendente de aprovação.</td></tr>`;
      return;
    }

    const isApprover = user && (user.profile === 'Administrador' || user.profile === 'Supervisor');

    approvalsBody.innerHTML = pending.map(client => {
      let statusBadge = client.status === 'Aguardando Ajuste'
        ? `<span class="badge-status badge-primary" style="font-size:0.7rem;">Aguardando Ajuste</span>`
        : `<span class="badge-status badge-warning" style="font-size:0.7rem;">Pendente</span>`;

      const actionsHTML = isApprover ? `
        <button class="btn btn-primary btn-sm" style="padding: 2px 8px; font-size: 0.75rem; margin-right: 4px;" onclick="App.showClientDetails('${client.id}')">Ver Ficha</button>
        <button class="btn btn-success btn-sm" onclick="App.approveClient('${client.id}', 'Aprovado')">Aprovar</button>
        <button class="btn btn-danger btn-sm" onclick="App.approveClient('${client.id}', 'Reprovado')">Reprovar</button>
      ` : `
        <button class="btn btn-primary btn-sm" style="padding: 2px 8px; font-size: 0.75rem; margin-right: 4px;" onclick="App.showClientDetails('${client.id}')">Ver Ficha</button>
        <span style="font-size:0.75rem; color:var(--text-muted);">Aguardando Supervisor</span>
      `;

      return `
        <tr class="mobile-summary-row" onclick="App.showClientDetails('${client.id}')">
          <td data-label="Cliente" style="font-weight: 600;">${client.name}</td>
          <td data-label="CNPJ">${client.cnpj}</td>
          <td data-label="Telefone">${client.phone}</td>
          <td data-label="E-mail">${client.email}</td>
          <td data-label="Unidade"><span class="badge-status badge-primary" style="font-size:0.7rem; font-weight:500;">${UI.getUnitName(client.unitId)}</span></td>
          <td data-label="Vendedor"><span style="font-size:0.75rem; color:var(--text-muted);">${UI.getUserName(client.userId)}</span></td>
          <td data-label="Score">${UI.formatClientScore(client)}</td>
          <td data-label="Status">${statusBadge}</td>
          <td data-label="Ações">${actionsHTML}</td>
        </tr>
      `;
    }).join('');
  },

  /**
   * Render equipment leases list
   */
  renderEquipments(equipments) {
    const activeUnitId = Store.getActiveUnitId();
    const user = Store.getLoggedUser();

    if (activeUnitId !== 'all') {
      equipments = equipments.filter(eq => eq.unitId === activeUnitId);
    }

    if (user && user.profile === 'Vendedor') {
      equipments = equipments.filter(eq => eq.userId === user.id);
    }

    const listBody = document.getElementById('equipments-table-body');
    if (!listBody) return;

    listBody.innerHTML = equipments.map(eq => {
      let statusClass = 'badge-success';
      if (eq.status === 'Em Manutenção') statusClass = 'badge-warning';
      if (eq.status === 'Em Instalação') statusClass = 'badge-primary';

      return `
        <tr class="mobile-summary-row" onclick="App.openPatrimonioTimeline('${eq.serial}')" style="cursor: pointer;">
          <td style="font-weight: 600;">${eq.name}</td>
          <td style="font-family: monospace;">${eq.serial}</td>
          <td>${eq.client}</td>
          <td><span class="badge-status badge-primary" style="font-size:0.7rem; font-weight:500;">${UI.getUnitName(eq.unitId)}</span></td>
          <td><span style="font-size:0.75rem; color:var(--text-muted);">${UI.getUserName(eq.userId)}</span></td>
          <td><span class="badge-status ${statusClass}">${eq.status}</span></td>
        </tr>
      `;
    }).join('');
  },

  /**
   * Render equipment movements list
   */
  renderMovements(movements) {
    const listBody = document.getElementById('movements-table-body');
    if (!listBody) return;
    const user = Store.getLoggedUser();
    const isAdmin = user && user.profile === 'Administrador';
    document.querySelectorAll('.admin-only-movement-delete').forEach(el => el.style.display = isAdmin ? '' : 'none');
    const delBtn = document.getElementById('btn-delete-selected-movements');
    if (delBtn) delBtn.style.display = isAdmin ? 'inline-flex' : 'none';

    if (movements.length === 0) {
      listBody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted);">Nenhuma movimentação registrada.</td></tr>`;
      return;
    }

    listBody.innerHTML = movements.map(mov => {
      let statusClass = 'badge-warning';
      if (mov.status === 'Aprovado') statusClass = 'badge-success';
      if (mov.status === 'Reprovado') statusClass = 'badge-danger';

      const dataStr = mov.created_at ? new Date(mov.created_at).toLocaleDateString('pt-BR') : '-';
      
      const patrimonioStr = mov.tipo_solicitacao === 'Troca' 
        ? `${mov.patrimonio} → ${mov.patrimonio_novo}` 
        : (mov.patrimonio || mov.patrimonio_novo || '-');
        
      const modeloStr = mov.tipo_solicitacao === 'Troca' 
        ? `${mov.modelo} → ${mov.modelo_novo}` 
        : (mov.modelo || mov.modelo_novo || '-');

      return `
        <tr class="mobile-summary-row movement-mobile-compact" onclick="App.showMovementDetails('${mov.id}')">
          <td class="admin-only-movement-delete" style="display:${isAdmin ? '' : 'none'};" onclick="event.stopPropagation()"><input type="checkbox" class="movement-select-checkbox" value="${mov.id}"></td>
          <td data-label="ID" style="font-family:monospace; font-size:0.75rem;">#${mov.id}</td>
          <td data-label="Data">${dataStr}</td>
          <td data-label="Operação"><strong style="text-transform: uppercase; font-size: 0.72rem; color: var(--primary-color);">${mov.tipo_solicitacao}</strong></td>
          <td data-label="Cliente" style="font-weight:600;">${mov.cliente_nome || '-'}</td>
          <td data-label="Cidade">${mov.cliente_cidade || '-'}</td>
          <td data-label="Vendedor">${mov.vendedor_solicitante || '-'}</td>
          <td data-label="Patrimônio" style="font-family:monospace; font-size:0.75rem;">${patrimonioStr}</td>
          <td data-label="Modelo">${modeloStr}</td>
          <td data-label="Status"><span class="badge-status ${statusClass}">${mov.status}</span></td>
          <td data-label="Ações" style="text-align: center;">
            <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 0.75rem;" onclick="event.stopPropagation(); App.showMovementDetails('${mov.id}')">Dossiê</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  /**
   * Render support tickets
   */
  renderTickets(tickets) {
    const activeUnitId = Store.getActiveUnitId();
    const user = Store.getLoggedUser();

    // Toggle opening card visibility based on profile
    const openCard = document.getElementById('ticket-open-card');
    if (openCard) {
      if (user && (user.profile === 'Vendedor' || user.profile === 'Administrador' || user.profile === 'Supervisor')) {
        openCard.style.display = 'block';
      } else {
        openCard.style.display = 'none';
      }
    }

    if (activeUnitId !== 'all') {
      tickets = tickets.filter(t => t.unitId === activeUnitId);
    }

    if (user && user.profile === 'Vendedor') {
      tickets = tickets.filter(t => t.userId === user.id);
    }

    const listBody = document.getElementById('tickets-table-body');
    if (!listBody) return;

    listBody.innerHTML = tickets.map(ticket => {
      let priorityClass = 'badge-primary';
      if (ticket.priority === 'Alta') priorityClass = 'badge-danger';
      if (ticket.priority === 'Média') priorityClass = 'badge-warning';

      let statusClass = 'badge-warning';
      const isStaff = user && (user.profile === 'Administrador' || user.profile === 'Responsável Equipamentos' || user.profile === 'Mecânico');
      let actionBtn = '';
      
      if (ticket.status === 'Aberto') {
        statusClass = 'badge-warning';
        actionBtn = isStaff ? `<button class="btn btn-secondary btn-sm" onclick="App.startTicketService('${ticket.id}')">INICIAR ATENDIMENTO</button>` : `<span style="font-size:0.75rem; color:var(--text-muted);">Aberto</span>`;
      } else if (ticket.status === 'Em Atendimento') {
        statusClass = 'badge-primary';
        actionBtn = isStaff ? `<button class="btn btn-success btn-sm" onclick="App.openFichaTecnica('${ticket.id}')">FICHA TÉCNICA</button>` : `<span style="font-size:0.75rem; color:var(--text-muted);">Em Atendimento</span>`;
      } else if (ticket.status === 'Resolvido') {
        statusClass = 'badge-success';
        actionBtn = `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.openFichaTecnica('${ticket.id}')">VER LAUDO</button>`;
      }

      const partsDisplay = ticket.parts && ticket.parts.length > 0 
        ? ticket.parts.map(p => `<span style="display:inline-block; background:rgba(37,99,235,0.12); color:var(--primary-color); border-radius:10px; padding:1px 7px; font-size:0.68rem; margin:1px;">${p}</span>`).join(' ')
        : '<span style="color:var(--text-muted); font-size:0.75rem;">—</span>';

      const servicesDisplay = ticket.services && ticket.services.length > 0
        ? ticket.services.map(s => `<span style="display:inline-block; background:rgba(16,185,129,0.12); color:var(--success); border-radius:10px; padding:1px 7px; font-size:0.68rem; margin:1px;">${s}</span>`).join(' ')
        : '<span style="color:var(--text-muted); font-size:0.75rem;">—</span>';

      let statusAfterClass = '';
      if (ticket.eqStatusAfter === 'Funcionando normalmente') statusAfterClass = 'color:var(--success);';
      else if (ticket.eqStatusAfter === 'Funcionando parcialmente') statusAfterClass = 'color:var(--warning);';
      else if (ticket.eqStatusAfter === 'Aguardando peça' || ticket.eqStatusAfter === 'Aguardando troca') statusAfterClass = 'color:var(--danger);';

      return `
        <tr class="mobile-summary-row" onclick="App.showTicketDetails('${ticket.id}')">
          <td data-label="Chamado" style="font-family: monospace; font-weight:700;">${ticket.id}</td>
          <td data-label="Data" style="font-size:0.78rem; white-space:nowrap;">${ticket.date || '—'}</td>
          <td data-label="Mecânico" style="font-size:0.78rem; color:var(--text-muted);">${ticket.mechanic || UI.getUserName(ticket.userId) || '—'}</td>
          <td data-label="Equipamento" style="font-family: monospace; font-size:0.8rem;">${ticket.equipmentSerial || '—'}</td>
          <td data-label="Cliente" style="font-size:0.8rem;">${ticket.client || '—'}</td>
          <td data-label="Chamado" class="normal-wrap" style="font-weight: 600; max-width:160px; font-size:0.8rem;">${ticket.title}</td>
          <td data-label="Peças" class="normal-wrap" style="max-width:180px;">${partsDisplay}</td>
          <td data-label="Serviços" class="normal-wrap" style="max-width:180px;">${servicesDisplay}</td>
          <td data-label="Situação" style="font-size:0.78rem; ${statusAfterClass}">${ticket.eqStatusAfter || '—'}</td>
          <td data-label="Prioridade"><span class="badge-status ${priorityClass}">${ticket.priority || '—'}</span></td>
          <td data-label="Status"><span class="badge-status ${statusClass}">${ticket.status}</span></td>
          <td data-label="Ação">${actionBtn}</td>
        </tr>
      `;
    }).join('');
  },


  /**
   * Render travel expenses
   */
  renderExpenses(expenses) {
    this.updateBalanceCards();
    const activeUnitId = Store.getActiveUnitId();
    const user = Store.getLoggedUser();

    if (activeUnitId !== 'all') {
      expenses = expenses.filter(e => e.unitId === activeUnitId);
    }

    if (user && user.profile === 'Vendedor') {
      expenses = expenses.filter(e => e.userId === user.id);
    }

    const listBody = document.getElementById('expenses-table-body');
    if (!listBody) return;

    listBody.innerHTML = expenses.map(exp => {
      let statusClass = 'badge-warning';
      if (exp.status === 'Aprovado') statusClass = 'badge-success';
      if (exp.status === 'Reprovado') statusClass = 'badge-danger';

      // Date formatting: input type="date" yields YYYY-MM-DD, convert to DD/MM/YYYY
      const dateParts = exp.date ? exp.date.split('-') : [];
      const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : (exp.date || '');
      const dateTimeStr = `${formattedDate}${exp.time ? ' / ' + exp.time : ''}`;

      // Finalidade: Outro shows Outro (descreva)
      const finalidadeStr = exp.finalidade === 'Outro' ? `Outro (${exp.descreva || ''})` : (exp.finalidade || '');

      let photosHtml = '';
      if (exp.foto_comprovante) {
        const finalUrl = window.TempPhotosCache?.[exp.foto_comprovante] || exp.foto_comprovante;
        photosHtml += `<img src="${finalUrl}" title="Comprovante" style="width:24px; height:24px; object-fit:cover; border-radius:4px; margin-right:4px; vertical-align:middle; cursor:pointer;" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend','<span style=&quot;color:#f59e0b;font-size:11px;margin-right:4px;&quot;>imagem indisponível</span>');" onclick="event.stopPropagation(); App.showFacadeImage('${finalUrl.replace(/'/g, "\\'")}')">`;
      }
      if (exp.foto_odometro) {
        const finalUrl = window.TempPhotosCache?.[exp.foto_odometro] || exp.foto_odometro;
        photosHtml += `<img src="${finalUrl}" title="Odômetro" style="width:24px; height:24px; object-fit:cover; border-radius:4px; margin-right:4px; vertical-align:middle; cursor:pointer;" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend','<span style=&quot;color:#f59e0b;font-size:11px;margin-right:4px;&quot;>imagem indisponível</span>');" onclick="event.stopPropagation(); App.showFacadeImage('${finalUrl.replace(/'/g, "\\'")}')">`;
      }

      const finalidadeDisplay = `
        <div style="display:flex; align-items:center; gap:6px;">
          ${photosHtml}
          <span>${finalidadeStr}</span>
        </div>
      `;

      // Valor: Outro has no value, displays "-"
      const valorStr = (exp.value !== undefined && exp.value !== null && exp.value !== '') ?
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(exp.value) : '-';

      return `
        <tr class="mobile-summary-row" onclick="App.generateExpenseComprovantePdf('${exp.id}')">
          <td data-label="Data" style="white-space: nowrap;">${dateTimeStr}</td>
          <td data-label="Finalidade" class="normal-wrap">${finalidadeDisplay}</td>
          <td data-label="Operação">${exp.operacao || ''}</td>
          <td data-label="Unidade"><span class="badge-status badge-primary" style="font-size:0.7rem; font-weight:500;">${UI.getUnitName(exp.unitId)}</span></td>
          <td data-label="Responsável"><span style="font-size:0.75rem; color:var(--text-muted);">${UI.getExpenseUserName(exp)}</span></td>
          <td data-label="Valor" style="font-weight: 600;">${valorStr}</td>
          <td data-label="Status"><span class="badge-status ${statusClass}">${exp.status}</span></td>
          <td data-label="Info">
            <button class="btn btn-secondary btn-sm" onclick="App.generateExpenseComprovantePdf('${exp.id}')">
              PDF
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  /**
   * Render credit balance requests
   */
  renderBalances(balances) {
    this.updateBalanceCards();
    const activeUnitId = Store.getActiveUnitId();
    const user = Store.getLoggedUser();

    if (!balances) balances = [];

    // Filter by unit
    if (activeUnitId !== 'all') {
      balances = balances.filter(b => b.unitId === activeUnitId);
    }

    if (user && user.profile === 'Vendedor') {
      balances = balances.filter(b => (b.usuario_id || b.userId) === user.id);
    }

    const renderToTable = (tableId, list) => {
      const listBody = document.getElementById(tableId);
      if (!listBody) return;

      listBody.innerHTML = list.map(req => {
        let statusClass = 'badge-warning';
        if (req.status === 'Aprovada' || req.status === 'Aprovada (não valor total)' || req.status === 'Aprovado') {
          statusClass = 'badge-success';
        } else if (req.status === 'Rejeitada' || req.status === 'Reprovado') {
          statusClass = 'badge-danger';
        }

        const isManager = user && (user.profile === 'Administrador' || user.profile === 'Financeiro' || user.profile === 'Supervisor');
        let actionsHTML = '';

        if (req.status === 'Pendente' && isManager) {
          actionsHTML = `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); App.showDespesaDetails('${req.id}')" style="padding: 4px 8px; font-size: 0.75rem;">Avaliar</button>`;
        } else {
          actionsHTML = `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.showDespesaDetails('${req.id}')" style="padding: 4px 8px; font-size: 0.75rem;">Visualizar</button>`;
        }

        const fmt = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
        
        const safeDateBR = (value) => {
          if (!value) return '-';
          if (typeof window !== 'undefined' && window.CC_safeDateBR) return window.CC_safeDateBR(value);
          const raw = String(value).trim();
          const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:.*?(\d{2}):(\d{2}))?/);
          if (br) return `${br[1]}/${br[2]}/${br[3]}${br[4] ? ' ' + br[4] + ':' + br[5] : ''}`;
          const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
          if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}${iso[4] ? ' ' + iso[4] + ':' + iso[5] : ''}`;
          const d = new Date(raw);
          return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
        };
        let dateStr = safeDateBR(req.created_at || req.createdAt || req.data_solicitacao);

        return `
          <tr class="mobile-summary-row" onclick="App.showDespesaDetails('${req.id}')">
            <td data-label="ID" style="font-family: monospace;">${req.id}</td>
            <td data-label="Data">${dateStr}</td>
            <td data-label="Responsável">${req.solicitante}</td>
            <td data-label="Placa">${req.placa_veiculo || '-'}</td>
            <td data-label="Rota">${req.rota_destino || '-'}</td>
            <td data-label="Hotel/Alimentação" style="text-align: right;">${fmt(req.valor_hotel_alim)}</td>
            <td data-label="Abastecimento" style="text-align: right;">${fmt(req.valor_abastecimento)}</td>
            <td data-label="Total" style="text-align: right; font-weight: 600;">${fmt(req.totalGeral)}</td>
            <td data-label="Status"><span class="badge-status ${statusClass}">${req.status}</span></td>
            <td data-label="Ações">${actionsHTML}</td>
          </tr>
        `;
      }).join('');
    };

    renderToTable('balances-table-body', balances);
    renderToTable('despesas-solicitacoes-table-body', balances);
  },

  /**
   * Build the printable sheet structure inside the target block container
   * @param {string} reportType - Selected report type (e.g. prospects, tickets, expenses, saldo, geral)
   */
  renderPrintSheet(reportType) {
    const config = Store.getCompanyIdentity();
    const activeUnitId = Store.getActiveUnitId();
    const user = Store.getLoggedUser();
    const pdfDocTitle = document.getElementById('pdf-render-doc-title');
    const pdfDocCode = document.getElementById('pdf-render-code');
    const pdfDocDate = document.getElementById('pdf-render-date');
    const pdfMetaContainer = document.getElementById('pdf-metadata-grid');
    const pdfTableContainer = document.getElementById('pdf-table-container');

    // Current Date
    const todayStr = new Date().toLocaleDateString('pt-BR');
    if (pdfDocDate) pdfDocDate.textContent = `Emissão: ${todayStr}`;

    const filterNameStr = activeUnitId !== 'all' ? ` - ${UI.getUnitName(activeUnitId)}` : '';

    if (reportType === 'prospects') {
      pdfDocTitle.textContent = 'Relatório de Prospecção' + filterNameStr;
      pdfDocCode.textContent = 'Cod: RPT-PROSP-02';
      
      // Metadata general details
      let prospects = Store.getProspects();
      if (activeUnitId !== 'all') {
        prospects = prospects.filter(p => p.unitId === activeUnitId);
      }

      // Apply modal filters
      const filters = window.CurrentReportFilters || {};
      if (filters.data_inicio) {
        prospects = prospects.filter(p => !p.date || p.date >= filters.data_inicio);
      }
      if (filters.data_fim) {
        prospects = prospects.filter(p => !p.date || p.date <= filters.data_fim);
      }
      if (filters.vendedor) {
        prospects = prospects.filter(p => p.userId === filters.vendedor);
      }
      if (filters.categoria) {
        prospects = prospects.filter(p => p.category === filters.categoria);
      }
      if (filters.status) {
        prospects = prospects.filter(p => p.status === filters.status);
      }

      if (pdfMetaContainer) {
        pdfMetaContainer.innerHTML = `
          <div class="pdf-grid-item">
            <div class="pdf-grid-label">Total de Leads em Prospecção:</div>
            <div class="pdf-grid-value">${prospects.length} empresas</div>
          </div>
          <div class="pdf-grid-item">
            <div class="pdf-grid-label">Leads Convertidos:</div>
            <div class="pdf-grid-value">${prospects.filter(p => p.status === 'convertido' || p.status === 'ganho').length} convertidos</div>
          </div>
        `;
      }

      // Populate list
      if (pdfTableContainer) {
        pdfTableContainer.innerHTML = `
          <table class="pdf-table">
            <thead>
              <tr>
                <th style="text-align: left;">Comércio</th>
                <th style="text-align: left;">Responsável</th>
                <th style="text-align: left;">Categoria</th>
                <th style="text-align: left;">Cidade/Bairro</th>
                <th style="text-align: left;">Vendedor</th>
                <th style="text-align: left;">Concorrente</th>
                <th style="text-align: right;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${prospects.map(p => `
                <tr>
                  <td style="font-weight: 600;">${p.name}</td>
                  <td>${p.contact}</td>
                  <td>${p.category || 'Não definida'}</td>
                  <td>${[p.city, p.neighborhood].filter(Boolean).join(' / ')}</td>
                  <td>${UI.getUserName(p.userId)}</td>
                  <td>${p.competitor || 'Nenhum'}</td>
                  <td style="text-align: right; text-transform: uppercase;">${p.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    } 
    else if (reportType === 'tickets') {
      pdfDocTitle.textContent = 'Relatório de Assistência Técnica' + filterNameStr;
      pdfDocCode.textContent = 'Cod: RPT-TICKETS-05';

      let tickets = Store.getTickets();
      if (activeUnitId !== 'all') {
        tickets = tickets.filter(t => t.unitId === activeUnitId);
      }
      if (user && user.profile === 'Vendedor') {
        tickets = tickets.filter(t => t.userId === user.id);
      }

      // Apply modal filters
      const filters = window.CurrentReportFilters || {};
      if (filters.data_inicio) {
        tickets = tickets.filter(t => {
          if (!t.date) return true;
          const parts = t.date.split('/');
          if (parts.length !== 3) return true;
          const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          return isoDate >= filters.data_inicio;
        });
      }
      if (filters.data_fim) {
        tickets = tickets.filter(t => {
          if (!t.date) return true;
          const parts = t.date.split('/');
          if (parts.length !== 3) return true;
          const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          return isoDate <= filters.data_fim;
        });
      }
      if (filters.vendedor) {
        tickets = tickets.filter(t => t.userId === filters.vendedor);
      }
      if (filters.status) {
        tickets = tickets.filter(t => t.status === filters.status);
      }
      if (filters.prioridade) {
        tickets = tickets.filter(t => t.priority === filters.prioridade);
      }

      if (pdfMetaContainer) {
        pdfMetaContainer.innerHTML = `
          <div class="pdf-grid-item">
            <div class="pdf-grid-label">Chamados Mecânicos Registrados:</div>
            <div class="pdf-grid-value">${tickets.length} chamados</div>
          </div>
          <div class="pdf-grid-item">
            <div class="pdf-grid-label">Chamados Pendentes / Ativos:</div>
            <div class="pdf-grid-value">${tickets.filter(t => t.status !== 'Resolvido').length} chamados</div>
          </div>
        `;
      }

      if (pdfTableContainer) {
        pdfTableContainer.innerHTML = `
          <table class="pdf-table">
            <thead>
              <tr>
                <th style="text-align: left; width: 10%;">Código</th>
                <th style="text-align: left; width: 30%;">Incidente Reportado</th>
                <th style="text-align: left; width: 18%;">Cliente</th>
                <th style="text-align: left; width: 10%;">Cód. Cliente</th>
                <th style="text-align: left; width: 14%;">Vendedor Cliente</th>
                <th style="text-align: left; width: 12%;">Unidade</th>
                <th style="text-align: left; width: 12%;">Solicitante</th>
                <th style="text-align: left; width: 10%;">Prioridade</th>
                <th style="text-align: right; width: 10%;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tickets.map(t => `
                <tr>
                  <td>${t.id}</td>
                  <td style="font-weight: 600;">${t.title}</td>
                  <td>${t.client}</td>
                  <td>${t.clientCode || t.cliente_codigo || '-'}</td>
                  <td>${t.clientSeller || t.cliente_vendedor || '-'}</td>
                  <td>${UI.getUnitName(t.unitId)}</td>
                  <td>${UI.getUserName(t.userId)}</td>
                  <td>${t.priority}</td>
                  <td style="text-align: right;">${t.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    } 
    else if (reportType === 'expenses') {
      pdfDocTitle.textContent = 'Relatório de Reembolsos' + filterNameStr;
      pdfDocCode.textContent = 'Cod: RPT-REEMB-09';

      let expenses = window.AppExpensesCache || Store.getExpenses();
      if (activeUnitId !== 'all') {
        expenses = expenses.filter(e => e.unitId === activeUnitId);
      }
      if (user && user.profile === 'Vendedor') {
        expenses = expenses.filter(e => e.userId === user.id);
      }

      // Apply modal filters
      const filters = window.CurrentReportFilters || {};
      if (filters.data_inicio) {
        expenses = expenses.filter(e => !e.date || e.date >= filters.data_inicio);
      }
      if (filters.data_fim) {
        expenses = expenses.filter(e => !e.date || e.date <= filters.data_fim);
      }
      if (filters.vendedor) {
        expenses = expenses.filter(e => e.userId === filters.vendedor);
      }
      if (filters.status) {
        expenses = expenses.filter(e => e.status === filters.status);
      }

      const total = expenses.reduce((acc, curr) => acc + UI.safeNumber(curr.value), 0);
      const approved = expenses.filter(e => e.status === 'Aprovado').reduce((acc, curr) => acc + UI.safeNumber(curr.value), 0);

      if (pdfMetaContainer) {
        pdfMetaContainer.innerHTML = `
          <div class="pdf-grid-item">
            <div class="pdf-grid-label">Total Consolidado de Despesas:</div>
            <div class="pdf-grid-value">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}</div>
          </div>
          <div class="pdf-grid-item">
            <div class="pdf-grid-label">Total Reembolsado (Aprovado):</div>
            <div class="pdf-grid-value">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(approved)}</div>
          </div>
        `;
      }

      if (pdfTableContainer) {
        pdfTableContainer.innerHTML = `
          <table class="pdf-table">
            <thead>
              <tr>
                <th style="text-align: left;">Data</th>
                <th style="text-align: left;">Descrição da Despesa</th>
                <th style="text-align: left;">Unidade</th>
                <th style="text-align: left;">Vendedor</th>
                <th style="text-align: right;">Valor</th>
                <th style="text-align: right;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${expenses.map(e => `
                <tr>
                  <td>${e.date}</td>
                  <td>${e.description}</td>
                  <td>${UI.getUnitName(e.unitId)}</td>
                  <td>${UI.getUserName(e.userId)}</td>
                  <td style="text-align: right; font-weight: 600;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(e.value)}</td>
                  <td style="text-align: right;">${e.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    }
    else if (reportType === 'movements') {
      pdfDocTitle.textContent = 'Relatório de Movimentação de Equipamentos' + filterNameStr;
      pdfDocCode.textContent = 'Cod: RPT-MOV-10';

      const movements = window.CurrentFilteredMovements || [];

      if (pdfMetaContainer) {
        pdfMetaContainer.innerHTML = `
          <div class="pdf-grid-item">
            <div class="pdf-grid-label">Total de Movimentações:</div>
            <div class="pdf-grid-value">${movements.length} registros</div>
          </div>
          <div class="pdf-grid-item">
            <div class="pdf-grid-label">Pendentes de Avaliação:</div>
            <div class="pdf-grid-value">${movements.filter(m => m.status === 'Pendente').length} pendentes</div>
          </div>
        `;
      }

      if (pdfTableContainer) {
        pdfTableContainer.innerHTML = `
          <table class="pdf-table">
            <thead>
              <tr>
                <th style="text-align: left;">ID</th>
                <th style="text-align: left;">Data</th>
                <th style="text-align: left;">Operação</th>
                <th style="text-align: left;">Cód.</th>
                <th style="text-align: left;">Cliente</th>
                <th style="text-align: left;">Cidade</th>
                <th style="text-align: left;">Endereço</th>
                <th style="text-align: left;">Vendedor Cliente</th>
                <th style="text-align: left;">Solicitante</th>
                <th style="text-align: left;">Patrimônio</th>
                <th style="text-align: left;">Modelo</th>
                <th style="text-align: right;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${movements.map(m => {
                const dataStr = m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR') : '-';
                const patrimonioStr = m.tipo_solicitacao === 'Troca' 
                  ? `${m.patrimonio} -> ${m.patrimonio_novo}` 
                  : (m.patrimonio || m.patrimonio_novo || '-');
                const modeloStr = m.tipo_solicitacao === 'Troca' 
                  ? `${m.modelo} -> ${m.modelo_novo}` 
                  : (m.modelo || m.modelo_novo || '-');
                return `
                  <tr>
                    <td>#${m.id}</td>
                    <td>${dataStr}</td>
                    <td style="text-transform: uppercase; font-weight: bold;">${m.tipo_solicitacao}</td>
                    <td>${m.cliente_codigo || '-'}</td>
                    <td>${m.cliente_nome}</td>
                    <td>${m.cliente_cidade}</td>
                    <td>${m.cliente_endereco || '-'}</td>
                    <td>${m.cliente_vendedor || '-'}</td>
                    <td>${m.vendedor_solicitante}</td>
                    <td>${patrimonioStr}</td>
                    <td>${modeloStr}</td>
                    <td style="text-align: right;">${m.status}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      }
    }
  },

  /**
   * Render Units management panel list and statistics
   */
  renderUnits() {
    const units = Store.getUnits();
    const prospects = Store.getProspects();
    const clients = Store.getClients();
    const tickets = Store.getTickets();
    const movements = Store.getMovements ? Store.getMovements() : [];
    const listBody = document.getElementById('units-table-body');
    if (!listBody) return;

    listBody.innerHTML = units.map(unit => {
      const unitProspects = prospects.filter(p => p.unitId === unit.id).length;
      const unitClients = clients.filter(c => c.unitId === unit.id && c.status === 'Aprovado').length;
      const unitTickets = tickets.filter(t => t.unitId === unit.id && (t.status === 'Aberto' || t.status === 'Em Atendimento')).length;
      const unitMovements = movements.filter(m => String(m.unitId || m.unit_id || '') === String(unit.id) || String(m.empresa || '').toLowerCase() === String(unit.name || '').toLowerCase()).length;

      return `
        <tr>
          <td style="font-family: monospace;">${unit.id}</td>
          <td style="font-weight: 600;">${unit.name}</td>
          <td style="text-align: center;">${unitProspects}</td>
          <td style="text-align: center;">${unitClients}</td>
          <td style="text-align: center;">
            <span class="badge-status ${unitTickets > 0 ? 'badge-danger' : 'badge-success'}">
              ${unitTickets} ativos
            </span>
          </td>
          <td style="text-align: center;">${unitMovements}</td>
          <td style="text-align: center;"><button class="btn btn-secondary btn-sm" onclick="App.editUnit('${unit.id}')">Editar</button></td>
        </tr>
      `;
    }).join('');
  },

  async renderUsers(usersData, bypassRender) {
    const listBody = document.getElementById('users-table-body');
    if (!listBody) return;

    try {
      const loggedUser = Store.getLoggedUser() || {};
      const loggedPerms = loggedUser.permissions || [];
      const canManageUsers = loggedUser.profile === 'Administrador' || loggedPerms.includes('Administrador') || loggedPerms.includes('Usuários');
      const users = usersData || await App.fetchFromApi('/api/usuarios');
      try {
        Store.saveUsers(users);
      } catch (e) {
        console.error('Erro ao sincronizar cache de usuários:', e);
      }

      if (bypassRender && !usersData) {
        return users;
      }

      listBody.innerHTML = users.map(u => {
        const statusClass = u.status === 'LIBERADO' ? 'badge-success' : (u.status === 'INATIVO' ? 'badge-danger' : 'badge-warning');
        const canDelete = canManageUsers && String(loggedUser.id) !== String(u.id);
        return `
          <tr class="mobile-summary-row" onclick="App.openUserPermissionsModal('${u.id}')">
            <td style="font-weight: 600; cursor: pointer;">${u.name}</td>
            <td>${u.username || ''}</td>
            <td style="cursor: pointer;"><span class="badge-status badge-primary" style="font-size:0.7rem; font-weight:500;">${u.profile}</span></td>
            <td>${UI.getUnitName(u.unitId)}</td>
            <td><span class="badge-status ${statusClass}" style="font-size:0.7rem; font-weight:500;">${u.status || ''}</span></td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); App.openUserPermissionsModal('${u.id}')" style="padding: 2px 6px; font-size: 0.7rem; margin: 0 4px 0 0;">Permissões</button>
              ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.deleteUser('${u.id}', event)" style="padding: 2px 6px; font-size: 0.7rem; margin: 0;">Excluir</button>` : ''}
            </td>
          </tr>
        `;
      }).join('');
      return users;
    } catch (err) {
      console.error('Error rendering users:', err);
      listBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Erro ao carregar usuários: ${err.message}</td></tr>`;
    }
  },

  /**
   * Dynamically populate all unit select fields and seller dropdowns in forms
   */
  async populateUnitDropdowns() {
    const units = Store.getUnits();
    const loggedUser = Store.getLoggedUser();
    const activeUnitId = Store.getActiveUnitId();
    const isLoggedAdmin = loggedUser && (loggedUser.profile === 'Administrador' || (loggedUser.permissions || []).includes('Administrador'));

    const dropdownIds = ['prosp-unit', 'client-unit', 'ticket-unit', 'exp-unit', 'bal-unit', 'user-unit', 'ticket-open-unit', 'perm-user-unit'];

    dropdownIds.forEach(id => {
      const select = document.getElementById(id);
      if (select) {
        select.innerHTML = '<option value="" selected disabled>Selecione...</option>' + 
          units.map(u => `<option value="${u.id}">${u.name}</option>`).join('');

        // If common user, restrict and preselect their unit (unless it is a user management field)
        if (loggedUser && !isLoggedAdmin && loggedUser.unitId !== 'all' && id !== 'perm-user-unit' && id !== 'user-unit') {
          select.value = loggedUser.unitId;
          select.disabled = true;
        } else {
          select.disabled = false;
        }
      }
    });

    // Also add 'all' option for unit selection in user forms
    const userUnitSelect = document.getElementById('user-unit');
    if (userUnitSelect) {
      userUnitSelect.innerHTML = '<option value="all">Todas as Unidades (Geral)</option>' + userUnitSelect.innerHTML;
    }
    const permUserUnitSelect = document.getElementById('perm-user-unit');
    if (permUserUnitSelect) {
      permUserUnitSelect.innerHTML = '<option value="all">Todas as Unidades (Geral)</option>' + permUserUnitSelect.innerHTML;
    }

    // Populate global unit filter in header
    const globalSelector = document.getElementById('global-unit-selector');
    if (globalSelector) {
      globalSelector.innerHTML = '<option value="all">Todas as Unidades</option>' +
        units.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
      globalSelector.value = activeUnitId;
    }

    // Populate seller/representative dropdowns in forms from API
    try {
      const users = await App.fetchFromApi('/api/usuarios').catch(() => []);
      const sellers = users.filter(u => {
        // Must be active / liberated
        if (u.status !== 'LIBERADO') return false;

        // Must belong to the correct company
        if (loggedUser && u.empresa_id !== loggedUser.empresa_id) return false;

        // Must belong to correct unit if unit filter is active (or seller has access to all units)
        if (activeUnitId !== 'all' && u.unitId !== 'all' && u.unitId !== activeUnitId) return false;

        const isVendedor = u.profile === 'Vendedor';
        const perms = u.permissions || [];
        const hasSolicitacaoPerm = perms.includes('Solicitação de Saldo') || perms.includes('Despesas') || perms.includes('Financeiro');
        const isSupervisorWithPerm = u.profile === 'Supervisor' && hasSolicitacaoPerm;
        const anyUserWithPerm = hasSolicitacaoPerm;

        return isVendedor || isSupervisorWithPerm || anyUserWithPerm;
      });

      const sellerSelects = ['prosp-seller', 'client-seller', 'ticket-seller', 'exp-seller', 'bal-seller', 'ticket-open-seller'];
      sellerSelects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
          select.innerHTML = '<option value="" selected disabled>Selecione...</option>' + 
            sellers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
      });
    } catch (err) {
      console.error('Erro ao popular dropdown de vendedores:', err);
    }
  },

  /**
   * Dynamically populate the client dropdown in the movement form
   */
  populateMovementClientsDropdown() {
    const user = Store.getLoggedUser();
    let clients = Store.getClients();

    const activeUnitId = Store.getActiveUnitId();
    if (activeUnitId !== 'all') {
      clients = clients.filter(c => c.unitId === activeUnitId);
    }

    if (user && user.profile === 'Vendedor') {
      clients = clients.filter(c => c.userId === user.id);
    }

    const select = document.getElementById('mov-client-id');
    if (select) {
      const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name));
      select.innerHTML = '<option value="" selected disabled>Selecione...</option>' + 
        sortedClients.map(c => `<option value="${c.id}">${c.name} (${c.id})</option>`).join('');
    }
  },

  populateMovementCompanyDropdown() {
    const select = document.getElementById('mov-empresa');
    if (!select) return;
    const user = Store.getLoggedUser() || {};
    let units = Store.getUnits() || [];
    if (user.profile !== 'Administrador' && user.unitId && user.unitId !== 'all') {
      units = units.filter(u => String(u.id) === String(user.unitId));
    }
    select.innerHTML = '<option value="" selected disabled>Selecione...</option>' + units.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    if (units.length === 1) {
      select.value = units[0].id;
      select.disabled = user.profile !== 'Administrador';
    } else {
      select.disabled = false;
    }
  },

  /**
   * Dynamically populate all settings dropdown lists in operational forms
   */
  populateConfigDropdowns() {
    const clientCategories = Store.getClientCategories();
    const rejectionReasons = Store.getRejectionReasons();
    const prospectLossReasons = Store.getProspectLossReasons();
    const expenseCategories = Store.getExpenseCategories();
    const equipmentTypes = Store.getEquipmentTypes();

    const clientCategorySelect = document.getElementById('client-category');
    if (clientCategorySelect) {
      clientCategorySelect.innerHTML = '<option value="" selected disabled>Selecione...</option>' + 
        clientCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }

    const prospCategorySelect = document.getElementById('prosp-category');
    if (prospCategorySelect) {
      prospCategorySelect.innerHTML = '<option value="" selected disabled>Selecione...</option>' + 
        clientCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }

    const expCategorySelect = document.getElementById('exp-category');
    if (expCategorySelect) {
      expCategorySelect.innerHTML = '<option value="" selected disabled>Selecione...</option>' + 
        expenseCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }

    const modalLossSelect = document.getElementById('modal-loss-select');
    if (modalLossSelect) {
      modalLossSelect.innerHTML = '<option value="" selected disabled>Selecione...</option>' + 
        prospectLossReasons.map(reason => `<option value="${reason}">${reason}</option>`).join('');
    }

    const modalRejectionSelect = document.getElementById('modal-rejection-select');
    if (modalRejectionSelect) {
      modalRejectionSelect.innerHTML = '<option value="" selected disabled>Selecione...</option>' + 
        rejectionReasons.map(reason => `<option value="${reason}">${reason}</option>`).join('');
    }

    const clientRequestedEqType = document.getElementById('client-requested-eq-type');
    if (clientRequestedEqType) {
      clientRequestedEqType.innerHTML = '<option value="" selected disabled>Selecione...</option>' + 
        equipmentTypes.map(type => `<option value="${typeof type === 'object' ? (type.name || type.label || type.value) : type}">${typeof type === 'object' ? (type.name || type.label || type.value) : type}</option>`).join('');
    }

    const clientSendableEqType = document.getElementById('client-sendable-eq-type');
    if (clientSendableEqType) {
      const labelType = (type) => {
        const name = typeof type === 'object' ? (type.name || type.label || type.value || '') : String(type || '');
        const pattern = typeof type === 'object' ? (type.pattern || type.padrao || type.standard || '') : '';
        return pattern ? `${String(pattern).toUpperCase()} – ${name}` : name;
      };
      clientSendableEqType.innerHTML = '<option value="" selected disabled>Selecione...</option>' + 
        equipmentTypes.map(type => `<option value="${labelType(type)}">${labelType(type)}</option>`).join('');
    }

    const movModeloAdicao = document.getElementById('mov-modelo-adicao');
    if (movModeloAdicao && movModeloAdicao.tagName === 'SELECT') {
      movModeloAdicao.innerHTML = '<option value="" selected disabled>Selecione o modelo cadastrado...</option>' + 
        equipmentTypes.map(type => `<option value="${type}">${type}</option>`).join('');
    }

    const ticketOpenEqType = document.getElementById('ticket-open-eq-type');
    if (ticketOpenEqType) {
      ticketOpenEqType.innerHTML = '<option value="" selected disabled>Selecione...</option>' + 
        equipmentTypes.map(type => `<option value="${typeof type === 'object' ? (type.name || type.label || type.value) : type}">${typeof type === 'object' ? (type.name || type.label || type.value) : type}</option>`).join('');
    }
  },

  /**
   * Render lists in the General Settings view and fill email configuration fields
   */
  renderConfigSettings() {
    const clientCategories = Store.getClientCategories();
    const equipmentTypes = Store.getEquipmentTypes();
    const rejectionReasons = Store.getRejectionReasons();
    const prospectLossReasons = Store.getProspectLossReasons();
    const expenseCategories = Store.getExpenseCategories();
    const notificationEmails = Store.getNotificationEmails();

    const renderList = (elementId, items, listKey) => {
      const container = document.getElementById(elementId);
      if (!container) return;

      if (items.length === 0) {
        container.innerHTML = `<li style="padding: 6px 10px; color: var(--text-muted); font-size: 0.8rem; text-align: center; background-color: var(--bg-input); border: 1px solid var(--border-color); border-radius:4px;">Nenhum item cadastrado.</li>`;
        return;
      }

      container.innerHTML = items.map(item => {
        const raw = (item && typeof item === 'object') ? (item.name || item.nome || item.label || item.value || item.categoria || item.descricao || item.produto || item.id || '') : item;
        const text = String(raw || '').trim();
        const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeArg = text.replace(/'/g, "\\'");
        return `
        <li style="display:flex; justify-content:space-between; align-items:center; padding: 6px 10px; background-color: var(--bg-input); border: 1px solid var(--border-color); border-radius: 4px; font-size: 0.85rem;">
          <span>${safeText || 'Sem nome'}</span>
          <button type="button" class="btn btn-danger btn-sm" style="padding: 2px 6px; font-size: 0.7rem; border-radius: 3px;" onclick="App.deleteConfigItem('${listKey}', '${safeArg}')">Excluir</button>
        </li>`;
      }).join('');
    };

    renderList('config-client-categories-list', clientCategories, 'client_categories');
    renderList('config-eq-types-list', equipmentTypes, 'equipment_types');
    renderList('config-exp-categories-list', expenseCategories, 'expense_categories');
    renderList('config-rejection-reasons-list', rejectionReasons, 'rejection_reasons');
    renderList('config-loss-reasons-list', prospectLossReasons, 'prospect_loss_reasons');

    const emailsInput = document.getElementById('config-emails-input');
    if (emailsInput) {
      emailsInput.value = notificationEmails.join(', ');
    }
  },

  /**
   * Populate and display the comprehensive commercial client profile details modal
   */
  showClientDetails(client) {
    if (window.App) window.App.currentClientFicha = client;
    const modal = document.getElementById('modal-client-details');
    const content = document.getElementById('client-details-content');
    if (!modal || !content) return;

    // Helper to format currency
    const formatCurrency = (val) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    };

    // Helper to resolve photos without placeholder images
    const resolvePhotoUrl = (url) => {
      if (!url) return '';
      return (window.TempPhotosCache && window.TempPhotosCache[url]) || url;
    };

    const photoFachadaUrl = resolvePhotoUrl(client.photoFachada, 'fachada');
    const photoInterna01Url = resolvePhotoUrl(client.photoInterna01, 'interna01');
    const photoInterna02Url = resolvePhotoUrl(client.photoInterna02, 'interna02');
    const photoInterna03Url = resolvePhotoUrl(client.photoInterna03, 'interna03');
    const photoRua01Url = resolvePhotoUrl(client.photoRua01, 'rua01');
    const photoRua02Url = resolvePhotoUrl(client.photoRua02, 'rua02');
    const photoCnpjUrl = resolvePhotoUrl(client.photoCnpj, 'cnpj');

    const renderPhotoCard = (label, url) => {
      const realUrl = url ? ((window.TempPhotosCache && window.TempPhotosCache[url]) || url) : '';
      if (!realUrl) {
        return `<div style="display:flex;flex-direction:column;align-items:center;border:1px solid var(--border-color);padding:8px;border-radius:6px;background:rgba(0,0,0,0.2);"><span style="font-size:0.68rem;font-weight:bold;margin-bottom:6px;color:var(--text-muted);">${label}</span><div style="height:110px;width:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:4px;font-size:0.75rem;">Imagem não enviada</div></div>`;
      }
      const safeUrl = String(realUrl).replace(/'/g, "\\'");
      const safeTitle = String(url || '').replace(/"/g, '&quot;');
      return `<div style="display:flex;flex-direction:column;align-items:center;border:1px solid var(--border-color);padding:8px;border-radius:6px;background:rgba(0,0,0,0.2);"><span style="font-size:0.68rem;font-weight:bold;margin-bottom:6px;color:var(--text-muted);">${label}</span><img src="${realUrl}" style="width:100%;height:110px;object-fit:cover;border-radius:4px;cursor:pointer;" onclick="App.showFacadeImage('${safeUrl}')" onerror="this.replaceWith(Object.assign(document.createElement('div'),{textContent:'Imagem não enviada',style:'height:110px;width:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:4px;font-size:0.75rem;' }))"><span style="font-size:0.58rem;color:var(--text-muted);text-align:center;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;" title="${safeTitle}">${url || ''}</span></div>`;
    };

    let statusBadgeClass = 'badge-success';
    if (client.status === 'Pendente') statusBadgeClass = 'badge-warning';
    if (client.status === 'Reprovado') statusBadgeClass = 'badge-danger';

    // Build products list
    const productsList = client.products && client.products.length > 0 
      ? client.products.map(p => `<span class="badge-status badge-primary" style="margin-right: 4px; display: inline-block; font-size: 0.65rem;">${p}</span>`).join('')
      : '<span class="badge-status badge-secondary" style="font-size: 0.65rem;">Nenhum selecionado</span>';

    content.innerHTML = `
      <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; margin-bottom: 20px; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); gap: 10px;">
        <div>
          <span style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: bold;">ID do Registro</span>
          <h4 style="margin: 0; font-family: monospace; font-size: 1rem; color: var(--text-main);">${client.id}</h4>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: bold; display: block; margin-bottom: 4px;">Status de Aprovação</span>
          <span class="badge-status ${statusBadgeClass}" style="font-size: 0.8rem; padding: 4px 10px;">${client.status}${client.rejectionReason ? ` - Motivo: ${client.rejectionReason}` : ''}</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; margin-bottom: 16px;">
        <!-- Column 1: Identification -->
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
          <h4 style="color: var(--primary-color); border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-top: 0; margin-bottom: 10px; font-size: 0.9rem;">1. Identificação Comercial</h4>
          <table style="width: 100%; font-size: 0.78rem; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600; width: 40%;">Nome Fantasia:</td><td style="padding: 5px 0; color: var(--text-main); font-weight: bold;">${client.name || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Razão Social:</td><td style="padding: 5px 0; color: var(--text-main);">${client.companyName || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">CNPJ:</td><td style="padding: 5px 0; color: var(--text-main); font-family: monospace;">${client.cnpj || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Inscrição Estadual:</td><td style="padding: 5px 0; color: var(--text-main); font-family: monospace;">${client.ie || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Categoria:</td><td style="padding: 5px 0; color: var(--text-main);">${client.category || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Telefone:</td><td style="padding: 5px 0; color: var(--text-main);">${client.phone || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">E-mail:</td><td style="padding: 5px 0; color: var(--text-main);">${client.email || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Vendedor:</td><td style="padding: 5px 0; color: var(--text-main);">${UI.getUserName(client.userId)}</td></tr>
            <tr><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Unidade:</td><td style="padding: 5px 0; color: var(--text-main);">${UI.getUnitName(client.unitId)}</td></tr>
          </table>
        </div>

        <!-- Column 2: Location & Logistics -->
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
          <h4 style="color: var(--primary-color); border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-top: 0; margin-bottom: 10px; font-size: 0.9rem;">2. Logística & Localização</h4>
          <table style="width: 100%; font-size: 0.78rem; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600; width: 45%;">Cidade:</td><td style="padding: 5px 0; color: var(--text-main);">${client.city || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Localização do Comércio:</td><td style="padding: 5px 0; color: var(--text-main);">${client.locationType || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Pavimentação da Rua:</td><td style="padding: 5px 0; color: var(--text-main);">${client.pavementType || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Horário de Recebimento:</td><td style="padding: 5px 0; color: var(--text-main);">${client.deliverySchedule || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Primeiro Pedido:</td><td style="padding: 5px 0; color: var(--text-main);">${client.firstOrderPayment || '---'}</td></tr>
            ${client.firstOrderPayment === 'Boleto' ? `<tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--danger); font-weight: 600;">Motivo não ser À Vista:</td><td style="padding: 5px 0; color: var(--text-main); font-weight: bold;">${client.firstOrderReason || 'Não informado'}</td></tr>` : ''}
            <tr><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Forma de Recompra:</td><td style="padding: 5px 0; color: var(--text-main);">${client.repurchasePayment || '---'}</td></tr>
          </table>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; margin-bottom: 16px;">
        <!-- Column 3: Market Analysis -->
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
          <h4 style="color: var(--primary-color); border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-top: 0; margin-bottom: 10px; font-size: 0.9rem;">3. Mapeamento de Mercado</h4>
          <table style="width: 100%; font-size: 0.78rem; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600; width: 50%;">Amaretto Próximo:</td><td style="padding: 5px 0; color: var(--text-main);">${client.nearbyAmaretto || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Concorrência Próxima:</td><td style="padding: 5px 0; color: var(--text-main);">${client.nearbyCompetitor || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Já trabalha com sorvetes:</td><td style="padding: 5px 0; color: var(--text-main);">${client.iceCreamExperience || '---'}</td></tr>
            <tr><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Trabalhará com ambas as marcas:</td><td style="padding: 5px 0; color: var(--text-main);">${client.dualBrandPreference || '---'}</td></tr>
          </table>
        </div>

        <!-- Column 4: Equipment & Planning -->
        <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
          <h4 style="color: var(--primary-color); border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-top: 0; margin-bottom: 10px; font-size: 0.9rem;">4. Equipamentos & Financeiro</h4>
          <table style="width: 100%; font-size: 0.78rem; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600; width: 50%;">Qtd Equipamentos:</td><td style="padding: 5px 0; color: var(--text-main);">${client.equipmentQty || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Equipamento Solicitado:</td><td style="padding: 5px 0; color: var(--text-main);">${client.requestedEqType || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Padrão que pode enviar:</td><td style="padding: 5px 0; color: var(--text-main);">${client.sendableEqType || '---'}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Produtos de interesse:</td><td style="padding: 5px 0; color: var(--text-main);">${productsList}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Valor 1ª Compra:</td><td style="padding: 5px 0; color: var(--text-main); font-weight: bold; color: var(--success);">${formatCurrency(client.firstOrderValue)}</td></tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Média Prevista (Mensal):</td><td style="padding: 5px 0; color: var(--text-main); font-weight: bold;">${formatCurrency(client.predictedAverage)}</td></tr>
            <tr><td style="padding: 5px 0; color: var(--text-muted); font-weight: 600;">Bonificação:</td><td style="padding: 5px 0; color: var(--text-main);">${client.hasBonus || 'Não'}</td></tr>
          </table>
        </div>
      </div>

      <!-- Seller analysis section -->
      <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
        <h4 style="color: var(--primary-color); border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-top: 0; margin-bottom: 8px; font-size: 0.9rem;">5. Análise do Vendedor sobre Localização e Perfil</h4>
        <p style="margin: 0; font-size: 0.78rem; line-height: 1.5; color: var(--text-main); font-style: italic; white-space: pre-wrap;">"${client.sellerAnalysis || 'Nenhuma análise inserida.'}"</p>
      </div>

      <!-- Photos Gallery Section -->
      <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
        <h4 style="color: var(--primary-color); border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-top: 0; margin-bottom: 12px; font-size: 0.9rem;">6. Fotos e Comprovações do Cadastro (Salvos como Links)</h4>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
          ${renderPhotoCard('Fachada', client.photoFachada)}
          ${renderPhotoCard('Interna 01', client.photoInterna01)}
          ${renderPhotoCard('Interna 02', client.photoInterna02)}
          ${renderPhotoCard('Interna 03', client.photoInterna03)}
          ${renderPhotoCard('Externa Rua 01', client.photoRua01)}
          ${renderPhotoCard('Externa Rua 02', client.photoRua02)}
          ${renderPhotoCard('Foto CNPJ', client.photoCnpj)}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;border-top:1px solid var(--border-color);padding-top:14px;">
        <button class="btn btn-primary" type="button" onclick="App.generateClientPdfFromCurrent()">Gerar PDF</button>
        <button class="btn btn-secondary" type="button" onclick="document.getElementById('modal-client-details').style.display='none'">Fechar Ficha</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  /**
   * Render Exchange Simulator categories buttons
   */
  renderExchangeCategories(categories) {
    const grid = document.getElementById('exchange-categories-grid');
    if (!grid) return;
    grid.innerHTML = categories.map(cat => {
      return `
        <button class="exchange-category-btn" onclick="App.selectExchangeCategory('${String(cat || '').replace(/'/g, "\\'")}')" type="button">
          ${String(cat || 'Sem categoria')}
        </button>
      `;
    }).join('');
  },

  /**
   * Render Exchange Simulator products in active category
   */
  renderExchangeProducts(products) {
    const list = document.getElementById('exchange-products-list');
    if (!list) return;
    if (!products || products.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhum produto cadastrado nesta categoria.</div>`;
      return;
    }
    const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    list.innerHTML = products.map(p => {
      // Escape HTML entities to avoid breaking JSON string
      const escapedProduct = JSON.stringify(p).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      return `
        <div class="exchange-product-item-card" onclick="App.openExchangeItemModal(${escapedProduct})">
          <div class="exchange-product-item-header-row">
            <strong style="color: var(--primary-color);">${p.codigo}</strong> - <span style="font-weight: 600;">${p.produto}</span>
          </div>
          <div class="exchange-product-card-details">
            <div>Caixa: ${money(p.preco_total)} | Qtd: ${p.quantidade_na_caixa}</div>
            <div>Unitário: ${money(p.valor_unitario)}</div>
          </div>
          <div class="exchange-product-item-action-row" onclick="event.stopPropagation();">
            <button class="exchange-product-select-btn" type="button" onclick="App.openExchangeItemModal(${escapedProduct})">Selecionar</button>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Render active exchange cart items
   */
  renderExchangeCart(items) {
    const tbody = document.getElementById('exchange-cart-tbody');
    const totalLabel = document.getElementById('exchange-cart-total-label');
    const totalLabelMobile = document.getElementById('exchange-cart-total-label-mobile');
    const stickyTotalVal = document.getElementById('exchange-sticky-total-val');
    const mobileList = document.getElementById('exchange-cart-mobile-list');
    
    const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    
    let totalGeral = 0;
    
    // Render Desktop View (Table Body)
    if (tbody) {
      if (!items || items.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum produto adicionado à troca ainda.</td>
          </tr>
        `;
      } else {
        tbody.innerHTML = items.map((it, idx) => {
          totalGeral += Number(it.total_item);
          return `
            <tr style="cursor: pointer;" onclick="App.openEditExchangeItemModal(${idx})">
              <td><strong>${it.codigo}</strong></td>
              <td>${it.produto}</td>
              <td><span class="badge-status ${it.tipo === 'caixa' ? 'badge-success' : 'badge-primary'}" style="text-transform: uppercase;">${it.tipo}</span></td>
              <td style="text-align: center;">${it.quantidade} ${it.tipo === 'caixa' ? 'CX' : 'UN'}</td>
              <td style="text-align: right;">${money(it.valor_base)}</td>
              <td style="text-align: right; font-weight: bold; color: var(--primary-color);">${money(it.total_item)}</td>
              <td style="text-align: center;" onclick="event.stopPropagation();">
                <button class="btn btn-danger btn-sm" type="button" onclick="App.removeExchangeCartItem(${idx})">Remover</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    } else {
      totalGeral = items ? items.reduce((acc, curr) => acc + Number(curr.total_item), 0) : 0;
    }
    
    // Render Mobile View (List of inline rows)
    if (mobileList) {
      if (!items || items.length === 0) {
        mobileList.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.85rem;">
            Nenhum produto adicionado à troca ainda.
          </div>
        `;
      } else {
        mobileList.innerHTML = items.map((it, idx) => {
          if (tbody === null) {
            totalGeral += Number(it.total_item);
          }
          return `
            <div class="exchange-mobile-cart-item" style="cursor: pointer;" onclick="App.openEditExchangeItemModal(${idx})">
              <div class="exchange-mobile-item-main">
                <span class="exchange-mobile-item-code">${it.codigo}</span>
                <span class="exchange-mobile-item-name">${it.produto}</span>
              </div>
              <div class="exchange-mobile-item-details">
                <span class="badge-status ${it.tipo === 'caixa' ? 'badge-success' : 'badge-primary'}" style="font-size: 0.65rem; padding: 2px 6px; text-transform: uppercase; margin: 0;">
                  ${it.tipo === 'caixa' ? 'CX' : 'FRAC'}
                </span>
                <span class="exchange-mobile-item-qty">${it.quantidade} ${it.tipo === 'caixa' ? 'CX' : 'UN'}</span>
                <span class="exchange-mobile-item-total">${money(it.total_item)}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }
    
    // Update all Total labels
    if (totalLabel) totalLabel.textContent = money(totalGeral);
    if (totalLabelMobile) totalLabelMobile.textContent = money(totalGeral);
    if (stickyTotalVal) stickyTotalVal.textContent = money(totalGeral);
    
    // Toggle Mobile Sticky Footer Visibility programmatically
    const stickyFooter = document.getElementById('exchange-mobile-sticky-footer');
    const workspace = document.getElementById('exchange-workspace');
    
    const isClientActive = window.CurrentExchange && window.CurrentExchange.clientCode;
    const hasItems = items && items.length > 0;
    const isWorkspaceVisible = workspace && !workspace.classList.contains('hidden');
    
    if (stickyFooter) {
      if (hasItems && isClientActive && isWorkspaceVisible) {
        stickyFooter.style.display = 'block';
        if (workspace) workspace.classList.add('with-sticky-footer');
      } else {
        stickyFooter.style.display = 'none';
        if (workspace) workspace.classList.remove('with-sticky-footer');
      }
    }
    
    // Disable finalize buttons if no client or no items
    const finalizeBtn = document.getElementById('btn-exchange-finalize');
    const stickyFinalizeBtn = document.getElementById('btn-exchange-sticky-finalize');
    if (finalizeBtn) finalizeBtn.disabled = !isClientActive || !hasItems;
    if (stickyFinalizeBtn) stickyFinalizeBtn.disabled = !isClientActive || !hasItems;
  },

  renderExchangeHistory(simulations) {
    const listContainer = document.getElementById('exchange-history-list');
    if (!listContainer) return;
    
    const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    
    if (!simulations || simulations.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">
          Nenhuma simulação de troca encontrada.
        </div>
      `;
      return;
    }
    
    listContainer.innerHTML = simulations.map(sim => {
      const dateResumida = new Date(sim.created_at).toLocaleDateString('pt-BR');
      const timeStr = new Date(sim.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const summaryText = `${sim.cliente_codigo} - ${sim.cliente_nome_fantasia.toUpperCase()} | ${money(sim.total)} | ${dateResumida}`;
      const separator = "--------------------------";
      
      return `
        <div class="exchange-history-item" id="exchange-history-item-${sim.id}">
          <div class="exchange-history-item-header" onclick="App.toggleExchangeHistoryItem(${sim.id})">
            <span>${summaryText}</span>
          </div>
          
          <div class="exchange-history-item-details" id="exchange-history-details-${sim.id}" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-color);">
            
            <!-- Recibo Térmico de Papel -->
            <div class="exchange-thermal-receipt-paper">
              <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">
                ${separator}<br>
                SIMULADOR DE TROCA<br>
                ${separator}
              </div>
              <div style="margin-bottom: 10px; font-size: 0.82rem; display: flex; flex-direction: column; gap: 4px; color: #222 !important; font-family: 'Courier New', Courier, monospace !important; text-align: left;">
                <div>Cliente: ${sim.cliente_codigo}</div>
                <div>Nome: ${sim.cliente_nome_fantasia.toUpperCase()}</div>
                <div>Data: ${dateResumida} ${timeStr}</div>
                <div>Vendedor: ${sim.seller_name || sim.seller_id}</div>
                <div>Unidade: ${sim.company_id}</div>
              </div>
              
              <div style="margin-top: 12px; margin-bottom: 4px; color: #222 !important; font-family: 'Courier New', Courier, monospace !important; text-align: left;">
                PRODUTOS<br>
                ${separator}
              </div>
              
              <div id="exchange-history-details-list-${sim.id}" style="display: flex; flex-direction: column; gap: 8px;">
                <div style="text-align: center; color: #666; padding: 10px; font-family: monospace;">Carregando itens...</div>
              </div>
              
              <div style="margin-top: 10px; font-weight: bold; font-size: 0.85rem; color: #222 !important; font-family: 'Courier New', Courier, monospace !important; text-align: left;">
                TOTAL GERAL: ${money(sim.total)}
              </div>
            </div>
            
            <div style="display: flex; justify-content: center; margin-top: 12px;">
              <button class="btn btn-primary exchange-receipt-copy-btn" type="button" onclick="App.copyExchangeHistoryMessage('${sim.id}')">Copiar mensagem novamente</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Render imported exchange products in admin tab
   */
  renderExchangeAdminProducts(products) {
    const tbody = document.getElementById('exchange-products-admin-tbody');
    if (!tbody) return;
    
    const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    
    if (!products || products.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">Nenhum produto cadastrado no simulador de trocas.</td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = products.map(p => {
      return `
        <tr>
          <td><strong>${p.codigo}</strong></td>
          <td>${p.produto}</td>
          <td><span class="badge-status badge-secondary" style="text-transform: uppercase;">${p.categoria || 'Outros'}</span></td>
          <td style="text-align: right;">${money(p.preco_total)}</td>
          <td style="text-align: center;">${p.quantidade_na_caixa}</td>
          <td style="text-align: right;">${money(p.valor_unitario)}</td>
        </tr>
      `;
    }).join('');
  }
};

window.UI = UI;
