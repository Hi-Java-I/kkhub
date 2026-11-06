// =========================================================
// 公共核心：请求、会话守卫、水印、提示、抽屉 / 弹窗、表格、分页、CSV
// 主界面（app.js）与管理后台（admin.js）共用
// =========================================================
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// HTML 转义：所有来自数据的内容插入页面前都要经过它（防 XSS）
export const esc = v => String(v == null ? '' : v).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
export const fmt = n => (n === null || n === undefined || n === '' ? '-' : Number(n).toLocaleString('en-US'));
export const fmtPct = v => (v === null || v === undefined ? '-' : v + '%');
export const fmtSec = v => (v === null || v === undefined ? '-' : v + 's');
export const fmtTime = ts => (ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '-');
export const uniq = arr => [...new Set(arr.map(s => String(s == null ? '' : s).trim()).filter(Boolean))];
export const toIdList = v => [...new Set(String(v || '').split(/[\r\n,，;；、]+/).map(s => s.trim()).filter(Boolean))];
export function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// 「万」为单位的简写：30000000 → 3000w
export const fmtW = n => (!n ? '-' : n >= 1e4 ? (Math.round(n / 1e4 * 10) / 10) + 'w' : fmt(n));

// 后端地址：前后端分开部署时可在页面里设置 window.KK_API_BASE
const API_BASE = window.KK_API_BASE || '';

export const state = { me: null, meta: null, onExpired: null };

export async function api(method, path, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body !== undefined) opt.body = JSON.stringify(body);
  let r;
  try { r = await fetch(API_BASE + path, opt); }
  catch (e) { throw new Error('网络连接失败，请检查网络后重试'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && state.me && path !== '/api/login') sessionExpired();
    const err = new Error(data.error || `请求失败（${r.status}）`);
    err.status = r.status;
    throw err;
  }
  if (state.me) resetIdle();
  return data;
}

export async function loadMeta() {
  if (!state.meta) state.meta = await api('GET', '/api/meta');
  return state.meta;
}

// ---------- 角色 / 状态文案 ----------
export const ROLE_LABEL = { admin: '管理员', tech: '技术人员', user: '普通用户' };
export const roleBadge = r => `<span class="badge plain b-${r in ROLE_LABEL ? r : 'user'}">${ROLE_LABEL[r] || '普通用户'}</span>`;
// 资源紧张度（管理员视角）
export const BI_STATUS = { gap: '需求缺口', tight: '资源紧张', expand: '需提前扩容', normal: '正常', redundant: '冗余可售', unfilled: '未填报' };
export const biBadge = s => `<span class="badge b-${s in BI_STATUS ? s : 'normal'}">${BI_STATUS[s] || '正常'}</span>`;
// 同步给商务的资源情况
export const SYNC_LABEL = { tight: '资源紧张', sufficient: '资源充足', redundant: '资源冗余' };
export const syncBadge = s => `<span class="badge b-${s in SYNC_LABEL ? s : 'sufficient'}">${SYNC_LABEL[s] || '资源充足'}</span>`;
export const SYNC_ADVICE = {
  tight: { cls: 'danger', text: '<b>资源紧张</b>：该模型当前资源紧张，请先与资源负责人确认可承接量再推进。' },
  sufficient: { cls: '', text: '<b>资源充足</b>：当前资源可满足本次需求，可正常推进；后台会根据需求做资源统计与扩容。' },
  redundant: { cls: 'ok', text: '<b>资源冗余</b>：该模型资源充裕，可优先推进、尽快上量。' }
};
export const tierTag = (t, hot) => (t ? `<span class="tier${hot ? ' hot' : ''}">${esc(t)}</span>` : '<span class="unfilled">未填</span>');
// 模型 ID 列表：默认显示前 n 个，其余折叠成「+N」，点击展开
export function modelChips(ids, n = 4) {
  ids = ids || [];
  if (!ids.length) return '<span class="muted">-</span>';
  const head = ids.slice(0, n).map(m => `<span class="chip">${esc(m)}</span>`).join('');
  if (ids.length <= n) return head;
  const rest = ids.slice(n).map(m => `<span class="chip">${esc(m)}</span>`).join('');
  return `${head}<span class="chip more" data-expand>+${ids.length - n}</span><span class="hidden" data-rest>${rest}</span>`;
}
document.addEventListener('click', e => {
  const m = e.target.closest('[data-expand]');
  if (!m) return;
  e.stopPropagation();
  m.nextElementSibling.classList.remove('hidden');
  m.remove();
});

