# Relatório de correções e validação — 20/07/2026

## Objetivo e proteção dos dados

Este trabalho corrigiu os pontos encontrados nas duas análises anteriores e ampliou os testes de regressão, com prioridade para isolamento entre empresas, hierarquia dos perfis, usuários com mais de uma unidade, catálogo comum e movimentações de equipamentos.

Nenhuma conexão com o banco de produção foi aberta durante as correções. Nenhum registro foi apagado, convertido ou regravado em massa. A nova migração é aditiva: cria uma relação de unidades por usuário e acrescenta campos opcionais de empresa/unidade às movimentações. Os campos antigos continuam existindo para manter compatibilidade.

## Correções realizadas

### 1. Perfis, hierarquia e acesso

- Administrador e financeiro mantêm visão ampla dentro da própria empresa.
- Vendedor, motorista, ajudante, mecânico e manutenção ficam limitados aos próprios registros quando a regra da área exige propriedade.
- Supervisor visualiza somente os vendedores vinculados a ele e os próprios registros.
- Gerente segue a cadeia de supervisão da sua empresa.
- Perfis desconhecidos agora usam a regra segura de acesso próprio, em vez de receber acesso amplo por omissão.
- A API valida as regras mesmo quando alguém tenta chamar o endereço diretamente, sem usar o menu.
- Foi impedida a autoelevação indevida de perfil/permissão.

### 2. Usuários com uma ou várias unidades

- Criada a tabela relacional `usuario_unidades`, sem remover o campo antigo `unitId`.
- Login e consulta do usuário retornam `unitIds` e a indicação `allUnits`.
- Cadastro e edição de usuário permitem selecionar várias unidades.
- Usuários com uma unidade ficam restritos a ela; usuários com duas ou mais podem alternar somente entre as unidades permitidas.
- Formulários de despesas, saldos, clientes, chamados, equipamentos e movimentações respeitam a unidade permitida.
- O seletor global e os seletores internos usam a interseção das unidades autorizadas.

### 3. Isolamento entre empresas

- Despesas, chamados, clientes, saldos e movimentações passaram a aplicar o `empresa_id` do usuário autenticado na API.
- Detalhamento, edição, aprovação, exclusão, histórico e restauração de movimentações usam busca limitada à empresa.
- O nome da empresa enviado pelo navegador não é mais aceito como fonte de autorização.
- Movimentações antigas continuam visíveis por uma leitura compatível, quando a empresa pode ser determinada sem ambiguidade.
- O histórico de exclusões passou a registrar e consultar a empresa.

### 4. Movimentações de equipamentos

- A unidade precisa ser informada explicitamente e é validada contra as unidades do usuário.
- Novas movimentações registram `empresa_id` e `unit_id`.
- A listagem, o dossiê, a aprovação e a restauração respeitam empresa e unidade.
- O formulário envia o identificador real da unidade, não apenas o nome exibido.
- Foi mantida a proteção contra envio duplicado por clique repetido.
- A compatibilidade com registros antigos foi preservada.

### 5. Despesas, saldos e aprovação parcial

- Consultas e resumos usam empresa, hierarquia e unidades permitidas.
- Lançamento direto de saldo valida tanto a unidade do aprovador quanto a unidade do beneficiário.
- A lista de destinatários de saldo considera múltiplas unidades.
- Corrigido um erro no resumo de saldo que consultava a variável de usuário errada.
- Valores aprovados parcialmente permanecem como fonte dos totais aprovados, sem voltar ao valor originalmente solicitado.
- Permanecem as correções anteriores: administrador pode corrigir; autor ou administrador pode refazer despesa reprovada; fotos existentes são preservadas quando não há substituição.

### 6. Catálogos iguais em Minas Gerais e Espírito Santo

