# Radar de Vagas

> Um agente que conhece o seu repertório, varre os portais de vagas, ranqueia o que encontrou e aprende com cada descarte. Quem decide se aplica é você.
>
> **Tipo:** misto (plugin de agente, scripts e página local) · **Nível:** N3 · **Stack:** Node 20+ sem dependências · **Licença:** MIT

**Estado: em planejamento.** Ainda não há código para rodar. O que existe hoje é o plano, descrito em `PRD.md`, `ARCHITECTURE.md` e `ROADMAP.md`.

## Visão

Procurar emprego virou trabalho de varredura: abrir cinco portais por dia, ler anúncios longos e descobrir no último parágrafo que a vaga exige algo que você não tem. O Radar de Vagas faz essa varredura por você e entrega uma tabela só, com as vagas novas ordenadas por encaixe.

Ele começa com uma entrevista: quem você é, seus casos e entregas, seu currículo, onde quer trabalhar, em que modelo, que idiomas fala e que faixa salarial aceita. A partir daí coleta vagas em vários portais, lê a descrição inteira de cada uma e devolve estrelas, o motivo e os alertas. Quando você descarta uma vaga e escreve o porquê, isso vira memória: a próxima vaga com o mesmo ponto chega avisada.

O que ele **não** é: não se candidata por você, não esconde vaga por conta própria e não manda seus dados para lugar nenhum. Perfil, currículo e histórico ficam numa pasta da sua máquina, fora deste repositório.

## Como vai funcionar

1. Você clona o repositório e abre no Claude Code ou no Codex.
2. O agente faz a entrevista e grava seu perfil em `~/.radar-de-vagas/`.
3. A coleta roda quando você pedir ou no horário que você agendar (por exemplo, a cada seis horas).
4. A página do radar abre no navegador com as vagas novas, as estrelas e os alertas.
5. Você marca **inscrevi** ou **descartar**, com o motivo. O radar aprende.
6. Para a vaga que vale a pena, o agente monta o currículo ajustado a ela. Quando aparecer entrevista, monta uma página única de preparo. Os dois usam só o que está no seu perfil.

Sem agente instalado, a coleta e a página funcionam só com Node. Você vê as vagas, mas sem estrelas nem alertas.

## Mapa do projeto

```
radar-de-vagas/
├── README.md         # este arquivo
├── PRD.md            # o produto: princípios, escopo, riscos
├── ARCHITECTURE.md   # como as peças se encaixam
├── ROADMAP.md        # fases e tarefas
├── STATUS.md         # onde paramos
├── HANDOFF.md        # como retomar
├── CHANGELOG.md      # o que entrou de fato
├── CONTEXT.md        # vocabulário do projeto
├── LESSONS.md        # o que aprendemos na marra
├── CLAUDE.md         # instruções para agentes (AGENTS.md aponta para cá)
└── decisions/        # decisões com o porquê
```

## Como rodar

Ainda não há o que rodar. As instruções de instalação para Mac e Windows entram na tarefa T1.8 (ver `ROADMAP.md`).

## Privacidade

Este repositório não contém dado pessoal de ninguém e não pode conter. Os exemplos são fictícios. Antes de contribuir, leia a seção de privacidade em `CLAUDE.md`.
