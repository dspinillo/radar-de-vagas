# Radar de Vagas · Status

> Atualize ao final de cada sessão. Última atualização: **2026-10-02** · frente ativa: F1 · HEAD: `3dcff2b` (código da F1) publicado
> Legenda: ✅ feito · 🟡 parcial · ▶️ próximo · ⏸️ aguardando · 🔒 bloqueado · ⬜ não iniciado

## Estado atual (leia primeiro)

A F1 está com o código completo: seis fontes, coleta com estado e deduplicação, página local e README. `node bin/radar.mjs collect` e `node bin/radar.mjs open` funcionam de ponta a ponta. Publicado em 2026-10-02, com o workflow do GitHub verde. Falta validar o README no Windows.

| Bloco | Estado |
|---|---|
| F0 · plano visual | ✅ |
| F1 · coleta e radar local | 🟡 |
| F2 · onboarding e triagem | ▶️ |
| F3 · memória de descarte | ⬜ |
| F4 · agendamento | ⬜ |
| F5 · candidatura e entrevista | ⬜ |
| F6 · lançamento 0.1 | ⬜ |
| F7 · mais fontes | ⬜ |
| F8 · folha de respostas e preenchimento assistido | ⬜ |

## Onde paramos (última sessão)

- **Feito nesta sessão (código):** T1.2 (pasta de dados, arquivo de busca, módulo de estado), T1.3 e T1.4 (Gupy, LinkedIn, Greenhouse, Lever, Ashby, InHire), T1.5 (coleta e deduplicação), T1.6 (página e comando `open`) e T1.8 (README). Suíte: 266 testes passando, guarda de privacidade limpa.
- **Validado em uso real (pasta de dados temporária, busca com empresas reais fora do repositório):** as seis fontes trouxeram vagas com descrição inteira; segunda coleta não duplica; descartar com motivo pela página grava e sobrevive a nova coleta; descartar sem motivo devolve 400 e POST de outra origem devolve 403. Passo a passo do Mac no README validado em cópia limpa.
- **Corrigido por achado de Tester independente:** lacuna em lista de alertas, byte inválido no estado, trava esquecida por processo interrompido, paginação da Gupy, falso bloqueio do LinkedIn, descrição truncada por comentário HTML, página com situação velha após marcar, `lastSeenAt` congelado, fonte que nunca responde, contagem de novas em coletas simultâneas.
- **Corrigido por achado em uso real:** primeira coleta levava minutos em silêncio. Agora filtra idade na listagem, busca detalhes em paralelo (4), tem teto de detalhes novos por fonte (`detalhesNovosPorFonte`, padrão 150), mostra progresso e grava ao fim de cada fonte. Rodada com a busca de exemplo: cerca de 26 s.
- **Publicado:** commit e push feitos; a partir de um clone público limpo, os 266 testes passam e a primeira coleta traz 149 vagas da Gupy com a busca de exemplo. Workflow do GitHub verde.
- **Pendente:** validação do README no Windows.
- **Dívidas:** a página embute as descrições (cerca de 470 KB com 78 vagas), vai pesar com milhares; LinkedIn responde 429 depois de cerca de dez detalhes na mesma rodada; a busca de exemplo usa empresas inventadas, então só a Gupy traz vaga real antes de a pessoa editar o arquivo; a guarda abre um processo git por arquivo; identificador numérico de 11 dígitos pode ser acusado como celular.
- **Próxima ação:** ▶️ fatiar a F2 (onboarding e triagem) em tarefas T2.x.

## Histórico de sessões

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
