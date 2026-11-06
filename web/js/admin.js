// =========================================================
// 管理后台
// =========================================================
import { $, $$, esc, api, state, toast, toastErr, openPanel, confirmDialog, formData, busy, seg, options, uniq, fmt, fmtW, fmtPct, fmtSec, fmtTime,
  todayLocal, table, Pager, modelChips, tierTag, ROLE_LABEL, parseCSVText, roleBadge, ICON, copyText, downloadCSV,
  setupProtection, startSessionGuard, fetchMe, loadMeta, logout, userMenu, openPasswordDialog, toIdList } from './core.js';
import { qualityCharts, rankList, donut } from './charts.js';
import { openBatch } from './batch.js';

const NAV = [
  ['概览', [['dashboard', '资源概览', ICON.grid]]],
  ['资源', [['resources', '资源清单', ICON.layers], ['groups', '分组信息', ICON.list]]],
  ['内容', [['hot', '热销榜', ICON.chart], ['notices', '公告', ICON.bell], ['feedback', '反馈', ICON.msg]]],
  ['系统', [['users', '用户', ICON.users], ['logs', '登录日志', ICON.log], ['settings', '系统设置', ICON.gear]]]
];
const TITLES = Object.fromEntries(NAV.flatMap(g => g[1].map(([k, t]) => [k, t])));
const D = {};
const load = {
  overview: async () => (D.overview = await api('GET', '/api/overview')),
  groups: async () => (D.groups = (await api('GET', '/api/groups')).data),
  resources: async () => (D.resources = (await api('GET', '/api/resources')).data),
  users: async () => (D.users = (await api('GET', '/api/users')).data),
  notices: async () => (D.notices = (await api('GET', '/api/notices')).data),
  logs: async () => (D.logs = (await api('GET', '/api/login-logs')).data)
};
const qs = () => new URLSearchParams(location.hash.split('?')[1] || '');
const kw = (o, keys) => keys.map(k => (Array.isArray(o[k]) ? o[k].join(' ') : o[k] || '')).join(' ').toLowerCase();
const head = (title, desc, actions = '') => `<div class="page-head"><div><h1>${title}</h1>${desc ? `<p>${desc}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
const searchBox = (id, ph, w) => `<div class="search" ${w ? `style="width:${w}px"` : ''}>${ICON.search}<input class="input" id="${id}" placeholder="${ph}"></div>`;

// ---------- 启动 ----------
(async () => {
  const me = await fetchMe();
  if (!me) { location.href = '/'; return; }
  if (me.role !== 'admin') { location.href = '/'; return; }
  $('#admin').classList.remove('hidden');
  await loadMeta().catch(() => {});
  setupProtection();
  startSessionGuard($('#sessionPill'));
  $('#sideNav').innerHTML = NAV.map(([g, items]) => `<div class="grp">${g}</div>` + items.map(([k, t, ic]) => `<a class="nav" href="#/${k}" data-nav="${k}">${ic}${t}<span class="cnt hidden" data-cnt="${k}"></span></a>`).join('')).join('');
  $('#sideFoot').innerHTML = `<a href="/">${ICON.home}返回主界面</a><a href="/api/guide/admin" target="_blank" rel="noopener">${ICON.book}管理员使用说明</a><a href="/api/sso/kkaicool" target="_blank" rel="noopener noreferrer">${ICON.rocket}打开测试平台</a>`;
  userMenu($('#userMenu'), [{ label: '修改密码', icon: ICON.key, onClick: openPasswordDialog }, '-', { label: '退出登录', icon: ICON.logout, onClick: () => logout(false) }]);
  $('#menuToggle').addEventListener('click', e => { e.stopPropagation(); $('#admin').classList.toggle('nav-open'); });
  document.addEventListener('click', e => { if (!e.target.closest('.side')) $('#admin').classList.remove('nav-open'); });
  window.addEventListener('hashchange', route);
  route();
  refreshCounts();
})();

async function refreshCounts() {
  try {
    const res = await load.resources();
    const set = (k, n, warn) => { const el = $(`[data-cnt=${k}]`); el.textContent = n; el.classList.toggle('hidden', !n); el.classList.toggle('warn', !!warn); };
    const unfilled = res.filter(r => !r.reportDate).length;
    set('resources', unfilled, true);
    $('[data-cnt=resources]').title = `${unfilled} 个分组未填报`;
  } catch (e) { /* 忽略 */ }
}

function route() {
  let k = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (!PAGES[k]) k = 'dashboard';
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === k));
  $('#crumb').innerHTML = `管理后台 / <b>${TITLES[k]}</b>`;
  document.title = `${TITLES[k]} · 管理后台 · KK AI Hub`;
  const view = document.createElement('div');
  view.innerHTML = '<div class="empty">加载中…</div>';
  $('#view').replaceChildren(view);
  window.scrollTo(0, 0);
  PAGES[k](view).catch(err => { view.innerHTML = `<div class="empty"><b>加载失败</b>${esc(err.message)}</div>`; });
}

