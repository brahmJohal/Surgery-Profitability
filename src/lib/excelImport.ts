export type ImportedReconciliation = {
  caseRef: string;
  payee: string;
  type:
    | "Doctor"
    | "Referral"
    | "Anaesthetist"
    | "Partner"
    | "Vendor"
    | "Lab"
    | "Rental"
    | "Implant"
    | "Other";
  surgeryAmount: number;
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

function entriesFromRows(rows: string[][]): ImportedReconciliation[] {
  const [header, ...data] = rows;
  if (!header) throw new Error("The file is empty.");
  const columns = header.map(normaliseHeader);
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
      partner: "Partner",
      vendor: "Vendor",
      lab: "Lab",
      rental: "Rental",
      implant: "Implant",
      other: "Other",
    };
    const type = typeByValue[typeValue] || null;
    const surgeryAmount = amountValue(row[indexOf("surgeryamount")] || "");
    const caseRef = (row[indexOf("casereference")] || "").trim();
    const payee = (row[indexOf("payee")] || "").trim();
    if (!caseRef && !payee && !typeValue && !surgeryAmount) return [];
    if (
      !caseRef ||
      !payee ||
      !type ||
      !Number.isFinite(surgeryAmount) ||
      surgeryAmount < 0
    ) {
      invalid.push(rowIndex + 2);
      return [];
    }
    return [{ caseRef, payee, type, surgeryAmount }];
  });
  if (invalid.length)
    throw new Error(
      `Fix row${invalid.length > 1 ? "s" : ""} ${invalid.join(", ")}. Type must be Doctor, Referral, Anaesthetist, Partner, Vendor, Lab, Rental, Implant, or Other; surgery amount must be valid.`,
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
