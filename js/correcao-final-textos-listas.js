/* Correcao final: textos quebrados, vendedor e lista de clientes estavel. */
(function(){
  'use strict';
  if (window.__ccCorrecaoFinalTextosListas) return;
  window.__ccCorrecaoFinalTextosListas = true;

  var TXT = {
    usuarioNaoLocalizado: 'Usu\u00e1rio n\u00e3o localizado',
    usuarioNaoInformado: 'Usu\u00e1rio n\u00e3o informado',
    nenhumCliente: 'Nenhum cliente cadastrado.',
    nenhumRegistro: 'Nenhum registro para mostrar.',
    mostrando: 'Mostrando ',
    de: ' de ',
    clientes: ' clientes',
    pagina: 'P\u00e1gina ',
    anterior: 'Anterior',
    proxima: 'Pr\u00f3xima',
    acoes: 'A\u00e7\u00f5es',
    editar: 'Editar',
    apagar: 'Apagar',
    verFicha: 'Ver Ficha',
    pendente: 'Pendente',
    visualizacaoPdf: 'Visualiza\u00e7\u00e3o do PDF'
  };

  function latin1ToUtf8(text){
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code > 255) return text;
      bytes.push('%' + code.toString(16).padStart(2, '0'));
    }
    try { return decodeURIComponent(bytes.join('')); } catch (_) { return text; }
  }

  function fixText(value){
    var text = String(value == null ? '' : value);
    if (!/[ÃÂâð]/.test(text)) return text;
    var last = text;
    for (var i = 0; i < 3; i++) {
      var next = latin1ToUtf8(last);
      if (next === last) break;
      last = next;
      if (!/[ÃÂâð]/.test(last)) break;
    }
    return last
      .replace(/\u00c2/g, '')
      .replace(/\u00e2\u20ac\u201c/g, '-')
      .replace(/\u00e2\u20ac\u201d/g, '-')
      .replace(/\u00e2\u20ac\u0153/g, '"')
      .replace(/\u00e2\u20ac\u009d/g, '"')
      .replace(/\u00e2\u20ac\u02dc/g, "'")
      .replace(/\u00e2\u20ac\u2122/g, "'");
  }

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(ch){
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
    });
  }
  function norm(v){ return fixText(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function currentUser(){ try { return Store.getLoggedUser ? Store.getLoggedUser() : null; } catch(_) { return null; } }
  function users(){ try { return Store.getUsers ? Store.getUsers() : []; } catch(_) { return []; } }
  function units(){ try { return Store.getUnits ? Store.getUnits() : []; } catch(_) { return []; } }
  function isAdmin(u){
    u = u || currentUser();
    var p = norm(u && u.profile);
    var permissions = Array.isArray(u && u.permissions) ? u.permissions.map(norm) : [];
    return String(u && u.unitId || '').toLowerCase() === 'all'
      || p.includes('admin')
      || p.includes('administrador')
      || permissions.some(function(x){ return x.includes('admin') || x.includes('administrador'); });
  }
  function isSeller(u){ return norm(u && u.profile).includes('vendedor'); }
  function isSupervisor(u){ return norm(u && u.profile).includes('supervisor'); }

  function clientOwnerId(client){
    return client && (client.userId || client.user_id || client.vendedor_id || client.seller_id || client.usuario_id || client.createdBy || client.created_by);
  }

  function getUserNameSmart(id, record){
    var direct = record && (record.vendedor_nome || record.sellerName || record.seller_name || record.vendedor || record.userName || record.usuario_nome || record.clientSeller);
    if (direct && norm(direct) !== 'usuario nao localizado') return fixText(direct);
    var all = users();
    var found = all.find(function(u){
      return String(u.id) === String(id)
        || String(u.userId || '') === String(id)
        || String(u.username || '') === String(id)
        || (record && norm(u.name) === norm(record.vendedor_nome || record.sellerName || record.vendedor));
    });
    if (found) return fixText(found.name || found.username || found.id);
    if (id) {
      var idStr = String(id).toLowerCase();
      if (idStr.startsWith('usr') || idStr.startsWith('user')) return TXT.usuarioNaoLocalizado;
      return fixText(id);
    }
    return TXT.usuarioNaoInformado;
  }

  function getUnitNameSmart(id){
    try {
      var uiName = UI.getUnitName ? UI.getUnitName(id) : '';
      if (uiName && uiName !== id) return fixText(uiName);
    } catch(_) {}
    var found = units().find(function(u){ return String(u.id) === String(id) || String(u.unitId || '') === String(id); });
    return fixText((found && (found.name || found.nome)) || id || '-');
  }

  function clientDate(c){
    var raw = c && (c.data_cadastro || c.date || c.createdAt || c.created_at);
    if (!raw) return '-';
    if (/^\d{2}\/\d{2}\/\d{4}/.test(String(raw))) return String(raw);
    try {
      var d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
    } catch(_) {}
    return fixText(raw);
  }

  function statusClass(status){
    var s = norm(status);
    if (s.includes('aprov')) return 'badge-success';
    if (s.includes('reprov')) return 'badge-danger';
    if (s.includes('correc')) return 'badge-warning';
    return 'badge-warning';
  }

  function canSeeClient(c, u){
    u = u || currentUser();
    if (!u || isAdmin(u)) return true;
    if (isSeller(u)) return String(clientOwnerId(c) || '') === String(u.id || '') || norm(getUserNameSmart(clientOwnerId(c), c)) === norm(u.name);
    if (isSupervisor(u)) return String(u.unitId || '') === 'all' || !c.unitId || String(c.unitId) === String(u.unitId);
    return true;
  }

  function applyFilters(list){
    var out = (Array.isArray(list) ? list : []).filter(function(c){ return canSeeClient(c); });
    try {
      var fm = window.FiltersManager;
      if (fm && fm.configs && fm.configs.clientes) {
        fm.caches.clientes = out;
        fm.ensureFilterPanel('clientes');
        out = fm.filterData(out, fm.getFilterValues('clientes'), 'clientes');
      }
    } catch(e) { console.warn('Filtros de clientes falharam:', e); }
    return out;
  }

  function removeOldClientPagers(){
    document.querySelectorAll('#cc-pager-clientes, #cc-clientes-pager-final, #cc-clientes-pager-stable').forEach(function(el){
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function renderClientsStable(input){
    var body = document.getElementById('clients-table-body');
    if (!body) return;
    removeOldClientPagers();
    var raw = Array.isArray(input) ? input : (Store.getClients ? Store.getClients() : []);
    var data = applyFilters(raw);
    data.sort(function(a,b){
      var da = new Date(a.createdAt || a.created_at || a.date || 0).getTime() || 0;
      var db = new Date(b.createdAt || b.created_at || b.date || 0).getTime() || 0;
      return db - da;
    });
    var pageSize = 5;
    var totalPages = Math.max(1, Math.ceil(data.length / pageSize));
    window.__ccStableClientPage = Math.min(Math.max(1, Number(window.__ccStableClientPage || 1)), totalPages);
    var start = (window.__ccStableClientPage - 1) * pageSize;
    var page = data.slice(start, start + pageSize);
    if (!page.length) {
      body.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:18px;">'+TXT.nenhumCliente+'</td></tr>';
      renderPager(data.length, 0, 0, totalPages);
      return;
    }
    body.innerHTML = page.map(function(c){
      var id = esc(c.id || '');
      var ownerName = getUserNameSmart(clientOwnerId(c), c);
      var score = c.score != null ? c.score : '-';
      var classification = c.classification ? ' ' + fixText(c.classification) : '';
      var adminBtns = isAdmin() ? '<button class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:.75rem;margin-top:4px;" onclick="event.stopPropagation(); App.editClientAdmin && App.editClientAdmin(\''+id+'\')">'+TXT.editar+'</button><button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:.75rem;margin-top:4px;" onclick="event.stopPropagation(); App.deleteClient && App.deleteClient(\''+id+'\', event)">'+TXT.apagar+'</button>' : '';
      return '<tr class="mobile-summary-row" onclick="App.showClientDetails(\''+id+'\')">'
        + '<td data-label="Cliente"><strong>'+esc(fixText(c.name || c.nomeFantasia || c.companyName || '-'))+'</strong><br><small style="color:var(--text-muted);">'+esc(clientDate(c))+'</small></td>'
        + '<td data-label="CNPJ">'+esc(c.cnpj || '-')+'</td>'
        + '<td data-label="Categoria">'+esc(fixText(c.category || '-'))+'</td>'
        + '<td data-label="Telefone">'+esc(c.phone || '-')+'</td>'
        + '<td data-label="E-mail">'+esc(c.email || '-')+'</td>'
        + '<td data-label="Unidade"><span class="badge-status badge-primary" style="font-size:.7rem;">'+esc(getUnitNameSmart(c.unitId))+'</span></td>'
        + '<td data-label="Vendedor">'+esc(ownerName)+'</td>'
        + '<td data-label="Score">'+esc(score + classification)+'</td>'
        + '<td data-label="Status"><span class="badge-status '+statusClass(c.status)+'">'+esc(fixText(c.status || TXT.pendente))+'</span></td>'
        + '<td data-label="'+TXT.acoes+'"><button class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:.75rem;" onclick="event.stopPropagation(); App.showClientDetails(\''+id+'\')">'+TXT.verFicha+'</button>'+adminBtns+'</td>'
        + '</tr>';
    }).join('');
    renderPager(data.length, start, Math.min(start + pageSize, data.length), totalPages);
    fixVisibleText();
  }

  function renderPager(total, start, end, totalPages){
    var body = document.getElementById('clients-table-body');
    var tableBox = body && (body.closest('.table-responsive') || body.closest('table'));
    if (!tableBox) return;
    var pager = document.createElement('div');
    pager.id = 'cc-clientes-pager-stable';
    pager.className = 'cc-list-pager no-print';
    var page = window.__ccStableClientPage || 1;
    pager.innerHTML = '<div class="cc-pager-info">'+(total ? TXT.mostrando+(start+1)+'-'+end+TXT.de+total+TXT.clientes : TXT.nenhumRegistro)+'</div>'
      + '<div class="cc-pager-actions"><button type="button" class="btn btn-secondary btn-sm" '+(page <= 1 ? 'disabled' : '')+' onclick="window.__ccStableClientsGo('+(page-1)+')">'+TXT.anterior+'</button>'
      + '<span class="cc-pager-page">'+TXT.pagina+page+TXT.de+totalPages+'</span>'
      + '<button type="button" class="btn btn-secondary btn-sm" '+(page >= totalPages ? 'disabled' : '')+' onclick="window.__ccStableClientsGo('+(page+1)+')">'+TXT.proxima+'</button></div>';
    tableBox.insertAdjacentElement('afterend', pager);
  }

  window.__ccStableClientsGo = function(page){
    window.__ccStableClientPage = Math.max(1, Number(page) || 1);
    renderClientsStable(Store.getClients ? Store.getClients() : []);
  };

  function fixVisibleText(){
    if (!document.body) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function(node){
      var fixed = fixText(node.nodeValue);
      if (fixed !== node.nodeValue) node.nodeValue = fixed;
    });
    document.querySelectorAll('[placeholder], [title], [aria-label]').forEach(function(el){
      ['placeholder', 'title', 'aria-label'].forEach(function(attr){
        if (el.hasAttribute(attr)) {
          var v = el.getAttribute(attr);
          var f = fixText(v);
          if (f !== v) el.setAttribute(attr, f);
        }
      });
    });
  }

  function patchPdfPreview(){
    if (!window.App || App.__ccFixPdfPreview) return;
    App.__ccFixPdfPreview = true;
    var old = App.showPdfPreviewModal ? App.showPdfPreviewModal.bind(App) : null;
    if (!old) return;
    App.showPdfPreviewModal = function(html, title){
      return old(fixText(html), fixText(title || TXT.visualizacaoPdf));
    };
  }

  function patchUiNames(){
    if (!window.UI || UI.__ccSmartNames) return;
    UI.__ccSmartNames = true;
    var oldUser = UI.getUserName ? UI.getUserName.bind(UI) : null;
    UI.getUserName = function(id){
      var name = oldUser ? oldUser(id) : '';
      if (name && norm(name) !== 'usuario nao localizado') return fixText(name);
      return getUserNameSmart(id, null);
    };
    var oldUnit = UI.getUnitName ? UI.getUnitName.bind(UI) : null;
    UI.getUnitName = function(id){
      var name = oldUnit ? oldUnit(id) : '';
      return fixText(name || getUnitNameSmart(id));
    };
  }

  function optionHtml(value, label){
    return '<option value="'+esc(value)+'">'+esc(label == null ? value : label)+'</option>';
  }

  function uniqueByNorm(values){
    var seen = {};
    return values.filter(function(v){
      v = fixText(v || '').trim();
      var key = norm(v);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function pendingApprovalClients(){
    var list = [];
    try { list = Store.getClients ? Store.getClients() : []; } catch(_) {}
    return (Array.isArray(list) ? list : []).filter(function(c){
      var s = norm(c && c.status);
      return !s || s.includes('pendente') || s.includes('aguardando') || s.includes('correc');
    });
  }

  function fillApprovalFilters(){
    if (!location.hash.includes('aprovacao')) return;
    var body = document.getElementById('approvals-table-body');
    if (!body) return;
    var bar = body.closest('.card') && body.closest('.card').querySelector('.general-filter-bar');
    if (!bar) return;
    var clients = pendingApprovalClients();
    var unitOptions = units().map(function(u){ return fixText(u.name || u.nome || u.id); });
    clients.forEach(function(c){ unitOptions.push(getUnitNameSmart(c.unitId)); });
    unitOptions = uniqueByNorm(unitOptions).sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });

    var companyOptions = [];
    clients.forEach(function(c){
      companyOptions.push(c.empresa_nome || c.company_name || c.empresa || c.base || getUnitNameSmart(c.unitId));
    });
    units().forEach(function(u){ companyOptions.push(u.empresa || u.company || u.name || u.nome); });
    companyOptions = uniqueByNorm(companyOptions).sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });

    var sellerOptions = uniqueByNorm(clients.map(function(c){ return getUserNameSmart(clientOwnerId(c), c); })).sort(function(a,b){ return a.localeCompare(b, 'pt-BR'); });

    var unitSelect = bar.querySelector('select[data-field="unitId"]');
    var empresaSelect = bar.querySelector('select[data-field="empresa"]');
    var vendedorSelect = bar.querySelector('select[data-field="vendedor"]');
    [
      { select: unitSelect, values: unitOptions },
      { select: empresaSelect, values: companyOptions },
      { select: vendedorSelect, values: sellerOptions }
    ].forEach(function(cfg){
      if (!cfg.select) return;
      var current = cfg.select.value;
      cfg.select.innerHTML = optionHtml('', 'Todos') + cfg.values.map(function(v){ return optionHtml(v, v); }).join('');
      if ([].slice.call(cfg.select.options).some(function(o){ return o.value === current; })) cfg.select.value = current;
    });
    fixVisibleText();
  }

  function patchApprovalRender(){
    if (!window.UI || UI.__ccApprovalFiltersFinal) return;
    UI.__ccApprovalFiltersFinal = true;
    var old = UI.renderApprovals ? UI.renderApprovals.bind(UI) : null;
    if (old) {
      UI.renderApprovals = function(list){
        var result = old(list);
        setTimeout(fillApprovalFilters, 60);
        return result;
      };
    }
  }

  function install(){
    patchUiNames();
    patchPdfPreview();
    patchApprovalRender();
    if (window.UI) UI.renderClients = renderClientsStable;
    if (location.hash.includes('clientes') && window.Store && Store.getClients) renderClientsStable(Store.getClients());
    if (location.hash.includes('aprovacao')) setTimeout(fillApprovalFilters, 120);
    setTimeout(fixVisibleText, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  window.addEventListener('hashchange', function(){ setTimeout(install, 150); });
  document.addEventListener('click', function(){ setTimeout(fixVisibleText, 80); }, true);
  setInterval(function(){
    fixVisibleText();
    if (location.hash.includes('clientes') && window.UI && UI.renderClients !== renderClientsStable) UI.renderClients = renderClientsStable;
    if (location.hash.includes('aprovacao')) fillApprovalFilters();
  }, 1000);
})();
