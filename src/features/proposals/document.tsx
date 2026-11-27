// The branded proposal document, used for the internal preview and the client link (and printed
// to PDF from either). Renders only public fields. Text bodies: blank lines separate paragraphs;
// lines starting with "- " become bullet lists.
import { Wordmark } from "@/components/brand/logo";
import { formatMoney } from "@/lib/money";
import { LABELS, lineTotalCents, proposalNumber, scheduleAmounts, SECTION_TITLES, totals, type PublicProposal } from "./model";

function Body({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.split("\n").filter((l) => l.trim() !== ""));
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((lines, i) =>
        lines.every((l) => /^\s*[-•]\s+/.test(l)) ? (
          <ul key={i} className="space-y-1.5">
            {lines.map((l, j) => (
              <li key={j} className="flex gap-2.5">
                <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-brand" />
                <span>{l.replace(/^\s*[-•]\s+/, "")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {l}
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

export function ProposalDocument({ doc, selectedOptional = [] }: { doc: PublicProposal; selectedOptional?: string[] }) {
  const L = LABELS[doc.language];
  const locale = doc.language === "es" ? "es-PA" : "en-US";
  const date = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—");
  const money = (cents: number) => formatMoney({ cents, currency: doc.currency });
  const base = doc.items.filter((i) => !i.optional);
  const optional = doc.items.filter((i) => i.optional);
  const chosen = doc.response?.decision === "accepted" ? doc.response.selected_optional_item_ids : selectedOptional;
  const t = totals(doc.items, doc.tax_rate_bps, chosen);
  const baseTotals = totals(doc.items, doc.tax_rate_bps);
  const qty = (h: number) => (h % 100 === 0 ? String(h / 100) : (h / 100).toLocaleString(locale, { maximumFractionDigits: 2 }));
  const sections = doc.content.sections.filter((s) => s.body.trim());
  const payments = scheduleAmounts(t.total, doc.milestones.map((m) => m.percent_bps));

  return (
    <article lang={doc.language} className="proposal-doc mx-auto max-w-[820px] bg-card text-foreground print:max-w-none">
      {/* Cover */}
      <header className="relative overflow-hidden px-8 pb-12 pt-10 sm:px-14 sm:pt-14">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full" style={{ background: "radial-gradient(circle, rgb(255 63 118 / 0.18), transparent 70%)" }} />
        <div className="relative flex items-start justify-between gap-6">
          <Wordmark className="h-9" />
          <p className="text-right text-xs font-semibold tracking-wide text-muted-foreground">
            {L.proposal} {proposalNumber(doc.number)}
            <br />
            {L.version} {doc.version}
          </p>
        </div>
        <h1 className="display relative mt-16 max-w-[16ch] text-[40px] font-bold leading-[1.05] sm:text-[52px]">{doc.title}</h1>
        <dl className="relative mt-10 grid gap-6 border-t border-border pt-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">{L.preparedFor}</dt>
            <dd className="mt-1 font-semibold">{doc.client_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">{L.date}</dt>
            <dd className="mt-1">{date(doc.sent_at ?? new Date().toISOString())}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">{L.validUntil}</dt>
            <dd className="mt-1">{date(doc.valid_until)}</dd>
          </div>
        </dl>
      </header>

      {/* Sections */}
      <div className="space-y-12 px-8 pb-6 sm:px-14">
        {sections.map((s, i) => (
          <section key={s.key} className="break-inside-avoid-page">
            <h2 className="display mb-4 flex items-baseline gap-3 text-2xl font-bold">
              <span className="tabular text-sm font-bold text-primary">{String(i + 1).padStart(2, "0")}</span>
              {SECTION_TITLES[doc.language][s.key]}
            </h2>
            <Body text={s.body} />
          </section>
        ))}

        {/* Investment */}
        <section className="break-inside-avoid-page">
          <h2 className="display mb-4 flex items-baseline gap-3 text-2xl font-bold">
            <span className="tabular text-sm font-bold text-primary">{String(sections.length + 1).padStart(2, "0")}</span>
            {L.investment}
          </h2>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pink-50 text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    {L.item}
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                    {L.qty}
                  </th>
                  <th scope="col" className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">
                    {L.unitPrice}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    {L.total}
                  </th>
                </tr>
              </thead>
              <tbody>
                {base.map((i) => (
                  <tr key={i.id} className="border-t border-border align-top">
                    <td className="px-4 py-3">
                      <span className="font-semibold">{i.name}</span>
                      {i.description && <span className="mt-0.5 block text-[13px] text-muted-foreground">{i.description}</span>}
                    </td>
                    <td className="tabular px-2 py-3 text-right">{qty(i.quantity_hundredths)}</td>
                    <td className="tabular hidden px-2 py-3 text-right sm:table-cell">{money(i.unit_price_cents)}</td>
                    <td className="tabular px-4 py-3 text-right">{money(lineTotalCents(i.unit_price_cents, i.quantity_hundredths))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="tabular space-y-1.5 border-t border-border bg-pink-25 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <dt>{L.subtotal}</dt>
                <dd>{money(baseTotals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>
                  {L.tax} {doc.tax_rate_bps / 100}%
                </dt>
                <dd>{money(baseTotals.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <dt>{L.grandTotal}</dt>
                <dd>{money(baseTotals.total)}</dd>
              </div>
            </dl>
          </div>

          {optional.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold">{L.optional}</h3>
              <p className="text-[13px] text-muted-foreground">{L.optionalHint}</p>
              <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                {optional.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                    <span>
                      <span className="font-semibold">
                        {chosen.includes(i.id) ? "✓ " : ""}
                        {i.name}
                      </span>
                      {i.description && <span className="block text-[13px] text-muted-foreground">{i.description}</span>}
                    </span>
                    <span className="tabular shrink-0">+ {money(lineTotalCents(i.unit_price_cents, i.quantity_hundredths))}</span>
                  </li>
                ))}
              </ul>
              {chosen.length > 0 && (
                <p className="tabular mt-2 text-right text-sm font-semibold">
                  {L.selectedTotal}: {money(t.total)}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Payment schedule */}
        {doc.milestones.length > 0 && (
          <section className="break-inside-avoid-page">
            <h2 className="display mb-4 flex items-baseline gap-3 text-2xl font-bold">
              <span className="tabular text-sm font-bold text-primary">{String(sections.length + 2).padStart(2, "0")}</span>
              {L.paymentSchedule}
            </h2>
            <ol className="space-y-2">
              {doc.milestones.map((m, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-pink-50 px-4 py-3 text-sm">
                  <span>
                    <span className="tabular font-bold text-primary">{m.percent_bps / 100}%</span> <span className="font-semibold">{m.label}</span>
                    {m.due && <span className="text-muted-foreground"> · {m.due}</span>}
                  </span>
                  <span className="tabular font-semibold">{money(payments[i])}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <footer className="mt-10 flex items-center justify-between gap-4 border-t border-border px-8 py-6 text-xs text-muted-foreground sm:px-14">
        <span>
          {doc.organization_name} · {proposalNumber(doc.number)} · {L.version} {doc.version}
        </span>
        <span>gufi.io</span>
      </footer>
    </article>
  );
}
