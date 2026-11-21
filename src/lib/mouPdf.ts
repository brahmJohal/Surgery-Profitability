export type MouPdfShare = {
  enabled: boolean;
  percentage: number;
  revenueBasis: string;
  deductions: string[];
};

export type MouPdfInput = {
  payee: string;
  role: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  paymentTerms?: string;
  notes?: string;
  opdSharePercentage?: number;
  opdPrice?: number;
  fixedRental?: number;
  fixedMonthlyAmount?: number;
  wardVisitCharge?: number;
  icuEmergencyVisitCharge?: number;
  anaesthesiaFirstHourRate?: number;
  anaesthesiaAdditionalHourRate?: number;
  accountHolder?: string;
  accountNumber?: string;
  ifsc?: string;
  upi?: string;
  terms?: {
    doctorPatient: MouPdfShare;
    hospitalPatient: MouPdfShare;
    referralCash: MouPdfShare;
    referralInsurance: MouPdfShare;
    partnerPatientAndDoctor: MouPdfShare;
    partnerPatientOnly: MouPdfShare;
    assistantSurgeon: MouPdfShare;
    anaesthetistEnabled: boolean;
    anaesthesiaFirstHourRate: number;
    anaesthesiaAdditionalHourRate: number;
    hospitalSurgeonFees: { surgeryName: string; surgeonFee: number }[];
  };
};

const money = (value?: number) =>
  `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0)}`;

const date = (value?: string) => {
  if (!value) return "Not specified";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "long", year: "numeric" }).format(parsed);
};

const basisLabel = (basis: string) => ({
  billed: "gross billed amount after applicable discounts",
  settled_tpa: "final settled TPA / insurance amount",
  payment_received: "payment received by the Hospital",
  remaining_amount: "remaining amount after the selected deductions",
  partner_commission: "partner commission",
  fixed: "fixed amount",
}[basis] || basis.replace(/_/g, " "));

const deductionLabels: Record<string, string> = {
  dci: "DCI", cross_consultation: "cross-consultation", referral_commission: "referral commission",
  external_lab: "external lab", external_diagnostics: "external diagnostics / ultrasound",
  anaesthetist: "anaesthetist payout", assistant_surgeon: "assistant surgeon payout",
  consumables: "consumables", special_equipment: "special rented equipment",
  external_visit: "external doctor visit cost", implant: "implant cost",
  b2b_partner_payout: "B2B partner payout", blood_procurement: "blood procurement",
  corporate_discount_adjustment: "corporate discount adjustment", custom_payout: "custom payout",
  emi_reimbursement_cost: "EMI / reimbursement cost", medical_equipment_rental: "medical equipment rental",
  outside_lab_payout: "outside lab payout", referral_payout: "referral payout",
  surgeon_payout: "surgeon payout", visiting_consultant_fee: "visiting consultant fee",
};

const escapePdf = (value: string) => value.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, "-");
const cleanFileName = (value: string) => value.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").toLowerCase();

function wrap(text: string, max = 92) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines;
}

function shareSentence(label: string, share?: MouPdfShare) {
  if (!share?.enabled || !share.percentage) return "";
  const deductions = share.deductions.length
    ? ` after deducting ${share.deductions.map((item) => deductionLabels[item] || item).join(", ")}`
    : " without any configured deductions";
  return `${label}: ${share.percentage}% of ${basisLabel(share.revenueBasis)}${deductions}.`;
}

