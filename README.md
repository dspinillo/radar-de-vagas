# Radar de Vagas

> Um agente que conhece o seu repertório, varre os portais de vagas, ranqueia o que encontrou e aprende com cada descarte. Quem decide se aplica é você.
>
> **Tipo:** misto (plugin de agente, scripts e página local) · **Nível:** N3 · **Stack:** Node 20+ sem dependências · **Licença:** MIT

**Versão 0.1.0.** Coleta, radar local, sete skills, triagem, acompanhamento, folha de respostas e agendamento implementados. Para instalar, vá direto ao [Começo rápido](#começo-rápido).

## Visão

Procurar emprego virou trabalho de varredura: abrir cinco portais por dia, ler anúncios longos e descobrir no último parágrafo que a vaga exige algo que você não tem. O Radar de Vagas faz essa varredura por você e entrega uma tabela só, com as vagas novas ordenadas por encaixe.

Ele começa com uma entrevista: quem você é, seus casos e entregas, seu currículo, onde quer trabalhar, em que modelo, que idiomas fala e que faixa salarial aceita. A partir daí coleta vagas em vários portais, lê a descrição inteira de cada uma e devolve estrelas, o motivo e os alertas. Quando você descarta uma vaga e escreve o porquê, isso vira memória: a próxima vaga com o mesmo ponto chega avisada.

O que ele **não** é: não se candidata sem você mandar, não esconde vaga por conta própria e não manda seus dados para lugar nenhum. Perfil, currículo e histórico ficam numa pasta da sua máquina, fora deste repositório.

## Como funciona

1. Você clona o repositório, roda `npm run setup` e abre no Claude Code ou no Codex.
2. O agente faz a entrevista e grava seu perfil em `~/.radar-de-vagas/`.
3. A coleta roda quando você pedir ou no horário que você agendar (por exemplo, a cada seis horas).
4. A página do radar abre no navegador com as vagas novas, as estrelas e os alertas.
5. Você marca **inscrevi** ou **descartar**, com o motivo. O radar aprende.
6. Para a vaga que vale a pena, o agente monta o currículo ajustado a ela e a folha de respostas do formulário, pronta para colar. Quando aparecer entrevista, monta uma página única de preparo. Tudo usa só o que está no seu perfil.

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
├── decisions/        # decisões com o porquê
├── docs/             # referência de uso e contratos internos
└── skills/           # o julgamento do produto, em texto
```

## Começo rápido

Você precisa de **Node.js 20 ou superior** e **Git**. Funciona em Mac, Linux e Windows, e não há dependências para instalar. Para ter estrelas, alertas e entrevista de onboarding, tenha também o Claude Code ou o Codex instalado e com login feito.

> **Use com assinatura, não pela API.** O Radar foi pensado para a assinatura do Claude Code ou do Codex. Com chave de API paga por uso, cada triagem e cada documento são cobrados, e o gasto pode passar de dezenas de dólares em poucos dias. Sem nenhuma das duas assinaturas, use o [OpenCode](https://opencode.ai) com um modelo gratuito: ele lê o `AGENTS.md` e segue as mesmas skills. A triagem agendada (`triage-run`) só chama o Claude Code ou o Codex; no OpenCode, peça a triagem na conversa.

**1. Baixe e prepare.** No terminal (Terminal no Mac e no Linux, PowerShell no Windows):

```sh
git clone https://github.com/dspinillo/radar-de-vagas.git
cd radar-de-vagas
npm run setup
```

O `setup` confere o Node, cria sua pasta de dados fora do clone, procura o Claude Code e o Codex na máquina e termina dizendo o próximo passo. Pode rodar de novo sempre que tiver dúvida de onde parou.

**2. Faça o onboarding.** Ainda na pasta do clone, abra o agente (`claude` ou `codex`) e peça:

```text
Faça meu onboarding do Radar de Vagas seguindo skills/onboarding/SKILL.md
```

É uma entrevista, uma pergunta por vez: seu LinkedIn, seu currículo, suas entregas, onde e como quer trabalhar, faixa salarial e o que procurar. No fim o agente grava seu perfil e sua busca e pergunta se você quer agendar a coleta. Você não edita nenhum arquivo.

**3. Colete, julgue e veja.**

```sh
npm run collect
```

Depois, no agente, peça `Faça a triagem`. Ele lê cada vaga inteira e grava estrelas, motivo e alertas. Para ver o resultado no navegador:

```sh
npm run open
```

Na página, **inscrevi** registra que você enviou a candidatura e **descartar** pede o motivo. O motivo vira memória: a próxima vaga parecida chega avisada. Deixe o terminal aberto enquanto usa a página; **Ctrl+C** encerra.

A partir daí o ciclo é o mesmo: coletar, triar, abrir. Se você ligou o agendamento no onboarding, a coleta e a triagem rodam sozinhas.

### Sem terminal, pelo app de desktop

Se você prefere não digitar comandos, dá para fazer tudo conversando com o agente no app de desktop: a aba **Code** do app do Claude ou o app do **Codex**. O chat comum do Claude e do ChatGPT não serve, porque não roda nada na sua máquina.

O Node.js 20 e o Git continuam precisando estar instalados. Depois disso:

1. Abra o app e peça para ele trabalhar numa pasta sua (por exemplo, Documentos).
2. Peça:

```text
Clone https://github.com/dspinillo/radar-de-vagas, entre na pasta, rode npm run setup e faça meu onboarding seguindo skills/onboarding/SKILL.md
```

3. Nas vezes seguintes, abra a pasta `radar-de-vagas` no app e peça `Colete as vagas, faça a triagem e abra a página do radar`.

O agente roda os mesmos comandos do Começo rápido por você e pede sua aprovação antes de executar. Se o `setup` avisar que não encontrou o Claude Code ou o Codex, pode ignorar: ele procura a versão de terminal, e você já está dentro do agente. Para a triagem agendada rodar sozinha, a versão de terminal do agente precisa estar instalada; sem ela, a agenda só coleta e você pede a triagem pelo app.

Este caminho ainda não foi validado de ponta a ponta. Se você testar, abra uma issue contando como foi.

### Sem agente

Dá para usar só com Node. Você vê as vagas numa tabela, sem estrelas nem alertas. O `npm run setup` mostra o caminho do arquivo `busca.json`; abra num editor de texto, troque os `termos` e as empresas de exemplo pelo que procura, apague o campo `aviso` e rode `npm run collect` e `npm run open`. Os campos estão explicados em [docs/referencia.md](docs/referencia.md).

### Se algo der errado

| Sintoma | O que fazer |
|---|---|
| `npm run setup` reclama da versão | Atualize o Node para a 20 ou superior em [nodejs.org](https://nodejs.org). |
| `setup` não encontra o agente | Instale o Claude Code ou o Codex, abra um terminal novo e rode `npm run setup` de novo. |
| A coleta termina com avisos | Leia os avisos: empresa de exemplo que não existe e fonte fora do ar aparecem ali. As outras fontes seguem valendo. |
| O navegador não abre | Copie o endereço que `npm run open` imprime e cole no navegador. |
| `busca.json` inválido | O `setup` e a coleta dizem qual campo está errado. O arquivo nunca é apagado. |
| Agendamento falha no Linux | Ele usa o systemd de usuário. Em WSL ou contêiner sem systemd, fique no modo manual. |

### O que foi validado

Passo a passo conferido no Mac em cópia limpa, com agendamento real. **Linux e Windows passam nos testes automáticos, mas o agendamento ainda não foi validado em máquina real nesses dois sistemas.** O caminho pelo app de desktop (aba Code do Claude e app do Codex) também não foi validado. Se você testar, abra uma issue contando.

## Privacidade

Este repositório não contém dado pessoal de ninguém e não pode conter. Os exemplos são fictícios. Antes de contribuir, leia a seção de privacidade em `CLAUDE.md`.

## Skills

O julgamento do produto vive em sete arquivos de `skills/`, lidos pelo Claude Code e pelo Codex: onboarding, triagem com memória, currículo por vaga, folha de respostas, preenchimento assistido (experimental), entrevista e acompanhamento. Basta pedir em português, na pasta do clone:

| Você pede | O agente faz |
|---|---|
| `Faça meu onboarding do Radar de Vagas seguindo skills/onboarding/SKILL.md` | Entrevista, perfil, busca e revisão do currículo e do LinkedIn |
| `Faça a triagem` | Estrelas, motivo e alertas nas vagas novas |
| `Monte o currículo para a vaga <ID>` | Currículo ajustado à vaga, só com fatos do seu perfil |
| `Vou ter entrevista na vaga <ID>` | Página única de preparo |
| `Monte a folha de respostas da vaga <ID>` | Alertas, personalização da Gupy, habilidades, respostas abertas e dados cadastrais, prontos para colar |
| `Preencha o formulário da vaga <ID>` | Experimental: preenche no navegador e para antes do enviar, salvo ordem sua |
| `Tive novidade na vaga <ID>` | Atualiza etapa e próximo passo |

O ID aparece na linha da vaga na página, com botão **Copiar ID**.

**Preenchimento assistido é experimental.** Só funciona no Claude Code com a extensão Claude in Chrome, é a parte que mais gasta tokens e a mais frágil, porque os portais mudam o layout sem aviso. Ele nunca digita CPF, RG nem senha, não responde por você o que você não respondeu e para antes do botão de enviar, a menos que você mande enviar aquela vaga. A folha de respostas é o plano B que sempre funciona: você cola os textos no formulário.

No Claude Code, quem preferir comandos com barra pode instalar o plugin (opcional):

```sh
claude plugin marketplace add ./
claude plugin install radar-de-vagas@radar-de-vagas-local
```

Com ele, as skills viram `/radar-de-vagas:onboarding`, `/radar-de-vagas:triagem` e assim por diante.

Agendamento, campos do `busca.json`, comandos e pasta de dados estão em [docs/referencia.md](docs/referencia.md).
