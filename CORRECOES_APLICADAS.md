# Correcoes aplicadas

- Removida a redefinicao automatica de administrador para `123456`.
- Administrador inicial agora depende de senha forte em variavel de ambiente.
- Senhas novas usam bcrypt; senhas legadas sao convertidas somente apos login valido.
- `JWT_SECRET` passou a ser obrigatoria em producao.
- Adicionado limite basico de tentativas de login.
- O servidor deixou de publicar a raiz inteira do projeto.
- O diagnostico passou a exigir administrador e nao retorna despesas.
- Uploads exigem login, empresa correta e autorizacao para exclusao.
- Configuracao de e-mails e importacao de produtos exigem administrador.
- Administradores de empresa permanecem limitados a propria empresa nos fluxos corrigidos.
- Removida a conversao automatica de valores inteiros por 100.
- Migracoes criticas ficaram idempotentes e sem rollback destrutivo.
- Adicionada coluna de escopo de empresa em clientes sem reatribuir dados antigos.
- Corrigidos pontos diretos de injecao de HTML em seletores do frontend.
- Atualizados Multer e SQLite; SheetJS do backend foi substituido por ExcelJS.
- Lockfile foi reconstruido e a auditoria do backend terminou com zero vulnerabilidades conhecidas.
- Adicionados seis testes de regressao de seguranca.
- Removidos arquivos `.bak` e o backend legado da versao de entrega.
- A unidade global selecionada agora limita listas, indicadores, graficos, paginacao e exportacoes, inclusive para administradores.
- Todos os filtros de selecao passaram a ser encadeados: cada escolha reduz dinamicamente as opcoes ainda validas nos demais filtros.
- Os tres cartoes financeiros usam a mesma base filtrada: saldo aprovado, despesas aprovadas utilizadas e saldo restante.
- O painel de aprovacao de saldo atualiza tabela, totais, graficos e ranking com os mesmos filtros de solicitante, status, datas e unidade.
- As consultas de despesas e movimentacoes reforcam o filtro de unidade no servidor sem ampliar a empresa ou a cadeia hierarquica permitida.
- Adicionados 25 testes de regressao, incluindo isolamento por unidade e coerencia dos filtros financeiros.

## Limites desta entrega

- Nenhum banco real foi acessado ou alterado.
- A migracao deve ser validada contra uma copia do PostgreSQL antes da producao.
- O frontend ainda carrega a biblioteca SheetJS 0.18.5 para importacoes/exportacoes no navegador. Sua substituicao completa exige uma rodada funcional dedicada porque varios relatorios dependem da API dessa biblioteca.
- A modularizacao dos arquivos grandes e a cobertura completa de testes continuam como trabalho de evolucao.
