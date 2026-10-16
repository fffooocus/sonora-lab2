import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, Footer, PageNumber, ImageRun, Table, TableRow, TableCell, WidthType } from 'docx';
import { launchBrowser } from './browser.mjs';

const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const markdown = await readFile(path.join(docs, 'REPORT.md'), 'utf8');
const verification = JSON.parse(await readFile(path.join(docs, 'verification.json'), 'utf8'));
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const blocks = [];
let lines = markdown.split(/\r?\n/), i = 0;
while (i < lines.length) {
  const line = lines[i++];
  if (!line.trim()) continue;
  if (line.startsWith('```')) {
    const code = []; while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]); i++;
    blocks.push({ type: 'code', text: code.join('\n') }); continue;
  }
  const heading = /^(#{1,3}) (.+)/.exec(line);
  if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); continue; }
  const image = /^!\[(.+)\]\((.+)\)$/.exec(line);
  if (image) { blocks.push({ type: 'image', text: image[1], src: image[2] }); continue; }
  if (line.startsWith('|')) {
    const rows = [line]; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
    blocks.push({ type: 'table', rows: rows.filter(r => !/^\|[\s:|\-]+\|$/.test(r)).map(r => r.slice(1, -1).split('|').map(c => c.trim())) }); continue;
  }
  const paragraph = [line];
  while (i < lines.length && lines[i].trim() && !/^(#|```|\||!\[)/.test(lines[i])) paragraph.push(lines[i++]);
  blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
}
blocks.push({ type: 'heading', level: 2, text: 'Додаток. Протокол автоматизованої перевірки' });
blocks.push({ type: 'paragraph', text: `Середовище: ${verification.environment}. Успішних браузерних перевірок: ${verification.checksPassed}; помилок JavaScript: ${verification.errors.length}. Модульні перевірки виконуються окремо командою npm test. Нижче наведено сценарії з фактичного протоколу.` });
for (const text of verification.checks) blocks.push({ type: 'paragraph', text: `✓ ${text}` });

const body = blocks.map(block => {
  if (block.type === 'heading') return `<h${block.level}>${escape(block.text)}</h${block.level}>`;
  if (block.type === 'code') return `<pre>${escape(block.text)}</pre>`;
  if (block.type === 'image') return `<figure><img src="${escape(block.src)}" alt="${escape(block.text)}"><figcaption>${escape(block.text)}</figcaption></figure>`;
  if (block.type === 'table') return `<table>${block.rows.map((r, index) => `<tr>${r.map(c => `<${index === 0 ? 'th' : 'td'}>${escape(c)}</${index === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
  return `<p>${escape(block.text)}</p>`;
}).join('\n');
const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Звіт — SONORA · Лабораторна №2 · ІПС-41</title><style>
@page{size:A4;margin:20mm 20mm 22mm}*{box-sizing:border-box}body{font:14pt/1.5 'Times New Roman',serif;color:#151515;margin:0}a{color:inherit}h2{font-size:16pt;margin:22pt 0 10pt;break-after:avoid}h3{font-size:14pt;margin:16pt 0 8pt;break-after:avoid}p{text-align:justify;margin:0 0 10pt;orphans:3;widows:3}table{border-collapse:collapse;width:100%;font-size:10.5pt;line-height:1.35;margin:12pt 0;table-layout:fixed;break-inside:auto}tr{break-inside:avoid}th,td{border:1px solid #aaa;padding:7pt;overflow-wrap:anywhere;vertical-align:top}th{background:#edf0eb;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f2ed;padding:12pt;font:11pt/1.5 Consolas,monospace;break-inside:avoid}figure{margin:20pt 0;break-inside:avoid}figure img{display:block;width:100%;max-height:205mm;object-fit:contain}figcaption{text-align:center;font-size:11pt;line-height:1.4;margin-top:8pt}.title{height:252mm;display:flex;flex-direction:column;align-items:center;text-align:center;break-after:page;padding-top:40mm}.title h1{font-size:24pt;line-height:1.4;margin:14mm 0 7mm}.title .topic{font-size:16pt;max-width:145mm;line-height:1.6}.title .author{text-align:left;align-self:flex-end;font-size:14pt;line-height:1.8;margin-top:28mm}.title .year{margin-top:auto;padding-bottom:5mm}.title .variant{margin-top:8mm;font-size:15pt}.title .name{font-size:30pt;letter-spacing:4pt;color:#354b39}
</style></head><body><section class="title"><div class="name">SONORA</div><h1>ЛАБОРАТОРНА РОБОТА №2</h1><div class="topic">Розробка мультимедійного застосунку<br>з використанням сучасних технологій</div><div class="variant">Варіант 2. Соніфікація даних</div><div class="author">Виконав:<br>Левківський Євгеній Сергійович<br>Група ІПС-41</div><div class="year">2026</div></section>${body}</body></html>`;
await writeFile(path.join(docs, 'report.html'), html);

const paragraph = (text, extra = {}) => new Paragraph({ children: [new TextRun({ text, size: 28, font: 'Times New Roman' })], spacing: { after: 160, line: 360 }, alignment: AlignmentType.JUSTIFIED, ...extra });
const children = [
  paragraph('SONORA', { alignment: AlignmentType.CENTER, spacing: { before: 1700, after: 600 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ЛАБОРАТОРНА РОБОТА №2', bold: true, size: 36 })], spacing: { after: 400 } }),
  paragraph('Розробка мультимедійного застосунку', { alignment: AlignmentType.CENTER }),
  paragraph('з використанням сучасних технологій', { alignment: AlignmentType.CENTER }),
  paragraph('Варіант 2. Соніфікація даних', { alignment: AlignmentType.CENTER, spacing: { before: 300, after: 900 } }),
  paragraph('Виконав:', { alignment: AlignmentType.RIGHT }),
  paragraph('Левківський Євгеній Сергійович', { alignment: AlignmentType.RIGHT }),
  paragraph('Група ІПС-41', { alignment: AlignmentType.RIGHT, spacing: { after: 1300 } }),
  paragraph('2026', { alignment: AlignmentType.CENTER }),
  new Paragraph({ children: [new PageBreak()] })
];
for (const block of blocks) {
  if (block.type === 'heading') {
    children.push(new Paragraph({ heading: block.level <= 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, children: [new TextRun({ text: block.text, font: 'Times New Roman', size: block.level <= 2 ? 32 : 28, bold: true })], keepNext: true, spacing: { before: 280, after: 160 } }));
  } else if (block.type === 'code') {
    for (const line of block.text.split('\n')) children.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas', size: 22 })], spacing: { after: 60, line: 280 }, shading: { fill: 'F1F3EE' } }));
  } else if (block.type === 'table') {
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: block.rows.map((row, index) => new TableRow({ tableHeader: index === 0, cantSplit: true, children: row.map(text => new TableCell({ shading: index === 0 ? { fill: 'EDF0EB' } : undefined, children: [new Paragraph({ children: [new TextRun({ text, font: 'Times New Roman', size: 21, bold: index === 0 })], spacing: { after: 80, line: 260 } })] })) })) }));
    children.push(new Paragraph(''));
  } else if (block.type === 'image') {
    const data = await readFile(path.join(docs, block.src));
    const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
    const ratio = Math.min(635 / width, 720 / height);
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data, type: 'png', transformation: { width: Math.round(width * ratio), height: Math.round(height * ratio) }, altText: { title: block.text, description: block.text, name: block.src } })] }));
    children.push(paragraph(block.text, { alignment: AlignmentType.CENTER, keepNext: false }));
  } else children.push(paragraph(block.text));
}
const document = new Document({ creator: 'Левківський Євгеній Сергійович', title: 'Лабораторна робота №2 — SONORA', description: 'Варіант 2. Соніфікація даних. ІПС-41.', styles: { default: { document: { run: { font: 'Times New Roman', size: 28 }, paragraph: { spacing: { line: 360 } } } } }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1247, left: 1134, right: 1134 }, pageNumbers: { start: 1 } }, titlePage: true }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 22 })] })] }) }, children }] });
await writeFile(path.join(docs, 'report.docx'), await Packer.toBuffer(document));
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.goto(new URL('../docs/report.html', import.meta.url).href);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  await page.pdf({ path: path.join(docs, 'report.pdf'), format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font:10px Times New Roman;width:100%;text-align:center;color:#666"><span class="pageNumber"></span></div>', preferCSSPageSize: true });
} finally { await browser.close(); }
for (const name of ['report.html', 'report.docx', 'report.pdf']) console.log(`${name}: ${(await stat(path.join(docs, name))).size} bytes`);
