# Implantacao segura da versao corrigida

Esta versao foi preparada sem acesso ao banco de producao. Nao substitua o deploy atual sem executar os passos abaixo.

## 1. Criar backup

1. Gere um backup completo do PostgreSQL no provedor.
2. Confirme que o arquivo pode ser restaurado em um banco separado.
3. Registre a data, o ambiente e o responsavel pelo backup.

## 2. Testar em copia do banco

1. Restaure o backup em um banco de homologacao.
2. Configure `DATABASE_URL` somente com a URL da homologacao.
3. Use Node.js 20.17 ou superior.
4. Execute `npm ci --prefix backend`.
5. Execute `npm test --prefix backend`.
6. Inicie o sistema e valide login, usuarios, despesas, anexos, clientes e equipamentos.

As migracoes desta versao nao dividem, arredondam nem reinterpretam valores financeiros. A nova coluna de empresa em clientes e aditiva e aceita `null` para preservar registros antigos.

## 3. Rotacionar o administrador conhecido

No primeiro deploy controlado, configure:

```text
INITIAL_ADMIN_PASSWORD=<senha forte com pelo menos 12 caracteres>
ROTATE_INITIAL_ADMIN_PASSWORD=true
```

Depois de confirmar o login, remova `ROTATE_INITIAL_ADMIN_PASSWORD`. A senha nao sera redefinida novamente.

Tambem configure uma nova `JWT_SECRET` longa e aleatoria. A troca encerra as sessoes antigas, o que e desejavel apos a correcao de seguranca.

## 4. Variaveis obrigatorias/recomendadas

```text
NODE_ENV=production
DATABASE_URL=<postgresql de producao>
JWT_SECRET=<chave longa e aleatoria>
FRONTEND_URL=https://seu-dominio
UPLOAD_EXTERNAL_REQUIRED=true
```

Configure Cloudinary ou outro armazenamento externo antes de ativar `UPLOAD_EXTERNAL_REQUIRED`.

## 5. Validacao antes da producao

- O endpoint `/api/system-diag` deve retornar 401 sem login e 403 para nao administrador.
- `/backend/src/index.js` deve retornar a aplicacao ou 404, nunca o codigo-fonte.
- Um usuario de uma empresa nao deve listar registros de outra.
- Anexos devem exigir login e pertencer a empresa do token.
- Uma despesa de R$ 1.000,00 deve permanecer R$ 1.000,00 apos reiniciar.
- O login antigo deve continuar funcionando e converter a senha validada para bcrypt.

## 6. Plano de retorno

Se alguma validacao falhar, interrompa o deploy e volte o codigo anterior. Restaure o banco apenas se houver evidencia de alteracao indevida; nao restaure por rotina, pois isso descartaria operacoes legitimas feitas depois do backup.

