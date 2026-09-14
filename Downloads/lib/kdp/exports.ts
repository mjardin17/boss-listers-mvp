import { randomUUID } from "crypto";
import JSZip from "jszip";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun
} from "docx";
import type { ExportResult, KdpPackage } from "./types";

const MIME = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  metadata: "application/json"
};

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "storyforge-book";
}

function paragraphs(manuscript: string) {
  return manuscript
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function chapters(manuscript: string) {
  const parts = manuscript
    .replace(/\r\n/g, "\n")
    .split(/(?=^chapter\s+\d+|^chapter\s+[a-z]+|^prologue|^epilogue)/gim)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [manuscript.trim()];
}

function trimSize(packageData: KdpPackage) {
  switch (packageData.metadata.trimSize) {
    case "5x8":
      return [360, 576] as const;
    case "5.5x8.5":
      return [396, 612] as const;
    default:
      return [432, 648] as const;
  }
}

export async function buildPdfExport(packageData: KdpPackage): Promise<ExportResult> {
  const [width, height] = trimSize(packageData);
  return {
    fileName: `${slug(packageData.metadata.title)}-kdp-interior.pdf`,
    mimeType: MIME.pdf,
    buffer: buildSimplePdf({
      title: packageData.metadata.title,
      subtitle: packageData.metadata.subtitle,
      author: packageData.metadata.authorName,
      manuscript: packageData.input.book.manuscript,
      width,
      height
    })
  };
}

export async function buildDocxExport(packageData: KdpPackage): Promise<ExportResult> {
  const children: Paragraph[] = [
    new Paragraph({
      text: packageData.metadata.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER
    })
  ];
  if (packageData.metadata.subtitle) {
    children.push(new Paragraph({ text: packageData.metadata.subtitle, alignment: AlignmentType.CENTER }));
  }
  children.push(new Paragraph({ text: `by ${packageData.metadata.authorName}`, alignment: AlignmentType.CENTER }));

  for (const chapter of chapters(packageData.input.book.manuscript)) {
    const [first, ...rest] = chapter.split("\n");
    const isHeading = /^chapter\s+|^prologue|^epilogue/i.test(first.trim());
    if (isHeading) {
      children.push(new Paragraph({ text: first.trim(), heading: HeadingLevel.HEADING_1 }));
    }
    const body = isHeading ? rest.join("\n") : chapter;
    for (const paragraph of paragraphs(body)) {
      children.push(
        new Paragraph({
          children: [new TextRun(paragraph)],
          spacing: { after: 180 },
          indent: { firstLine: 360 }
        })
      );
    }
  }

  const document = new Document({
    creator: "StoryForge",
    title: packageData.metadata.title,
    description: packageData.metadata.descriptionPlain,
    sections: [{ children }]
  });

  return {
    fileName: `${slug(packageData.metadata.title)}-kdp-manuscript.docx`,
    mimeType: MIME.docx,
    buffer: await Packer.toBuffer(document)
  };
}

export async function buildEpubExport(packageData: KdpPackage): Promise<ExportResult> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    xml`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const chapterList = chapters(packageData.input.book.manuscript);
  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const navItems: string[] = [];

  chapterList.forEach((chapter, index) => {
    const id = `chapter-${index + 1}`;
    const [first, ...rest] = chapter.split("\n");
    const isHeading = /^chapter\s+|^prologue|^epilogue/i.test(first.trim());
    const title = isHeading ? first.trim() : `Chapter ${index + 1}`;
    const body = isHeading ? rest.join("\n") : chapter;
    manifestItems.push(`<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${id}"/>`);
    navItems.push(`<li><a href="${id}.xhtml">${escapeXml(title)}</a></li>`);
    zip.file(
      `OEBPS/${id}.xhtml`,
      xml`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${packageData.metadata.language}">
  <head>
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <h1>${escapeXml(title)}</h1>
    ${paragraphs(body).map((paragraph) => `<p>${escapeXml(paragraph)}</p>`).join("\n")}
  </body>
</html>`
    );
  });

  zip.file(
    "OEBPS/nav.xhtml",
    xml`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Table of Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>${navItems.join("\n")}</ol>
    </nav>
  </body>
</html>`
  );
  zip.file("OEBPS/style.css", "body{font-family:serif;line-height:1.45;} h1{text-align:center;} p{text-indent:1.5em;margin:0 0 1em;}");
  zip.file(
    "OEBPS/content.opf",
    xml`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${randomUUID()}</dc:identifier>
    <dc:title>${escapeXml(packageData.metadata.title)}</dc:title>
    <dc:creator>${escapeXml(packageData.metadata.authorName)}</dc:creator>
    <dc:language>${escapeXml(packageData.metadata.language)}</dc:language>
    <dc:description>${escapeXml(packageData.metadata.descriptionPlain)}</dc:description>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="style.css" media-type="text/css"/>
    ${manifestItems.join("\n")}
  </manifest>
  <spine>
    ${spineItems.join("\n")}
  </spine>
</package>`
  );

  return {
    fileName: `${slug(packageData.metadata.title)}-kdp-ebook.epub`,
    mimeType: MIME.epub,
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  };
}

