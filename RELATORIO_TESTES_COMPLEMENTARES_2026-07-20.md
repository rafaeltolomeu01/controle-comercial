# Relatório de testes complementares — Controle Comercial

Data da execução: 20/07/2026  
Projeto analisado: `controle-comercial-atualizacoes-v2`  
Regra de segurança: nenhum teste foi executado contra o banco de produção e nenhum dado real foi alterado.

## 1. Resumo executivo

Foram executadas três camadas de verificação:

1. **38 testes de regressão já existentes:** 38 passaram, 0 falharam.
2. **29 verificações complementares de perfis, rotas, empresa, unidade, upload, saldos, exportação e responsividade:** 17 passaram e 12 apontaram falhas ou ausência de garantia.
3. **Testes automatizados no navegador:** login e painel principal testados em celular (390 × 844), tablet (768 × 1024) e computador (1440 × 900). Os seis cenários passaram para ocultação antes do login, abertura após login e ausência de rolagem horizontal geral.

O sistema tem boas proteções de autenticação, senha, preservação de fotos, aprovação parcial e fluxo de upload. Entretanto, **ainda não está pronto para considerar concluídos todos os testes solicitados**, principalmente por cinco riscos:

- o cadastro de usuário suporta somente uma unidade ou “todas”, e não duas unidades específicas;
- o catálogo de equipamentos não é global por empresa e pode diferir entre MG, ES e usuários;
- as rotas padrão finais não entregam o módulo esperado a Mecânico e Responsável por Equipamentos sem permissões extras gravadas;
- há operações administrativas por ID sem isolamento uniforme por empresa;
- movimentações não guardam uma chave de unidade própria; a unidade é inferida pelo texto da Empresa Base ou pelo usuário.

## 2. Resultado de cada grupo solicitado

| Teste solicitado | Resultado | Conclusão |
|---|---|---|
| Login de cada perfil e matriz de rotas | **Parcial / 2 falhas** | Administrador, Vendedor, Supervisor, Gerente e Financeiro receberam as rotas mínimas esperadas. Mecânico ficou apenas com Painel, PDF e Tutorial. Responsável Equipamentos também ficou apenas com Painel, PDF e Tutorial. |
| Tentativa direta à API sem depender do menu | **Parcial** | JWT e autenticação foram encontrados. Algumas rotas protegem dono, empresa e hierarquia. Porém, há operações administrativas por ID sem empresa na consulta e a rota genérica de configurações não protege todas as chaves globais. |
| Vendedor próprio × vendedor alheio | **Passou nos fluxos cobertos pelo teste de regressão** | Edição/correção de despesa limita dono e empresa; administrador pode corrigir. Ainda precisa de teste HTTP real com dois vendedores no banco de homologação para todos os módulos. |
| Supervisor vinculado × não vinculado | **Código coerente, teste dinâmico pendente** | `getPermittedSellerIds` restringe Supervisor aos vendedores vinculados e a ele próprio. É necessário confirmar por requisições reais com dois supervisores e vendedores cruzados. |
| Duas unidades específicas por usuário | **Falhou** | O modelo usa `unitId`/`unit_id` singular. Não existe relação persistente de várias unidades específicas por usuário. Hoje é uma unidade ou “all”. |
| Isolamento entre duas empresas | **Falhou em pontos administrativos** | Listagens principais usam empresa, mas detalhe/exclusão administrativa de despesas, edição/detalhe/exclusão de movimentações e exclusão de chamados não demonstram isolamento uniforme por `empresa_id`. |
| Criação e listagem por unidade em todos os módulos | **Parcial / falha em movimentações** | Despesas e vários filtros usam unidade. Movimentações não gravam `unit_id`; a listagem tenta inferir a unidade pela Empresa Base e pelo usuário, o que é vulnerável a nomes antigos, mudança de vínculo e usuário “all”. |
| Cadastro de cliente MG/ES com o mesmo catálogo | **Falhou** | `equipment_types` não faz parte das chaves globais. O catálogo fica no escopo local do usuário, explicando opções diferentes entre MG e ES. |
| Movimentação completa com upload lento e falha de notificação | **Passou na regressão de código; rede real pendente** | O envio aguarda upload e a falha de notificação é tratada depois que a movimentação foi salva. Falta simular Cloudinary lento/indisponível com um servidor e banco de homologação. |
| Despesas e saldos com aprovação parcial | **Passou na regressão de código; dados reais pendentes** | O código mantém valor aprovado e os testes existentes confirmam que listas e somatórios priorizam o valor efetivamente aprovado. Falta conferir com casos reais em banco descartável. |
| Exportação respeitando filtros | **Parcial** | O código contém exportação ligada a listas filtradas. Falta comparar automaticamente a quantidade e os IDs da tela com o XLSX/PDF gerado em cada módulo. |
| Visual celular/tablet/desktop | **Passou no login e painel; parcial nas tabelas** | Login e painel passaram nas três larguras. As folhas CSS ainda possuem tabelas com `min-width` de 720, 980 e 1120 px, portanto telas tabulares podem ocultar seleção/ações ou exigir rolagem lateral. |

