# Pasta de dados, busca e estado

Os módulos exigem Node 20 ou mais recente e não usam dependências externas.
Todos os acessos a dados usam `~/.radar-de-vagas/` por padrão. A variável
`RADAR_DATA_DIR` aceita um caminho absoluto alternativo. Nos testes, cada caso
passa `dataDir` apontando para uma pasta temporária. Caminhos dentro deste
repositório, inclusive por links simbólicos, são recusados antes de criar arquivos.

## Busca

`src/data-dir.mjs` exporta:

- `resolveDataDir(env = process.env)`: resolve o caminho, sem acessar o disco.
- `ensureDataDir(dataDir?)`: cria apenas a pasta e devolve seu caminho absoluto.
- `initializeDataDir({ dataDir }?)`: cria a pasta e publica `busca.json` completo
  somente se não existir. Devolve o caminho da pasta. Nunca substitui um arquivo
  existente, mesmo inválido. Inicializações simultâneas usam publicação exclusiva.
- `loadSearch({ dataDir }?)`: inicializa, lê e valida a busca. Devolve os campos
  do arquivo, em português; falhas geram exceções em português.
- `validateSearch(search)`: devolve uma lista de problemas em português;
  lista vazia indica uma busca válida. Não grava nem altera o objeto.

O exemplo é explicitamente fictício e contém `termos`, `localidade`, `modelo`,
`idadeMaximaDias`, `fontes`, `empresas`, `detalhesNovosPorFonte` (150) e
`prazoFonteSegundos` (600). Os dois últimos são opcionais para buscas existentes,
aceitam inteiros positivos e controlam cada fonte por rodada; prazo aceita até
2147483 segundos (limite do temporizador). O campo opcional `aviso` explica que
é necessário substituir os dados inventados. LinkedIn vem desligado.

`modelo` aceita `remoto`, `híbrido`, `presencial` ou `null`. `localidade` e
`idadeMaximaDias` também aceitam `null` (sem preferência). Idade, quando definida,
é um inteiro positivo; o módulo de estado não descarta vagas por idade.
`fontes` contém os booleanos `gupy` e `linkedin`. `empresas` contém uma lista
de identificadores de empresas para cada ATS: `greenhouse`, `lever`, `ashby`
e `inhire`; listas vazias são válidas. Os identificadores dos exemplos são
inventados, não são uma lista de empresas reais para coleta.

Nesta entrega a lista de empresas está em `busca.json`, como solicitado na T1.2;
o `empresas.json` separado mencionado na arquitetura ainda não é usado.
A futura coleta deve adaptar os campos de busca para `ctx.search` e selecionar
a lista de empresas do ATS para `ctx.companies`.

## Estado

`src/state.mjs` exporta cinco funções assíncronas. Todas aceitam a opção
`{ dataDir }`, usam `estado.json` e devolvem uma cópia do estado resultante
(`addJobs` também pode devolver as estatísticas descritas abaixo).
Não há função pública para gravar um estado inteiro.

```js
import { addJobs, loadState, setMark, setTriage, setTracking } from '../src/state.mjs';

// O registro real virá de src/sources/index.mjs. Nos testes ele é injetado.
const sources = [
  { name: 'gupy', kind: 'search' },
  { name: 'greenhouse', kind: 'company' },
];
const state = await loadState();
await addJobs([], {
  sources,
  runs: [{ source: 'gupy', errors: [] }],
});

// Após coletar a vaga fictícia indicada pelo id:
const id = 'gupy:vaga-ficticia';
await setMark(id, { status: 'applied', cutReason: null });
await setMark(id, { status: 'discarded', cutReason: 'Modelo incompatível.' });
await setTriage(id, { fit: 3, reason: 'Encaixe parcial.', alerts: ['Conferir idioma.'] });
await setTracking(id, { stage: 'entrevista', next: 'Preparar exemplos.', notes: '' });
```

- `loadState(options?)`: arquivo ausente devolve o envelope vazio da decisão 0003,
  com `schemaVersion: 1`. JSON inválido, schema incompatível ou blocos inconsistentes
  geram erro e permanecem intactos no disco.
