/* Preservacao de fotos existentes em edicoes e correcoes (17/07/2026). */
(function () {
  'use strict';
  if (window.__ccMediaPreserver20260717) return;
  window.__ccMediaPreserver20260717 = true;

  const CLIENT_FIELDS = {
    photoFachada: ['photoFachada', 'photo_fachada', 'fotoFachada', 'foto_fachada', 'fachada'],
    photoInterna01: ['photoInterna01', 'photo_interna01', 'photo_interna_01', 'fotoInterna01', 'foto_interna01', 'foto_interna_01', 'interna01'],
    photoInterna02: ['photoInterna02', 'photo_interna02', 'photo_interna_02', 'fotoInterna02', 'foto_interna02', 'foto_interna_02', 'interna02'],
    photoInterna03: ['photoInterna03', 'photo_interna03', 'photo_interna_03', 'fotoInterna03', 'foto_interna03', 'foto_interna_03', 'interna03'],
    photoRua01: ['photoRua01', 'photo_rua01', 'photo_rua_01', 'fotoRua01', 'foto_rua01', 'foto_rua_01', 'rua01'],
    photoRua02: ['photoRua02', 'photo_rua02', 'photo_rua_02', 'fotoRua02', 'foto_rua02', 'foto_rua_02', 'rua02'],
    photoCnpj: ['photoCnpj', 'photo_cnpj', 'fotoCnpj', 'foto_cnpj', 'cnpjPhoto']
  };
  const CLIENT_SUFFIX = {
    photoFachada: 'fachada', photoInterna01: 'interna01', photoInterna02: 'interna02',
    photoInterna03: 'interna03', photoRua01: 'rua01', photoRua02: 'rua02', photoCnpj: 'cnpj'
  };
  const EXPENSE_FIELDS = {
    foto_comprovante: ['foto_comprovante', 'fotoComprovante', 'photoComprovante', 'receiptPhoto', 'photo', 'comprovante_url', 'comprovanteUrl', 'foto_nota', 'nota_fiscal_url'],
    foto_odometro: ['foto_odometro', 'fotoOdometro', 'photoOdometro', 'odometerPhoto', 'odometro_url', 'odometroUrl', 'foto_km']
  };
  const authenticatedMediaCache = new Map();

  function isDatabaseUpload(source) {
    try {
      const url = new URL(String(source || ''), window.location.origin);
      return url.origin === window.location.origin && /^\/api\/uploads\/UP-[A-Za-z0-9-]+$/i.test(url.pathname);
    } catch (_) { return false; }
  }

  function authenticatedHeaders() {
    const user = window.Store && Store.getLoggedUser ? (Store.getLoggedUser() || {}) : {};
    const token = window.Store && Store.getToken ? Store.getToken() : (localStorage.getItem('controle_campo_token') || '');
    const headers = {
      'X-User-Id': user.id || '', 'X-User-Profile': user.profile || '',
      'X-Company-Id': user.empresa_id || '001', 'X-Company-Name': user.empresa_nome || ''
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function loadAuthenticatedMedia(source) {
    const raw = unwrap(source);
    if (!isDatabaseUpload(raw)) return raw;
    const cached = window.TempPhotosCache && window.TempPhotosCache[raw];
    if (cached && String(cached).startsWith('blob:')) return cached;
    if (authenticatedMediaCache.has(raw)) return authenticatedMediaCache.get(raw);
    const request = (async () => {
      const response = await fetch(raw, { method:'GET', headers:authenticatedHeaders(), credentials:'same-origin', cache:'no-store' });
      if (!response.ok) {
        const error = new Error(response.status === 404 ? 'Arquivo antigo não encontrado no banco.' : `Não foi possível abrir a foto antiga (${response.status}).`);
        error.status = response.status;
        throw error;
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('A foto antiga está vazia no banco.');
      const objectUrl = URL.createObjectURL(blob);
      window.TempPhotosCache = window.TempPhotosCache || {};
      window.TempPhotosCache[raw] = objectUrl;
      return objectUrl;
    })();
    authenticatedMediaCache.set(raw, request);
    try { return await request; }
    catch (error) { authenticatedMediaCache.delete(raw); throw error; }
  }

  function showMediaFailure(img, error) {
    img.style.display = 'none';
    let message = img.nextElementSibling;
    if (!message || !message.classList.contains('cc-auth-media-error')) {
      message = document.createElement('div');
      message.className = 'cc-auth-media-error';
      img.insertAdjacentElement('afterend', message);
    }
    message.textContent = error && error.status === 404
      ? 'A referência existe, mas o arquivo não foi encontrado no banco atual. Verificar o backup.'
      : 'Não foi possível autenticar ou abrir esta foto antiga.';
    message.style.display = 'block';
  }

  async function hydrateImageElement(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const source = img.dataset.authMediaSource || img.getAttribute('src') || '';
    if (!isDatabaseUpload(source) || img.dataset.authMediaLoading === '1' || img.dataset.authMediaReady === '1') return;
    img.dataset.authMediaSource = source;
    img.dataset.authMediaLoading = '1';
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    try {
      img.src = await loadAuthenticatedMedia(source);
      img.dataset.authMediaReady = '1';
      img.style.display = '';
    } catch (error) { showMediaFailure(img, error); }
    finally { delete img.dataset.authMediaLoading; }
  }

  function scanAuthenticatedImages(root) {
    if (root instanceof HTMLImageElement) hydrateImageElement(root);
    if (root && root.querySelectorAll) root.querySelectorAll('img').forEach(hydrateImageElement);
  }

  function unwrap(value) {
    let current = value;
    if (Array.isArray(current)) current = current.find(Boolean) || '';
    if (current && typeof current === 'object') current = current.url || current.path || current.src || current.href || '';
    if (typeof current === 'string') {
      const trimmed = current.trim();
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length < 100000) {
        try { return unwrap(JSON.parse(trimmed)); } catch (_) {}
      }
      current = trimmed;
    }
    const text = String(current || '').trim();
    if (!text || ['null', 'undefined', '-', '—'].includes(text.toLowerCase())) return '';
    return (window.TempPhotosCache && (window.TempPhotosCache[text] || window.TempPhotosCache[text.replace(/^.*\//, '')])) || text;
  }

  function pick(record, aliases) {
    for (const key of aliases || []) {
      const value = unwrap(record && record[key]);
      if (value) return value;
    }
    return '';
  }

  function clientValue(record, field, input) {
    if (input && input.dataset.removeExisting === '1') return '';
    return pick(record, CLIENT_FIELDS[field] || [field]);
  }

  function expenseValue(record, field, input) {
    if (input && input.dataset.removeExisting === '1') return '';
    return pick(record, EXPENSE_FIELDS[field] || [field]);
  }

  function setImageState(box, source, removed) {
    const img = box.querySelector('img');
    const status = box.querySelector('[data-media-status]');
    const remove = box.querySelector('[data-remove-existing]');
    if (img) {
      img.src = removed ? '' : source;
      img.style.display = !removed && source ? 'block' : 'none';
    }
    if (remove) remove.style.display = !removed && source ? '' : 'none';
    if (status) status.textContent = removed ? 'Foto marcada para remoção. Escolha outra para substituir.' : (source ? 'Foto atual — será mantida se nenhuma nova for escolhida.' : 'Nenhuma foto antiga localizada.');
  }

  function ensureExistingBox(input, label) {
    let box = input.parentElement && input.parentElement.querySelector(`.cc-existing-media[data-for="${input.id}"]`);
    if (box) return box;
    box = document.createElement('div');
    box.className = 'cc-existing-media';
    box.dataset.for = input.id;
    box.innerHTML = `<div class="cc-existing-media-title">${label || 'Foto atual'}</div><img alt="Foto atual"><div data-media-status></div><div class="cc-existing-media-actions"><button type="button" data-view-existing>Ampliar</button><button type="button" data-remove-existing>Remover foto atual</button></div>`;
    input.insertAdjacentElement('afterend', box);
    box.querySelector('[data-view-existing]').addEventListener('click', () => {
      const source = input.dataset.existingSource || '';
      if (source && window.App && App.showFacadeImage) App.showFacadeImage(source);
    });
    box.querySelector('[data-remove-existing]').addEventListener('click', () => {
      input.value = '';
      input.dataset.removeExisting = '1';
      delete input.dataset.uploadedUrl;
      setImageState(box, input.dataset.existingSource || '', true);
    });
    input.addEventListener('change', () => {
      if (!input.files || !input.files[0]) return;
      input.dataset.removeExisting = '0';
      const localUrl = URL.createObjectURL(input.files[0]);
      const img = box.querySelector('img');
      if (img) { img.src = localUrl; img.style.display = 'block'; }
      const status = box.querySelector('[data-media-status]');
      if (status) status.textContent = 'Nova foto selecionada — substituirá a foto atual ao salvar.';
    });
    return box;
  }

  function renderClientPhotos(client) {
    Object.keys(CLIENT_FIELDS).forEach(field => {
      const suffix = CLIENT_SUFFIX[field];
      const input = document.getElementById(`client-photo-${suffix}`);
      if (!input) return;
      const source = pick(client, CLIENT_FIELDS[field]);
      input.dataset.existingSource = source;
      input.dataset.removeExisting = '0';
      input.required = false;
      const box = ensureExistingBox(input, 'Foto antiga / atual');
      setImageState(box, source, false);
    });
  }

  function renderExpensePhotos(record) {
    const definitions = [
      ['exp-comprovante-img', 'foto_comprovante', 'Comprovante antigo / atual'],
      ['exp-odometro-img', 'foto_odometro', 'Odômetro antigo / atual']
    ];
    definitions.forEach(([id, field, label]) => {
      const input = document.getElementById(id);
      if (!input) return;
      const source = pick(record, EXPENSE_FIELDS[field]);
      input.dataset.existingSource = source;
      input.dataset.removeExisting = '0';
      input.required = false;
      const box = ensureExistingBox(input, label);
      setImageState(box, source, false);
    });
  }

  function hydrateClient(client) {
    if (!client) return client;
    const result = { ...client };
    Object.keys(CLIENT_FIELDS).forEach(field => { if (!unwrap(result[field])) result[field] = pick(client, CLIENT_FIELDS[field]); });
    return result;
  }

  function hydrateExpense(expense) {
    if (!expense) return expense;
    const result = { ...expense };
    Object.keys(EXPENSE_FIELDS).forEach(field => { if (!unwrap(result[field])) result[field] = pick(expense, EXPENSE_FIELDS[field]); });
    return result;
  }

  window.CCMediaPreserver = { CLIENT_FIELDS, EXPENSE_FIELDS, unwrap, pick, clientValue, expenseValue, renderClientPhotos, renderExpensePhotos, hydrateClient, hydrateExpense, isDatabaseUpload, loadAuthenticatedMedia, scanAuthenticatedImages };

  function installOpenWrappers() {
    if (!window.App || App.__ccMediaOpenWrappers) return;
    App.__ccMediaOpenWrappers = true;
    ['editClientAdmin', 'editClientCorrection'].forEach(name => {
      const original = App[name];
      if (typeof original !== 'function') return;
      App[name] = function (id) {
        const clients = (Store.getAllClients?.() || Store.getClients?.() || []);
        const client = clients.find(item => String(item.id || item.cnpj || item.codigo) === String(id));
        const result = original.apply(this, arguments);
        setTimeout(() => renderClientPhotos(hydrateClient(client)), 120);
        return result;
      };
    });
    if (window.UI && typeof UI.showClientDetails === 'function' && !UI.__ccHydrateLegacyClientMedia) {
      UI.__ccHydrateLegacyClientMedia = true;
      const originalDetails = UI.showClientDetails.bind(UI);
      UI.showClientDetails = client => originalDetails(hydrateClient(client));
    }
    if (typeof App.showFacadeImage === 'function' && !App.__ccAuthenticatedImageViewer) {
      App.__ccAuthenticatedImageViewer = true;
      const originalViewer = App.showFacadeImage.bind(App);
      App.showFacadeImage = async source => {
        try { return originalViewer(await loadAuthenticatedMedia(source)); }
        catch (error) { alert(error.message || 'Não foi possível abrir esta foto.'); }
      };
    }
  }

  const style = document.createElement('style');
  style.textContent = `.cc-existing-media{margin-top:8px;padding:8px;border:1px solid var(--border-color);border-radius:8px;background:rgba(37,99,235,.06)}.cc-existing-media-title{font-size:.72rem;font-weight:700;color:var(--primary-light);margin-bottom:6px}.cc-existing-media img{width:100%;max-width:170px;height:100px;object-fit:contain;border:1px solid var(--border-color);border-radius:6px;background:#07101f;cursor:pointer}.cc-existing-media [data-media-status]{font-size:.69rem;color:var(--text-muted);margin-top:5px}.cc-existing-media-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.cc-existing-media-actions button{border:1px solid var(--border-color);border-radius:6px;padding:5px 8px;background:var(--bg-tertiary,#1e293b);color:var(--text-main);font-size:.7rem;cursor:pointer}.cc-existing-media-actions [data-remove-existing]{color:#fecaca;border-color:#7f1d1d}.cc-auth-media-error{margin-top:7px;padding:8px;border:1px dashed var(--warning,#f59e0b);border-radius:6px;color:var(--warning,#f59e0b);font-size:.72rem}`;
  document.head.appendChild(style);
  function start() {
    installOpenWrappers();
    scanAuthenticatedImages(document);
    new MutationObserver(mutations => mutations.forEach(mutation => {
      mutation.addedNodes.forEach(scanAuthenticatedImages);
      if (mutation.type === 'attributes') hydrateImageElement(mutation.target);
    })).observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['src'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0));
  else setTimeout(start, 0);
})();