## 3. Matriz de rotas observada

### Administrador

Passou. Recebe Painel, Prospecção, Clientes, Aprovação, Equipamentos, Movimentação, Chamados, Despesas, Aprovação de despesas/saldo, Relatórios, Unidades, Usuários, Empresa, Configurações, Simulador, Exclusões e Tutorial.

### Vendedor

Passou na matriz do menu. Recebe Painel, Prospecção, Clientes, Movimentação, Chamados, Despesas, Solicitação de saldo, Relatórios, Simulador e Tutorial. Não recebe administração.

### Supervisor e Gerente

Passaram na matriz do menu, mas o acesso aos dados ainda depende do correto vínculo no servidor. Recebem módulos operacionais, aprovações, despesas e usuários.

### Financeiro

Passou. Recebe Painel, Despesas, Solicitação/Aprovação de saldo, Relatórios e Tutorial.

### Mecânico

**Falhou.** Sem permissões extras, a matriz final não adiciona `#chamados`. O perfil fica com Painel, PDF e Tutorial. Isso contradiz a regra de negócio informada.

### Responsável Equipamentos

**Falhou.** Sem permissões extras, a matriz final não adiciona Movimentação nem Chamados. O perfil fica com Painel, PDF e Tutorial.

### Motorista, Ajudante e Manutenção

Não há uma matriz final explícita por perfil. O acesso depende das permissões individuais. Isso pode funcionar, mas é frágil: um cadastro sem todas as caixas corretas fica sem o módulo necessário.

## 4. Segurança de API e isolamento

### Pontos positivos confirmados

- autenticação por token JWT;
- senha com `bcrypt.hash` e `bcrypt.compare`;
- usuário precisa estar ativo/liberado;
- edição de despesa pendente verifica empresa, dono e status;
- correção de despesa permite o dono ou administrador e mantém auditoria;
- listagens de vários módulos aplicam empresa e hierarquia;
- upload possui escopo de empresa;
- tela operacional permanece oculta e inerte até autenticação.

### Falhas críticas encontradas

1. **Despesa por ID no ramo administrativo:** a busca inicial deixa de aplicar `empresa_id` quando o ator é administrador. A exclusão final também usa somente o ID. Um administrador de uma empresa pode atingir um ID de outra empresa se houver múltiplas empresas no mesmo banco.
2. **Movimentação por ID:** edição, exclusão em lote, detalhe e aprovação não aplicam `empresa_id` de forma uniforme na própria consulta do registro.
3. **Chamado mecânico:** a exclusão administrativa busca e apaga apenas pelo ID, sem `empresa_id`.
4. **Configurações globais:** `/api/store/:key` protege explicitamente o importador de clientes, mas não todas as chaves globais. A proteção deve ser por lista de chaves administrativas.
5. **Regra permissiva por perfil desconhecido:** `getPermittedSellerIds` entrega todos os usuários da empresa para qualquer perfil que não seja Vendedor, Supervisor ou Gerente. O seguro seria liberar todos somente para perfis administrativos explicitamente autorizados e negar os demais.

## 5. Unidades e empresas

### Duas unidades específicas

O requisito “usuário pode atuar em MG e ES, mas não em todas as futuras unidades” não pode ser representado. É necessária uma relação como `usuario_unidades(usuario_id, empresa_id, unidade_id)` e validação no backend. O `unitId = all` é amplo demais.

### Movimentações

A tabela/registro de movimentação não recebe uma unidade explícita no INSERT. A listagem tenta identificar a unidade por:

1. texto/ID salvo em `empresa` (Empresa Base);
2. unidade do usuário responsável;
3. unidade do autor.

Esse método mantém compatibilidade com registros antigos, mas não é suficiente para novos registros. Novas movimentações devem gravar `empresa_id` e `unit_id`; registros antigos podem continuar com inferência somente como fallback de leitura.

### Catálogo MG/ES

O catálogo padrão possui Geladeira Expositora Slim, Freezer Horizontal, Display Promocional e Cervejeira Grande. Porém, `equipment_types` está no escopo local do usuário. Por isso uma opção cadastrada por um administrador/navegador pode não aparecer para vendedor de outra unidade.

Correção recomendada: tornar `equipment_types` uma configuração global da empresa no front-end e no backend, com escrita apenas por administrador e leitura por todos os usuários da empresa.

## 6. Despesas, saldos e aprovação parcial

Os 38 testes existentes confirmaram:

- edição pendente somente por dono, empresa e status;
- administrador pode corrigir despesa alheia;
- aprovação parcial usa o valor aprovado em listas e somatórios;
- refazer despesa reprovada preserva dados e fotos;
- saldo direto exige aprovador, usuário da mesma empresa, unidade/período e auditoria;
- cartões financeiros usam somente saldos/despesas aprovados do filtro;
- painel pessoal usa o usuário logado e não desconta despesa pendente.

