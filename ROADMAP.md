# Radar de Vagas · Roadmap

> Atualizado em **2026-10-02**. Fonte de verdade do que ENTROU: `CHANGELOG.md`.
> Legenda: ✅ feito · 🟡 parcial · ▶️ próximo · ⏸️ aguardando · 🔒 bloqueado · ⬜ não iniciado

## Já entregue (resumo)

- ✅ F0 · plano visual aprovado em 2026-10-01.

## Marco atual

🟡 **Lançamento da 0.1.** Código de F1 a F5 entregue; o que falta está na tabela "F2 a F6" abaixo e depende de uso real e de Windows.

🟡 **F1 · coleta e radar local.** Código entregue em 2026-10-02 (T1.2 a T1.6). Publicado. Falta validar o README no Windows (T1.8). Fecha quando a coleta traz vagas reais de pelo menos quatro fontes e a página local grava inscrevi e descartar com motivo.

## Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| F0 | Plano visual | Plano aprovado e repositório criado com a documentação. |
| F1 | Coleta e radar local | Com uma busca de exemplo, a coleta traz vagas reais de pelo menos quatro fontes e a página local mostra a tabela com inscrevi e descartar com motivo. |
| F2 | Onboarding e triagem | A entrevista gera perfil e busca sem editar arquivo à mão. Cada vaga nova sai com estrelas, motivo e alertas. Inclui revisão do currículo e do LinkedIn. |
| F3 | Memória de descarte | Um motivo escrito hoje aparece como ponto de atenção numa vaga parecida amanhã, sem cortá-la. |
| F4 | Agendamento | Rodar a cada seis horas funciona em Mac e Windows, a execução perdida roda quando a máquina liga e um comando desliga tudo. |
| F5 | Candidatura e entrevista | Depois do inscrevi, a vaga entra no acompanhamento, com status e próximo passo. Um pedido gera o currículo ajustado à vaga, e marcar entrevista gera a página única de munição. Nada nos dois documentos vem de fora do perfil. |
| F6 | Lançamento 0.1 | Alguém de fora instala em menos de dez minutos seguindo só o README. Vídeo de demonstração publicado. |
| F7 | Mais fontes | Novas fontes por empresa e por termo, com guia para contribuir com uma fonte. |
| F8 | Folha de respostas e preenchimento assistido | A folha de respostas do formulário sai pronta para revisar e colar. O preenchimento no navegador só entra se resistir a marcação de formulário, captcha e regras das plataformas, e sempre para antes do enviar. |

## F2 a F6 · entregue em 2026-10-02 (versão 0.1.0)

O julgamento ficou em skills de markdown (`skills/`); o código são comandos finos sobre o estado, o agendamento e a página.

| Fase | Estado | Entregue | Falta |
|---|---|---|---|
| F2 | 🟡 | Skills de onboarding e triagem; comandos `paths`, `pending`, `show`, `triage`; página com estrelas, motivo e alertas. Triagem validada com agente real e perfil fictício. | Onboarding com pessoa real; calibrar a triagem com perfil e vagas reais. |
| F3 | 🟡 | Comando `discards` e memória de descarte na skill de triagem. Em rodada real, um descarte virou alerta em vaga parecida, sem cortar. | Observar o aprendizado ao longo de várias rodadas. |
| F4 | 🟡 | `schedule on`, `off` e `status`. Validado de verdade no Mac (launchd). | Validar no Windows (Agendador de Tarefas). |
| F5 | 🟡 | Skills de currículo por vaga, entrevista e acompanhamento; comando `track`; etapa e próximo passo na página. Os dois documentos foram gerados com agente real e nada saiu de fora do perfil. | Conferir a impressão em PDF; uso com perfil real. |
| F6 | 🟡 | Versão 0.1.0, README com instalação do plugin e fluxo de uso. | Alguém de fora instalar em menos de dez minutos; vídeo de demonstração. |

## F1 · tarefas

| Tarefa | Objetivo | Critério de aceite | Depende de |
|---|---|---|---|
| T1.1 ✅ | Formato da vaga e contrato de fonte | Documento e validação do formato único (fonte, empresa, título, local, modelo, descrição inteira, link, data). Teste com vaga de exemplo passa. | nenhuma |
| T1.2 ✅ | Pasta de dados e arquivo de busca | `~/.radar-de-vagas/` é criada na primeira execução com uma busca de exemplo fictícia. Nada é gravado dentro do repositório. | T1.1 |
| T1.3 ✅ | Fontes por termo: Gupy e LinkedIn | Cada uma traz vagas reais pelos termos da busca, com descrição completa. LinkedIn respeita intervalo entre chamadas e pode ser desligado. | T1.1, T1.2 |
| T1.4 ✅ | Fontes por empresa: Greenhouse, Lever, Ashby, InHire | Leem uma lista de empresas em arquivo. Incluir empresa nova não exige mexer em código. | T1.1, T1.2 |
| T1.5 ✅ | Estado e deduplicação | Rodar duas vezes não duplica vaga. Uma vaga já marcada nunca tem a marcação sobrescrita por uma coleta nova. | T1.3 ou T1.4 |
| T1.6 ✅ | Página do radar | Um comando abre a tabela no navegador. Inscrevi e descartar com motivo gravam no estado e sobrevivem a fechar e reabrir. | T1.5 ✅ |
| T1.7 ✅ | Guarda de privacidade | Uma checagem roda antes de cada commit e no GitHub e falha se encontrar e-mail, telefone, CPF ou caminho de usuário no repositório. | nenhuma |
| T1.8 🟡 | README de instalação | Passo a passo para Mac e Windows, testado do zero numa pasta limpa. | T1.6 ✅ |

## Decidido em 2026-10-01

- ✅ **LinkedIn desligado de fábrica.** O onboarding pergunta se a pessoa quer ligar, depois de explicar que é raspagem de endereço público e que pode ser bloqueado.
- ✅ **Teto de vagas julgadas por rodada.** É pergunta do onboarding, com os riscos explicados: cada vaga julgada consome a assinatura do agente, e um teto baixo deixa vagas na fila para a rodada seguinte.
- ✅ **Windows.** O mantenedor testa antes do lançamento (critério da F4 e da F6).

## Precisa de decisão

Nada em aberto.

## Backlog (sem compromisso)

- ⬜ Busca em posts do LinkedIn, que pega vaga anunciada pelo gestor no próprio perfil.
- ⬜ Lista comunitária de empresas brasileiras por ATS.