// ---------- 图标（内联 SVG，线性） ----------
const svg = d => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICON = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  upload: svg('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'),
  download: svg('<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  chart: svg('<path d="M4 19h16M6 15l4-5 4 3 5-7"/>'),
  doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
  rocket: svg('<path d="M5 15c-1.5 1-2 4-2 6 2 0 5-.5 6-2M9 15l-3-3c1-4 4-8 11-9-1 7-5 10-9 11z"/><circle cx="14.5" cy="9.5" r="1.5"/>'),
  msg: svg('<path d="M4 5h16v11H8l-4 4z"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  layers: svg('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20c0-2.6-1.6-4.8-4-5.6"/>'),
  log: svg('<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="8"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  home: svg('<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  pulse: svg('<path d="M3 12h4l3-7 4 14 3-7h4"/>'),
  logout: svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>'),
  book: svg('<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>'),
  back: svg('<path d="M15 6l-6 6 6 6"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  shield: svg('<path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6z"/>')
};

// ---------- Toast ----------
export function toast(msg, type = 'ok', ms = 2600) {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? Math.max(ms, 4200) : ms);
}
export const toastErr = e => toast(e && e.message ? e.message : String(e), 'err');

// ---------- 抽屉 / 弹窗 ----------
// openPanel({ kind:'drawer'|'dialog', title, sub, body, foot, width, onMount(el, close) }) → { el, close }
const openStack = [];
export function openPanel({ kind = 'drawer', title = '', sub = '', body = '', foot = '', width, onMount, onClose } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="${kind}" role="dialog" aria-modal="true" ${width ? `style="--w:${width}px"` : ''}>
    <div class="panel-head"><div><h3>${esc(title)}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}</div><button type="button" class="x" aria-label="关闭" data-x>×</button></div>
    <div class="panel-body">${body}</div>${foot ? `<div class="panel-foot">${foot}</div>` : ''}</div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    ov.classList.remove('show');
    setTimeout(() => ov.remove(), 180);
    openStack.splice(openStack.indexOf(close), 1);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose();
  };
  openStack.push(close);
  ov.addEventListener('mousedown', e => { if (e.target === ov) ov.dataset.down = '1'; });
  ov.addEventListener('click', e => {
    if (e.target === ov && ov.dataset.down === '1' && kind === 'drawer') close();
    ov.dataset.down = '';
    if (e.target.closest('[data-x]')) close();
  });
  const panel = ov.firstElementChild;
  if (onMount) onMount(panel, close);
  const first = panel.querySelector('.panel-body input:not([type=hidden]):not([readonly]), .panel-body select, .panel-body textarea');
  setTimeout(() => (first || panel.querySelector('[data-x]')).focus(), 60);
  return { el: panel, close };
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openStack.length) openStack[openStack.length - 1](); });

export function confirmDialog(message, { title = '请确认', ok = '确定', danger = false } = {}) {
  return new Promise(resolve => {
    let done = false;
    openPanel({
      kind: 'dialog', title, width: 420,
      body: `<div style="color:var(--ink-2);line-height:1.7">${message}</div>`,
      foot: `<button class="btn" data-x>取消</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-ok>${esc(ok)}</button>`,
      onMount: (el, close) => { el.querySelector('[data-ok]').addEventListener('click', () => { done = true; resolve(true); close(); }); setTimeout(() => el.querySelector('[data-ok]').focus(), 70); },
      onClose: () => { if (!done) resolve(false); }
    });
  });
}

