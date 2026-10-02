---
name: acompanhamento
description: Atualiza etapa, próximo passo e observações de um processo no Radar quando a pessoa conta uma novidade.
---

# Acompanhamento

1. Identifique a vaga pela conversa. Se faltar ID ou houver ambiguidade, pergunte o ID antes de gravar.
   Na raiz do clone, execute `node bin/radar.mjs show <id>` e confira título, empresa e `tracking`.
   Se o comando falhar, explique o problema; não crie uma vaga nem abra o arquivo de estado.
2. Extraia somente a novidade relatada: etapa, próximo passo e observações.
   Pergunte uma informação por vez quando necessária; não invente prazo, retorno ou aprovação.
   Se só mudou o próximo passo, mantenha a etapa atual. Sem etapa existente, pergunte qual é.
   Datas relativas ambíguas exigem esclarecimento antes de registrar uma data absoluta.
3. Atualize usando `node bin/radar.mjs track <id> --stage "<etapa>"`.
   Acrescente `--next "<texto>"` e `--notes "<texto>"` quando conhecidos.
   Omita campos não alterados: o comando preserva seus valores atomicamente.
   Acrescente a novidade às observações relevantes, sem substituir o histórico por um resumo inventado.
   Para limpar a pedido da pessoa, use `--clear-next` ou `--clear-notes`, sem combinar com a opção de texto correspondente.
   Passe ID e textos como argumentos literais com escape adequado ao shell.
4. Confira o resultado com `node bin/radar.mjs show <id>` e relate a etapa e próximo passo gravados.
   Se falhar, informe que não foi confirmado; não anuncie sucesso nem repare editando `estado.json`.
5. Se a novidade for entrevista, siga [entrevista](../entrevista/SKILL.md) para registrar e preparar
   a página, aproveitando os dados já informados e evitando gravar a mesma novidade duas vezes.
   Se for pedido de currículo, siga [curriculo-por-vaga](../curriculo-por-vaga/SKILL.md).

Nunca mude a marcação inscrevi/descartar: `track` atualiza acompanhamento, não marcação.
Quando a pessoa relatar inscrição, oriente marcar inscrevi na página; não há comando para isso no contrato.
Nunca envie candidatura, mensagem ou resposta a recrutador nem suponha contratação ou descarte.
Só use `show` e `track` para ler e gravar o processo; não leia estado nem importe módulos internos.
