(function () {
  'use strict';

  const ACCOUNTABILITY_ROUTE = '#prestacao-contas';
  const RETIRED_ROUTE = '#prospeccao';

  function uniqueRoutes(routes) {
    return Array.from(new Set(Array.isArray(routes) ? routes : []));
  }

  function installRoutePolicy() {
    if (!window.Store || !Store.getUserAllowedRoutes || Store.__moduleMenuPolicy20260721) return;
    Store.__moduleMenuPolicy20260721 = true;
    const previous = Store.getUserAllowedRoutes.bind(Store);
    Store.getUserAllowedRoutes = function (user) {
      const routes = uniqueRoutes(previous(user)).filter(route => route !== RETIRED_ROUTE);
      const profile = String(user && user.profile || '').toLowerCase();
      const permissions = Array.isArray(user && user.permissions)
        ? user.permissions.map(permission => String(permission || '').toLowerCase())
        : [];
      const mayUseAccountability = !!user && (
        /administrador|vendedor|supervisor|gerente|financeiro/.test(profile) ||
        permissions.some(permission => /administrador|financeiro|despesa|saldo/.test(permission))
      );
      if (mayUseAccountability && !routes.includes(ACCOUNTABILITY_ROUTE)) routes.push(ACCOUNTABILITY_ROUTE);
      return routes;
    };
  }

  function applyMenuPolicy() {
    const user = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;
    const routes = user && Store.getUserAllowedRoutes ? Store.getUserAllowedRoutes(user) : [];
    const accountability = document.getElementById('menu-prestacao-contas');
    if (accountability) {
      accountability.style.setProperty('display', routes.includes(ACCOUNTABILITY_ROUTE) ? 'flex' : 'none', 'important');
    }

    document.querySelectorAll('#menu-prospeccao, a[href="#prospeccao"], button[onclick*="#prospeccao"]').forEach(element => {
      element.style.setProperty('display', 'none', 'important');
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('tabindex', '-1');
    });
    document.querySelectorAll('button[onclick*="prospects"]').forEach(button => {
      const reportCard = button.closest('.card');
      (reportCard || button).style.setProperty('display', 'none', 'important');
    });
    document.querySelectorAll('#tutorial-prospeccao-leads, [onclick*="tutorial-prospeccao-leads"]').forEach(element => {
      element.style.setProperty('display', 'none', 'important');
      element.setAttribute('aria-hidden', 'true');
    });

    document.querySelectorAll('[data-accountability-shortcut]').forEach(element => {
      element.style.setProperty('display', routes.includes(ACCOUNTABILITY_ROUTE) ? '' : 'none', 'important');
    });
  }

  function installUiPolicy() {
    if (!window.UI || UI.__moduleMenuPolicy20260721) return;
    UI.__moduleMenuPolicy20260721 = true;
    const previous = UI.applyPermissions ? UI.applyPermissions.bind(UI) : null;
    UI.applyPermissions = function () {
      if (previous) previous();
      applyMenuPolicy();
    };
  }

  function protectRetiredRoute() {
    if (window.location.hash === RETIRED_ROUTE) window.location.replace('#dashboard');
  }

  installRoutePolicy();
  installUiPolicy();
  document.addEventListener('DOMContentLoaded', function () {
    protectRetiredRoute();
    applyMenuPolicy();
    const root = document.getElementById('app-container') || document.body;
    new MutationObserver(function () { window.requestAnimationFrame(applyMenuPolicy); })
      .observe(root, { childList: true, subtree: true });
  });
  window.addEventListener('hashchange', function () {
    protectRetiredRoute();
    applyMenuPolicy();
  });
})();
