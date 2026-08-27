const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

(async () => {
  const W = 80, H = 57, FW = 160, FH = 114;
  const { data, info } = await sharp(path.join(__dirname, 'avatar.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const iw = info.width, ih = info.height, N = iw * ih;

  const band = [];
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    if (x > 20 && x < iw - 20 && y > 20 && y < ih - 20) continue;
    const i = (y * iw + x) * 3;
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (l < 200) band.push([data[i], data[i + 1], data[i + 2]]);
  }
  const chMed = c => { const a = band.map(b => b[c]).sort((x, y) => x - y); return a[a.length >> 1]; };
  const bg = [chMed(0), chMed(1), chMed(2)];
  const near = i => {
    const dr = data[i * 3] - bg[0], dg = data[i * 3 + 1] - bg[1], db = data[i * 3 + 2] - bg[2];
    return dr * dr + dg * dg + db * db < 55 * 55;
  };
  const isBg = new Uint8Array(N);
  const stack = [];
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    if (x > 20 && x < iw - 20 && y > 20 && y < ih - 20) continue;
    const i = y * iw + x;
    if (near(i) && !isBg[i]) { isBg[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop(), x = i % iw, y = (i / iw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= iw || ny < 0 || ny >= ih) continue;
      const ni = ny * iw + nx;
      if (!isBg[ni] && near(ni)) { isBg[ni] = 1; stack.push(ni); }
    }
  }

  const L = new Float32Array(N);
  for (let i = 0; i < N; i++) L[i] = 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];

  const fl = new Float32Array(FW * FH), fb = new Float32Array(FW * FH);
  for (let fy = 0; fy < FH; fy++) for (let fx = 0; fx < FW; fx++) {
    const x0 = Math.round(fx * iw / FW), x1 = Math.min(iw, Math.round((fx + 1) * iw / FW));
    const y0 = Math.round(fy * ih / FH), y1 = Math.min(ih, Math.round((fy + 1) * ih / FH));
    let ls = 0, bs = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * iw + x;
      ls += L[i]; bs += isBg[i]; n++;
    }
    fl[fy * FW + fx] = ls / n;
    fb[fy * FW + fx] = bs / n;
  }
  const fb2 = new Float32Array(FW * FH);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    let s = 0, w = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= FW || ny < 0 || ny >= FH) continue;
      const wt = dx === 0 && dy === 0 ? 2 : 1;
      s += fl[ny * FW + nx] * wt; w += wt;
    }
    fb2[y * FW + x] = s / w;
  }
  const fL = fb2;

  const fx = new Float32Array(FW * FH), fy = new Float32Array(FW * FH), fmag = new Float32Array(FW * FH);
  for (let y = 1; y < FH - 1; y++) for (let x = 1; x < FW - 1; x++) {
    const p = (dy, dx) => fL[(y + dy) * FW + x + dx];
    const sx = (p(-1, 1) + 2 * p(0, 1) + p(1, 1)) - (p(-1, -1) + 2 * p(0, -1) + p(1, -1));
    const sy = (p(1, -1) + 2 * p(1, 0) + p(1, 1)) - (p(-1, -1) + 2 * p(-1, 0) + p(-1, 1));
    fx[y * FW + x] = sx; fy[y * FW + x] = sy;
    fmag[y * FW + x] = Math.hypot(sx, sy);
  }
  const esort = Float32Array.from(fmag).sort();
  const eScale = esort[(FW * FH * 0.93) | 0] || 1;

  const gL = new Float32Array(W * H), gBg = new Float32Array(W * H);
  const gMag = new Float32Array(W * H); const gCh = new Array(W * H).fill(' ');
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    let lsum = 0, lmin = 255, bgs = 0, mmax = 0, mch = ' ';
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const fy2 = cy * 2 + dy, fx2 = cx * 2 + dx;
      const fi = fy2 * FW + fx2;
      lsum += fL[fi];
      if (fL[fi] < lmin) lmin = fL[fi];
      if (fb[fi] >= 0.5) bgs++;
      const m = fmag[fi];
      if (m > mmax) {
        mmax = m;
        const gx = fx[fi], gy = fy[fi];
        const ax = Math.abs(gx), ay = Math.abs(gy);
        if (ax > 2.2 * ay) mch = '|';
        else if (ay > 2.2 * ax) mch = '-';
        else if (gx * gy > 0) mch = '/';
        else mch = '\\';
      }
    }
    gL[cy * W + cx] = 0.75 * (lsum / 4) + 0.25 * lmin;
    gBg[cy * W + cx] = bgs / 4;
    gMag[cy * W + cx] = mmax / eScale;
    gCh[cy * W + cx] = mch;
  }

  const vals = [];
  for (let i = 0; i < W * H; i++) if (gBg[i] < 0.5) vals.push(gL[i]);
  vals.sort((a, b) => a - b);
  const p = q => vals[(q * (vals.length - 1)) | 0];
  const lo = p(0.02), hi = p(0.98);

  const ramp = d => d >= 0.82 ? '@' : d >= 0.7 ? '#' : d >= 0.58 ? '%' : d >= 0.47 ? '=' : d >= 0.37 ? '*' : d >= 0.29 ? '+' : d >= 0.22 ? ':' : d >= 0.16 ? '.' : d >= 0.1 ? '`' : ' ';
  const out = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const bgf = gBg[i];
      const Ln = Math.max(0, Math.min(1, (gL[i] - lo) / (hi - lo)));
      const dark = 1 - Ln;
      const e = gMag[i];
      let ch = ' ';
      if (bgf > 0.6) {
        if (e > 0.62) ch = gCh[i];
      } else {
        ch = ramp(dark);
        if (e > 0.5 && dark < 0.4) ch = gCh[i];
      }
      row += ch;
    }
    out.push(row);
  }
  fs.writeFileSync(path.join(__dirname, 'art.txt'), out.join('\n'));
  const bgn = [...gBg].filter(v => v > 0.6).length;
  console.log('converted ' + W + 'x' + H, 'bg cells%', (100 * bgn / (W * H)).toFixed(1));
})();
