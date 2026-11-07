/** Code128-B SVG renderer for material barcodes */
(function (global) {
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
    '114131','311141','411131','211412','211214','211232','233111'
  ];
  const START_B = 104;
  const STOP = 106;

  function svgBarcode(text, height = 40, module = 1.6) {
    const values = [START_B];
    let checksum = START_B;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i) - 32;
      if (code < 0 || code > 94) continue;
      values.push(code);
      checksum += code * (i + 1);
    }
    values.push(checksum % 103, STOP);
    let x = module * 8;
    let bars = '';
    for (const v of values) {
      const pattern = PATTERNS[v] || '212222';
      let black = true;
      for (const ch of pattern) {
        const w = Number(ch) * module;
        if (black) bars += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#0b1f33"/>`;
        x += w;
        black = !black;
      }
    }
    x += module * 8;
    const label = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height + 16}" viewBox="0 0 ${x} ${height + 16}">
      <rect width="100%" height="100%" fill="#fff"/>${bars}
      <text x="${x / 2}" y="${height + 12}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10" fill="#122033">${label}</text>
    </svg>`;
  }

  global.DKBarcode = { svgBarcode };
})(window);
