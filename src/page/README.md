# Página local do radar

`server.mjs` exporta `startServer({ dataDir, port } = {})`, que devolve uma
promessa de `{ url, close }`. `close()` devolve uma promessa e pode ser repetido.
A porta padrão é 4317; `port: 0` pede uma livre. Se a porta estiver ocupada,
o servidor escolhe uma livre. O endereço usa sempre `127.0.0.1`.
`dataDir` segue o módulo de pasta de dados, inclusive `RADAR_DATA_DIR`.

- `GET /`: HTML com as vagas e textos de terceiros escapados.
- `GET /api/jobs`: `{ jobs, sources }`; cada item tem `id`, os blocos do estado
  e `possibleDuplicate`. Ordena pela publicação mais recente, depois pela
  primeira coleta; publicação desconhecida permanece desconhecida.
- `POST /api/jobs/:id/mark`: JSON `{ "status": "applied", "cutReason": null }`,
  `{ "status": "discarded", "cutReason": "Motivo escrito pela pessoa" }` ou
  `null` para desfazer. Responde `{ id, mark }`, usando a identidade canônica.
  Codifique o identificador inteiro com `encodeURIComponent`.
- `GET /page.css`, `/page.mjs` e `/view.mjs`: recursos locais da interface.

POST exige `Content-Type: application/json`, `Origin` igual a `url` e `Host`
igual ao host e porta de `url`. Origem ausente também é recusada. Limite do
corpo: 16 KiB, incluindo transferência em partes. Erros retornam `{ error }`
em português: 400 para marcação inválida, 403 para origem/host, 404 para vaga
ou rota desconhecida, 413 para corpo grande e 415 para tipo de conteúdo.

O servidor relê o estado nas requisições de dados e grava somente por `setMark`.
A lista do navegador é uma cópia de apresentação: Atualizar vagas relê o disco,
e cada decisão atualiza a lista. Tema é a única preferência no armazenamento
do navegador. A tabela mantém as colunas e rolagem horizontal no celular.

Conforme a [decisão 0002](../../decisions/0002-design.md), o desenho usa tabela densa com uma vaga por linha, serifada só no título, mono nos rótulos e números e temas sistema, claro e escuro.

Testes: `node --test src/page/server.test.mjs`; suíte completa: `node --test`.
Todos os dados de teste são fictícios e ficam em pastas temporárias.
