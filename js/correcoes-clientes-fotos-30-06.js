(function(){
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const isAdmin = () => {
    const u = (window.Store && Store.getLoggedUser && Store.getLoggedUser()) || {};
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    return u.profile === 'Administrador' || perms.includes('Administrador') || perms.includes('Administrador (Acesso Total)');
  };
  const getAllClientsSafe = () => (Store.getAllClients ? Store.getAllClients() : Store.getClients()).filter(c => !c.deleted && !c.excluido && c.active !== false);
  const fmtDate = (c) => c.date || c.data_cadastro || c.created_at || c.createdAt || '-';
  const sellerName = (id) => (window.UI && UI.getUserName ? UI.getUserName(id) : (id || '-'));
  const scoreText = (c) => {
    const score = (c.score ?? '');
    const cls = c.classification || c.scoreClassification || '';
    return `${score !== '' ? 'Score ' + esc(score) : 'Score -'}${cls ? ' • ' + esc(cls) : ''}`;
  };

  function installCss(){
    if (document.getElementById('clientes-compactos-css')) return;
    const style = document.createElement('style');
    style.id = 'clientes-compactos-css';
    style.textContent = `
      #clients-table-body tr.cliente-compact-row{cursor:pointer;}
      .cliente-compact-card{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;}
      .cliente-compact-main{min-width:0;flex:1;}
      .cliente-compact-name{font-weight:800;color:var(--text-main);font-size:.9rem;line-height:1.15;white-space:normal;overflow-wrap:anywhere;word-break:break-word;}
      .cliente-compact-meta{font-size:.72rem;color:var(--text-muted);line-height:1.25;white-space:normal;overflow-wrap:anywhere;word-break:break-word;margin-top:2px;}
      .cliente-compact-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center;}
      #clients-table-body .btn-xs{padding:3px 8px;font-size:.72rem;line-height:1.2;border-radius:6px;}
      #modal-client-details .client-ficha-compact{max-width:100%;overflow-x:hidden;}
      #modal-client-details .client-section{border:1px solid var(--border-color);border-radius:10px;padding:10px;margin-bottom:10px;background:rgba(255,255,255,.015);}
      #modal-client-details .client-section h4{margin:0 0 7px;color:var(--primary-color);font-size:.9rem;border-bottom:1px solid var(--border-color);padding-bottom:6px;}
      #modal-client-details .client-field{display:grid;grid-template-columns:minmax(92px,34%) minmax(0,1fr);gap:8px;border-bottom:1px solid rgba(255,255,255,.04);padding:5px 0;font-size:.78rem;line-height:1.25;}
      #modal-client-details .client-field:last-child{border-bottom:0;}
      #modal-client-details .client-label{color:var(--text-muted);font-weight:700;overflow-wrap:anywhere;}
      #modal-client-details .client-value{color:var(--text-main);font-weight:600;white-space:normal;overflow-wrap:anywhere;word-break:break-word;min-width:0;}
      #modal-client-details .client-photos-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:8px;}
      #modal-client-details .photo-card{border:1px solid var(--border-color);border-radius:8px;padding:7px;text-align:center;min-width:0;}
      #modal-client-details .photo-card img{width:100%;height:86px;object-fit:cover;border-radius:6px;cursor:pointer;}
      #modal-client-details .photo-card b{display:block;font-size:.72rem;margin-bottom:5px;overflow-wrap:anywhere;}
      #modal-client-details .photo-empty{height:70px;display:flex;align-items:center;justify-content:center;border:1px dashed var(--border-color);border-radius:6px;color:var(--text-muted);font-size:.72rem;}
      @media(max-width:700px){
        .table-responsive{overflow-x:hidden!important;}
        #clients-table-body tr.cliente-compact-row{display:block;border:1px solid var(--border-color);border-radius:10px;margin:7px 0;padding:8px;background:rgba(15,23,42,.75);}
        #clients-table-body tr.cliente-compact-row td{display:block!important;border:0!important;padding:0!important;width:100%!important;}
        #modal-client-details .client-field{grid-template-columns:1fr;gap:2px;padding:6px 0;}
      }
    `;
    document.head.appendChild(style);
  }

  function renderPhotoCard(label, url){
    const finalUrl = (window.App && App.resolveMediaUrl ? App.resolveMediaUrl(url) : url) || '';
    if (!finalUrl) return `<div class="photo-card"><b>${esc(label)}</b><div class="photo-empty">Imagem não enviada</div></div>`;
    return `<div class="photo-card"><b>${esc(label)}</b><img src="${esc(finalUrl)}" alt="${esc(label)}" onclick="App.showFacadeImage && App.showFacadeImage('${esc(finalUrl).replace(/'/g,'\\&#39;')}')" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'photo-empty',textContent:'Imagem indisponível'}))"><div style="font-size:.65rem;color:var(--text-muted);overflow-wrap:anywhere;margin-top:4px;">${esc(finalUrl)}</div></div>`;
  }
  function field(label, value){
    if (value === undefined || value === null || value === '') return '';
    return `<div class="client-field"><div class="client-label">${esc(label)}</div><div class="client-value">${esc(value)}</div></div>`;
  }

  function patchUI(){
    if (!window.UI || !window.Store || UI.__clientesCompactPatched) return;
    UI.__clientesCompactPatched = true;
    const oldRefresh = window.App && App.refreshAllLists;

    UI.renderClients = function(clients){
      installCss();
      const activeUnitId = Store.getActiveUnitId && Store.getActiveUnitId();
      const user = Store.getLoggedUser && Store.getLoggedUser();
      let list = Array.isArray(clients) ? clients.slice() : [];
      list = list.filter(c => !c.deleted && !c.excluido && c.active !== false);
      if (activeUnitId && activeUnitId !== 'all') list = list.filter(c => c.unitId === activeUnitId);
      if (user && user.profile === 'Vendedor') list = list.filter(c => c.userId === user.id);
      const body = document.getElementById('clients-table-body');
      if (!body) return;
      body.innerHTML = list.map(c => {
        const adminBtn = isAdmin() ? `<button class="btn btn-danger btn-xs" onclick="event.stopPropagation(); App.deleteClientAdmin('${esc(c.id)}')">Apagar</button>` : '';
        return `<tr class="cliente-compact-row" onclick="App.showClientDetails('${esc(c.id)}')"><td colspan="10"><div class="cliente-compact-card"><div class="cliente-compact-main"><div class="cliente-compact-name">${esc(c.name || c.nomeFantasia || c.companyName || 'Cliente sem nome')}</div><div class="cliente-compact-meta">${esc(sellerName(c.userId))} • ${esc(fmtDate(c))} • ${scoreText(c)}</div></div><div class="cliente-compact-actions"><button class="btn btn-primary btn-xs" onclick="event.stopPropagation(); App.showClientDetails('${esc(c.id)}')">Ver Ficha</button>${adminBtn}</div></div></td></tr>`;
      }).join('') || `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:12px;">Nenhum cliente cadastrado.</td></tr>`;
    };

    UI.showClientDetails = function(client){
      installCss();
      if (window.App) window.App.currentClientFicha = client;
      const modal = document.getElementById('modal-client-details');
      const content = document.getElementById('client-details-content');
      if (!modal || !content) return;
      const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
      const products = Array.isArray(client.products) ? client.products.join(', ') : (client.products || '---');
      const adminDelete = isAdmin() ? `<button class="btn btn-danger" type="button" onclick="App.deleteClientAdmin('${esc(client.id)}'); document.getElementById('modal-client-details').style.display='none'">Apagar Cliente</button>` : '';
      content.innerHTML = `<div class="client-ficha-compact">
        <div class="client-section"><h4>Registro</h4>${field('ID', client.id)}${field('Status', client.status)}${field('Score', `${client.score ?? '-'} ${client.classification || ''}`)}</div>
        <div class="client-section"><h4>1. Identificação Comercial</h4>${field('Nome Fantasia', client.name)}${field('Razão Social', client.companyName)}${field('CNPJ', client.cnpj)}${field('Inscrição Estadual', client.ie)}${field('Categoria', client.category)}${field('Telefone', client.phone)}${field('E-mail', client.email)}${field('Vendedor', sellerName(client.userId))}${field('Unidade', UI.getUnitName ? UI.getUnitName(client.unitId) : client.unitId)}</div>
        <div class="client-section"><h4>2. Logística e Localização</h4>${field('Cidade', client.city)}${field('UF', client.state)}${field('CEP', client.cep)}${field('Rua', client.street)}${field('Número', client.number)}${field('Bairro', client.neighborhood)}${field('Endereço', client.addressFull)}${field('Localização', client.locationType)}${field('Pavimentação', client.pavementType)}${field('Horário Receb.', client.deliverySchedule)}${field('1º Pedido', client.firstOrderPayment)}${field('Motivo', client.firstOrderReason)}${field('Recompra', client.repurchasePayment)}</div>
        <div class="client-section"><h4>3. Mercado</h4>${field('Amaretto próximo', client.nearbyAmaretto)}${field('Concorrência', client.nearbyCompetitor)}${field('Já trabalha com sorvete', client.iceCreamExperience)}${field('Duas marcas', client.dualBrandPreference)}</div>
        <div class="client-section"><h4>4. Equipamentos e Financeiro</h4>${field('Qtd Equip.', client.equipmentQty)}${field('Equip. solicitado', client.requestedEqType)}${field('Padrão envio', client.sendableEqType)}${field('Produtos', products)}${field('Valor 1ª compra', money(client.firstOrderValue))}${field('Média mensal', money(client.predictedAverage))}${field('Bonificação', client.hasBonus)}${field('Valor bonificação', client.bonusValue ? money(client.bonusValue) : '')}</div>
        <div class="client-section"><h4>5. Análise do Vendedor</h4><div class="client-value" style="font-style:italic;">${esc(client.sellerAnalysis || 'Nenhuma análise inserida.')}</div></div>
        <div class="client-section"><h4>6. Fotos do Cadastro</h4><div class="client-photos-grid">${renderPhotoCard('Fachada', client.photoFachada)}${renderPhotoCard('Interna 01', client.photoInterna01)}${renderPhotoCard('Interna 02', client.photoInterna02)}${renderPhotoCard('Interna 03', client.photoInterna03)}${renderPhotoCard('Externa Rua 01', client.photoRua01)}${renderPhotoCard('Externa Rua 02', client.photoRua02)}${renderPhotoCard('Foto CNPJ', client.photoCnpj)}</div></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:10px;border-top:1px solid var(--border-color);padding-top:10px;">${adminDelete}<button class="btn btn-primary" type="button" onclick="App.generateClientPdfFromCurrent && App.generateClientPdfFromCurrent()">Gerar PDF</button><button class="btn btn-secondary" type="button" onclick="document.getElementById('modal-client-details').style.display='none'">Fechar Ficha</button></div>
      </div>`;
      modal.style.display = 'flex';
    };
  }

  function patchApp(){
    if (!window.App || !window.Store || App.__clientesFotosPatched) return;
    App.__clientesFotosPatched = true;
    const oldUploadFile = App.uploadFile && App.uploadFile.bind(App);
    if (oldUploadFile) {
      App.uploadFile = async function(file){
        if (!file) return '';
        const url = await oldUploadFile(file);
        if (!url || /^data:/.test(url) || url.startsWith('blob:')) throw new Error('Upload não retornou URL persistente do banco.');
        return url;
      };
    }
    App.deleteClientAdmin = async function(id){
      if (!isAdmin()) return alert('Somente administrador pode apagar clientes.');
      if (!confirm('Tem certeza que deseja apagar este cliente?\nEsta ação não poderá ser desfeita.')) return;
      try {
        if (Store.deleteClient) await Store.deleteClient(id);
        else Store.saveClients(getAllClientsSafe().filter(c => String(c.id) !== String(id)));
        if (App.fetchFromApi) await App.fetchFromApi('/api/clientes/' + encodeURIComponent(id), { method:'DELETE' }).catch(()=>{});
        App.refreshAllLists && App.refreshAllLists();
        App.showToast ? App.showToast('Cliente apagado com sucesso.') : alert('Cliente apagado com sucesso.');
      } catch (err) {
        console.error(err);
        alert('Erro ao apagar cliente: ' + (err.message || err));
      }
    };

    // Ao abrir cadastro novo, limpa apenas previews e campos de arquivo, sem mexer em dados após erro.
    document.addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest && ev.target.closest('#btn-open-client-form');
      if (!btn) return;
      setTimeout(() => {
        ['fachada','interna01','interna02','interna03','rua01','rua02','cnpj'].forEach(s => {
          const input = document.getElementById('client-photo-' + s);
          const img = document.getElementById('preview-img-' + s);
          const box = document.getElementById('preview-container-' + s);
          if (input) input.value = '';
          if (img) img.removeAttribute('src');
          if (box) box.style.display = 'none';
        });
      }, 0);
    }, true);
  }

  function fixPaymentOptions(){
    const sel = document.getElementById('client-first-order-payment');
    if (!sel || sel.dataset.onlyThreeOptions === '1') return;
    const current = sel.value;
    sel.innerHTML = '<option value="" selected disabled>Selecione...</option><option value="À vista">À vista</option><option value="Boleto">Boleto</option><option value="Metade à vista, metade no boleto">Metade à vista, metade no boleto</option>';
    if (['À vista','Boleto','Metade à vista, metade no boleto'].includes(current)) sel.value = current;
    sel.dataset.onlyThreeOptions = '1';
  }

  function start(){ installCss(); patchUI(); patchApp(); fixPaymentOptions(); }
  document.addEventListener('DOMContentLoaded', start);
  window.addEventListener('hashchange', () => setTimeout(start,50));
  setInterval(start, 1000);
})();
