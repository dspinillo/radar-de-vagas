import { createSource, array, object, identifier, html, text, date, workModel } from '../source-utils.mjs';
export const inhire = createSource({ name: 'inhire', label: 'InHire', kind: 'company', async run(s, company) {
  const base = 'https://api.inhire.app/job-posts/public/pages';
  const options = { headers: { 'X-Tenant': company } };
  const result = object(await s.request(base, options));
  s.listing(company, 1, array(result.jobsPage).length);
  for (const item of array(result.jobsPage)) await s.item(`${company}/${item?.jobId}`, async () => {
    const id = identifier(object(item).jobId);
    const job = object(await s.request(`${base}/${encodeURIComponent(id)}`, options));
    const slug = text(job.displayName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vaga';
    return { source: 'inhire', sourceId: `${company}/${id}`, url: `https://${company}.inhire.app/vagas/${encodeURIComponent(id)}/${slug}`,
      title: job.displayName, company: text(job.tenantName) || text(result.tenantName) || company,
      description: html(job.description), location: job.location ?? null, workModel: workModel(job.workplaceType),
      employmentType: Array.isArray(job.contractType) ? job.contractType.join(', ') : job.contractType ?? null,
      publishedAt: date(job.publishedAt) };
  }, item?.publishedAt);
} });