Limitação: esses testes leem e validam o código. Não foi possível criar despesas reais no banco local porque a dependência nativa de SQLite não está disponível para a versão de Node presente neste ambiente. Não foi usado o banco de produção para contornar isso.

## 7. Uploads, fotos e movimentações

Passaram os testes de regressão para:

- aguardar upload antes de enviar movimentação;
- não informar falha total quando somente a notificação falhar;
- preservar fotos antigas de cliente ao editar;
- preservar comprovante/odômetro ao editar despesa;
- reconhecer mídia legada sem regravar o banco;
- foto de troca opcional;
- carregar fotos antigas com token.

Pendente em homologação:

- upload realmente lento;
- queda do Cloudinary no meio do envio;
- foto 401/404 e nova tentativa;
- notificação indisponível depois do INSERT;
- clique duplo e atualização da página durante o upload.

## 8. Responsividade

### Executado automaticamente

| Largura | Login ocultou o sistema | Painel abriu após login | Rolagem horizontal geral |
|---|---:|---:|---:|
| 390 px | Sim | Sim | Não |
| 768 px | Sim | Sim | Não |
| 1440 px | Sim | Sim | Não |

### Risco que permanece

Há regras de tabela com larguras mínimas de 720, 980 e 1120 px. Em celular, o contêiner precisa fornecer rolagem horizontal visível e manter checkbox/ações acessíveis. O teste do painel não comprova todas as tabelas, modais e formulários.

## 9. O que não foi executado contra dados reais

Para não colocar os dados do banco em risco, os itens abaixo não foram executados no Render de produção:

- login com as senhas reais de todos os perfis;
- requisições diretas que criam, alteram ou excluem registros;
- cruzamento real entre duas empresas;
- criação completa em MG e ES;
- aprovação parcial com lançamentos reais;
- exportação real comparada com registros reais;
- upload real para Cloudinary.

O backend local não iniciou com banco descartável porque o driver nativo SQLite disponível não é compatível com o runtime local e a instalação de dependências ficou bloqueada. Portanto, esses casos estão marcados como **pendentes**, não como aprovados.

## 10. Ordem recomendada de correção

### Prioridade 1 — segurança

1. adicionar `empresa_id` a todas as consultas por ID, inclusive para administrador;
2. tornar `getPermittedSellerIds` fechado por padrão;
3. proteger todas as chaves globais da store contra escrita não administrativa;
4. criar testes HTTP 403/404 cruzando empresas e usuários.

### Prioridade 2 — perfis e unidades

1. corrigir matriz padrão de Mecânico e Responsável Equipamentos;
2. criar relação de várias unidades por usuário;
3. validar unidade permitida no servidor em toda criação/listagem;
4. gravar `empresa_id` e `unit_id` nas novas movimentações.

### Prioridade 3 — catálogo e consistência

1. tornar catálogo de equipamentos global por empresa;
2. garantir mesma lista em MG e ES;
3. criar teste automatizado que abre o cadastro como dois vendedores e compara as opções.

### Prioridade 4 — homologação completa

1. subir serviço e banco exclusivos de teste;
2. criar dois usuários por perfil, duas empresas e três unidades;
3. executar matriz HTTP de leitura/criação/alteração/exclusão;
4. testar Cloudinary lento e notificação indisponível;
5. comparar exportações com a tela filtrada;
6. revisar visualmente todas as páginas nas três larguras.

## 11. Evidências geradas

- `audit-results/static-audit.json`: resultado estruturado das 29 verificações complementares.
- `audit-results/browser-visual-audit.json`: resultado dos testes de navegador.
- `audit-results/screenshots/celular-login.png`
- `audit-results/screenshots/celular-dashboard.png`
- `audit-results/screenshots/tablet-login.png`
- `audit-results/screenshots/tablet-dashboard.png`
- `audit-results/screenshots/desktop-login.png`
- `audit-results/screenshots/desktop-dashboard.png`
- `audit-tests/run-audit-tests.js`: teste reproduzível de matriz e garantias estáticas.
- `audit-tests/browser-visual-audit.js`: teste reproduzível em Edge para as três larguras.

## 12. Conclusão

O sistema possui uma base funcional importante e os 38 testes de regressão existentes passaram. Os pontos positivos de autenticação, hash de senha, preservação de fotos, aprovação parcial, upload aguardado e ocultação antes do login estão confirmados no código e nos testes locais.

Mesmo assim, não é seguro considerar encerrada a validação de perfis, empresas e unidades. Antes de colocar mais empresas/unidades ou depender do sistema para isolamento rígido, devem ser corrigidos os escopos administrativos por empresa, a matriz de Mecânico/Responsável Equipamentos, o suporte a várias unidades e a gravação explícita da unidade nas movimentações.