// =========================================================
const PAGES = {
  // ---------- 资源概览 ----------
  async dashboard(view) {
    const { data: rows, stats, hot } = await load.overview();
    const unfilled = rows.filter(r => !r.reportDate).length;
    const big = rows.filter(r => ((state.meta || {}).redundantTpmTiers || []).includes(r.tpmTier)).length;
    let status = qs().get('s') || '';
    const pager = new Pager(10);
    const hotWhen = hot.updatedAt ? fmtTime(hot.updatedAt).slice(0, 10) : '未发布';
    view.innerHTML = head('资源概览', '各分组的资源档位、服务质量与填报情况',
      `<button class="btn" data-act="refresh">${ICON.refresh}刷新</button><a class="btn primary" href="#/resources?f=0">${ICON.layers}填报 TPM / RPM</a>`) +
      `<div class="kpis">
        <button class="kpi" data-s=""><div class="l">资源分组</div><div class="n">${stats.groups}</div><div class="s">已填报 ${stats.filled}</div></button>
        <button class="kpi amber" data-s="unfilled"><div class="l">未填报</div><div class="n">${unfilled}</div><div class="s">还没选档位</div></button>
        <button class="kpi mint" data-s="big"><div class="l">TPM 3000w 以上</div><div class="n">${big}</div><div class="s">资源充裕</div></button>
        <a class="kpi" href="#/hot"><div class="l">热销榜</div><div class="n" style="font-size:18px;line-height:39px">${esc(hotWhen)}</div><div class="s">${hot.items.length} 个模型</div></a>
        <a class="kpi" href="#/feedback"><div class="l">反馈</div><div class="n">${stats.feedbacks}</div><div class="s">BD / 产品有话说</div></a>
        <a class="kpi" href="#/users"><div class="l">用户</div><div class="n">${stats.users}</div><div class="s">全部角色</div></a>
      </div>
      <div class="dash-grid"><section class="card"><div class="card-head"><h3>各分组资源</h3></div>
        <div class="card-body"><div class="toolbar" style="margin-bottom:12px"><div class="status-tabs" id="stTabs"></div><span class="spacer"></span>
          <select class="select" id="dv">${options(uniq(rows.map(g => g.vendor)), '', '全部厂商')}</select>${searchBox('dq', '搜索分组', 180)}</div>
          <div id="dbody"></div><div id="dpager"></div></div></section>
        <div style="display:grid;gap:18px"><section class="card"><div class="card-head"><h3>上周热销</h3><div class="actions"><a class="btn sm ghost" href="#/hot">编辑</a></div></div><div class="card-body">
          ${hot.items.length ? rankList(hot.items, { limit: 5, unit: hot.unit }) : `<div class="empty"><b>还没有发布</b><a class="btn primary" href="#/hot">${ICON.plus}发布热销榜</a></div>`}</div></section>
        <section class="card"><div class="card-head"><h3>待处理</h3></div><div class="card-body"><div class="todo">
          <a href="#/resources?f=0">${ICON.layers}未填报 TPM / RPM 的分组<span class="n warn">${unfilled}</span></a>
          <a href="#/hot">${ICON.chart}更新上周热销榜<span class="n">${esc(hot.to ? hot.to.slice(5) : '-')}</span></a>
          <a href="#/feedback">${ICON.msg}查看 BD / 产品反馈<span class="n">${stats.feedbacks}</span></a>
        </div></div></section></div></div>`;
    const match = (r, k) => (k === 'unfilled' ? !r.reportDate : k === 'filled' ? !!r.reportDate : k === 'big' ? ((state.meta || {}).redundantTpmTiers || []).includes(r.tpmTier) : true);
    const render = () => {
      const v = $('#dv').value, q = $('#dq').value.trim().toLowerCase();
      const base = rows.filter(g => (!v || g.vendor === v) && (!q || kw(g, ['vendor', 'group']).includes(q)));
      const tabs = [['', '全部'], ['filled', '已填报'], ['unfilled', '未填报'], ['big', 'TPM 3000w 以上']];
      $('#stTabs').innerHTML = tabs.map(([k, t]) => `<button data-s="${k}" class="${k === status ? 'on' : ''}">${t}<span class="c">${base.filter(r => match(r, k)).length}</span></button>`).join('');
      const list = base.filter(r => match(r, status));
      $('#dbody').innerHTML = table([
        { title: '分组', render: g => `<span class="strong">${esc(g.group)}</span><span class="sub">${esc(g.vendor)} · ${g.modelCount} 个模型</span>` },
        { title: 'TPM', render: g => tierTag(g.tpmTier, ((state.meta || {}).redundantTpmTiers || []).includes(g.tpmTier)) },
        { title: 'RPM', render: g => tierTag(g.rpmTier) },
        { title: '命中率', cls: 'num', render: g => fmtPct(g.cacheHit) },
        { title: 'TTFT', cls: 'num', render: g => fmtSec(g.ttft) },
        { title: '成功率', cls: 'num', render: g => fmtPct(g.successRate) },
        { title: '填报', render: g => g.reportDate ? `${esc(g.reportDate)}<span class="sub">${esc(g.reportedBy) || ''}</span>` : '<span class="badge b-unfilled">未填报</span>' }
      ], pager.slice(list), { empty: '没有符合条件的分组' });
      $('#dpager').innerHTML = pager.html();
    };
    pager.bind($('#dpager'), render);
    view.addEventListener('click', e => {
      const s = e.target.closest('[data-s]');
      if (s) { status = s.dataset.s; pager.page = 1; render(); }
      if (e.target.closest('[data-act=refresh]')) { route(); toast('已刷新'); }
    });
    $('#dv').addEventListener('change', () => { pager.page = 1; render(); });
    $('#dq').addEventListener('input', () => { pager.page = 1; render(); });
    render();
  },

  // ---------- 热销榜 ----------
  async hot(view) {
    const [{ data: hot }] = await Promise.all([api('GET', '/api/hot-models'), load.groups()]);
    // 默认周期：上周一至上周日
    const lastWeek = () => {
      const d = new Date(); const day = (d.getDay() + 6) % 7;
      const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day - 7), sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
      const s = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      return [s(mon), s(sun)];
    };
    const [dFrom, dTo] = lastWeek();
    let items = hot.items.map(x => ({ ...x }));
    const modelVendor = Object.fromEntries((D.groups || []).flatMap(g => (g.modelIds || []).map(m => [m, g.vendor])));
    view.innerHTML = head('热销榜', '发布后，商务首页会显示「上周热销模型」排行和占比饼图',
      `<button class="btn" data-act="paste">${ICON.upload}从表格粘贴</button><button class="btn primary" data-act="save">发布</button>`) +
      `<div class="dash-grid"><section class="card"><div class="card-body">
        <form class="form-grid" id="hotMeta" style="margin-bottom:16px">
          <label class="field"><span class="label">统计周期</span><div style="display:flex;gap:6px;align-items:center"><input class="input" type="date" name="from" value="${esc(hot.from || dFrom)}"><span class="muted">至</span><input class="input" type="date" name="to" value="${esc(hot.to || dTo)}"></div></label>
          <label class="field"><span class="label">排序依据</span><input class="input" name="unit" maxlength="20" value="${esc(hot.unit || '调用量')}" placeholder="如 调用量 / Token 量 / 消耗金额"></label>
        </form>
        <div class="table-wrap"><table class="tbl"><thead><tr><th style="width:44px">#</th><th>模型 ID</th><th>厂商（选填）</th><th class="num" style="width:160px">数值</th><th style="width:60px"></th></tr></thead><tbody id="hotRows"></tbody></table></div>
        <div style="margin-top:10px;display:flex;gap:8px"><button class="btn sm" data-act="add">${ICON.plus}加一行</button><span class="muted" style="font-size:12px;align-self:center">保存时按数值从大到小自动排序，空行和 0 会被忽略</span></div>
        ${hot.updatedAt ? `<p class="muted" style="font-size:12px;margin:14px 0 0">上次发布：${fmtTime(hot.updatedAt)}（${esc(hot.updatedBy)}）</p>` : ''}
      </div></section>
      <section class="card"><div class="card-head"><h3>预览</h3></div><div class="card-body" id="hotPreview"></div></section></div>
      <datalist id="modelList">${uniq(Object.keys(modelVendor)).map(m => `<option value="${esc(m)}">`).join('')}</datalist>`;
    const clean = () => items.map(x => ({ ...x, value: Number(String(x.value).replace(/[,，\s]/g, '')) || 0 })).filter(x => x.model.trim() && x.value > 0).sort((a, b) => b.value - a.value);
    const preview = () => {
      const list = clean(), unit = $('#hotMeta').unit.value;
      $('#hotPreview').innerHTML = list.length ? rankList(list, { unit }) + '<div style="margin-top:16px"></div>' + donut(list, { unit }) : '<div class="empty">填写后这里会显示排行和饼图</div>';
    };
    const renderRows = () => {
      if (!items.length) items.push({ model: '', vendor: '', value: '' });
      $('#hotRows').innerHTML = items.map((x, i) => `<tr><td class="muted">${i + 1}</td>
        <td><input class="input" list="modelList" data-i="${i}" data-k="model" value="${esc(x.model)}" placeholder="如 claude-opus-4-6"></td>
        <td><input class="input" data-i="${i}" data-k="vendor" value="${esc(x.vendor || '')}"></td>
        <td><input class="input" style="text-align:right" inputmode="decimal" data-i="${i}" data-k="value" value="${esc(x.value)}"></td>
        <td class="ops"><button class="link danger" data-rm="${i}" aria-label="删除这一行">删除</button></td></tr>`).join('');
      preview();
    };
    $('#hotRows').addEventListener('input', e => {
      const i = Number(e.target.dataset.i), k = e.target.dataset.k; if (!k) return;
      items[i][k] = e.target.value;
      if (k === 'model' && !items[i].vendor && modelVendor[e.target.value.trim()]) { items[i].vendor = modelVendor[e.target.value.trim()]; $(`[data-i="${i}"][data-k=vendor]`).value = items[i].vendor; }
      preview();
    });
    $('#hotMeta').addEventListener('input', preview);
    view.addEventListener('click', async e => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { items.splice(Number(rm.dataset.rm), 1); renderRows(); }
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'add') { items.push({ model: '', vendor: '', value: '' }); renderRows(); $$('#hotRows [data-k=model]').pop().focus(); }
      if (a === 'paste') {
        openPanel({ kind: 'dialog', title: '从表格粘贴', width: 560,
          body: '<p class="muted" style="margin:0 0 10px">从 Excel / WPS 复制两列或三列：<b>模型 ID</b>、<b>数值</b>，可选第三列<b>厂商</b>。有表头也没关系，会自动跳过。粘贴后会替换当前列表。</p><textarea class="textarea" rows="10" data-paste placeholder="claude-opus-4-6\t1200000&#10;gpt-5\t860000"></textarea>',
          foot: '<button class="btn" data-x>取消</button><button class="btn primary" data-ok>导入</button>',
          onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => {
            const rows = parseCSVText(el.querySelector('[data-paste]').value).filter(r => r.length >= 2 && Number(String(r[1]).replace(/[,，\s]/g, '')) > 0);
            if (!rows.length) return toast('没有识别到「模型 ID + 数值」两列', 'err');
            items = rows.map(r => ({ model: r[0], value: r[1], vendor: r[2] || modelVendor[r[0]] || '' }));
            close(); renderRows(); toast(`已导入 ${items.length} 行，确认无误后点「发布」`);
          }) });
      }
      if (a === 'save') {
        const list = clean(), m = formData($('#hotMeta'));
        if (!list.length) return toast('请至少填写一个模型和数值', 'err');
        if (m.from && m.to && m.from > m.to) return toast('统计周期的开始日期不能晚于结束日期', 'err');
        await busy(e.target.closest('[data-act]'), async () => {
          try { const { data } = await api('PUT', '/api/hot-models', { ...m, items: list }); items = data.items.map(x => ({ ...x })); renderRows(); toast('热销榜已发布，商务首页已更新'); } catch (err) { toastErr(err); }
        });
      }
    });
    renderRows();
  },

  // ---------- 资源清单 ----------
  async resources(view) {
    await load.resources();
    const pager = new Pager(10);
    view.innerHTML = head('资源清单', '与分组信息一一对应：每个分组选择 TPM / RPM 档位，并填写服务质量基准值',
      `<button class="btn" data-act="export">${ICON.download}导出</button><button class="btn" data-act="batch">${ICON.upload}批量填报</button>`) +
      `<div class="toolbar">${searchBox('rq', '搜索分组 / 模型 ID', 220)}<select class="select" id="rv"></select>
        ${seg('rf', [['', '全部'], ['0', '未填报'], ['1', '已填报']], qs().get('f') || '')}
        <input class="input" type="date" id="rd" title="按填报日期筛选"><button class="btn ghost sm" data-act="reset">重置</button><span class="spacer"></span><span class="count" id="rcount"></span></div>
      <div id="rlist"></div><div id="rpager"></div>`;
    const filtered = () => {
      const q = $('#rq').value.trim().toLowerCase(), v = $('#rv').value, f = (view.querySelector('[name=rf]:checked') || {}).value || '', d = $('#rd').value;
      return D.resources.filter(r => (!v || r.vendor === v) && (!f || (f === '1') === !!r.reportDate) && (!d || r.reportDate === d) && (!q || kw(r, ['vendor', 'group', 'source', 'modelIds']).includes(q)));
    };
    const render = () => {
      $('#rv').innerHTML = options(uniq(D.resources.map(r => r.vendor)), $('#rv').value, '全部厂商');
      const list = filtered();
      $('#rcount').textContent = `${list.length} / ${D.resources.length} 个分组`;
      $('#rlist').innerHTML = table([
        { title: '分组', render: r => `<span class="strong">${esc(r.group)}</span><span class="sub">${esc(r.vendor)}${r.source ? ' · ' + esc(r.source) : ''}</span>` },
        { title: '模型 ID', cls: 'models', render: r => modelChips(r.modelIds, 3) },
        { title: 'TPM', render: r => tierTag(r.tpmTier) },
        { title: 'RPM', render: r => tierTag(r.rpmTier) },
        { title: '命中率', cls: 'num', render: r => fmtPct(r.cacheHit) },
        { title: 'TTFT', cls: 'num', render: r => fmtSec(r.ttft) },
        { title: '成功率', cls: 'num', render: r => fmtPct(r.successRate) },
        { title: '填报', render: r => r.reportDate ? `${esc(r.reportDate)}<span class="sub">${esc(r.reportedBy) || ''}</span>` : '<span class="badge b-unfilled">未填报</span>' },
        { title: '', cls: 'ops', render: r => `<button class="link" data-fill="${r.id}">${r.reportDate ? '更新' : '填报'}</button><button class="link" data-chart="${r.id}">曲线</button>` }
      ], pager.slice(list), { empty: '没有符合条件的分组' });
      $('#rpager').innerHTML = pager.html();
    };
    pager.bind($('#rpager'), render);
    $('#rq').addEventListener('input', () => { pager.page = 1; render(); });
    ['#rv', '#rd'].forEach(s => $(s).addEventListener('change', () => { pager.page = 1; render(); }));
    view.addEventListener('change', e => { if (e.target.name === 'rf') { pager.page = 1; render(); } });
    view.addEventListener('click', e => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'reset') { $('#rq').value = ''; $('#rv').value = ''; $('#rd').value = ''; view.querySelector('[name=rf]').checked = true; pager.page = 1; render(); }
      if (a === 'batch') openBatch('resource', async () => { await load.resources(); render(); refreshCounts(); });
      if (a === 'export') {
        const list = filtered();
        if (!list.length) return toast('没有可导出的数据', 'err');
        const b = v => (v == null ? '' : v);
        downloadCSV(`资源清单_${todayLocal()}.csv`, ['模型厂商', '分组', '模型ID', '资源来源', 'TPM档位', 'RPM档位', '缓存命中率(%)', 'TTFT P50(秒)', '有效成功率(%)', '每小时波动(±%)', '填报日期', '填报人', '分组说明'],
          list.map(r => [r.vendor, r.group, (r.modelIds || []).join('、'), r.source, r.tpmTier || '未填报', r.rpmTier || '未填报', b(r.cacheHit), b(r.ttft), b(r.successRate), r.metricAmp || 1, r.reportDate || '未填报', r.reportedBy, r.groupDesc]));
      }
      const f = e.target.closest('[data-fill]');
      if (f) openFill(D.resources.find(r => r.id === Number(f.dataset.fill)), async () => { await load.resources(); render(); refreshCounts(); });
      const c = e.target.closest('[data-chart]');
      if (c) {
        const r = D.resources.find(x => x.id === Number(c.dataset.chart));
        openPanel({ title: `${r.group} · 服务质量`, sub: `基准值：命中率 ${fmtPct(r.cacheHit)} · TTFT ${fmtSec(r.ttft)} · 成功率 ${fmtPct(r.successRate)} · 每小时波动 ±${r.metricAmp || 1}%`, width: 900,
          body: qualityCharts([{ id: r.groupId, group: r.group, metricsHistory: r.metricsHistory }], { note: false }) });
      }
    });
    render();
  },

  // ---------- 分组信息 ----------
  async groups(view) {
    await load.groups();
    const pager = new Pager(10);
    view.innerHTML = head('分组信息', '模型厂商 / 分组 / 模型 ID 的主数据；新增分组后资源清单会自动出现对应一行',
      `<button class="btn" data-act="batch">${ICON.upload}批量上新</button><button class="btn primary" data-act="add">${ICON.plus}新增分组</button>`) +
      `<div class="toolbar">${searchBox('gq', '搜索模型 ID / 分组 / 说明', 240)}<select class="select" id="gv"></select>
<span class="spacer"></span><span class="count" id="gcount"></span></div>
      <div id="glist"></div><div id="gpager"></div>`;
    const render = () => {
      $('#gv').innerHTML = options(uniq(D.groups.map(g => g.vendor)), $('#gv').value, '全部厂商');
      const q = $('#gq').value.trim().toLowerCase(), v = $('#gv').value;
      const list = D.groups.filter(g => (!v || g.vendor === v) && (!q || kw(g, ['vendor', 'group', 'source', 'groupDesc', 'paramDesc', 'modelIds']).includes(q)));
      $('#gcount').textContent = `${list.length} / ${D.groups.length} 个分组`;
      $('#glist').innerHTML = table([
        { title: '分组', render: g => `<span class="strong">${esc(g.group)}</span><span class="sub">${esc(g.vendor)}</span>` },
        { title: '模型 ID', cls: 'models', render: g => modelChips(g.modelIds, q ? 99 : 4) },
        { title: '资源来源', render: g => esc(g.source) || '-' },
        { title: '分组说明', cls: 'wrap', render: g => esc(g.groupDesc) || '-' },
        { title: '参数说明', cls: 'wrap', render: g => esc(g.paramDesc) || '-' },
        { title: '', cls: 'ops', render: g => `<button class="link" data-edit="${g.id}">编辑</button><button class="link danger" data-del="${g.id}">删除</button>` }
      ], pager.slice(list), { empty: q || v ? '没有符合条件的分组' : `<b>还没有分组</b><button class="btn primary" data-act="add">${ICON.plus}新增分组</button>` });
      $('#gpager').innerHTML = pager.html();
    };
    const reload = async () => { await load.groups(); render(); refreshCounts(); };
    pager.bind($('#gpager'), render);
    $('#gq').addEventListener('input', () => { pager.page = 1; render(); });
    $('#gv').addEventListener('change', () => { pager.page = 1; render(); });
    view.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'add') openGroupForm(null, reload);
      if (a === 'batch') openBatch('group', reload);
      const ed = e.target.closest('[data-edit]');
      if (ed) openGroupForm(D.groups.find(g => g.id === Number(ed.dataset.edit)), reload);
      const del = e.target.closest('[data-del]');
      if (del) {
        const g = D.groups.find(x => x.id === Number(del.dataset.del));
        if (!(await confirmDialog(`删除分组「${esc(g.vendor)} / ${esc(g.group)}」后，资源清单里对应的一行（档位与服务质量数据）也会一起删除，且无法恢复。`, { title: '删除分组', ok: '删除', danger: true }))) return;
        try { await api('DELETE', `/api/groups/${g.id}`); toast('分组已删除'); await reload(); } catch (err) { toastErr(err); }
      }
    });
    render();
  },

  // ---------- 公告 ----------
  async notices(view) {
    await Promise.all([load.notices(), load.groups()]);
    const types = (state.meta && state.meta.noticeTypes) || ['新功能', '问题汇总'];
    const pager = new Pager(10);
    view.innerHTML = head('公告', '发布平台新功能与问题汇总；技术人员和管理员可见', `<button class="btn primary" data-act="add">${ICON.plus}发布公告</button>`) +
      `<div class="toolbar">${seg('nt', [['', '全部'], ...types], '')}<input class="input" type="date" id="nf"><span class="muted">至</span><input class="input" type="date" id="nto">
        <select class="select" id="nv"></select>${searchBox('nq', '搜索标题 / 内容')}<span class="spacer"></span><span class="count" id="ncount"></span></div><div id="nlist"></div><div id="npager"></div>`;
    const render = () => {
      $('#nv').innerHTML = options(uniq(D.notices.map(n => n.vendor)), $('#nv').value, '全部厂商');
      const t = (view.querySelector('[name=nt]:checked') || {}).value || '', f = $('#nf').value, to = $('#nto').value, v = $('#nv').value, q = $('#nq').value.trim().toLowerCase();
      const list = D.notices.filter(n => (!t || n.type === t) && (!f || n.date >= f) && (!to || n.date <= to) && (!v || n.vendor === v) && (!q || kw(n, ['title', 'content']).includes(q)));
      $('#ncount').textContent = `${list.length} 条`;
      $('#nlist').innerHTML = list.length ? `<div class="feed">${pager.slice(list).map(n => `<div class="feed-item"><div class="meta"><span class="cat ${n.type === '问题汇总' ? 'c2' : 'c3'}">${esc(n.type)}</span><span>${esc(n.date)}</span><span>${n.vendor ? esc(n.vendor) + (n.group ? ' / ' + esc(n.group) : '') : '通用'}</span><span>${esc(n.updatedBy || n.createdBy)}</span>
        <span class="ops"><button class="link" data-edit="${n.id}">编辑</button><button class="link danger" data-del="${n.id}">删除</button></span></div><h3>${esc(n.title)}</h3><div class="content">${esc(n.content)}</div></div>`).join('')}</div>`
        : `<div class="empty">${D.notices.length ? '没有符合条件的公告' : `<b>还没有公告</b><button class="btn primary" data-act="add">${ICON.plus}发布公告</button>`}</div>`;
      $('#npager').innerHTML = list.length ? pager.html() : '';
    };
    const reload = async () => { await load.notices(); render(); };
    pager.bind($('#npager'), render);
    $('#nq').addEventListener('input', () => { pager.page = 1; render(); });
    view.addEventListener('change', e => { if (['nt', 'nf', 'nto', 'nv'].includes(e.target.name || e.target.id)) { pager.page = 1; render(); } });
    view.addEventListener('click', async e => {
      if (e.target.closest('[data-act=add]')) openNoticeForm(null, types, reload);
      const ed = e.target.closest('[data-edit]');
      if (ed) openNoticeForm(D.notices.find(n => n.id === Number(ed.dataset.edit)), types, reload);
      const del = e.target.closest('[data-del]');
      if (del && await confirmDialog('确定删除这条公告吗？', { ok: '删除', danger: true })) {
        try { await api('DELETE', `/api/notices/${del.dataset.del}`); toast('公告已删除'); await reload(); } catch (err) { toastErr(err); }
      }
    });
    render();
  },

  // ---------- 反馈 ----------
  async feedback(view) {
    let ch = qs().get('c') === 'product' ? 'product' : 'bd';
    const types = (state.meta && state.meta.feedbackTypes) || { bd: ['需求反馈', '行业了解', '资源了解'], product: ['产品需求', '问题反馈', '优化建议'] };
    const pager = new Pager(10);
    let list = [];
    view.innerHTML = head('反馈', 'BD有话说来自商务，产品有话说来自技术人员', `<button class="btn" data-act="export">${ICON.download}导出</button>`) +
      `<div class="toolbar"><div class="seg-tabs"><button data-ch="bd">BD有话说</button><button data-ch="product">产品有话说</button></div>
        <select class="select" id="ft"></select><select class="select" id="fu"></select><input class="input" type="date" id="ff"><span class="muted">至</span><input class="input" type="date" id="fto">
        ${searchBox('fq', '搜索内容', 180)}<span class="spacer"></span><span class="count" id="fcount"></span></div><div id="flist"></div><div id="fpager"></div>`;
    const filtered = () => {
      const t = $('#ft').value, u = $('#fu').value, f = $('#ff').value, to = $('#fto').value, q = $('#fq').value.trim().toLowerCase();
      return list.filter(x => (!t || x.category === t) && (!u || x.createdBy === u) && (!f || x.date >= f) && (!to || x.date <= to) && (!q || x.content.toLowerCase().includes(q)));
    };
    const render = () => {
      $$('[data-ch]', view).forEach(b => b.classList.toggle('on', b.dataset.ch === ch));
      $('#ft').innerHTML = options(types[ch], $('#ft').value, '全部类型');
      $('#fu').innerHTML = options(uniq(list.map(x => x.createdBy)), $('#fu').value, '全部提交人');
      const rows = filtered();
      $('#fcount').textContent = `${rows.length} 条`;
      const ci = c => 'c' + (types[ch].indexOf(c) + 1 || 1);
      $('#flist').innerHTML = rows.length ? `<div class="feed">${pager.slice(rows).map(x => `<div class="feed-item"><div class="meta"><span class="cat ${ci(x.category)}">${esc(x.category)}</span><b style="color:var(--ink)">${esc(x.createdBy)}</b><span>${fmtTime(x.createdAt)}</span><span class="ops"><button class="link danger" data-del="${x.id}">删除</button></span></div><div class="content" style="margin-top:8px">${esc(x.content)}</div></div>`).join('')}</div>`
        : '<div class="empty">暂时没有内容</div>';
      $('#fpager').innerHTML = rows.length ? pager.html() : '';
    };
    const reload = async () => { list = (await api('GET', '/api/feedbacks?channel=' + ch)).data; render(); };
    pager.bind($('#fpager'), render);
    $('#fq').addEventListener('input', () => { pager.page = 1; render(); });
    ['#ft', '#fu', '#ff', '#fto'].forEach(s => $(s).addEventListener('change', () => { pager.page = 1; render(); }));
    view.addEventListener('click', async e => {
      const c = e.target.closest('[data-ch]');
      if (c && c.dataset.ch !== ch) { ch = c.dataset.ch; pager.page = 1; ['#ft', '#fu'].forEach(s => { $(s).value = ''; }); await reload(); }
      if (e.target.closest('[data-act=export]')) {
        const rows = filtered();
        if (!rows.length) return toast('没有可导出的内容', 'err');
        downloadCSV(`${ch === 'bd' ? 'BD有话说' : '产品有话说'}_${todayLocal()}.csv`, ['类型', '提交人', '提交时间', '内容'], rows.map(x => [x.category, x.createdBy, fmtTime(x.createdAt), x.content]));
      }
      const del = e.target.closest('[data-del]');
      if (del && await confirmDialog('确定删除这条反馈吗？', { ok: '删除', danger: true })) {
        try { await api('DELETE', `/api/feedbacks/${del.dataset.del}`); toast('已删除'); await reload(); } catch (err) { toastErr(err); }
      }
    });
    await reload();
  },

  // ---------- 用户 ----------
  async users(view) {
    await load.users();
    const pager = new Pager(10);
    view.innerHTML = head('用户', '账号由管理员开通；普通用户与技术人员不能自行改密码，忘记时在这里重置',
      `<button class="btn" data-act="batch">${ICON.upload}批量添加</button><button class="btn primary" data-act="add">${ICON.plus}新增用户</button>`) +
      `<div class="toolbar">${searchBox('uq', '搜索用户名 / 显示名')}${seg('ur', [['', '全部'], ...Object.entries(ROLE_LABEL)], '')}<span class="spacer"></span><span class="count" id="ucount"></span></div><div id="ulist"></div><div id="upager"></div>`;
    const render = () => {
      const q = $('#uq').value.trim().toLowerCase(), r = (view.querySelector('[name=ur]:checked') || {}).value || '';
      const list = D.users.filter(u => (!r || u.role === r) && (!q || kw(u, ['username', 'displayName']).includes(q)));
      $('#ucount').textContent = `${list.length} 个用户`;
      $('#ulist').innerHTML = table([
        { title: '用户', render: u => `<span class="strong">${esc(u.displayName || u.username)}</span><span class="sub">${esc(u.username)}${u.id === state.me.id ? ' · 当前登录' : ''}</span>` },
        { title: '角色', render: u => roleBadge(u.role) },
        { title: '创建时间', render: u => fmtTime(u.createdAt) },
        { title: '', cls: 'ops', render: u => `<button class="link" data-edit="${u.id}">编辑 / 重置密码</button>${u.id === state.me.id ? '' : `<button class="link danger" data-del="${u.id}">删除</button>`}` }
      ], pager.slice(list), { empty: '没有符合条件的用户' });
      $('#upager').innerHTML = pager.html();
    };
    const reload = async () => { await load.users(); render(); };
    pager.bind($('#upager'), render);
    $('#uq').addEventListener('input', () => { pager.page = 1; render(); });
    view.addEventListener('change', e => { if (e.target.name === 'ur') { pager.page = 1; render(); } });
    view.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'add') openUserForm(null, reload);
      if (a === 'batch') openBatch('user', reload);
      const ed = e.target.closest('[data-edit]');
      if (ed) openUserForm(D.users.find(u => u.id === Number(ed.dataset.edit)), reload);
      const del = e.target.closest('[data-del]');
      if (del) {
        const u = D.users.find(x => x.id === Number(del.dataset.del));
        if (!(await confirmDialog(`删除用户「${esc(u.displayName)}（${esc(u.username)}）」后，该账号将无法登录。`, { title: '删除用户', ok: '删除', danger: true }))) return;
        try { await api('DELETE', `/api/users/${u.id}`); toast('用户已删除'); await reload(); } catch (err) { toastErr(err); }
      }
    });
    render();
  },

  // ---------- 登录日志 ----------
  async logs(view) {
    await load.logs();
    const pager = new Pager(20);
    view.innerHTML = head('登录日志', '最近 500 次登录记录') +
      `<div class="toolbar">${searchBox('lq', '搜索用户名 / IP')}${seg('lr', [['', '全部'], ['success', '成功'], ['fail', '失败']], '')}<span class="spacer"></span><span class="count" id="lcount"></span></div><div id="llist"></div><div id="lpager"></div>`;
    const render = () => {
      const q = $('#lq').value.trim().toLowerCase(), r = (view.querySelector('[name=lr]:checked') || {}).value || '';
      const list = D.logs.filter(l => (!r || l.result === r) && (!q || kw(l, ['username', 'ip']).includes(q)));
      $('#lcount').textContent = `${list.length} 条`;
      $('#llist').innerHTML = table([
        { title: '时间', render: l => fmtTime(l.time) },
        { title: '用户名', render: l => `<span class="strong">${esc(l.username) || '-'}</span>` },
        { title: '结果', render: l => `<span class="badge plain b-${l.result === 'success' ? 'success' : 'fail'}">${l.result === 'success' ? '成功' : '失败'}</span>` },
        { title: 'IP', render: l => esc(l.ip) },
        { title: '浏览器', cls: 'wrap', render: l => `<span class="muted" style="font-size:12px">${esc(String(l.userAgent || '').slice(0, 120))}</span>` }
      ], pager.slice(list), { empty: '暂无记录' });
      $('#lpager').innerHTML = pager.html();
    };
    pager.bind($('#lpager'), render);
    $('#lq').addEventListener('input', () => { pager.page = 1; render(); });
    view.addEventListener('change', e => { if (e.target.name === 'lr') { pager.page = 1; render(); } });
    render();
  },

  // ---------- 系统设置 ----------
  async settings(view) {
    const [{ data: s }, ov] = await Promise.all([api('GET', '/api/settings'), load.overview()]);
    const st = ov.stats;
    view.innerHTML = head('系统设置') + `<div class="settings-grid">
      <section class="card"><div class="card-head"><h3>登录安全</h3></div><div class="card-body"><form id="setForm" class="form-grid">
        <label class="field"><span class="label">无操作自动退出（分钟）</span><input class="input" type="number" name="sessionTimeoutMin" min="1" max="240" required value="${esc(s.sessionTimeoutMin)}"><span class="hint">1 – 240 分钟</span></label>
        <label class="field"><span class="label">提前提醒（秒）</span><input class="input" type="number" name="warnSeconds" min="0" max="600" required value="${esc(s.warnSeconds)}"><span class="hint">退出前多少秒弹窗提醒</span></label>
        <div class="full"><button class="btn primary" type="submit">保存设置</button></div></form></div></section>
      <section class="card"><div class="card-head"><h3>我的账号</h3></div><div class="card-body">
        <div class="kv" style="grid-template-columns:96px 1fr;margin-bottom:14px"><div>用户名</div><div>${esc(state.me.username)}</div><div>显示名</div><div>${esc(state.me.displayName)}</div></div>
        <button class="btn" data-act="pwd">${ICON.key}修改登录密码</button></div></section>
      <section class="card"><div class="card-head"><h3>数据概况</h3></div><div class="card-body"><div class="kv" style="grid-template-columns:120px 1fr">
        <div>用户</div><div>${st.users}</div><div>分组 / 已填报</div><div>${st.groups} / ${st.filled}</div><div>公告</div><div>${st.notices}</div><div>反馈</div><div>${st.feedbacks}</div>
      </div></div></section></div>`;
    $('#setForm').addEventListener('submit', async e => {
      e.preventDefault();
      const d = formData(e.target);
      await busy(e.target.querySelector('[type=submit]'), async () => {
        try { await api('PUT', '/api/settings', { sessionTimeoutMin: Number(d.sessionTimeoutMin), warnSeconds: Number(d.warnSeconds) }); toast('设置已保存，新会话立即生效'); } catch (err) { toastErr(err); }
      });
    });
    view.addEventListener('click', e => { if (e.target.closest('[data-act=pwd]')) openPasswordDialog(); });
  }
};

