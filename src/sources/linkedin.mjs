import { createSource, html, text, date, elementByClass } from '../source-utils.mjs';
async function request(s, url, detail = false) {
  if (s.linkedinCalled) await s.sleep(1000);
  s.linkedinCalled = true;
  try {
    const body = await s.request(url, { redirect: 'manual' }, 'text');
    const publicContent = detail
      ? html(elementByClass(body, 'show-more-less-html__markup'))
      : /urn:li:jobPosting:\d+/.test(body);
    if (!publicContent && /<(?:form|iframe|input|div)\b[^>]*(?:authwall|checkpoint|captcha)|<form[^>]*(?:login|signin)|<title[^>]*>\s*(?:sign in|login|security verification|verification de sécurité)/i.test(body)) {
      s.stopped = true;
      throw new Error('LinkedIn sinalizou bloqueio ou pediu autenticação; fonte interrompida.');
    }
    return body;
  } catch (error) {
    if ([301, 302, 303, 307, 308, 401, 403, 429, 999].includes(error.status)) {
      s.stopped = true;
      throw new Error(`LinkedIn sinalizou bloqueio (HTTP ${error.status}); fonte interrompida.`);
    }
    throw error;
  }
}
export const linkedin = createSource({ name: 'linkedin', label: 'LinkedIn', kind: 'search', defaultEnabled: false, async run(s, term) {
  let offset = 0, page = 0;
  while (!s.stopped) {
    const params = new URLSearchParams({ keywords: term, start: String(offset) });
    if (s.ctx.search.localidade) params.set('location', s.ctx.search.localidade);
    const model = { remoto: '2', híbrido: '3', presencial: '1' }[s.ctx.search.modelo];
    if (model) params.set('f_WT', model);
    if (s.ctx.search.idadeMaximaDias) params.set('f_TPR', `r${s.ctx.search.idadeMaximaDias * 86400}`);
    const body = await request(s, `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`);
    const ids = [...new Set([...body.matchAll(/urn:li:jobPosting:(\d+)/g)].map(match => match[1]))];
    s.listing(term, page + 1, ids.length);
    if (!ids.length) {
      if (text(body) && !/no.results|no.jobs|nenhuma vaga/i.test(body)) throw new Error('Resposta malformada: lista de vagas do LinkedIn não reconhecida.');
      break;
    }
    for (const id of ids) {
      if (s.stopped) break;
      const card = [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
        .find(match => match[1].includes(`urn:li:jobPosting:${id}`))?.[1];
      const publishedAt = date(card?.match(/<time\b[^>]*datetime=["']([^"']+)/i)?.[1]);
      await s.item(id, async () => {
        const detail = await request(s, `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, true);
        const description = html(elementByClass(detail, 'show-more-less-html__markup'));
        if (!description) throw new Error('Descrição completa ausente no detalhe do LinkedIn.');
        return { source: 'linkedin', sourceId: id, url: `https://www.linkedin.com/jobs/view/${id}/`,
          title: html(elementByClass(detail, 'top-card-layout__title')) || html(elementByClass(detail, 'topcard__title')),
          company: html(elementByClass(detail, 'topcard__org-name-link')),
          location: html(elementByClass(detail, 'topcard__flavor--bullet')) || null,
          description, publishedAt: date(detail.match(/<time\b[^>]*datetime=["']([^"']+)/i)?.[1]) };
      }, publishedAt);
    }
    if (s.stopped || !s.page(ids, term, ++page)) break;
    offset += ids.length;
  }
} });
