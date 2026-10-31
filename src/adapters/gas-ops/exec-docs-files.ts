/**
 * Файлы исполнительной документации (ADR-058): черновик акта docx, реестр xlsx и пакет zip.
 * Собираются на сервере из того же содержимого, что в предпросмотре. Пока документ не подписан,
 * в колонтитуле и первой строке стоит «Черновик»: подписывают люди, система только готовит.
 */
import type { ActPrint } from "@/domain/gas-ops/exec-docs";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const ZIP_MIME = "application/zip";

export interface RegistryPayload {
  objectLabel: string;
  version: number | null;
  headers: string[];
  rows: (string | number)[][];
  fileName: string;
  fileNameAscii: string;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Абзац; размер в половинах пункта, как требует формат */
function p(text: string, opts: { bold?: boolean; size?: number; center?: boolean } = {}): string {
  const props = [opts.bold ? "<w:b/>" : "", opts.size ? `<w:sz w:val="${opts.size}"/>` : ""].join(
    "",
  );
  const align = opts.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : "";
  return `<w:p>${align}<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function row(label: string, value: string): string {
  const cell = (text: string, width: number, bold = false) =>
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${p(text || " ", { bold })}</w:tc>`;
  return `<w:tr>${cell(label, 3600, true)}${cell(value || "_______________", 5800)}</w:tr>`;
}

function table(rows: { label: string; value: string }[]): string {
  const border =
    '<w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>';
  return `<w:tbl><w:tblPr><w:tblW w:w="9400" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3600"/><w:gridCol w:w="5800"/></w:tblGrid>${rows.map((r) => row(r.label, r.value)).join("")}</w:tbl>`;
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function actDocumentXml(act: ActPrint): string {
  const body = [
    act.draft
      ? p("Черновик. Не подписан, юридической силы не имеет.", { bold: true, center: true })
      : "",
    p(act.heading, { bold: true, size: 28, center: true }),
    p(`Объект: ${act.objectLabel}`),
    p(`Редакция ${act.version}. ${act.note}.`, { size: 18 }),
    ...act.sections.flatMap((s) => [p(s.title, { bold: true, size: 24 }), table(s.rows)]),
    p("Подписи", { bold: true, size: 24 }),
    ...act.signers.map((s) => p(`${s}    ____________ (подпись)`)),
  ].join("");
  const header = act.draft ? '<w:headerReference w:type="default" r:id="rIdHeader"/>' : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr>${header}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1418" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

/** Акт в docx: минимальный набор частей пакета Office Open XML */
export async function buildActDocx(act: ActPrint): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`,
  );
  zip.file(
    "word/header1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${p("Черновик", { bold: true, center: true })}</w:hdr>`,
  );
  zip.file("word/document.xml", actDocumentXml(act));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function buildRegistryXlsx(payload: RegistryPayload): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("Реестр ИД");
  ws.addRow([
    `Реестр исполнительной документации${payload.version === null ? ", текущий, не закрыт" : `, версия ${payload.version}`}`,
  ]).font = { bold: true };
  ws.addRow([`Объект: ${payload.objectLabel}`]);
  ws.addRow([
    "Черновик реестра: столбцы по разделу 5 общего журнала работ, сверить с приказом № 1026/пр",
  ]);
  ws.addRow([]);
  ws.addRow(payload.headers).font = { bold: true };
  for (const r of payload.rows) ws.addRow(r);
  [6, 52, 40, 16, 60, 16].forEach((width, i) => {
    ws.getColumn(i + 1).width = width;
  });
  const buffer = await book.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/** Пакет: акты docx и реестр xlsx одним архивом */
export async function buildPackageZip(
  acts: ActPrint[],
  registry: RegistryPayload,
): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const act of acts) zip.file(act.fileName, await buildActDocx(act));
  zip.file(registry.fileName, await buildRegistryXlsx(registry));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
