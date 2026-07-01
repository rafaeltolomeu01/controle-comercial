/* Correção: card compacto e detalhes completos de chamados mecânicos */
(function(){
  'use strict';
  if (window.__ccChamadosMobileDetalhesCompacto) return;
  window.__ccChamadosMobileDetalhesCompacto = true;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[ch];
    });
  }
  function validUrl(url) {
    const v = String(url || '').trim();
    return !!v && !['null','undefined','/uploads/null','/uploads/undefined','/uploads/'].includes(v);
  }
  function seller(ticket) { return ticket.seller || (window.UI && UI.getUserName ? UI.getUserName(ticket.userId) : ticket.userId) || ''; }
  function unit(ticket) { return ticket.unit || (window.UI && UI.getUnitName ? UI.getUnitName(ticket.unitId) : ticket.unitId) || ''; }
  function badgeClassStatus(status) { if (status === 'Resolvido') return 'badge-success'; if (status === 'Em Atendimento') return 'badge-primary'; return 'badge-warning'; }
  function badgeClassPriority(priority) { if (priority === 'Alta') return 'badge-danger'; if (priority === 'Média') return 'badge-warning'; return 'badge-primary'; }
  function mediaItems(ticket) {
    const items = [];
    if (validUrl(ticket.defectPhoto)) items.push({ url: ticket.defectPhoto, label: 'Foto do Defeito', kind: 'image' });
    if (validUrl(ticket.defectVideo)) items.push({ url: ticket.defectVideo, label: 'Vídeo do Defeito', kind: 'video' });
    if (validUrl(ticket.fotoAntes)) items.push({ url: ticket.fotoAntes, label: 'Foto Antes', kind: 'image' });
    if (validUrl(ticket.fotoDepois)) items.push({ url: ticket.fotoDepois, label: 'Foto Depois', kind: 'image' });
    if (validUrl(ticket.fotoPlaqueta)) items.push({ url: ticket.fotoPlaqueta, label: 'Foto Plaqueta', kind: 'image' });
    if (validUrl(ticket.videoAtendimento)) items.push({ url: ticket.videoAtendimento, label: 'Vídeo Atendimento', kind: 'video' });
    return items;
  }
  function detailRow(label, value) {
    const has = value !== undefined && value !== null && String(value).trim() !== '';
    return '<div style=\"display:grid;grid-template-columns:minmax(120px,38%) 1fr;gap:14px;border-bottom:1px solid var(--border-color);padding:9px 0;align-items:start;\"><strong style=\"color:var(--text-muted);\">' + esc(label) + '</strong><span style=\"text-align:right;white-space:pre-wrap;word-break:break-word;\">' + (has ? esc(value) : '—') + '</span></div>';
  }
  function section(title) { return '<h4 style=\"margin:16px 0 6px;color:var(--primary-color);font-size:.92rem;border-bottom:1px solid rgba(37,99,235,.35);padding-bottom:6px;\">' + esc(title) + '</h4>'; }
  function actionButton(ticket, isStaff) {
    if (ticket.status === 'Aberto') return isStaff ? '<button class=\"btn btn-secondary btn-sm\" onclick=\"event.stopPropagation(); App.startTicketService(\'' + esc(ticket.id) + '\')\">INICIAR</button>' : '';
    if (ticket.status === 'Em Atendimento') return isStaff ? '<button class=\"btn btn-success btn-sm\" onclick=\"event.stopPropagation(); App.openFichaTecnica(\'' + esc(ticket.id) + '\')\">FICHA</button>' : '';
    return '<button class=\"btn btn-secondary btn-sm\" onclick=\"event.stopPropagation(); App.openFichaTecnica(\'' + esc(ticket.id) + '\')\">LAUDO</button>';
  }
  function installRenderTickets(){
    if (!window.UI || !window.Store) return false;
    UI.renderTickets = function(tickets) {
      const activeUnitId = Store.getActiveUnitId ? Store.getActiveUnitId() : 'all';
      const user = Store.getLoggedUser ? Store.getLoggedUser() : null;
      let list = Array.isArray(tickets) ? tickets.slice() : [];
      if (activeUnitId !== 'all') list = list.filter(t => t.unitId === activeUnitId);
      if (user && user.profile === 'Vendedor') list = list.filter(t => String(t.userId) === String(user.id));
      const body = document.getElementById('tickets-table-body');
      if (!body) return;
      const isStaff = user && ['Administrador','Responsável Equipamentos','Mecânico'].includes(user.profile);
      body.innerHTML = list.map(function(ticket){
        const clientName = ticket.fantasyName || ticket.client || 'Cliente não informado';
        const city = ticket.city ? ' • ' + ticket.city : '';
        const equip = [ticket.equipmentSerial, ticket.equipmentType].filter(Boolean).join(' • ') || 'Equipamento não informado';
        const resp = [seller(ticket), ticket.mechanic ? 'Mec: ' + ticket.mechanic : ''].filter(Boolean).join(' • ');
        const anexos = mediaItems(ticket).length;
        const anexosText = anexos ? ' • ' + anexos + ' anexo' + (anexos > 1 ? 's' : '') : '';
        return '<tr class=\"mobile-summary-row cc-ticket-compact-row\" onclick=\"App.showTicketDetails(\'' + esc(ticket.id) + '\')\">' +
          '<td colspan=\"12\" data-label=\"Chamado\" style=\"padding:10px 12px!important;\">' +
            '<div style=\"display:grid;gap:6px;\">' +
              '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px;\"><strong style=\"font-family:monospace;font-size:.9rem;\">' + esc(ticket.id || '') + '</strong><span style=\"display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;\"><span class=\"badge-status ' + badgeClassPriority(ticket.priority) + '\">' + esc(ticket.priority || '—') + '</span><span class=\"badge-status ' + badgeClassStatus(ticket.status) + '\">' + esc(ticket.status || '—') + '</span></span></div>' +
              '<div style=\"font-size:.84rem;line-height:1.25;\"><strong>' + esc(clientName) + '</strong><span style=\"color:var(--text-muted);\">' + esc(city) + '</span></div>' +
              '<div style=\"font-size:.78rem;color:var(--text-muted);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">' + esc(equip) + ' • ' + esc(ticket.date || 'S/D') + '</div>' +
              '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px;\"><span style=\"font-size:.78rem;color:var(--text-muted);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">' + esc(ticket.title || 'Sem descrição') + (resp ? ' • ' + esc(resp) : '') + esc(anexosText) + '</span>' + actionButton(ticket, isStaff) + '</div>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('');
    };
    return true;
  }
  function installDetails(){
    if (!window.App || !window.Store) return false;
    App.showTicketDetails = function(id) {
      const tickets = (Store.getTickets && Store.getTickets()) || [];
      const ticket = tickets.find(t => String(t.id) === String(id));
      if (!ticket) return alert('Chamado não encontrado.');
      let modal = document.getElementById('modal-ticket-details-mobile');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-ticket-details-mobile';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.72);align-items:center;justify-content:center;padding:14px;';
        document.body.appendChild(modal);
      }
      modal.innerHTML = '<div class=\"login-card\" style=\"max-width:720px;width:100%;max-height:90vh;overflow:auto;\"><div style=\"display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;\"><h3 style=\"margin:0;color:var(--primary-color);\">Detalhes do Chamado</h3><div style=\"display:flex;gap:8px;\"><button class=\"btn btn-primary\" onclick=\"App.generateTicketPdf(\'' + esc(ticket.id) + '\')\" style=\"width:auto;font-size:.85rem;padding:6px 12px;\">Gerar PDF</button><button class=\"btn btn-secondary\" onclick=\"document.getElementById(\'modal-ticket-details-mobile\').style.display=\'none\'\" style=\"width:auto;font-size:.85rem;padding:6px 12px;\">Fechar</button></div></div><div id=\"modal-ticket-details-mobile-content\"></div></div>';
      const mediaHtml = (function(){
        const items = mediaItems(ticket);
        if (!items.length) return '';
        return '<div style=\"margin-top:14px;\"><strong style=\"color:var(--text-muted);display:block;margin-bottom:8px;\">Fotos e vídeos anexados:</strong><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;\">' + items.map(function(item){
          const finalUrl = (window.TempPhotosCache && window.TempPhotosCache[item.url]) || item.url;
          const body = item.kind === 'video' ? '<a href=\"' + esc(finalUrl) + '\" target=\"_blank\" style=\"display:inline-flex;align-items:center;justify-content:center;min-height:72px;color:var(--primary-color);font-weight:700;text-decoration:none;\">Abrir vídeo</a>' : '<img src=\"' + esc(finalUrl) + '\" style=\"max-width:100%;max-height:80px;border-radius:4px;cursor:pointer;\" onclick=\"App.showFacadeImage(\'' + esc(finalUrl) + '\')\" onerror=\"this.parentElement.style.display=\'none\'\">';
          return '<div style=\"background:rgba(255,255,255,.02);border:1px solid var(--border-color);border-radius:6px;padding:8px;text-align:center;\"><span style=\"font-size:.72rem;color:var(--text-muted);display:block;margin-bottom:6px;\">' + esc(item.label) + '</span>' + body + '</div>';
        }).join('') + '</div></div>';
      })();
      const parts = Array.isArray(ticket.parts) ? ticket.parts.join(', ') : (ticket.parts || '');
      const services = Array.isArray(ticket.services) ? ticket.services.join(', ') : (ticket.services || '');
      const content = document.getElementById('modal-ticket-details-mobile-content');
      content.innerHTML = section('Identificação') + detailRow('OS', ticket.id) + detailRow('Data de abertura', ticket.date) + detailRow('Status', ticket.status) + detailRow('Prioridade', ticket.priority) + section('Dados da abertura') + detailRow('Unidade', unit(ticket)) + detailRow('Vendedor responsável', seller(ticket)) + detailRow('Tipo de equipamento', ticket.equipmentType) + detailRow('Nº patrimônio', ticket.equipmentSerial) + detailRow('Cliente', ticket.client) + detailRow('Nome fantasia', ticket.fantasyName) + detailRow('Cidade', ticket.city) + detailRow('Endereço', ticket.address) + detailRow('Descrição da falha', ticket.title) + detailRow('Observações da abertura', ticket.observations) + section('Atendimento') + detailRow('Mecânico', ticket.mechanic) + detailRow('Início do atendimento', ticket.startTime) + detailRow('Conclusão', ticket.endTime) + detailRow('Situação após atendimento', ticket.eqStatusAfter) + detailRow('Peças utilizadas', parts) + detailRow('Serviços executados', services) + detailRow('Problema encontrado', ticket.faultDescription) + detailRow('Solução aplicada', ticket.solutionDescription) + detailRow('Carga de gás (g)', ticket.gasCharge) + detailRow('Observações adicionais', ticket.additionalNotes) + mediaHtml + '<div style=\"padding-top:12px;color:var(--text-muted);font-size:.9rem;\">Clique fora ou em Fechar para voltar à lista.</div>';
      modal.style.display = 'flex';
      modal.onclick = function(e){ if (e.target === modal) modal.style.display = 'none'; };
    };
    return true;
  }
  function install(){ const ok = installRenderTickets() & installDetails(); if (ok && window.Store && window.UI && Store.getTickets) UI.renderTickets(Store.getTickets()); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.addEventListener('hashchange', function(){ setTimeout(install, 100); });
})();
