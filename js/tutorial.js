// Central de Tutoriais - busca e inicialização isolada
(function(){
  function norm(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function initTutorialPage() {
    const page = document.querySelector('.tutorial-page[data-page="tutorial"]');
    if (!page || page.dataset.tutorialReady === '1') return;
    page.dataset.tutorialReady = '1';

    const search = page.querySelector('#tutorial-search');
    const cards = Array.from(page.querySelectorAll('[data-tutorial-card]'));
    const sections = Array.from(page.querySelectorAll('[data-tutorial-section]'));

    const empty = document.createElement('div');
    empty.className = 'tutorial-empty-state card';
    empty.textContent = 'Nenhum tutorial encontrado para a busca informada.';
    page.appendChild(empty);

    function applyFilter() {
      const q = norm(search && search.value);
      let visibleCount = 0;

      cards.forEach(card => {
        const match = !q || norm(card.innerText).includes(q);
        card.style.display = match ? '' : 'none';
      });

      sections.forEach(section => {
        const match = !q || norm(section.innerText).includes(q);
        section.style.display = match ? '' : 'none';
        if (match) visibleCount += 1;
      });

      empty.style.display = visibleCount ? 'none' : 'block';
    }

    if (search) search.addEventListener('input', applyFilter);

    page.querySelectorAll('.tutorial-go-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
      });
    });
  }

  function ensureTutorialAccess() {
    if (window.Store && Store.getUserAllowedRoutes && !Store.__tutorialFinalAccess) {
      const originalRoutes = Store.getUserAllowedRoutes.bind(Store);
      Store.getUserAllowedRoutes = function(user) {
        const routes = originalRoutes(user) || [];
        if (user && !routes.includes('#tutorial')) routes.push('#tutorial');
        return routes;
      };
      Store.__tutorialFinalAccess = true;
    }

    const user = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;
    const menu = document.getElementById('menu-tutorial');
    if (user && menu) menu.style.display = 'flex';
  }

  window.TutorialModule = { init: initTutorialPage, ensureAccess: ensureTutorialAccess };
  ensureTutorialAccess();
  document.addEventListener('DOMContentLoaded', function(){ ensureTutorialAccess(); initTutorialPage(); });
  window.addEventListener('hashchange', function(){ setTimeout(function(){ ensureTutorialAccess(); initTutorialPage(); }, 60); });
  setTimeout(function(){ ensureTutorialAccess(); if (window.UI && UI.applyPermissions) UI.applyPermissions(); }, 120);
})();
