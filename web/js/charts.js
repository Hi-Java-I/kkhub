// =========================================================
// 图表（纯 SVG，零依赖）
//  · capacityChart：管理员看板「容量 vs 需求」折线
//  · qualityCharts：分组服务质量最近 24 小时（缓存命中率 / TTFT / 有效成功率）
// =========================================================
import { esc, fmt, fmtW } from './core.js';

const C_CAP = '#2f6bf0', C_DEM = '#e0802a';
// 分组配色：相邻色色盲可分辨
export const SERIES_COLORS = ['#2a78d6', '#e06a34', '#14a37a', '#d99a00', '#d9719d', '#2e8b2e', '#6250d6', '#d84448'];

// ---------- 容量 vs 需求 ----------
export function capacityChart(rows, metric) {
  const capKey = metric === 'tpm' ? 'capTPM' : 'capRPM', demKey = metric === 'tpm' ? 'demTPM' : 'demRPM';
  const data = [...rows].sort((a, b) => a.vendor.localeCompare(b.vendor) || a.group.localeCompare(b.group));
  if (!data.length) return '<div class="empty">没有可绘制的分组</div>';
  const W = 1100, H = 300, padL = 64, padR = 20, padT = 16, padB = 84;
  const iw = W - padL - padR, ih = H - padT - padB, base = padT + ih;
  const maxV = Math.max(1, ...data.map(d => Math.max(d[capKey], d[demKey])));
  const n = data.length;
  const x = i => padL + (n === 1 ? iw / 2 : iw * i / (n - 1));
  const y = v => padT + ih - v / maxV * ih;
  let grid = '';
  for (let s = 0; s <= 4; s++) {
    const v = maxV * s / 4, yy = y(v);
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="#e8edf5" ${s ? 'stroke-dasharray="3 4"' : ''}/><text x="${padL - 8}" y="${yy + 4}" font-size="11" fill="#7b88a3" text-anchor="end">${metric === 'tpm' ? fmtW(Math.round(v)) : fmt(Math.round(v))}</text>`;
  }
  const xl = data.map((d, i) => { const nm = d.group.length > 16 ? d.group.slice(0, 15) + '…' : d.group; return `<text x="${x(i)}" y="${base + 14}" font-size="11" fill="#4a5878" text-anchor="end" transform="rotate(-36 ${x(i)} ${base + 14})">${esc(nm)}</text>`; }).join('');
  const pts = k => data.map((d, i) => `${x(i)},${y(d[k])}`).join(' ');
  const slot = n > 1 ? iw / (n - 1) : iw;
  const dots = data.map((d, i) => `<circle cx="${x(i)}" cy="${y(d[capKey])}" r="3.5" fill="${C_CAP}"/><circle cx="${x(i)}" cy="${y(d[demKey])}" r="3.5" fill="${C_DEM}"/>`).join('');
  const hits = data.map((d, i) => `<rect data-cc="${i}" x="${x(i) - slot / 2}" y="${padT}" width="${slot}" height="${ih}" fill="transparent"/>`).join('');
  const id = 'cc' + Math.random().toString(36).slice(2, 8);
  CC_DATA[id] = { data, capKey, demKey, x, W, unit: metric.toUpperCase() };
  return `<div class="cap-chart" data-ccid="${id}" style="position:relative"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${metric.toUpperCase()} 容量与需求">
    ${grid}<polygon points="${x(0)},${base} ${pts(capKey)} ${x(n - 1)},${base}" fill="${C_CAP}" opacity=".07"/>
    <line class="cc-cross" x1="0" x2="0" y1="${padT}" y2="${base}" stroke="#9db6e6" stroke-dasharray="4 4" visibility="hidden"/>
    <polyline points="${pts(capKey)}" fill="none" stroke="${C_CAP}" stroke-width="2"/><polyline points="${pts(demKey)}" fill="none" stroke="${C_DEM}" stroke-width="2"/>
    ${dots}${xl}${hits}</svg><div class="chart-tip hidden"></div></div>`;
}
const CC_DATA = {};
document.addEventListener('mouseover', e => {
  const r = e.target.closest && e.target.closest('[data-cc]');
  if (!r) return;
  const box = r.closest('.cap-chart'), d = CC_DATA[box.dataset.ccid]; if (!d) return;
  const i = Number(r.dataset.cc), row = d.data[i];
  const svg = box.querySelector('svg'), tip = box.querySelector('.chart-tip'), cross = box.querySelector('.cc-cross');
  cross.setAttribute('x1', d.x(i)); cross.setAttribute('x2', d.x(i)); cross.setAttribute('visibility', 'visible');
  tip.innerHTML = `<b>${esc(row.vendor)} / ${esc(row.group)}</b><div><i style="background:${C_CAP}"></i>容量 ${fmt(row[d.capKey])}</div><div><i style="background:${C_DEM}"></i>需求 ${fmt(row[d.demKey])}</div>`;
  tip.classList.remove('hidden');
  const scale = svg.getBoundingClientRect().width / d.W;
  tip.style.left = Math.max(0, Math.min(d.x(i) * scale + 12, box.clientWidth - tip.offsetWidth - 4)) + 'px';
  tip.style.top = '8px';
});
document.addEventListener('mouseout', e => {
  const box = e.target.closest && e.target.closest('.cap-chart');
  if (box && !box.contains(e.relatedTarget)) { box.querySelector('.chart-tip').classList.add('hidden'); box.querySelector('.cc-cross').setAttribute('visibility', 'hidden'); }
});
export const capacityLegend = `<div class="legend"><span><i style="background:${C_CAP}"></i>分组容量</span><span><i style="background:${C_DEM}"></i>商机需求</span></div>`;

// ---------- 服务质量：最近 24 小时，每小时一个点 ----------
// 每小时的值 = 当时生效的基准值 ×（1 ± 波动幅度 × 伪随机系数）；系数由 分组 + 指标 + 小时 决定，刷新后数值不变
export const METRICS = [
  { key: 'cacheHit', title: '缓存命中率', unit: '%' },
  { key: 'ttft', title: 'TTFT 首字延迟（P50）', unit: 's' },
  { key: 'successRate', title: '有效成功率', unit: '%' }
];
const HOURS = 24, HOUR_MS = 3600000;
function hourNoise(gid, mi, hour) {
  let x = (Math.imul(gid + 1, 73856093) ^ Math.imul(mi + 1, 19349663) ^ Math.imul(hour, 83492791)) >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return ((x >>> 0) / 4294967295) * 2 - 1;
}
function hourlySeries(g, m, mi) {
  const nowHour = Math.floor(Date.now() / HOUR_MS);
  const hist = (g.metricsHistory || []).filter(h => h.ts).sort((a, b) => a.ts - b.ts);
  const out = [];
  for (let hour = nowHour - HOURS + 1; hour <= nowHour; hour++) {
    let base = null, amp = 1;
    for (const h of hist) { if (h.ts < (hour + 1) * HOUR_MS) { base = h[m.key]; amp = h.amp || 1; } else break; }
    let v = null;
    if (base !== null && base !== undefined) {
      v = base * (1 + amp / 100 * hourNoise(g.id || 0, mi, hour));
      if (m.unit === '%') v = Math.min(100, Math.max(0, v));
      v = Math.round(v * 100) / 100;
    }
    out.push({ hour, v });
  }
  return out;
}
const hh = hour => String(new Date(hour * HOUR_MS).getHours()).padStart(2, '0') + ':00';

const Q_STATE = {};
// groups: [{ id, group, vendor, metricsHistory }]；返回 HTML，交互走事件委托
export function qualityCharts(groups, { note = true } = {}) {
  const withData = groups.filter(g => (g.metricsHistory || []).some(h => METRICS.some(m => h[m.key] !== null && h[m.key] !== undefined)));
  if (!withData.length) return '<div class="empty"><b>暂无服务质量数据</b>对应分组还没有填写缓存命中率 / TTFT / 有效成功率</div>';
  const id = 'q' + Math.random().toString(36).slice(2, 8);
  Q_STATE[id] = { groups: withData, hidden: new Set(withData.slice(SERIES_COLORS.length).map(g => g.id)) };
  return `${note ? '<div class="note warn" style="margin-bottom:12px">数据仅供参考，建议让客户接入实测。</div>' : ''}<div class="q-wrap" id="${id}">${qualityInner(id)}</div>`;
}
function qualityInner(id) {
  const st = Q_STATE[id];
  const color = g => SERIES_COLORS[st.groups.indexOf(g) % SERIES_COLORS.length];
  const chips = st.groups.length > 1 ? `<div class="series"><span class="muted" style="font-size:12.5px">显示分组</span>${st.groups.map(g =>
    `<button type="button" class="series-chip ${st.hidden.has(g.id) ? '' : 'on'}" data-q="${id}" data-gid="${g.id}" style="--c:${color(g)}" aria-pressed="${!st.hidden.has(g.id)}"><i></i>${esc(g.group)}</button>`).join('')}</div>` : '';
  const shown = st.groups.filter(g => !st.hidden.has(g.id)).map(g => ({ g, c: color(g) }));
  return chips + `<div class="metric-grid">${METRICS.map((m, mi) => metricChart(shown, m, mi)).join('')}</div>`;
}
const MC = {};
function metricChart(shown, m, mi) {
  const W = 320, H = 150, padL = 44, padR = 10, padT = 10, padB = 24;
  const series = shown.map(x => ({ name: x.g.group, c: x.c, pts: hourlySeries(x.g, m, mi) }));
  const vals = series.flatMap(s => s.pts.map(p => p.v).filter(v => v !== null));
  const head = `<h4>${m.title}</h4>`;
  if (!vals.length) return `<div class="metric-card">${head}<div class="empty" style="padding:30px 0">${shown.length ? '暂无数据' : '请选择要查看的分组'}</div></div>`;
  let lo = m.unit === '%' ? Math.max(0, Math.floor(Math.min(...vals) - 1)) : 0;
  let hi = m.unit === '%' ? Math.min(100, Math.ceil(Math.max(...vals) + 1)) : Math.max(...vals) * 1.2 || 1;
  if (hi <= lo) hi = lo + 1;
  const iw = W - padL - padR, ih = H - padT - padB;
  const x = i => padL + iw * i / (HOURS - 1), y = v => padT + ih - (v - lo) / (hi - lo) * ih;
  let grid = '';
  for (let k = 0; k <= 2; k++) { const v = lo + (hi - lo) * k / 2, yy = y(v); grid += `<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="#e8edf5" ${k ? 'stroke-dasharray="3 3"' : ''}/><text x="${padL - 5}" y="${yy + 3}" font-size="9.5" fill="#7b88a3" text-anchor="end">${Math.round(v * 10) / 10}${m.unit}</text>`; }
  const pts0 = series[0].pts;
  const xl = pts0.map((p, i) => (i % 6 === 5 || i === 0 ? `<text x="${x(i)}" y="${H - 6}" font-size="9.5" fill="#4a5878" text-anchor="middle">${hh(p.hour)}</text>` : '')).join('');
  const lines = series.map(s => {
    const segs = []; let cur = [];
    s.pts.forEach((p, i) => { if (p.v === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(`${x(i)},${y(p.v)}`); });
    if (cur.length) segs.push(cur);
    return segs.map(sg => (sg.length > 1 ? `<polyline points="${sg.join(' ')}" fill="none" stroke="${s.c}" stroke-width="1.8" stroke-linejoin="round"/>` : `<circle cx="${sg[0].split(',')[0]}" cy="${sg[0].split(',')[1]}" r="2.5" fill="${s.c}"/>`)).join('');
  }).join('');
  const ck = 'mc' + Math.random().toString(36).slice(2, 8);
  MC[ck] = { m, W, x, series };
  const slot = iw / (HOURS - 1);
  const hits = pts0.map((p, i) => `<rect data-mc="${ck}" data-i="${i}" x="${x(i) - slot / 2}" y="${padT}" width="${slot}" height="${ih}" fill="transparent"/>`).join('');
  const last = series.length === 1 ? series[0].pts.filter(p => p.v !== null).pop() : null;
  return `<div class="metric-card">${head}${last ? `<div class="now">当前 <b style="color:var(--ink)">${last.v}${m.unit}</b></div>` : ''}
    <svg viewBox="0 0 ${W} ${H}" width="100%">${grid}<line class="mc-cross" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" stroke="#9db6e6" stroke-dasharray="3 3" visibility="hidden"/>${lines}${xl}${hits}</svg><div class="chart-tip hidden"></div></div>`;
}
function showTip(rect) {
  const d = MC[rect.dataset.mc]; if (!d) return;
  const i = Number(rect.dataset.i);
  const box = rect.closest('.metric-card'), svg = box.querySelector('svg'), tip = box.querySelector('.chart-tip'), cross = box.querySelector('.mc-cross');
  const dt = new Date(d.series[0].pts[i].hour * HOUR_MS);
  tip.innerHTML = `<b>${dt.getMonth() + 1}月${dt.getDate()}日 ${hh(d.series[0].pts[i].hour)}</b>` + d.series.map(s => `<div><i style="background:${s.c}"></i>${esc(s.name)}：${s.pts[i].v === null ? '暂无' : s.pts[i].v + d.m.unit}</div>`).join('');
  cross.setAttribute('x1', d.x(i)); cross.setAttribute('x2', d.x(i)); cross.setAttribute('visibility', 'visible');
  tip.classList.remove('hidden');
  const scale = svg.getBoundingClientRect().width / d.W;
  tip.style.left = Math.max(4, Math.min(d.x(i) * scale + 10, box.clientWidth - tip.offsetWidth - 4)) + 'px';
  tip.style.top = '30px';
}
document.addEventListener('mouseover', e => { const r = e.target.closest && e.target.closest('[data-mc]'); if (r) showTip(r); });
document.addEventListener('click', e => { const r = e.target.closest && e.target.closest('[data-mc]'); if (r) showTip(r); });
document.addEventListener('mouseout', e => {
  const box = e.target.closest && e.target.closest('.metric-card');
  if (box && !box.contains(e.relatedTarget)) { box.querySelector('.chart-tip')?.classList.add('hidden'); box.querySelector('.mc-cross')?.setAttribute('visibility', 'hidden'); }
});
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-q]');
  if (!b) return;
  const id = b.dataset.q, st = Q_STATE[id], gid = Number(b.dataset.gid);
  if (st.hidden.has(gid)) {
    if (st.groups.length - st.hidden.size >= SERIES_COLORS.length) { st.hidden.add(st.groups.find(g => !st.hidden.has(g.id)).id); }
    st.hidden.delete(gid);
  } else st.hidden.add(gid);
  document.getElementById(id).innerHTML = qualityInner(id);
});

