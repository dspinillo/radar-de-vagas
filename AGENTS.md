# Radar de Vagas · instruções para agentes

As instruções vivem em `CLAUDE.md` e valem para qualquer agente (Claude Code, Codex ou outro). Leia aquele arquivo antes de começar.

## Skills compartilhadas com Claude Code

No Codex, abra e siga o arquivo correspondente ao pedido. As instruções de produto vivem
somente nestas skills; não copie seu conteúdo para outra árvore de skills.

| Pedido da pessoa | Skill a ler |
|---|---|
| Começar ou atualizar perfil e busca | [onboarding](skills/onboarding/SKILL.md) |
| Julgar vagas novas e aprender com descartes | [triagem](skills/triagem/SKILL.md) |
| Montar currículo para uma vaga | [curriculo-por-vaga](skills/curriculo-por-vaga/SKILL.md) |
| Registrar entrevista e preparar casos | [entrevista](skills/entrevista/SKILL.md) |
| Registrar novidade de um processo | [acompanhamento](skills/acompanhamento/SKILL.md) |

Execute os comandos na raiz do clone. Dados de uso ficam nos caminhos de `paths`, fora
do repositório. Um pedido para usar o radar não é um pedido para alterar seu código.
Na triagem não interativa, siga a mesma skill de triagem, inclusive teto e tratamento de pendências.
