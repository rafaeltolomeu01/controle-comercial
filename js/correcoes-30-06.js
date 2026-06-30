/* Correções 30/06 - saldo, datas, PDF e abas sem recriar módulos */
(function(){
  if (window.__ccCorrecoes3006) return; window.__ccCorrecoes3006 = true;
  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num = (v)=>{
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === '') return 0;
    let raw = String(v).trim().replace(/[^0-9,.-]/g,'');
    if (raw.includes(',')) raw = raw.replace(/\./g,'').replace(',','.');
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };
  const money = (v)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(num(v));
  window.CC_num = num; window.CC_money = money;
  window.CC_safeDateBR = function(value){
    if (!value) return '-';
    const raw = String(value).trim();
    
    // 1. Já no formato BR: manter intacto
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:.*?(\d{2}):(\d{2}))?/);
    if (br) return `${br[1]}/${br[2]}/${br[3]}${br[4] ? ' ' + br[4] + ':' + br[5] : ''}`;
    
    // 2. Data pura YYYY-MM-DD (ou com hora zerada de BD): exibir diretamente sem deslocamento de timezone
    const pureDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]00:00:00)?/);
    if (pureDate && !raw.includes('T') && !raw.includes('Z')) {
      return `${pureDate[3]}/${pureDate[2]}/${pureDate[1]}`;
    }
    
    // 3. Timestamp ISO completo com fuso horário (ex: Z, -03:00): converter para o fuso local do navegador
    if (raw.includes('T') || raw.includes('Z') || raw.includes('-03') || raw.includes('+00')) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        const datePart = d.toLocaleDateString('pt-BR');
        const timePart = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `${datePart} ${timePart}`;
      }
    }
    
    // 4. Regex fallback para outros formatos ISO
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}${iso[4] ? ' ' + iso[4] + ':' + iso[5] : ''}`;
    
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
  };

  function fixApprovalValues(){
    document.querySelectorAll('.approval-item-row').forEach(row=>{
      const val = row.querySelector('.item-val-approved');
      const qty = row.querySelector('.item-qty-approved');
      const sel = row.querySelector('.item-evaluation-status');
      if (!val || !sel) return;
      const original = num(val.getAttribute('data-item-val-sol'));
      val.setAttribute('data-item-val-sol', String(original));
      val.max = String(original);
      if (sel.value === 'aprovado') val.value = original.toFixed(2);
      const label = row.querySelector('span');
      if (label && /Solicitado:/.test(label.textContent)) {
        const qtd = qty ? num(qty.getAttribute('data-item-qty-sol')) : '';
        label.textContent = `Solicitado: ${money(original)}${qtd ? ' (' + qtd + ' diárias)' : ''}`;
      }
    });
    let total=0;
    document.querySelectorAll('.approval-item-row').forEach(row=>{
      const st=row.querySelector('.item-evaluation-status')?.value;
      if (st !== 'reprovado' && st !== 'correcao') total += num(row.querySelector('.item-val-approved')?.value);
    });
    const totalEl = document.getElementById('det-despesa-total-aprovado-display');
    if (totalEl) totalEl.textContent = money(total);
  }

  const oldShow = window.App && App.showDespesaDetails;
  if (oldShow) {
    App.showDespesaDetails = async function(id){
      const r = await oldShow.apply(this, arguments);
      setTimeout(()=>{ fixApprovalValues(); ensureBalancePdfButton(id); }, 180);
      return r;
    };
  }

  const oldSubmit = window.App && App.submitExpenseApproval;
  if (oldSubmit) {
    App.submitExpenseApproval = async function(){
      fixApprovalValues();
      try {
        const ret = await oldSubmit.apply(this, arguments);
        return ret;
      } catch(e) {
        console.error(e);
        alert('Erro ao registrar parecer: ' + e.message);
      }
    };
  }

  function ensureBalancePdfButton(id){
    const footer = document.querySelector('#modal-despesa-details .login-card > div:last-child');
    if (!footer || document.getElementById('btn-gerar-pdf-saldo')) return;
    const btn = document.createElement('button');
    btn.id='btn-gerar-pdf-saldo'; btn.type='button'; btn.className='btn btn-primary';
    btn.style.cssText='width:150px;font-size:.85rem;'; btn.textContent='Gerar PDF';
    btn.onclick=()=>App.generateBalanceRequestPdf(document.getElementById('det-despesa-id')?.textContent || id);
    footer.insertBefore(btn, footer.firstChild);
  }

  if (window.App) App.generateBalanceRequestPdf = async function(id){
    try{
      const data = await this.fetchFromApi(`/api/despesas/${encodeURIComponent(id)}`);
      const rows = Array.isArray(data.itens) && data.itens.length ? data.itens.map(item=>`<tr><td>${esc(item.categoria)}</td><td>${esc(item.quantidade_solicitada ?? '-')}</td><td>${esc(item.quantidade_aprovada ?? '-')}</td><td>${money(item.valor_solicitado)}</td><td>${item.valor_aprovado == null ? '-' : money(item.valor_aprovado)}</td><td>${esc(item.status || '-')}</td><td>${esc(item.justificativa || '-')}</td></tr>`).join('') : '';
      const totalSol = (data.itens||[]).reduce((s,i)=>s+num(i.valor_solicitado),0) || num(data.totalGeral);
      const totalApr = (data.itens||[]).reduce((s,i)=>s+num(i.valor_aprovado),0);
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Solicitação de Saldo #${esc(data.id)}</title><style>body{font-family:Arial,sans-serif;color:#111;margin:28px}h1{font-size:20px;margin:0 0 12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:18px}.box{border:1px solid #999;padding:12px;border-radius:6px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #999;padding:7px;font-size:12px;text-align:left}th{background:#eee}.totais td{font-weight:bold}.assinatura{margin-top:40px;border:1px solid #999;padding:18px;border-radius:6px}.linha{margin-top:24px}.print{margin-bottom:18px}@media print{.print{display:none}}</style></head><body><button class="print" onclick="window.print()">Imprimir</button><h1>Solicitação de Saldo #${esc(data.id)}</h1><div class="box grid"><div><b>Empresa:</b> ${esc(data.empresa || data.unitName || data.unitId || '-')}</div><div><b>Solicitante:</b> ${esc(data.solicitante || '-')}</div><div><b>Data/Hora:</b> ${esc(window.CC_safeDateBR(data.data_solicitacao || data.created_at))} ${esc(data.hora_solicitacao || '')}</div><div><b>Placa:</b> ${esc(data.placa_veiculo || '-')}</div><div><b>Rota/Destino:</b> ${esc(data.rota_destino || '-')}</div><div><b>Status:</b> ${esc(data.status || '-')}</div><div style="grid-column:1/-1"><b>Justificativa:</b> ${esc(data.justificativa || '-')}</div></div><h2>Detalhamento de Custos</h2><table><thead><tr><th>Descrição</th><th>Qtd Sol.</th><th>Qtd Apr.</th><th>Vl. Solicitado</th><th>Vl. Aprovado</th><th>Status</th><th>Justificativa</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="totais"><td colspan="3">Totais</td><td>${money(totalSol)}</td><td>${money(totalApr)}</td><td colspan="2"></td></tr></tfoot></table><div class="assinatura"><div class="linha"><b>Aprovado por:</b> ______________________________________________</div><div class="linha"><b>Assinatura:</b> ________________________________________________</div><div class="linha"><b>Data:</b> ____ / ____ / ______</div><div class="linha"><b>Observação/Parecer:</b> _______________________________________</div></div><script>setTimeout(()=>window.print(),400)<\/script></body></html>`;
      const w = window.open('', '_blank'); w.document.write(html); w.document.close();
    }catch(e){ alert('Erro ao gerar PDF: '+e.message); }
  };

  // Corrigir datas já renderizadas como Invalid Date sem esconder erro real.
  setInterval(()=>{
    document.querySelectorAll('td').forEach(td=>{ if (/^Invalid Date$/i.test(td.textContent.trim())) td.textContent='-'; });
    // Remove aba visual duplicada mantendo a primeira ocorrência de cada texto.
    document.querySelectorAll('.view-tabs').forEach(host=>{
      const seen = new Set();
      [...host.querySelectorAll('a,button')].forEach(el=>{ const key=el.textContent.trim(); if (seen.has(key)) el.remove(); else seen.add(key); });
    });
  }, 500);
})();
