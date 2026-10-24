// 分量の換算と表示
(function () {
  const SPOONS = ['大さじ', '小さじ', 'カップ'];
  const MASS = ['g', 'kg', 'ml', 'mL', 'cc', 'l', 'L'];
  const COUNT = ['個分', '個', '本分', '本', '枚', 'かけ', '欠片', '片', '尾', '丁', '缶', 'パック', '把', '房', '株', '切れ', '玉', '束', '袋', 'フィレ', '杯', '合', '枝'];
  const OTHER = ['カリカリ分', 'カリカリ', 'つまみ'];
  const UNITS = [...MASS, ...COUNT, ...OTHER, '%', 'cm', 'mm'].sort((a, b) => b.length - a.length);

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const AMOUNT_RE = new RegExp(
    '(大さじ|小さじ|カップ)?\\s*(\\d+(?:\\.\\d+)?(?:\\/\\d+)?)(\\s*)(' + UNITS.map(esc).join('|') + ')?',
    'g'
  );

  function parseNum(s) {
    if (s.includes('/')) {
      const [a, b] = s.split('/').map(Number);
      return a / b;
    }
    return Number(s);
  }

  // 1/4・1/3 刻みの分数表記
  function frac(v) {
    if (v < 0.2) return String(Math.round(v * 100) / 100);
    const q = Math.round(v * 4) / 4;
    const t = Math.round(v * 3) / 3;
    const r = Math.abs(t - v) < Math.abs(q - v) - 0.01 ? t : q;
    const whole = Math.floor(r + 1e-9);
    const rem = r - whole;
    const map = [[0.25, '1/4'], [1 / 3, '1/3'], [0.5, '1/2'], [2 / 3, '2/3'], [0.75, '3/4']];
    const hit = map.find(([x]) => Math.abs(x - rem) < 0.01);
    if (!hit) return String(whole);
    return whole === 0 ? hit[1] : `${whole}と${hit[1]}`;
  }

  function trimNum(v) {
    return String(Math.round(v * 10) / 10);
  }

  function fmtValue(v, pre, unit) {
    if (pre) return frac(v);
    if (MASS.includes(unit)) {
      if (v >= 100) return String(Math.round(v / 5) * 5);
      if (v >= 10) return String(Math.round(v));
      if (v >= 1) return trimNum(Math.round(v * 2) / 2);
      return trimNum(v);
    }
    if (COUNT.includes(unit)) return frac(v);
    if (OTHER.includes(unit)) return String(Math.max(1, Math.round(v)));
    return v >= 10 ? String(Math.round(v)) : frac(v);
  }

  // 分量テキスト中の数字を f 倍する
  function scaleAmount(text, f) {
    if (!text || f === 1) return text;
    return text.replace(AMOUNT_RE, (m, pre, num, sp, unit, offset, str) => {
      if (unit === '%' || unit === 'cm' || unit === 'mm') return m;
      if (str[offset - 1] === 'の') return m; // 「にんにくの1/3」など相対量
      let v = parseNum(num) * f;
      let p = pre || '';
      if (p === '大さじ' && v < 0.5) { p = '小さじ'; v *= 3; }
      return (p ? p : '') + fmtValue(v, p, unit) + sp + (unit || '');
    });
  }

  // 卵の個数にグラム目安を添える
  function eggHint(name, text, f) {
    if (f === 1 || !/卵/.test(name)) return '';
    const m = /(\d+(?:\.\d+)?(?:\/\d+)?)\s*個/.exec(text || '');
    if (!m) return '';
    const v = parseNum(m[1]) * f;
    if (Math.abs(v - Math.round(v)) < 0.08) return '';
    const per = /卵黄/.test(name) ? 20 : /卵白/.test(name) ? 30 : 50;
    return `正確には${trimNum(v)}個 ≒ ${Math.round(v * per)}g（M玉）`;
  }

  function moldArea(m) {
    if (!m) return 0;
    return m.shape === 'square' ? m.size * m.size : Math.PI * (m.size / 2) ** 2;
  }

  function moldLabel(m) {
    return `${m.shape === 'square' ? '角型' : '丸型'}${m.size}cm`;
  }

  // 買い物リスト合算用：単一の「数値＋単位」なら取り出す
  function parseSimple(text) {
    const m = /^約?\s*(大さじ|小さじ|カップ)?\s*(\d+(?:\.\d+)?(?:\/\d+)?)\s*(と(\d\/\d))?\s*([^\d\s（(]*)$/.exec((text || '').trim());
    if (!m) return null;
    let v = parseNum(m[2]);
    if (m[4]) v += parseNum(m[4]);
    return { pre: m[1] || '', v, unit: m[5] || '' };
  }

  function fmtSimple(p) {
    return (p.pre || '') + fmtValue(p.v, p.pre, p.unit) + p.unit;
  }

  window.Scale = { scaleAmount, eggHint, moldArea, moldLabel, parseSimple, fmtSimple, frac, trimNum };
})();
