import { createSource, array, object, identifier, html, text, workModel } from '../source-utils.mjs';
function description(job) {
  return [text(job.descriptionPlain) || html(job.description),
    ...array(job.lists ?? []).map(section => [text(section.text), html(section.content)].filter(Boolean).join('\n')),
    text(job.additionalPlain) || html(job.additional),
    text(job.salaryDescriptionPlain) || html(job.salaryDescription)].filter(Boolean).join('\n\n');
}
export const lever = createSource({ name: 'lever', label: 'Lever', kind: 'company', async run(s, company) {
  const base = `https://api.lever.co/v0/postings/${company}`;
  let offset = 0, page = 0;
  while (true) {
    const items = array(await s.request(`${base}?mode=json&skip=${offset}&limit=100`));
    s.listing(company, page + 1, items.length);
    if (!items.length) break;
    for (const item of items) await s.item(`${company}/${item?.id}`, async () => {
      let job = object(item); const id = identifier(job.id);
      if (!text(job.descriptionPlain) && !text(job.description)) job = object(await s.request(`${base}/${encodeURIComponent(id)}?mode=json`));
      if (!text(job.descriptionPlain) && !html(job.description)) throw new Error('Descrição completa ausente no detalhe da vaga.');
      return { source: 'lever', sourceId: `${company}/${id}`, url: job.hostedUrl, applyUrl: job.applyUrl ?? null,
        title: job.text, company, description: description(job), location: job.categories?.location ?? null,
        employmentType: job.categories?.commitment ?? null, workModel: workModel(job.workplaceType) };
    });
    await s.flush();
    if (items.length < 100 || !s.page(items, company, ++page)) break;
    offset += items.length;
  }
} });
