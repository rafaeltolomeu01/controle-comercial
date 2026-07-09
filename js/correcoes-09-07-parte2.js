/* Correcoes finais 09/07: clientes, datas, fotos, edicao preservada e chamados admin. */
(function(){
  'use strict';
  if (window.__correcoes0907Parte2) return;
  window.__correcoes0907Parte2 = true;

  function norm(v){ return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function user(){ try { return Store.getLoggedUser ? Store.getLoggedUser() : null; } catch(_) { return null; } }
  function isAdmin(u){
    u = u || user();
    var p = norm(u && u.profile);
    var perms = Array.isArray(u && u.permissions) ? u.permissions.map(norm) : [];
    return String(u && u.unitId || '').toLowerCase() === 'all' || p.includes('admin') || p.includes('administrador') || perms.some(function(x){ return x.includes('admin') || x.includes('administrador'); });
  }
  function isSupervisor(u){ return norm(u && u.profile).includes('supervisor'); }
  function isSeller(u){ return norm(u && u.profile).includes('vendedor'); }
  function val(id, fallback){
    var el = document.getElementById(id);
    return el ? el.value : (fallback == null ? '' : fallback);
  }
  function setVal(id, value){
    var el = document.getElementById(id);
    if (!el) return;
    el.value = value == null ? '' : value;
    try { el.dispatchEvent(new Event('change', { bubbles:true })); } catch(_) {}
  }
  function unitName(id){ try { return UI.getUnitName ? UI.getUnitName(id) : id; } catch(_) { return id || '-'; } }
  function sellerName(c){
    var id = c && (c.userId || c.user_id || c.vendedor_id || c.seller_id);
    try { if (id && UI.getUserName) return UI.getUserName(id); } catch(_) {}
    return (c && (c.sellerName || c.vendedor_nome || c.vendedor || c.userName)) || '-';
  }
  function clientOwnerId(c){ return c && (c.userId || c.user_id || c.vendedor_id || c.seller_id); }
  function clientDate(c){
    if (!c) return 'Nao informado';
    var raw = c.data_cadastro || c.date || c.createdAt || c.created_at || c.created || c.created_date;
    if (!raw) return 'Nao informado';
    if (/^\d{2}\/\d{2}\/\d{4}/.test(String(raw))) return String(raw);
    try {
      var d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString('pt-BR');
    } catch(_) {}
    return String(raw);
  }
  function scoreText(c){
    var n = c && c.score != null ? c.score : '-';
    var cls = c && c.classification ? c.classification : '';
    return String(n) + (cls ? ' ' + cls : '');
  }
  function statusClass(status){
    var s = norm(status);
    if (s.includes('aprov')) return 'badge-success';
    if (s.includes('reprov')) return 'badge-danger';
    if (s.includes('correc')) return 'badge-warning';
    return 'badge-warning';
  }
  function canSeeClient(c, u){
    u = u || user();
    if (!u) return true;
    if (isAdmin(u)) return true;
    if (isSupervisor(u)) {
      if (String(u.unitId || '') === 'all') return true;
      return !c.unitId || String(c.unitId) === String(u.unitId);
    }
    if (isSeller(u)) {
      var owner = clientOwnerId(c);
      return String(owner || '') === String(u.id || '') || norm(sellerName(c)) === norm(u.name);
    }
    return true;
  }
  function filterClients(list){
    var raw = Array.isArray(list) ? list.slice() : [];
    var u = user();
    raw = raw.filter(function(c){ return canSeeClient(c, u); });
    try {
      if (window.FiltersManager && FiltersManager.configs && FiltersManager.configs.clientes) {
        FiltersManager.caches.clientes = raw;
        FiltersManager.ensureFilterPanel('clientes');
        raw = FiltersManager.filterData(raw, FiltersManager.getFilterValues('clientes'), 'clientes');
      }
    } catch(e) { console.warn('Falha ao filtrar clientes', e); }
    return raw.sort(function(a,b){
      var da = new Date(a.createdAt || a.created_at || a.date || 0).getTime() || 0;
      var db = new Date(b.createdAt || b.created_at || b.date || 0).getTime() || 0;
      return db - da;
    });
  }

  function patchStoreDates(){
    if (!window.Store || Store.__ccDatesPatched) return;
    Store.__ccDatesPatched = true;
    var old = Store.saveClients ? Store.saveClients.bind(Store) : null;
    if (!old) return;
    Store.saveClients = function(list){
      var nowIso = new Date().toISOString();
      var nowPt = new Date().toLocaleDateString('pt-BR');
      var normalized = (Array.isArray(list) ? list : []).map(function(c){
        if (!c || typeof c !== 'object') return c;
        if (!c.createdAt && !c.created_at) c.createdAt = nowIso;
        if (!c.created_at && c.createdAt) c.created_at = c.createdAt;
        if (!c.date && !c.data_cadastro) c.date = nowPt;
        if (!c.data_cadastro && c.date) c.data_cadastro = c.date;
        if (!c.user_id && c.userId) c.user_id = c.userId;
        if (!c.vendedor_id && c.userId) c.vendedor_id = c.userId;
        return c;
      });
      return old(normalized);
    };
  }

  function renderClients(list){
    var body = document.getElementById('clients-table-body');
    if (!body) return;
    var data = filterClients(Array.isArray(list) ? list : (Store.getClients ? Store.getClients() : []));
    var pageSize = 5;
    var totalPages = Math.max(1, Math.ceil(data.length / pageSize));
    window.__ccClientsPage = Math.min(Math.max(1, window.__ccClientsPage || 1), totalPages);
    var start = (window.__ccClientsPage - 1) * pageSize;
    var page = data.slice(start, start + pageSize);
    if (!page.length) {
      body.innerHTML = '<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:18px;">Nenhum cliente cadastrado.</td></tr>';
      renderClientPager(data.length, 0, 0, totalPages);
      return;
    }
    body.innerHTML = page.map(function(c){
      var id = esc(c.id || '');
      var adminBtns = isAdmin() ? '<button class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:.75rem;margin-top:4px;" onclick="event.stopPropagation(); App.editClientAdmin(\''+id+'\')">Editar</button><button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:.75rem;margin-top:4px;" onclick="event.stopPropagation(); App.deleteClient && App.deleteClient(\''+id+'\', event)">Apagar</button>' : '';
      return '<tr class="mobile-summary-row" onclick="App.showClientDetails(\''+id+'\')">'
        + '<td data-label="Selecionar"><input type="checkbox" onclick="event.stopPropagation()"></td>'
        + '<td data-label="Nome Cliente"><strong>'+esc(c.name || c.nomeFantasia || c.companyName || '-')+'</strong><br><small style="color:var(--text-muted);">'+esc(clientDate(c))+'</small></td>'
        + '<td data-label="CNPJ">'+esc(c.cnpj || '-')+'</td>'
        + '<td data-label="Categoria">'+esc(c.category || '-')+'</td>'
        + '<td data-label="Telefone">'+esc(c.phone || '-')+'</td>'
        + '<td data-label="E-mail">'+esc(c.email || '-')+'</td>'
        + '<td data-label="Unidade"><span class="badge-status badge-primary" style="font-size:.7rem;">'+esc(unitName(c.unitId))+'</span></td>'
        + '<td data-label="Vendedor">'+esc(sellerName(c))+'</td>'
        + '<td data-label="Score">'+esc(scoreText(c))+'</td>'
        + '<td data-label="Status"><span class="badge-status '+statusClass(c.status)+'">'+esc(c.status || 'Pendente')+'</span></td>'
        + '<td data-label="Acoes"><button class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:.75rem;" onclick="event.stopPropagation(); App.showClientDetails(\''+id+'\')">Ver Ficha</button>'+adminBtns+'</td>'
        + '</tr>';
    }).join('');
    renderClientPager(data.length, start, Math.min(start + pageSize, data.length), totalPages);
  }

  function renderClientPager(total, start, end, totalPages){
    var body = document.getElementById('clients-table-body');
    if (!body) return;
    var box = body.closest('.table-responsive') || body.closest('table');
    if (!box) return;
    var pager = document.getElementById('cc-clientes-pager-final');
    if (!pager) {
      pager = document.createElement('div');
      pager.id = 'cc-clientes-pager-final';
      pager.className = 'cc-list-pager no-print';
      box.insertAdjacentElement('afterend', pager);
    }
    var page = window.__ccClientsPage || 1;
    pager.innerHTML = '<div class="cc-pager-info">'+(total ? 'Mostrando '+(start+1)+'-'+end+' de '+total+' clientes' : 'Nenhum registro para mostrar.')+'</div>'
      + '<div class="cc-pager-actions"><button type="button" class="btn btn-secondary btn-sm" '+(page <= 1 ? 'disabled' : '')+' onclick="window.__ccClientsGo('+(page-1)+')">Anterior</button>'
      + '<span class="cc-pager-page">Pagina '+page+' de '+totalPages+'</span>'
      + '<button type="button" class="btn btn-secondary btn-sm" '+(page >= totalPages ? 'disabled' : '')+' onclick="window.__ccClientsGo('+(page+1)+')">Proxima</button></div>';
  }
  window.__ccClientsGo = function(page){
    window.__ccClientsPage = Math.max(1, Number(page) || 1);
    renderClients(Store.getClients ? Store.getClients() : []);
  };

  function patchClientRender(){
    if (!window.UI || UI.__ccFinalClientRender) return;
    UI.__ccFinalClientRender = true;
    UI.renderClients = function(list){ return renderClients(list); };
  }

  function fillClientForm(c){
    setVal('client-name', c.name || c.nomeFantasia);
    setVal('client-cnpj', c.cnpj);
    setVal('client-phone', c.phone);
    setVal('client-email', c.email);
    setVal('client-unit', c.unitId);
    setVal('client-seller', clientOwnerId(c));
    setVal('client-category', c.category);
    setVal('client-company-name', c.companyName || c.razaoSocial);
    setVal('client-ie', c.ie);
    setVal('client-city', c.city);
    setVal('client-state', c.state || c.uf);
    setVal('client-cep', c.cep);
    setVal('client-street', c.street);
    setVal('client-number', c.number);
    setVal('client-neighborhood', c.neighborhood);
    setVal('client-address-full', c.addressFull);
    setVal('client-location-type', c.locationType);
    setVal('client-pavement-type', c.pavementType);
    setVal('client-delivery-schedule', c.deliverySchedule);
    setVal('client-nearby-amaretto', c.nearbyAmaretto);
    setVal('client-nearby-competitor', c.nearbyCompetitor);
    setVal('client-ice-cream-experience', c.iceCreamExperience);
    setVal('client-dual-brand-preference', c.dualBrandPreference);
    setVal('client-equipment-qty', c.equipmentQty);
    setVal('client-requested-eq-type', c.requestedEqType);
    setVal('client-sendable-eq-type', c.sendableEqType);
    setVal('client-predicted-average', c.predictedAverage);
    setVal('client-first-order-value', c.firstOrderValue);
    setVal('client-first-order-payment', c.firstOrderPayment);
    setVal('client-first-order-reason', c.firstOrderReason);
    setVal('client-repurchase-payment', c.repurchasePayment);
    setVal('client-has-bonus', c.hasBonus);
    setVal('client-bonus-value', c.bonusValue);
    setVal('client-seller-analysis', c.sellerAnalysis);
    setVal('client-route', c.route);
    document.querySelectorAll('input[name="client-products"]').forEach(function(el){
      el.checked = Array.isArray(c.products) && c.products.map(norm).includes(norm(el.value));
    });
  }

  function clientPayloadFromForm(old){
    var products = Array.from(document.querySelectorAll('input[name="client-products"]:checked')).map(function(el){ return el.value; });
    var owner = val('client-seller', clientOwnerId(old));
    var next = Object.assign({}, old, {
      name: val('client-name', old.name),
      cnpj: val('client-cnpj', old.cnpj),
      phone: val('client-phone', old.phone),
      email: val('client-email', old.email),
      unitId: val('client-unit', old.unitId),
      userId: owner,
      user_id: owner,
      vendedor_id: owner,
      seller_id: owner,
      category: val('client-category', old.category),
      companyName: val('client-company-name', old.companyName),
      ie: val('client-ie', old.ie),
      city: val('client-city', old.city),
      state: val('client-state', old.state),
      cep: val('client-cep', old.cep),
      street: val('client-street', old.street),
      number: val('client-number', old.number),
      neighborhood: val('client-neighborhood', old.neighborhood),
      addressFull: val('client-address-full', old.addressFull),
      locationType: val('client-location-type', old.locationType),
      pavementType: val('client-pavement-type', old.pavementType),
      deliverySchedule: val('client-delivery-schedule', old.deliverySchedule),
      nearbyAmaretto: val('client-nearby-amaretto', old.nearbyAmaretto),
      nearbyCompetitor: val('client-nearby-competitor', old.nearbyCompetitor),
      iceCreamExperience: val('client-ice-cream-experience', old.iceCreamExperience),
      dualBrandPreference: val('client-dual-brand-preference', old.dualBrandPreference),
      equipmentQty: val('client-equipment-qty', old.equipmentQty),
      requestedEqType: val('client-requested-eq-type', old.requestedEqType),
      sendableEqType: val('client-sendable-eq-type', old.sendableEqType),
      products: products,
      predictedAverage: Number(val('client-predicted-average', old.predictedAverage) || 0),
      firstOrderValue: Number(val('client-first-order-value', old.firstOrderValue) || 0),
      firstOrderPayment: val('client-first-order-payment', old.firstOrderPayment),
      firstOrderReason: val('client-first-order-reason', old.firstOrderReason),
      repurchasePayment: val('client-repurchase-payment', old.repurchasePayment),
      hasBonus: val('client-has-bonus', old.hasBonus),
      bonusValue: Number(val('client-bonus-value', old.bonusValue) || 0),
      sellerAnalysis: val('client-seller-analysis', old.sellerAnalysis),
      route: val('client-route', old.route),
      data_cadastro: old.data_cadastro || old.date || clientDate(old),
      date: old.date || old.data_cadastro || clientDate(old),
      createdAt: old.createdAt || old.created_at,
      created_at: old.created_at || old.createdAt,
      updatedAt: new Date().toISOString()
    });
    try {
      if (window.Scoring && Scoring.calculate) {
        var score = Scoring.calculate(next);
        next.score = score.score;
        next.classification = score.classification;
      }
    } catch(_) {}
    return next;
  }

  async function uploadChangedClientPhotos(next, old){
    var map = {
      fachada:'photoFachada', interna01:'photoInterna01', interna02:'photoInterna02', interna03:'photoInterna03',
      rua01:'photoRua01', rua02:'photoRua02', cnpj:'photoCnpj'
    };
    for (var suffix in map) {
      var input = document.getElementById('client-photo-' + suffix);
      if (!input || !input.files || !input.files[0]) {
        next[map[suffix]] = old[map[suffix]] || '';
        continue;
      }
      var file = input.files[0];
      var base64 = App.compressImageAndGetBase64 ? await App.compressImageAndGetBase64(file) : await Store.fileToBase64(file);
      var cnpj = String(next.cnpj || old.cnpj || '00000000000000').replace(/\D/g,'') || '00000000000000';
      next[map[suffix]] = await App.uploadBase64ToDatabase(base64, 'cliente-' + cnpj + '-' + suffix + '-' + (file.name || 'foto'), 'clientes');
      if (!next[map[suffix]]) throw new Error('Foto ' + suffix + ' nao foi salva.');
    }
  }

  function patchClientEdit(){
    if (!window.App || App.__ccFinalClientEdit) return;
    App.__ccFinalClientEdit = true;
    window.__ccFinalClientEditActive = true;
    App.editClientAdmin = function(id){
      if (!isAdmin()) return alert('Somente administrador pode editar clientes.');
      var c = (Store.getClients ? Store.getClients() : []).find(function(x){ return String(x.id) === String(id); });
      if (!c) return alert('Cliente nao encontrado.');
      var box = document.getElementById('client-form-container');
      if (box) { box.classList.remove('hidden'); box.style.display = ''; }
      var form = document.getElementById('client-form');
      if (form) {
        form.dataset.editingId = c.id;
        form.noValidate = true;
        form.querySelectorAll('input[type="file"]').forEach(function(el){ el.required = false; el.value = ''; });
      }
      fillClientForm(c);
      if (box) box.scrollIntoView({ behavior:'smooth', block:'start' });
    };
    document.addEventListener('submit', async function(ev){
      var form = ev.target;
      if (!form || form.id !== 'client-form' || !form.dataset.editingId) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!isAdmin()) return alert('Somente administrador pode editar clientes.');
      var id = form.dataset.editingId;
      var clients = Store.getClients ? Store.getClients() : [];
      var idx = clients.findIndex(function(c){ return String(c.id) === String(id); });
      if (idx < 0) return alert('Cliente nao encontrado.');
      var old = clients[idx];
      var next = clientPayloadFromForm(old);
      try {
        await uploadChangedClientPhotos(next, old);
        clients[idx] = next;
        Store.saveClients(clients);
        try { await App.fetchFromApi('/api/store/clients', { method:'POST', body: JSON.stringify({ data: clients }) }); } catch(_) {}
        delete form.dataset.editingId;
        form.reset();
        form.querySelectorAll('[data-cnpj-api-locked="1"]').forEach(function(el){ el.readOnly = false; el.removeAttribute('data-cnpj-api-locked'); el.style.backgroundColor=''; el.title=''; });
        var box = document.getElementById('client-form-container');
        if (box) box.classList.add('hidden');
        if (App.refreshAllLists) App.refreshAllLists();
        renderClients(Store.getClients ? Store.getClients() : []);
        if (App.showToast) App.showToast('Cliente editado com sucesso.');
      } catch(err) {
        alert('Erro ao editar cliente: ' + (err.message || err));
      }
    }, true);
  }

  function patchFichaAndPdf(){
    if (!window.UI || !window.App || App.__ccFinalFichaPdf) return;
    App.__ccFinalFichaPdf = true;
    var oldShow = UI.showClientDetails ? UI.showClientDetails.bind(UI) : null;
    if (oldShow) {
      UI.showClientDetails = function(client){
        App.currentClientFicha = client;
        oldShow(client);
        setTimeout(function(){
          var content = document.getElementById('client-details-content');
          if (!content || content.querySelector('[data-cadastro-final]')) return;
          var firstBox = content.firstElementChild;
          if (!firstBox) return;
          firstBox.insertAdjacentHTML('beforeend', '<div data-cadastro-final style="min-width:180px;"><span style="font-size:.72rem;text-transform:uppercase;color:var(--text-muted);font-weight:bold;display:block;">Data de Cadastro</span><strong>'+esc(clientDate(client))+'</strong></div>');
        }, 60);
      };
    }
    App.generateClientPdfFromCurrent = function(){
      var client = App.currentClientFicha;
      if (!client) return alert('Abra uma ficha antes de gerar o PDF.');
      var money = function(v){ return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(v || 0)); };
      var photo = function(url, label){
        var finalUrl = (window.TempPhotosCache && window.TempPhotosCache[url]) || url;
        if (!finalUrl) return '<div class="photo"><b>'+esc(label)+'</b><div class="empty">Imagem nao enviada</div></div>';
        return '<div class="photo"><b>'+esc(label)+'</b><img src="'+esc(finalUrl)+'"></div>';
      };
      var html = '<!doctype html><html><head><title>Ficha Comercial '+esc(client.id)+'</title><style>'
        + 'body{font-family:Arial,sans-serif;background:#fff;color:#111;margin:24px;font-size:12px}h1{color:#2563eb;font-size:20px;margin:0 0 8px}h3{color:#2563eb;font-size:14px;border-bottom:1px solid #bbb;padding-bottom:5px}.header{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border:1px solid #bbb;border-radius:8px;padding:10px;margin-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{border:1px solid #bbb;border-radius:8px;padding:10px;margin-bottom:12px}p{margin:5px 0}.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.photo{border:1px solid #bbb;border-radius:8px;padding:8px;text-align:center;break-inside:avoid}.photo img{max-width:100%;height:120px;object-fit:cover}.empty{height:80px;display:flex;align-items:center;justify-content:center;color:#777;border:1px dashed #bbb;margin-top:8px}.footer{margin-top:18px;font-size:10px;color:#555;border-top:1px solid #bbb;padding-top:8px}@media print{button{display:none}.grid{grid-template-columns:1fr 1fr}}'
        + '</style></head><body><h1>Ficha Comercial Completa do Cliente</h1><div class="header"><div><b>ID:</b> '+esc(client.id)+'</div><div><b>Status:</b> '+esc(client.status)+'</div><div><b>Data de Cadastro:</b> '+esc(clientDate(client))+'</div></div>'
        + '<div class="grid"><div class="box"><h3>1. Identificacao Comercial</h3><p><b>Nome Fantasia:</b> '+esc(client.name)+'</p><p><b>Razao Social:</b> '+esc(client.companyName)+'</p><p><b>CNPJ:</b> '+esc(client.cnpj)+'</p><p><b>Inscricao Estadual:</b> '+esc(client.ie)+'</p><p><b>Categoria:</b> '+esc(client.category)+'</p><p><b>Telefone:</b> '+esc(client.phone)+'</p><p><b>E-mail:</b> '+esc(client.email)+'</p><p><b>Vendedor:</b> '+esc(sellerName(client))+'</p><p><b>Unidade:</b> '+esc(unitName(client.unitId))+'</p><p><b>Score:</b> '+esc(scoreText(client))+'</p></div>'
        + '<div class="box"><h3>2. Logistica e Localizacao</h3><p><b>Cidade:</b> '+esc(client.city)+'</p><p><b>UF:</b> '+esc(client.state || client.uf)+'</p><p><b>CEP:</b> '+esc(client.cep)+'</p><p><b>Endereco:</b> '+esc(client.addressFull || [client.street, client.number, client.neighborhood].filter(Boolean).join(", "))+'</p><p><b>Localizacao:</b> '+esc(client.locationType)+'</p><p><b>Pavimentacao:</b> '+esc(client.pavementType)+'</p><p><b>Horario:</b> '+esc(client.deliverySchedule)+'</p><p><b>Primeiro Pedido:</b> '+esc(client.firstOrderPayment)+'</p><p><b>Motivo:</b> '+esc(client.firstOrderReason)+'</p><p><b>Forma de Recompra:</b> '+esc(client.repurchasePayment)+'</p></div>'
        + '<div class="box"><h3>3. Mapeamento de Mercado</h3><p><b>Amaretto Proximo:</b> '+esc(client.nearbyAmaretto)+'</p><p><b>Concorrencia Proxima:</b> '+esc(client.nearbyCompetitor)+'</p><p><b>Ja trabalha com sorvetes:</b> '+esc(client.iceCreamExperience)+'</p><p><b>Duas marcas:</b> '+esc(client.dualBrandPreference)+'</p></div>'
        + '<div class="box"><h3>4. Equipamentos & Financeiro</h3><p><b>Qtd Equipamentos:</b> '+esc(client.equipmentQty)+'</p><p><b>Equipamento Solicitado:</b> '+esc(client.requestedEqType)+'</p><p><b>Padrao envio:</b> '+esc(client.sendableEqType)+'</p><p><b>Produtos:</b> '+esc(Array.isArray(client.products) ? client.products.join(", ") : client.products)+'</p><p><b>Valor 1a Compra:</b> '+money(client.firstOrderValue)+'</p><p><b>Media Prevista:</b> '+money(client.predictedAverage)+'</p><p><b>Bonificacao:</b> '+esc(client.hasBonus)+' '+(client.bonusValue ? '('+money(client.bonusValue)+')' : '')+'</p></div></div>'
        + '<div class="box"><h3>5. Analise do Vendedor</h3><p>'+esc(client.sellerAnalysis)+'</p><p><b>Roteiro:</b> '+esc(client.route)+'</p></div>'
        + '<div class="box"><h3>6. Fotos do Cadastro</h3><div class="photos">'+photo(client.photoFachada,'Fachada')+photo(client.photoInterna01,'Interna 01')+photo(client.photoInterna02,'Interna 02')+photo(client.photoInterna03,'Interna 03')+photo(client.photoRua01,'Externa Rua 01')+photo(client.photoRua02,'Externa Rua 02')+photo(client.photoCnpj,'Foto CNPJ')+'</div></div>'
        + '<div class="footer">Gerado em '+new Date().toLocaleString('pt-BR')+' por '+esc((user()||{}).name || '-')+' - Controle de Campo</div></body></html>';
      App.showPdfPreviewModal(html, 'Ficha Comercial ' + esc(client.id));
    };
  }

  function patchLoadTickets(){
    if (!window.App || App.__ccFinalLoadTickets) return;
    App.__ccFinalLoadTickets = true;
    App.loadTickets = async function(){
      try {
        var u = user();
        var activeUnit = isAdmin(u) ? 'all' : (Store.getActiveUnitId ? Store.getActiveUnitId() : 'all');
        var query = activeUnit && activeUnit !== 'all' ? '?unitId=' + encodeURIComponent(activeUnit) : '';
        var tickets = await App.fetchFromApi('/api/chamados' + query);
        Store.saveTickets(Array.isArray(tickets) ? tickets : []);
        UI.renderTickets(Array.isArray(tickets) ? tickets : []);
        return tickets;
      } catch(err) {
        console.error('Erro ao carregar chamados do backend:', err);
        UI.renderTickets(Store.getTickets ? Store.getTickets() : []);
        return Store.getTickets ? Store.getTickets() : [];
      }
    };
  }

  function start(){
    patchStoreDates();
    patchClientRender();
    patchClientEdit();
    patchFichaAndPdf();
    patchLoadTickets();
    setTimeout(function(){
      if (location.hash.includes('clientes') && Store.getClients) renderClients(Store.getClients());
      if (location.hash.includes('chamados') && App.loadTickets) App.loadTickets();
    }, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  window.addEventListener('hashchange', function(){ setTimeout(start, 150); });
})();
