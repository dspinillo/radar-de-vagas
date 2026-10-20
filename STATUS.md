# Radar de Vagas · Status

> Atualize ao final de cada sessão. Última atualização: **2026-10-20** · frente ativa: lançamento da 0.1 · versão 0.1.0
> Legenda: ✅ feito · 🟡 parcial · ▶️ próximo · ⏸️ aguardando · 🔒 bloqueado · ⬜ não iniciado

## Estado atual (leia primeiro)

A versão 0.1.0 está com o código de F1 a F5 entregue: coleta em seis fontes, página local, comandos para o agente, cinco skills (onboarding, triagem com memória de descarte, currículo por vaga, entrevista e acompanhamento) e agendamento. O que falta não é código: uso com pessoa e perfil reais, validação no Windows e o lançamento em si.

| Bloco | Estado |
|---|---|
| F0 · plano visual | ✅ |
| F1 · coleta e radar local | 🟡 |
| F2 · onboarding e triagem | 🟡 |
| F3 · memória de descarte | 🟡 |
| F4 · agendamento | 🟡 |
| F5 · candidatura e entrevista | 🟡 |
| F6 · lançamento 0.1 | 🟡 |
| F7 · mais fontes | ⬜ |
| F8 · folha de respostas e preenchimento assistido | ⬜ |

## Onde paramos (última sessão)

- **Feito nesta sessão (2026-10-20):** correção da issue #1 (usuário só recebia vagas da Gupy). O LinkedIn tratava HTTP 429 como bloqueio e desistia da fonte; agora espera 5, 15 e 30 s (ou `Retry-After`, teto de 60 s) antes de parar. A listagem também para de paginar quando o teto de detalhes enche (antes ia até a página 100). A espera é interrompida se a coleta for cancelada. Suíte: 310 testes passando, guarda limpa.
- **Validado:** coleta real no LinkedIn com pasta de dados temporária e teto de 40: o 429 apareceu na página 3, a nova tentativa passou, 40 vagas em 1min05 (antes 4min40). Tester independente aprovou os critérios e achou a espera que não respeitava o cancelamento, já corrigida.
- **Não commitado.** Resposta à issue #1 rascunhada, não postada.
- **Próxima ação:** ▶️ commit e push com o ok do mantenedor, responder a issue #1. Depois, comando `descobrir` (acha o identificador da empresa nos ATS) e catálogo de empresas, que dependem de decisão do mantenedor.

## Histórico de sessões

<details>
<summary>2026-10-06 e 2026-10-08 · setup e Linux</summary>

- **Feito nesta sessão (2026-10-06):** primeiro uso simplificado depois de uma instalação no Linux. Comando `setup` (`npm run setup`), agendamento no Linux por timer do systemd de usuário, README reescrito em torno de um Começo rápido de três passos, referência movida para `docs/referencia.md`, skill de onboarding ajustada. Suíte: 306 testes passando, guarda de privacidade limpa.
- **Validado:** `npm run setup` e a primeira coleta com a busca de exemplo, no Mac, em cópia limpa com pasta de dados temporária.
- **Acrescentado em 2026-10-08:** seção do README para uso sem terminal, pelo app de desktop (aba Code do Claude e app do Codex). Publicado junto com o restante desta sessão.
- **Não validado:** uso pelo app de desktop; agendamento no Linux em máquina real (só `systemctl` injetado nos testes); onboarding com pessoa; tudo no Windows.
- **Dívidas:** as anteriores continuam. No Mac e no Linux, `schedule status` não informa a próxima execução.
- **Próxima ação:** ▶️ o mantenedor refaz a instalação no Linux seguindo só o Começo rápido, roda `schedule on` e confere com `systemctl --user list-timers`. Depois, onboarding com o próprio perfil, Windows e o lançamento.

</details>

<details>
<summary>2026-10-02 (segunda parte) · 0.1.0</summary>

