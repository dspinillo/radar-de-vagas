# Contrato de fonte

Guia curto para quem vai escrever uma fonte nova em `src/sources/`. O porquê de
cada regra está em `decisions/0003-estado-e-identidade.md`; este documento não
repete, só aponta.

## Os campos da vaga

Toda fonte devolve objetos neste formato (validado por `validateJob`, em
`src/job.mjs`). Os campos abaixo são os únicos aceitos; `id` e `collectedAt`
não entram aqui, são escritos pela coleta.

| Campo | Tipo | Obrigatório | Significado |
|---|---|---|---|
| `source` | string, mesmo padrão de `name` (ver abaixo) | sim | Nome da fonte (igual ao `name` registrado em `src/sources/index.mjs`) |
| `sourceId` | string, pode ter dois-pontos e barra | sim | Identificador único dentro da fonte. Fonte por empresa prefixa com a empresa (`aurora/123`) |
| `url` | string (http/https) | sim | Endereço do anúncio |
| `applyUrl` | string (http/https) ou `null` | não, ausente vale `null` | Link direto de inscrição, quando a fonte informa |
| `title` | string | sim | Título da vaga |
| `company` | string | sim | Nome da empresa |
| `location` | string ou `null` | não, ausente vale `null` | Local da vaga, como a fonte descreve |
| `workModel` | `"remote"` \| `"hybrid"` \| `"onsite"` \| `null` | não, ausente vale `null` | Modelo de trabalho |
| `description` | string | sim | Texto inteiro da vaga, sem HTML (use `stripHtml`), sem truncar |
| `publishedAt` | string `AAAA-MM-DD` ou `null` | não, ausente vale `null` | Data de publicação. Desconhecida fica `null`, nunca recebe a data da coleta |
| `salary` | string ou `null` | não, ausente vale `null` | Faixa salarial, como a fonte descreve |
| `employmentType` | string ou `null` | não, ausente vale `null` | Tipo de contrato (CLT, PJ etc.), como a fonte descreve |

Os seis campos marcados "ausente vale `null`" podem simplesmente não aparecer
no objeto quando a fonte não tem a informação; não é preciso escrever
`campo: null` à mão (mas também não há problema em escrever).

**Identidade.** O id da vaga é `makeId(source, sourceId)`, que junta os dois
com dois-pontos (`${source}:${sourceId}`). Quem lê o id de volta separa no
PRIMEIRO dois-pontos, por isso `source` segue o mesmo padrão de nome das
fontes: minúsculo, sem espaço, sem dois-pontos (`SOURCE_NAME_PATTERN`, em
`src/job.mjs`). Já `sourceId` pode conter dois-pontos e barra à vontade.

## O `ctx` que `collect(ctx)` recebe

| Campo | O que é |
|---|---|
| `ctx.search` | Termos, localidade, modelo e idade máxima escolhidos pela pessoa (fonte do tipo `search`) |
| `ctx.companies` | Lista de empresas a varrer (fonte do tipo `company`) |
| `ctx.known` | Um `Set` com os `sourceId` desta fonte que já estão no estado. Use `ctx.known.has(sourceId)` para não buscar detalhe de novo |
| `ctx.fetch` | `fetch` com tempo limite e identificação já aplicados |
| `ctx.sleep` | Espera entre chamadas, para não sobrecarregar a fonte |
| `ctx.log` | Progresso em português (sem imprimir anúncios ou respostas) |
| `ctx.signal` | Sinal de cancelamento da fonte; interrompe novas requisições e detalhes |

## O retorno

```js
{
  jobs: [ /* vagas no formato acima */ ],
  errors: [ { target, step, message } ],
  observed: [ /* sourceId conhecidos que reapareceram na listagem */ ],
}
```

`target` identifica o que falhou (um termo, uma empresa, uma vaga), `step` a
etapa (`"busca"`, `"detalhe"` etc.) e `message` o motivo. `observed` é opcional
para compatibilidade com fontes injetadas; as fontes do projeto o devolvem para
atualizar `lastSeenAt` sem rebuscar detalhes. Inclua somente IDs conhecidos
realmente reencontrados, nunca candidatos adiados pelo teto. A persistência resolve
aliases. O resumo conta vagas devolvidas mais IDs reencontrados, sem sobreposição.

## Regras

- Nunca truncar a descrição. O requisito que decide costuma vir no fim do anúncio.
- Falha ao buscar o detalhe de uma vaga vira item em `errors`. Nunca se guarda um resumo no lugar da descrição.
- Falha parcial (um termo, uma empresa, uma vaga) nunca derruba a coleta inteira: captura o erro e segue para o próximo alvo.
- Teste de fonte usa resposta gravada (fixture) e dados fictícios, sem acessar a rede de verdade.
- `stripHtml` só entra no campo que a fonte entrega como HTML de verdade (o
  `description` de uma API que devolve HTML, por exemplo). Descrição que já
  vem em texto puro (algumas fontes entregam assim) não passa por `stripHtml`:
  o princípio dele é nunca perder uma frase real em HTML malformado, mas um
  elemento conhecido com atributos plausíveis escrito em prosa comum (ex.:
  `"a<b and c > d"`) ainda é lido como tag, como um navegador leria. Isso é
  esperado e aceito para HTML; para texto puro, simplesmente não se aplica.

