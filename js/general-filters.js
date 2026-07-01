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
      clientes: { renderMethod: 'renderClients', tbodyId: 'clients-table-body', fields: ['search','empresa','unitId','city','category','status','vendedor','supervisor'] },
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
  function money(v) {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'number') {
    return Number.isFinite(v) ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';
  }
  let raw = String(v).trim().replace(/[^0-9,.-]/g, '');
  if (!raw) return '—';
  // Formato brasileiro: 1.234,56 -> 1234.56
  if (raw.includes(',')) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  }
  // Formato do banco/API: 140.00 deve continuar 140.00, não 14000
  const n = Number(raw);
  return Number.isFinite(n) ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n) : String(v);
}
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


/* Correção adicional 01/07 - Despesas: finalidade "Outro" deve liberar valor, data, comprovante e observação */
(function(){
  'use strict';

  if (window.__fixDespesaOutroCampos0107) return;
  window.__fixDespesaOutroCampos0107 = true;

  function showGroupByInput(id, visible){
    const input = document.getElementById(id);
    if (!input) return;
    const group = input.closest('.form-group') || input.parentElement;
    if (group) group.style.display = visible ? 'block' : 'none';
  }

  function setRequired(id, required){
    const el = document.getElementById(id);
    if (el) el.required = !!required;
  }

  function fixExpenseFields(){
    const finalidadeEl = document.getElementById('exp-finalidade');
    const finalidade = finalidadeEl ? String(finalidadeEl.value || '').trim() : '';

    const comuns = document.getElementById('group-exp-comuns');
    const outro = document.getElementById('group-exp-descreva');
    const abastecimento = document.getElementById('group-exp-abastecimento');

    /*
      Regra correta:
      - Todo tipo de despesa precisa liberar Valor, Data, Comprovante e Observação.
      - "Outro" também precisa liberar o campo Descreva.
      - "Abastecimento" libera também Veículo, KM e Odômetro.
    */
    if (comuns) comuns.style.display = 'block';
    if (outro) outro.style.display = finalidade === 'Outro' ? 'block' : 'none';
    if (abastecimento) abastecimento.style.display = finalidade === 'Abastecimento' ? 'block' : 'none';

    ['exp-val','exp-date','exp-comprovante-img','exp-obs'].forEach(id => showGroupByInput(id, true));

    setRequired('exp-descreva', finalidade === 'Outro');
    setRequired('exp-veiculo', finalidade === 'Abastecimento');
    setRequired('exp-km', finalidade === 'Abastecimento');
    setRequired('exp-odometro-img', finalidade === 'Abastecimento');

    // Comprovante deve ser obrigatório para todos os tipos, inclusive "Outro".
    setRequired('exp-comprovante-img', true);
    setRequired('exp-val', true);
    setRequired('exp-date', true);
  }

  function install(){
    const finalidadeEl = document.getElementById('exp-finalidade');
    if (finalidadeEl && finalidadeEl.dataset.fixOutroCampos !== '1') {
      finalidadeEl.dataset.fixOutroCampos = '1';
      finalidadeEl.addEventListener('change', function(){
        setTimeout(fixExpenseFields, 0);
        setTimeout(fixExpenseFields, 100);
      }, true);
    }

    const btnOpen = document.querySelector('#btn-open-expense-form, [onclick*="openExpenseForm"], [onclick*="Registrar Despesa"]');
    if (btnOpen && btnOpen.dataset.fixOutroCampos !== '1') {
      btnOpen.dataset.fixOutroCampos = '1';
      btnOpen.addEventListener('click', () => {
        setTimeout(fixExpenseFields, 100);
        setTimeout(fixExpenseFields, 400);
      }, true);
    }

    fixExpenseFields();
  }

  document.addEventListener('DOMContentLoaded', install);
  window.addEventListener('hashchange', () => setTimeout(install, 200));
  document.addEventListener('click', () => setTimeout(install, 80), true);
  setInterval(install, 800);
})();



