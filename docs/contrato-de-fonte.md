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
| `ctx.log` | Log da coleta |

## O retorno

```js
{
  jobs: [ /* vagas no formato acima */ ],
  errors: [ { target, step, message } ],
}
```

`target` identifica o que falhou (um termo, uma empresa, uma vaga), `step` a
etapa (`"busca"`, `"detalhe"` etc.) e `message` o motivo.

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
import { stripHtml } from '../job.mjs';

export const aurora = {
  name: 'aurora',
  label: 'Aurora Pagamentos (carreiras)',
  kind: 'company',
  defaultEnabled: true,

  async collect(ctx) {
    const jobs = [];
    const errors = [];

    let resposta;
    try {
      resposta = await ctx.fetch('https://carreiras.aurorapagamentos.exemplo/api/vagas');
    } catch (err) {
      errors.push({ target: 'aurora', step: 'busca', message: err.message });
      return { jobs, errors };
    }

    const lista = await resposta.json();

    for (const item of lista) {
      const sourceId = `aurora/${item.id}`;

      if (ctx.known.has(sourceId)) continue; // já temos o detalhe desta vaga

      let detalhe;
      try {
        const respostaDetalhe = await ctx.fetch(item.urlDetalhe);
        detalhe = await respostaDetalhe.json();
      } catch (err) {
        errors.push({ target: sourceId, step: 'detalhe', message: err.message });
        continue;
      }

      jobs.push({
        source: 'aurora',
        sourceId,
        url: item.urlAnuncio,
        applyUrl: item.urlInscricao ?? null,
        title: detalhe.titulo,
        company: 'Aurora Pagamentos',
        location: detalhe.local ?? null,
        workModel: detalhe.remoto ? 'remote' : 'onsite',
        description: stripHtml(detalhe.descricaoHtml),
        publishedAt: detalhe.publicadaEm ?? null,
        salary: detalhe.faixaSalarial ?? null,
        employmentType: detalhe.tipoContrato ?? null,
      });

      await ctx.sleep(1000);
    }

    return { jobs, errors };
  },
};
```

Depois de escrita, a fonte entra na lista `sources` em `src/sources/index.mjs`.
