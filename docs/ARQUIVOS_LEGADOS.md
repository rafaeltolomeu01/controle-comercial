# Arquivos e Pastas Candidatos a Legado

Este inventario nao apaga nada. Ele apenas marca pontos que precisam de validacao antes de limpeza.

## Backend

### `backend/server.js` — removido da versao corrigida

Era uma versao alternativa/antiga do backend e foi retirada do artefato de entrega. O original permanece preservado no ZIP fornecido pelo usuario.

Motivo:

- O deploy atual inicia `backend/src/index.js`.
- `backend/server.js` tem outro modelo de tabelas e outras rotas.
- Manter os dois pode causar confusao em manutencoes futuras.

Acao recomendada:

- Usar somente `backend/src/index.js`.

## Frontend

### `public/index.html`

Parece ser uma copia ou variacao do frontend principal.

Motivo:

- O backend oficial serve `index.html` da raiz.
- Alteracoes em `public/index.html` podem nao refletir no app em producao.

Acao recomendada:

- Validar se algum deploy antigo ainda usa `public/`.
- Se nao usar, mover para `legacy/public/` ou remover depois de teste.

### `frontend/public/index.html`

Parece ser uma versao alternativa, mais compacta, do frontend.

Motivo:

- Nao aparece no caminho oficial de start do Render.
- Tem estrutura visual e chamadas de API diferentes do frontend principal.

Acao recomendada:

- Tratar como prototipo ou versao antiga.
- Mover para `legacy/frontend-public/` somente depois de validar que nao e usado.

## Scripts de correcao em `js/`

Existem varios scripts com nomes de rodada/data, por exemplo:

- `final-updates-29-06.js`
- `rodada-14-19.js`
- `rodada-20-25.js`
- `correcoes-30-06.js`
- `correcoes-rodada-atual.js`
- `correcao-abas-navegacao-30-06.js`
- `correcao-troca-e-abas-final-30-06.js`
- `correcao-aprovacao-despesas-30-06.js`
- `correcoes-pendencias-geral-30-06.js`
- `correcoes-despesa-movimentacao-final-30-06.js`
- `correcoes-finais-30-06.js`
- `correcoes-clientes-fotos-30-06.js`

Motivo de atencao:

- Eles provavelmente corrigem problemas reais e nao devem ser removidos sem teste.
- Mas acumulados assim dificultam manutencao e podem sobrescrever comportamento entre si.

Acao recomendada:

- Manter por enquanto.
- Consolidar aos poucos dentro de `app.js`, `ui.js`, `store.js` ou modulos novos.
- Depois de cada consolidacao, testar telas e permissoes.
