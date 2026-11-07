/** Minimal Code128-B barcode → SVG (no external deps). */

const PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','233111','200000'
];

const START_B = 104;
const STOP = 106;

function code128Values(text) {
  const values = [START_B];
  let checksum = START_B;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    if (code < 0 || code > 94) throw new Error(`Unsupported barcode char: ${text[i]}`);
    values.push(code);
    checksum += code * (i + 1);
  }
  values.push(checksum % 103);
  values.push(STOP);
  return values;
}

function toBarcode(sku) {
  const clean = String(sku || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return `DK${clean}`.slice(0, 48);
}

function svgBarcode(text, { height = 56, module = 2, includeLabel = true } = {}) {
  const values = code128Values(text);
  let bars = '';
  let x = module * 10;
  for (const v of values) {
    const pattern = PATTERNS[v];
    let black = true;
    for (const ch of pattern) {
      const w = Number(ch) * module;
      if (black) bars += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#0b1f33"/>`;
      x += w;
      black = !black;
    }
  }
  x += module * 10;
  const labelH = includeLabel ? 18 : 0;
  const totalH = height + labelH + 8;
  const label = includeLabel
    ? `<text x="${x / 2}" y="${height + 14}" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="12" fill="#122033">${escapeXml(text)}</text>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${totalH}" viewBox="0 0 ${x} ${totalH}" role="img" aria-label="Barcode ${escapeXml(text)}">
  <rect width="100%" height="100%" fill="#fff"/>
  ${bars}
  ${label}
</svg>`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { toBarcode, svgBarcode };