// =========================================================
// 抽屉表单
// =========================================================
function openFill(r, done) {
  const meta = state.meta || {};
  const val = v => (v === null || v === undefined ? '' : v);
  openPanel({
    title: `${r.reportDate ? '更新' : '填报'} · ${r.group}`, sub: `${esc(r.vendor)} · 上次填报：${r.reportDate ? `${esc(r.reportDate)}（${esc(r.reportedBy) || '-'}）` : '未填报'}`, width: 620,
    body: `<form id="fillForm" class="form-grid">
      <div class="field full"><span class="label">包含模型（${(r.modelIds || []).length}）</span><div>${modelChips(r.modelIds, 8)}</div></div>
      <div class="form-section">资源量档位（w = 万）</div>
      <div class="field full"><span class="label">TPM 档位<span class="req">*</span></span>${seg('tpmTier', meta.tpmTiers || [], r.tpmTier || '', { required: true })}<span class="hint">3000w 以上的分组会在商务首页显示为「资源充裕，可优先推进」</span></div>
      <div class="field full"><span class="label">RPM 档位<span class="req">*</span></span>${seg('rpmTier', meta.rpmTiers || [], r.rpmTier || '', { required: true })}</div>
      <div class="form-section">服务质量基准值（选填）</div>
      <div class="metric-inputs">
        <label class="field"><span class="label">缓存命中率（%）</span><input class="input" type="number" name="cacheHit" min="0" max="100" step="0.01" value="${val(r.cacheHit)}" placeholder="如 92.5"></label>
        <label class="field"><span class="label">TTFT P50（秒）</span><input class="input" type="number" name="ttft" min="0" step="0.01" value="${val(r.ttft)}" placeholder="如 1.2"></label>
        <label class="field"><span class="label">有效成功率（%）</span><input class="input" type="number" name="successRate" min="0" max="100" step="0.01" value="${val(r.successRate)}" placeholder="如 99.6"></label>
      </div>
      <div class="field full"><span class="label">每小时波动幅度</span>${seg('metricAmp', [['1', '±1%'], ['5', '±5%']], String(r.metricAmp || 1))}<span class="hint">系统按基准值和波动幅度生成每小时曲线；修改后从当前小时起生效</span></div>
      <details class="full"><summary class="muted" style="cursor:pointer;font-size:13px">修改分组名称 / 资源来源（会同步到分组信息）</summary>
        <div class="form-grid" style="margin-top:12px"><label class="field"><span class="label">模型厂商</span><input class="input" name="vendor" value="${esc(r.vendor)}" required></label>
        <label class="field"><span class="label">分组名称</span><input class="input" name="group" value="${esc(r.group)}" required></label>
        <label class="field full"><span class="label">资源来源</span><input class="input" name="source" value="${esc(r.source || '')}"></label></div></details>
    </form>`,
    foot: '<span class="left">保存后填报日期记为今天</span><button class="btn" data-x>取消</button><button class="btn primary" type="submit" form="fillForm">保存</button>',
    onMount: (el, close) => {
      const f = $('#fillForm', el);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const d = formData(f);
        if (!d.tpmTier || !d.rpmTier) return toast('请选择 TPM 和 RPM 档位', 'err');
        await busy(el.querySelector('[form=fillForm]'), async () => {
          try { await api('PUT', `/api/resources/${r.id}`, { ...d, vendor: d.vendor.trim(), group: d.group.trim(), source: d.source.trim() }); close(); toast(`「${r.group}」已保存`); done(); } catch (err) { toastErr(err); }
        });
      });
    }
  });
}