// 表单：把 [name] 字段读成对象
export function formData(form) {
  const out = {};
  $$('[name]', form).forEach(el => {
    if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = ''; }
    else if (el.type === 'checkbox') { (out[el.name] = out[el.name] || []); if (el.checked) out[el.name].push(el.value); }
    else out[el.name] = el.value;
  });
  return out;
}
// 提交按钮防重复点击
export async function busy(btn, fn) {
  if (!btn || btn.disabled) return;
  const txt = btn.textContent;
  btn.disabled = true; btn.textContent = '处理中…';
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = txt; }
}
export const seg = (name, options, value, { required } = {}) => `<div class="seg" role="radiogroup">${options.map((o, i) => {
  const [v, label] = Array.isArray(o) ? o : [o, o];
  const id = `seg-${name}-${i}-${Math.random().toString(36).slice(2, 7)}`;
  return `<input type="radio" id="${id}" name="${name}" value="${esc(v)}" ${String(value) === String(v) ? 'checked' : ''} ${required && i === 0 ? 'required' : ''}/><label for="${id}">${esc(label)}</label>`;
}).join('')}</div>`;
export const options = (values, cur, first) => (first !== undefined ? `<option value="">${esc(first)}</option>` : '') +
  values.map(v => { const [val, label] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(val)}" ${String(cur) === String(val) ? 'selected' : ''}>${esc(label)}</option>`; }).join('');

// ---------- 表格 + 分页 ----------
// cols: [{ title, render(row), cls, th }]
export function table(cols, rows, { empty = '暂无数据', rowAttr } = {}) {
  if (!rows.length) return `<div class="empty">${empty}</div>`;
  return `<div class="table-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${c.title}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr ${rowAttr ? rowAttr(r) : ''}>${cols.map(c => `<td class="${c.cls || ''}">${c.render(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export class Pager {
  constructor(size = 10) { this.page = 1; this.size = size; }
  slice(list) {
    this.total = list.length;
    this.pages = Math.max(1, Math.ceil(list.length / this.size));
    this.page = Math.min(Math.max(1, this.page), this.pages);
    return list.slice((this.page - 1) * this.size, this.page * this.size);
  }
  html() {
    if (!this.total) return '';
    const p = this.page, n = this.pages;
    const nums = [];
    for (let i = 1; i <= n; i++) if (i === 1 || i === n || Math.abs(i - p) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
    return `<div class="pager"><span>共 ${this.total} 条</span>${n > 1 ? `<div class="pages">
      <button data-pg="${p - 1}" ${p <= 1 ? 'disabled' : ''} aria-label="上一页">‹</button>
      ${nums.map(i => (i === '…' ? '<button disabled>…</button>' : `<button data-pg="${i}" class="${i === p ? 'on' : ''}">${i}</button>`)).join('')}
      <button data-pg="${p + 1}" ${p >= n ? 'disabled' : ''} aria-label="下一页">›</button></div>` : ''}
      <select class="select" data-pgsize>${[10, 20, 50].map(s => `<option value="${s}" ${s === this.size ? 'selected' : ''}>${s} 条/页</option>`).join('')}</select></div>`;
  }
  // 绑定到容器：点击页码后调用 render
  bind(el, render) {
    el.addEventListener('click', e => { const b = e.target.closest('[data-pg]'); if (b && !b.disabled) { this.page = Number(b.dataset.pg); render(); } });
    el.addEventListener('change', e => { if (e.target.matches('[data-pgsize]')) { this.size = Number(e.target.value); this.page = 1; render(); } });
  }
}

// ---------- CSV ----------
const csvCell = v => { let t = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export function downloadCSV(filename, head, rows) {
  const csv = '﻿' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function parseCSVText(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  row.push(cur); rows.push(row);
  return rows.map(r => r.map(s => s.trim())).filter(r => r.some(s => s !== ''));
}
// WPS / Excel 另存的 CSV 常是 GBK，按 UTF-8 读失败就换 GB18030
export async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('gb18030').decode(buf); }
}

// 复制（页面整体禁止复制，这里单独放行）
let allowCopy = false;
export async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* 走兼容写法 */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  allowCopy = true;
  let ok = false;
  try { ok = document.execCommand('copy'); } finally { allowCopy = false; ta.remove(); }
  return ok;
}

// ---------- 防截屏：水印 + 禁右键 / 复制 / 常见开发者快捷键 ----------
let antiOn = false;
export function setupProtection() {
  const wm = $('#watermark') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'watermark', className: 'watermark' });
  const name = state.me ? (state.me.displayName || state.me.username) : 'KK';
  const ts = new Date().toLocaleString('zh-CN', { hour12: false });
  wm.innerHTML = Array.from({ length: 60 }, () => `<span>${esc(name)} ${esc(state.me ? state.me.username : '')} ${ts}</span>`).join('');
  if (antiOn) return;
  antiOn = true;
  const editable = t => t && t.closest && t.closest('input, textarea, [contenteditable]');
  document.addEventListener('contextmenu', e => { if (!editable(e.target)) e.preventDefault(); });
  document.addEventListener('copy', e => { if (!allowCopy && !editable(e.target)) e.preventDefault(); });
  document.addEventListener('cut', e => { if (!editable(e.target)) e.preventDefault(); });
  document.addEventListener('selectstart', e => { if (!editable(e.target)) e.preventDefault(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'PrintScreen') e.preventDefault();
    if ((e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) || (e.ctrlKey && e.key.toUpperCase() === 'U') || e.key === 'F12') e.preventDefault();
  });
}

// ---------- 会话守卫：无操作自动退出，临近超时提醒 ----------
let IDLE_MS = 5 * 60 * 1000, WARN_MS = 30 * 1000;
let lastActivity = Date.now(), idleTimer = null, tick = null, warnPanel = null;
export function resetIdle() {
  lastActivity = Date.now();
  if (warnPanel) { warnPanel.close(); warnPanel = null; }
  clearTimeout(idleTimer);
  if (state.me) idleTimer = setTimeout(() => logout(true), IDLE_MS);
}
export async function startSessionGuard(pillEl) {
  try {
    const { data } = await api('GET', '/api/settings');
    IDLE_MS = (Number(data.sessionTimeoutMin) || 5) * 60000;
    WARN_MS = Math.max(5000, Math.min((Number(data.warnSeconds) || 30) * 1000, IDLE_MS - 5000));
  } catch (e) { /* 用默认值 */ }
  let lastMove = 0;
  ['keydown', 'click', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { if (!warnPanel) resetIdle(); }, { passive: true, capture: true }));
  document.addEventListener('mousemove', () => { const n = Date.now(); if (n - lastMove > 1000 && !warnPanel) { lastMove = n; resetIdle(); } }, { passive: true });
  resetIdle();
  clearInterval(tick);
  tick = setInterval(() => {
    const remain = Math.max(0, IDLE_MS - (Date.now() - lastActivity));
    if (pillEl) {
      const mm = String(Math.floor(remain / 60000)).padStart(2, '0'), ss = String(Math.floor(remain % 60000 / 1000)).padStart(2, '0');
      pillEl.textContent = `${mm}:${ss}`;
      pillEl.title = `无操作 ${Math.round(IDLE_MS / 60000)} 分钟将自动退出`;
      pillEl.classList.toggle('warn', remain <= WARN_MS);
    }
    if (remain <= WARN_MS && remain > 0 && !warnPanel) {
      warnPanel = openPanel({
        kind: 'dialog', title: '即将自动退出', width: 400,
        body: `<p style="margin:0 0 6px">你已经有一段时间没有操作，<b data-remain>${Math.ceil(remain / 1000)}</b> 秒后会自动退出登录。</p><p class="muted" style="margin:0">这是为了保护公司数据安全。</p>`,
        foot: '<button class="btn" data-quit>退出登录</button><button class="btn primary" data-stay>继续使用</button>',
        onMount: (el, close) => {
          el.querySelector('[data-stay]').addEventListener('click', async () => { warnPanel = null; close(); try { await api('GET', '/api/me'); } catch (e) { /* 401 会自动跳登录 */ } resetIdle(); });
          el.querySelector('[data-quit]').addEventListener('click', () => logout(false));
        },
        onClose: () => { warnPanel = null; resetIdle(); }
      });
    } else if (warnPanel) {
      const b = warnPanel.el.querySelector('[data-remain]');
      if (b) b.textContent = Math.ceil(remain / 1000);
    }
  }, 1000);
}
function sessionExpired() {
  if (!state.me) return;
  state.me = null;
  sessionStorage.setItem('kkLoginMsg', '登录已过期，请重新登录');
  location.href = '/';
}
export async function logout(idle) {
  try { await fetch(API_BASE + '/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' }); } catch (e) { /* 忽略 */ }
  state.me = null;
  if (idle) sessionStorage.setItem('kkLoginMsg', `已自动退出（${Math.round(IDLE_MS / 60000)} 分钟无操作），请重新登录`);
  location.href = '/';
}
export async function fetchMe() {
  try { const { user } = await api('GET', '/api/me'); state.me = user; return user; } catch (e) { return null; }
}

