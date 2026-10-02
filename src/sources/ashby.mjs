import { createSource, array, object, identifier, text, html, date, workModel } from '../source-utils.mjs';
export const ashby = createSource({ name: 'ashby', label: 'Ashby', kind: 'company', async run(s, company) {
  const result = object(await s.request(`https://api.ashbyhq.com/posting-api/job-board/${company}?includeCompensation=true`));
  s.listing(company, 1, array(result.jobs).length);
  for (const item of array(result.jobs)) {
    if (item?.isListed === false) continue;
    await s.item(`${company}/${item?.id}`, async () => {
      const job = object(item), id = identifier(job.id);
      let description = text(job.descriptionPlain) || html(job.descriptionHtml);
      if (!description) {
        const page = await s.request(job.jobUrl, undefined, 'text');
        const scripts = [...page.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
        for (const script of scripts) {
          let payload;
          try { payload = JSON.parse(script[1]); } catch { continue; }
          const entries = Array.isArray(payload) ? payload : payload?.['@graph'] ?? [payload];
          const posting = entries.find(entry => entry?.['@type'] === 'JobPosting');
          if (posting) { description = html(posting.description); break; }
        }
      }
      if (!description) throw new Error('Descrição completa ausente no detalhe público da vaga.');
      return { source: 'ashby', sourceId: `${company}/${id}`, url: job.jobUrl, applyUrl: job.applyUrl ?? null,
        title: job.title, company, description, location: job.location ?? null,
        employmentType: job.employmentType ?? null, publishedAt: date(job.publishedAt),
        salary: job.compensation?.compensationTierSummary ?? null,
        workModel: workModel(job.workplaceType) ?? (job.isRemote === true ? 'remote' : null) };
    }, item?.publishedAt);
  }
} });