## O objeto da fonte

Cada fonte exportada é um objeto só com estes campos (validado por
`validateSource`, em `src/sources/index.mjs`):

- `name`: string minúscula, sem espaço e sem dois-pontos (mesmo padrão do
  `source` da vaga, `SOURCE_NAME_PATTERN`).
- `label`: string não vazia, o nome legível que aparece para a pessoa.
- `kind`: `"search"` para fonte em que se busca por termo, `"company"` para
  fonte em que se lista vagas de uma empresa.
- `defaultEnabled`: booleano, se a fonte vem ligada por padrão.
- `collect`: a função `async (ctx) => ({ jobs, errors })` descrita acima.

## Exemplo mínimo

Fonte por empresa, com empresa e vaga inventadas:

```js
// src/sources/aurora.mjs (exemplo)
import { createSource, array, html } from '../source-utils.mjs';

export const aurora = createSource({
  name: 'aurora', label: 'Aurora Pagamentos', kind: 'company',
  async run(s, company) {
    const items = array(await s.request(`https://carreiras.example/${company}/vagas`));
    s.listing(company, 1, items.length);
    for (const item of items) {
      await s.item(`${company}/${item.id}`, async () => {
        const detail = await s.request(item.urlDetalhe);
        return {
          source: 'aurora', sourceId: `${company}/${item.id}`,
          url: item.urlAnuncio, title: detail.titulo, company,
          description: html(detail.descricaoHtml),
          publishedAt: detail.publicadaEm ?? null,
        };
      }, item.publicadaEm); // publicação da listagem, antes do detalhe
    }
  },
});
```

Depois de escrita, a fonte entra na lista `sources` em `src/sources/index.mjs`.

## Integração das seis fontes (T1.3 e T1.4)

`ctx.search` é o objeto em português devolvido por `loadSearch`, sem tradução:
`termos`, `localidade`, `modelo`, `idadeMaximaDias`, `fontes`, `empresas` e os
limites opcionais `detalhesNovosPorFonte` e `prazoFonteSegundos`.
As fontes por empresa usam `ctx.search.empresas[nomeDaFonte]`. Se fornecido,
`ctx.companies` substitui essa lista apenas para a fonte chamada, inclusive
quando é uma lista vazia. Cada entrada é o identificador da página de carreiras,
por exemplo `aurora-ficticia`; não é URL nem nome de exibição. São aceitos letras,
números, hífen e sublinhado. Acrescentar uma empresa exige apenas editar a busca.
Quando o provedor não informa o nome de exibição, `company` usa esse identificador.

LinkedIn exige `search.fontes.linkedin === true`, mesmo quando chamado diretamente.
Gupy respeita `search.fontes.gupy === false`. As fontes por empresa com lista vazia
não fazem requisições. `known`, `fetch`, `sleep` e `log` podem ser omitidos; `log`
não é usado para imprimir anúncios ou respostas de rede.

`src/network.mjs` exporta `createFetch({ fetch, timeoutMs })`. A implementação
injetada usa a assinatura do `fetch` nativo e retorna uma resposta com `text()`.
O helper acrescenta `User-Agent: RadarDeVagas/0.1 (coletor de vagas publicas; Node.js)`
e limita a requisição **e a leitura do corpo** a 15 segundos. Retorna `ok`,
`status`, `url`, `headers`, `text()` e `json()`; não é uma `Response` com streaming.
Cada fonte usa esse helper também ao receber `ctx.fetch`, garantindo as duas
proteções para testes e chamadas diretas. `ctx.timeoutMs` permite ajustar o prazo.
Não há tentativas automáticas após falha.

A fonte do LinkedIn espera um segundo entre todas as requisições da mesma rodada,
inclusive detalhes e mudanças de termo, usando `ctx.sleep(ms)` quando injetado.
Redirecionamentos, HTTP 401/403/429/999 e páginas com barreira efetiva de desafio ou autenticação
interrompem a fonte inteira, preservando vagas já lidas e sem afetar outras fontes.
Formulários opcionais de login não impedem a leitura quando há conteúdo público extraível. Nenhum login ou mecanismo para contornar bloqueios é utilizado.

| Fonte | Descrição e paginação |
|---|---|
| Gupy | Busca pública do portal atual (`/api/job-search/jobs`), paginação por offset enquanto houver lotes completos, sem confiar em `total`; detalhe `__NEXT_DATA__` do anúncio reúne descrição, responsabilidades, pré-requisitos e informações adicionais. O resumo da listagem nunca é salvo. |
| LinkedIn | Listagem pública por offset; detalhe público da vaga, com conteúdo aninhado integral. Página vazia encerra; estrutura desconhecida gera aviso. |
| Greenhouse | Lista completa com `content=true`; se faltar conteúdo, busca detalhe pelo ID. Decodifica também HTML entregue como entidades. Não usa `updated_at` como data de publicação. |
| Lever | Lotes de 100 por `skip`; busca detalhe se faltar descrição. Concatena descrição, listas, fechamento e descrição salarial. Texto puro não passa por `stripHtml`. |
| Ashby | API pública retorna a lista completa; sem descrição, tenta `JobPosting` JSON-LD da página da vaga. Preserva texto puro e ignora vagas explicitamente não listadas. |
| InHire | Lista completa em `job-posts/public/pages`, com cabeçalho `X-Tenant`; sempre busca detalhe de cada vaga. Link inclui o segmento do título exigido pelo portal. |

Referências dos contratos públicos: [Greenhouse](https://developers.greenhouse.io/job-board.html),
[Lever](https://github.com/lever/postings-api) e
[Ashby](https://developers.ashbyhq.com/docs/ashby-job-postings-api).
Gupy, LinkedIn e InHire dependem das estruturas dos portais públicos, que podem mudar.
Greenhouse, Ashby e InHire entregam a lista completa nos endpoints utilizados,
sem cursor público; uma resposta com estrutura diferente gera aviso.

O helper compartilhado descarta candidatos novos cuja publicação na listagem é
anterior ao dia civil UTC atual menos `idadeMaximaDias`; o dia limite é incluído.
Datas ausentes ou inválidas nunca permitem o descarte. Vagas conhecidas
reencontradas atualizam a observação inclusive quando antigas. Nenhuma fonte faz
corte local por título, local ou modelo. LinkedIn passa
localidade, modelo e idade à busca quando presentes; Gupy passa o termo, mantendo
o alcance amplo. Datas desconhecidas continuam `null`. Paginação repetida encerra
com aviso. `ctx.maxPages`, opcional, limita páginas por alvo nas fontes paginadas e
sempre avisa sobre resultado parcial quando impede consultar a página seguinte.
Sem esse campo, não há teto artificial. Falhas de detalhe não devolvem resumo;
apenas vagas aceitas por `validateJob` entram em `jobs`.

### Limites, progresso e persistência

Todas as fontes usam `createSource`. `s.item(sourceId, build, publishedAt)` aplica
idade, reconhece IDs e enfileira a construção do detalhe. A fila executa até quatro
construções simultâneas, com um teto por fonte (somando termos, empresas e páginas)
de `search.detalhesNovosPorFonte ?? 150` candidatos novos tentados. Falhas também
consomem esse teto; podem ser tentadas novamente na próxima rodada. Conteúdo já
completo na listagem passa pela mesma fila e teto, sem requisição extra.
O LinkedIn executa `item` imediatamente em série, mantendo um segundo entre
requisições, inclusive listagens. `s.flush()` aguarda a fila: use ao fim de cada
página; o helper também drena ao fim de cada alvo. `s.listing(alvo, página, total)`
anuncia cada página, inclusive vazia. A conclusão de cada detalhe anuncia N de M
(cumulativo; M cresce quando novas páginas são selecionadas).

O teto não encerra a paginação: as listagens restantes permitem contar os IDs
únicos adiados e reencontrar vagas conhecidas. Um aviso em `errors`, etapa
`limite`, informa quantas ficaram para a próxima rodada. Adiadas não entram em
`jobs` nem em `observed`; não são marcadas como vistas. A contagem cobre somente
listagens alcançadas antes de eventual falha ou prazo.

`collect()` impõe um prazo total por fonte de `search.prazoFonteSegundos ?? 600`
segundos, separado do timeout de 15 segundos por requisição. Testes podem injetar
`sourceTimeoutMs`. Até uma fonte injetada que nunca resolve vira erro de `coleta`
e permite executar a seguinte; o sinal cancela requisições pendentes. O resultado
incompleto dessa fonte não é salvo. Fontes devem respeitar `ctx.signal`; uma
Promise arbitrária não cooperativa não pode ser terminada à força.

O CLI anuncia início e conclusão, e aguarda a gravação atômica ao fim de **cada**
fonte, antes da seguinte. Ctrl+C/SIGTERM cancela a fonte em andamento, aguarda a
limpeza de escrita, trava e temporário e encerra com código 130. Fontes concluídas
permanecem salvas. SIGKILL ou queda de energia não permitem essa limpeza.

### Smoke sem persistência

```sh
node scripts/smoke-sources.mjs --termo planejamento \
  --greenhouse aurora-ficticia --lever nebulosa-ficticia \
  --ashby orbita-ficticia --inhire constelacao-ficticia
```

Os identificadores acima são fictícios; substitua-os **na linha de comando**.
Cada opção de termo ou empresa pode ser repetida. `--linkedin` liga a fonte
explicitamente, `--localidade Brasil` configura a localidade e `--max-pages 1`
permite uma sondagem curta, com aviso quando parcial. O script exige pelo menos
um `--termo`, imprime apenas contagens por fonte e avisos, e não lê nem grava a
pasta de dados. As contagens são vagas válidas obtidas naquela execução, não
estimativas do total disponível nos portais.
