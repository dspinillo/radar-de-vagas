# 0003 - Estado local, identidade da vaga e contrato de fonte

Data: 2026-10-01

## Contexto

O formato da vaga e o contrato de fonte são a base de todas as fontes, do estado local e da página. A proposta inicial passou por duas revisões independentes antes de qualquer código. As duas aprovaram com ajustes e concordaram em quase tudo; divergiram em como reconhecer a mesma vaga vinda de fontes diferentes, e a divergência foi tratada como sinal de risco.

Três processos gravam o mesmo estado: a coleta (agendada), a página (cliques da pessoa) e a triagem (agente). Uma versão anterior, pessoal, já perdeu marcações por sobrescrita.

## Decisão

**Formato da vaga (`job`): só o que vem da fonte.**

- A fonte devolve `source`, `sourceId`, `url`, `applyUrl`, `title`, `company`, `location`, `workModel`, `description`, `publishedAt`, `salary`, `employmentType`.
- `sourceId` é string única dentro da fonte. Fonte por empresa prefixa o identificador com a empresa (`aurora/123`).
- `id` é derivado pela coleta (`source:sourceId`), nunca escrito pela fonte.
- `url` é o anúncio; `applyUrl` é o link direto de inscrição, quando a fonte informa. Os dois são HTTP(S).
- `description` é o texto inteiro, sem HTML, com parágrafos e itens de lista preservados. Se a busca do detalhe falha, a vaga vira erro da fonte: nunca se guarda um resumo no lugar.
- `publishedAt` é data civil (`AAAA-MM-DD`) ou `null`. Data desconhecida fica `null`, nunca recebe a data da coleta.
- Datas de coleta não pertencem à vaga: quem carimba é a coleta, no estado.

**Contrato de fonte.**

- `collect(ctx)` devolve `{ jobs, errors }`. `ctx` traz `search` (termos, localidade, modelo e idade máxima escolhidos pela pessoa), `companies`, `known` (vagas desta fonte já no estado, para não rebuscar detalhe), `fetch` (com tempo limite e identificação já aplicados), `sleep` e `log`.
- Falha de um termo ou de uma empresa vira item em `errors` com alvo e etapa. Exceção solta é capturada pela coleta e vira erro da fonte.
- A idade máxima é uma preferência de busca da pessoa, não um corte do radar. Vaga sem data de publicação nunca é descartada por idade.

**Estado (`estado.json`): um envelope por vaga, um dono por bloco.**

```js
{
  schemaVersion: 1,
  jobs: { "<id>": {
    job:      { /* formato único, só da fonte */ },
    seen:     { firstSeenAt, lastSeenAt, dedupKey, alsoAt: [{ id, url }] }, // coleta
    triage:   null | { fit, reason, alerts, triagedAt },                    // agente
    mark:     null | { status, cutReason, markedAt },                      // pessoa
    tracking: null | { stage, next, notes, updatedAt }                     // pessoa
  } },
  aliases: { "<id de outra fonte>": "<id da entrada>" },
  sources: { "<fonte>": { lastRunAt, errors: [] } }
}
```

- O módulo de estado expõe uma função por dono (`addJobs`, `setTriage`, `setMark`, `setTracking`) e nenhuma que grave tudo. A coleta não tem como tocar na marcação.
- Toda escrita relê o arquivo, altera só o seu bloco e grava em arquivo temporário com troca atômica, sob uma trava simples. O servidor da página não guarda estado em memória, e o agente grava por comando, nunca editando o JSON.
- A chave da entrada nunca muda. Vaga já conhecida só atualiza `lastSeenAt`. Ausência numa coleta não apaga a vaga nem significa que ela fechou.

**Mesma vaga em fontes diferentes.**

- Fusão automática só com evidência forte: mesmo link de inscrição ou mesmo identificador do sistema de recrutamento.
- Empresa e título normalizados (`dedupKey`) apenas sugerem: a página mostra "possível duplicata" e as duas linhas continuam visíveis.
- Na fusão, a fonte por empresa tem prioridade: substitui o bloco `job`, e `triage`, `mark` e `tracking` ficam intactos. O outro identificador vai para `aliases` e `alsoAt`.

## Consequências

- Positiva: a perda de marcação por sobrescrita fica impossível por construção, não por disciplina.
- Positiva: o arquivo vive na máquina de terceiros que atualizam por `git pull`; com `schemaVersion` há caminho de migração.
- Positiva: fusão errada esconderia uma vaga, o que fere o princípio de nunca esconder. A regra conservadora evita isso.
- Custo: a mesma vaga pode aparecer duas vezes (por exemplo, no agregador e na página da empresa) quando não há evidência forte. A sugestão de duplicata reduz o incômodo.
- Custo: descrições inteiras num único JSON crescem. Se pesar, a descrição vai para arquivo separado numa versão futura do schema.
- Dívida: política de atualização de vaga já coletada (hoje, não atualiza) e detecção de vaga que saiu do ar.
