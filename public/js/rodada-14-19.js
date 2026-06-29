
/* Rodada 14-19 - correções pontuais sem alterar fluxos existentes */
(function(){
  'use strict';
  const money = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
  const num = (v) => { const n = Number(String(v ?? '').replace(/\./g,'').replace(',','.')); return Number.isFinite(n) ? n : 0; };
  const isAdmin = () => { const u = Store.getLoggedUser() || {}; const p = u.permissions || []; return u.profile === 'Administrador' || p.includes('Administrador') || p.includes('Administrador (Acesso Total)'); };
  const canApproveExpenses = () => { const u = Store.getLoggedUser() || {}; const p = u.permissions || []; return isAdmin() || u.profile === 'Financeiro' || p.includes('Financeiro') || p.includes('Aprovação de Despesas'); };
  const safeDate = (value, withTime=false) => {
    if (!value) return '--';
    let raw = String(value);
    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) d = new Date(raw + 'T00:00:00'); else d = new Date(raw);
    if (!d || Number.isNaN(d.getTime())) return '--';
    return withTime ? d.toLocaleString('pt-BR') : d.toLocaleDateString('pt-BR');
  };
  const nextUnitId = (units) => {
    const numericIds = (units || []).map(u => parseInt(u.id, 10)).filter(n => Number.isFinite(n) && n < 1000000);
    const max = numericIds.length ? Math.max(...numericIds) : 0;
    return String(max + 1);
  };
  const getUnitConfigDefaults = () => ({ diaria_vendedor:120, diaria_supervisor:150, diaria_gerente:180, maximo_diarias:4, permitir_sem_hospedagem:true });
  const normalizeUnit = (u, idx=0) => ({ ...getUnitConfigDefaults(), ...u, id: String(u.id ?? (idx+1)) });

  function ensureUnitFinanceFields(){
    const form = document.getElementById('unit-form');
    if (!form || document.getElementById('unit-diaria-vendedor')) return;
    const row = form.querySelector('.form-row');
    if (!row) return;
    const block = document.createElement('div');
    block.id = 'unit-finance-config-block';
    block.style.cssText = 'margin-top:18px; padding:18px; border:1px solid var(--border-color); border-radius:12px; width:100%;';
    block.innerHTML = `
      <h3 style="color:var(--primary-color); font-size:1rem; margin-bottom:14px;">Configurações Financeiras - Hospedagem</h3>
      <div class="form-row">
        <div class="form-group"><label for="unit-diaria-vendedor">Diária Vendedor (R$)</label><input type="number" id="unit-diaria-vendedor" min="0" step="0.01" value="120"></div>
        <div class="form-group"><label for="unit-diaria-supervisor">Diária Supervisor (R$)</label><input type="number" id="unit-diaria-supervisor" min="0" step="0.01" value="150"></div>
        <div class="form-group"><label for="unit-diaria-gerente">Diária Gerente (R$)</label><input type="number" id="unit-diaria-gerente" min="0" step="0.01" value="180"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label for="unit-maximo-diarias">Máximo de Diárias</label><input type="number" id="unit-maximo-diarias" min="0" step="1" value="4"></div>
        <div class="form-group"><label for="unit-permitir-sem-hospedagem">Permitir Sem Hospedagem</label><select id="unit-permitir-sem-hospedagem"><option value="true">Sim</option><option value="false">Não</option></select></div>
      </div>`;
    form.appendChild(block);
  }
  function readUnitFinanceFields(){
    return {
      diaria_vendedor: num(document.getElementById('unit-diaria-vendedor')?.value || 120),
      diaria_supervisor: num(document.getElementById('unit-diaria-supervisor')?.value || 150),
      diaria_gerente: num(document.getElementById('unit-diaria-gerente')?.value || 180),
      maximo_diarias: parseInt(document.getElementById('unit-maximo-diarias')?.value || '4',10) || 4,
      permitir_sem_hospedagem: String(document.getElementById('unit-permitir-sem-hospedagem')?.value || 'true') === 'true'
    };
  }
  function fillUnitFinanceFields(unit){
    ensureUnitFinanceFields();
    unit = { ...getUnitConfigDefaults(), ...(unit||{}) };
    const set = (id,val) => { const el=document.getElementById(id); if(el) el.value = val; };
    set('unit-diaria-vendedor', unit.diaria_vendedor);
    set('unit-diaria-supervisor', unit.diaria_supervisor);
    set('unit-diaria-gerente', unit.diaria_gerente);
    set('unit-maximo-diarias', unit.maximo_diarias);
    set('unit-permitir-sem-hospedagem', String(unit.permitir_sem_hospedagem !== false));
  }

  // 16/17/18 - Unidades: salvar config financeira, ID sequencial e excluir unidade com proteção simples.
  const oldGetUnits = Store.getUnits?.bind(Store);
  if (oldGetUnits) Store.getUnits = function(){ return (oldGetUnits() || []).map(normalizeUnit); };
  const oldSaveUnits = Store.saveUnits?.bind(Store);
  if (oldSaveUnits) Store.saveUnits = function(units){ return oldSaveUnits((units || []).map(normalizeUnit)); };

  const oldEditUnit = App.editUnit?.bind(App);
  App.editUnit = function(unitId){
    if (oldEditUnit) oldEditUnit(unitId);
    const unit = (Store.getUnits() || []).find(u => String(u.id) === String(unitId));
    fillUnitFinanceFields(unit);
    const form = document.getElementById('unit-form');
    if (form) form.dataset.editingId = unitId;
  };

  function bindUnitFormPatch(){
    ensureUnitFinanceFields();
    const openBtn = document.getElementById('btn-open-unit-form');
    if (openBtn && !openBtn.dataset.financePatch) {
      openBtn.dataset.financePatch = '1';
      openBtn.addEventListener('click', () => setTimeout(()=>fillUnitFinanceFields(getUnitConfigDefaults()), 50));
    }
    const form = document.getElementById('unit-form');
    if (!form || form.dataset.rodada1419Bound) return;
    form.dataset.rodada1419Bound = '1';
    form.addEventListener('submit', (e)=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      const name = document.getElementById('unit-name')?.value?.trim();
      if (!name) return alert('Informe o nome da unidade.');
      const units = Store.getUnits() || [];
      const editingId = form.dataset.editingId || '';
      const finance = readUnitFinanceFields();
      if (editingId) {
        const unit = units.find(u => String(u.id) === String(editingId));
        if (unit) Object.assign(unit, finance, { name });
        delete form.dataset.editingId;
      } else {
        units.push({ id: nextUnitId(units), name, ...finance });
      }
      Store.saveUnits(units);
      UI.populateUnitDropdowns?.();
      UI.populateMovementCompanyDropdown?.();
      UI.renderUnits?.();
      form.reset(); fillUnitFinanceFields(getUnitConfigDefaults());
      const btn = form.querySelector('button[type="submit"]'); if (btn) btn.textContent = 'Cadastrar Unidade';
      document.getElementById('unit-form-container')?.classList.add('hidden');
      App.showToast?.(editingId ? 'Configurações da unidade atualizadas com sucesso.' : 'Unidade cadastrada com sucesso.');
    }, true);
  }

  const oldRenderUnits = UI.renderUnits?.bind(UI);
  UI.renderUnits = function(){
    if (!document.getElementById('units-table-body')) return oldRenderUnits && oldRenderUnits();
    const units = Store.getUnits() || [];
    const prospects = Store.getProspects?.() || [];
    const clients = Store.getClients?.() || [];
    const tickets = Store.getTickets?.() || [];
    const movements = Store.getMovements?.() || [];
    const body = document.getElementById('units-table-body');
    body.innerHTML = units.map((unit, idx) => {
      const parsedId = parseInt(unit.id,10);
      const idVisual = (Number.isFinite(parsedId) && parsedId < 1000000) ? String(parsedId) : String(idx + 1);
      const hasLinks = prospects.some(x=>String(x.unitId)===String(unit.id)) || clients.some(x=>String(x.unitId)===String(unit.id)) || tickets.some(x=>String(x.unitId)===String(unit.id)) || movements.some(x=>String(x.unitId||x.unit_id)===String(unit.id));
      const unitProspects = prospects.filter(p=>String(p.unitId)===String(unit.id)).length;
      const unitClients = clients.filter(c=>String(c.unitId)===String(unit.id) && c.status === 'Aprovado').length;
      const unitTickets = tickets.filter(t=>String(t.unitId)===String(unit.id) && ['Aberto','Em Atendimento'].includes(t.status)).length;
      const unitMovements = movements.filter(m=>String(m.unitId||m.unit_id||'')===String(unit.id)).length;
      const del = isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.deleteUnit('${unit.id}')">Excluir</button>` : '';
      return `<tr><td style="font-family:monospace;">${idVisual}</td><td style="font-weight:600;">${unit.name}</td><td style="text-align:center;">${unitProspects}</td><td style="text-align:center;">${unitClients}</td><td style="text-align:center;"><span class="badge-status ${unitTickets>0?'badge-danger':'badge-success'}">${unitTickets} ativos</span></td><td style="text-align:center;">${unitMovements}</td><td style="text-align:center; display:flex; gap:6px; justify-content:center;"><button class="btn btn-secondary btn-sm" onclick="App.editUnit('${unit.id}')">Editar</button>${del}</td></tr>`;
    }).join('');
    bindUnitFormPatch();
  };
  App.deleteUnit = function(unitId){
    if (!isAdmin()) return alert('Somente administrador pode excluir empresa.');
    const units = Store.getUnits() || [];
    const prospects = Store.getProspects?.() || [];
    const clients = Store.getClients?.() || [];
    const tickets = Store.getTickets?.() || [];
    const movements = Store.getMovements?.() || [];
    const hasLinks = prospects.some(x=>String(x.unitId)===String(unitId)) || clients.some(x=>String(x.unitId)===String(unitId)) || tickets.some(x=>String(x.unitId)===String(unitId)) || movements.some(x=>String(x.unitId||x.unit_id)===String(unitId));
    if (hasLinks) return alert('Não é possível excluir esta empresa porque existem registros vinculados a ela.');
    if (!confirm('Tem certeza que deseja excluir esta empresa? Essa ação não poderá ser desfeita.')) return;
    Store.saveUnits(units.filter(u=>String(u.id)!==String(unitId)));
    UI.populateUnitDropdowns?.(); UI.renderUnits?.(); App.showToast?.('Empresa excluída com sucesso.');
  };

  // 14/15 - Aprovação de Despesas de Campo + imagens no PDF.
  const oldRenderExpenses = UI.renderExpenses?.bind(UI);
  UI.renderExpenses = function(expenses){
    oldRenderExpenses?.(expenses);
    const body = document.getElementById('expenses-table-body'); if (!body) return;
    [...body.querySelectorAll('tr')].forEach((tr, idx)=>{
      const exp = (expenses || [])[idx]; if (!exp) return;
      const actionTd = tr.querySelector('td:last-child'); if (!actionTd) return;
      const status = String(exp.status || '').toLowerCase();
      if (canApproveExpenses() && status === 'pendente') {
        actionTd.innerHTML = `<div style="display:flex; gap:4px; flex-wrap:wrap;"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); App.generateExpenseComprovantePdf('${exp.id}')">PDF</button><button class="btn btn-success btn-sm" onclick="event.stopPropagation(); App.approveRegisteredExpense('${exp.id}')">Aprovar</button><button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.rejectRegisteredExpense('${exp.id}')">Reprovar</button><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.correctRegisteredExpense('${exp.id}')">Correção</button></div>`;
      } else if (String(exp.status) === 'Correção Solicitada' && String(exp.userId) === String((Store.getLoggedUser()||{}).id)) {
        actionTd.innerHTML = `<button class="btn btn-warning btn-sm" onclick="event.stopPropagation(); App.showToast('Abra uma nova despesa corrigida e reenvie para análise.')">Corrigir</button> <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.generateExpenseComprovantePdf('${exp.id}')">PDF</button>`;
      }
    });
  };
  async function setExpenseStatus(id, status){
    let observacao = '';
    if (status !== 'Aprovado') {
      observacao = prompt(status === 'Correção Solicitada' ? 'Informe o que precisa ser corrigido:' : 'Informe o motivo da reprovação:') || '';
      if (!observacao.trim()) return alert('Motivo obrigatório.');
    }
    const result = await App.fetchFromApi(`/api/despesas-reembolsos/${id}/approval`, {method:'PUT', body: JSON.stringify({status, observacao})});
    if (result?.success) { App.showToast?.('Despesa avaliada com sucesso.'); App.loadExpenses?.(); UI.renderDashboard?.(); }
  }
  App.approveRegisteredExpense = (id)=>setExpenseStatus(id,'Aprovado');
  App.rejectRegisteredExpense = (id)=>setExpenseStatus(id,'Reprovado');
  App.correctRegisteredExpense = (id)=>setExpenseStatus(id,'Correção Solicitada');

  async function imageToDataUrl(src){
    if (!src) return '';
    if (/^data:image\//.test(src)) return src;
    try {
      const r = await fetch(src, {cache:'no-store'}); const b = await r.blob();
      return await new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=reject; fr.readAsDataURL(b); });
    } catch(e) { return src; }
  }
  App.generateExpenseComprovantePdf = async function(id){
    try {
      const exp = await this.fetchFromApi(`/api/despesas-reembolsos/${id}`);
      if (!exp) return this.showToast?.('Despesa não encontrada!', 'danger');
      const { jsPDF } = window.jspdf; const doc = new jsPDF('p','mm','a4');
      doc.setDrawColor(37,99,235); doc.setLineWidth(1); doc.rect(5,5,200,287);
      doc.setFillColor(37,99,235); doc.rect(5,5,200,20,'F');
      doc.setFont('Helvetica','bold'); doc.setFontSize(12); doc.setTextColor(255,255,255); doc.text('COMPROVANTE DE DESPESA DE VIAGEM',10,17);
      doc.setTextColor(0,0,0); doc.setFontSize(9); doc.setFont('Helvetica','normal');
      doc.text(`Comprovante ID: #${exp.id}`,15,33); doc.text(`Data / Hora: ${safeDate(exp.date)}${exp.time ? ' às '+exp.time : ''}`,110,33);
      doc.text(`Vendedor: ${UI.getUserName(exp.userId)}`,15,39); doc.text(`Unidade: ${UI.getUnitName(exp.unitId)}`,110,39);
      doc.text(`Finalidade: ${exp.finalidade || '-'}`,15,45); doc.text(`Tipo de Operação: ${exp.operacao || '-'}`,110,45); doc.text(`Status: ${exp.status || '-'}`,15,51);
      doc.setDrawColor(220,220,220); doc.line(10,56,200,56); let y=63;
      doc.setFont('Helvetica','bold'); doc.text('DETALHES DA DESPESA',15,y); doc.setFont('Helvetica','normal'); y+=7;
      doc.text(`Valor: ${money(exp.value)}`,15,y); y+=7;
      if (exp.observation) { const lines=doc.splitTextToSize(`Observação: ${exp.observation}`,180); doc.text(lines,15,y); y+=lines.length*5+4; }
      if (exp.descreva) { const lines=doc.splitTextToSize(`Descrição: ${exp.descreva}`,180); doc.text(lines,15,y); y+=lines.length*5+4; }
      doc.line(10,y,200,y); y+=8; doc.setFont('Helvetica','bold'); doc.text('ANEXOS / COMPROVANTES FOTOGRÁFICOS',15,y); y+=8; doc.setFont('Helvetica','normal');
      const imgs = [];
      if (exp.foto_comprovante) imgs.push(['Comprovante', exp.foto_comprovante]);
      if (exp.foto_odometro) imgs.push(['Odômetro / KM', exp.foto_odometro]);
      if (!imgs.length) { doc.text('Nenhum comprovante anexado.',15,y); }
      else {
        let x=15;
        for (const [label,src] of imgs) {
          const dataUrl = await imageToDataUrl(src);
          doc.text(label+':', x, y); 
          try { doc.addImage(dataUrl, 'JPEG', x, y+4, 80, 60); } catch(e) { try { doc.addImage(dataUrl, 'PNG', x, y+4, 80, 60); } catch(_) { doc.text('[Erro ao renderizar imagem]', x, y+10); } }
          x += 95; if (x > 120) { x = 15; y += 70; }
        }
      }
      doc.save(`Comprovante-Despesa-${exp.id}.pdf`); this.showToast?.('Documento PDF gerado com sucesso!');
    } catch(err) { console.error(err); alert('Erro ao gerar PDF: ' + err.message); }
  };

  // 19 - Datas válidas em solicitação/aprovação de saldo.
  const oldRenderDespesasTable = App.renderDespesasTable?.bind(App);
  App.renderDespesasTable = function(list){
    if (Array.isArray(list)) list.forEach(r => { if (!r.data_solicitacao && !r.created_at && !r.createdAt) r.data_solicitacao = ''; });
    oldRenderDespesasTable?.(list);
    document.querySelectorAll('#despesas-solicitacoes-table-body tr').forEach(tr => {
      const dateTd = tr.children[1];
      if (dateTd && /Invalid Date/i.test(dateTd.textContent)) dateTd.textContent='--';
    });
  };

  // Abas visuais de aprovação de despesas.
  function ensureExpenseApprovalTab(){
    const tabs = document.querySelector('#view-despesas .view-tabs, #view-solicitacao-despesas .view-tabs, #view-despesas-dashboard .view-tabs');
    if (!tabs || tabs.querySelector('#tab-expense-approvals')) return;
    const a = document.createElement('a'); a.href='#despesas'; a.id='tab-expense-approvals'; a.className='view-tab-btn'; a.textContent='Aprovação de Despesas';
    a.onclick = () => { sessionStorage.setItem('cc_expense_approval_mode','1'); setTimeout(()=>App.loadExpenses?.(),200); };
    tabs.appendChild(a);
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{ bindUnitFormPatch(); ensureExpenseApprovalTab(); },800));
  new MutationObserver(()=>setTimeout(()=>{ bindUnitFormPatch(); ensureExpenseApprovalTab(); },80)).observe(document.documentElement,{childList:true,subtree:true});
})();
