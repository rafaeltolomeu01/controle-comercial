/* Rascunhos locais dos formulários operacionais.
 * Não altera os envios: apenas preserva valores até o fluxo existente chamar reset().
 */
(function () {
  'use strict';

  const TRACKED_FORMS = new Set([
    'ticket-open-form', 'ticket-form', 'client-form', 'movement-form',
    'prospect-form', 'expense-form', 'solicitacao-despesas-form',
    'exchange-client-form', 'exchange-item-form', 'exchange-mapper-form',
    'unit-form', 'user-form', 'empresa-create-form', 'company-identity-form',
    'cc-direct-balance-form'
  ]);
  const STORAGE_PREFIX = 'controle_campo_form_draft_v1';
  const saveTimers = new WeakMap();

  function currentScope() {
    try {
      const user = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;
      return [user && (user.empresa_id || user.empresaId) || 'empresa', user && user.id || 'usuario'].join(':');
    } catch (_) {
      return 'empresa:usuario';
    }
  }

  function storageKey(form) {
    return `${STORAGE_PREFIX}:${currentScope()}:${form.id}`;
  }

  function shouldTrack(form) {
    return !!(form && form.tagName === 'FORM' && TRACKED_FORMS.has(form.id));
  }

  function fieldKey(field) {
    return String(field.id || field.name || '').trim();
  }

  function serialize(form) {
    const values = {};
    Array.from(form.elements || []).forEach(field => {
      const key = fieldKey(field);
      if (!key || field.dataset.draftIgnore === '1') return;
      const type = String(field.type || '').toLowerCase();
      if (['password', 'submit', 'button', 'reset', 'image'].includes(type)) return;
      if (type === 'file') {
        if (field.dataset.uploadedUrl) {
          values[key] = { kind: 'uploaded-file', url: field.dataset.uploadedUrl, uploadId: field.dataset.uploadId || '' };
        }
        return;
      }
      if (type === 'radio') {
        if (field.checked) values[key] = { kind: 'radio', value: field.value };
        return;
      }
      if (type === 'checkbox') {
        values[key] = { kind: 'checkbox', checked: !!field.checked };
        return;
      }
      if (field.tagName === 'SELECT' && field.multiple) {
        values[key] = { kind: 'multiple', value: Array.from(field.selectedOptions).map(option => option.value) };
        return;
      }
      values[key] = { kind: 'value', value: field.value };
    });
    return { version: 1, savedAt: new Date().toISOString(), values };
  }

  function save(form) {
    if (!shouldTrack(form) || form.dataset.draftRestoring === '1') return;
    try {
      localStorage.setItem(storageKey(form), JSON.stringify(serialize(form)));
    } catch (err) {
      console.warn('Não foi possível salvar o rascunho do formulário:', form.id, err);
    }
  }

  function scheduleSave(form) {
    if (!shouldTrack(form)) return;
    const oldTimer = saveTimers.get(form);
    if (oldTimer) clearTimeout(oldTimer);
    saveTimers.set(form, setTimeout(() => save(form), 180));
  }

  function restore(form) {
    if (!shouldTrack(form) || form.dataset.draftRestored === '1') return;
    let draft;
    try {
      draft = JSON.parse(localStorage.getItem(storageKey(form)) || 'null');
    } catch (_) {
      draft = null;
    }
    form.dataset.draftRestored = '1';
    if (!draft || !draft.values) return;

    form.dataset.draftRestoring = '1';
    const changedControls = [];
    Array.from(form.elements || []).forEach(field => {
      const key = fieldKey(field);
      const saved = key && draft.values[key];
      if (!saved || field.dataset.draftIgnore === '1') return;
      const type = String(field.type || '').toLowerCase();
      if (type === 'file') {
        if (saved.kind === 'uploaded-file' && saved.url) {
          field.dataset.uploadedUrl = saved.url;
          field.dataset.uploadId = saved.uploadId || '';
          let status = document.getElementById(`upload-status-${field.id}`);
          if (!status) {
            status = document.createElement('div');
            status.id = `upload-status-${field.id}`;
            status.style.cssText = 'margin-top:6px;font-size:.72rem;font-weight:600;color:#10b981;';
            field.parentNode && field.parentNode.appendChild(status);
          }
          if (status) status.textContent = '✅ Arquivo recuperado do rascunho';
        }
        return;
      }
      if (type === 'radio') {
        field.checked = saved.kind === 'radio' && String(field.value) === String(saved.value);
        if (field.checked) changedControls.push(field);
        return;
      }
      if (type === 'checkbox') {
        field.checked = !!saved.checked;
        changedControls.push(field);
        return;
      }
      if (saved.kind === 'multiple' && field.tagName === 'SELECT') {
        const selected = new Set((saved.value || []).map(String));
        Array.from(field.options).forEach(option => { option.selected = selected.has(String(option.value)); });
        changedControls.push(field);
        return;
      }
      if (saved.kind === 'value' && saved.value != null) {
        field.value = saved.value;
        if (field.tagName === 'SELECT') changedControls.push(field);
      }
    });
    delete form.dataset.draftRestoring;
    changedControls.forEach(field => {
      try { field.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    });
    if (window.App && App.showToast) App.showToast('Rascunho do formulário recuperado.');
  }

  function clear(form) {
    if (!shouldTrack(form)) return;
    try { localStorage.removeItem(storageKey(form)); } catch (_) {}
    delete form.dataset.draftRestored;
  }

  function bindForm(form) {
    if (!shouldTrack(form) || form.dataset.draftBound === '1') return;
    form.dataset.draftBound = '1';
    setTimeout(() => restore(form), 160);
  }

  function scan() {
    TRACKED_FORMS.forEach(id => bindForm(document.getElementById(id)));
  }

  document.addEventListener('input', event => scheduleSave(event.target && event.target.form), true);
  document.addEventListener('change', event => scheduleSave(event.target && event.target.form), true);
  document.addEventListener('submit', event => save(event.target), true);
  document.addEventListener('reset', event => {
    const form = event.target;
    if (shouldTrack(form)) setTimeout(() => clear(form), 0);
  }, true);
  window.addEventListener('beforeunload', () => {
    TRACKED_FORMS.forEach(id => {
      const form = document.getElementById(id);
      if (form) save(form);
    });
  });
  window.addEventListener('hashchange', () => setTimeout(scan, 220));
  document.addEventListener('DOMContentLoaded', scan);
  new MutationObserver(() => scan()).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => {
    TRACKED_FORMS.forEach(id => {
      const form = document.getElementById(id);
      if (form && form.offsetParent !== null) save(form);
    });
  }, 2000);

  window.FormDrafts = { save, restore, clear, scan };
})();
