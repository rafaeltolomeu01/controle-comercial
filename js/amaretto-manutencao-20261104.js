/* Melhorias pontuais de movimentações e chamados mecânicos (2026-11-04).
 * Esta camada é carregada por último para compatibilidade com os patches legados.
 */
(function () {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const validMedia = value => {
    const url = String(value || '').trim();
    return url && !['null', 'undefined', '/uploads/null', '/uploads/undefined', '/uploads/'].includes(url);
  };

  const parseLegacyDate = (dateValue, timeValue) => {
    const raw = String(dateValue || '').trim();
    if (!raw) return null;
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const iso = br ? `${br[3]}-${br[2]}-${br[1]}T${timeValue || '00:00'}:00-03:00` : raw;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const openingDate = ticket => {
    const raw = ticket.openedAt || ticket.created_at || ticket.createdAt;
    const parsed = raw ? new Date(raw) : parseLegacyDate(ticket.date, '00:00');
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  };

  const maintenanceDate = ticket => {
    if (ticket.maintenanceStartedAt) {
      const parsed = new Date(ticket.maintenanceStartedAt);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    // Registros antigos não possuíam timestamp de início; usa o par data/hora legado sem inventar valor.
    return ticket.startTime ? parseLegacyDate(ticket.date, ticket.startTime) : null;
  };

  const formatDateTime = date => date ? new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'
  }).format(date) : '—';

  const formatDateInput = date => {
    if (!date) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  const formatTimeInput = date => date ? new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(date) : '';

  const waitingTime = ticket => {
    const opened = openingDate(ticket);
    const started = maintenanceDate(ticket);
    if (!started) return 'Aguardando início';
    if (!opened) return 'Não disponível';
    const diff = started.getTime() - opened.getTime();
    if (diff < 0) return 'Não disponível';
    const totalMinutes = Math.floor(diff / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const pieces = [];
    if (days) pieces.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
    if (hours) pieces.push(`${hours}h`);
    if (!days && !hours) pieces.push(`${minutes}min`);
    return pieces.join(' e ');
  };

  const serviceText = ticket => String(ticket.serviceDescription || ticket.solutionDescription || ticket.faultDescription || '').trim();

  function injectStyles() {
    if (document.getElementById('amaretto-maintenance-style')) return;
    const style = document.createElement('style');
    style.id = 'amaretto-maintenance-style';
    style.textContent = `
      .field-help{display:block;margin-top:5px;color:var(--text-muted);font-size:.72rem;line-height:1.35}
      #ticket-maintenance-timeline{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 16px;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:rgba(37,99,235,.05)}
      #ticket-maintenance-timeline div{min-width:0}
      #ticket-maintenance-timeline small{display:block;color:var(--text-muted);font-size:.68rem;font-weight:700;text-transform:uppercase;margin-bottom:4px}
      #ticket-maintenance-timeline strong{display:block;overflow-wrap:anywhere;font-size:.86rem}
      #modal-ficha-tecnica .login-card{overscroll-behavior:contain}
      #modal-ficha-tecnica textarea{min-height:132px}
      .amaretto-ticket-extra{margin:0 0 12px;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:rgba(37,99,235,.05)}
      .amaretto-ticket-extra-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .amaretto-ticket-extra small{display:block;color:var(--text-muted);font-size:.67rem;font-weight:750;text-transform:uppercase;margin-bottom:3px}
      .amaretto-ticket-extra strong{display:block;overflow-wrap:anywhere;white-space:pre-wrap;font-size:.82rem}
      .amaretto-ticket-extra .wide{grid-column:1/-1}
      .amaretto-opening-photo{display:block;width:min(260px,100%);max-height:220px;object-fit:cover;border-radius:8px;border:1px solid var(--border-color);cursor:pointer}
      @media(max-width:768px){
        #modal-ficha-tecnica{padding:0!important;align-items:flex-start!important}
        #modal-ficha-tecnica>.login-card{width:100%!important;max-width:none!important;max-height:100dvh!important;min-height:100dvh;border-radius:0!important;padding:14px!important}
        #ticket-maintenance-timeline,.amaretto-ticket-extra-grid{grid-template-columns:1fr}
        .amaretto-ticket-extra .wide{grid-column:auto}
        #ticket-form>div:last-child{position:sticky;bottom:0;z-index:3;margin-left:-14px!important;margin-right:-14px!important;padding:10px 14px;background:var(--bg-card);border-top:1px solid var(--border-color);flex-wrap:wrap}
        #ticket-form>div:last-child .btn{width:100%!important;min-height:44px}
        .general-filter-bar .filter-fields-row{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px!important}
        .general-filter-bar .filter-group{min-width:0!important;width:100%!important}
      }
      @media(max-width:430px){.general-filter-bar .filter-fields-row{grid-template-columns:1fr}.general-filter-bar{padding:10px!important}}
    `;
    document.head.appendChild(style);
  }

  function renderTickets(tickets) {
    const activeUnitId = Store.getActiveUnitId();
    const user = Store.getLoggedUser();
    const openCard = document.getElementById('ticket-open-card');
    if (openCard) openCard.style.display = user && ['Vendedor', 'Administrador', 'Supervisor'].includes(user.profile) ? 'block' : 'none';
    let visible = Array.isArray(tickets) ? tickets.slice() : [];
    if (activeUnitId && activeUnitId !== 'all') visible = visible.filter(t => String(t.unitId) === String(activeUnitId));
    if (user && user.profile === 'Vendedor') visible = visible.filter(t => String(t.userId) === String(user.id));
    const body = document.getElementById('tickets-table-body');
    if (!body) return;
    const staff = user && ['Administrador', 'Responsável Equipamentos', 'Mecânico'].includes(user.profile);
    const admin = user && user.profile === 'Administrador';
    body.innerHTML = visible.map(ticket => {
      const priorityClass = ticket.priority === 'Alta' ? 'badge-danger' : ticket.priority === 'Média' ? 'badge-warning' : 'badge-primary';
      const statusClass = ticket.status === 'Resolvido' ? 'badge-success' : ticket.status === 'Em Atendimento' ? 'badge-primary' : 'badge-warning';
      let action = '<span style="font-size:.75rem;color:var(--text-muted)">Aberto</span>';
      if (ticket.status === 'Aberto' && staff) action = `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();App.startTicketService('${esc(ticket.id)}')">INICIAR ATENDIMENTO</button>`;
      if (ticket.status === 'Em Atendimento') action = staff ? `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();App.openFichaTecnica('${esc(ticket.id)}')">FICHA TÉCNICA</button>` : '<span style="font-size:.75rem;color:var(--text-muted)">Em Atendimento</span>';
      if (ticket.status === 'Resolvido') action = `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();App.openFichaTecnica('${esc(ticket.id)}')">VER LAUDO</button>`;
      if (admin && typeof App.editTicketAdmin === 'function') action += ` <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();App.editTicketAdmin('${esc(ticket.id)}')">Editar</button>`;
      return `<tr class="mobile-summary-row" onclick="App.showTicketDetails('${esc(ticket.id)}')">
        <td data-label="Chamado" style="font-family:monospace;font-weight:700">${esc(ticket.id)}</td>
        <td data-label="Abertura">${esc(formatDateTime(openingDate(ticket)))}</td>
        <td data-label="Início">${esc(formatDateTime(maintenanceDate(ticket)))}</td>
        <td data-label="Espera">${esc(waitingTime(ticket))}</td>
        <td data-label="Mecânico">${esc(ticket.mechanic || '—')}</td>
        <td data-label="Equipamento">${esc(ticket.equipmentSerial || '—')}</td>
        <td data-label="Marca">${esc(ticket.equipmentBrand || '—')}</td>
        <td data-label="Cliente">${esc(ticket.client || '—')}</td>
        <td data-label="Falha Relatada" class="normal-wrap">${esc(ticket.title || '—')}</td>
        <td data-label="Serviço Realizado" class="normal-wrap">${esc(serviceText(ticket) || '—')}</td>
        <td data-label="Estado Pós">${esc(ticket.eqStatusAfter || '—')}</td>
        <td data-label="Prioridade"><span class="badge-status ${priorityClass}">${esc(ticket.priority || '—')}</span></td>
        <td data-label="Status"><span class="badge-status ${statusClass}">${esc(ticket.status || '—')}</span></td>
        <td data-label="Ação">${action}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="14" style="text-align:center;padding:24px;color:var(--text-muted)">Nenhum chamado encontrado para os filtros selecionados.</td></tr>';
  }

  function enhanceFicha() {
    if (!window.App || App.__amarettoFichaWrapped) return;
    App.__amarettoFichaWrapped = true;
    const original = App.openFichaTecnica && App.openFichaTecnica.bind(App);
    if (!original) return;
    App.openFichaTecnica = function (id) {
      original(id);
      const ticket = ((Store.getTickets && Store.getTickets()) || []).find(item => String(item.id) === String(id));
      if (!ticket) return;
      const description = document.getElementById('ticket-service-description');
      if (description) description.value = serviceText(ticket);
      const state = document.getElementById('ticket-eq-status-after');
      if (state) {
        let value = ticket.eqStatusAfter || '';
        if (value === 'Recolhido para reparo' && ticket.status !== 'Resolvido') value = 'Recolhimento necessário';
        if (value && !Array.from(state.options).some(option => option.value === value)) state.add(new Option(`${value} (registro histórico)`, value));
        state.value = value;
      }
      const started = maintenanceDate(ticket);
      const startDateInput = document.getElementById('ticket-start-date');
      const startTimeInput = document.getElementById('ticket-start-time');
      if (startDateInput) { startDateInput.value = formatDateInput(started); startDateInput.disabled = true; }
      if (startTimeInput) { startTimeInput.value = formatTimeInput(started); startTimeInput.disabled = true; }
      const form = document.getElementById('ticket-form');
      if (form) {
        let timeline = document.getElementById('ticket-maintenance-timeline');
        if (!timeline) {
          timeline = document.createElement('div');
          timeline.id = 'ticket-maintenance-timeline';
          const firstHeading = form.querySelector('h4');
          if (firstHeading) firstHeading.insertAdjacentElement('afterend', timeline);
        }
        timeline.innerHTML = `<div><small>Data de abertura</small><strong>${esc(formatDateTime(openingDate(ticket)))}</strong></div><div><small>Início da manutenção</small><strong>${esc(formatDateTime(started))}</strong></div><div><small>Tempo de espera</small><strong>${esc(waitingTime(ticket))}</strong></div>`;
      }
      const complementary = ticket.fotoComplementar || ticket.fotoPlaqueta || '';
      const input = document.getElementById('ticket-foto-plaqueta');
      const preview = document.getElementById('preview-ticket-foto-plaqueta');
      const image = document.getElementById('preview-img-ticket-foto-plaqueta');
      if (input) { input.dataset.initialUrl = complementary; input.dataset.uploadedUrl = complementary; }
      if (preview) preview.style.display = validMedia(complementary) ? 'block' : 'none';
      if (image && validMedia(complementary)) image.src = complementary;
    };
  }

  function enhanceDetails() {
    if (!window.App || App.__amarettoDetailsWrapped) return;
    App.__amarettoDetailsWrapped = true;
    const original = App.showTicketDetails && App.showTicketDetails.bind(App);
    if (!original) return;
    App.showTicketDetails = function (id) {
      original(id);
      window.setTimeout(() => {
        const ticket = ((Store.getTickets && Store.getTickets()) || []).find(item => String(item.id) === String(id));
        const content = document.getElementById('modal-ticket-details-mobile-content');
        if (!ticket || !content || content.querySelector('.amaretto-ticket-extra')) return;
        const photo = ticket.openingEquipmentPhoto || ticket.defectPhoto || '';
        const section = document.createElement('section');
        section.className = 'amaretto-ticket-extra';
        section.innerHTML = `<div class="amaretto-ticket-extra-grid">
          <div><small>Marca</small><strong>${esc(ticket.equipmentBrand || '—')}</strong></div>
          <div><small>Data de abertura</small><strong>${esc(formatDateTime(openingDate(ticket)))}</strong></div>
          <div><small>Início da manutenção</small><strong>${esc(formatDateTime(maintenanceDate(ticket)))}</strong></div>
          <div><small>Tempo de espera</small><strong>${esc(waitingTime(ticket))}</strong></div>
          <div class="wide"><small>Descrição do serviço realizado</small><strong>${esc(serviceText(ticket) || '—')}</strong></div>
          ${validMedia(photo) ? `<div class="wide"><small>Foto do equipamento completo na abertura</small><img class="amaretto-opening-photo" src="${esc(photo)}" alt="Equipamento completo"></div>` : ''}
        </div>`;
        const openingImage = section.querySelector('.amaretto-opening-photo');
        if (openingImage) openingImage.addEventListener('click', () => App.showFacadeImage(photo));
        content.insertAdjacentElement('afterbegin', section);
      }, 120);
    };
  }

  function patchAdminEditor() {
    if (!window.App || App.__amarettoAdminEditorWrapped || typeof App.editTicketAdmin !== 'function') return;
    App.__amarettoAdminEditorWrapped = true;
    const original = App.editTicketAdmin.bind(App);
    App.editTicketAdmin = function (id) {
      original(id);
      const ticket = ((Store.getTickets && Store.getTickets()) || []).find(item => String(item.id) === String(id));
      const brand = document.getElementById('ticket-open-brand');
      if (brand && ticket) brand.value = ticket.equipmentBrand || '';
    };
  }

  function install() {
    injectStyles();
    if (!window.App || !window.UI || !window.Store) return;
    UI.renderTickets = renderTickets;
    // O gerenciador de filtros guarda uma referência própria do renderizador.
    UI._original_renderTickets = renderTickets;
    enhanceFicha();
    enhanceDetails();
    patchAdminEditor();
  }

  window.AmarettoMaintenance = { openingDate, maintenanceDate, waitingTime, formatDateTime, serviceText };
  install();
  document.addEventListener('DOMContentLoaded', install);
  window.addEventListener('hashchange', () => window.setTimeout(install, 80));
})();
