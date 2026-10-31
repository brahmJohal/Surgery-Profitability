export type ImportedReconciliation = {
  caseRef: string;
  surgeryName: string;
  patientName: string;
  patientPhone: string;
  uhid: string;
  hospitalName: string;
  admissionDate: string;
  dischargeDate: string;
  totalExpense: number;
  reportedProfit: number;
  payee: string;
  type:
    | "Doctor"
    | "Referral"
    | "Anaesthetist"
    | "Assistant Surgeon"
    | "Partner"
    | "Vendor"
    | "Lab"
    | "Rental"
    | "Implant"
    | "Other";
  surgeryAmount: number;
  externalLab: number;
  implant: number;
  patientSource: string;
  caseType: string;
  partnerType: string;
  dci: number;
  crossConsultation: number;
  referralCommission: number;
  externalDiagnostics: number;
  anaesthetist: number;
  anaesthesiaHours: number;
  assistantSurgeon: number;
  consumables: number;
  specialEquipment: number;
  externalVisit: number;
  b2bPartnerPayout: number;
  bloodProcurement: number;
  corporateDiscountAdjustment: number;
  customPayout: number;
  emiReimbursementCost: number;
  medicalEquipmentRental: number;
  outsideLabPayout: number;
  referralPayout: number;
  surgeonPayout: number;
  visitingConsultantFee: number;
};

const normaliseHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, "");
const requiredHeaders = ["casereference", "payee", "type", "surgeryamount"];

function amountValue(value: string) {
  const cleaned = value.trim().replace(/[₹,\s]/g, "");
  // Finance exports sometimes use periods as thousand separators (e.g. 45.000 = 45,000).
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned))
    return Number(cleaned.replace(/\./g, ""));
  return Number(cleaned);
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

async function xlsxRows(file: File): Promise<string[][]> {
  if (!("DecompressionStream" in window))
    throw new Error(
      "Your browser cannot read .xlsx files. Please save it as CSV and import again.",
    );
  const files = new Map<string, Uint8Array>();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 0;
  while (cursor < bytes.length - 4) {
    if (view.getUint32(cursor, true) !== 0x04034b50) {
      cursor += 1;
      continue;
    }
    const method = view.getUint16(cursor + 8, true);
    const compressedSize = view.getUint32(cursor + 18, true);
    const nameLength = view.getUint16(cursor + 26, true);
    const extraLength = view.getUint16(cursor + 28, true);
    const name = new TextDecoder().decode(
      bytes.slice(cursor + 30, cursor + 30 + nameLength),
    );
    const contentsStart = cursor + 30 + nameLength + extraLength;
    const compressed = bytes.slice(
      contentsStart,
      contentsStart + compressedSize,
    );
    if (method === 0) files.set(name, compressed);
    if (method === 8) {
      const stream = new Blob([compressed])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      files.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
    }
    cursor = contentsStart + compressedSize;
  }
  const decode = (path: string) =>
    new TextDecoder().decode(files.get(path) || new Uint8Array());
  const sharedStrings = [
    ...new DOMParser()
      .parseFromString(decode("xl/sharedStrings.xml"), "application/xml")
      .querySelectorAll("si"),
  ].map((item) =>
    [...item.querySelectorAll("t")]
      .map((part) => part.textContent || "")
      .join(""),
  );
  const sheet = new DOMParser().parseFromString(
    decode("xl/worksheets/sheet1.xml"),
    "application/xml",
  );
  return [...sheet.querySelectorAll("row")].map((row) =>
    [...row.querySelectorAll("c")].map((cell) => {
      const type = cell.getAttribute("t");
      if (type === "inlineStr")
        return [...cell.querySelectorAll("is t")]
          .map((part) => part.textContent || "")
          .join("");
      const value = cell.querySelector("v")?.textContent || "";
      return type === "s" ? sharedStrings[Number(value)] || "" : value;
    }),
  );
}

