import { createSource, array, object, identifier, html, text, date, workModel, nextData } from '../source-utils.mjs';
export const gupy = createSource({ name: 'gupy', label: 'Gupy', kind: 'search', async run(s, term) {
  let offset = 0, page = 0;
  while (true) {
    const params = new URLSearchParams({ jobName: term, limit: '100', offset: String(offset) });
    const result = object(await s.request(`https://portal.gupy.io/api/job-search/jobs?${params}`));
    const items = array(result.data);
    s.listing(term, page + 1, items.length);
    if (!items.length) break;
    for (const item of items) await s.item(String(item?.id), async () => {
      const listing = object(item), id = identifier(listing.id);
      const detail = nextData(await s.request(listing.jobUrl, undefined, 'text'));
      const job = object(detail.props?.pageProps?.job);
      const description = ['description', 'responsibilities', 'prerequisites', 'relevantExperiences'].map(key => html(job[key])).filter(Boolean).join('\n\n');
      if (!html(job.description)) throw new Error('Descrição completa ausente no detalhe da vaga.');
      return { source: 'gupy', sourceId: id, url: listing.jobUrl, title: job.name ?? listing.name,
        company: text(job.company?.name) || listing.careerPageName,
        description, location: [job.addressCity, job.addressState, job.addressCountry].filter(Boolean).join(', ') || null,
        publishedAt: date(job.publishedAt ?? listing.publishedDate), employmentType: job.jobType ?? null,
        workModel: workModel(job.workplaceType ?? listing.workplaceType) };
    }, item?.publishedDate);
    await s.flush();
    offset += items.length;
    // O portal pode informar apenas o tamanho do lote em total.
    if (items.length < 100) break;
    if (!s.page(items, term, ++page)) break;
  }
} });
