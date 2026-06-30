# Relatório - Correção Push Notifications/PWA

## Arquivos alterados
- backend/src/index.js
- js/correcoes-pendencias-geral-30-06.js
- public/js/correcoes-pendencias-geral-30-06.js
- sw.js
- public/sw.js
- .env.example
- backend/.env.example
- INSTRUCOES_RENDER.txt

## O que foi corrigido
- A permissão de notificação deixou de ser solicitada automaticamente ao abrir o sistema.
- O botão "Receber Push no Celular" agora executa o fluxo correto: verifica HTTPS, Service Worker, Notification API, PushManager, chave VAPID, solicita permissão, cria subscription e salva no PostgreSQL.
- O backend agora salva informações do dispositivo, navegador, permissão e logs de envio.
- Foi adicionada criação/atualização automática das colunas necessárias em `push_subscriptions`.
- Foi adicionada a tabela `push_logs` para registrar inscrição, envio e erros.
- O envio Web Push agora registra sucesso/erro por dispositivo e remove subscriptions inválidas quando o navegador retorna 404/410.
- O Service Worker foi ajustado para exibir notificação com ícone, abrir a rota correta ao clicar e funcionar melhor como PWA.
- As instruções de VAPID foram adicionadas ao projeto e ao Render.

## Observação importante para produção
Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` no Render. O sistema gera chaves temporárias se elas não existirem, mas isso não é ideal porque as inscrições podem parar após reiniciar o serviço.

## Testes executados
- Validação de sintaxe do backend com `node -c backend/src/index.js`.
- Validação de sintaxe dos scripts JS alterados com `node -c`.