export async function buildMetadataExport(packageData: KdpPackage): Promise<ExportResult> {
  const payload = {
    book: packageData.input.book,
    author: packageData.input.author,
    series: packageData.input.series,
    kdp: packageData.metadata
  };
  return {
    fileName: `${slug(packageData.metadata.title)}-kdp-metadata.json`,
    mimeType: MIME.metadata,
    buffer: Buffer.from(JSON.stringify(payload, null, 2), "utf8")
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xml(strings: TemplateStringsArray, ...values: string[]) {
  return strings.reduce((output, part, index) => output + part + (values[index] || ""), "");
}

function buildSimplePdf({
  title,
  subtitle,
  author,
  manuscript,
  width,
  height
}: {
  title: string;
  subtitle: string;
  author: string;
  manuscript: string;
  width: number;
  height: number;
}) {
  const margin = 54;
  const bodySize = 11;
  const lineHeight = 15;
  const maxChars = Math.max(42, Math.floor((width - margin * 2) / 5.2));
  const pages: string[][] = [];
  let current: string[] = [];

  function pushLine(line: string) {
    if (current.length >= Math.floor((height - margin * 2) / lineHeight)) {
      pages.push(current);
      current = [];
    }
    current.push(line);
  }

  pages.push([
    `TITLE:${title}`,
    subtitle ? `SUBTITLE:${subtitle}` : "",
    `AUTHOR:by ${author}`
  ].filter(Boolean));

  for (const chapter of chapters(manuscript)) {
    const [first, ...rest] = chapter.split("\n");
    const isHeading = /^chapter\s+|^prologue|^epilogue/i.test(first.trim());
    if (current.length) {
      pages.push(current);
      current = [];
    }
    if (isHeading) pushLine(`HEADING:${first.trim()}`);
    const body = isHeading ? rest.join("\n") : chapter;
    for (const paragraph of paragraphs(body)) {
      const words = paragraph.split(/\s+/);
      let line = "";
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > maxChars) {
          pushLine(line);
          line = word;
        } else {
          line = next;
        }
      }
      if (line) pushLine(line);
      pushLine("");
    }
  }
  if (current.length) pages.push(current);

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const fontRegularId = 3;
  const fontBoldId = 4;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[fontRegularId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>";
  objects[fontBoldId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>";

  let nextObjectId = 5;
  for (const pageLines of pages) {
    const contentId = nextObjectId++;
    const pageId = nextObjectId++;
    const stream = pdfStream(pageLines, { width, height, margin, bodySize, lineHeight });
    pageObjectIds.push(pageId);
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
  }
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "binary");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

function pdfStream(
  lines: string[],
  settings: { width: number; height: number; margin: number; bodySize: number; lineHeight: number }
) {
  const commands = ["BT"];
  let y = settings.height - settings.margin;
  for (const rawLine of lines) {
    const isTitle = rawLine.startsWith("TITLE:");
    const isSubtitle = rawLine.startsWith("SUBTITLE:");
    const isAuthor = rawLine.startsWith("AUTHOR:");
    const isHeading = rawLine.startsWith("HEADING:");
    const text = rawLine.replace(/^(TITLE:|SUBTITLE:|AUTHOR:|HEADING:)/, "");
    const size = isTitle ? 22 : isSubtitle || isHeading ? 15 : isAuthor ? 13 : settings.bodySize;
    const font = isTitle || isHeading ? "F2" : "F1";
    const x = isTitle || isSubtitle || isAuthor || isHeading
      ? Math.max(settings.margin, (settings.width - text.length * size * 0.45) / 2)
      : settings.margin;
    commands.push(`/${font} ${size} Tf`);
    commands.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdf(text)}) Tj`);
    y -= isTitle ? 34 : isSubtitle || isAuthor || isHeading ? 24 : settings.lineHeight;
  }
  commands.push("ET");
  return commands.join("\n");
}

function escapePdf(value: string) {
  return value
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}
