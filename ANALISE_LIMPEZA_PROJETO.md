# Analise e limpeza do projeto

Versao gerada em 09/07/2026.

## O que foi encontrado

- O sistema tinha muitos arquivos de correcao carregados separadamente no final do `index.html`.
- Havia duplicidade de estrutura em `public/` e `frontend/`, enquanto o backend serve o `index.html` da raiz.
- As fotos eram gravadas na tabela `app_uploads` como `data_base64`, aumentando o tamanho do PostgreSQL.
- As correcoes recentes de clientes, chamados, edicao e fotos estavam espalhadas em arquivos diferentes.

## O que foi limpo nesta versao

- As correcoes historicas foram consolidadas em `js/compatibilidade-consolidada.js`.
- O `index.html` passou a carregar os arquivos principais e um unico arquivo consolidado de compatibilidade.
- O backend foi preparado para upload externo via Cloudinary.
- Novos uploads passam a salvar somente URL no banco quando as variaveis Cloudinary estiverem configuradas.
- Se o Cloudinary nao estiver configurado, o sistema continua funcionando com fallback no banco.
- As instrucoes do Render foram atualizadas.

## Variaveis para tirar fotos do banco

Configure no Render:

```text
CLOUDINARY_CLOUD_NAME=seu_cloud_name
CLOUDINARY_UPLOAD_PRESET=seu_upload_preset
CLOUDINARY_FOLDER=controle-comercial
```

Opcional, para obrigar upload externo e nunca salvar imagem no banco:

```text
UPLOAD_EXTERNAL_REQUIRED=true
```

## Observacao importante

Esta versao ainda preserva os arquivos antigos dentro da pasta para seguranca, mas eles nao sao mais carregados diretamente pelo `index.html`. O pacote final pode ser gerado sem `public/` e `frontend/`, pois o backend usa os arquivos da raiz.