/** Creates a light, printable PDF with only browser-native APIs. */
export function downloadMouPdf(input: MouPdfInput) {
  const terms = input.terms;
  const role = input.role.toLowerCase();
  const clauses: Array<{ heading: string; content: string[] }> = [];
  const general = [
    `This Memorandum of Understanding (MOU) is made between TrueArtis Hospital (the Hospital) and ${input.payee || "the Payee"} (the ${input.role || "Doctor"}).`,
    `Effective from: ${date(input.effectiveFrom)}${input.effectiveTo ? ` until ${date(input.effectiveTo)}` : " and continuing until amended or terminated in writing"}.`,
  ];
  clauses.push({ heading: "1. PARTIES AND EFFECTIVE DATE", content: general });

  if (role === "doctor") {
    clauses.push({ heading: "2. REVENUE SHARING AND COMMERCIAL TERMS", content: [
      shareSentence("Doctor's patient", terms?.doctorPatient),
      shareSentence("Hospital's patient", terms?.hospitalPatient),
      terms?.hospitalSurgeonFees.filter((fee) => fee.surgeryName && fee.surgeonFee).length
        ? `Fixed surgeon fees for Hospital patients: ${terms.hospitalSurgeonFees.filter((fee) => fee.surgeryName && fee.surgeonFee).map((fee) => `${fee.surgeryName} - ${money(fee.surgeonFee)}`).join("; ")}.`
        : "",
    ].filter(Boolean) });
    clauses.push({ heading: "3. OPD, VISITS AND FIXED TERMS", content: [
      input.opdPrice ? `OPD consultation price: ${money(input.opdPrice)} per visit${input.opdSharePercentage ? `; Doctor share: ${input.opdSharePercentage}%` : ""}.` : "",
      input.wardVisitCharge ? `Ward / day visit charge: ${money(input.wardVisitCharge)}.` : "",
      input.icuEmergencyVisitCharge ? `ICU / emergency visit charge: ${money(input.icuEmergencyVisitCharge)}.` : "",
      input.fixedRental ? `Fixed rental: ${money(input.fixedRental)} per month.` : "",
      input.fixedMonthlyAmount ? `Fixed monthly payment: ${money(input.fixedMonthlyAmount)}.` : "",
    ].filter(Boolean) });
  } else if (role === "referral") {
    clauses.push({ heading: "2. REFERRAL COMMERCIAL TERMS", content: [
      shareSentence("Cash case referral", terms?.referralCash),
      shareSentence("Insurance / TPA case referral", terms?.referralInsurance),
    ].filter(Boolean) });
  } else if (role === "partner") {
    clauses.push({ heading: "2. PARTNER REVENUE SHARING TERMS", content: [
      shareSentence("Partner patient and partner doctor", terms?.partnerPatientAndDoctor),
      shareSentence("Partner patient only", terms?.partnerPatientOnly),
      "For a partner patient and partner doctor case, no separate doctor payout shall be raised for the same case unless expressly approved in writing.",
    ].filter(Boolean) });
  } else if (role === "anaesthetist") {
    clauses.push({ heading: "2. ANAESTHETIST TERMS", content: [
      `First hour payout: ${money(terms?.anaesthesiaFirstHourRate || input.anaesthesiaFirstHourRate)}.`,
      `Each additional hour: ${money(terms?.anaesthesiaAdditionalHourRate || input.anaesthesiaAdditionalHourRate)}.`,
    ] });
  } else if (role === "assistant surgeon") {
    clauses.push({ heading: "2. ASSISTANT SURGEON TERMS", content: [
      shareSentence("Assistant surgeon", terms?.assistantSurgeon),
    ].filter(Boolean) });
  }

  clauses.push({ heading: "4. PAYMENT TERMS", content: [
    input.paymentTerms || "Payments shall be processed after billing verification, applicable deductions and approval by the Hospital.",
    "The Hospital may verify the final billing, TPA settlement and recorded deductions before releasing a payout.",
  ] });
  clauses.push({ heading: "5. PAYEE DETAILS", content: [
    `Account holder: ${input.accountHolder || input.payee || "To be provided"}.`,
    input.accountNumber ? `Account number: ${input.accountNumber}.` : "",
    input.ifsc ? `IFSC: ${input.ifsc}.` : "",
    input.upi ? `UPI ID: ${input.upi}.` : "",
  ].filter(Boolean) });
  clauses.push({ heading: "6. OTHER TERMS", content: [
    input.notes || "Any special commercial term, exception or procedure-specific rate must be approved in writing and recorded by the Hospital.",
    "Any amendment to this MOU applies only to unpaid future payouts. Amounts already paid will not be recalculated.",
  ] });
  clauses.push({ heading: "7. SIGNATURES", content: [
    "For TrueArtis Hospital: ____________________________    Date: __________________", 
    `${input.payee || "Payee"}: _________________________________    Date: __________________`,
  ] });

  const pages: string[][] = [[]];
  let lineCount = 0;
  const addLine = (line: string, bold = false) => {
    if (lineCount >= 47) {
      pages.push([]);
      lineCount = 0;
    }
    pages[pages.length - 1]?.push(`${bold ? "B|" : "N|"}${line}`);
    lineCount += bold ? 1.3 : 1;
  };
  addLine("TRUEARTIS HOSPITAL", true);
  addLine("MEMORANDUM OF UNDERSTANDING", true);
  addLine(`${input.role.toUpperCase()} AGREEMENT - ${input.payee || "PAYEE"}`);
  addLine("");
  clauses.forEach((clause) => {
    addLine(clause.heading, true);
    clause.content.forEach((item) => wrap(item).forEach((line) => addLine(line)));
    addLine("");
  });

  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", ""];
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  pages.forEach(() => {
    pageIds.push(objects.length + 1); objects.push("");
    contentIds.push(objects.length + 1); objects.push("");
  });
  const fontRegularId = objects.length + 1; objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBoldId = objects.length + 1; objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = contentIds[index];
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    let y = 790;
    let content = "BT\n";
    page.forEach((entry) => {
      const [weight, line] = entry.split("|", 2);
      const size = weight === "B" ? 11 : 9.3;
      content += `/${weight === "B" ? "F2" : "F1"} ${size} Tf 1 0 0 1 50 ${y.toFixed(1)} Tm (${escapePdf(line)}) Tj\n`;
      y -= weight === "B" ? 15 : 13;
    });
    content += `/F1 8 Tf 1 0 0 1 50 35 Tm (TrueArtis Hospital - Confidential) Tj\nET`;
    objects[contentId - 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${cleanFileName(input.payee || "trueartis")}-mou.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
