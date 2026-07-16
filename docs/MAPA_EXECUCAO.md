# Mapa de Execucao

Este documento registra o fluxo oficial identificado no projeto.

## Deploy no Render

Arquivo: `render.yaml`

```yaml
buildCommand: npm ci --prefix backend
startCommand: npm start --prefix backend
```

## Script da raiz

Arquivo: `package.json`

```json
"build": "npm ci --prefix backend",
"start": "npm start --prefix backend"
```

## Script do backend

Arquivo: `backend/package.json`

```json
"start": "node src/index.js"
```

## Backend oficial

```text
backend/src/index.js
```

Esse e o arquivo que deve receber novas rotas, correcoes de API, ajustes de banco, uploads, autenticacao e notificacoes.

## Frontend oficial

O backend publica somente as pastas e os arquivos necessarios do frontend:

```js
const FRONTEND_ROOT = path.join(__dirname, '..', '..');
app.use('/css', express.static(path.join(FRONTEND_ROOT, 'css'), ...));
app.use('/js', express.static(path.join(FRONTEND_ROOT, 'js'), ...));
app.use('/pages', express.static(path.join(FRONTEND_ROOT, 'pages'), ...));
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
});
```

O diretorio `backend/`, migracoes, documentacao e arquivos de configuracao nao sao servidos publicamente.

Portanto, o frontend oficial e composto por:

- `index.html`
- `css/`
- `js/`
- `pages/`
- `icon.svg`
- `manifest.json`
- `sw.js`
