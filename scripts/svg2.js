const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const USER = 'HasselNot7';
const CONTRIB_FALLBACK = '2';

const FONT_SIZE = 13.5, LINE_H = 19, CHAR_W = 8.1;
const ART_COLS = 80, ART_ROWS = 57, ART_X = 16, ART_Y = 6;
const ART_FONT = 9, ART_CHW = 6.5, ART_LH = 8.4;
const INFO_X = 548, INFO_COLS = 59, INFO_Y0 = 25;
const CARD_W = Math.round(INFO_X + INFO_COLS * CHAR_W + 16);
const CARD_H = Math.round(ART_Y + ART_ROWS * ART_LH + 8);

async function gh(pathName, token, accept) {
  const res = await fetch(`https://api.github.com${pathName}`, {
    headers: {
      'User-Agent': 'profile-card',
      'Accept': accept || 'application/vnd.github+json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${pathName}: ${res.status}`);
  return res.json();
}

function uptimeSince(createdAt, now) {
  const c = new Date(createdAt);
  let months = (now.getFullYear() - c.getFullYear()) * 12 + (now.getMonth() - c.getMonth());
  const anchor = new Date(c);
  anchor.setMonth(c.getMonth() + months);
  if (anchor > now) { months--; anchor.setMonth(c.getMonth() + months); }
  const days = Math.floor((now - anchor) / 86400000);
  return `${months} month${months === 1 ? '' : 's'}, ${days} day${days === 1 ? '' : 's'}`;
}

async function fetchStats() {
  const token = process.env.GITHUB_TOKEN;
  const [user, repos, commits] = await Promise.all([
    gh(`/users/${USER}`, token),
    gh(`/users/${USER}/repos?per_page=100`, token),
    gh(`/search/commits?q=author:${USER}`, token, 'application/vnd.github+json'),
  ]);
  let contributed = CONTRIB_FALLBACK;
  if (token) {
    try {
      const q = `query { user(login: "${USER}") { contributionsCollection { commitContributionsByRepository { contributions(first: 1) { totalCount } } } } }`;
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { 'User-Agent': 'profile-card', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ query: q }),
      });
      const j = await res.json();
      const n = j.data.user.contributionsCollection.commitContributionsByRepository.length;
      if (n > 0) contributed = String(n);
    } catch { contributed = CONTRIB_FALLBACK; }
  }
  return {
    repos: String(user.public_repos),
    stars: String(repos.reduce((s, r) => s + r.stargazers_count, 0)),
    commits: String(commits.total_count),
    followers: String(user.followers),
    contributed,
    uptime: uptimeSince(user.created_at, new Date()),
  };
}

function statRow(segs, width) {
  const fixed = 2 + 3 * (segs.length - 1) + segs.reduce((s, [k, v]) => s + k.length + v.length + 3, 0);
  const dots = width - fixed;
  if (dots < segs.length) throw new Error('stats row too wide');
  const base = Math.floor(dots / segs.length), rem = dots - base * segs.length;
  const dotCounts = segs.map((_, i) => base + (i === 0 ? rem : 0));
  return { t: 'stats', segs: segs.map(([k, v], i) => [k, dotCounts[i], v]) };
}