function openGroupForm(g, done) {
  const v = g || {};
  const vendors = uniq((D.groups || []).map(x => x.vendor));
  openPanel({
    title: g ? '编辑分组' : '新增分组', sub: g ? `${esc(g.vendor)} / ${esc(g.group)}` : '新增后资源清单会自动出现对应一行，记得去选择档位', width: 600,
    body: `<form id="grpForm" class="form-grid" autocomplete="off">
      <label class="field"><span class="label">模型厂商<span class="req">*</span></span><input class="input" name="vendor" list="vendorList" required value="${esc(v.vendor || '')}" placeholder="如 Anthropic"><datalist id="vendorList">${vendors.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <label class="field"><span class="label">分组<span class="req">*</span></span><input class="input" name="group" required value="${esc(v.group || '')}" placeholder="如 claude-offical"></label>
      <label class="field full"><span class="label">模型 ID<span class="req">*</span> <span class="hint" data-mc></span></span><textarea class="textarea" name="modelIds" rows="5" required placeholder="一行一个，或用逗号分隔&#10;claude-opus-4-6&#10;claude-sonnet-4-6">${esc((v.modelIds || []).join('\n'))}</textarea></label>
      <label class="field full"><span class="label">资源来源</span><input class="input" name="source" value="${esc(v.source || '')}" placeholder="官方 API / 云厂商 / 代理"></label>

      <label class="field full"><span class="label">分组说明</span><textarea class="textarea" name="groupDesc" rows="2" placeholder="该分组的用途">${esc(v.groupDesc || '')}</textarea></label>
      <label class="field full"><span class="label">参数说明</span><textarea class="textarea" name="paramDesc" rows="3" placeholder="上下文长度、最大输出等">${esc(v.paramDesc || '')}</textarea></label>
    </form>`,
    foot: `<button class="btn" data-x>取消</button><button class="btn primary" type="submit" form="grpForm">${g ? '保存修改' : '新增分组'}</button>`,
    onMount: (el, close) => {
      const f = $('#grpForm', el);
      const cnt = () => { $('[data-mc]', el).textContent = `${toIdList(f.modelIds.value).length} 个`; };
      f.modelIds.addEventListener('input', cnt); cnt();
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const d = formData(f);
        const body = { ...d, vendor: d.vendor.trim(), group: d.group.trim(), modelIds: toIdList(d.modelIds), source: d.source.trim(), groupDesc: d.groupDesc.trim(), paramDesc: d.paramDesc.trim() };
        if (!body.modelIds.length) return toast('请至少填写一个模型 ID', 'err');
        await busy(el.querySelector('[form=grpForm]'), async () => {
          try { g ? await api('PUT', `/api/groups/${g.id}`, body) : await api('POST', '/api/groups', body); close(); toast(g ? '分组已保存' : '分组已新增，可在资源清单里选择档位'); done(); } catch (err) { toastErr(err); }
        });
      });
    }
  });
}

