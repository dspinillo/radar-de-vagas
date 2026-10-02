import { createSource, array, object, identifier, html, text, date } from '../source-utils.mjs';
export const greenhouse = createSource({ name: 'greenhouse', label: 'Greenhouse', kind: 'company', async run(s, company) {
  const base = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs`;
  const result = object(await s.request(`${base}?content=true`));
  s.listing(company, 1, array(result.jobs).length);
  for (const item of array(result.jobs)) {
    await s.item(`${company}/${item?.id}`, async () => {
      let job = object(item);
      const id = identifier(job.id);
      if (!text(job.content)) job = object(await s.request(`${base}/${encodeURIComponent(id)}`));
      // O campo content pode vir com as tags codificadas como entidades.
      const content = /<\/?[a-z]/i.test(job.content ?? '') ? job.content : html(job.content);
      return { source: 'greenhouse', sourceId: `${company}/${id}`, url: job.absolute_url,
        title: job.title, company: text(job.company_name) || company, location: job.location?.name ?? null,
        description: html(content), publishedAt: date(job.first_published) };
    }, item?.first_published);
  }
} });
