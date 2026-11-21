import { salesLink, SALES_HOST, SALES_URL } from './invite';
import { formatAmounts, type Section, type ShopLine } from './shopping';

type Group = { section: Section; lines: ShopLine[] };

const INK: [number, number, number] = [17, 29, 36];
const BLUE: [number, number, number] = [13, 165, 232];
const GREEN: [number, number, number] = [66, 146, 75];
const GREEN_DK: [number, number, number] = [47, 122, 59];
const GRAY: [number, number, number] = [95, 112, 122];
const LINE: [number, number, number] = [221, 232, 238];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const FOOT_TOP = 250; // o rodapé (QR code) começa aqui
const CONTENT_BOTTOM = FOOT_TOP - 6;

const MAP: Record<string, string> = {
  '–': '-', '—': '-', '−': '-', '•': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...',
  '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', ' ': ' ',
};

/** A fonte padrão do PDF (Helvetica) cobre o Latin-1; troca o que ficar de fora por equivalentes simples. */
export function pdfText(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    if (MAP[ch] !== undefined) out += MAP[ch];
    else if (ch.codePointAt(0)! <= 0xff) out += ch;
    else if (/[‍️]/.test(ch)) continue;
    else out += ' ';
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}icons/logo-mark.png`);
    if (!res.ok) return null;
    const blob = await res.blob();
    try {
      // Reduz para 360 px de largura (o PDF usa a logo com ~17 mm): arquivo bem menor.
      const bmp = await createImageBitmap(blob);
      const w = 360;
      const h = Math.round((bmp.height * w) / bmp.width);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      return cv.toDataURL('image/png');
    } catch {
      /* usa o arquivo original */
    }
    return await new Promise<string>((ok, no) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result));
      fr.onerror = () => no(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Gera o PDF A4 da lista de compras (só o que falta comprar), com a logo e o QR code do site. */
export async function buildShoppingPdf(
  groups: Group[],
  done: ReadonlySet<string>,
  now: Date = new Date(),
): Promise<Blob> {
  const [{ jsPDF }, qrMod, logo] = await Promise.all([import('jspdf'), import('qrcode-generator'), loadLogo()]);
  // O pacote é CommonJS/ESM misto: a função pode vir em .default ou direto no módulo.
  type Factory = typeof import('qrcode-generator');
  const qrcode = ((qrMod as unknown as { default?: Factory }).default ?? (qrMod as unknown as Factory)) as Factory;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({
    title: 'Lista de compras · CongelaFit Premium',
    author: 'CongelaFit',
    subject: 'Lista de compras',
    creator: 'CongelaFit Premium',
  });

  const open = groups
    .map((g) => ({ section: g.section, lines: g.lines.filter((l) => !done.has(l.key)) }))
    .filter((g) => g.lines.length > 0);
  const count = open.reduce((n, g) => n + g.lines.length, 0);

  const header = () => {
    let x = MARGIN;
    if (logo) {
      const h = 11;
      doc.addImage(logo, 'PNG', MARGIN, 11, (h * 888) / 558, h);
      x = MARGIN + (h * 888) / 558 + 3.5;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...BLUE);
    doc.text('CONGELA', x, 20);
    x += doc.getTextWidth('CONGELA');
    doc.setTextColor(...GREEN);
    doc.text('FIT', x, 20);
    x += doc.getTextWidth('FIT') + 2;
    doc.setTextColor(...INK);
    doc.text('PREMIUM', x, 20);
    doc.setFillColor(...BLUE);
    doc.rect(MARGIN, 26, (PAGE_W - 2 * MARGIN) * 0.6, 1.1, 'F');
    doc.setFillColor(...GREEN);
    doc.rect(MARGIN + (PAGE_W - 2 * MARGIN) * 0.6, 26, (PAGE_W - 2 * MARGIN) * 0.4, 1.1, 'F');
  };

  header();
  let y = 40;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.setTextColor(...INK);
  doc.text('Lista de compras', MARGIN, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  const when = now.toLocaleDateString('pt-BR');
  doc.text(
    count === 0 ? `Tudo comprado! · ${when}` : `${count} ${count === 1 ? 'item' : 'itens'} para comprar · ${when}`,
    MARGIN,
    y,
  );
  y += 9;

  const newPage = () => {
    doc.addPage();
    header();
    y = 36;
  };

  const NAME_X = MARGIN + 8;
  const NAME_W = 104;
  const AMT_X = PAGE_W - MARGIN;
  const AMT_W = 58;
  const LH = 4.9;

  for (const g of open) {
    // Título da seção (não deixa sozinho no fim da página).
    if (y + 9 + 9 > CONTENT_BOTTOM) newPage();
    y += 2;
    doc.setFillColor(...GREEN);
    doc.rect(MARGIN, y - 3.6, 1.4, 4.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...GREEN_DK);
    doc.text(pdfText(g.section.name).toUpperCase(), MARGIN + 3.4, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(`${g.lines.length}`, PAGE_W - MARGIN, y, { align: 'right' });
    y += 3;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 5.2;

    for (const l of g.lines) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const nameLines = doc.splitTextToSize(pdfText(l.name), NAME_W) as string[];
      const amt = pdfText(formatAmounts(l));
      doc.setFontSize(10);
      const amtLines = amt ? (doc.splitTextToSize(amt, AMT_W) as string[]) : [];
      const rows = Math.max(nameLines.length, amtLines.length, 1);
      const h = rows * LH + 2.4;
      if (y + h > CONTENT_BOTTOM) newPage();

      doc.setDrawColor(...GRAY);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN + 0.4, y - 3.3, 3.8, 3.8, 'S');
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      nameLines.forEach((t, i) => doc.text(t, NAME_X, y + i * LH));
      doc.setFontSize(10);
      doc.setTextColor(...GRAY);
      amtLines.forEach((t, i) => doc.text(t, AMT_X, y + i * LH, { align: 'right' }));

      y += h;
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.15);
      doc.line(NAME_X, y - 3.6, PAGE_W - MARGIN, y - 3.6);
    }
    y += 2;
  }

  if (count === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...GRAY);
    doc.text('Nenhum item pendente. Boas compras e boas receitas!', MARGIN, y);
  }

  // QR code em todas as páginas.
  const url = salesLink('pdf', 'lista-de-compras');
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const SIZE = 28;
  const cell = SIZE / (n + 4);
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, FOOT_TOP, PAGE_W - MARGIN, FOOT_TOP);

    const qx = MARGIN;
    const qy = FOOT_TOP + 5;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...LINE);
    doc.roundedRect(qx, qy, SIZE, SIZE, 1.5, 1.5, 'FD');
    doc.setFillColor(...INK);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) doc.rect(qx + (c + 2) * cell, qy + (r + 2) * cell, cell + 0.03, cell + 0.03, 'F');
      }
    }
    doc.link(qx, qy, SIZE, SIZE, { url });

    const tx = qx + SIZE + 7;
    const tw = PAGE_W - MARGIN - tx;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text('Monte sua lista em segundos', tx, qy + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    const pitch = doc.splitTextToSize(
      'No CongelaFit Premium você escolhe as receitas da semana e o app soma os ingredientes, separa por seção do mercado e ainda controla a validade do que está no freezer.',
      tw,
    ) as string[];
    pitch.forEach((t, i) => doc.text(t, tx, qy + 12 + i * 4.2));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...BLUE);
    const cta = `Aponte a câmera para o QR code ou acesse ${SALES_HOST}`;
    doc.textWithLink(pdfText(cta), tx, qy + 12 + pitch.length * 4.2 + 3, { url: SALES_URL });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Página ${p} de ${pages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
  }

  return doc.output('blob');
}
