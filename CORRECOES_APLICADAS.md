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

## Limites desta entrega

- Nenhum banco real foi acessado ou alterado.
- A migracao deve ser validada contra uma copia do PostgreSQL antes da producao.
- O frontend ainda carrega a biblioteca SheetJS 0.18.5 para importacoes/exportacoes no navegador. Sua substituicao completa exige uma rodada funcional dedicada porque varios relatorios dependem da API dessa biblioteca.
- A modularizacao dos arquivos grandes e a cobertura completa de testes continuam como trabalho de evolucao.
