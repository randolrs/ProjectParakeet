import type { DigestSynthesis, RankedEntry } from './synthesis';

// Pure render. HTML + plain-text fallback. Email clients (Gmail, Outlook
// mobile, Apple Mail) strip most CSS and ignore <style>; inline styles
// only, no external assets, no JS, mobile-first single column.

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

const REC_LABEL: Record<RankedEntry['score']['bidRecommendation'], string> = {
  bid: 'Bid',
  watch: 'Watch',
  no_bid: 'Pass',
};

const REC_COLOR: Record<RankedEntry['score']['bidRecommendation'], string> = {
  bid: '#0a7a3b',
  watch: '#9a6b00',
  no_bid: '#6b6b6b',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDeadline(now: Date, iso: string | null): string {
  if (!iso) return 'No closing date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No closing date';
  const ms = d.getTime() - now.getTime();
  if (ms < 0) return `Closed ${d.toISOString().slice(0, 10)}`;
  const hours = Math.round(ms / 36e5);
  if (hours < 72) return `${hours}h to deadline`;
  const days = Math.round(hours / 24);
  if (days <= 14) return `${days}d to deadline`;
  return `Due ${d.toISOString().slice(0, 10)}`;
}

function fmtDate(iso: string): string {
  // YYYY-MM-DD for the subject; keeps it sortable in the inbox.
  return iso.slice(0, 10);
}

export function buildSubject(now: Date, entryCount: number): string {
  const datePart = fmtDate(now.toISOString());
  if (entryCount === 0) return `Parakeet digest — ${datePart} (no new matches)`;
  return `Parakeet digest — ${datePart} (${entryCount} ${entryCount === 1 ? 'opportunity' : 'opportunities'})`;
}

function renderEntryHtml(entry: RankedEntry, now: Date): string {
  const opp = entry.candidate.normalized;
  const rec = entry.score.bidRecommendation;
  const recLabel = REC_LABEL[rec];
  const recColor = REC_COLOR[rec];
  const keyFactors = entry.score.keyFactors
    .map((k) => `<li style="margin:0 0 4px 0;">${esc(k)}</li>`)
    .join('');
  const agency = opp.department ? ` &middot; ${esc(opp.department)}` : '';
  const setAside = opp.setAsideType ? ` &middot; ${esc(opp.setAsideType)}` : '';
  const naics = opp.naicsCode ? ` &middot; NAICS ${esc(opp.naicsCode)}` : '';
  const samUrl = opp.descriptionUrl ?? null;
  const title = samUrl
    ? `<a href="${esc(samUrl)}" style="color:#0b6fff;text-decoration:none;">${esc(opp.title)}</a>`
    : esc(opp.title);

  return `
    <div style="border:1px solid #e5e5e5;border-radius:8px;padding:14px;margin:0 0 12px 0;">
      <div style="font-size:12px;color:#666;margin:0 0 4px 0;">
        #${entry.rank} &middot;
        <span style="color:${recColor};font-weight:600;">${recLabel}</span> (fit ${entry.score.fitScore}) &middot;
        ${esc(fmtDeadline(now, opp.responseDeadline))}
      </div>
      <div style="font-size:15px;font-weight:600;margin:0 0 4px 0;line-height:1.3;">${title}</div>
      <div style="font-size:12px;color:#666;margin:0 0 10px 0;">
        ${esc(opp.noticeType)}${agency}${naics}${setAside}
      </div>
      <div style="font-size:14px;color:#222;line-height:1.45;margin:0 0 8px 0;">${esc(entry.score.reasoningText)}</div>
      <ul style="margin:0;padding:0 0 0 18px;font-size:13px;color:#444;">${keyFactors}</ul>
    </div>
  `.trim();
}

function renderEntryText(entry: RankedEntry, now: Date): string {
  const opp = entry.candidate.normalized;
  const rec = REC_LABEL[entry.score.bidRecommendation].toUpperCase();
  const meta = [opp.noticeType, opp.department, opp.naicsCode && `NAICS ${opp.naicsCode}`, opp.setAsideType]
    .filter(Boolean)
    .join(' | ');
  const factors = entry.score.keyFactors.map((k) => `  - ${k}`).join('\n');
  const url = opp.descriptionUrl ? `\n  ${opp.descriptionUrl}` : '';
  return [
    `#${entry.rank} [${rec}] fit ${entry.score.fitScore} · ${fmtDeadline(now, opp.responseDeadline)}`,
    `  ${opp.title}`,
    `  ${meta}`,
    `  ${entry.score.reasoningText}`,
    factors,
    url,
  ]
    .filter(Boolean)
    .join('\n');
}

export function renderDigest(synthesis: DigestSynthesis, now: Date = new Date()): RenderedDigest {
  const subject = buildSubject(now, synthesis.entries.length);
  const dateStr = fmtDate(now.toISOString());

  if (synthesis.entries.length === 0) {
    const text = `${esc(synthesis.header)}\n\n— Parakeet`;
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px 16px;color:#111;">
        <h1 style="font-size:18px;margin:0 0 12px 0;">Parakeet digest &middot; ${dateStr}</h1>
        <p style="font-size:14px;color:#444;line-height:1.5;">${esc(synthesis.header)}</p>
      </div>
    `.trim();
    return { subject, html, text };
  }

  const entriesHtml = synthesis.entries.map((e) => renderEntryHtml(e, now)).join('\n');
  const entriesText = synthesis.entries.map((e) => renderEntryText(e, now)).join('\n\n');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px 16px;color:#111;">
      <h1 style="font-size:18px;margin:0 0 12px 0;">Parakeet digest &middot; ${dateStr}</h1>
      <p style="font-size:14px;color:#444;line-height:1.5;margin:0 0 20px 0;">${esc(synthesis.header)}</p>
      ${entriesHtml}
      <p style="font-size:11px;color:#999;margin:24px 0 0 0;">Generated by Parakeet. Reply to give feedback on the picks.</p>
    </div>
  `.trim();

  const text = [
    `Parakeet digest · ${dateStr}`,
    '',
    synthesis.header,
    '',
    entriesText,
    '',
    '— Parakeet',
  ].join('\n');

  return { subject, html, text };
}
