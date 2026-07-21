const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'audit-results', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const types = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json' };
const server = http.createServer((req, res) => {
  const raw = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
  const full = path.resolve(root, rel);
  if (!full.startsWith(root) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream', 'Cache-Control':'no-store' });
  fs.createReadStream(full).pipe(res);
});

const viewports = [
  { name:'celular', width:390, height:844 },
  { name:'tablet', width:768, height:1024 },
  { name:'desktop', width:1440, height:900 }
];

function mockBody(url) {
  if (url.includes('/api/login')) return { token:'token-auditoria', user:mockBody('/api/me') };
  if (url.includes('/api/me')) return { id:'audit-vendedor', name:'Usuário de Teste', username:'audit', profile:'Vendedor', permissions:[], empresa_id:'empresa-a', unitId:'mg', status:'LIBERADO' };
  if (/\/api\/store(?:\?|$)/.test(url)) return { company_identity:{name:'Empresa Teste'}, units:[{id:'mg',name:'Minas Gerais'},{id:'es',name:'Espírito Santo'}], prospects:[], clients:[], equipments:[], movements:[], tickets:[], expenses:[], balances:[], client_categories:[], equipment_types:['Geladeira Expositora Slim','Freezer Horizontal','Display Promocional','Cervejeira Grande'], rejection_reasons:[], prospect_loss_reasons:[], expense_categories:[], notification_emails:[] };
  if (url.includes('/api/store/')) return { key:'audit', data:[] };
  if (url.includes('/api/usuarios')) return [];
  if (url.includes('/api/unidades')) return [{id:'mg',name:'Minas Gerais'},{id:'es',name:'Espírito Santo'}];
  return [];
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless:true });
  const results = [];
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport:{width:vp.width,height:vp.height}, serviceWorkers:'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.route('https://**/*', route => route.abort());
    await page.route('**/api/**', async route => {
      await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(mockBody(route.request().url())) });
    });
    await page.goto(`http://127.0.0.1:${port}/#login`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(1200);
    const loginState = await page.evaluate(() => ({
      loginVisible: getComputedStyle(document.getElementById('login-wrapper-container')).display !== 'none',
      appHidden: getComputedStyle(document.getElementById('app-container')).display === 'none',
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    }));
    await page.screenshot({ path:path.join(outDir, `${vp.name}-login.png`), fullPage:false });

    await page.fill('#login-username', 'audit');
    await page.fill('#login-password', 'senha-teste');
    await page.click('#login-form button[type="submit"]');
    await page.waitForTimeout(2200);
    const shellState = await page.evaluate(() => ({
      loginHidden: getComputedStyle(document.getElementById('login-wrapper-container')).display === 'none',
      appVisible: getComputedStyle(document.getElementById('app-container')).display !== 'none',
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      route: location.hash
    }));
    await page.screenshot({ path:path.join(outDir, `${vp.name}-dashboard.png`), fullPage:false });
    results.push({ viewport:vp, login:loginState, authenticatedShell:shellState });
    await context.close();
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(root, 'audit-results', 'browser-visual-audit.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(err => { console.error(err); server.close(); process.exit(1); });