// ---------- 热销模型：排行条 + 占比环形图 ----------
const PIE_COLORS = ['#2f6bf0', '#14a37a', '#e06a34', '#6250d6', '#d99a00', '#d9719d', '#2a9fd6', '#8a6d3b', '#b4bccb'];
const fmtVal = v => (v >= 1e8 ? Math.round(v / 1e7) / 10 + '亿' : v >= 1e4 ? Math.round(v / 1e3) / 10 + '万' : fmt(v));
export { fmtVal };
export function rankList(items, { limit = 10, unit = '' } = {}) {
  if (!items.length) return '';
  const max = items[0].value || 1;
  return `<ol class="rank">${items.slice(0, limit).map((it, i) => `<li><span class="no n${i + 1}">${i + 1}</span>
    <div class="nm"><b>${esc(it.model)}</b>${it.vendor ? `<span>${esc(it.vendor)}</span>` : ''}<div class="bar"><i style="width:${Math.max(2, it.value / max * 100)}%"></i></div></div>
    <span class="val" title="${esc(unit)}">${fmtVal(it.value)}</span></li>`).join('')}</ol>`;
}
// 前 top 个单独显示，其余合并为「其他」
export function donut(items, { top = 8, unit = '' } = {}) {
  if (!items.length) return '';
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  const parts = items.slice(0, top).map(x => ({ name: x.model, value: x.value }));
  const rest = items.slice(top).reduce((s, x) => s + x.value, 0);
  if (rest > 0) parts.push({ name: '其他', value: rest });
  const R = 80, r = 50, C = 100;
  let a0 = -Math.PI / 2, paths = '';
  parts.forEach((p, i) => {
    const frac = p.value / total, a1 = a0 + frac * Math.PI * 2, large = frac > .5 ? 1 : 0;
    const pt = (rad, a) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    const color = p.name === '其他' ? PIE_COLORS[8] : PIE_COLORS[i % 8];
    const d = frac >= .9999 ? `M${C},${C - R}A${R},${R} 0 1 1 ${C - .01},${C - R}L${C - .01},${C - r}A${r},${r} 0 1 0 ${C},${C - r}Z`
      : `M${pt(R, a0)}A${R},${R} 0 ${large} 1 ${pt(R, a1)}L${pt(r, a1)}A${r},${r} 0 ${large} 0 ${pt(r, a0)}Z`;
    paths += `<path d="${d}" fill="${color}" stroke="#fff" stroke-width="1.5"><title>${esc(p.name)}：${(frac * 100).toFixed(1)}%</title></path>`;
    p.color = color; p.pct = frac * 100;
    a0 = a1;
  });
  return `<div class="donut"><svg viewBox="0 0 200 200" role="img" aria-label="热销模型占比">${paths}
      <text x="100" y="96" text-anchor="middle" font-size="12" fill="#7b88a3">合计${unit ? '（' + esc(unit) + '）' : ''}</text>
      <text x="100" y="118" text-anchor="middle" font-size="20" font-weight="600" fill="#172440">${fmtVal(total)}</text></svg>
    <ul class="donut-legend">${parts.map(p => `<li><i style="background:${p.color}"></i><span class="nm">${esc(p.name)}</span><b>${p.pct.toFixed(1)}%</b></li>`).join('')}</ul></div>`;
}
