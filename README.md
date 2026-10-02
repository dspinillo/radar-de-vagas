# Radar de Vagas

> Um agente que conhece o seu repertório, varre os portais de vagas, ranqueia o que encontrou e aprende com cada descarte. Quem decide se aplica é você.
>
> **Tipo:** misto (plugin de agente, scripts e página local) · **Nível:** N3 · **Stack:** Node 20+ sem dependências · **Licença:** MIT

**Estado: F1, coleta e radar local disponíveis.** Entrevista, estrelas, memória e acompanhamento ainda são planos, descritos em `PRD.md`, `ARCHITECTURE.md` e `ROADMAP.md`.

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

Pré-requisitos: **Node.js 20 ou superior**, com npm, e Git instalados. Não há dependências para instalar. Use o Terminal no Mac ou o PowerShell no Windows.

### Instalar e preparar a busca

Nos dois sistemas, confira a versão do Node, clone e entre na pasta:

```sh
node --version
git clone https://github.com/dspinillo/radar-de-vagas.git
cd radar-de-vagas
node --input-type=module -e "import { initializeDataDir } from './src/data-dir.mjs'; await initializeDataDir();"
```

A última linha cria `busca.json` com exemplos fictícios. Abra o arquivo para editar:

Mac:

```sh
nano "${RADAR_DATA_DIR:-$HOME/.radar-de-vagas}/busca.json"
```

No nano, salve com Ctrl+O, Enter e saia com Ctrl+X.

Windows (PowerShell):

```powershell
$dataDir = if ($env:RADAR_DATA_DIR) { $env:RADAR_DATA_DIR } else { Join-Path $HOME '.radar-de-vagas' }
notepad (Join-Path $dataDir 'busca.json')
```

Substitua `termos` pelo que procura. Ajuste `localidade`, `modelo` (`remoto`, `híbrido` ou `presencial`) e `idadeMaximaDias`; `null` deixa a preferência em aberto. Em `empresas`, troque os identificadores fictícios pelos identificadores das páginas de carreiras de cada fonte, ou use `[]` para não consultar aquele portal. Remova o campo `aviso` quando terminar. Salve como JSON, mantendo aspas duplas e sem vírgula após o último item.

Os campos opcionais `detalhesNovosPorFonte` (padrão **150**) e
`prazoFonteSegundos` (padrão **600**, dez minutos) aceitam inteiros positivos e
valem para cada fonte em cada rodada. O primeiro limita candidatos novos, somando
termos e empresas; o segundo limita a execução inteira da fonte. Exemplo:

```json
"detalhesNovosPorFonte": 150,
"prazoFonteSegundos": 600
```

A idade é aplicada na listagem antes dos detalhes; publicação desconhecida nunca
exclui a vaga. Não há corte local por título ou modelo. Até quatro detalhes são
processados em paralelo por fonte, mantendo o LinkedIn em série. Um aviso informa
quantas vagas ficaram para a próxima rodada por causa do teto; elas continuam
pendentes e serão tentadas nas próximas coletas. Um prazo excedido registra erro
e permite seguir para a próxima fonte.

LinkedIn vem desligado. Para ligar, mude `fontes.linkedin` para `true`. É raspagem de páginas públicas, sem login: pode sofrer bloqueios e mudanças no portal. O coletor espera entre chamadas e interrompe a fonte se encontrar uma barreira de acesso. Para desligar, volte para `false`.

### Primeira coleta e página

Depois de salvar a busca, rode nos dois sistemas:

```sh
npm run collect
npm run open
```

São equivalentes a `node bin/radar.mjs collect` e `node bin/radar.mjs open`. A coleta mostra início, páginas, detalhes N de M, conclusão, contagens e avisos por fonte; avisos precisam ser conferidos mesmo se o comando terminar normalmente. O estado é salvo ao concluir cada fonte. **Ctrl+C** durante a coleta preserva as fontes concluídas e aguarda a limpeza de trava e temporários. Vagas reencontradas atualizam a última observação sem buscar detalhes novamente. `open` imprime o endereço local e abre o navegador padrão. Deixe o terminal aberto enquanto usa a página; **Ctrl+C** encerra o servidor. Se o navegador não abrir, copie o endereço impresso.

Na tabela, **inscrevi** registra que você já enviou a candidatura. **Descartar** pede um motivo e salva a decisão. As marcações sobrevivem a fechar a página, reabrir e coletar novamente. O radar não envia candidaturas. Após outra coleta, use **Atualizar vagas** na página.

### Dados e testes

`busca.json` e `estado.json` ficam em `.radar-de-vagas` na pasta pessoal, fora do clone. A variável opcional `RADAR_DATA_DIR` escolhe outra pasta absoluta, também fora do repositório. Para testar sem usar seus dados, antes dos comandos acima:

Mac:

```sh
export RADAR_DATA_DIR="$(mktemp -d)"
```

Windows (PowerShell):

```powershell
$env:RADAR_DATA_DIR = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
```

Dentro da pasta clonada, rode os testes sem rede:

```sh
node --test
```

Validação: passo a passo do Mac conferido em cópia limpa com pasta de dados temporária. **Windows ainda não validado em máquina real.**

## Privacidade

Este repositório não contém dado pessoal de ninguém e não pode conter. Os exemplos são fictícios. Antes de contribuir, leia a seção de privacidade em `CLAUDE.md`.
