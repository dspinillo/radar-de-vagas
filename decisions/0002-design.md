# 0002 - Design: tabela densa, uma vaga por linha

Data: 2026-10-01

## Contexto

O projeto nasce de uma versão pessoal do radar em uso diário há um mês. A tela dessa versão já passou por ajustes e resolveu o problema principal: comparar muitas vagas rápido. Uma versão anterior em cartões foi abandonada por virar uma página longa demais.

## Decisão

Manter o desenho vigente em vez de explorar variações:

- **Tabela, uma vaga por linha:** vaga e empresa, local, encaixe em estrelas, motivo e a decisão da pessoa.
- **Alertas dentro da célula do motivo,** com destaque visual e a origem do alerta (preferência da pessoa ou ponto de atenção aprendido).
- **Descartar pede um motivo na própria linha,** sem abrir outra tela.
- **Tema claro e escuro,** tipografia serifada só no título, mono para rótulos e números.

Novo em relação à versão pessoal: o alerta de memória e a faixa salarial por regime.

## Consequências

- Positiva: nenhuma fase de exploração de design; a F1 já sabe o que construir.
- Custo: tabela densa é ruim em tela de celular. O radar é pensado para computador.
