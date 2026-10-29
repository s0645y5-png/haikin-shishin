/* 配筋指針 計算機
   - 指針の数値は data/shishin.json（format: "haikin-shishin"）に置き、このファイルには入れない
   - データファイルが同じ場所にないときは、端末のファイルを選んで読み込み、localStorage に保存する */
"use strict";
const APP_VERSION = "0.1.1";
const FC_LIST = [18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60];
const KEY_DATA = "shishin:data", KEY_UI = "shishin:ui";

let DB = null;
const UI = { tab: "anchor", fc: 24, grade: "SD345", bar: "D19", light: false,
  dc: "", bw: "", angle: 180, period: 1, side: 0, finish: false, agg: 20 };

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できない端末でも動かす */ } }
};

/* ---------- データファイル ---------- */
function sanitizeData(x) {
  if (!x || x.format !== "haikin-shishin") throw new Error("配筋指針のデータファイルではありません");
  const isRows = r => Array.isArray(r) && r.every(row => Array.isArray(row) && row.every(v => v === null || typeof v === "number"));
  for (const t of ["L2", "L2h", "La", "Lb"]) if (!isRows(x.anchor?.[t]?.rows)) throw new Error("定着の表が読めません：" + t);
  for (const t of ["L1", "L1h"]) if (!isRows(x.lap?.[t]?.rows)) throw new Error("継手の表が読めません：" + t);
  if (!Array.isArray(x.fc) || !Array.isArray(x.grades) || !Array.isArray(x.bars)) throw new Error("データファイルの形式が違います");
  return x;
}
async function loadData() {
  try {
    const r = await fetch("data/shishin.json", { cache: "no-cache" });
    if (r.ok) { const d = sanitizeData(await r.json()); store.set(KEY_DATA, d); return d; }
  } catch { /* 置いていない・電波がない */ }
  try { const d = store.get(KEY_DATA); if (d) return sanitizeData(d); } catch { /* 壊れた保存データは使わない */ }
  return null;
}
function showLoader(msg, canBack) {
  $("#conds").hidden = true; $("#lightWrap").hidden = true; $("#tabs").hidden = true;
  $("#main").innerHTML = `<div class="load"><b>データファイルを選んでください</b>
    <p class="sub" style="margin:0">配筋指針の数値をまとめたファイル（shishin.json）を読み込みます。読み込んだデータはこの端末にだけ保存されます。</p>
    ${msg ? `<p class="bad" style="margin:0">${esc(msg)}</p>` : ""}
    <input type="file" id="file" accept=".json,application/json" hidden>
    <button class="btn" id="pick">ファイルを選ぶ</button>
    ${canBack && DB ? `<button type="button" id="back" style="border:0;background:none;color:var(--accent);font-size:15px;padding:8px">やめる</button>` : ""}</div>`;
  $("#pick").onclick = () => $("#file").click();
  if ($("#back")) $("#back").onclick = () => start(DB);
  $("#file").onchange = async e => {
    try {
      const d = sanitizeData(JSON.parse(await e.target.files[0].text()));
      store.set(KEY_DATA, d); start(d);
    } catch (err) { showLoader(err.message, canBack); }
  };
}

/* ---------- 計算 ---------- */
const bar = () => DB.bars.find(b => b.name === UI.bar) || DB.bars[0];
const fcRow = () => DB.fc.findIndex(r => UI.fc <= r.max);
const gIdx = () => DB.grades.indexOf(UI.grade);
/* 軽量コンクリート：Fc≦36 かつ SD490 以外は +5d、それ以外は設計図書による */
function lightAdd() {
  if (!UI.light) return { add: 0, ok: true };
  const L = DB.light;
  return (UI.fc <= L.fcMax && UI.grade !== L.excludeGrade) ? { add: L.add, ok: true } : { add: 0, ok: false };
}
function lookup(tbl) {
  const i = fcRow(), j = gIdx();
  if (i < 0 || j < 0) return null;
  const v = tbl.rows[i]?.[j];
  return v == null ? null : v;
}
const mm = (mul, d) => Math.round(mul * d);

