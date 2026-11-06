import { users, type Audit, type Document, type DocumentType, type Status, type User } from "./domain";

// Deterministic fixture data. Times are relative to "now" so the waiting-time
// flags always demonstrate on-time, overdue and critical items.

type Template = { type: DocumentType; title: string; body: (region: string) => string };

const templates: Template[] = [
  {
    type: "Policy",
    title: "Procurement policy update",
    body: (r) => `Purpose

The ${r} office proposes raising the threshold for three-quotation purchases from PKR 150,000 to PKR 250,000. The current limit was set in 2019 and now catches routine stationery and maintenance orders.

Proposed change

Purchases between PKR 150,000 and PKR 250,000 would need two written quotations instead of three. Anything above PKR 250,000 keeps the existing tender process without change.

Controls

Finance will review a random sample of ten purchases each quarter. Any split order designed to stay under the threshold will be reported to the Senior Officer.

Effective date

The change would apply to purchase requests raised from the first working day of next month.`,
  },
  {
    type: "Policy",
    title: "Records retention schedule",
    body: (r) => `Purpose

This schedule sets how long the ${r} office keeps paper and electronic case files before they are archived or destroyed. Storage rooms are at capacity and some files date back to 2008.

Retention periods

Personnel files will be kept for seven years after a member of staff leaves. Financial vouchers will be kept for six years from the end of the financial year in which they were raised.

Destruction

Files past their retention date will be shredded by an approved contractor. A destruction certificate will be filed for every batch and listed in the records register.

Exceptions

Any file linked to an open audit, inquiry or legal matter is held until that matter closes, regardless of its age.`,
  },
  {
    type: "Finance",
    title: "Quarterly budget release",
    body: (r) => `Request

The ${r} office requests release of PKR 4.2 million from the second-quarter development budget. The amount was approved in the annual plan and is needed before contractors can be paid.

Breakdown

PKR 2.8 million covers the second instalment for the records digitisation contract. PKR 1.4 million covers furniture and network equipment for the new public counter.

Justification

The digitisation contractor has completed 60 percent of the work and the milestone was verified on site. The public counter is scheduled to open next month and cannot open without network access.

Risk if delayed

Late payment would breach the contract terms and may add a two percent penalty to the total contract value.`,
  },
  {
    type: "Finance",
    title: "Travel reimbursement claim",
    body: (r) => `Summary of claim

This claim covers travel by two staff members from the ${r} office to the provincial training workshop. The total claimed is PKR 86,400 including transport, lodging and daily allowance.

Supporting evidence

Bus tickets, hotel invoices and the workshop attendance sheet are attached. Daily allowance has been calculated at the approved grade rates for three days.

Variance

The hotel cost is PKR 6,000 above the usual ceiling because the approved hotel was fully booked. The Clerk obtained written confirmation of this from the hotel.

Recommendation

Reimburse the full amount and note the hotel variance against the workshop budget line.`,
  },
  {
    type: "Operations",
    title: "Regional office equipment",
    body: (r) => `Need

The ${r} office has four desktop computers that no longer receive security updates and fail several times a week. Staff currently share two working machines at the public counter.

Proposal

Replace the four computers with standard laptops from the existing framework supplier. The old machines will be wiped and returned to the central store for disposal.

Cost and timing

The framework price is PKR 210,000 per laptop, PKR 840,000 in total. Delivery is expected within three weeks of the purchase order.

Benefit

Counter waiting times should fall because each officer can process applications without waiting for a shared machine.`,
  },
  {
    type: "Operations",
    title: "Vendor renewal request",
    body: (r) => `Background

The cleaning and maintenance contract for the ${r} office ends at the end of this quarter. The current vendor has held the contract for two years.

Performance

Monthly inspection reports rate the vendor as satisfactory in 21 of 24 months. The three unsatisfactory months were caused by staff shortages during public holidays.

Proposal

Renew the contract for one year at the same rate, with a new clause requiring cover staff during holiday periods. Prices remain fixed for the renewal year.

Alternatives considered

A new tender would take about four months and would leave the office without cover during the changeover.`,
  },
  {
    type: "Personnel",
    title: "Staff leave procedure",
    body: (r) => `Purpose

This procedure standardises how staff in the ${r} office request and approve annual leave. At present requests are made verbally and some are not recorded.

New process

Staff submit leave requests on the standard form at least five working days in advance. The line manager records the decision in the leave register on the same day.

Cover

No more than two counter staff may be on leave on the same day. Managers must name the person covering each absence on the form.

Review

The procedure will be reviewed after six months using the leave register and any complaints received.`,
  },
  {
    type: "Personnel",
    title: "Training programme approval",
    body: (r) => `Programme

The ${r} office requests approval for a five-day customer service training programme for twelve counter staff. The course is delivered by the provincial training institute.

Content

The programme covers complaint handling, accessibility for disabled visitors, and use of the new case tracking system. Each participant receives a certificate on completion.

Cost

The institute charges PKR 9,500 per participant, PKR 114,000 in total. Training will be scheduled in two groups so the counter stays open.

Expected outcome

Complaints about counter service should fall, and every counter officer will be able to use the case tracking system unaided.`,
  },
];

const regions = ["Lahore", "Karachi", "Islamabad", "Peshawar", "Quetta", "Multan", "Faisalabad", "Hyderabad", "Sialkot"];

