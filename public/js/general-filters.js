/*
 * General Filters & Excel Export Manager
 * Correção 01/07: relatórios Excel completos, cabeçalhos em português e links das mídias.
 */
(function() {
  'use strict';

  const REPORT_TITLES = {
    clientes: 'CLIENTES EXTERNOS',
    aprovacao: 'CLIENTES EXTERNOS / APROVAÇÃO',
    prospeccao: 'PROSPECÇÃO',
    equipamentos: 'EQUIPAMENTOS',
    movimentacao: 'MOVIMENTAÇÃO DE EQUIPAMENTOS',
    chamados: 'CHAMADOS MECÂNICOS',
    despesas: 'DESPESAS DE VIAGEM',
    'solicitacao-despesas': 'SOLICITAÇÕES DE SALDO',
    usuarios: 'USUÁRIOS',
    'simulador-troca': 'SIMULADOR DE TROCA',
    notificacoes: 'NOTIFICAÇÕES'
  };

  const FiltersManager = {
    caches: {},
    configs: {
      clientes: { renderMethod: 'renderClients', tbodyId: 'clients-table-body', fields: ['search','empresa','unitId','city','category','status','vendedor','supervisor','period'] },
      aprovacao: { renderMethod: 'renderApprovals', tbodyId: 'approvals-table-body', fields: ['search','empresa','unitId','city','vendedor','supervisor','status'] },
      prospeccao: { renderMethod: 'renderProspects', tbodyId: 'prospects-table-body', fields: ['search','empresa','unitId','period','vendedor','supervisor','status','city'] },
      equipamentos: { renderMethod: 'renderEquipments', tbodyId: 'equipments-table-body', fields: ['search','empresa','unitId','type','model','serial','situation'] },
      movimentacao: { renderMethod: 'renderMovements', tbodyId: 'movements-table-body', fields: ['search','empresa','unitId','vendedor','client','status','serial','responsible','period'] },
      chamados: { renderMethod: 'renderTickets', tbodyId: 'tickets-table-body', fields: ['search','empresa','unitId','vendedor','client','status','priority','serial','responsible','period'] },
      despesas: { renderMethod: 'renderExpenses', tbodyId: 'expenses-table-body', fields: ['search','empresa','unitId','vendedor','supervisor','status','period'] },
      'solicitacao-despesas': { renderMethod: 'renderBalances', tbodyId: 'balances-table-body', fields: ['search','empresa','unitId','vendedor','supervisor','status','period'] },
      usuarios: { renderMethod: 'renderUsers', tbodyId: 'users-table-body', fields: ['search','empresa','unitId','profile','status'] },
      'simulador-troca': { renderMethod: 'renderExchangeHistory', tbodyId: 'exchange-history-list', fields: ['search','empresa','unitId','vendedor','supervisor','client','period'] },
      notificacoes: { renderMethod: 'loadNotificationPage', tbodyId: 'notif-page-list', fields: ['search','status','period'] }
    },

    ensureFilterPanel(moduleKey) {
      const config = this.configs[moduleKey];
      const tbody = document.getElementById(config && config.tbodyId);
      if (!config || !tbody) return;
      const parentCard = tbody.closest('.card') || tbody.parentElement;
      if (!parentCard) return;

      let bar = parentCard.querySelector('.general-filter-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'general-filter-bar no-print';
        bar.style.cssText = 'padding:16px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border-color);display:flex;flex-direction:column;gap:12px;';
        bar.innerHTML = `<div class="filter-fields-row" style="display:flex;flex-wrap:wrap;gap:12px;width:100%;align-items:flex-start;">${this.buildFilterControls(moduleKey)}</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end;width:100%;border-top:1px dashed var(--border-color);padding-top:10px;margin-top:6px;"><button type="button" class="btn btn-secondary btn-clear-filters" style="height:32px;padding:0 12px;font-size:.78rem;">✕ Limpar Filtros</button><button type="button" class="btn btn-success btn-export-excel" style="height:32px;padding:0 12px;font-size:.78rem;background-color:#10b981;border:1px solid #059669;color:#fff;">📥 Exportar Excel</button><button type="button" class="btn btn-secondary btn-export-all" style="height:32px;padding:0 12px;font-size:.78rem;">🗂️ Exportar Tudo</button></div>`;
        const header = parentCard.querySelector('.card-header');
        if (header) header.insertAdjacentElement('afterend', bar); else parentCard.insertBefore(bar, parentCard.firstChild);

        bar.querySelectorAll('.filter-ctrl').forEach(ctrl => {
          ctrl.addEventListener(ctrl.tagName === 'SELECT' ? 'change' : 'input', () => this.triggerFiltering(moduleKey));
        });
        bar.querySelector('.btn-clear-filters')?.addEventListener('click', () => this.clearFilters(moduleKey));
        bar.querySelector('.btn-export-excel')?.addEventListener('click', () => this.exportExcel(moduleKey, true));
        bar.querySelector('.btn-export-all')?.addEventListener('click', () => this.exportExcel(moduleKey, false));
      }

      bar.querySelectorAll('.select-ctrl').forEach(select => {
        const field = select.dataset.field;
        const current = select.value;
        const values = this.getUniqueValues(this.caches[moduleKey] || [], field);
        select.innerHTML = `<option value="">Todos</option>${values.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('')}`;
        if ([...select.options].some(o => o.value === current)) select.value = current;
      });
    },

    buildFilterControls(moduleKey) {
      const labels = { empresa:'Empresa', unitId:'Unidade', city:'Cidade', category:'Categoria', status:'Status', vendedor:'Vendedor', supervisor:'Supervisor', type:'Tipo', model:'Modelo', serial:'Patrimônio', situation:'Situação', plate:'Placa', number:'Número OS', responsible:'Responsável', profile:'Perfil', client:'Cliente', priority:'Prioridade' };
      return (this.configs[moduleKey].fields || []).map(field => {
        if (field === 'search') return `<div class="filter-group" style="flex:2;min-width:180px;display:flex;flex-direction:column;gap:4px;"><label style="font-size:.72rem;font-weight:600;color:var(--text-muted);">Buscar Texto</label><input type="text" class="filter-ctrl search-ctrl" data-field="search" placeholder="Pesquisar..." style="height:36px;padding:0 10px;background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-main);border-radius:6px;font-size:.82rem;"></div>`;
        if (field === 'period') return `<div class="filter-group" style="flex:1.5;min-width:140px;display:flex;flex-direction:column;gap:4px;"><label style="font-size:.72rem;font-weight:600;color:var(--text-muted);">Período</label><select class="filter-ctrl period-ctrl" data-field="period" style="height:36px;padding:0 10px;background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-main);border-radius:6px;font-size:.82rem;"><option value="">Qualquer data</option><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="week">Últimos 7 dias</option><option value="month">Últimos 30 dias</option></select></div>`;
        return `<div class="filter-group" style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:4px;"><label style="font-size:.72rem;font-weight:600;color:var(--text-muted);">${labels[field] || field}</label><select class="filter-ctrl select-ctrl" data-field="${field}" style="height:36px;padding:0 10px;background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-main);border-radius:6px;font-size:.82rem;"><option value="">Todos</option></select></div>`;
      }).join('');
    },

    getUniqueValues(data, field) {
      const set = new Set();
      (Array.isArray(data) ? data : []).forEach(item => {
        const value = String(this.getFilterValue(item, field) || '').trim();
        if (value && !['null','undefined','—','-'].includes(value.toLowerCase())) set.add(value);
      });
      return [...set].sort((a,b) => a.localeCompare(b, 'pt-BR'));
    },

    getFilterValue(item, field) {
      if (field === 'empresa') return pick(item, ['empresa_id','company_id','empresa_nome','company_name','empresa','base','empresaBase']);
      if (field === 'unitId') return unitName(pick(item, ['unitId','unit_id','unidade','unidade_id']));
      if (field === 'city') return pick(item, ['city','cidade','clientCity','cliente_cidade']);
      if (field === 'category') return pick(item, ['category','categoria','finalidade']);
      if (field === 'status') return item.read !== undefined ? (item.read ? 'Lida' : 'Não lida') : pick(item, ['status']);
      if (field === 'vendedor') return pick(item, ['vendedor_nome','vendedor_solicitante','seller_name','vendedor','seller','cliente_vendedor']) || userName(pick(item, ['userId','user_id','vendedor_id','seller_id']));
      if (field === 'supervisor') return pick(item, ['supervisor_nome','supervisor']);
      if (field === 'type') return pick(item, ['type','tipo','equipmentType','tipo_solicitacao']);
      if (field === 'model') return pick(item, ['model','modelo','modelo_novo']);
      if (field === 'serial') return pick(item, ['equipmentSerial','patrimonio','patrimonio_novo','serial']);
      if (field === 'responsible') return pick(item, ['responsible','responsavel','mechanic','mecanico']);
      if (field === 'profile') return pick(item, ['profile','perfil']);
      if (field === 'client') return pick(item, ['client','cliente','cliente_nome','clientName','name','nomeFantasia','cliente_nome_fantasia']);
      if (field === 'priority') return pick(item, ['priority','prioridade']);
      return pick(item, [field]);
    },

    getFilterValues(moduleKey) {
      const parentCard = document.getElementById(this.configs[moduleKey].tbodyId)?.closest('.card');
      const values = {};
      parentCard?.querySelectorAll('.filter-ctrl').forEach(ctrl => { if (ctrl.dataset.field) values[ctrl.dataset.field] = ctrl.value.trim(); });
      return values;
    },

    triggerFiltering(moduleKey) {
      const config = this.configs[moduleKey];
      const data = this.filterData(this.caches[moduleKey] || [], this.getFilterValues(moduleKey), moduleKey);
      if (window.UI && UI['_original_' + config.renderMethod]) UI['_original_' + config.renderMethod](data);
    },

    clearFilters(moduleKey) {
      const parentCard = document.getElementById(this.configs[moduleKey].tbodyId)?.closest('.card');
      parentCard?.querySelectorAll('.filter-ctrl').forEach(ctrl => { ctrl.value = ''; });
      this.triggerFiltering(moduleKey);
    },

    filterData(data, filters, moduleKey) {
      const list = Array.isArray(data) ? data : [];
      return list.filter(item => {
        if (filters.search) {
          const q = normalize(filters.search);
          if (!Object.values(item || {}).some(v => normalize(String(v || '')).includes(q))) return false;
        }
        for (const [key, value] of Object.entries(filters)) {
          if (!value || ['search','period'].includes(key)) continue;
          if (String(this.getFilterValue(item, key) || '').trim() !== value) return false;
        }
        if (filters.period) {
          const d = parseDate(pick(item, ['date','created_at','createdAt','data','data_cadastro']));
          if (!d) return false;
          const today = new Date(); today.setHours(0,0,0,0);
          const day = new Date(d); day.setHours(0,0,0,0);
          if (filters.period === 'today' && day.getTime() !== today.getTime()) return false;
          if (filters.period === 'yesterday') { const y = new Date(today); y.setDate(y.getDate() - 1); if (day.getTime() !== y.getTime()) return false; }
          if (filters.period === 'week') { const w = new Date(today); w.setDate(w.getDate() - 7); if (day < w) return false; }
          if (filters.period === 'month') { const m = new Date(today); m.setDate(m.getDate() - 30); if (day < m) return false; }
        }
        return true;
      });
    },

    exportExcel(moduleKey, useFiltered) {
      if (!window.XLSX) return alert('Biblioteca Excel (SheetJS) não carregada. Aguarde ou recarregue a página.');
      let list = this.caches[moduleKey] || [];
      if (useFiltered) list = this.filterData(list, this.getFilterValues(moduleKey), moduleKey);
      if (!Array.isArray(list) || list.length === 0) return alert('Nenhum registro encontrado para exportar.');
      const loggedUser = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;
      const meta = [
        [`RELATÓRIO: ${REPORT_TITLES[moduleKey] || moduleKey.toUpperCase()}`],
        ['Data da Exportação:', new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR')],
        ['Usuário Responsável:', loggedUser ? `${loggedUser.name || ''} (${loggedUser.username || loggedUser.id || ''})` : 'Sistema'],
        ['Empresa de Origem:', loggedUser ? (loggedUser.empresa_id || loggedUser.company_id || 'Todas') : 'Todas'],
        ['Unidade Vinculada:', loggedUser ? unitName(loggedUser.unitId || 'Todas') : 'Todas'],
        []
      ];
      const rows = list.map(item => mapRow(moduleKey, item));
      const ws = XLSX.utils.aoa_to_sheet(meta);
      XLSX.utils.sheet_add_json(ws, rows, { origin: 'A7' });
      const width = rows[0] ? Object.keys(rows[0]).map(k => ({ wch: Math.max(16, Math.min(45, String(k).length + 4)) })) : [];
      ws['!cols'] = width;
      applyHyperlinks(ws);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dados');
      XLSX.writeFile(wb, `${slug(REPORT_TITLES[moduleKey] || moduleKey)}_${Date.now()}.xlsx`);
    },

    getCollectedFiles() {
      const files = [];
      const add = (url, type, item, module) => {
        const link = mediaUrl(url);
        if (!link || link === '—') return;
        files.push({
          name: link.split('/').pop().split('?')[0] || 'arquivo',
          type,
          client: pick(item, ['name','client','cliente_nome','cliente','cliente_nome_fantasia']) || '—',
          vendedor: pick(item, ['vendedor','vendedor_solicitante','seller_name']) || userName(pick(item, ['userId','user_id','vendedor_id','seller_id'])),
          unidade: unitName(pick(item, ['unitId','unit_id'])),
          date: formatDate(pick(item, ['created_at','createdAt','date','data'])),
          module,
          relatedId: pick(item, ['id']) || '—',
          url: link
        });
      };
      const clients = getStoreList('getClients');
      clients.forEach(c => ['photoFachada','photoInterna01','photoInterna02','photoInterna03','photoRua01','photoRua02','photoCnpj'].forEach(k => add(c[k], labelMedia(k), c, 'Clientes')));
      getStoreList('getExpenses').forEach(e => { add(e.foto_odometro || e.photoOdometro, 'Imagem do Odômetro', e, 'Despesas'); add(e.foto_comprovante || e.photo || e.photoComprovante, 'Imagem do Comprovante', e, 'Despesas'); });
      getStoreList('getMovements').forEach(m => ['foto_equipamento_url','foto_antes_url','foto_depois_url','video_url','fotoAntigo','fotoNovo','fotoRecolha','fotoAntes','fotoDepois'].forEach(k => add(m[k], labelMedia(k), m, 'Movimentações')));
      getStoreList('getTickets').forEach(t => ['defectPhoto','defectVideo','fotoAntes','fotoDepois','fotoPlaqueta','videoAtendimento'].forEach(k => add(t[k], labelMedia(k), t, 'Chamados')));
      return files;
    },

    renderExportacaoArquivosPage() {
      const tbody = document.getElementById('files-table-body');
      if (!tbody) return;
      const files = this.getCollectedFiles();
      this.caches['exportar-arquivos'] = files;
      tbody.innerHTML = files.map(f => `<tr><td>${escapeHtml(f.name)}</td><td>${escapeHtml(f.type)}</td><td>${escapeHtml(f.client)}</td><td>${escapeHtml(f.vendedor)}</td><td>${escapeHtml(f.unidade)}</td><td>${escapeHtml(f.date)}</td><td>${escapeHtml(f.module)}</td><td>${escapeHtml(f.relatedId)}</td><td><a href="${escapeAttr(f.url)}" target="_blank" class="btn btn-secondary btn-sm">Ver / Baixar</a></td></tr>`).join('') || '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text-muted);">Nenhum arquivo encontrado.</td></tr>';
    },

    exportFilesExcel() {
      if (!window.XLSX) return alert('Biblioteca Excel não carregada.');
      const rows = this.getCollectedFiles().map(f => ({ 'Nome do Arquivo': f.name, 'Tipo de Arquivo': f.type, 'Cliente Relacionado': f.client, 'Vendedor': f.vendedor, 'Unidade': f.unidade, 'Data de Envio': f.date, 'Módulo de Origem': f.module, 'Registro Relacionado': f.relatedId, 'Link de Download': f.url }));
      if (!rows.length) return alert('Nenhum arquivo para exportar.');
      const ws = XLSX.utils.json_to_sheet(rows); applyHyperlinks(ws); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Arquivos'); XLSX.writeFile(wb, `arquivos_midias_${Date.now()}.xlsx`);
    }
  };

  function initUIInterceptors() {
    if (!window.UI) return;
    Object.keys(FiltersManager.configs).forEach(moduleKey => {
      const config = FiltersManager.configs[moduleKey];
      const method = config.renderMethod;
      if (UI[method] && !UI['_original_' + method]) {
        UI['_original_' + method] = UI[method];
        UI[method] = function(data) {
          if (Array.isArray(data)) {
            FiltersManager.caches[moduleKey] = data;
            FiltersManager.ensureFilterPanel(moduleKey);
            const filtered = FiltersManager.filterData(data, FiltersManager.getFilterValues(moduleKey), moduleKey);
            return UI['_original_' + method].call(UI, filtered);
          }
          const result = UI['_original_' + method].apply(UI, arguments);
          if (result && typeof result.then === 'function') {
            return result.then(fetched => {
              if (Array.isArray(fetched)) {
                FiltersManager.caches[moduleKey] = fetched;
                FiltersManager.ensureFilterPanel(moduleKey);
                return UI['_original_' + method].call(UI, FiltersManager.filterData(fetched, FiltersManager.getFilterValues(moduleKey), moduleKey));
              }
              return fetched;
            });
          }
          FiltersManager.ensureFilterPanel(moduleKey);
          return result;
        };
      }
    });
  }

  function mapRow(moduleKey, item) {
    if (moduleKey === 'despesas') return expenseRow(item);
    if (moduleKey === 'chamados') return ticketRow(item);
    if (moduleKey === 'movimentacao') return movementRow(item);
    if (moduleKey === 'clientes' || moduleKey === 'aprovacao') return clientRow(item);
    return genericRow(item);
  }

  function expenseRow(e) {
    return {
      'ID': value(pick(e, ['id'])),
      'Data': formatDate(pick(e, ['date','data','created_at','createdAt'])),
      'Hora': value(pick(e, ['time','hora'])),
      'Vendedor Solicitante': value(pick(e, ['vendedor','vendedor_nome']) || userName(pick(e, ['userId','user_id','usuario_id']))),
      'Unidade Vinculada': value(unitName(pick(e, ['unitId','unit_id','unidade']))),
      'Finalidade': value(pick(e, ['finalidade','category','categoria'])),
      'Tipo de Operação': value(pick(e, ['operacao','operation','tipo_operacao'])),
      'Veículo': value(pick(e, ['veiculo','vehicle'])),
      'Quilometragem (KM)': value(pick(e, ['km','quilometragem'])),
      'Valor (R$)': money(pick(e, ['value','valor','amount'])),
      'Observação': value(pick(e, ['observation','observacao','description','descreva'])),
      'Status': value(pick(e, ['status'])),
      'Empresa': value(pick(e, ['empresa_id','company_id','empresa'])),
      'Usuário Responsável': value(userName(pick(e, ['userId','user_id','usuario_id']))),
      'Link da Imagem do Odômetro': mediaUrl(pick(e, ['foto_odometro','photoOdometro','odometerPhoto'])),
      'Link da Imagem do Comprovante': mediaUrl(pick(e, ['foto_comprovante','photo','photoComprovante','receiptPhoto'])),
      'Outras Mídias': mediaList(e, ['media','midias','attachments','anexos'])
    };
  }

  function ticketRow(t) {
    return {
      'OS': value(pick(t, ['id','os'])),
      'Data de Abertura': formatDate(pick(t, ['created_at','createdAt','date','data'])),
      'Hora de Abertura': value(pick(t, ['startTime','hora_inicio','time'])),
      'Mecânico Responsável': value(pick(t, ['mechanic','mecanico'])),
      'Unidade': value(unitName(pick(t, ['unitId','unit_id']))),
      'Vendedor Responsável': value(pick(t, ['vendedor','seller','seller_name']) || userName(pick(t, ['userId','user_id']))),
      'Tipo de Equipamento': value(pick(t, ['equipmentType','tipo_equipamento'])),
      'Patrimônio / Serial': value(pick(t, ['equipmentSerial','patrimonio','serial'])),
      'Cliente': value(pick(t, ['client','cliente'])),
      'Nome Fantasia': value(pick(t, ['fantasyName','nomeFantasia'])),
      'Cidade': value(pick(t, ['city','cidade'])),
      'Endereço': value(pick(t, ['address','endereco'])),
      'Descrição Simplificada da Falha': value(pick(t, ['title','falha','falha_relatada'])),
      'Prioridade': value(pick(t, ['priority','prioridade'])),
      'Peças Utilizadas': listText(pick(t, ['parts','pecas'])),
      'Serviços Executados': listText(pick(t, ['services','servicos'])),
      'Descrição do Problema': value(pick(t, ['faultDescription','descricao_falha'])),
      'Solução Aplicada': value(pick(t, ['solutionDescription','solucao'])),
      'Estado Pós Atendimento': value(pick(t, ['eqStatusAfter','estado_pos'])),
      'Carga de Gás (g)': value(pick(t, ['gasCharge','carga_gas'])),
      'Observações': value(pick(t, ['additionalNotes','observations','observacoes'])),
      'Link da Foto do Defeito': mediaUrl(pick(t, ['defectPhoto'])),
      'Link do Vídeo do Defeito': mediaUrl(pick(t, ['defectVideo'])),
      'Link da Foto Antes do Reparo': mediaUrl(pick(t, ['fotoAntes'])),
      'Link da Foto Depois do Reparo': mediaUrl(pick(t, ['fotoDepois'])),
      'Link da Foto da Plaqueta': mediaUrl(pick(t, ['fotoPlaqueta'])),
      'Link do Vídeo do Atendimento': mediaUrl(pick(t, ['videoAtendimento'])),
      'Status': value(pick(t, ['status'])),
      'Hora de Conclusão': value(pick(t, ['endTime','hora_conclusao']))
    };
  }

  function movementRow(m) {
    return {
      'ID': value(pick(m, ['id'])),
      'Data': formatDate(pick(m, ['created_at','createdAt','date','data'])),
      'Hora': formatTime(pick(m, ['created_at','createdAt','time','hora'])),
      'Tipo de Solicitação': value(pick(m, ['tipo_solicitacao','type','tipo'])),
      'Empresa/Base': value(pick(m, ['empresa','empresa_id','base'])),
      'Unidade': value(unitName(pick(m, ['unitId','unit_id','unidade']))),
      'Vendedor Solicitante': value(pick(m, ['vendedor_solicitante','seller','vendedor']) || userName(pick(m, ['vendedor_id','userId']))),
      'Código do Cliente': value(pick(m, ['cliente_codigo','clientCode'])),
      'Nome Fantasia': value(pick(m, ['cliente_nome','clientName','name'])),
      'Cidade': value(pick(m, ['cliente_cidade','clientCity','city'])),
      'Endereço Comercial': value(pick(m, ['cliente_endereco','clientAddress','address'])),
      'Vendedor Responsável': value(pick(m, ['cliente_vendedor','sellerName'])),
      'Patrimônio': value(pick(m, ['patrimonio','serial'])),
      'Modelo': value(pick(m, ['modelo','model'])),
      'Voltagem': value(pick(m, ['voltagem','voltage'])),
      'Patrimônio Novo': value(pick(m, ['patrimonio_novo','newPatrimonio'])),
      'Modelo Novo / Solicitado': value(pick(m, ['modelo_novo','requestedEqType'])),
      'Voltagem Nova': value(pick(m, ['voltagem_nova'])),
      'Quantidade': value(pick(m, ['quantidade','quantity'])),
      'Motivo / Detalhes': value(pick(m, ['detalhe_troca_adicao','motivo_recolhimento','observacao','motivo'])),
      'Status': value(pick(m, ['status'])),
      'Link da Foto do Equipamento': mediaUrl(pick(m, ['foto_equipamento_url','fotoAntigo','fotoRecolha'])),
      'Link da Foto Antes': mediaUrl(pick(m, ['foto_antes_url','fotoAntes'])),
      'Link da Foto Depois': mediaUrl(pick(m, ['foto_depois_url','fotoDepois','fotoNovo'])),
      'Link do Vídeo': mediaUrl(pick(m, ['video_url','videoTroca']))
    };
  }

  function clientRow(c) {
    return {
      'ID': value(pick(c, ['id'])),
      'Data do Cadastro': formatDate(pick(c, ['created_at','createdAt','date','data_cadastro'])),
      'Vendedor Responsável': value(pick(c, ['vendedor','seller_name']) || userName(pick(c, ['userId','user_id','seller_id']))),
      'Nome do Comércio': value(pick(c, ['name','nomeFantasia','tradeName'])),
      'Razão Social': value(pick(c, ['companyName','razaoSocial','razao_social'])),
      'CNPJ': value(pick(c, ['cnpj'])),
      'Inscrição Estadual': value(pick(c, ['ie','inscricaoEstadual','inscricao_estadual'])),
      'Categoria do Cliente': value(pick(c, ['category','categoria'])),
      'Telefone Comercial': value(pick(c, ['phone','telefone'])),
      'E-mail Comercial': value(pick(c, ['email'])),
      'Cidade': value(pick(c, ['city','cidade'])),
      'UF': value(pick(c, ['state','uf'])),
      'CEP': value(pick(c, ['cep','zipcode'])),
      'Rua / Logradouro': value(pick(c, ['street','logradouro'])),
      'Número': value(pick(c, ['number','numero'])),
      'Bairro': value(pick(c, ['neighborhood','bairro'])),
      'Endereço Completo': value(pick(c, ['addressFull','enderecoCompleto','address'])),
      'Localização do Comércio': value(pick(c, ['locationType','localizacaoComercio'])),
      'Pavimentação da Rua': value(pick(c, ['pavementType','pavimentacao'])),
      'Horário de Recebimento': value(pick(c, ['deliverySchedule','horarioRecebimento'])),
      'Unidade Vinculada': value(unitName(pick(c, ['unitId','unit_id']))),
      'Ponto Amaretto Próximo': value(pick(c, ['nearbyAmaretto','amarettoProximo'])),
      'Concorrência Próxima': value(pick(c, ['nearbyCompetitor','concorrenciaProxima'])),
      'Trabalha com Sorvete/Picolé': value(pick(c, ['iceCreamExperience','trabalhaSorvete'])),
      'Trabalhará com Duas Marcas': value(pick(c, ['dualBrandPreference','duasMarcas'])),
      'Quantidade de Equipamentos': value(pick(c, ['equipmentQty','quantidadeEquipamentos'])),
      'Tipo de Equipamento Solicitado': value(pick(c, ['requestedEqType','tipoEquipamentoSolicitado'])),
      'Equipamento que Pode Ser Enviado': value(pick(c, ['sendableEqType','equipamentoEnviado'])),
      'Produtos que Irá Trabalhar': listText(pick(c, ['products','produtos'])),
      'Média Prevista Mensal': money(pick(c, ['predictedAverage','mediaPrevista'])),
      'Valor da Primeira Compra': money(pick(c, ['firstOrderValue','valorPrimeiraCompra'])),
      'Forma de Pagamento Primeiro Pedido': value(pick(c, ['firstOrderPayment','pagamentoPrimeiroPedido'])),
      'Forma de Recompra': value(pick(c, ['repurchasePayment','formaRecompra'])),
      'Bonificação': value(pick(c, ['hasBonus','bonificacao'])),
      'Roteiro Indicado': value(pick(c, ['route','roteiro','sellerRoute'])),
      'Análise do Vendedor': value(pick(c, ['sellerAnalysis','analiseVendedor'])),
      'Link da Foto da Fachada': mediaUrl(pick(c, ['photoFachada'])),
      'Link da Foto Interna 01': mediaUrl(pick(c, ['photoInterna01'])),
      'Link da Foto Interna 02': mediaUrl(pick(c, ['photoInterna02'])),
      'Link da Foto Interna 03': mediaUrl(pick(c, ['photoInterna03'])),
      'Link da Foto Externa Rua 01': mediaUrl(pick(c, ['photoRua01'])),
      'Link da Foto Externa Rua 02': mediaUrl(pick(c, ['photoRua02'])),
      'Link da Foto do CNPJ': mediaUrl(pick(c, ['photoCnpj'])),
      'Status': value(pick(c, ['status']))
    };
  }

  function genericRow(item) {
    const out = {};
    Object.keys(item || {}).forEach(k => { out[toPtLabel(k)] = Array.isArray(item[k]) ? item[k].join(' | ') : value(item[k]); });
    return out;
  }

  function pick(obj, keys) { for (const k of keys) { if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]; } return ''; }
  function value(v) { return (v === undefined || v === null || v === '') ? '—' : v; }
  function money(v) { const n = Number(String(v ?? '').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.')); return Number.isFinite(n) && n !== 0 ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n) : (v ? String(v) : '—'); }
  function normalize(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function unitName(id) { if (!id) return ''; return (window.UI && UI.getUnitName && UI.getUnitName(id)) || id; }
  function userName(id) { if (!id) return ''; return (window.UI && UI.getUserName && UI.getUserName(id)) || id; }
  function parseDate(v) { if (!v) return null; if (/^\d{2}\/\d{2}\/\d{4}/.test(String(v))) { const [d,m,y] = String(v).split(/[\/\s,]+/); return new Date(y, m - 1, d); } const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  function formatDate(v) { const d = parseDate(v); return d ? d.toLocaleDateString('pt-BR') : value(v); }
  function formatTime(v) { if (!v) return '—'; if (/^\d{2}:\d{2}/.test(String(v))) return String(v).slice(0,5); const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); }
  function listText(v) { if (!v) return '—'; if (Array.isArray(v)) return v.join(' | '); try { const a = JSON.parse(v); if (Array.isArray(a)) return a.join(' | '); } catch(_) {} return String(v); }
  function mediaList(obj, keys) { const arr = []; keys.forEach(k => { const v = obj && obj[k]; if (Array.isArray(v)) v.forEach(x => arr.push(mediaUrl(x))); else if (v) arr.push(mediaUrl(v)); }); return arr.filter(x => x && x !== '—').join(' | ') || '—'; }
  function mediaUrl(url) { let raw = Array.isArray(url) ? url[0] : url; if (!raw) return '—'; if (typeof raw === 'object') raw = raw.url || raw.path || raw.src || ''; raw = String(raw || '').trim(); if (!raw || ['null','undefined','—','-'].includes(raw.toLowerCase()) || raw.startsWith('data:')) return raw.startsWith('data:') ? 'Mídia salva em base64/local; reenviar para gerar link público.' : '—'; if (window.TempPhotosCache && window.TempPhotosCache[raw]) raw = window.TempPhotosCache[raw]; if (raw.startsWith('http://') || raw.startsWith('https://')) return raw; if (raw.startsWith('/')) return window.location.origin + raw; return window.location.origin + '/' + raw.replace(/^\/+/, ''); }
  function labelMedia(k) { return ({ photoFachada:'Foto da Fachada', photoInterna01:'Foto Interna 01', photoInterna02:'Foto Interna 02', photoInterna03:'Foto Interna 03', photoRua01:'Foto Externa Rua 01', photoRua02:'Foto Externa Rua 02', photoCnpj:'Foto do CNPJ', foto_odometro:'Imagem do Odômetro', foto_comprovante:'Imagem do Comprovante', foto_antes_url:'Foto Antes', foto_depois_url:'Foto Depois', foto_equipamento_url:'Foto do Equipamento', video_url:'Vídeo', defectPhoto:'Foto do Defeito', defectVideo:'Vídeo do Defeito', fotoAntes:'Foto Antes', fotoDepois:'Foto Depois', fotoPlaqueta:'Foto da Plaqueta', videoAtendimento:'Vídeo do Atendimento' }[k] || k); }
  function getStoreList(method) { try { return (window.Store && Store[method] && Store[method]()) || []; } catch(_) { return []; } }
  function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(v) { return escapeHtml(v).replace(/`/g, '&#96;'); }
  function slug(v) { return normalize(v).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'') || 'relatorio'; }
  function toPtLabel(k) { return String(k).replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^\w/, c => c.toUpperCase()); }
  function applyHyperlinks(ws) { const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1'); for (let C = range.s.c; C <= range.e.c; C++) { const header = ws[XLSX.utils.encode_cell({ r: 6, c: C })]?.v || ws[XLSX.utils.encode_cell({ r: 0, c: C })]?.v || ''; if (!normalize(header).includes('link')) continue; for (let R = range.s.r; R <= range.e.r; R++) { const addr = XLSX.utils.encode_cell({ r: R, c: C }); const cell = ws[addr]; const val = cell && String(cell.v || ''); if (/^https?:\/\//.test(val)) cell.l = { Target: val, Tooltip: 'Abrir mídia' }; } } }

  window.addEventListener('hashchange', () => setTimeout(() => Object.keys(FiltersManager.configs).forEach(k => FiltersManager.ensureFilterPanel(k)), 200));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUIInterceptors); else initUIInterceptors();
  setInterval(initUIInterceptors, 1200);
  window.FiltersManager = FiltersManager;
})();



/* Correção adicional 01/07 - PDFs completos via jsPDF, download direto e sem aba about:blank */
(function(){
  'use strict';
  if (window.__ccPdfJsPdfCompleto0107) return;
  window.__ccPdfJsPdfCompleto0107 = true;

  const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      if (window.jspdf && window.jspdf.jsPDF) return resolve();
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, {once:true});
        existing.addEventListener('error', reject, {once:true});
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function val(v){
    if (v === undefined || v === null || v === '' || v === 'null' || v === 'undefined') return '—';
    return String(v);
  }

  function money(v){
    if (v === undefined || v === null || v === '') return '—';
    if (typeof v === 'number') return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
    let raw = String(v).replace(/[^0-9,.-]/g,'').trim();
    if (!raw) return '—';
    if (raw.includes(',')) raw = raw.replace(/\./g,'').replace(',', '.');
    const n = Number(raw);
    return Number.isFinite(n) ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n) : String(v);
  }

  function unitName(id){ return (window.UI && UI.getUnitName && id) ? UI.getUnitName(id) : val(id); }
  function userName(id){ return (window.UI && UI.getUserName && id) ? UI.getUserName(id) : val(id); }
  function expenseUser(exp){
    return (window.UI && UI.getExpenseUserName) ? UI.getExpenseUserName(exp) : (exp && (exp.vendedor || exp.vendedor_nome || userName(exp.userId || exp.usuario_id || exp.user_id)));
  }

  function list(v){
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : [parsed]; } catch(_) {}
    return String(v).split(',').map(x=>x.trim()).filter(Boolean);
  }

  function mediaUrl(url){
    let raw = url;
    if (Array.isArray(raw)) raw = raw[0];
    if (raw && typeof raw === 'object') raw = raw.url || raw.path || raw.src || '';
    raw = String(raw || '').trim();
    if (!raw || ['null','undefined','/uploads/null','/uploads/undefined','/uploads/'].includes(raw)) return '';
    if (window.TempPhotosCache && window.TempPhotosCache[raw]) raw = window.TempPhotosCache[raw];
    if (raw.startsWith('data:')) return raw;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/')) return window.location.origin + raw;
    return window.location.origin + '/' + raw.replace(/^\/+/, '');
  }

  function slug(v){
    return String(v || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'arquivo';
  }

  async function imageToDataUrl(url){
    const src = mediaUrl(url);
    if (!src) return '';
    if (src.startsWith('data:image/')) return src;
    try {
      const res = await fetch(src, {mode:'cors', credentials:'same-origin'});
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      return await new Promise((resolve,reject)=>{
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('Não foi possível carregar imagem no PDF:', src, err);
      return '';
    }
  }

  function setupDoc(title){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:'p', unit:'mm', format:'a4'});
    doc.setProperties({ title });
    return doc;
  }

  function pageBorder(doc, title){
    doc.setDrawColor(37,99,235);
    doc.setLineWidth(0.8);
    doc.rect(7,7,196,283);
    doc.setFillColor(37,99,235);
    doc.rect(7,7,196,17,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(12);
    doc.setTextColor(255,255,255);
    doc.text(title, 12, 18);
    doc.setTextColor(0,0,0);
  }

  function ensurePage(doc, y, needed, title){
    if (y + needed <= 280) return y;
    doc.addPage();
    pageBorder(doc, title);
    return 32;
  }

  function section(doc, y, title, reportTitle){
    y = ensurePage(doc, y, 12, reportTitle);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(37,99,235);
    doc.text(title, 12, y);
    doc.setDrawColor(210,210,210);
    doc.line(12, y + 2, 198, y + 2);
    doc.setTextColor(0,0,0);
    return y + 8;
  }

  function field(doc, x, y, label, value, w){
    w = w || 85;
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(80,80,80);
    doc.text(String(label).toUpperCase(), x, y);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(0,0,0);
    const lines = doc.splitTextToSize(val(value), w);
    doc.text(lines, x, y + 5);
    return y + 5 + (lines.length * 4);
  }

  function fieldBox(doc, x, y, label, value, w, h){
    w = w || 85;
    h = h || 16;
    doc.setDrawColor(220,220,220);
    doc.roundedRect(x-2, y-4, w+4, h, 1.5, 1.5);
    return field(doc, x, y, label, value, w);
  }

  function textBlock(doc, y, label, value, reportTitle){
    const lines = doc.splitTextToSize(val(value), 180);
    const h = 13 + lines.length * 4;
    y = ensurePage(doc, y, h, reportTitle);
    doc.setDrawColor(220,220,220);
    doc.roundedRect(12, y-4, 186, h, 1.5, 1.5);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(80,80,80);
    doc.text(String(label).toUpperCase(), 15, y);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(0,0,0);
    doc.text(lines, 15, y+5);
    return y + h + 3;
  }

  async function addImageBox(doc, x, y, w, h, label, url){
    doc.setDrawColor(210,210,210);
    doc.roundedRect(x, y, w, h, 2, 2);
    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.text(label, x+3, y+5);
    const data = await imageToDataUrl(url);
    if (data) {
      try {
        const type = data.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(data, type, x+3, y+8, w-6, h-14, undefined, 'FAST');
      } catch (err) {
        console.warn('Erro ao inserir imagem:', err);
        doc.setFont('helvetica','normal');
        doc.setFontSize(8);
        doc.text('Imagem anexada, mas não foi possível inserir no PDF.', x+3, y+18);
      }
    } else {
      doc.setFont('helvetica','normal');
      doc.setFontSize(8);
      doc.setTextColor(120,120,120);
      doc.text('Imagem não enviada ou indisponível.', x+3, y+18);
      doc.setTextColor(0,0,0);
    }
    const link = mediaUrl(url);
    if (link && !link.startsWith('data:')) {
      doc.setFont('helvetica','normal');
      doc.setFontSize(6);
      doc.setTextColor(37,99,235);
      const lines = doc.splitTextToSize(link, w-6);
      doc.text(lines.slice(0,2), x+3, y+h-5);
      try { doc.link(x+3, y+h-11, w-6, 8, {url: link}); } catch(_) {}
      doc.setTextColor(0,0,0);
    }
  }

  function footer(doc){
    const pages = doc.internal.getNumberOfPages();
    for (let i=1;i<=pages;i++){
      doc.setPage(i);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7);
      doc.setTextColor(100,100,100);
      doc.text(`Controle de Campo • Gerado em ${new Date().toLocaleString('pt-BR')} • Página ${i} de ${pages}`, 105, 287, {align:'center'});
      doc.setTextColor(0,0,0);
    }
  }

  async function getExpenseById(id){
    let arr = [];
    if (Array.isArray(window.AppExpensesCache)) arr = window.AppExpensesCache;
    if (!arr.length && window.Store && Store.getExpenses) arr = Store.getExpenses() || [];
    let exp = arr.find(e => String(e.id) === String(id));
    if (!exp && window.App && App.fetchFromApi) {
      try { exp = await App.fetchFromApi('/api/despesas-reembolsos/' + encodeURIComponent(id)); } catch(_){}
    }
    return exp;
  }

  async function generateExpensePdf(id){
    try {
      await loadScript(JSPDF_CDN);
      const exp = await getExpenseById(id);
      if (!exp) return alert('Despesa não encontrada para gerar PDF.');

      const title = 'COMPROVANTE DE DESPESA DE VIAGEM';
      const doc = setupDoc(`Despesa ${exp.id}`);
      pageBorder(doc, title);

      let y = 34;
      doc.setFont('helvetica','bold');
      doc.setFontSize(11);
      doc.text(`Despesa ID: #${val(exp.id)}`, 12, y);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, 120, y);
      y += 8;

      fieldBox(doc, 14, y, 'Data / Hora', [exp.date || exp.data || exp.created_at || exp.createdAt, exp.time || exp.hora].filter(Boolean).join(' às '), 80);
      fieldBox(doc, 108, y, 'Status', exp.status, 80);
      y += 20;

      y = section(doc, y, '1. Dados da Despesa', title);
      fieldBox(doc, 14, y, 'Vendedor Solicitante', exp.vendedor || exp.vendedor_nome || expenseUser(exp), 80);
      fieldBox(doc, 108, y, 'Unidade Vinculada', unitName(exp.unitId || exp.unit_id || exp.unidade), 80);
      y += 20;
      const finalidade = (exp.finalidade === 'Outro' || exp.finalidade === 'Outros') ? `Outro${exp.descreva ? ' - ' + exp.descreva : ''}` : (exp.finalidade || exp.category || exp.categoria);
      fieldBox(doc, 14, y, 'Finalidade', finalidade, 80);
      fieldBox(doc, 108, y, 'Tipo de Operação', exp.operacao || exp.operation || exp.tipo_operacao, 80);
      y += 20;
      fieldBox(doc, 14, y, 'Valor', money(exp.value ?? exp.valor ?? exp.amount), 80);
      fieldBox(doc, 108, y, 'Empresa', exp.empresa_id || exp.company_id || exp.empresa, 80);
      y += 20;

      if ((String(exp.finalidade || '').toLowerCase() === 'abastecimento') || exp.veiculo || exp.km) {
        y = section(doc, y, '2. Dados do Abastecimento / Veículo', title);
        fieldBox(doc, 14, y, 'Veículo', exp.veiculo || exp.vehicle, 80);
        fieldBox(doc, 108, y, 'Quilometragem (KM)', exp.km || exp.quilometragem, 80);
        y += 20;
      }

      y = section(doc, y, '3. Observações e Aprovação', title);
      y = textBlock(doc, y, 'Observação', exp.observation || exp.observacao || exp.description || exp.descreva, title);
      y = textBlock(doc, y, 'Histórico / Parecer', exp.approval_note || exp.motivo || exp.justificativa || `Status atual: ${val(exp.status)}`, title);

      y = section(doc, y, '4. Anexos / Comprovantes Fotográficos', title);
      y = ensurePage(doc, y, 88, title);
      await addImageBox(doc, 12, y, 88, 82, 'Comprovante', exp.foto_comprovante || exp.photo || exp.photoComprovante || exp.receiptPhoto);
      await addImageBox(doc, 110, y, 88, 82, 'Odômetro / KM', exp.foto_odometro || exp.photoOdometro || exp.odometerPhoto);
      y += 88;

      footer(doc);
      doc.save(`Despesa-${slug(exp.id)}.pdf`);
      if (window.App && App.showToast) App.showToast('PDF da despesa baixado com sucesso.');
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF da despesa: ' + (err.message || err));
    }
  }

  function ticketFromFormOrStore(id){
    const tickets = (window.Store && Store.getTickets && Store.getTickets()) || [];
    const saved = tickets.find(t => String(t.id) === String(id)) || {};

    const form = document.getElementById('ticket-form');
    const hasForm = form && String(form.dataset.ticketId || '') === String(id);
    if (!hasForm) {
      return { ...saved, clientCode: saved.clientCode || saved.cliente_codigo || '', clientSeller: saved.clientSeller || saved.cliente_vendedor || '', seller: userName(saved.userId), unit: unitName(saved.unitId) };
    }

    const startDateVal = document.getElementById('ticket-start-date')?.value || '';
    const dateFormatted = startDateVal ? startDateVal.split('-').reverse().join('/') : (saved.date || '');
    const parts = [];
    document.querySelectorAll('#modal-ficha-tecnica .btn-part-toggle[data-part].active').forEach(btn => parts.push(btn.getAttribute('data-part')));
    const outraPecaInput = document.getElementById('ticket-outra-peca');
    if (outraPecaInput && outraPecaInput.value.trim() && document.querySelector('#modal-ficha-tecnica .btn-part-toggle[data-part="Outra Peça"].active')) parts.push('Outra: ' + outraPecaInput.value.trim());

    const services = [];
    document.querySelectorAll('#modal-ficha-tecnica .btn-part-toggle[data-service].active').forEach(btn => services.push(btn.getAttribute('data-service')));
    const outroServicoInput = document.getElementById('ticket-outro-servico');
    if (outroServicoInput && outroServicoInput.value.trim() && document.querySelector('#modal-ficha-tecnica .btn-part-toggle[data-service="Outro Serviço"].active')) services.push('Outro: ' + outroServicoInput.value.trim());

    const imgUrl = (imgId, fallback) => {
      const img = document.getElementById(imgId);
      return (img && img.src && img.parentElement && img.parentElement.style.display !== 'none') ? img.src : (fallback || '');
    };

    return {
      ...saved,
      id,
      date: dateFormatted,
      status: saved.status || 'Em Atendimento',
      mechanic: document.getElementById('ticket-mechanic')?.value || saved.mechanic || '',
      startTime: document.getElementById('ticket-start-time')?.value || saved.startTime || '',
      endTime: document.getElementById('ticket-end-time')?.value || saved.endTime || '',
      equipmentType: document.getElementById('ticket-eq-type-text')?.value || saved.equipmentType || '',
      equipmentSerial: document.getElementById('ticket-eq-serial')?.value || saved.equipmentSerial || '',
      client: document.getElementById('ticket-client-name')?.value || saved.client || '',
      city: saved.city || '',
      address: saved.address || '',
      clientCode: saved.clientCode || saved.cliente_codigo || '',
      clientSeller: saved.clientSeller || saved.cliente_vendedor || '',
      seller: document.getElementById('ticket-seller-text')?.value || userName(saved.userId),
      unit: document.getElementById('ticket-unit-text')?.value || unitName(saved.unitId),
      title: document.getElementById('ticket-title')?.value || saved.title || '',
      priority: document.getElementById('ticket-priority-text')?.value || saved.priority || '',
      faultDescription: document.getElementById('ticket-fault-description')?.value || saved.faultDescription || '',
      solutionDescription: document.getElementById('ticket-solution-description')?.value || saved.solutionDescription || '',
      eqStatusAfter: document.getElementById('ticket-eq-status-after')?.value || saved.eqStatusAfter || '',
      gasCharge: document.getElementById('ticket-gas-charge')?.value || saved.gasCharge || '',
      additionalNotes: document.getElementById('ticket-additional-notes')?.value || saved.additionalNotes || '',
      parts: parts.length ? parts : saved.parts,
      services: services.length ? services : saved.services,
      fotoAntes: imgUrl('preview-img-ticket-foto-antes', saved.fotoAntes),
      fotoDepois: imgUrl('preview-img-ticket-foto-depois', saved.fotoDepois),
      fotoPlaqueta: imgUrl('preview-img-ticket-foto-plaqueta', saved.fotoPlaqueta),
      defectPhoto: saved.defectPhoto || '',
      defectVideo: saved.defectVideo || '',
      videoAtendimento: saved.videoAtendimento || ''
    };
  }

  async function generateTicketPdfById(id){
    try {
      await loadScript(JSPDF_CDN);
      const ticket = ticketFromFormOrStore(id);
      if (!ticket || !ticket.id) return alert('Chamado não encontrado.');

      const title = 'FICHA TÉCNICA DE MANUTENÇÃO - ORDEM DE SERVIÇO';
      const doc = setupDoc(`Ficha Técnica ${ticket.id}`);
      pageBorder(doc, title);

      let y = 34;
      doc.setFont('helvetica','bold');
      doc.setFontSize(11);
      doc.text(`OS: #${val(ticket.id)}`, 12, y);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.text(`Status: ${val(ticket.status)}`, 120, y);
      y += 10;

      y = section(doc, y, '1. Identificação do Atendimento', title);
      fieldBox(doc, 14, y, 'Mecânico Responsável', ticket.mechanic, 80);
      fieldBox(doc, 108, y, 'Data de Realização', ticket.date, 80);
      y += 20;
      fieldBox(doc, 14, y, 'Hora de Início / Conclusão', `${val(ticket.startTime)} / ${val(ticket.endTime)}`, 80);
      fieldBox(doc, 108, y, 'Unidade Vinculada', ticket.unit || unitName(ticket.unitId), 80);
      y += 22;

      y = section(doc, y, '2. Identificação do Equipamento', title);
      fieldBox(doc, 14, y, 'Tipo de Equipamento', ticket.equipmentType, 54);
      fieldBox(doc, 75, y, 'Nº Patrimônio / Serial', ticket.equipmentSerial, 54);
      fieldBox(doc, 136, y, 'Cliente Vinculado', ticket.client, 54);
      y += 20;
      fieldBox(doc, 14, y, 'Código do Cliente', ticket.clientCode || ticket.cliente_codigo || '-', 54);
      fieldBox(doc, 75, y, 'Vendedor do Cliente', ticket.clientSeller || ticket.cliente_vendedor || '-', 54);
      fieldBox(doc, 136, y, 'Vendedor Solicitante', ticket.seller || userName(ticket.userId), 54);
      y += 20;
      fieldBox(doc, 14, y, 'Prioridade', ticket.priority, 54);
      fieldBox(doc, 75, y, 'Estado Pós Atendimento', ticket.eqStatusAfter, 54);
      y += 20;
      fieldBox(doc, 14, y, 'Cidade', ticket.city || '-', 54);
      fieldBox(doc, 75, y, 'Endereço', ticket.address || '-', 116);
      y += 20;
      y = textBlock(doc, y, 'Descrição Simplificada da Falha', ticket.title, title);

      y = section(doc, y, '3. Peças Utilizadas', title);
      const parts = list(ticket.parts);
      y = ensurePage(doc, y, 14 + Math.ceil((parts.length || 1)/4)*8, title);
      doc.setFont('helvetica','bold');
      doc.setFontSize(8);
      if (parts.length) {
        let x = 14;
        parts.forEach(p => {
          const w = Math.min(55, Math.max(25, doc.getTextWidth(String(p)) + 8));
          if (x + w > 195) { x = 14; y += 8; }
          doc.roundedRect(x, y-5, w, 7, 1.5, 1.5);
          doc.text(String(p).toUpperCase(), x+3, y);
          x += w + 4;
        });
      } else {
        doc.text('—', 14, y);
      }
      y += 14;

      y = section(doc, y, '4. Serviços Executados', title);
      const services = list(ticket.services);
      y = ensurePage(doc, y, 14 + Math.ceil((services.length || 1)/4)*8, title);
      doc.setFont('helvetica','bold');
      doc.setFontSize(8);
      if (services.length) {
        let x = 14;
        services.forEach(s => {
          const w = Math.min(55, Math.max(25, doc.getTextWidth(String(s)) + 8));
          if (x + w > 195) { x = 14; y += 8; }
          doc.roundedRect(x, y-5, w, 7, 1.5, 1.5);
          doc.text(String(s).toUpperCase(), x+3, y);
          x += w + 4;
        });
      } else {
        doc.text('—', 14, y);
      }
      y += 14;

      y = section(doc, y, '5. Laudo e Diagnóstico Técnico', title);
      y = textBlock(doc, y, 'Descrição Detalhada do Problema Encontrado', ticket.faultDescription, title);
      y = textBlock(doc, y, 'Solução Aplicada / Laudo Técnico', ticket.solutionDescription, title);
      fieldBox(doc, 14, y, 'Carga de Gás (gramas)', ticket.gasCharge ? `${ticket.gasCharge}g` : '—', 80);
      fieldBox(doc, 108, y, 'Observações Adicionais', ticket.additionalNotes, 80);
      y += 23;

      y = section(doc, y, '6. Fotos e Vídeo da Visita', title);
      y = ensurePage(doc, y, 145, title);
      await addImageBox(doc, 12, y, 88, 66, 'Foto do Defeito', ticket.defectPhoto);
      await addImageBox(doc, 110, y, 88, 66, 'Foto Antes do Reparo', ticket.fotoAntes);
      y += 72;
      y = ensurePage(doc, y, 76, title);
      await addImageBox(doc, 12, y, 88, 66, 'Foto Depois do Reparo', ticket.fotoDepois);
      await addImageBox(doc, 110, y, 88, 66, 'Foto da Plaqueta', ticket.fotoPlaqueta);
      y += 72;

      const v1 = mediaUrl(ticket.defectVideo);
      const v2 = mediaUrl(ticket.videoAtendimento);
      if (v1 || v2) {
        y = ensurePage(doc, y, 16, title);
        doc.setFont('helvetica','bold');
        doc.setFontSize(8);
        doc.text('Links de vídeos:', 14, y);
        y += 5;
        doc.setFont('helvetica','normal');
        doc.setFontSize(7);
        doc.setTextColor(37,99,235);
        if (v1) { doc.text(doc.splitTextToSize('Vídeo do defeito: ' + v1, 180), 14, y); y += 8; }
        if (v2) { doc.text(doc.splitTextToSize('Vídeo do atendimento: ' + v2, 180), 14, y); y += 8; }
        doc.setTextColor(0,0,0);
      }

      y = ensurePage(doc, y, 35, title);
      y += 22;
      doc.line(20, y, 90, y);
      doc.line(120, y, 190, y);
      doc.setFont('helvetica','bold');
      doc.setFontSize(8);
      doc.text('Assinatura do Técnico', 55, y+5, {align:'center'});
      doc.text('Assinatura do Cliente / Responsável', 155, y+5, {align:'center'});

      footer(doc);
      doc.save(`Ficha-Tecnica-${slug(ticket.id)}.pdf`);
      if (window.App && App.showToast) App.showToast('PDF do chamado baixado com sucesso.');
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF do chamado: ' + (err.message || err));
    }
  }

  function install(){
    if (!window.App) return false;

    App.generateExpenseComprovantePdf = generateExpensePdf;
    App.generateRegisteredExpensePdf = generateExpensePdf;
    App.generateRegisteredExpensePDF = generateExpensePdf;
    App.generateExpenseReceiptPdf = generateExpensePdf;
    App.generateExpenseProofPdf = generateExpensePdf;

    App.generateTicketPdf = generateTicketPdfById;
    App.generateTicketPdfFromForm = function(){
      const form = document.getElementById('ticket-form');
      const id = form && form.dataset.ticketId;
      if (!id) return alert('Nenhuma Ordem de Serviço carregada no formulário.');
      return generateTicketPdfById(id);
    };
    App.printTicketData = function(ticket){
      return generateTicketPdfById(ticket && ticket.id);
    };

    return true;
  }

  function start(){ install(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.addEventListener('hashchange', () => setTimeout(start, 300));
  setInterval(start, 1000);
})();
