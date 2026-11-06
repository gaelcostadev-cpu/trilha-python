# Contrato da árvore

Importe `SkillTree` de `../tree/SkillTree`. Ela recebe `lessons` (cada item precisa de `id`, `title`, `status` e `prerequisites`) e `selectLesson(lesson)`. Os objetos completos são devolvidos ao selecionar um nó; o componente não altera dados nem interpreta bloqueios. O renderer permanece responsável pela navegação e pela elegibilidade.

As conexões são desenhadas a partir dos IDs de `prerequisites` presentes em `lessons`. IDs ausentes não geram linhas. A visualização suporta arrastar, rolagem, controles de direção, zoom e teclado: ao focar o mapa, setas movem, +/− ampliam ou reduzem e 0 restaura a escala. Todos os nós continuam botões acessíveis, inclusive habilidades bloqueadas para consulta dos detalhes.