const officerReasons = [
  "Please attach the supporting quotations referred to in the request.",
  "The cost figures do not add up. Please check the breakdown and totals.",
  "Please explain who will be affected and how they will be told.",
  "The effective date is missing. Please add when this will start.",
];
const seniorReasons = [
  "Please clarify the expected costs and confirm the budget line they come from.",
  "This needs the Finance section's comments before I can give final approval.",
  "Please set out what happens if the change does not work as planned.",
];

const HOUR = 3600000;
const DAY = 24 * HOUR;
export const FIXTURE_PDFS = new Set(["HF-0101", "HF-0106", "HF-0111", "HF-0116"]);
const fixtureSizes: Record<string, number> = { "HF-0101": 2557, "HF-0106": 2567, "HF-0111": 2565, "HF-0116": 2561 };

const [clerk1, clerk2, officer, senior] = users;

export function seedDocuments(now = Date.now()): Document[] {
  return Array.from({ length: 68 }, (_, index) => {
    const id = `HF-${String(index + 101).padStart(4, "0")}`;
    const status: Status = (["Pending Officer", "Pending Senior Officer", "Returned", "Approved"] as const)[index % 4];
    const owner: User = Math.floor(index / 4) % 2 ? clerk2 : clerk1;
    // Mixed so every kind of document appears at every status.
    const template = templates[(index + Math.floor(index / 4) * 3) % templates.length];
    const region = regions[(index * 5) % regions.length];
    // Earlier rejection cycles: 0, 1 or 2, so some documents have been returned more than once.
    const cycles = [0, 1, 0, 2, 0, 0, 1][index % 7];
    // Calendar days the document has been in its current stage: 0–25.
    const waitDays = (index * 7) % 26;

    type Step = { actor: User; action: Audit["action"]; from: Status | null; to: Status; reason?: string };
    const steps: Step[] = [{ actor: owner, action: "submitted", from: null, to: "Pending Officer" }];
    for (let c = 0; c < cycles; c++) {
      const bySenior = (index + c) % 2 === 1;
      if (bySenior) steps.push({ actor: officer, action: "approved", from: "Pending Officer", to: "Pending Senior Officer" });
      steps.push({
        actor: bySenior ? senior : officer,
        action: "rejected",
        from: bySenior ? "Pending Senior Officer" : "Pending Officer",
        to: "Returned",
        reason: bySenior ? seniorReasons[(index + c) % seniorReasons.length] : officerReasons[(index + c) % officerReasons.length],
      });
      steps.push({ actor: owner, action: "resubmitted", from: "Returned", to: "Pending Officer" });
    }
    if (index % 6 === 1) {
      steps.push({ actor: officer, action: "summary requested", from: "Pending Officer", to: "Pending Officer" });
      steps.push({ actor: officer, action: "summary generated", from: "Pending Officer", to: "Pending Officer" });
    }
    if (status !== "Pending Officer")
      steps.push({ actor: officer, action: "approved", from: "Pending Officer", to: "Pending Senior Officer" });
    if (status === "Returned")
      steps.push({ actor: senior, action: "rejected", from: "Pending Senior Officer", to: "Returned", reason: seniorReasons[index % seniorReasons.length] });
    if (status === "Approved")
      steps.push({ actor: senior, action: "approved", from: "Pending Senior Officer", to: "Approved" });

    // Lay the steps out backwards from the last status change, 1–3 days apart,
    // with a summary shown a few minutes before the decision that follows it.
    const lastStatusChange = now - waitDays * DAY - ((index * 37) % 300) * 60000 - HOUR;
    const times: number[] = new Array(steps.length);
    let t = lastStatusChange;
    for (let s = steps.length - 1; s >= 0; s--) {
      times[s] = t;
      const previous = steps[s - 1];
      t -= previous?.action.startsWith("summary") ? 6 * 60000 : (1 + ((index + s) % 3)) * DAY + ((index * 13 + s * 29) % 180) * 60000;
    }
    // Summary events must not count as the latest status change.
    const statusTimes = steps.map((step, s) => (step.action.startsWith("summary") ? null : times[s])).filter((x): x is number => x !== null);
    const waitingSince = new Date(Math.max(...statusTimes)).toISOString();

    const audit: Audit[] = steps.map((step, s) => ({
      id: `${id}-${s + 1}`,
      actorId: step.actor.id,
      actor: step.actor.name,
      actorRole: step.actor.role,
      action: step.action,
      at: new Date(times[s]).toISOString(),
      from: step.from,
      to: step.to,
      ...(step.reason ? { reason: step.reason } : {}),
    }));
    const version = steps.filter((s) => !s.action.startsWith("summary")).length;

    return {
      id,
      ownerId: owner.id,
      title: `${template.title} — ${region}`,
      body: template.body(region),
      type: template.type,
      status,
      createdAt: audit[0].at,
      updatedAt: audit[audit.length - 1].at,
      waitingSince,
      version,
      audit,
      ...(index % 5 === 0
        ? {
            attachment: {
              name: FIXTURE_PDFS.has(id) ? `${id}.pdf` : `${template.title.replace(/\s+/g, "-")}-${region}.pdf`,
              size: fixtureSizes[id] ?? 1800,
              mime: "application/pdf",
            },
          }
        : {}),
    } satisfies Document;
  });
}
