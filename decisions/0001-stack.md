# 0001 - Stack e arquitetura inicial

Data: 2026-10-01

## Contexto

O radar precisa rodar na máquina de quem procura emprego, em Mac e Windows, sem servidor, sem custo para o mantenedor e sem que dado pessoal saia da máquina. O público já usa um agente de código (Claude Code ou Codex).

## Decisão

- **Node 20+ sem dependências de terceiros.** O mesmo código roda em Mac e Windows e não há pacote para instalar nem auditar.
- **Empacotamento como plugin do Claude Code, com `AGENTS.md` para o Codex.** Entrevista e triagem são instruções em texto e servem aos dois.
- **Coleta em script, triagem no agente.** A coleta roda sem consumir assinatura. O julgamento precisa ler a descrição inteira contra o perfil, e isso é trabalho do agente.
- **Dados em `~/.radar-de-vagas/`,** fora do repositório clonado. Atualizar o radar não toca nos dados e não há como commitá-los.
- **Página servida por servidor local,** escutando só na própria máquina. Uma página aberta como arquivo não consegue gravar os cliques.
- **Uma fonte por arquivo, com contrato único.** Fonte que quebra falha sozinha, e contribuir com fonte nova não exige entender o resto.
- **Agendador do próprio sistema** (launchd no Mac, Agendador de Tarefas no Windows). Nenhum processo nosso fica rodando.
- **Licença MIT.**

## Consequências

- Positiva: instalação é clonar e rodar. Nenhuma infraestrutura para manter.
- Positiva: a raspagem parte da máquina de cada pessoa, em volume de uso individual.
- Custo: o público fica restrito a quem tem um agente de código e sabe clonar um repositório.
- Custo: com a máquina desligada o radar não roda. A execução perdida entra quando ela liga.
- Custo: sem dependências, a leitura de HTML das fontes sem API fica mais trabalhosa.
- Dívida: teste em Windows depende de alguém com Windows.