- **Feito nesta sessão (segunda parte):** comandos `paths`, `pending`, `show`, `triage`, `discards`, `track`, `triage-run` e `schedule`; cinco skills em `skills/`; manifesto do plugin do Claude Code e `AGENTS.md` para o Codex; página com estrelas, motivo, alertas, identificador com botão de copiar e etapa da candidatura. Suíte: 300 testes passando, guarda de privacidade limpa.
- **Validado com agente real (Codex, perfil fictício, pasta de dados temporária):** a triagem gravou estrelas, motivo e alertas pelos comandos e não tocou em marcação; um descarte anterior virou alerta de memória em vaga parecida e entrou na régua como observação; currículo por vaga e página de entrevista foram gerados sem nada de fora do perfil, com as lacunas listadas.
- **Validado de verdade no Mac:** `schedule on` instalou no launchd, a rodada disparou sozinha, gravou o log, e `schedule off` não deixou resto.
- **Medido:** triagem de 4 vagas no esforço máximo do agente levou 8 minutos; com esforço médio e limite de alertas, 3 vagas levaram 71 segundos.
- **Corrigido por achado de Tester independente:** `track` apagava próximo passo e anotações, valor iniciado por `--` era recusado, comando de instalação do plugin no README, PATH da execução agendada, log sem limite, identificador ausente na página.
- **Não validado:** onboarding (é entrevista com pessoa); impressão em PDF dos documentos; qualquer coisa no Windows; `triage-run` com o Claude (só com o Codex).
- **Dívidas:** as da F1 continuam (página embute descrições, LinkedIn responde 429 depois de cerca de dez detalhes, busca de exemplo com empresas inventadas). No Mac, `schedule status` não informa a próxima execução.
- **Próxima ação:** ▶️ o mantenedor roda o onboarding com o próprio perfil, uma coleta e uma triagem reais, e anota o que a triagem errou. Depois, Windows e o lançamento.

</details>

<details>
<summary>2026-10-02 (primeira parte) · F1 publicada</summary>

- **Feito nesta sessão (código):** T1.2 (pasta de dados, arquivo de busca, módulo de estado), T1.3 e T1.4 (Gupy, LinkedIn, Greenhouse, Lever, Ashby, InHire), T1.5 (coleta e deduplicação), T1.6 (página e comando `open`) e T1.8 (README). Suíte: 266 testes passando, guarda de privacidade limpa.
- **Validado em uso real (pasta de dados temporária, busca com empresas reais fora do repositório):** as seis fontes trouxeram vagas com descrição inteira; segunda coleta não duplica; descartar com motivo pela página grava e sobrevive a nova coleta; descartar sem motivo devolve 400 e POST de outra origem devolve 403. Passo a passo do Mac no README validado em cópia limpa.
- **Corrigido por achado de Tester independente:** lacuna em lista de alertas, byte inválido no estado, trava esquecida por processo interrompido, paginação da Gupy, falso bloqueio do LinkedIn, descrição truncada por comentário HTML, página com situação velha após marcar, `lastSeenAt` congelado, fonte que nunca responde, contagem de novas em coletas simultâneas.
- **Corrigido por achado em uso real:** primeira coleta levava minutos em silêncio. Agora filtra idade na listagem, busca detalhes em paralelo (4), tem teto de detalhes novos por fonte (`detalhesNovosPorFonte`, padrão 150), mostra progresso e grava ao fim de cada fonte. Rodada com a busca de exemplo: cerca de 26 s.
- **Publicado:** commit e push feitos; a partir de um clone público limpo, os 266 testes passam e a primeira coleta traz 149 vagas da Gupy com a busca de exemplo. Workflow do GitHub verde.
- **Pendente:** validação do README no Windows.
- **Dívidas:** a página embute as descrições (cerca de 470 KB com 78 vagas), vai pesar com milhares; LinkedIn responde 429 depois de cerca de dez detalhes na mesma rodada; a busca de exemplo usa empresas inventadas, então só a Gupy traz vaga real antes de a pessoa editar o arquivo; a guarda abre um processo git por arquivo; identificador numérico de 11 dígitos pode ser acusado como celular.
- **Próxima ação:** ▶️ fatiar a F2 (onboarding e triagem) em tarefas T2.x.

</details>

<details>
<summary>2026-10-01 · F0 aprovada, T1.1 e T1.7</summary>

- **Feito nesta sessão (código):** T1.7 e T1.1, cada uma com Builder, Tester independente e correções. Suíte completa: 82 testes passando. Decisão 0003 registrada.
- **Feito (plano):** plano da F0, documentação N3 e repositório público criado. Dezenove portais testados sem login para saber quais respondem (resultado em `ARCHITECTURE.md`).
- **Validado:** só a resposta dos endereços das fontes. Nenhuma fonte foi implementada.
- **Decidido:** LinkedIn desligado de fábrica, teto de vagas por rodada como pergunta do onboarding, e a fase F5 (acompanhamento, currículo por vaga e munição de entrevista).
- **Pendente:** T1.2 a T1.6 e T1.8. Sem validação em Windows e sem execução real do workflow no GitHub até o primeiro push com ele.
- **Dívidas:** a guarda abre um processo git por arquivo (cerca de 6 s com 500 arquivos); identificador numérico de 11 dígitos pode ser acusado como celular.
- **Próxima ação:** ▶️ T1.2 (pasta de dados e arquivo de busca) e o módulo de estado da decisão 0003; em seguida as fontes (T1.3 e T1.4).

</details>