/* Correção adicional 01/07 - PDFs completos e download direto, sem abrir about:blank/print automático */
(function(){
  'use strict';
  if (window.__ccPdfDownloadCompleto0107) return;
  window.__ccPdfDownloadCompleto0107 = true;

  const HTML2PDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';

  function esc(v){
    return String(v ?? '—').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function clean(v){
    if (v === undefined || v === null || v === '' || v === 'null' || v === 'undefined') return '—';
    return String(v);
  }
  function norm(v){
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  }
  function money(v){
    if (v === undefined || v === null || v === '') return '—';
    if (typeof v === 'number') return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
    let raw = String(v).replace(/[^0-9,.-]/g,'').trim();
    if (!raw) return '—';
    if (raw.includes(',')) raw = raw.replace(/\./g,'').replace(',','.');
    const n = Number(raw);
    return Number.isFinite(n) ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n) : String(v);
  }
  function unitName(id){ return (window.UI && UI.getUnitName && id) ? UI.getUnitName(id) : (id || '—'); }
  function userName(id){ return (window.UI && UI.getUserName && id) ? UI.getUserName(id) : (id || '—'); }
  function expenseUserName(exp){
    return (window.UI && UI.getExpenseUserName) ? UI.getExpenseUserName(exp) : (exp?.vendedor || exp?.vendedor_nome || userName(exp?.userId || exp?.usuario_id || exp?.user_id));
  }
  function parseArray(v){
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : [parsed]; } catch(_) {}
    return String(v).split(',').map(x => x.trim()).filter(Boolean);
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
  function photoBox(url, label){
    const src = mediaUrl(url);
    if (!src) return `<div class="photo-card"><div class="photo-label">${esc(label)}</div><div class="photo-empty">Imagem não enviada</div></div>`;
    return `<div class="photo-card"><div class="photo-label">${esc(label)}</div><img src="${esc(src)}" crossorigin="anonymous"><div class="photo-link">${esc(src)}</div></div>`;
  }
  function linkLine(url, label){
    const src = mediaUrl(url);
    return src ? `<div class="link-line"><b>${esc(label)}:</b> <a href="${esc(src)}">${esc(src)}</a></div>` : '';
  }
  function field(label, value){
    return `<div class="field"><span>${esc(label)}</span><strong>${esc(clean(value))}</strong></div>`;
  }
  function slug(v){
    return norm(v).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'arquivo';
  }

  function baseStyle(){
    return `
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#fff;color:#111;font-size:12px;line-height:1.35}
        .pdf-page{width:794px;min-height:1123px;background:#fff;padding:22px 24px;margin:0 auto}
        .header{background:#2563eb;color:#fff;padding:18px 20px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;gap:12px}
        .header h1{font-size:19px;margin:0;text-transform:uppercase;letter-spacing:.2px}
        .header .small{font-size:11px;opacity:.95;text-align:right}
        .subhead{border:2px solid #2563eb;border-top:0;padding:14px 18px;margin-bottom:14px}
        .section{border:1px solid #d1d5db;border-radius:8px;margin:12px 0;padding:12px;break-inside:avoid;page-break-inside:avoid}
        .section h2{font-size:13px;margin:0 0 9px;color:#1d4ed8;text-transform:uppercase;border-bottom:1px solid #d1d5db;padding-bottom:6px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px}
        .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 12px}
        .field{border-bottom:1px solid #eef2f7;padding:4px 0;min-height:25px}
        .field span{display:block;color:#4b5563;font-size:10px;text-transform:uppercase;font-weight:700}
        .field strong{display:block;font-size:12px;white-space:pre-wrap;word-break:break-word}
        .badges{display:flex;flex-wrap:wrap;gap:6px}
        .badge{border:1px solid #1d4ed8;color:#1d4ed8;border-radius:999px;padding:4px 8px;font-weight:700;font-size:10px;background:#eff6ff}
        .photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .photos.four{grid-template-columns:1fr 1fr}
        .photo-card{border:1px solid #cbd5e1;border-radius:8px;padding:8px;break-inside:avoid;page-break-inside:avoid}
        .photo-label{font-weight:700;margin-bottom:6px;color:#111}
        .photo-card img{width:100%;height:260px;object-fit:contain;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px}
        .photo-empty{height:160px;border:1px dashed #cbd5e1;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#64748b;background:#f8fafc}
        .photo-link,.link-line{font-size:9px;color:#475569;word-break:break-all;margin-top:5px}
        .footer{margin-top:14px;border-top:1px solid #cbd5e1;padding-top:8px;color:#64748b;font-size:10px;text-align:center}
        .no-break{break-inside:avoid;page-break-inside:avoid}
        @media(max-width:800px){.pdf-page{width:100%;padding:16px}.grid,.grid3,.photos{grid-template-columns:1fr}.photo-card img{height:220px}}
      </style>`;
  }

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      if (window.html2pdf) return resolve();
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

  async function downloadPdfHtml(html, filename){
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff;z-index:-1;';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    try {
      await loadScript(HTML2PDF_CDN);
      const opt = {
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
        jsPDF: { unit: 'px', format: [794,1123], orientation: 'portrait' },
        pagebreak: { mode: ['css','legacy'], avoid: ['.section','.photo-card','.no-break'] }
      };
      await window.html2pdf().set(opt).from(wrapper.firstElementChild || wrapper).save();
      if (window.App && App.showToast) App.showToast('PDF gerado para download.');
    } catch(err) {
      console.error('Falha ao gerar PDF direto:', err);
      const blob = new Blob([html], {type:'text/html;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace(/\.pdf$/i,'.html');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
      alert('Não foi possível carregar a biblioteca de PDF. Baixei o HTML do relatório como alternativa.');
    } finally {
      wrapper.remove();
    }
  }

  function expenseHtml(exp){
    const finalidade = exp.finalidade === 'Outro'
      ? `Outro${exp.descreva ? ' - ' + exp.descreva : ''}`
      : (exp.finalidade || exp.category || '—');

    const dataHora = [exp.date || exp.data || exp.created_at || exp.createdAt, exp.time || exp.hora].filter(Boolean).join(' às ');
    const comp = exp.foto_comprovante || exp.photo || exp.photoComprovante || exp.receiptPhoto;
    const odo = exp.foto_odometro || exp.photoOdometro || exp.odometerPhoto;

    return `<!doctype html><html><head><meta charset="utf-8"><title>Despesa ${esc(exp.id)}</title>${baseStyle()}</head><body>
      <div class="pdf-page">
        <div class="header"><h1>Comprovante de Despesa de Viagem</h1><div class="small">Documento gerado automaticamente<br>${esc(new Date().toLocaleString('pt-BR'))}</div></div>
        <div class="subhead">
          <div class="grid">
            ${field('ID da Despesa', exp.id)}
            ${field('Status', exp.status)}
            ${field('Data / Hora', dataHora)}
            ${field('Vendedor Solicitante', exp.vendedor || exp.vendedor_nome || expenseUserName(exp))}
            ${field('Unidade Vinculada', unitName(exp.unitId || exp.unit_id || exp.unidade))}
            ${field('Empresa', exp.empresa_id || exp.company_id || exp.empresa)}
          </div>
        </div>

        <div class="section">
          <h2>1. Dados da Despesa</h2>
          <div class="grid">
            ${field('Finalidade', finalidade)}
            ${field('Tipo de Operação', exp.operacao || exp.operation || exp.tipo_operacao)}
            ${field('Valor', money(exp.value ?? exp.valor ?? exp.amount))}
            ${field('Veículo', exp.veiculo || exp.vehicle)}
            ${field('Quilometragem (KM)', exp.km || exp.quilometragem)}
            ${field('Usuário Responsável', expenseUserName(exp))}
          </div>
          ${field('Observação', exp.observation || exp.observacao || exp.description || exp.descreva)}
        </div>

        <div class="section">
          <h2>2. Aprovação / Histórico</h2>
          <div class="grid">
            ${field('Status Atual', exp.status)}
            ${field('Última Atualização', exp.updated_at || exp.updatedAt || '—')}
          </div>
          ${field('Parecer / Motivo / Observação da Aprovação', exp.approval_note || exp.motivo || exp.justificativa || exp.observation || exp.observacao)}
        </div>

        <div class="section">
          <h2>3. Anexos e Comprovantes Fotográficos</h2>
          <div class="photos">
            ${photoBox(comp, 'Imagem do Comprovante')}
            ${photoBox(odo, 'Imagem do Odômetro / KM')}
          </div>
          <div style="margin-top:8px">
            ${linkLine(comp, 'Link do Comprovante')}
            ${linkLine(odo, 'Link do Odômetro')}
          </div>
        </div>

        <div class="footer">Controle de Campo • Gerado por ${(Store.getLoggedUser && Store.getLoggedUser()?.name) || 'Sistema'} em ${new Date().toLocaleString('pt-BR')}</div>
      </div>
    </body></html>`;
  }

  async function getExpenseById(id){
    let list = [];
    try { if (Array.isArray(window.AppExpensesCache)) list = window.AppExpensesCache; } catch(_){}
    if (!list.length && window.Store && Store.getExpenses) list = Store.getExpenses() || [];
    let exp = list.find(e => String(e.id) === String(id));
    if (!exp && window.App && App.fetchFromApi) {
      try { exp = await App.fetchFromApi('/api/despesas-reembolsos/' + encodeURIComponent(id)); } catch(_){}
    }
    return exp;
  }

  async function generateExpenseComprovantePdfFixed(id){
    const exp = await getExpenseById(id);
    if (!exp) return alert('Despesa não encontrada para gerar PDF.');
    return downloadPdfHtml(expenseHtml(exp), `Despesa-${slug(exp.id)}.pdf`);
  }

  function ticketHtml(ticket){
    const parts = parseArray(ticket.parts);
    const services = parseArray(ticket.services);
    const partBadges = parts.length ? parts.map(p => `<span class="badge">${esc(p)}</span>`).join('') : '—';
    const serviceBadges = services.length ? services.map(s => `<span class="badge">${esc(s)}</span>`).join('') : '—';

    return `<!doctype html><html><head><meta charset="utf-8"><title>Ficha Técnica ${esc(ticket.id)}</title>${baseStyle()}</head><body>
      <div class="pdf-page">
        <div class="header"><h1>Ficha Técnica de Manutenção</h1><div class="small">Ordem de Serviço #${esc(ticket.id)}<br>${esc(new Date().toLocaleString('pt-BR'))}</div></div>
        <div class="subhead">
          <div class="grid">
            ${field('OS', ticket.id)}
            ${field('Status', ticket.status)}
            ${field('Mecânico Responsável', ticket.mechanic)}
            ${field('Data / Hora', [ticket.date, ticket.startTime].filter(Boolean).join(' às '))}
            ${field('Hora de Conclusão', ticket.endTime || '—')}
            ${field('Unidade Vinculada', ticket.unit || unitName(ticket.unitId))}
          </div>
        </div>

        <div class="section">
          <h2>1. Identificação do Equipamento</h2>
          <div class="grid3">
            ${field('Tipo de Equipamento', ticket.equipmentType)}
            ${field('Nº Patrimônio / Serial', ticket.equipmentSerial)}
            ${field('Cliente Vinculado', ticket.client)}
            ${field('Vendedor Responsável', ticket.seller || userName(ticket.userId))}
            ${field('Prioridade da OS', ticket.priority)}
            ${field('Situação Após Atendimento', ticket.eqStatusAfter)}
          </div>
          ${field('Descrição Simplificada da Falha', ticket.title)}
        </div>

        <div class="section">
          <h2>2. Peças Utilizadas</h2>
          <div class="badges">${partBadges}</div>
        </div>

        <div class="section">
          <h2>3. Serviços Executados</h2>
          <div class="badges">${serviceBadges}</div>
        </div>

        <div class="section">
          <h2>4. Laudo e Diagnóstico Técnico</h2>
          ${field('Descrição Detalhada do Problema Encontrado', ticket.faultDescription)}
          ${field('Solução Aplicada / Laudo Técnico', ticket.solutionDescription)}
          <div class="grid">
            ${field('Estado do Equipamento Após Atendimento', ticket.eqStatusAfter)}
            ${field('Carga de Gás (gramas)', ticket.gasCharge ? ticket.gasCharge + 'g' : '—')}
          </div>
          ${field('Observações Adicionais', ticket.additionalNotes)}
        </div>

        <div class="section">
          <h2>5. Fotos e Vídeo da Visita</h2>
          <div class="photos four">
            ${photoBox(ticket.defectPhoto, 'Foto do Defeito')}
            ${photoBox(ticket.fotoAntes, 'Foto Antes do Reparo')}
            ${photoBox(ticket.fotoDepois, 'Foto Depois do Reparo')}
            ${photoBox(ticket.fotoPlaqueta, 'Foto da Plaqueta')}
          </div>
          <div style="margin-top:8px">
            ${linkLine(ticket.defectVideo, 'Link do Vídeo do Defeito')}
            ${linkLine(ticket.videoAtendimento, 'Link do Vídeo do Atendimento')}
          </div>
        </div>

        <div class="section no-break">
          <h2>6. Assinaturas</h2>
          <div class="grid" style="gap:40px;margin-top:35px">
            <div style="border-top:1px solid #111;text-align:center;padding-top:6px">Assinatura do Técnico</div>
            <div style="border-top:1px solid #111;text-align:center;padding-top:6px">Assinatura do Cliente / Responsável</div>
          </div>
        </div>

        <div class="footer">Controle de Campo • Gerado por ${(Store.getLoggedUser && Store.getLoggedUser()?.name) || 'Sistema'} em ${new Date().toLocaleString('pt-BR')}</div>
      </div>
    </body></html>`;
  }

  function buildTicketFromForm(id, saved){
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
      seller: document.getElementById('ticket-seller-text')?.value || saved.seller || userName(saved.userId),
      unit: document.getElementById('ticket-unit-text')?.value || saved.unit || unitName(saved.unitId),
      title: document.getElementById('ticket-title')?.value || saved.title || '',
      priority: document.getElementById('ticket-priority-text')?.value || saved.priority || '',
      faultDescription: document.getElementById('ticket-fault-description')?.value || saved.faultDescription || '',
      solutionDescription: document.getElementById('ticket-solution-description')?.value || saved.solutionDescription || '',
      eqStatusAfter: document.getElementById('ticket-eq-status-after')?.value || saved.eqStatusAfter || '',
      gasCharge: document.getElementById('ticket-gas-charge')?.value || saved.gasCharge || '',
      additionalNotes: document.getElementById('ticket-additional-notes')?.value || saved.additionalNotes || '',
      parts: parts.length ? parts : (saved.parts || []),
      services: services.length ? services : (saved.services || []),
      fotoAntes: imgUrl('preview-img-ticket-foto-antes', saved.fotoAntes),
      fotoDepois: imgUrl('preview-img-ticket-foto-depois', saved.fotoDepois),
      fotoPlaqueta: imgUrl('preview-img-ticket-foto-plaqueta', saved.fotoPlaqueta),
      defectPhoto: saved.defectPhoto || '',
      defectVideo: saved.defectVideo || '',
      videoAtendimento: saved.videoAtendimento || ''
    };
  }

  function installPdfOverrides(){
    if (!window.App || !window.Store) return false;

    App.generateExpenseComprovantePdf = generateExpenseComprovantePdfFixed;
    App.generateRegisteredExpensePdf = generateExpenseComprovantePdfFixed;
    App.generateRegisteredExpensePDF = generateExpenseComprovantePdfFixed;
    App.generateExpenseReceiptPdf = generateExpenseComprovantePdfFixed;
    App.generateExpenseProofPdf = generateExpenseComprovantePdfFixed;

    App.printTicketData = function(ticket){
      return downloadPdfHtml(ticketHtml(ticket || {}), `Ficha-Tecnica-${slug(ticket?.id || 'OS')}.pdf`);
    };

    App.generateTicketPdf = function(id){
      const tickets = (Store.getTickets && Store.getTickets()) || [];
      const saved = tickets.find(t => String(t.id) === String(id));
      if (!saved) return alert('Chamado não encontrado.');
      const ticket = {
        ...saved,
        seller: userName(saved.userId),
        unit: unitName(saved.unitId)
      };
      return App.printTicketData(ticket);
    };

    App.generateTicketPdfFromForm = function(){
      const form = document.getElementById('ticket-form');
      if (!form) return;
      const id = form.dataset.ticketId;
      if (!id) return alert('Nenhuma Ordem de Serviço carregada no formulário.');
      const tickets = (Store.getTickets && Store.getTickets()) || [];
      const saved = tickets.find(t => String(t.id) === String(id)) || {};
      const ticket = buildTicketFromForm(id, saved);
      return App.printTicketData(ticket);
    };

    return true;
  }

  function start(){
    installPdfOverrides();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.addEventListener('hashchange', () => setTimeout(start, 300));
  setInterval(start, 1000);
})();
