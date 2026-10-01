# Radar de Vagas · Roadmap

> Atualizado em **2026-10-01**. Fonte de verdade do que ENTROU: `CHANGELOG.md`.
> Legenda: ✅ feito · 🟡 parcial · ▶️ próximo · ⏸️ aguardando · 🔒 bloqueado · ⬜ não iniciado

## Já entregue (resumo)

Nada ainda.

## Marco atual

▶️ **F0 · plano visual.** Fecha com o plano aprovado e as decisões em aberto respondidas.

## Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| F0 | Plano visual | Plano aprovado e repositório criado com a documentação. |
| F1 | Coleta e radar local | Com uma busca de exemplo, a coleta traz vagas reais de pelo menos quatro fontes e a página local mostra a tabela com inscrevi e descartar com motivo. |
| F2 | Onboarding e triagem | A entrevista gera perfil e busca sem editar arquivo à mão. Cada vaga nova sai com estrelas, motivo e alertas. Inclui revisão do currículo e do LinkedIn. |
| F3 | Memória de descarte | Um motivo escrito hoje aparece como ponto de atenção numa vaga parecida amanhã, sem cortá-la. |
| F4 | Agendamento | Rodar a cada seis horas funciona em Mac e Windows, a execução perdida roda quando a máquina liga e um comando desliga tudo. |
| F5 | Lançamento 0.1 | Alguém de fora instala em menos de dez minutos seguindo só o README. Vídeo de demonstração publicado. |
| F6 | Mais fontes | Novas fontes por empresa e por termo, com guia para contribuir com uma fonte. |
| F7 | Preenchimento assistido | O agente abre o formulário, preenche com o perfil e para antes do enviar. |

## F1 · tarefas

| Tarefa | Objetivo | Critério de aceite | Depende de |
|---|---|---|---|
| T1.1 | Formato da vaga e contrato de fonte | Documento e validação do formato único (fonte, empresa, título, local, modelo, descrição inteira, link, data). Teste com vaga de exemplo passa. | nenhuma |
| T1.2 | Pasta de dados e arquivo de busca | `~/.radar-de-vagas/` é criada na primeira execução com uma busca de exemplo fictícia. Nada é gravado dentro do repositório. | T1.1 |
| T1.3 | Fontes por termo: Gupy e LinkedIn | Cada uma traz vagas reais pelos termos da busca, com descrição completa. LinkedIn respeita intervalo entre chamadas e pode ser desligado. | T1.1, T1.2 |
| T1.4 | Fontes por empresa: Greenhouse, Lever, Ashby, InHire | Leem uma lista de empresas em arquivo. Incluir empresa nova não exige mexer em código. | T1.1, T1.2 |
| T1.5 | Estado e deduplicação | Rodar duas vezes não duplica vaga. Uma vaga já marcada nunca tem a marcação sobrescrita por uma coleta nova. | T1.3 ou T1.4 |
| T1.6 | Página do radar | Um comando abre a tabela no navegador. Inscrevi e descartar com motivo gravam no estado e sobrevivem a fechar e reabrir. | T1.5 |
| T1.7 | Guarda de privacidade | Uma checagem roda antes de cada commit e no GitHub e falha se encontrar e-mail, telefone, CPF ou caminho de usuário no repositório. | nenhuma |
| T1.8 | README de instalação | Passo a passo para Mac e Windows, testado do zero numa pasta limpa. | T1.6 |

## Precisa de decisão

- ⏸️ **LinkedIn ligado ou desligado de fábrica.** Proposta: desligado, a pessoa liga na entrevista depois de ler o aviso de que é raspagem e pode ser bloqueado.
- ⏸️ **Teto de vagas julgadas por rodada.** Cada triagem consome a assinatura da pessoa. Proposta: teto configurável, o resto fica na fila.
- ⏸️ **Quem testa no Windows** antes do lançamento.

## Backlog (sem compromisso)

- ⬜ Busca em posts do LinkedIn, que pega vaga anunciada pelo gestor no próprio perfil.
- ⬜ Folha de respostas por vaga (as perguntas do formulário já respondidas com o perfil).
- ⬜ Lista comunitária de empresas brasileiras por ATS.
