(function () {
  const R = window.RECIPES;
  const byId = Object.fromEntries(R.map((r) => [r.id, r]));
  const S = window.Scale;
  const $app = document.getElementById('app');

  // ---------- 保存状態 ----------
  const KEY = 'recipe-shelf-v1';
  const state = Object.assign(
    { menu: [], scale: {}, checked: {}, done: {}, shopChecked: [], hideStaples: true, shopView: 'merged', memo: {}, filter: 'all', q: '' },
    load()
  );
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 保存できない環境 */ }
    updateBadges();
  }

  // ---------- ユーティリティ ----------
  const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const ytUrl = (v) => (v.short ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`);
  const fmtTime = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const inMenu = (id) => state.menu.includes(id);
  const fx = (f) => String(Math.round(f * 100) / 100);
  const STATUS = {
    ok: ['分量あり', 'ok'], partial: ['一部分量あり', 'partial'], names: ['材料名のみ', 'names'], none: ['動画内のみ', 'none'],
  };
  const TAGS = ['パスタ', '肉', '魚介', '野菜', 'スープ', 'ご飯', '卵・キッシュ', '揚げ物', 'グラタン', 'お菓子・パン', '常備・調味料', 'テクニック'];
  const STAPLES = ['塩', '胡椒', '黒胡椒', '白胡椒', 'こしょう', 'コショウ', '黒コショウ', 'あらびき黒こしょう', '砂糖', '醤油', '油', 'サラダ油', 'オリーブオイル', '水', '小麦粉', '薄力粉', '片栗粉', '酒', 'みりん', '茹で汁', '揚げ油', 'グレープシードオイル', 'パセリの茎'];

  function cleanName(n) {
    return n.replace(/^(【[^】]*】|〈[^〉]*〉|\{[^}]*\}|[A-Z] )/, '').trim();
  }
  function isStaple(name) {
    const base = cleanName(name).replace(/（[^）]*）|\([^)]*\)/g, '');
    return base.split('・').every((p) => STAPLES.includes(p.trim()));
  }

  // ---------- 換算 ----------
  function scaleOf(r) {
    return state.scale[r.id] || {};
  }
  function defaultMode(r) {
    if (!r.base) return 'factor';
    if (r.base.mold) return 'mold';
    if (r.base.n) return 'serv';
    return 'factor';
  }
  function baseMold(r) {
    return (r.base && r.base.mold) || scaleOf(r).baseMold || null;
  }
  function factorOf(r) {
    const s = scaleOf(r);
    const mode = s.mode || defaultMode(r);
    if (mode === 'serv' && r.base && r.base.n) return (s.n ?? r.base.n) / r.base.n;
    if (mode === 'mold') {
      const b = baseMold(r);
      if (!b) return 1;
      const t = s.mold || b;
      return S.moldArea(t) / S.moldArea(b);
    }
    return s.factor || 1;
  }
  function factorLabel(r) {
    const f = factorOf(r);
    const s = scaleOf(r);
    const mode = s.mode || defaultMode(r);
    const x = `×${fx(f)}`;
    if (mode === 'serv' && r.base && r.base.n) return `${s.n ?? r.base.n}${r.base.unit}`;
    if (mode === 'mold' && baseMold(r)) return `${S.moldLabel(s.mold || baseMold(r))}（${x}）`;
    return f === 1 ? '元の分量' : x;
  }
  function setScale(r, patch) {
    state.scale[r.id] = Object.assign({}, scaleOf(r), patch);
    save();
  }

  // ---------- YouTube プレーヤー ----------
  let ytReady = null;
  function loadYT() {
    if (ytReady) return ytReady;
    ytReady = new Promise((res) => {
      if (window.YT && window.YT.Player) return res();
      window.onYouTubeIframeAPIReady = () => res();
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
    return ytReady;
  }
  const players = {};
  function mountPlayer(slot, video) {
    const host = document.getElementById(slot);
    if (!host) return;
    host.innerHTML = `<div id="${slot}-p"></div>`;
    host.className = 'player ' + (video.short ? 'short' : 'wide');
    loadYT().then(() => {
      players[slot] = new YT.Player(`${slot}-p`, {
        videoId: video.id,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
      });
    });
  }
  function seek(slot, t) {
    const p = players[slot];
    if (p && p.seekTo) {
      p.seekTo(t, true);
      p.playVideo();
      document.getElementById(slot)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ---------- 画面: 一覧 ----------
  function viewList() {
    const q = state.q.trim().toLowerCase();
    const f = state.filter;
    const list = R.filter((r) => {
      if (f === 'menu' && !inMenu(r.id)) return false;
      if (f === 'amount' && !['ok', 'partial'].includes(r.status)) return false;
      if (TAGS.includes(f) && !(r.tags || []).includes(f)) return false;
      if (q) {
        const hay = [r.title, r.chef, ...(r.tags || []), ...(r.groups || []).flatMap((g) => g.items.map((i) => i[0]))].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const chips = [['all', 'すべて'], ['menu', `献立（${state.menu.length}）`], ['amount', '分量あり'], ...TAGS.map((t) => [t, t])]
      .map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-filter="${h(k)}">${h(l)}</button>`).join('');
    $app.innerHTML = `
      <header class="top">
        <h1>レシピ帳</h1>
        <input id="q" class="search" type="search" placeholder="料理名・材料・シェフで検索" value="${h(state.q)}">
      </header>
      <div class="chips">${chips}</div>
      <p class="count">${list.length}件</p>
      <div class="grid">${list.map(card).join('') || '<p class="empty">該当するレシピがありません</p>'}</div>
    `;
    const qi = document.getElementById('q');
    qi.addEventListener('input', () => {
      state.q = qi.value;
      save();
      const pos = qi.selectionStart;
      viewList();
      const n = document.getElementById('q');
      n.focus();
      n.setSelectionRange(pos, pos);
    });
  }
  function card(r) {
    const v = r.videos[0];
    const [sl, sc] = STATUS[r.status] || STATUS.none;
    return `
      <article class="card">
        <a href="#/r/${r.id}" class="thumb ${v.short ? 'is-short' : ''}">
          <img src="${thumb(v.id)}" alt="" loading="lazy">
          ${v.short ? '<span class="badge-short">ショート</span>' : ''}
          ${r.videos.length > 1 ? '<span class="badge-more">本編あり</span>' : ''}
        </a>
        <button class="add ${inMenu(r.id) ? 'on' : ''}" data-menu="${r.id}" aria-label="献立に追加">${inMenu(r.id) ? '✓' : '＋'}</button>
        <a href="#/r/${r.id}" class="card-body">
          <h2>${h(r.title)}</h2>
          <p class="chef">${h(r.chef)}</p>
          <span class="status ${sc}">${sl}</span>
        </a>
      </article>`;
  }

  // ---------- 部品: 分量調整パネル ----------
  function scalePanel(r) {
    if (!r.groups || r.status === 'none' || r.status === 'names') return '';
    const s = scaleOf(r);
    const mode = s.mode || defaultMode(r);
    const f = factorOf(r);
    const tabs = [['factor', '倍率'], ...(r.base && r.base.n ? [['serv', r.base.unit.replace('分', '') === '人前' ? '人数' : '個数']] : []), ['mold', '型サイズ']];
    let body = '';
    if (mode === 'factor') {
      body = `
        <div class="row">${[0.5, 1, 1.5, 2, 3].map((x) => `<button class="chip ${Math.abs(f - x) < 1e-6 ? 'on' : ''}" data-factor="${x}">×${S.frac(x).replace('と', '.')}</button>`).join('')}</div>
        <div class="stepper"><button data-fstep="-0.25">−</button><span>×${fx(f)}</span><button data-fstep="0.25">＋</button></div>`;
    } else if (mode === 'serv') {
      const n = s.n ?? r.base.n;
      body = `<div class="stepper big"><button data-nstep="-1">−</button><span>${n}${h(r.base.unit)}</span><button data-nstep="1">＋</button></div>
        <p class="hint">元のレシピ：${h(r.base.label || r.base.n + r.base.unit)}（×${fx(f)}）</p>`;
    } else {
      const b = baseMold(r);
      const t = s.mold || b || { shape: 'round', size: 18 };
      const sizes = t.shape === 'square' ? [12, 15, 18, 21, 24] : [12, 15, 18, 20, 21, 22, 24];
      const baseUi = r.base && r.base.mold
        ? `<p class="hint">元のレシピ：<b>${S.moldLabel(b)}</b></p>`
        : `<div class="mold-base"><span>元の型</span>
            <select data-bshape>${['round', 'square'].map((x) => `<option value="${x}" ${b && b.shape === x ? 'selected' : ''}>${x === 'round' ? '丸型' : '角型'}</option>`).join('')}</select>
            <input data-bsize type="number" inputmode="numeric" min="5" max="40" placeholder="cm" value="${b ? b.size : ''}"> cm
          </div>${b ? '' : '<p class="hint">動画で使っている型のサイズを入れると換算できます</p>'}`;
      body = `${baseUi}
        <div class="row"><span class="lbl">作る型</span>
          <button class="chip ${t.shape === 'round' ? 'on' : ''}" data-tshape="round">丸型</button>
          <button class="chip ${t.shape === 'square' ? 'on' : ''}" data-tshape="square">角型</button></div>
        <div class="row">${sizes.map((x) => `<button class="chip ${t.size === x ? 'on' : ''}" data-tsize="${x}">${x}cm</button>`).join('')}</div>
        ${b ? `<p class="result">${S.moldLabel(b)} → ${S.moldLabel(t)}：<b>×${fx(f)}</b>（底面積の比）</p>
        <p class="hint">型の深さが同じ場合の目安。焼き時間は短めから様子を見てください。</p>` : ''}`;
    }
    return `
      <section class="panel scale" data-rid="${r.id}">
        <div class="seg">${tabs.map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>
        ${body}
        ${f !== 1 ? '<button class="link" data-reset>元の分量に戻す</button>' : ''}
      </section>`;
  }

  function bindScale(root, r, rerender) {
    root.querySelectorAll('.scale[data-rid="' + r.id + '"]').forEach((p) => {
      p.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const s = scaleOf(r);
        if (b.dataset.mode) setScale(r, { mode: b.dataset.mode });
        else if (b.dataset.factor) setScale(r, { mode: 'factor', factor: Number(b.dataset.factor) });
        else if (b.dataset.fstep) setScale(r, { mode: 'factor', factor: Math.max(0.25, Math.round(((s.factor || 1) + Number(b.dataset.fstep)) * 100) / 100) });
        else if (b.dataset.nstep) setScale(r, { mode: 'serv', n: Math.max(1, (s.n ?? r.base.n) + Number(b.dataset.nstep)) });
        else if (b.dataset.tshape) setScale(r, { mode: 'mold', mold: { shape: b.dataset.tshape, size: (s.mold || baseMold(r) || { size: 18 }).size } });
        else if (b.dataset.tsize) setScale(r, { mode: 'mold', mold: { shape: (s.mold || baseMold(r) || { shape: 'round' }).shape, size: Number(b.dataset.tsize) } });
        else if ('reset' in b.dataset) { const keep = s.baseMold; state.scale[r.id] = keep ? { baseMold: keep } : {}; save(); }
        else return;
        rerender();
      });
      const bs = p.querySelector('[data-bshape]');
      const bz = p.querySelector('[data-bsize]');
      if (bs && bz) {
        const upd = () => {
          const size = Number(bz.value);
          if (size >= 5 && size <= 40) { setScale(r, { baseMold: { shape: bs.value, size } }); rerender(); }
        };
        bs.addEventListener('change', upd);
        bz.addEventListener('change', upd);
      }
    });
  }

  // ---------- 部品: 材料リスト ----------
  function ingredients(r, big) {
    if (!r.groups) return noRecipe(r);
    const f = factorOf(r);
    const checked = new Set(state.checked[r.id] || []);
    const groups = r.groups.map((g, gi) => `
      ${g.name ? `<h4>${h(g.name)}</h4>` : ''}
      <ul class="ing ${big ? 'big' : ''}">
        ${g.items.map(([name, amt], ii) => {
          const key = `${gi}-${ii}`;
          const scaled = S.scaleAmount(amt, f);
          const changed = scaled !== amt;
          const egg = S.eggHint(name, amt, f);
          return `<li class="${checked.has(key) ? 'done' : ''}" data-ing="${key}" data-rid="${r.id}">
            <span class="box"></span>
            <span class="name">${h(name)}</span>
            <span class="amt">${h(scaled) || '<span class="na">—</span>'}${changed ? `<small class="orig">元 ${h(amt)}</small>` : ''}${egg ? `<small class="egg">${h(egg)}</small>` : ''}</span>
          </li>`;
        }).join('')}
      </ul>`).join('');
    const warn = r.status === 'names' ? '<p class="warn">概要欄には材料名のみで、分量は動画内で説明されています。</p>'
      : r.status === 'partial' ? '<p class="warn">一部の材料は分量の記載がありません（動画内で確認）。</p>'
      : r.status === 'none' ? '<p class="warn">分量は動画内のテロップで確認してください。</p>' : '';
    return `${warn}${groups}`;
  }
  function noRecipe() {
    return `<p class="warn">このショートは概要欄にレシピがありません。材料・分量は動画内で確認してください。</p>`;
  }
  function bindIngredients(root) {
    root.querySelectorAll('[data-ing]').forEach((li) => {
      li.addEventListener('click', () => {
        const rid = li.dataset.rid;
        const set = new Set(state.checked[rid] || []);
        const k = li.dataset.ing;
        set.has(k) ? set.delete(k) : set.add(k);
        state.checked[rid] = [...set];
        li.classList.toggle('done');
        save();
      });
    });
  }

  function steps(r, slot) {
    if (!r.steps) return '';
    const done = new Set(state.done[r.id] || []);
    let n = 0;
    return `<ol class="steps">${r.steps.map((s, i) => `
      ${s.group ? `<li class="sgroup">${h(s.group)}</li>` : ''}
      <li class="step ${done.has(i) ? 'done' : ''}" data-step="${i}" data-rid="${r.id}">
        <span class="num">${++n}</span>
        <span class="txt">${h(s.text)}</span>
        ${s.at != null ? `<button class="time" data-seek="${s.at}" data-slot="${slot}">▶ ${fmtTime(s.at)}</button>` : ''}
      </li>`).join('')}</ol>`;
  }
  function bindSteps(root) {
    root.querySelectorAll('[data-step]').forEach((li) => {
      li.addEventListener('click', (e) => {
        if (e.target.closest('[data-seek]')) return;
        const rid = li.dataset.rid;
        const set = new Set(state.done[rid] || []);
        const k = Number(li.dataset.step);
        set.has(k) ? set.delete(k) : set.add(k);
        state.done[rid] = [...set];
        li.classList.toggle('done');
        save();
      });
    });
  }
  function chapters(r, slot) {
    if (!r.chapters) return '';
    return `<div class="chapters">${r.chapters.map(([t, l]) => `<button class="chip" data-seek="${t}" data-slot="${slot}">▶ ${fmtTime(t)} ${h(l)}</button>`).join('')}</div>`;
  }
  function bindSeek(root) {
    root.querySelectorAll('[data-seek]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      seek(b.dataset.slot, Number(b.dataset.seek));
    }));
  }

  // ---------- 画面: 詳細 ----------
  function viewDetail(id, vi, keepPlayer) {
    const r = byId[id];
    if (!r) return (location.hash = '#/');
    vi = Number(vi) || 0;
    const v = r.videos[vi] || r.videos[0];
    const [sl, sc] = STATUS[r.status] || STATUS.none;
    $app.innerHTML = `
      <header class="top detail-top">
        <a href="#/" class="back">← 一覧</a>
        <button class="btn ${inMenu(r.id) ? 'on' : ''}" data-menu="${r.id}">${inMenu(r.id) ? '✓ 献立に追加済み' : '＋ 献立に追加'}</button>
      </header>
      ${r.videos.length > 1 ? `<div class="seg vids">${r.videos.map((x, i) => `<a href="#/r/${r.id}/${i}" class="${i === vi ? 'on' : ''}">${x.short ? 'ショート' : h(x.label || '動画')}</a>`).join('')}</div>` : ''}
      <div id="pl-detail" class="player ${v.short ? 'short' : 'wide'}"></div>
      <div class="detail">
        <h2 class="title">${h(r.title)}</h2>
        <p class="meta">${h(r.chef)} ・ <span class="status ${sc}">${sl}</span>${r.source ? ` ・ 出典：${h(r.source)}` : ''}</p>
        <p class="meta"><a href="${ytUrl(v)}" target="_blank" rel="noopener">YouTubeで開く ↗</a></p>
        ${chapters(r, 'pl-detail')}
        ${scalePanel(r)}
        <section class="panel">
          <h3>材料 <small>${h(r.base ? (r.base.label || (r.base.n ? r.base.n + r.base.unit : '') || (r.base.mold ? S.moldLabel(r.base.mold) : '')) : '')}</small></h3>
          ${ingredients(r)}
        </section>
        ${r.steps ? `<section class="panel"><h3>作り方</h3>${steps(r, 'pl-detail')}</section>` : ''}
        ${r.notes ? `<section class="panel notes"><h3>メモ（動画より）</h3><ul>${r.notes.map((n) => `<li>${h(n)}</li>`).join('')}</ul></section>` : ''}
        <section class="panel">
          <h3>自分用メモ</h3>
          <textarea id="memo" rows="3" placeholder="例：18cm型で焼き時間35分でちょうどよかった">${h(state.memo[r.id] || '')}</textarea>
        </section>
      </div>`;
    if (keepPlayer) document.getElementById('pl-detail').replaceWith(keepPlayer);
    else mountPlayer('pl-detail', v);
    bindScale($app, r, () => viewDetailKeep(r.id, vi));
    bindIngredients($app);
    bindSteps($app);
    bindSeek($app);
    const memo = document.getElementById('memo');
    memo.addEventListener('input', () => { state.memo[r.id] = memo.value; save(); });
  }
  // プレーヤーを残したまま本文だけ描き直す
  function viewDetailKeep(id, vi) {
    const holder = document.getElementById('pl-detail');
    const y = window.scrollY;
    holder.remove();
    viewDetail(id, vi, holder);
    window.scrollTo(0, y);
  }

  // ---------- 画面: 買い物リスト ----------
  function shopItems() {
    const rows = [];
    state.menu.map((id) => byId[id]).filter((r) => r && r.groups).forEach((r) => {
      const f = factorOf(r);
      r.groups.forEach((g) => g.items.forEach(([name, amt]) => {
        rows.push({ r, name: cleanName(name), amt: S.scaleAmount(amt, f), staple: isStaple(name) });
      }));
    });
    return rows;
  }
  function viewShop() {
    const menu = state.menu.map((id) => byId[id]).filter(Boolean);
    if (!menu.length) return emptyMenu('買い物リスト');
    let rows = shopItems();
    const hidden = rows.filter((x) => x.staple).length;
    if (state.hideStaples) rows = rows.filter((x) => !x.staple);
    const checked = new Set(state.shopChecked);
    let body = '';
    if (state.shopView === 'merged') {
      const map = new Map();
      rows.forEach((x) => {
        if (!map.has(x.name)) map.set(x.name, []);
        map.get(x.name).push(x);
      });
      const items = [...map.entries()].map(([name, xs]) => {
        const sums = {};
        const texts = [];
        xs.forEach((x) => {
          const p = S.parseSimple(x.amt);
          if (p) {
            const k = p.pre + '|' + p.unit;
            sums[k] = sums[k] ? { ...sums[k], v: sums[k].v + p.v } : p;
          } else if (x.amt) texts.push(x.amt);
        });
        const amount = [...Object.values(sums).map(S.fmtSimple), ...new Set(texts)].join(' ＋ ');
        const from = [...new Set(xs.map((x) => x.r.title))];
        return { key: 'm:' + name, name, amount, from };
      });
      body = `<ul class="shop">${items.map((it) => `
        <li class="${checked.has(it.key) ? 'done' : ''}" data-shop="${h(it.key)}">
          <span class="box"></span>
          <span class="name">${h(it.name)}${menu.length > 1 ? `<small>${it.from.map(h).join(' / ')}</small>` : ''}</span>
          <span class="amt">${h(it.amount) || '—'}</span>
        </li>`).join('')}</ul>`;
    } else {
      body = menu.map((r) => {
        const xs = rows.filter((x) => x.r === r);
        return `<h4>${h(r.title)} <small>${h(factorLabel(r))}</small></h4>
          ${r.groups ? `<ul class="shop">${xs.map((x) => {
            const key = `r:${r.id}:${x.name}`;
            return `<li class="${checked.has(key) ? 'done' : ''}" data-shop="${h(key)}"><span class="box"></span><span class="name">${h(x.name)}</span><span class="amt">${h(x.amt) || '—'}</span></li>`;
          }).join('')}</ul>` : noRecipe()}`;
      }).join('');
    }
    $app.innerHTML = `
      <header class="top"><h1>買い物リスト</h1></header>
      <section class="panel menu-sum">
        ${menu.map((r) => `<a class="mchip" href="#/r/${r.id}">${h(r.title)} <b>${h(factorLabel(r))}</b></a>`).join('')}
        <p class="hint">分量の調整は各レシピの画面で。ここに反映されます。</p>
      </section>
      <div class="toolbar">
        <div class="seg"><button class="${state.shopView === 'merged' ? 'on' : ''}" data-view="merged">まとめて</button><button class="${state.shopView === 'byRecipe' ? 'on' : ''}" data-view="byRecipe">レシピ別</button></div>
        <label class="toggle"><input type="checkbox" id="staples" ${state.hideStaples ? 'checked' : ''}> 常備品を隠す${hidden ? `（${hidden}）` : ''}</label>
      </div>
      ${body}
      <div class="actions">
        <button class="btn" id="copy">テキストでコピー</button>
        <button class="btn ghost" id="clearShop">チェックを外す</button>
      </div>
      <p id="copied" class="hint" hidden>コピーしました</p>`;
    $app.querySelectorAll('[data-shop]').forEach((li) => li.addEventListener('click', () => {
      const k = li.dataset.shop;
      const set = new Set(state.shopChecked);
      set.has(k) ? set.delete(k) : set.add(k);
      state.shopChecked = [...set];
      li.classList.toggle('done');
      save();
    }));
    $app.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.shopView = b.dataset.view; save(); viewShop(); }));
    document.getElementById('staples').addEventListener('change', (e) => { state.hideStaples = e.target.checked; save(); viewShop(); });
    document.getElementById('clearShop').addEventListener('click', () => { state.shopChecked = []; save(); viewShop(); });
    document.getElementById('copy').addEventListener('click', () => {
      const lines = [...$app.querySelectorAll('.shop li:not(.done)')].map((li) => `・${li.querySelector('.name').firstChild.textContent} ${li.querySelector('.amt').textContent}`);
      navigator.clipboard?.writeText(lines.join('\n')).then(() => { document.getElementById('copied').hidden = false; });
    });
  }

  function emptyMenu(what) {
    $app.innerHTML = `
      <header class="top"><h1>${what}</h1></header>
      <div class="empty-state">
        <p>献立にレシピがまだありません。</p>
        <p>一覧のカードの <b>＋</b> で、作りたい料理を献立に追加してください。2品以上でもOKです。</p>
        <a class="btn" href="#/">一覧へ</a>
      </div>`;
  }

  // ---------- 画面: 調理モード ----------
  let cookTab = 0;
  let wakeLock = null;
  function viewCook(tab) {
    const menu = state.menu.map((id) => byId[id]).filter(Boolean);
    if (!menu.length) return emptyMenu('調理モード');
    if (tab != null) cookTab = Number(tab);
    if (cookTab >= menu.length) cookTab = 0;
    $app.innerHTML = `
      <header class="top cook-top">
        <h1>調理モード</h1>
        <button class="btn ${wakeLock ? 'on' : ''}" id="wake">${wakeLock ? '☀ 画面ON維持中' : '☀ 画面を消さない'}</button>
      </header>
      <nav class="cook-tabs">${menu.map((r, i) => `<button class="${i === cookTab ? 'on' : ''}" data-tab="${i}">${h(r.title)}</button>`).join('')}</nav>
      <div class="cook-cols" style="--n:${menu.length}">
        ${menu.map((r, i) => cookPanel(r, i)).join('')}
      </div>`;
    $app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      cookTab = Number(b.dataset.tab);
      $app.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      $app.querySelectorAll('.cook-col').forEach((c, i) => c.classList.toggle('active', i === cookTab));
      window.scrollTo(0, 0);
    }));
    $app.querySelectorAll('[data-video]').forEach((b) => b.addEventListener('click', () => {
      const r = byId[b.dataset.video];
      const slot = `pl-cook-${r.id}`;
      const el = document.getElementById(slot);
      if (el.dataset.on) { el.innerHTML = ''; delete el.dataset.on; el.className = 'player off'; b.textContent = '▶ 動画を表示'; return; }
      el.dataset.on = '1';
      mountPlayer(slot, r.videos[Number(b.dataset.vi) || 0]);
      b.textContent = '✕ 動画を閉じる';
    }));
    document.getElementById('wake').addEventListener('click', toggleWake);
    menu.forEach((r) => bindScale($app, r, () => refreshCookPanel(r)));
    bindIngredients($app);
    bindSteps($app);
    bindSeek($app);
  }
  function cookPanel(r, i) {
    const main = r.videos.findIndex((v) => !v.short);
    const vi = main >= 0 ? main : 0;
    return `
      <section class="cook-col ${i === cookTab ? 'active' : ''}" data-col="${r.id}">
        <div class="cook-head">
          <h2><a href="#/r/${r.id}">${h(r.title)}</a></h2>
          <button class="btn small" data-video="${r.id}" data-vi="${vi}">▶ 動画を表示</button>
        </div>
        <div id="pl-cook-${r.id}" class="player off"></div>
        ${chapters(r, `pl-cook-${r.id}`)}
        <details class="cook-scale"><summary>分量：<b>${h(factorLabel(r))}</b>（タップで変更）</summary>${scalePanel(r)}</details>
        <div class="panel">${ingredients(r, true)}</div>
        ${r.steps ? `<div class="panel"><h3>作り方</h3>${steps(r, `pl-cook-${r.id}`)}</div>` : ''}
        ${state.memo[r.id] ? `<div class="panel notes"><h3>自分用メモ</h3><p>${h(state.memo[r.id])}</p></div>` : ''}
      </section>`;
  }
  function refreshCookPanel(r) {
    const col = $app.querySelector(`[data-col="${r.id}"]`);
    const player = document.getElementById(`pl-cook-${r.id}`);
    const btn = col.querySelector('[data-video]');
    const btnText = btn.textContent;
    const open = col.querySelector('details')?.open;
    const tmp = document.createElement('div');
    const idx = state.menu.indexOf(r.id);
    tmp.innerHTML = cookPanel(r, idx);
    const fresh = tmp.firstElementChild;
    fresh.querySelector(`#pl-cook-${r.id}`).replaceWith(player);
    fresh.querySelector('[data-video]').replaceWith(btn);
    btn.textContent = btnText;
    if (open) fresh.querySelector('details').open = true;
    col.replaceWith(fresh);
    bindScale(fresh, r, () => refreshCookPanel(r));
    bindIngredients(fresh);
    bindSteps(fresh);
    bindSeek(fresh);
  }
  async function toggleWake() {
    try {
      if (wakeLock) { await wakeLock.release(); wakeLock = null; }
      else if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else { alertInline('このブラウザは画面ON維持に対応していません'); }
    } catch (e) { wakeLock = null; }
    const b = document.getElementById('wake');
    if (b) { b.classList.toggle('on', !!wakeLock); b.textContent = wakeLock ? '☀ 画面ON維持中' : '☀ 画面を消さない'; }
  }
  document.addEventListener('visibilitychange', async () => {
    // タブに戻ったときに自動で再取得
    if (document.visibilityState === 'visible' && wakeLock === null && document.getElementById('wake')?.classList.contains('on')) {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* noop */ }
    }
  });
  function alertInline(msg) {
    const b = document.getElementById('wake');
    if (b) b.textContent = msg;
  }

  // ---------- 献立の追加・削除（全画面共通） ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-menu]');
    if (b) {
      e.preventDefault();
      const id = b.dataset.menu;
      state.menu = inMenu(id) ? state.menu.filter((x) => x !== id) : [...state.menu, id];
      save();
      const on = inMenu(id);
      b.classList.toggle('on', on);
      b.textContent = b.classList.contains('add') ? (on ? '✓' : '＋') : (on ? '✓ 献立に追加済み' : '＋ 献立に追加');
      return;
    }
    const c = e.target.closest('[data-filter]');
    if (c) { state.filter = c.dataset.filter; save(); viewList(); }
  });

  // ---------- 下部ナビ・ルーター ----------
  function updateBadges() {
    document.querySelectorAll('[data-badge]').forEach((el) => {
      el.textContent = state.menu.length || '';
      el.hidden = !state.menu.length;
    });
  }
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    Object.keys(players).forEach((k) => delete players[k]);
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === (parts[0] || 'list')));
    if (parts[0] === 'r') viewDetail(parts[1], parts[2]);
    else if (parts[0] === 'shop') viewShop();
    else if (parts[0] === 'cook') viewCook();
    else viewList();
    if (parts[0] !== 'cook') window.scrollTo(0, 0);
    updateBadges();
  }
  window.addEventListener('hashchange', route);
  route();
})();
