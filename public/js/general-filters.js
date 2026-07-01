/**
 * General Filters & Excel Export Manager
 * Centralized client-side filtering, searching, and exporting using SheetJS
 */
(function() {
  const FiltersManager = {
    caches: {},
    activeFilters: {},
    configs: {
      'clientes': {
        renderMethod: 'renderClients',
        tbodyId: 'clients-table-body',
        fields: ['search', 'empresa', 'unitId', 'city', 'category', 'status', 'vendedor', 'supervisor'],
        excelFields: ['id', 'name', 'companyName', 'cnpj', 'ie', 'category', 'phone', 'email', 'city', 'state', 'street', 'number', 'neighborhood', 'status', 'created_at']
      },
      'aprovacao': {
        renderMethod: 'renderApprovals',
        tbodyId: 'approvals-table-body',
        fields: ['search', 'empresa', 'unitId', 'city', 'vendedor', 'supervisor'],
        excelFields: ['id', 'name', 'cnpj', 'phone', 'email', 'city', 'vendedor', 'score', 'status']
      },
      'prospeccao': {
        renderMethod: 'renderProspects',
        tbodyId: 'prospects-table-body',
        fields: ['search', 'empresa', 'unitId', 'period', 'vendedor', 'supervisor', 'status', 'city'],
        excelFields: ['id', 'name', 'cnpj', 'phone', 'email', 'city', 'state', 'status', 'contactName', 'additionalNotes', 'created_at']
      },
      'equipamentos': {
        renderMethod: 'renderEquipments',
        tbodyId: 'equipments-table-body',
        fields: ['search', 'empresa', 'unitId', 'type', 'model', 'serial', 'situation'],
        excelFields: ['id', 'serial', 'type', 'model', 'voltage', 'situation', 'client', 'lastInspection', 'notes']
      },
      'movimentacao': {
        renderMethod: 'renderMovements',
        tbodyId: 'movements-table-body',
        fields: ['search', 'empresa', 'unitId', 'vendedor', 'client', 'status', 'serial', 'plate', 'number', 'responsible'],
        excelFields: ['id', 'date', 'type', 'clientName', 'clientCity', 'seller', 'patrimonio', 'modelo', 'voltagem', 'status', 'created_at']
      },
      'chamados': {
        renderMethod: 'renderTickets',
        tbodyId: 'tickets-table-body',
        fields: ['search', 'empresa', 'unitId', 'vendedor', 'client', 'status', 'priority', 'serial', 'responsible', 'period'],
        excelFields: ['id', 'date', 'mechanic', 'equipmentSerial', 'client', 'title', 'priority', 'status', 'eqStatusAfter', 'faultDescription', 'solutionDescription', 'gasCharge', 'additionalNotes', 'created_at']
      },
      'despesas': {
        renderMethod: 'renderExpenses',
        tbodyId: 'expenses-table-body',
        fields: ['search', 'empresa', 'unitId', 'vendedor', 'supervisor', 'status', 'period'],
        excelFields: ['id', 'date', 'vendedor', 'category', 'amount', 'status', 'description', 'created_at']
      },
      'solicitacao-despesas': {
        renderMethod: 'renderBalances',
        tbodyId: 'balances-table-body',
        fields: ['search', 'empresa', 'unitId', 'vendedor', 'supervisor', 'status', 'period'],
        excelFields: ['id', 'date', 'vendedor', 'amountRequested', 'amountApproved', 'status', 'notes', 'created_at']
      },
      'usuarios': {
        renderMethod: 'renderUsers',
        tbodyId: 'users-table-body',
        fields: ['search', 'empresa', 'unitId', 'profile', 'status'],
        excelFields: ['id', 'name', 'username', 'email', 'phone', 'profile', 'status', 'created_at']
      },
      'simulador-troca': {
        renderMethod: 'renderExchangeHistory',
        tbodyId: 'exchange-history-list',
        fields: ['search', 'empresa', 'unitId', 'vendedor', 'supervisor', 'client', 'period'],
        excelFields: ['id', 'created_at', 'cliente_codigo', 'cliente_nome_fantasia', 'total', 'seller_name', 'company_id']
      },
      'notificacoes': {
        renderMethod: 'loadNotificationPage',
        tbodyId: 'notif-page-list',
        fields: ['search', 'status', 'period'],
        excelFields: ['id', 'title', 'body', 'read', 'created_at']
      }
    },

    // Extract dynamic unique values from array for select dropdowns
    getUniqueValues(data, fieldKey) {
      if (!Array.isArray(data)) return [];
      const values = new Set();
      
      data.forEach(item => {
        let val = '';
        if (fieldKey === 'empresa') {
          val = item.empresa_id || item.company_id || item.empresa_nome || item.company_name || item.empresa || '';
        } else if (fieldKey === 'unitId') {
          val = item.unitId || item.unit_id || '';
          if (val && window.UI && UI.getUnitName) {
            val = UI.getUnitName(val);
          }
        } else if (fieldKey === 'city') {
          val = item.city || item.cidade || item.cliente_cidade || '';
        } else if (fieldKey === 'category') {
          val = item.category || item.categoria || '';
        } else if (fieldKey === 'status') {
          val = String(item.status ?? '');
          if (item.read !== undefined) val = item.read ? 'Lida' : 'Não lida';
        } else if (fieldKey === 'situation') {
          val = item.situation || item.situacao || item.status || '';
        } else if (fieldKey === 'vendedor') {
          val = item.vendedor_nome || item.vendedor_solicitante || item.seller_name || item.vendedor || '';
          if (!val && item.userId && window.UI && UI.getUserName) {
            val = UI.getUserName(item.userId);
          }
        } else if (fieldKey === 'supervisor') {
          val = item.supervisor_nome || item.supervisor || '';
        } else if (fieldKey === 'type') {
          val = item.type || item.tipo || item.equipmentType || '';
        } else if (fieldKey === 'model') {
          val = item.model || item.modelo || item.modelo_novo || '';
        } else if (fieldKey === 'serial') {
          val = item.equipmentSerial || item.patrimonio || item.patrimonio_novo || item.serial || '';
        } else if (fieldKey === 'plate') {
          val = item.plate || item.placa || '';
        } else if (fieldKey === 'responsible') {
          val = item.responsible || item.responsavel || item.mechanic || '';
        } else if (fieldKey === 'profile') {
          val = item.profile || item.perfil || '';
        } else if (fieldKey === 'client') {
          val = item.client || item.cliente || item.cliente_nome || item.cliente_nome_fantasia || '';
        } else if (fieldKey === 'priority') {
          val = item.priority || item.prioridade || '';
        }

        val = String(val).trim();
        if (val && val !== 'null' && val !== 'undefined' && val !== '—' && val !== '-') {
          values.add(val);
        }
      });

      return Array.from(values).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },

    // Ensure filter panel DOM is rendered above list
    ensureFilterPanel(moduleKey, tbodyId) {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;

      const parentCard = tbody.closest('.card');
      if (!parentCard) return;

      let filterBar = parentCard.querySelector('.general-filter-bar');
      const config = this.configs[moduleKey];
      if (!config) return;

      const data = this.caches[moduleKey] || [];

      if (!filterBar) {
        filterBar = document.createElement('div');
        filterBar.className = 'general-filter-bar no-print';
        filterBar.style.cssText = `
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
          display: flex;
          flex-direction: column;
          gap: 12px;
        `;

        // Build grid of filters
        let fieldsHtml = '';

        config.fields.forEach(field => {
          if (field === 'search') {
            fieldsHtml += `
              <div class="filter-group" style="flex: 2; min-width: 180px; display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted);">Buscar Texto</label>
                <input type="text" class="filter-ctrl search-ctrl" data-field="search" placeholder="Pesquisar..." style="height: 36px; padding: 0 10px; background: var(--bg-input, rgba(255,255,255,0.04)); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; font-size: 0.82rem;">
              </div>
            `;
          } else if (field === 'period') {
            fieldsHtml += `
              <div class="filter-group" style="flex: 1.5; min-width: 140px; display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted);">Período</label>
                <select class="filter-ctrl period-ctrl" data-field="period" style="height: 36px; padding: 0 10px; background: var(--bg-input, rgba(255,255,255,0.04)); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; font-size: 0.82rem;">
                  <option value="">Qualquer data</option>
                  <option value="today">Hoje</option>
                  <option value="yesterday">Ontem</option>
                  <option value="week">Últimos 7 dias</option>
                  <option value="month">Últimos 30 dias</option>
                  <option value="custom">Personalizado...</option>
                </select>
              </div>
              <div class="filter-group custom-date-range hidden" style="flex: 2; min-width: 220px; display: none; gap: 8px; align-items: center; margin-top: 18px;">
                <input type="date" class="filter-ctrl start-date-ctrl" data-field="startDate" style="height: 36px; padding: 0 10px; background: var(--bg-input, rgba(255,255,255,0.04)); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; font-size: 0.82rem; flex: 1;">
                <span style="color: var(--text-muted); font-size: 0.78rem;">até</span>
                <input type="date" class="filter-ctrl end-date-ctrl" data-field="endDate" style="height: 36px; padding: 0 10px; background: var(--bg-input, rgba(255,255,255,0.04)); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; font-size: 0.82rem; flex: 1;">
              </div>
            `;
          } else {
            const label = {
              empresa: 'Empresa',
              unitId: 'Unidade',
              city: 'Cidade',
              category: 'Categoria',
              status: 'Status',
              vendedor: 'Vendedor',
              supervisor: 'Supervisor',
              type: 'Tipo',
              model: 'Modelo',
              serial: 'Patrimônio',
              situation: 'Situação',
              plate: 'Placa',
              number: 'Número OS',
              responsible: 'Responsável',
              profile: 'Perfil',
              client: 'Cliente',
              priority: 'Prioridade'
            }[field] || field;

            fieldsHtml += `
              <div class="filter-group" style="flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 4px;">
                <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted);">${label}</label>
                <select class="filter-ctrl select-ctrl" data-field="${field}" style="height: 36px; padding: 0 10px; background: var(--bg-input, rgba(255,255,255,0.04)); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; font-size: 0.82rem;">
                  <!-- Options filled dynamically -->
                </select>
              </div>
            `;
          }
        });

        // Actions panel
        const actionsHtml = `
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: flex-end; width: 100%; border-top: 1px dashed var(--border-color); padding-top: 10px; margin-top: 6px;">
            <button type="button" class="btn btn-secondary btn-clear-filters" style="height: 32px; padding: 0 12px; font-size: 0.78rem; display: flex; align-items: center; gap: 4px;">
              ✕ Limpar Filtros
            </button>
            <button type="button" class="btn btn-success btn-export-excel" style="height: 32px; padding: 0 12px; font-size: 0.78rem; background-color: #10b981; border: 1px solid #059669; color: #fff; display: flex; align-items: center; gap: 4px;">
              📥 Exportar Excel
            </button>
            <button type="button" class="btn btn-secondary btn-export-all" style="height: 32px; padding: 0 12px; font-size: 0.78rem; display: flex; align-items: center; gap: 4px;">
              🗂️ Exportar Tudo
            </button>
          </div>
        `;

        filterBar.innerHTML = `
          <div class="filter-fields-row" style="display: flex; flex-wrap: wrap; gap: 12px; width: 100%; align-items: flex-start;">
            ${fieldsHtml}
          </div>
          ${actionsHtml}
        `;

        // Insert filter bar above table or inside card header
        const targetHeader = parentCard.querySelector('.card-header');
        if (targetHeader) {
          targetHeader.insertAdjacentElement('afterend', filterBar);
        } else {
          parentCard.insertBefore(filterBar, parentCard.firstChild);
        }

        // Bind Listeners
        const periodSelect = filterBar.querySelector('.period-ctrl');
        const customRange = filterBar.querySelector('.custom-date-range');
        if (periodSelect && customRange) {
          periodSelect.addEventListener('change', () => {
            if (periodSelect.value === 'custom') {
              customRange.style.display = 'flex';
            } else {
              customRange.style.display = 'none';
              filterBar.querySelector('.start-date-ctrl').value = '';
              filterBar.querySelector('.end-date-ctrl').value = '';
            }
            this.triggerFiltering(moduleKey);
          });
        }

        filterBar.querySelectorAll('.filter-ctrl').forEach(ctrl => {
          if (ctrl.tagName === 'SELECT') {
            ctrl.addEventListener('change', () => this.triggerFiltering(moduleKey));
          } else if (ctrl.tagName === 'INPUT') {
            ctrl.addEventListener('input', () => this.triggerFiltering(moduleKey));
          }
        });

        filterBar.querySelector('.btn-clear-filters').addEventListener('click', () => this.clearFilters(moduleKey));
        filterBar.querySelector('.btn-export-excel').addEventListener('click', () => this.exportExcel(moduleKey, true));
        filterBar.querySelector('.btn-export-all').addEventListener('click', () => this.exportExcel(moduleKey, false));
      }

      // Always update dropdown values dynamically
      filterBar.querySelectorAll('.select-ctrl').forEach(select => {
        const field = select.getAttribute('data-field');
        const currentValue = select.value;
        const uniqueVals = this.getUniqueValues(data, field);

        select.innerHTML = `
          <option value="">Todos</option>
          ${uniqueVals.map(v => `<option value="${v}" ${v === currentValue ? 'selected' : ''}>${v}</option>`).join('')}
        `;
      });
    },

    // Read current values of inputs to build active filter dictionary
    getFilterValues(moduleKey) {
      const parentCard = document.getElementById(this.configs[moduleKey].tbodyId)?.closest('.card');
      if (!parentCard) return {};

      const values = {};
      parentCard.querySelectorAll('.filter-ctrl').forEach(ctrl => {
        const field = ctrl.getAttribute('data-field');
        if (field) {
          values[field] = ctrl.value.trim();
        }
      });
      return values;
    },

    // Trigger local filtering and reload the corresponding table
    triggerFiltering(moduleKey) {
      const originalData = this.caches[moduleKey] || [];
      const activeFilters = this.getFilterValues(moduleKey);
      
      const filtered = this.filterData(originalData, activeFilters, moduleKey);

      // Call the original render directly bypassing the interceptor loop
      const config = this.configs[moduleKey];
      if (window.UI && UI['_original_' + config.renderMethod]) {
        UI['_original_' + config.renderMethod](filtered);
      }
    },

    // Parser to get unified Date object from various formats
    parseItemDate(val) {
      if (!val) return null;
      // If timestamp
      if (typeof val === 'number') return new Date(val);
      // ISO strings
      if (String(val).includes('T')) return new Date(val);
      // Format DD/MM/YYYY
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
        const p = val.split('/');
        return new Date(p[2], p[1] - 1, p[0]);
      }
      // Format YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
        const p = val.split('-');
        return new Date(p[0], p[1] - 1, p[2].slice(0, 2));
      }
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    },

    // Filter array based on selections and text search
    filterData(data, filters, moduleKey) {
      return data.filter(item => {
        // 1. Text Search across all properties
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const match = Object.values(item).some(val => 
            val && String(val).toLowerCase().includes(q)
          );
          if (!match) return false;
        }

        // 2. Exact matches for dropdowns
        for (const [key, value] of Object.entries(filters)) {
          if (!value || key === 'search' || key === 'period' || key === 'startDate' || key === 'endDate') continue;

          let itemVal = '';
          if (key === 'empresa') {
            itemVal = item.empresa_id || item.company_id || item.empresa_nome || item.company_name || item.empresa || '';
          } else if (key === 'unitId') {
            itemVal = item.unitId || item.unit_id || '';
            if (itemVal && window.UI && UI.getUnitName) {
              itemVal = UI.getUnitName(itemVal);
            }
          } else if (key === 'city') {
            itemVal = item.city || item.cidade || item.cliente_cidade || '';
          } else if (key === 'category') {
            itemVal = item.category || item.categoria || '';
          } else if (key === 'status') {
            itemVal = String(item.status ?? '');
            if (item.read !== undefined) itemVal = item.read ? 'Lida' : 'Não lida';
          } else if (key === 'situation') {
            itemVal = item.situation || item.situacao || item.status || '';
          } else if (key === 'vendedor') {
            itemVal = item.vendedor_nome || item.vendedor_solicitante || item.seller_name || item.vendedor || '';
            if (!itemVal && item.userId && window.UI && UI.getUserName) {
              itemVal = UI.getUserName(item.userId);
            }
          } else if (key === 'supervisor') {
            itemVal = item.supervisor_nome || item.supervisor || '';
          } else if (key === 'type') {
            itemVal = item.type || item.tipo || item.equipmentType || '';
          } else if (key === 'model') {
            itemVal = item.model || item.modelo || item.modelo_novo || '';
          } else if (key === 'serial') {
            itemVal = item.equipmentSerial || item.patrimonio || item.patrimonio_novo || item.serial || '';
          } else if (key === 'plate') {
            itemVal = item.plate || item.placa || '';
          } else if (key === 'responsible') {
            itemVal = item.responsible || item.responsavel || item.mechanic || '';
          } else if (key === 'profile') {
            itemVal = item.profile || item.perfil || '';
          } else if (key === 'client') {
            itemVal = item.client || item.cliente || item.cliente_nome || item.cliente_nome_fantasia || '';
          } else if (key === 'priority') {
            itemVal = item.priority || item.prioridade || '';
          }

          if (String(itemVal).trim() !== value) return false;
        }

        // 3. Period/Date range filtering
        if (filters.period) {
          const itemDateVal = item.date || item.created_at || item.data || '';
          const itemDate = this.parseItemDate(itemDateVal);
          if (!itemDate) return false;

          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          if (filters.period === 'today') {
            const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
            if (itemDay.getTime() !== today.getTime()) return false;
          } else if (filters.period === 'yesterday') {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
            if (itemDay.getTime() !== yesterday.getTime()) return false;
          } else if (filters.period === 'week') {
            const limit = new Date(today);
            limit.setDate(limit.getDate() - 7);
            if (itemDate < limit) return false;
          } else if (filters.period === 'month') {
            const limit = new Date(today);
            limit.setDate(limit.getDate() - 30);
            if (itemDate < limit) return false;
          } else if (filters.period === 'custom') {
            if (filters.startDate) {
              const start = new Date(filters.startDate + 'T00:00:00');
              if (itemDate < start) return false;
            }
            if (filters.endDate) {
              const end = new Date(filters.endDate + 'T23:59:59');
              if (itemDate > end) return false;
            }
          }
        }

        return true;
      });
    },

    // Reset filters
    clearFilters(moduleKey) {
      const parentCard = document.getElementById(this.configs[moduleKey].tbodyId)?.closest('.card');
      if (!parentCard) return;

      parentCard.querySelectorAll('.filter-ctrl').forEach(ctrl => {
        ctrl.value = '';
      });

      const customRange = parentCard.querySelector('.custom-date-range');
      if (customRange) customRange.style.display = 'none';

      this.triggerFiltering(moduleKey);
    },

    // Export list data to beautiful styled Excel spreadsheet using SheetJS
    exportExcel(moduleKey, useFiltered) {
      if (!window.XLSX) {
        return alert('Biblioteca Excel (SheetJS) não carregada. Aguarde ou recarregue a página.');
      }

      const originalData = this.caches[moduleKey] || [];
      let listToExport = originalData;

      if (useFiltered) {
        const activeFilters = this.getFilterValues(moduleKey);
        listToExport = this.filterData(originalData, activeFilters, moduleKey);
      }

      if (listToExport.length === 0) {
        return alert('Nenhum registro encontrado para exportar.');
      }

      const config = this.configs[moduleKey];
      const loggedUser = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;

      // Build highlighted metadata rows
      const meta = [
        [`RELATÓRIO: ${moduleKey.toUpperCase()}`],
        [`Data da Exportação:`, new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR')],
        [`Usuário Responsável:`, loggedUser ? `${loggedUser.name} (${loggedUser.username})` : 'Sistema'],
        [`Empresa de Origem:`, loggedUser ? (loggedUser.empresa_id || 'Todas') : 'Todas'],
        [`Unidade Vinculada:`, loggedUser ? (loggedUser.unitId || 'Todas') : 'Todas'],
        [] // Empty spacing row
      ];

      // Format headers and rows
      const mappedRows = listToExport.map(item => {
        const mapped = {};
        
        config.excelFields.forEach(field => {
          let label = field.toUpperCase();
          let val = item[field];

          // Map labels and format custom fields
          if (field === 'created_at' || field === 'date') {
            label = 'DATA';
            val = val ? new Date(val).toLocaleString('pt-BR') : '—';
          } else if (field === 'unitId' || field === 'unit_id') {
            label = 'UNIDADE';
            val = (window.UI && UI.getUnitName && UI.getUnitName(val)) || val || '—';
          } else if (field === 'userId') {
            label = 'USUÁRIO/VENDEDOR';
            val = (window.UI && UI.getUserName && UI.getUserName(val)) || val || '—';
          } else if (field === 'read') {
            label = 'SITUAÇÃO';
            val = val ? 'Lida' : 'Não lida';
          } else if (field === 'total' || field === 'amount' || field === 'amountRequested' || field === 'amountApproved') {
            label = 'VALOR';
            val = val ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val) : '—';
          }

          mapped[label] = val ?? '—';
        });

        return mapped;
      });

      // Construct workbook
      const ws = XLSX.utils.aoa_to_sheet(meta);
      XLSX.utils.sheet_add_json(ws, mappedRows, { origin: "A7" });

      // Stylize widths automatically
      const maxCols = config.excelFields.length;
      ws['!cols'] = Array(maxCols).fill({ wch: 18 });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dados");

      // Save file
      const filename = `${moduleKey}_export_${Date.now()}.xlsx`;
      XLSX.writeFile(wb, filename);
    },

    // Collect all uploaded media/documents across clients, expenses, movements, and tickets
    getCollectedFiles() {
      const files = [];
      const loggedUser = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;

      const addFile = (url, type, relatedName, sellerId, unitId, createdAt, module, relatedId) => {
        const finalUrl = (window.TempPhotosCache && window.TempPhotosCache[url]) || url;
        const isValid = finalUrl && finalUrl !== 'null' && finalUrl !== 'undefined' && finalUrl !== '/uploads/null' && finalUrl !== '/uploads/undefined' && finalUrl !== '/uploads/';
        if (!isValid) return;

        // Resolve names
        const sellerName = (window.UI && UI.getUserName && UI.getUserName(sellerId)) || sellerId || '—';
        const unitName = (window.UI && UI.getUnitName && UI.getUnitName(unitId)) || unitId || '—';
        const companyName = loggedUser ? (loggedUser.empresa_id || '—') : '—';
        
        let filename = 'arquivo';
        try {
          filename = finalUrl.split('/').pop().split('?')[0];
        } catch(_) {}

        files.push({
          name: filename,
          type: type,
          client: relatedName || '—',
          vendedor: sellerName,
          supervisor: '—', // Linked supervisor
          empresa: companyName,
          unidade: unitName,
          date: createdAt ? new Date(createdAt).toLocaleDateString('pt-BR') : '—',
          module: module,
          relatedId: relatedId || '—',
          user: sellerName,
          url: finalUrl
        });
      };

      // 1. Clientes
      const clients = (window.Store && Store.getClients && Store.getClients()) || [];
      clients.forEach(c => {
        const date = c.created_at || '';
        if (c.photoFachada) addFile(c.photoFachada, 'Foto Fachada', c.name, c.userId, c.unitId, date, 'Clientes', c.id);
        if (c.photoInterna01) addFile(c.photoInterna01, 'Foto Interna 01', c.name, c.userId, c.unitId, date, 'Clientes', c.id);
        if (c.photoInterna02) addFile(c.photoInterna02, 'Foto Interna 02', c.name, c.userId, c.unitId, date, 'Clientes', c.id);
        if (c.photoInterna03) addFile(c.photoInterna03, 'Foto Interna 03', c.name, c.userId, c.unitId, date, 'Clientes', c.id);
        if (c.photoRua01) addFile(c.photoRua01, 'Foto Rua 01', c.name, c.userId, c.unitId, date, 'Clientes', c.id);
        if (c.photoRua02) addFile(c.photoRua02, 'Foto Rua 02', c.name, c.userId, c.unitId, date, 'Clientes', c.id);
        if (c.photoCnpj) addFile(c.photoCnpj, 'Foto CNPJ', c.name, c.userId, c.unitId, date, 'Clientes', c.id);
      });

      // 2. Despesas
      const expenses = (window.Store && Store.getExpenses && Store.getExpenses()) || [];
      expenses.forEach(e => {
        if (e.photo) addFile(e.photo, 'Comprovante Despesa', '—', e.userId, e.unitId, e.date, 'Despesas', e.id);
      });

      // 3. Movimentações
      const movements = (window.Store && Store.getMovements && Store.getMovements()) || [];
      movements.forEach(m => {
        const date = m.created_at || m.date || '';
        if (m.fotoAntigo) addFile(m.fotoAntigo, 'Foto Equipamento Antigo', m.clientName, m.userId, m.unitId, date, 'Movimentações', m.id);
        if (m.fotoNovo) addFile(m.fotoNovo, 'Foto Equipamento Novo', m.clientName, m.userId, m.unitId, date, 'Movimentações', m.id);
        if (m.fotoRecolha) addFile(m.fotoRecolha, 'Foto Recolha', m.clientName, m.userId, m.unitId, date, 'Movimentações', m.id);
        if (m.fotoAntes) addFile(m.fotoAntes, 'Foto Antes Adesivação', m.clientName, m.userId, m.unitId, date, 'Movimentações', m.id);
        if (m.fotoDepois) addFile(m.fotoDepois, 'Foto Depois Adesivação', m.clientName, m.userId, m.unitId, date, 'Movimentações', m.id);
      });

      // 4. Chamados
      const tickets = (window.Store && Store.getTickets && Store.getTickets()) || [];
      tickets.forEach(t => {
        const date = t.created_at || t.date || '';
        if (t.defectPhoto) addFile(t.defectPhoto, 'Foto Defeito', t.client, t.userId, t.unitId, date, 'Chamados', t.id);
        if (t.fotoAntes) addFile(t.fotoAntes, 'Foto Antes Reparo', t.client, t.userId, t.unitId, date, 'Chamados', t.id);
        if (t.fotoDepois) addFile(t.fotoDepois, 'Foto Depois Reparo', t.client, t.userId, t.unitId, date, 'Chamados', t.id);
        if (t.fotoPlaqueta) addFile(t.fotoPlaqueta, 'Foto Plaqueta', t.client, t.userId, t.unitId, date, 'Chamados', t.id);
      });

      return files;
    },

    // Build files page content dynamically
    renderExportacaoArquivosPage() {
      const files = this.getCollectedFiles();
      const tbody = document.getElementById('files-table-body');
      if (!tbody) return;

      this.caches['exportar-arquivos'] = files;

      // Injeta filtros específicos para a página de arquivos coletados
      this.ensureExportarArquivosFilters();

      const activeFilters = this.getFilterValuesForArquivos();
      const filtered = this.filterDataForArquivos(files, activeFilters);

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--text-muted);">Nenhum arquivo encontrado com estes filtros.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(f => `
        <tr>
          <td style="font-weight:600; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</td>
          <td><span class="badge-status badge-primary" style="font-size:0.7rem; padding:2px 8px;">${f.type}</span></td>
          <td>${f.client}</td>
          <td>${f.vendedor}</td>
          <td>${f.unidade}</td>
          <td>${f.date}</td>
          <td><span style="font-weight:bold;">${f.module}</span></td>
          <td style="font-family:monospace; font-size:0.75rem;">#${f.relatedId}</td>
          <td>
            <a href="${f.url}" target="_blank" class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 0.72rem;">Ver / Baixar</a>
          </td>
        </tr>
      `).join('');
    },

    ensureExportarArquivosFilters() {
      const tbody = document.getElementById('files-table-body');
      if (!tbody) return;
      const parentCard = tbody.closest('.card');
      if (!parentCard) return;
      const existingFilter = parentCard.querySelector('.files-filter-bar');
      if (existingFilter) return;

      const data = this.caches['exportar-arquivos'] || [];
      const filterBar = document.createElement('div');
      filterBar.className = 'files-filter-bar no-print';
      filterBar.style.cssText = `
        padding: 16px;
        background: rgba(255, 255, 255, 0.02);
        border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
        display: flex;
        flex-direction: column;
        gap: 12px;
      `;

      const companies = Array.from(new Set(data.map(d => d.empresa))).filter(Boolean).sort();
      const units = Array.from(new Set(data.map(d => d.unidade))).filter(Boolean).sort();
      const sellers = Array.from(new Set(data.map(d => d.vendedor))).filter(Boolean).sort();
      const modules = Array.from(new Set(data.map(d => d.module))).filter(Boolean).sort();

      filterBar.innerHTML = `
        <div class="filter-fields-row" style="display: flex; flex-wrap: wrap; gap: 12px; width: 100%; align-items: flex-start;">
          <div class="filter-group" style="flex: 2; min-width: 160px; display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted);">Buscar Texto</label>
            <input type="text" class="filter-ctrl search-ctrl" data-field="search" placeholder="Pesquisar..." style="height: 36px; padding: 0 10px; background: var(--bg-input, rgba(255,255,255,0.04)); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; font-size: 0.82rem;">
          </div>
          <div class="filter-group" style="flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted);">Módulo</label>
            <select class="filter-ctrl select-ctrl" data-field="module" style="height: 36px; padding: 0 10px; background: var(--bg-input, rgba(255,255,255,0.04)); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; font-size: 0.82rem;">
              <option value="">Todos</option>
              ${modules.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group" style="flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted);">Empresa</label>
            <select class="filter-ctrl select-ctrl" data-field="empresa" style="height: 36px; padding: 0 10px; background: var(--bg-input, rgba(255,255,255,0.04)); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; font-size: 0.82rem;">
              <option value="">Todas</option>
              ${companies.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group" style="flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted);">Unidade</label>
            <select class="filter-ctrl select-ctrl" data-field="unidade" style="height: 36px; padding: 0 10px; background: var(--bg-input, rgba(255,255,255,0.04)); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; font-size: 0.82rem;">
              <option value="">Todas</option>
              ${units.map(u => `<option value="${u}">${u}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group" style="flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted);">Vendedor</label>
            <select class="filter-ctrl select-ctrl" data-field="vendedor" style="height: 36px; padding: 0 10px; background: var(--bg-input, rgba(255,255,255,0.04)); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; font-size: 0.82rem;">
              <option value="">Todos</option>
              ${sellers.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: flex-end; width: 100%; border-top: 1px dashed var(--border-color); padding-top: 10px; margin-top: 6px;">
          <button type="button" class="btn btn-secondary btn-clear-files-filters" style="height: 32px; padding: 0 12px; font-size: 0.78rem; display: flex; align-items: center; gap: 4px;">
            ✕ Limpar Filtros
          </button>
          <button type="button" class="btn btn-success btn-export-files-excel" style="height: 32px; padding: 0 12px; font-size: 0.78rem; background-color: #10b981; border: 1px solid #059669; color: #fff; display: flex; align-items: center; gap: 4px;">
            📥 Exportar Excel
          </button>
          <button type="button" class="btn btn-secondary btn-export-files-all" style="height: 32px; padding: 0 12px; font-size: 0.78rem; display: flex; align-items: center; gap: 4px;">
            🗂️ Exportar Tudo
          </button>
        </div>
      `;

      const targetHeader = parentCard.querySelector('.card-header');
      if (targetHeader) {
        targetHeader.insertAdjacentElement('afterend', filterBar);
      } else {
        parentCard.insertBefore(filterBar, parentCard.firstChild);
      }

      filterBar.querySelectorAll('.filter-ctrl').forEach(ctrl => {
        ctrl.addEventListener(ctrl.tagName === 'SELECT' ? 'change' : 'input', () => {
          this.renderExportacaoArquivosPage();
        });
      });

      filterBar.querySelector('.btn-clear-files-filters').addEventListener('click', () => {
        filterBar.querySelectorAll('.filter-ctrl').forEach(c => c.value = '');
        this.renderExportacaoArquivosPage();
      });

      filterBar.querySelector('.btn-export-files-excel').addEventListener('click', () => this.exportFilesExcel(true));
      filterBar.querySelector('.btn-export-files-all').addEventListener('click', () => this.exportFilesExcel(false));
    },

    getFilterValuesForArquivos() {
      const parentCard = document.getElementById('files-table-body')?.closest('.card');
      if (!parentCard) return {};

      const values = {};
      parentCard.querySelectorAll('.filter-ctrl').forEach(ctrl => {
        const field = ctrl.getAttribute('data-field');
        if (field) {
          values[field] = ctrl.value.trim();
        }
      });
      return values;
    },

    filterDataForArquivos(data, filters) {
      return data.filter(item => {
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const match = Object.values(item).some(val => val && String(val).toLowerCase().includes(q));
          if (!match) return false;
        }
        if (filters.module && item.module !== filters.module) return false;
        if (filters.empresa && item.empresa !== filters.empresa) return false;
        if (filters.unidade && item.unidade !== filters.unidade) return false;
        if (filters.vendedor && item.vendedor !== filters.vendedor) return false;
        return true;
      });
    },

    exportFilesExcel(useFiltered) {
      if (!window.XLSX) return alert('Biblioteca Excel não carregada.');

      const originalData = this.caches['exportar-arquivos'] || [];
      let list = originalData;

      if (useFiltered) {
        const filters = this.getFilterValuesForArquivos();
        list = this.filterDataForArquivos(originalData, filters);
      }

      if (list.length === 0) return alert('Nenhum registro para exportar.');

      const loggedUser = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;

      const meta = [
        [`EXPORTAÇÃO DE ARQUIVOS ENVIADOS (FOTOS, VÍDEOS, DOCUMENTOS)`],
        [`Data da Exportação:`, new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR')],
        [`Usuário Responsável:`, loggedUser ? `${loggedUser.name} (${loggedUser.username})` : 'Sistema'],
        [`Empresa de Origem:`, loggedUser ? (loggedUser.empresa_id || 'Todas') : 'Todas'],
        []
      ];

      const rows = list.map(f => ({
        'NOME DO ARQUIVO': f.name,
        'TIPO DE ARQUIVO': f.type,
        'CLIENTE RELACIONADO': f.client,
        'VENDEDOR': f.vendedor,
        'SUPERVISOR': f.supervisor,
        'EMPRESA': f.empresa,
        'UNIDADE': f.unidade,
        'DATA DE ENVIO': f.date,
        'MÓDULO DE ORIGEM': f.module,
        'REGISTRO RELACIONADO ID': f.relatedId,
        'USUÁRIO QUE ENVIOU': f.user,
        'LINK DE DOWNLOAD': f.url
      }));

      const ws = XLSX.utils.aoa_to_sheet(meta);
      XLSX.utils.sheet_add_json(ws, rows, { origin: "A6" });
      ws['!cols'] = Array(12).fill({ wch: 18 });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Arquivos");

      XLSX.writeFile(wb, `arquivos_export_${Date.now()}.xlsx`);
    }
  };

  // Local helper to apply security and visibility rules before caching list data
  function applySecurityFilters(moduleKey, data) {
    const activeUnitId = window.Store && Store.getActiveUnitId ? Store.getActiveUnitId() : 'all';
    const user = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;
    if (!user || !Array.isArray(data)) return data;

    let filtered = [...data];

    // 1. Filter by Active Unit selection
    if (activeUnitId !== 'all') {
      filtered = filtered.filter(item => {
        const uId = item.unitId || item.unit_id || item.company_id || item.unidade_id || '';
        return String(uId) === String(activeUnitId);
      });
    }

    // 2. Filter by User profile and ownership rules
    const role = user.profile ? String(user.profile).toLowerCase().trim() : '';
    if (role === 'vendedor') {
      filtered = filtered.filter(item => {
        // Match userId, user_id, vendedor, or seller_name to current user
        const ownerId = item.userId || item.user_id || item.seller_id || item.creator_id || '';
        if (ownerId && String(ownerId) === String(user.id)) return true;

        const sellerName = item.vendedor_nome || item.vendedor_solicitante || item.seller_name || item.vendedor || '';
        if (sellerName && String(sellerName).toLowerCase().includes(String(user.name).toLowerCase())) return true;
        
        // Default fall-through if no owner matching info exists
        if (!ownerId && !sellerName) return true;
        return false;
      });
    }

    return filtered;
  }

  // Hook into UI rendering methods to intercept, cache, and apply filters
  function initUIInterceptors() {
    if (!window.UI) return;

    Object.keys(FiltersManager.configs).forEach(moduleKey => {
      const config = FiltersManager.configs[moduleKey];
      const renderMethod = config.renderMethod;

      if (UI[renderMethod] && !UI['_original_' + renderMethod]) {
        // Save original method reference
        UI['_original_' + renderMethod] = UI[renderMethod];

        // Redefine rendering method
        UI[renderMethod] = function(data) {
          // Pre-apply safety and visibility rules
          const securedData = applySecurityFilters(moduleKey, data);

          // 1. Cache the current user's authorized data
          FiltersManager.caches[moduleKey] = securedData;

          // 2. Ensure filter controls DOM exists above list
          FiltersManager.ensureFilterPanel(moduleKey, config.tbodyId);

          // 3. Retrieve currently selected filter states
          const activeFilters = FiltersManager.getFilterValues(moduleKey);

          // 4. Apply filters locally
          const filtered = FiltersManager.filterData(securedData, activeFilters, moduleKey);

          // 5. Call original render code to paint DOM
          UI['_original_' + renderMethod].call(UI, filtered);
        };
      }
    });
  }

  // Hook into public/admin client-side rendering methods
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUIInterceptors);
  } else {
    initUIInterceptors();
  }

  window.FiltersManager = FiltersManager;
})();