function openNoticeForm(n, types, done) {
  const v = n || {};
  const groups = D.groups || [];
  const vendors = uniq(groups.map(g => g.vendor).concat(v.vendor ? [v.vendor] : []));
  const groupOpts = vendor => uniq(groups.filter(g => g.vendor === vendor).map(g => g.group).concat(v.group && v.vendor === vendor ? [v.group] : []));
  openPanel({
    title: n ? '编辑公告' : '发布公告', width: 620,
    body: `<form id="ntForm" class="form-grid">
      <div class="field"><span class="label">类型<span class="req">*</span></span>${seg('type', types, v.type || types[0])}</div>
      <label class="field"><span class="label">日期<span class="req">*</span></span><input class="input" type="date" name="date" required value="${esc(v.date || todayLocal())}"></label>
      <label class="field full"><span class="label">标题<span class="req">*</span></span><input class="input" name="title" maxlength="100" required value="${esc(v.title || '')}" placeholder="例如：claude-opus-4-7 已上线 claude-offical 分组"></label>
      <label class="field"><span class="label">相关厂商</span><select class="select" name="vendor">${options(vendors, v.vendor || '', '不指定（通用）')}</select></label>
      <label class="field"><span class="label">相关分组</span><select class="select" name="group">${options(groupOpts(v.vendor), v.group || '', '不指定')}</select></label>
      <label class="field full"><span class="label">内容<span class="req">*</span></span><textarea class="textarea" name="content" rows="8" maxlength="3000" required placeholder="新功能说明 / 问题现象、影响范围、处理进展……">${esc(v.content || '')}</textarea></label>
    </form>`,
    foot: `<button class="btn" data-x>取消</button><button class="btn primary" type="submit" form="ntForm">${n ? '保存修改' : '发布'}</button>`,
    onMount: (el, close) => {
      const f = $('#ntForm', el);
      f.vendor.addEventListener('change', () => { f.group.innerHTML = options(groupOpts(f.vendor.value), '', '不指定'); f.group.disabled = !f.vendor.value; });
      f.group.disabled = !f.vendor.value;
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const d = formData(f);
        d.group = d.vendor ? f.group.value : '';
        await busy(el.querySelector('[form=ntForm]'), async () => {
          try { n ? await api('PUT', `/api/notices/${n.id}`, d) : await api('POST', '/api/notices', d); close(); toast(n ? '公告已保存' : '公告已发布'); done(); } catch (err) { toastErr(err); }
        });
      });
    }
  });
}

