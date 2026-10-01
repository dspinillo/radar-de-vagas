# Radar de Vagas · Lições

> Conhecimento que viaja com o repositório: erros que custaram caro, padrões que funcionaram, armadilhas do ambiente. Formato: **o que aconteceu → por quê → como evitar**. As lições abaixo vêm de um mês de uso da versão pessoal que deu origem a este projeto.

## Armadilhas (o que quebrou)

- **Descrição truncada escondeu requisito de idioma.** Um corte em 4.000 caracteres deixou de fora o "inglês avançado ou fluente" de três vagas, porque requisitos costumam vir no fim do anúncio → guardar e julgar a descrição inteira.
- **Filtro de título escondeu vagas boas.** Excluir qualquer título com "comercial" derrubou vagas de planejamento e inteligência comercial → excluir por título só o que é inequívoco e preferir alerta a exclusão.
- **Republicar o radar apagou marcações.** Gerar a página de novo sem ler o estado atual sobrescreveu o que a pessoa tinha marcado → a coleta só adiciona vagas com identificador inexistente e nunca altera marcação.
- **Alerta por e-mail dos portais rende pouco.** Cerca de uma vaga por dia, com encaixe fraco → a busca ativa é a fonte principal.

## Padrões que funcionaram

- **Alerta em vez de corte.** A mesma exigência que elimina uma vaga mediana é aceitável numa vaga excepcional. Quem pesa isso é a pessoa.
- **Motivo de descarte escrito pela pessoa.** Calibra melhor do que qualquer inferência a partir dos cliques.
- **Página de fonte por empresa ganha de agregador.** Traz a descrição completa e o link direto de inscrição, então tem prioridade na deduplicação.
- **Vaga fresca converte mais.** Ordenar por data de publicação e mostrar a idade da vaga.
- **Olhar a pergunta de pretensão salarial antes de investir tempo.** Faixa incompatível só aparece no formulário.

## Ambiente / ferramentas

- **LinkedIn sem login.** Responde, mas limita por volume: manter cerca de um segundo entre chamadas.
- **Indeed, Glassdoor e Jooble.** Bloqueiam acesso automatizado (403). Ficam fora.