function hospitalSheetEntries(
  columns: string[],
  data: string[][],
): ImportedReconciliation[] {
  const indexOf = (name: string) => columns.indexOf(name);
  const textAt = (row: string[], name: string) => {
    const index = indexOf(name);
    return index < 0 ? "" : (row[index] || "").trim();
  };
  const amountAt = (row: string[], name: string) => {
    const value = textAt(row, name);
    return value ? amountValue(value) : 0;
  };
  const comparableName = (name: string) =>
    name.toLowerCase().replace(/\bdr\.?\s*/g, "").replace(/[^a-z0-9]/g, "");
  const invalid: number[] = [];
  const entries = data.flatMap((row, rowIndex) => {
    const caseRef = textAt(row, "ipdnumber");
    const doctorName = textAt(row, "doctorname");
    const referrerName = textAt(row, "referrername");
    const partnerName = textAt(row, "partnerleadname");
    const anaesthetistName = textAt(row, "anaesthetistname");
    const surgeryAmount = amountAt(row, "totalrevenue") || amountAt(row, "netbilledamount");
    if (!caseRef && !doctorName && !partnerName && !anaesthetistName) return [];
    if (!caseRef || !Number.isFinite(surgeryAmount) || surgeryAmount < 0) {
      invalid.push(rowIndex + 2);
      return [];
    }
    const shared = {
      caseRef,
      surgeryName: textAt(row, "surgerynames"),
      patientName: textAt(row, "patientname"),
      patientPhone: textAt(row, "patientphone"),
      uhid: textAt(row, "uhid"),
      hospitalName: textAt(row, "hospitalname"),
      admissionDate: textAt(row, "admissiondate"),
      dischargeDate: textAt(row, "dischargedate"),
      totalExpense: amountAt(row, "totalexpense"),
      reportedProfit: amountAt(row, "profit"),
      surgeryAmount,
      externalLab: amountAt(row, "externallabvendorcost"),
      implant: amountAt(row, "implantcosthospital"),
      dci: 0,
      crossConsultation: 0,
      referralCommission: 0,
      externalDiagnostics: amountAt(row, "internallabcost"),
      anaesthetist: amountAt(row, "anaesthetistpayout"),
      anaesthesiaHours: 1,
      assistantSurgeon: amountAt(row, "assistantsurgeonpayout"),
      consumables: amountAt(row, "consumablerevenue"),
      specialEquipment: 0,
      externalVisit: amountAt(row, "visitingconsultantfee"),
      b2bPartnerPayout: amountAt(row, "b2bpartnerpayout"),
      bloodProcurement: amountAt(row, "bloodprocurement"),
      corporateDiscountAdjustment: amountAt(row, "corporatediscountadjustment"),
      customPayout: amountAt(row, "custompayout") + amountAt(row, "otherpatientexpense"),
      emiReimbursementCost: amountAt(row, "emifinancecharges"),
      medicalEquipmentRental: amountAt(row, "medicalequipmentrentalpatient"),
      outsideLabPayout: amountAt(row, "outsidelabpayout"),
      referralPayout: amountAt(row, "referralpayout"),
      surgeonPayout: amountAt(row, "surgeonpayout"),
      visitingConsultantFee: amountAt(row, "visitingconsultantfee"),
    };
    const referrerIsDoctor = Boolean(doctorName && referrerName && comparableName(doctorName) === comparableName(referrerName));
    const caseType = /insurance|tpa/i.test(textAt(row, "billpaymentstatus")) ? "insurance" : "cash";
    const leadAttribution = textAt(row, "leadattribution");
    const partnerType = !leadAttribution
      ? ""
      : /doctor|both/i.test(leadAttribution)
        ? "partner patient and doctor"
        : "partner patient only";
    const payouts: ImportedReconciliation[] = [];
    if (doctorName) payouts.push({ ...shared, payee: doctorName, type: "Doctor", patientSource: referrerIsDoctor ? "doctor patient" : "hospital patient", caseType, partnerType });
    if (referrerName && !referrerIsDoctor) payouts.push({ ...shared, payee: referrerName, type: "Referral", patientSource: "", caseType, partnerType });
    if (partnerName) payouts.push({ ...shared, payee: partnerName, type: "Partner", patientSource: "", caseType, partnerType });
    if (anaesthetistName) payouts.push({ ...shared, payee: anaesthetistName, type: "Anaesthetist", patientSource: "", caseType, partnerType });
    return payouts;
  });
  if (invalid.length) throw new Error(`Fix row${invalid.length > 1 ? "s" : ""} ${invalid.join(", ")}. IPD Number and Total Revenue are required.`);
  if (!entries.length) throw new Error("No doctor, referral, partner, or anaesthetist names were found.");
  return entries;
}