// 随机密码：8 位，含大小写与数字，去掉易混淆字符
function randomPassword(len = 10) {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnpqrstuvwxyz', N = '23456789', ALL = U + L + N;
  const rnd = n => { const a = new Uint32Array(1); const lim = Math.floor(4294967296 / n) * n; do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % n; };
  const c = [U[rnd(U.length)], L[rnd(L.length)], N[rnd(N.length)]];
  while (c.length < len) c.push(ALL[rnd(ALL.length)]);
  for (let i = c.length - 1; i > 0; i--) { const j = rnd(i + 1); [c[i], c[j]] = [c[j], c[i]]; }
  return c.join('');
}
function openUserForm(u, done) {
  const v = u || {}, self = u && u.id === state.me.id;
  const roleDesc = { user: '提交商机、查看分组信息、BD有话说', tech: '只读资源清单、分组信息、服务质量；产品有话说', admin: '全部功能，含管理后台' };
  openPanel({
    title: u ? '编辑用户' : '新增用户', sub: u ? esc(u.username) : '', width: 520,
    body: `<form id="userForm" class="form-grid" autocomplete="off">
      <label class="field"><span class="label">用户名<span class="req">*</span></span><input class="input" name="username" required ${u ? 'readonly' : ''} value="${esc(v.username || '')}" placeholder="登录用，唯一"></label>
      <label class="field"><span class="label">显示名</span><input class="input" name="displayName" value="${esc(v.displayName || '')}" placeholder="如 张三"></label>
      <div class="field full"><span class="label">角色</span>${self ? `<div>${roleBadge(v.role)} <span class="hint">不能修改自己的角色</span></div>` : seg('role', Object.entries(ROLE_LABEL), v.role || 'user')}<span class="hint" data-rd>${self ? '' : roleDesc[v.role || 'user']}</span></div>
      <div class="field full"><span class="label">${u ? '重置密码' : '登录密码'}${u ? '' : '<span class="req">*</span>'}</span>
        <div class="pwd-row"><input class="input" name="password" type="password" autocomplete="new-password" ${u ? '' : 'required minlength="6"'} placeholder="${u ? '留空则不修改' : '至少 6 位'}">
          <button type="button" class="btn" data-gen>随机生成</button><button type="button" class="btn hidden" data-cp>${ICON.copy}复制</button></div>
        <span class="hint" data-pt>${u ? '普通用户和技术人员不能自己改密码，忘记时在这里重置' : ''}</span></div>
    </form>`,
    foot: `<button class="btn" data-x>取消</button><button class="btn primary" type="submit" form="userForm">${u ? '保存' : '创建用户'}</button>`,
    onMount: (el, close) => {
      const f = $('#userForm', el);
      f.addEventListener('change', e => { if (e.target.name === 'role') $('[data-rd]', el).textContent = roleDesc[e.target.value]; });
      $('[data-gen]', el).addEventListener('click', () => {
        f.password.value = randomPassword(); f.password.type = 'text';
        $('[data-cp]', el).classList.remove('hidden');
        $('[data-pt]', el).textContent = '已生成随机密码，请复制后发给该用户（保存后无法再查看）';
      });
      $('[data-cp]', el).addEventListener('click', async () => toast((await copyText(f.password.value)) ? '密码已复制' : '复制失败，请手动记录', 'ok'));
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const d = formData(f);
        if (d.password && d.password.length < 6) return toast('密码至少 6 位', 'err');
        const body = { displayName: d.displayName.trim(), password: d.password };
        if (!self) body.role = d.role;
        await busy(el.querySelector('[form=userForm]'), async () => {
          try {
            if (u) await api('PUT', `/api/users/${u.id}`, body); else await api('POST', '/api/users', { ...body, username: d.username.trim() });
            close(); toast(u ? (d.password ? '已保存，密码已重置' : '已保存') : '用户已创建'); done();
          } catch (err) { toastErr(err); }
        });
      });
    }
  });
}
