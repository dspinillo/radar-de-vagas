# Radar de Vagas · Arquitetura

> Atualizado em **2026-10-02** · coleta, estado, página, comandos de triagem e acompanhamento e agendamento implementados. Decisões com porquê: `decisions/`.

## 1. Camadas

```
Pessoa ── entrevista ──> Onboarding (skill do agente) ──> Pasta de dados
                                                              │
Agendador do sistema ──> Coleta (scripts Node) <── Fontes     │
                              │                               │
                              └── vagas novas ──> Triagem (agente, modo não interativo)
                                                              │
                                    estrelas, motivo, alertas ▼
                         Página do radar <── Servidor local <── Pasta de dados
                               │
                               └── inscrevi, descartar com motivo ──> Pasta de dados ──> régua
```

A coleta é script e roda sem agente. O julgamento é do agente, que lê a descrição inteira de cada vaga contra o perfil e a régua.

## 2. Componentes

| Componente | Responsabilidade | Onde |
|---|---|---|
| Formato da vaga | Validar a vaga, limpar HTML, derivar identificador e chave de possível duplicata | `src/job.mjs` |
| Fontes | Buscar vagas de um portal e devolver no formato único | `src/sources/` (um arquivo por fonte, registro em `index.mjs`) |
| Coleta | Rodar as fontes ligadas, deduplicar e gravar as novas | `src/collect.mjs` |
| Estado | Ler e gravar o estado sem sobrescrever marcações | `src/state.mjs` |
| Servidor local | Servir a página e receber marcação e acompanhamento, só na própria máquina | `src/page/server.mjs`  |
| Página do radar | Tabela por estrelas e data, inscrevi, descarte e acompanhamento | `src/page/`  |
| Comandos | Consultar caminhos, fila, envelope e descartes; gravar triagem e acompanhamento pelos setters | `bin/radar.mjs`, `src/commands.mjs` |
| Onboarding | Entrevistar a pessoa e gravar perfil e busca | `skills/` |
| Triagem | Dar estrelas, motivo e alertas a cada vaga nova | `skills/` |
| Execução da triagem | Chamar `claude -p` ou `codex exec` com o prompt da skill e o caminho do repositório | `src/triage-run.mjs` |
| Agendamento | Registrar, consultar e remover tarefa; executar coleta seguida de triagem com log local | `src/schedule.mjs`, `src/scheduled-run.mjs` (real; validação nativa em Mac e Windows pendente) |
| Currículo por vaga | Montar o currículo ajustado a uma vaga a partir do perfil | `skills/` |
| Munição de entrevista | Montar a página única de preparo para uma entrevista | `skills/` |
| Guarda de privacidade | Barrar dado pessoal antes do commit | `scripts/` |

## 3. Persistência

Tudo em `~/.radar-de-vagas/`, fora do repositório clonado.

| Arquivo | Conteúdo | Quem escreve |
|---|---|---|
| `perfil.md` | Quem a pessoa é, casos, entregas, currículo resumido | Onboarding |
| `busca.json` | Termos, nível, localidade, modelo, idiomas, faixa por regime, fontes ligadas | Onboarding |
| `regua.md` | Pontos de atenção aprendidos com os descartes | Triagem |
| `estado.json` | Vagas, triagem de cada uma e marcações da pessoa | Coleta, triagem, página |
| `curriculos/` | Um currículo por vaga, em HTML pronto para salvar como PDF pelo navegador | Currículo por vaga |
| `entrevistas/` | Uma página de munição por entrevista | Munição de entrevista |
| `agendamento.log` | Saída e erros; acima de 1 MiB, retém cerca de 256 KiB no mesmo arquivo | Executor agendado |
| `agendamento.lock` | PID da execução ativa; impede sobreposição | Executor agendado |
| `agendamento.xml` | Definição da tarefa do Windows enquanto ligada | Agendamento |

Os comandos são infraestrutura das F2 a F5. Entrevista, julgamento, memória de descarte,
currículo e munição continuam sendo responsabilidade das skills, sem heurísticas no código.
As empresas acompanhadas ficam em `busca.json`. `track` mescla campos omitidos sob
a trava do estado; `--clear-next` e `--clear-notes` limpam explicitamente. O ID de
cada vaga aparece na tabela com botão de cópia.

Ao ligar a agenda, Node e o agente configurado são resolvidos e validados antes
de substituir uma tarefa existente. O plist guarda PATH e, quando definida,
RADAR_DATA_DIR no ambiente. O XML do Windows passa esses valores ao executor
como argumentos, que os aplica antes da coleta e da triagem. O PATH inclui as
pastas de ambos os executáveis. A trava agendada verifica o PID, preserva
processos vivos independentemente da idade e recupera processos encerrados;
travas sem PID válido só são recuperadas após 30 segundos.

## 4. Integrações externas

Teste de 2026-10-01, sem login. Mediu se o endereço responde, não a qualidade das vagas.

| Fonte | Como busca | Resposta | Fase |
|---|---|---|---|
| Gupy | por termo | dados abertos | F1 |
| LinkedIn | por termo | aberto, pode ser bloqueado | F1 |
| Greenhouse, Lever, Ashby | por empresa | dados abertos | F1 |
| InHire | por empresa | dados abertos | F1 |
| SmartRecruiters, Workable, Teamtailor | por empresa | dados abertos | F7 |
| trampos.co | por termo | dados abertos | F7 |
| Remotive, RemoteOK, Himalayas, We Work Remotely | por termo, vagas remotas | dados abertos | F7 |
| Vagas.com, InfoJobs, Catho, Programathor, Remotar | por termo | página abre, falta confirmar a leitura | F7 |
| Sólides, Workday, Recruitee | por empresa | não confirmado | F7 |
| Indeed, Glassdoor, Jooble | por termo | bloqueado | fora |

Nenhuma fonte usa login nem credencial da pessoa.

## 5. Estrutura de pastas

```
radar-de-vagas/
├── src/
│   ├── job.mjs      # formato da vaga
│   ├── sources/     # uma fonte por arquivo
│   ├── collect.mjs
│   ├── state.mjs
│   ├── commands.mjs
│   ├── triage-run.mjs
│   ├── schedule.mjs
│   ├── scheduled-run.mjs
│   └── page/         # servidor, página, estilos e testes
├── bin/radar.mjs     # comandos
├── skills/          # onboarding, triagem, acompanhamento, curriculo-por-vaga, entrevista
├── examples/        # perfil e busca fictícios
├── scripts/         # guarda de privacidade
└── test/
```

## 6. Build & tooling

Node 20 ou superior, sem dependências de terceiros. Testes com `node --test`. Agendamento pelo launchd no Mac e pelo Agendador de Tarefas no Windows.