function entriesFromRows(rows: string[][]): ImportedReconciliation[] {
  const [header, ...data] = rows;
  if (!header) throw new Error("The file is empty.");
  const columns = header.map(normaliseHeader);
  if (columns.includes("ipdnumber")) return hospitalSheetEntries(columns, data);
  const missing = requiredHeaders.filter((name) => !columns.includes(name));
  if (missing.length)
    throw new Error(
      "Required columns: Case Reference, Payee, Type, Surgery Amount.",
    );
  const indexOf = (name: string) => columns.indexOf(name);
  const invalid: number[] = [];
  const entries = data.flatMap((row, rowIndex) => {
    const typeValue = (row[indexOf("type")] || "")
      .trim()
      .toLowerCase()
      .replace(/[ _-]+/g, "");
    const typeByValue: Record<string, ImportedReconciliation["type"]> = {
      doctor: "Doctor",
      referral: "Referral",
      anaesthetist: "Anaesthetist",
      anesthetist: "Anaesthetist",
      assistantsurgeon: "Assistant Surgeon",
      assistant: "Assistant Surgeon",
      partner: "Partner",
      vendor: "Vendor",
      lab: "Lab",
      rental: "Rental",
      implant: "Implant",
      other: "Other",
    };
    const type = typeByValue[typeValue] || null;
    const surgeryAmount = amountValue(row[indexOf("surgeryamount")] || "");
    const optionalAmount = (name: string) => {
      const index = indexOf(name);
      return index < 0 || !(row[index] || "").trim()
        ? 0
        : amountValue(row[index] || "");
    };
    const externalLab = optionalAmount("externallab");
    const implant = optionalAmount("implant");
    const dci = optionalAmount("dci");
    const crossConsultation = optionalAmount("crossconsultation");
    const referralCommission = optionalAmount("referralcommission");
    const externalDiagnostics = optionalAmount("externaldiagnostics");
    const anaesthetist = optionalAmount("anaesthetist");
    const anaesthesiaHours = optionalAmount("anaesthesiahours") || optionalAmount("anesthesiahours");
    const assistantSurgeon = optionalAmount("assistantsurgeon");
    const consumables = optionalAmount("consumables");
    const specialEquipment = optionalAmount("specialequipment");
    const externalVisit = optionalAmount("externalvisit");
    const b2bPartnerPayout = optionalAmount("b2bpartnerpayout");
    const bloodProcurement = optionalAmount("bloodprocurement");
    const corporateDiscountAdjustment = optionalAmount("corporatediscountadjustment");
    const customPayout = optionalAmount("custompayout");
    const emiReimbursementCost = optionalAmount("emireimbursementcost");
    const medicalEquipmentRental = optionalAmount("medicalequipmentrental");
    const outsideLabPayout = optionalAmount("outsidelabpayout");
    const referralPayout = optionalAmount("referralpayout");
    const surgeonPayout = optionalAmount("surgeonpayout");
    const visitingConsultantFee = optionalAmount("visitingconsultantfee");
    const patientSource = (row[indexOf("patientsource")] || "").trim();
    const caseType = (row[indexOf("casetype")] || "").trim();
    const partnerType = (row[indexOf("partnertype")] || "").trim();
    const caseRef = (row[indexOf("casereference")] || "").trim();
    const surgeryName = (
      row[indexOf("surgeryname")] ||
      row[indexOf("surgery")] ||
      row[indexOf("procedure")] ||
      ""
    ).trim();
    const payee = (row[indexOf("payee")] || "").trim();
    if (!caseRef && !payee && !typeValue && !surgeryAmount) return [];
    if (
      !caseRef ||
      !payee ||
      !type ||
      !Number.isFinite(surgeryAmount) ||
      surgeryAmount < 0 ||
      !Number.isFinite(externalLab) ||
      !Number.isFinite(implant) ||
      [externalLab, implant, dci, crossConsultation, referralCommission, externalDiagnostics, anaesthetist, anaesthesiaHours, assistantSurgeon, consumables, specialEquipment, externalVisit, b2bPartnerPayout, bloodProcurement, corporateDiscountAdjustment, customPayout, emiReimbursementCost, medicalEquipmentRental, outsideLabPayout, referralPayout, surgeonPayout, visitingConsultantFee].some((amount) => !Number.isFinite(amount) || amount < 0)
    ) {
      invalid.push(rowIndex + 2);
      return [];
    }
    return [{ caseRef, surgeryName, patientName: "", patientPhone: "", uhid: "", hospitalName: "", admissionDate: "", dischargeDate: "", totalExpense: 0, reportedProfit: 0, payee, type, surgeryAmount, externalLab, implant, patientSource, caseType, partnerType, dci, crossConsultation, referralCommission, externalDiagnostics, anaesthetist, anaesthesiaHours, assistantSurgeon, consumables, specialEquipment, externalVisit, b2bPartnerPayout, bloodProcurement, corporateDiscountAdjustment, customPayout, emiReimbursementCost, medicalEquipmentRental, outsideLabPayout, referralPayout, surgeonPayout, visitingConsultantFee }];
  });
  if (invalid.length)
    throw new Error(
      `Fix row${invalid.length > 1 ? "s" : ""} ${invalid.join(", ")}. Type must be Doctor, Referral, Anaesthetist, Assistant Surgeon, Partner, Vendor, Lab, Rental, Implant, or Other; all amounts must be valid.`,
    );
  if (!entries.length) throw new Error("No reconciliation rows were found.");
  return entries;
}

export async function importReconciliationFile(file: File) {
  const rows = file.name.toLowerCase().endsWith(".csv")
    ? csvRows(await file.text())
    : await xlsxRows(file);
  return entriesFromRows(rows);
}