- Tipos de equipamentos, categorias de clientes, categorias de despesas, motivos e unidades passaram a ser catálogos globais da empresa.
- O catálogo não depende mais do usuário que cadastrou o item.
- Dados legados individuais são unidos na leitura para não desaparecerem.
- Apenas administrador ou usuário com permissão de configuração pode alterar os catálogos administrativos.
- Assim, opções como Slim, freezer, expositor e cervejeira podem aparecer nas unidades autorizadas da mesma empresa.

### 7. Interface responsiva

- Seletores de múltiplas unidades foram preparados para computador e celular.
- Listas e tabelas mantêm contêiner de rolagem horizontal quando não for possível reduzir as colunas com segurança.
- O HTML do aplicativo continua oculto antes da autenticação.
- Foram preservadas as melhorias anteriores de zoom, arraste de imagem, abas móveis, modais roláveis, fotos antigas e filtros/ordenação.

## Migração segura

Arquivo: `backend/migrations/20260720_add_user_units_and_movement_scope.js`

A migração:

1. cria `usuario_unidades`;
2. acrescenta `empresa_id` e `unit_id` às movimentações;
3. acrescenta `empresa_id` ao histórico de exclusões;
4. copia somente associações antigas de unidade que sejam inequívocas;
5. não apaga nem altera o conteúdo dos campos legados.

Usuários antigos com `unitId = all` não são associados artificialmente a todas as unidades. Eles continuam atendidos pela compatibilidade legada até que as unidades sejam confirmadas no cadastro.

## Resultado dos testes executados

- Testes de regressão e segurança do backend: **41 aprovados, 0 falhas**.
- Auditoria estática das regras críticas: **29 aprovados, 0 falhas**.
- Verificação de sintaxe do backend e dos principais arquivos da interface: **aprovada**.
- Verificações incluídas: autenticação, autorização direta na API, hierarquia, isolamento por empresa, múltiplas unidades, migração aditiva, movimentações, catálogo global, saldo direto, mídia legada, aprovação parcial, filtros, ordenação e responsividade estrutural.

## Limites da validação local

A inspeção visual automatizada em navegador não pôde ser iniciada porque o pacote local de automação está incompleto (`playwright-core` ausente). Isso não causou alteração no projeto. Também não foram usados usuários reais nem o banco de produção.

Por isso, antes da produção, ainda é necessário executar no serviço de teste:

- login real de cada perfil;
- supervisor vinculado e não vinculado;
- usuário com duas unidades reais;
- duas empresas com dados semelhantes;
- upload lento e falha de notificação;
- comparação das linhas exportadas com os filtros visíveis;
- inspeção em celular, tablet e computador reais.

## Roteiro recomendado antes da produção

1. Manter o backup já criado.
2. Publicar primeiro no serviço de teste ligado à cópia restaurada do banco.
3. Confirmar que a migração terminou sem erro nos logs.
4. Testar Administrador, Supervisor, Vendedor, Manutenção/Mecânico, Motorista e Ajudante.
5. Testar um usuário de uma unidade e outro de duas unidades.
6. Registrar uma movimentação em MG e outra no ES e confirmar a separação.
7. Criar cliente nas duas unidades e conferir o mesmo catálogo de equipamentos.
8. Testar despesa, aprovação parcial, saldo direto e exportação filtrada.
9. Somente depois atualizar o serviço principal.

## Observação técnica que merece acompanhamento

A tabela legada `equipamentos_patrimonio` usa o código de patrimônio como chave global e guarda a empresa em texto. As rotas já limitam a consulta pela empresa, mas, se duas empresas puderem possuir o mesmo código de patrimônio, será necessária uma migração específica para uma chave composta. Essa mudança não foi feita automaticamente porque altera a chave primária e deve ser precedida por uma verificação de duplicidades na cópia do banco.

## Comandos para enviar a atualização

Execute dentro da pasta do projeto:

```powershell
git add -A
git commit -m "Corrige isolamento, multiplas unidades e regressao geral"
git push
```

O Render com publicação automática iniciará a atualização após o `git push`.