/* ---------- 表示部品 ---------- */
const refTxt = r => r ? `指針 ${esc(r.table)}（p.${esc(r.page)}）` : "";
function card(title, ref, body) {
  return `<section class="card"><div class="k"><span>${esc(title)}</span><span class="ref">${refTxt(ref)}</span></div>${body}</section>`;
}
function big(mul, d, extra) {
  if (mul == null) return `<div class="na">— 表に値がありません（設計図書による）</div>`;
  return `<div class="big"><b>${mm(mul, d)}<small>mm</small></b><em>${mul}d</em>${extra || ""}</div>`;
}
function lightNote() {
  if (!UI.light) return "";
  const la = lightAdd();
  return la.ok ? `<div class="warn">軽量コンクリート：表の値に ${DB.light.add}d を加えています。工事監理者の承認を受けること。</div>`
               : `<div class="bad">軽量コンクリートで Fc＞${DB.light.fcMax} または ${esc(DB.light.excludeGrade)} の場合は、表の値は使えません（設計図書による）。</div>`;
}
const notes = arr => `<div class="note">${arr.map(t => `<p>・${t}</p>`).join("")}</div>`;
const numIn = (id, label, val, ph) => `<label>${esc(label)}<input type="number" inputmode="numeric" id="${id}" value="${esc(val)}" placeholder="${esc(ph)}"></label>`;
function seg(id, opts, cur) {
  return `<div class="seg" id="${id}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${esc(t)}</button>`).join("")}</div>`;
}

/* ---------- 各タブ ---------- */
function viewAnchor() {
  const b = bar(), d = b.d, la = lightAdd(), A = DB.anchor;
  const add = v => (v == null || !la.ok) ? null : v + la.add;
  const L2 = add(lookup(A.L2)), L2h = add(lookup(A.L2h)), La = add(lookup(A.La)), Lb = add(lookup(A.Lb));
  const dc = Number(UI.dc) || 0, bw = Number(UI.bw) || 0;
  const govern = (mul, lim, label) => {
    if (mul == null || !lim) return "";
    const need = Math.max(mm(mul, d), Math.ceil(lim));
    return `<div class="sub">${label} ＝ ${Math.ceil(lim)} mm → <b>${need} mm 以上</b>${need > mm(mul, d) ? "（こちらで決まる）" : ""}</div>`;
  };
  let h = lightNote();
  h += `<div class="sec-h">部材内の定着（小梁・スラブの下端筋を除く）</div>`;
  h += card("直線定着 L2", A.L2.ref, big(L2, d));
  h += card("フック付き定着 L2h", A.L2h.ref, big(L2h, d) +
    `<div class="sub">定着起点から折曲げ開始点まで。フック部は含まない。</div>`);
  h += `<div class="sec-h">仕口内の折曲げ定着（投影定着長さ）</div>`;
  h += card("大梁主筋の柱内定着 La", A.La.ref, big(La, d) +
    `<div class="row2">${numIn("dc", "柱せい Dc (mm)", UI.dc, "例 800")}</div>` +
    govern(La, dc * 0.75, "0.75Dc") +
    `<div class="sub">全長は L2（${L2 == null ? "—" : mm(L2, d) + " mm"}）以上、余長 8d（${8 * d} mm）以上。基礎梁・片持梁を含む。</div>`);
  h += card("小梁・スラブ上端筋の梁内定着 Lb", A.Lb.ref, big(Lb, d) +
    `<div class="row2">${numIn("bw", "梁幅 B (mm)", UI.bw, "例 400")}</div>` +
    govern(Lb, bw / 2, "B/2") +
    `<div class="sub">片持形式の小梁・スラブの上端筋は La を使う。</div>`);
  h += viewBottom(d, la);
  h += notes([
    "設計図書に明示がある場合は設計図書による。表は明示がない場合の値。",
    "d は異形鉄筋の呼び名の数値。丸鋼には適用しない。",
    "仕口内の 90°折曲げ定着で L2h を満たさない場合は、全長 L2 以上・余長 8d 以上とし、投影定着長さ La または Lb を確保する。",
    "上端筋の抜け出しや降伏強度上昇を考慮する部位は、設計者が設計図書に明示する。"
  ]);
  return h;
}
function viewBottom(d, la) {
  const B = DB.bottom;
  const okGrade = B.grades.includes(UI.grade) && UI.fc >= B.fcMin && UI.fc <= B.fcMax;
  let body;
  if (!okGrade) body = `<div class="na">— ${esc(UI.grade)} は表にありません（設計図書による）</div>`;
  else if (!la.ok) body = `<div class="na">— 軽量コンクリートのため設計図書による</div>`;
  else {
    const a = la.add;
    const v = (mul, min) => `<b>${Math.max(mm(mul + a, d), (min || 0) + (a ? mm(a, d) : 0))}<small>mm</small></b><span class="sub">${mul + a}d${min ? `かつ${min}mm` : ""}</span>`;
    body = `<div class="pair"><div><span class="lbl">小梁 直線 L3</span>${v(B.L3.beam)}</div>
      <div><span class="lbl">スラブ 直線 L3</span>${v(B.L3.slab, B.L3.slabMin)}</div>
      <div><span class="lbl">小梁 フック付き L3h</span>${v(B.L3h.beam)}</div>
      <div><span class="lbl">片持の下端筋 直線</span>${v(B.L3.cantilever)}</div></div>
      <div class="sub">スラブのフック付き定着は表にない。水圧を受ける耐圧スラブ、地反力を受ける基礎スラブ・基礎小梁の下端筋は L2・L2h による。</div>`;
  }
  return `<div class="sec-h">小梁・スラブの下端筋</div>` + card("下端筋の定着 L3・L3h", B.ref, body);
}

function viewLap() {
  const b = bar(), d = b.d, la = lightAdd(), P = DB.lap;
  const add = v => (v == null || !la.ok) ? null : v + la.add;
  const L1 = add(lookup(P.L1)), L1h = add(lookup(P.L1h));
  let h = lightNote();
  if (d >= P.noLapFrom) h += `<div class="bad">${esc(b.name)} は D${P.noLapFrom} 以上のため、原則として重ね継手は用いない（ガス圧接・機械式・溶接継手など）。</div>`;
  h += card("直線重ね継手 L1", P.L1.ref, big(L1, d));
  h += card("フック付き重ね継手 L1h", P.L1h.ref, big(L1h, d) +
    `<div class="sub">鉄筋相互の折曲げ開始点間の距離。フック部は含まない。</div>`);
  if (UI.light) h += `<div class="warn">鉄筋の下に 300 mm 以上の軽量コンクリートを打ち込む部材の上端部の重ね継手は、フック付きとする。</div>`;
  h += notes([
    "柱・梁の主筋以外の鉄筋が対象。柱・梁の主筋の継手は設計図書による。",
    "径の異なる鉄筋どうしの重ね継手の長さは、細い方の d による。",
    "継手は 1 か所に集中させず、相互にずらして設ける。",
    "ガス圧接継手は日本鉄筋継手協会「鉄筋継手工事標準仕様書 ガス圧接継手工事」（2017年版）による。機械式・溶接継手は設計図書による。"
  ]);
  return h;
}

function bendRule() {
  const d = bar().d;
  return DB.bend.rules.find(r => r.grades.includes(UI.grade) && r.angles.includes(UI.angle) && d >= (r.minD || 0) && d <= r.maxD);
}
function hookSvg(angle, Dm, tail, d) {
  /* 折曲げ内法直径と余長を、呼び名 d を基準にした縮尺で描く */
  const s = 110 / (Dm + d + tail), r = (Dm / 2 + d / 2) * s;
  const cx = 230, cy = 70 + r, L = 170;
  let path, tx, ty;
  if (angle === 180) { path = `M${cx - L} ${cy - r} H${cx} A${r} ${r} 0 0 1 ${cx} ${cy + r} H${cx - tail * s}`; tx = cx - tail * s / 2; ty = cy + r + 22; }
  else if (angle === 135) {
    const ex = cx + r * Math.cos(Math.PI / 4), ey = cy + r * Math.sin(Math.PI / 4), k = tail * s / Math.SQRT2;
    path = `M${cx - L} ${cy - r} H${cx} A${r} ${r} 0 0 1 ${ex} ${ey} L${ex - k} ${ey + k}`; tx = ex - k / 2 + 16; ty = ey + k / 2 + 14;
  } else { path = `M${cx - L} ${cy - r} H${cx} A${r} ${r} 0 0 1 ${cx + r} ${cy} V${cy + tail * s}`; tx = cx + r + 10; ty = cy + tail * s / 2; }
  const H = Math.max(cy + r + 40, angle === 90 ? cy + tail * s + 20 : 0, 200);
  return `<svg class="fig" viewBox="0 0 340 ${Math.ceil(H)}" role="img" aria-label="${angle}度フックの形状">
    <path class="bar" d="${path}"/>
    <circle class="dim" cx="${cx}" cy="${cy}" r="${Dm / 2 * s}" stroke-dasharray="3 3"/>
    <text x="${cx - 10}" y="${cy + 4}" text-anchor="end">D=${Math.round(Dm)}</text>
    <text x="${tx}" y="${ty}">余長 ${Math.round(tail)}</text>
    <text x="${cx - L}" y="${cy - r - 10}">${angle}° フック（mm）</text></svg>`;
}
function viewBend() {
  const b = bar(), d = b.d, B = DB.bend, rule = bendRule(), tail = B.tail[UI.angle];
  let h = `<section class="card">${seg("angle", [[180, "180°"], [135, "135°"], [90, "90°"]], UI.angle)}</section>`;
  if (UI.grade === "SD490" && UI.angle > 90) h += `<div class="bad">SD490 を 90°を超えて折り曲げる場合は、事前に曲げ試験を行い、工事監理者の承認を受ける。</div>`;
  const body = rule
    ? `<div class="pair"><div><span class="lbl">折曲げ内法直径 D</span><b>${rule.D * d}<small>mm 以上</small></b><span class="sub">${rule.D}d</span></div>
       <div><span class="lbl">余長</span><b>${tail * d}<small>mm 以上</small></b><span class="sub">${tail}d</span></div></div>
       ${hookSvg(UI.angle, rule.D * d, tail * d, d)}`
    : `<div class="na">— ${esc(UI.grade)}・${esc(b.name)}・${UI.angle}° は表にありません（設計図書による）</div>
       <div class="pair"><div><span class="lbl">余長</span><b>${tail * d}<small>mm 以上</small></b><span class="sub">${tail}d</span></div></div>`;
  h += card("折曲げ形状・寸法", B.ref, body);
  h += notes(B.notes.map(esc));
  return h;
}

function viewCover() {
  const C = DB.cover;
  const col = UI.period === 0 ? 0 : UI.period === 1 ? 1 + UI.side : 3 + UI.side;
  const cut = UI.finish && UI.period > 0 && UI.side === 1;
  let h = `<section class="card" style="gap:10px">
    <div class="sub">計画供用期間の級</div>${seg("period", [[0, "短期"], [1, "標準・長期"], [2, "超長期"]], UI.period)}
    ${UI.period > 0 ? `<div class="sub">部位</div>${seg("side", [[0, "屋内"], [1, "屋外"]], UI.side)}
    ${UI.side === 1 ? `<label class="toggle"><input type="checkbox" id="finish" ${UI.finish ? "checked" : ""}>耐久性上有効な仕上げあり（−10 mm）</label>` : ""}` : ""}
  </section>`;
  const rows = C.rows.map(r => {
    let v = r.v[col];
    const soil = typeof r.v[0] === "number" && r.v.every(x => x === r.v[0]);
    if (cut && typeof v === "number" && !soil) v = v - 10;
    return `<tr><td>${r.group ? `<span class="sub">${esc(r.group)}</span><br>` : ""}${esc(r.name)}</td><td class="v">${esc(v)}</td></tr>`;
  }).join("");
  h += card("設計かぶり厚さ (mm)", C.ref, `<div class="sub">${esc(C.cols[col])}${cut ? "・仕上げあり" : ""}</div><table class="cov">${rows}</table>`);
  h += notes(C.notes.map(esc));
  return h;
}

function viewSpace() {
  const b = bar(), S = DB.spacing.clear;
  const c1 = S.barMul * b.d, c2 = S.aggMul * UI.agg, c3 = S.min;
  const clear = Math.max(c1, c2, c3);
  const lead = clear === c1 ? "呼び名の 1.5 倍" : clear === c2 ? "粗骨材の 1.25 倍" : "25 mm";
  const f = v => Number.isInteger(v) ? v : v.toFixed(1);
  let h = `<section class="card"><div class="sub">粗骨材の最大寸法 (mm)</div>${seg("agg", DB.spacing.aggregates.map(a => [a, a]), UI.agg)}</section>`;
  h += card("鉄筋のあき・鉄筋間隔の最小値", DB.spacing.ref,
    `<div class="pair"><div><span class="lbl">あき</span><b>${f(clear)}<small>mm 以上</small></b><span class="sub">${lead}で決まる</span></div>
     <div><span class="lbl">鉄筋間隔（芯々）</span><b>${f(clear + b.outer)}<small>mm 以上</small></b><span class="sub">あき＋最外径 ${b.outer}</span></div></div>
     <div class="note"><p>呼び名×1.5 ＝ ${f(c1)} ／ 粗骨材×1.25 ＝ ${f(c2)} ／ 25 mm のうち最大</p>
     <p>${esc(b.name)} の最外径 D ＝ ${b.outer} mm（指針 解説表3.3）</p></div>`);
  h += notes(["異形鉄筋（竹節・ねじ節）の場合。丸鋼は鉄筋径の 1.5 倍・間隔は 2.5 倍などによる。",
    "機械式継手やフックのある位置は、継手・フックの外径で間隔が決まることがあるので確認する。"]);
  return h;
}

/* ---------- 画面 ---------- */
const VIEWS = { anchor: viewAnchor, lap: viewLap, bend: viewBend, cover: viewCover, space: viewSpace };
function render() {
  const t = UI.tab;
  $("#lightWrap").hidden = !(t === "anchor" || t === "lap");
  $("#conds").hidden = t === "cover";
  $("#fc").closest("label").hidden = !(t === "anchor" || t === "lap");
  $("#conds").style.gridTemplateColumns = (t === "anchor" || t === "lap") ? "" : (t === "space" ? "1fr" : "1fr 1fr");
  $("#grade").closest("label").hidden = t === "space";
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-current", String(b.dataset.tab === t)));
  $("#main").innerHTML = VIEWS[t]() + `<footer>出典：${esc(DB.source)}（社内利用）・データ ${esc(DB.version || "")}・v${APP_VERSION}<br>
    <button type="button" id="reload" style="margin-top:6px;border:0;background:none;color:var(--accent);font-size:12px">データファイルを差し替える</button></footer>`;
  $("#reload").onclick = () => showLoader("", true);
  bindDynamic();
  store.set(KEY_UI, UI);
}
function bindDynamic() {
  const segBind = (id, key) => { const el = document.getElementById(id); if (el) el.onclick = e => { const b = e.target.closest("button"); if (!b) return; UI[key] = Number(b.dataset.v); render(); }; };
  segBind("angle", "angle"); segBind("period", "period"); segBind("side", "side"); segBind("agg", "agg");
  const fin = $("#finish"); if (fin) fin.onchange = () => { UI.finish = fin.checked; render(); };
  for (const k of ["dc", "bw"]) {
    const el = document.getElementById(k);
    if (el) el.onchange = () => { UI[k] = el.value; render(); };
  }
}
function start(data) {
  DB = data;
  const saved = store.get(KEY_UI);
  if (saved && typeof saved === "object") for (const k of Object.keys(UI)) if (typeof saved[k] === typeof UI[k]) UI[k] = saved[k];
  if (!DB.grades.includes(UI.grade)) UI.grade = DB.grades[1] || DB.grades[0];
  if (!DB.bars.some(b => b.name === UI.bar)) UI.bar = DB.bars[0].name;
  $("#conds").hidden = false; $("#tabs").hidden = false;
  $("#src").textContent = "配筋指針 2021";
  $("#fc").innerHTML = FC_LIST.map(v => `<option value="${v}">${v}</option>`).join("");
  $("#grade").innerHTML = DB.grades.map(g => `<option>${esc(g)}</option>`).join("");
  $("#bar").innerHTML = DB.bars.map(b => `<option>${esc(b.name)}</option>`).join("");
  $("#fc").value = UI.fc; $("#grade").value = UI.grade; $("#bar").value = UI.bar; $("#light").checked = UI.light;
  $("#fc").onchange = e => { UI.fc = Number(e.target.value); render(); };
  $("#grade").onchange = e => { UI.grade = e.target.value; render(); };
  $("#bar").onchange = e => { UI.bar = e.target.value; render(); };
  $("#light").onchange = e => { UI.light = e.target.checked; render(); };
  $("#tabs").onclick = e => { const b = e.target.closest("button"); if (!b) return; UI.tab = b.dataset.tab; render(); window.scrollTo(0, 0); };
  render();
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
loadData().then(d => d ? start(d) : showLoader());