// ---------- 修改密码（管理员） ----------
export function openPasswordDialog() {
  openPanel({
    kind: 'dialog', title: '修改登录密码', width: 440,
    body: `<form class="form-grid" id="pwdForm" autocomplete="off">
      <label class="field full"><span class="label">原密码<span class="req">*</span></span><input class="input" type="password" name="cur" required autocomplete="current-password"></label>
      <label class="field full"><span class="label">新密码<span class="req">*</span></span><input class="input" type="password" name="np" required minlength="8" autocomplete="new-password"><span class="hint">至少 8 位，建议字母 + 数字 + 符号</span></label>
      <label class="field full"><span class="label">再次输入新密码<span class="req">*</span></span><input class="input" type="password" name="np2" required minlength="8" autocomplete="new-password"></label>
    </form>`,
    foot: '<button class="btn" data-x>取消</button><button class="btn primary" form="pwdForm" type="submit">保存新密码</button>',
    onMount: (el, close) => {
      const f = el.querySelector('form');
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const d = formData(f);
        if (d.np !== d.np2) return toast('两次输入的新密码不一致', 'err');
        try { await api('POST', '/api/me/password', { currentPassword: d.cur, newPassword: d.np }); close(); toast('密码已修改，下次登录请使用新密码'); } catch (err) { toastErr(err); }
      });
    }
  });
}