- `addJobs(jobs, { dataDir, sources, runs, observed, returnStats }?)`: recebe apenas vagas validadas pelo
  contrato de fonte. `sources` é o registro **completo** de fontes, usado para
  reconhecer o tipo das fontes antigas e novas; o padrão é o registro do projeto.
  `runs` é uma lista opcional de `{ source, errors }`, com erros no formato
  `{ target, step, message }`. Inclua rodadas vazias ou malsucedidas nessa lista.
  Fontes com vagas recebidas têm sua rodada registrada automaticamente; sem
  informação explícita em `runs`, os erros dessa rodada são uma lista vazia.
  `observed` é uma lista opcional de IDs completos (`fonte:sourceId`) conhecidos
  que reapareceram sem detalhe. Atualiza somente `seen.lastSeenAt`, resolvendo
  aliases e ignorando IDs ausentes do estado. Não cria vagas nem altera `job`,
  `mark`, `triage` ou `tracking`. IDs adiados pelo teto não entram nessa lista.
  Com `returnStats: true`, devolve `{ state, inserted }`; `inserted` é calculado
  durante a alteração sob trava e conta entradas efetivamente criadas (sem
  aliases), mesmo com coletas simultâneas. Sem essa opção o retorno continua
  sendo o estado, para compatibilidade.
- `setTriage(id, value, options?)`: grava apenas a triagem, com nota inteira de 1 a 5.
- `setMark(id, value, options?)`: grava apenas a marcação. `applied` significa
  inscrevi; `discarded` significa descartar e exige motivo não vazio.
- `setTracking(id, value, options?)`: grava apenas acompanhamento. `stage` é texto
  não vazio, `next` é texto ou `null`, e `notes` é texto.

Os três setters aceitam `null` para limpar somente seu bloco, reconhecem aliases
e carimbam a data automaticamente. Campos extras são recusados. A coleta carimba
`firstSeenAt`, `lastSeenAt` e `lastRunAt`; nunca preenche a publicação desconhecida.

Toda escrita obtém `estado.lock` por criação exclusiva, relê o arquivo, altera
somente seus blocos, valida e publica por arquivo temporário + `rename` no mesmo
diretório. O temporário é sincronizado antes da troca. A trava funciona entre
processos e espera até cinco segundos. Se o processo morrer deixando a trava,
ela não é tomada automaticamente: remova-a apenas após verificar que nenhum
processo escreve. Leitores veem o arquivo anterior ou o novo, nunca JSON parcial.

## Identidade e fusão

A chave de uma entrada nunca muda. Um `source:sourceId` já conhecido, inclusive
por alias, atualiza somente `lastSeenAt`. Vagas ausentes de uma rodada permanecem.

Entre identidades diferentes, somente o mesmo `applyUrl` permite fusão automática.
A comparação usa a serialização padrão de `URL`, preservando caminho, parâmetros
e fragmento. Não infere identidade ATS a partir de um número igual em fontes
diferentes: o formato atual não tem um campo de identidade ATS compartilhada.
`dedupKey` apenas sinaliza possíveis duplicatas e nunca provoca fusão.

Uma fonte por empresa substitui o bloco `job` de uma fonte por termo na fusão;
triagem, marcação, acompanhamento e chave da entrada são preservados. O novo id
vira alias da chave estável e entra em `alsoAt`. Essa lista guarda as identidades
e links observados na fusão, inclusive o anúncio original quando ele é substituído,
para não perder seu endereço. Pode incluir o anúncio que passou a ser preferido
no bloco `job`. Fontes de mesma prioridade mantêm a primeira vaga.

Se um estado já contiver várias entradas para o mesmo link de inscrição, uma
nova identidade permanece separada: o módulo não junta entradas existentes com
marcações potencialmente diferentes.

O CLI de coleta grava ao fim de cada fonte e trata Ctrl+C/SIGTERM cooperativamente:
aguarda a escrita atômica e seus blocos `finally`, sem deixar trava ou temporário.
Fontes já concluídas sobrevivem à interrupção. Interrupção forçada (SIGKILL) ou
queda de energia não executa essa limpeza.
