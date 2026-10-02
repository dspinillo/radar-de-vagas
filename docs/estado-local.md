# Pasta de dados, busca e estado

Os módulos exigem Node 20 ou mais recente e não usam dependências externas.
Todos os acessos a dados usam `~/.radar-de-vagas/` por padrão. A variável
`RADAR_DATA_DIR` aceita um caminho absoluto alternativo. Nos testes, cada caso
passa `dataDir` apontando para uma pasta temporária. Caminhos dentro deste
repositório, inclusive por links simbólicos, são recusados antes de criar arquivos.

## Busca

Campos opcionais: `tetoTriagemPorRodada` é inteiro positivo (padrão do comando
`pending`: 30); `agente` aceita `claude` ou `codex`. Sem `agente`, `triage-run`
explica como ligar e encerra com sucesso. `null` não equivale a campo ausente.

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
  não vazio, `next` é texto ou `null`, e `notes` é texto. Campos opcionais omitidos
  são preservados pela releitura sob trava; no primeiro registro usam `null` e texto vazio.

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

## Comandos das F2 a F5

Todos partem de `node bin/radar.mjs`. Erros de uso retornam código 2; falhas de
execução retornam 1. `triage-run` repassa o código do agente; interrupção retorna 130.

| Comando | Resultado |
|---|---|
| `paths` | JSON `{ dataDir, profile, search, ruler, resumes, interviews }`; inicializa busca e cria `curriculos/` e `entrevistas/`, sem inventar perfil ou régua |
| `pending [--limit N]` | JSON de `{ id, job, seen }`, só vagas sem triagem e marcação; primeira coleta mais recente primeiro; descrição inteira; informa o restante em stderr |
| `show <id>` | JSON do envelope inteiro, reconhecendo aliases |
| `triage <id> --fit <1 a 5> --reason "texto" [--alert "texto"]...` | Grava via `setTriage`; sem alertas, usa lista vazia |
| `discards` | JSON de `{ id, title, company, cutReason, markedAt }` dos descartes |
| `track <id> --stage "texto" [--next "texto"] [--notes "texto"]` | Grava via `setTracking`; campos omitidos são preservados; `--clear-next` e `--clear-notes` limpam explicitamente |
| `triage-run` | Chama `claude -p` ou `codex exec` no repositório, com stdin fechado, prompt da skill e `RADAR_DATA_DIR` preservado |
| `schedule on [--hours 6]`, `schedule off`, `schedule status` | Liga, remove ou consulta a tarefa do usuário |

Opções com texto aceitam valores literais iniciados por `--`, separados ou com `=`.
Não combine `--next` com `--clear-next`, nem `--notes` com `--clear-notes`.

A página exibe o ID com botão de cópia, inclusive após inscrevi.
A página ordena por estrelas, depois publicação e primeira coleta. Vagas sem
triagem ficam no fim. Em vagas com inscrevi, a própria linha mostra etapa e próximo
passo e permite editar etapa, próximo passo e notas. `POST /api/jobs/:id/tracking`
recebe `{ stage, next?, notes? }`, grava com `setTracking` e aplica as mesmas
proteções de Host, origem, JSON e tamanho do corpo da rota `mark`.

## Agendamento

O intervalo é um inteiro de 1 a 744 horas (limite de 31 dias do Windows), padrão 6.
O Mac usa `~/Library/LaunchAgents/com.radar-de-vagas.collect.plist`, `StartInterval`
e `RunAtLoad`. O Windows registra a tarefa `Radar de Vagas` a partir de
`agendamento.xml` em UTF-16, com repetição ilimitada e `StartWhenAvailable`.
A tarefa roda na conta da pessoa, sem privilégio elevado ou senha armazenada.

A máquina desligada não roda. No Mac, entrar na conta carrega a tarefa e dispara
uma rodada; no Windows, a execução perdida fica disponível ao retornar à sessão.
No Mac, `StartInterval` não recupera intervalos perdidos durante suspensão;
`RunAtLoad` cobre o carregamento da tarefa após ligar e entrar na conta.
Comportamentos nativos descritos na [documentação do launchd](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html)
e no [schema do Agendador de Tarefas](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-schema).

`src/scheduled-run.mjs` roda coleta e depois triagem, inclusive quando a coleta
falha (a fila anterior ainda pode ser julgada); interrupção da coleta cancela a
rodada. Saída, erros e códigos ficam em `agendamento.log`, dentro da pasta de dados.
O agente precisa estar instalado, autenticado e autorizado a executar a skill e
gravar nessa pasta em modo não interativo. O comando não muda suas permissões.
Ao ligar, o radar resolve e valida Node e o agente configurado antes de substituir
a tarefa. O PATH inclui as pastas dos executáveis; RADAR_DATA_DIR é propagada
quando definida. O plist guarda o ambiente; o XML passa os valores como argumentos
ao executor, que os aplica antes de iniciar a rodada.

`agendamento.lock` guarda o PID ativo. Uma nova rodada sai sem coletar nem triar
e registra a sobreposição no log. Travas de processos mortos são recuperadas;
PID inválido exige idade mínima de 30 segundos. Processos vivos nunca são
considerados antigos só pelo tempo. Quando o log supera 1 MiB, o executor mantém
cerca de 256 KiB finais no mesmo arquivo, inclusive durante a saída do agente.

`off` para e remove a tarefa e seus arquivos plist/XML; preserva dados e log.
`status` consulta o agendador, informa se está ligado e, no Windows, a próxima
execução informada pelo sistema. No Mac, não inventa previsão para `StartInterval`.
Existe uma tarefa por conta: ligar novamente substitui o intervalo e a pasta
anterior. Após mover o repositório ou o Node, ligue novamente para atualizar os caminhos.

Geração de plist/XML é pura; execução de `launchctl`/`schtasks` e spawn do agente
são injetáveis. Testes usam diretórios temporários e agendadores/agentes simulados,
sem rede externa nem instalação real. Validação nativa de ponta a ponta nos dois
sistemas permanece pendente.