// ---------- 顶栏用户菜单 ----------
export function userMenu(host, items) {
  const me = state.me;
  const name = me.displayName || me.username;
  host.innerHTML = `<div class="menu-wrap"><button class="user-btn" aria-haspopup="menu" aria-expanded="false"><span class="avatar">${esc(name.slice(0, 1))}</span><span class="nm">${esc(name)}</span></button>
    <div class="menu hidden" role="menu"><div class="who"><b>${esc(name)}</b>${esc(me.username)} · ${ROLE_LABEL[me.role]}</div><div class="sep"></div>
    ${items.map((it, i) => (it === '-' ? '<div class="sep"></div>' : it.href ? `<a href="${it.href}" ${it.blank ? 'target="_blank" rel="noopener"' : ''} role="menuitem">${it.icon || ''}${esc(it.label)}</a>` : `<button data-mi="${i}" role="menuitem">${it.icon || ''}${esc(it.label)}</button>`)).join('')}</div></div>`;
  const btn = host.querySelector('.user-btn'), menu = host.querySelector('.menu');
  const toggle = open => { menu.classList.toggle('hidden', !open); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', e => { e.stopPropagation(); toggle(menu.classList.contains('hidden')); });
  document.addEventListener('click', () => toggle(false));
  menu.addEventListener('click', e => { const b = e.target.closest('[data-mi]'); if (b) { toggle(false); items[Number(b.dataset.mi)].onClick(); } });
}