(async () => {
  const font = opentype.parse(fs.readFileSync(path.join(__dirname, 'fonts', 'JetBrainsMono-Regular.ttf')));
  const ascent = (font.ascender / font.unitsPerEm) * FONT_SIZE;

  const art = fs.readFileSync(path.join(__dirname, 'art.txt'), 'utf8').split('\n');
  if (art.length !== ART_ROWS || art.some(l => l.length !== ART_COLS)) {
    throw new Error(`art mismatch: rows=${art.length} widths=${[...new Set(art.map(l => l.length))]}`);
  }

  const artAscent = (font.ascender / font.unitsPerEm) * ART_FONT;
  const artChars = [...new Set(art.join(''))].filter(ch => ch !== ' ');
  const idOf = ch => 'g' + ch.codePointAt(0);
  const defs = artChars.map(ch => `<path id="${idOf(ch)}" d="${font.getPath(ch, 0, 0, ART_FONT).toPathData(1)}"/>`).join('');
  const uses = [];
  for (let r = 0; r < ART_ROWS; r++) {
    const baseline = (ART_Y + r * ART_LH + artAscent).toFixed(1);
    for (let c = 0; c < ART_COLS; c++) {
      const ch = art[r][c];
      if (ch === ' ') continue;
      uses.push(`<use href="#${idOf(ch)}" x="${(ART_X + c * ART_CHW).toFixed(1)}" y="${baseline}"/>`);
    }
  }

  const stats = await fetchStats();

  const info = [];
  info.push({ t: 'name' });
  info.push({ t: 'blank' });
  [
    ['OS.Desktop', 'Windows'],
    ['OS.Server', 'Ubuntu'],
    ['Uptime', stats.uptime],
    ['Joined', '2025-10-21'],
    ['Timezone', 'UTC+8'],
    ['Host', 'UCAS, Beijing'],
    ['Kernel', 'AIRCAS'],
    ['Field', 'Remote Sensing & GIS'],
    ['IDE', 'VS Code'],
    ['Languages.Programming', 'Python'],
    ['Languages.Computer', 'HTML, CSS, Markdown'],
    ['Languages.Real', 'Mandarin, English'],
  ].forEach(([k, v]) => info.push({ t: 'kv', k, v }));
  info.push({ t: 'blank' });
  info.push({ t: 'kv', k: 'Hobbies', v: 'Photography, Photo Editing' });
  info.push({ t: 'blank' });
  info.push({ t: 'hdr', k: 'Contact' });
  info.push({ t: 'kv', k: 'Email.School', v: 'yanzizhen25@mails.ucas.edu.cn' });
  info.push({ t: 'kv', k: 'Website', v: 'hasselnot.site' });
  info.push({ t: 'kv', k: 'GitHub', v: '@HasselNot7' });
  info.push({ t: 'blank' });
  info.push({ t: 'hdr', k: 'GitHub Stats' });
  info.push(statRow([['Repos', stats.repos], ['Contributed', stats.contributed], ['Stars', stats.stars]], 56));
  info.push(statRow([['Commits', stats.commits], ['Followers', stats.followers]], 46));

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function kvDots(k, v) {
    const dots = INFO_COLS - 5 - k.length - v.length;
    if (dots < 2) throw new Error(`too long: ${k}`);
    return dots;
  }
  function kvPlain(k, v) {
    return `. ${k}:` + ' ' + '.'.repeat(kvDots(k, v)) + ' ' + v;
  }
  function rowParts(row) {
    switch (row.t) {
      case 'name': return [{ s: 'hasselnot' }, { s: ' ' + '-'.repeat(INFO_COLS - 10) }];
      case 'hdr': return [{ s: '- ' + row.k + ' ' + '-'.repeat(INFO_COLS - row.k.length - 3) }];
      case 'blank': return [];
      case 'kv': {
        const plain = kvPlain(row.k, row.v);
        const dotCount = (plain.match(/\./g) || []).length;
        const dots = '.'.repeat(dotCount);
        const parts = [];
        const [k1, ...kRest] = row.k.split('.');
        parts.push({ cls: 'cc', s: '. ' });
        parts.push({ cls: 'key', s: k1 });
        kRest.forEach(kp => { parts.push({ s: '.' }); parts.push({ cls: 'key', s: kp }); });
        parts.push({ s: ':' });
        parts.push({ cls: 'cc', s: ' ' + dots + ' ' });
        parts.push({ cls: 'value', s: row.v });
        return parts;
      }
      case 'stats': {
        const parts = [{ cls: 'cc', s: '. ' }];
        row.segs.forEach(([k, dots, v], i) => {
          if (i) parts.push({ s: ' | ' });
          parts.push({ cls: 'key', s: k }, { s: ':' }, { cls: 'cc', s: ' ' + '.'.repeat(dots) + ' ' }, { cls: 'value', s: v });
        });
        return parts;
      }
    }
  }
  function plainText(row) {
    switch (row.t) {
      case 'name': return 'hasselnot ' + '-'.repeat(INFO_COLS - 10);
      case 'hdr': return '- ' + row.k + ' ' + '-'.repeat(INFO_COLS - row.k.length - 3);
      case 'blank': return '';
      case 'kv': return kvPlain(row.k, row.v);
      case 'stats': {
        return '. ' + row.segs.map(([k, d2, v]) => `${k}: ${'.'.repeat(d2)} ${v}`).join(' | ');
      }
    }
  }
  info.forEach(row => {
    const len = plainText(row).length;
    if (row.t !== 'blank' && len !== INFO_COLS && row.t !== 'stats') {
      throw new Error(`row width ${len} != ${INFO_COLS}: ${plainText(row)}`);
    }
  });

  const tspans = info.map((row, i) => {
    const y = (INFO_Y0 + i * LINE_H).toFixed(1);
    const parts = rowParts(row);
    if (!parts.length) return `<tspan x="${INFO_X}.0" y="${y}"></tspan>`;
    const first = parts[0];
    return first.cls
      ? `<tspan x="${INFO_X}.0" y="${y}" class="${first.cls}">${esc(first.s)}</tspan>` + parts.slice(1).map(p => p.cls ? `<tspan class="${p.cls}">${esc(p.s)}</tspan>` : p.s).join('')
      : `<tspan x="${INFO_X}.0" y="${y}">${esc(first.s)}</tspan>` + parts.slice(1).map(p => p.cls ? `<tspan class="${p.cls}">${esc(p.s)}</tspan>` : p.s).join('');
  });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">
<style>
.key {fill: #ffa657;}
.value {fill: #a5d6ff;}
.cc {fill: #616e7f;}
text, tspan {white-space: pre; font-variant-ligatures: none;}
</style>
<rect x="0.5" y="0.5" width="${CARD_W - 1}" height="${CARD_H - 1}" rx="10" fill="#161b22" stroke="#30363d"/>
<defs>${defs}</defs>
<g fill="#9da7b3">${uses.join('')}</g>
<text x="${INFO_X}" y="${INFO_Y0}" fill="#c9d1d9" font-size="${FONT_SIZE}px" xml:space="preserve">
${tspans.join('\n')}
</text>
</svg>
`;

  fs.writeFileSync(path.join(__dirname, '..', 'card.svg'), svg);
  console.log(`card.svg written: ${CARD_W}x${CARD_H}, uses=${uses.length}, tspans=${tspans.length}`);
  console.log('stats:', JSON.stringify(stats));
})();
