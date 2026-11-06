// =========================================================
// 主界面：商务 / 售后（普通用户）、技术人员；管理员只做入口
// =========================================================
import { $, $$, esc, api, state, toast, toastErr, openPanel, confirmDialog, formData, busy, seg, options, uniq, fmtTime,
  table, Pager, modelChips, tierTag, ICON, copyText, setupProtection, startSessionGuard, fetchMe, loadMeta,
  logout, userMenu, openPasswordDialog } from './core.js';
import { qualityCharts, rankList, donut } from './charts.js';

// 各角色可见的页签
const TABS = {
  user: [['home', '首页'], ['groups', '分组信息'], ['feedback', 'BD有话说']],
  tech: [['home', '首页'], ['resources', '资源清单'], ['quality', '服务质量'], ['groups', '分组信息'], ['notices', '公告'], ['feedback', '产品有话说']],
  admin: [['home', '首页'], ['groups', '分组信息'], ['notices', '公告']]
};
const FB_CFG = {
  bd: { title: 'BD有话说', sub: '客户需求、行业动态、资源情况，都可以在这里告诉我们',
    cats: [['需求反馈', '客户要什么模型、多少量、什么时候要'], ['行业了解', '行业动态、竞品、客户场景'], ['资源了解', '资源情况、价格、渠道等']],
    ph: '例如：某客户 coding 场景需要 claude-opus-4-6，每天稳定 3000w TPM，希望 TTFT 在 1.5s 以内，下周开始上量……' },
  product: { title: '产品有话说', sub: '把产品需求、问题反馈、优化建议告诉我们',
    cats: [['产品需求', '希望新增或调整的功能、模型、资源'], ['问题反馈', '使用或测试中遇到的问题'], ['优化建议', '体验、性能、流程上的改进']],
    ph: '例如：测试 claude-sonnet-4-6 时发现长上下文场景 TTFT 明显升高，建议……' }
};
const cache = {};
const role = () => state.me.role;
const fbCfg = () => FB_CFG[role() === 'tech' ? 'product' : 'bd'];

// ---------- 登录 ----------
function showLogin() {
  $('#login').classList.remove('hidden');
  $('#app').classList.add('hidden');
  $('#loginFoot').innerHTML = `${ICON.shield}内部系统 · 页面带水印，禁止截图外传`;
  const msg = sessionStorage.getItem('kkLoginMsg');
  if (msg) { sessionStorage.removeItem('kkLoginMsg'); $('#loginErr').textContent = msg; }
  setTimeout(() => $('#lgUser').focus(), 50);
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const u = $('#lgUser').value.trim(), p = $('#lgPwd').value;
  if (!u || !p) { $('#loginErr').textContent = '请输入用户名和密码'; return; }
  $('#loginErr').textContent = '';
  await busy(e.submitter || $('#loginForm button'), async () => {
    try {
      const { user } = await api('POST', '/api/login', { username: u, password: p });
      state.me = user;
      if (user.role === 'admin') { location.href = '/admin'; return; }
      boot();
    } catch (err) { $('#loginErr').textContent = err.message; $('#lgPwd').select(); }
  });
});

// ---------- 启动 / 路由 ----------
async function boot() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await loadMeta().catch(() => {});
  setupProtection();
  startSessionGuard($('#sessionPill'));
  const r = role();
  if (r === 'admin') { const a = $('#adminLink'); a.classList.remove('hidden'); a.innerHTML = `${ICON.gear}管理后台`; }
  const items = [{ label: '使用说明', icon: ICON.book, href: r === 'admin' ? '/api/guide/admin' : '/guide.html', blank: true }];
  if (r === 'tech' || r === 'admin') items.push({ label: '打开测试平台', icon: ICON.rocket, href: '/api/sso/kkaicool', blank: true });
  if (r === 'admin') items.push({ label: '修改密码', icon: ICON.key, onClick: openPasswordDialog });
  items.push('-', { label: '退出登录', icon: ICON.logout, onClick: () => logout(false) });
  userMenu($('#userMenu'), items);
  $('#tabs').innerHTML = TABS[r].map(([k, t]) => `<a href="#/${k}" data-tab="${k}">${t}</a>`).join('');
  window.addEventListener('hashchange', route);
  route();
}
function route() {
  const tabs = TABS[role()].map(t => t[0]);
  let k = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (!tabs.includes(k)) k = 'home';
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === k));
  // 每次切换页签都换一个新容器，旧容器上的事件监听随之丢弃
  const view = document.createElement('div');
  view.innerHTML = '<div class="empty">加载中…</div>';
  $('#view').replaceChildren(view);
  window.scrollTo(0, 0);
  VIEWS[k](view).catch(err => { view.innerHTML = `<div class="empty"><b>加载失败</b>${esc(err.message)}<br><button class="btn" data-act="reload">重新加载</button></div>`; });
}
document.addEventListener('click', e => { if (e.target.closest('[data-act=reload]')) location.reload(); });
const greet = () => { const h = new Date().getHours(); return h < 6 ? '夜深了' : h < 12 ? '上午好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'; };
const foot = '<div class="app-foot">本系统内容仅限公司内部使用，禁止截图、录屏与外传，操作会被记录</div>';
const md = d => (d ? `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日` : '');

// ---------- 数据 ----------
async function getGroups(force) { if (force || !cache.groups) cache.groups = (await api('GET', '/api/groups')).data; return cache.groups; }
async function getResources() { if (!cache.res) cache.res = (await api('GET', '/api/resources')).data; return cache.res; }

// ---------- 可复用模块 ----------
const pptBar = name => `<section class="top-strip"><div><h1>${greet()}，${esc(name)}</h1><p>给客户介绍方案时，可以直接下载这份 PPT</p></div>
  <a class="dl" href="/api/files/solution" download>${ICON.doc}<div><b>快快AIHub-企业LLM统一接入解决方案</b><span>PPT 文件</span></div><span class="go">下载</span></a>
  <img src="/assets/kk-rabbit-app.png" alt="" /></section>`;

// 热销榜（排行 + 占比两张卡）
function hotCards(hot) {
  const period = hot.from && hot.to ? `${md(hot.from)} – ${md(hot.to)}` : '';
  const sub = `<span class="period">${period}${period ? ' · ' : ''}按${esc(hot.unit || '调用量')}排序</span>`;
  if (!hot.items.length) return `<section class="card"><div class="card-head"><h3>上周热销模型</h3></div><div class="card-body"><div class="empty"><b>本周排行还没有发布</b>管理员发布后会显示在这里</div></div></section>`;
  return `<section class="card"><div class="card-head"><h3>上周热销模型 Top ${Math.min(10, hot.items.length)}</h3>${sub}</div><div class="card-body">${rankList(hot.items, { unit: hot.unit })}</div></section>
    <section class="card"><div class="card-head"><h3>热销模型占比</h3>${sub}</div><div class="card-body">${donut(hot.items, { unit: hot.unit })}</div></section>`;
}

// 密钥查模型
function keyCard() {
  return `<section class="card"><div class="card-head"><h3>密钥查模型</h3><span class="sub">输入 API 密钥，查看它能调用哪些模型</span></div><div class="card-body">
    <form class="key-form" data-keyform autocomplete="off"><div class="pwd"><input class="input" name="key" type="password" placeholder="sk-..." autocomplete="off" spellcheck="false" aria-label="API 密钥">
      <button type="button" data-eye aria-label="显示或隐藏密钥">${ICON.eye}</button></div><button class="btn primary" type="submit">查询</button></form>
    <div class="key-hint">密钥只用于本次查询，系统不会保存</div><div class="key-result" data-keyres></div></div></section>`;
}
function bindKeyCard(root) {
  const f = $('[data-keyform]', root); if (!f) return;
  let models = [];
  $('[data-eye]', f).addEventListener('click', () => { f.key.type = f.key.type === 'password' ? 'text' : 'password'; });
  const box = $('[data-keyres]', root);
  const render = () => {
    const q = ($('[data-kq]', box) || {}).value || '';
    const list = models.filter(m => !q || m.id.toLowerCase().includes(q.toLowerCase()));
    $('[data-klist]', box).innerHTML = list.length ? list.map(m => `<div><code>${esc(m.id)}</code>${m.groups.map(g => `<span class="g" title="${esc(g.vendor)}">${esc(g.group)}</span>`).join('')}</div>`).join('') : '<div class="muted">没有匹配的模型</div>';
  };
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const key = f.key.value.trim();
    if (!key) return toast('请先粘贴 API 密钥', 'err');
    await busy(f.querySelector('[type=submit]'), async () => {
      try {
        const res = await api('POST', '/api/key-models', { key });
        models = res.data;
        box.innerHTML = models.length ? `<div class="head"><b>可用模型 ${res.count} 个</b><div class="search">${ICON.search}<input class="input" data-kq placeholder="筛选"></div><button type="button" class="btn sm" data-kcopy>${ICON.copy}复制全部</button></div><div class="key-list" data-klist></div>`
          : '<div class="note warn">这个密钥目前没有可用的模型</div>';
        if (models.length) {
          render();
          $('[data-kq]', box).addEventListener('input', render);
          $('[data-kcopy]', box).addEventListener('click', async () => toast((await copyText(models.map(m => m.id).join('\n'))) ? `已复制 ${models.length} 个模型 ID` : '复制失败', 'ok'));
        }
      } catch (err) { box.innerHTML = `<div class="note danger">${esc(err.message)}</div>`; }
    });
  });
}

// 反馈输入框
function composerHtml(cfg, rows = 6) {
  return `<form class="composer" data-fbform><div class="field"><span class="label">类型</span>${seg('category', cfg.cats.map(c => c[0]), cfg.cats[0][0])}<span class="hint" data-catdesc>${cfg.cats[0][1]}</span></div>
    <label class="field"><span class="label">内容</span><textarea class="textarea" name="content" rows="${rows}" maxlength="2000" required placeholder="${esc(cfg.ph)}"></textarea><span class="hint" data-len>0 / 2000</span></label>
    <div><button class="btn primary" type="submit">提交</button></div></form>`;
}
function bindComposer(root, cfg, onDone) {
  const f = $('[data-fbform]', root);
  f.addEventListener('change', e => { if (e.target.name === 'category') $('[data-catdesc]', f).textContent = cfg.cats.find(c => c[0] === e.target.value)[1]; });
  f.content.addEventListener('input', () => { $('[data-len]', f).textContent = `${f.content.value.length} / 2000`; });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const d = formData(f);
    if (!d.content.trim()) return toast('请填写内容', 'err');
    await busy(f.querySelector('[type=submit]'), async () => {
      try {
        await api('POST', '/api/feedbacks', { category: d.category, content: d.content });
        f.content.value = ''; $('[data-len]', f).textContent = '0 / 2000';
        toast('已提交，感谢反馈'); if (onDone) onDone();
      } catch (err) { toastErr(err); }
    });
  });
}

// 分组信息表（不展示模型 ID，搜索仍可按模型 ID 找到所在分组）
function groupsBlock(view, groups, { size = 10, title } = {}) {
  const pager = new Pager(size);
  const vendors = uniq(groups.map(g => g.vendor));
  const host = document.createElement('div');
  host.innerHTML = `${title || ''}<div class="toolbar"><div class="search" style="width:280px">${ICON.search}<input class="input" data-gq placeholder="搜索分组 / 厂商 / 模型 ID"></div>
    <select class="select" data-gv>${options(vendors, '', '全部厂商')}</select><span class="spacer"></span><span class="count" data-gc></span></div><div data-gl></div><div data-gp></div>`;
  view.appendChild(host);
  const render = () => {
    const q = $('[data-gq]', host).value.trim().toLowerCase(), v = $('[data-gv]', host).value;
    const list = groups.filter(g => (!v || g.vendor === v) && (!q || [g.vendor, g.group, g.source, g.groupDesc, g.paramDesc, ...(g.modelIds || [])].join(' ').toLowerCase().includes(q)));
    $('[data-gc]', host).textContent = `${list.length} 个分组`;
    $('[data-gl]', host).innerHTML = table([
      { title: '分组', render: g => `<span class="strong">${esc(g.group)}</span>` },
      { title: '模型厂商', render: g => esc(g.vendor) },
      { title: '资源来源', render: g => esc(g.source) || '-' },
      { title: '分组说明', cls: 'wrap', render: g => esc(g.groupDesc) || '-' },
      { title: '参数说明', cls: 'wrap', render: g => esc(g.paramDesc) || '-' }
    ], pager.slice(list), { empty: q || v ? '没有匹配的分组，换个关键词试试' : '暂无分组信息' });
    $('[data-gp]', host).innerHTML = pager.html();
  };
  pager.bind($('[data-gp]', host), render);
  $('[data-gq]', host).addEventListener('input', () => { pager.page = 1; render(); });
  $('[data-gv]', host).addEventListener('change', () => { pager.page = 1; render(); });
  render();
}

// ---------- 视图 ----------
const VIEWS = {
  async home(view) {
    const r = role(), name = state.me.displayName || state.me.username;
    if (r === 'user') {
      const [{ data: hot }, groups] = await Promise.all([api('GET', '/api/hot-models'), getGroups(true)]);
      view.innerHTML = pptBar(name) + `<div class="biz-grid"><div class="col">${hotCards(hot)}</div>
        <div class="col">${keyCard()}<section class="card"><div class="card-head"><h3>BD有话说</h3><div class="actions"><a class="btn sm ghost" href="#/feedback">我提交过的</a></div></div><div class="card-body">${composerHtml(FB_CFG.bd, 5)}</div></section></div></div>
        <section class="card" style="margin-top:18px"><div class="card-head"><h3>分组信息</h3><span class="sub">各分组的资源来源与参数说明</span></div><div class="card-body" data-groups></div></section>${foot}`;
      bindKeyCard(view);
      bindComposer(view, FB_CFG.bd);
      groupsBlock($('[data-groups]', view), groups, { size: 8 });
      return;
    }
    const hero = (sub, btns) => `<section class="hero"><div class="hero-text"><h1>${greet()}，${esc(name)}</h1><p>${sub}</p><div class="btns">${btns}</div></div>
      <img class="hero-mascot" src="/assets/kk-rabbit-app.png" alt="" /></section>`;
    const [{ data: notices }, { data: hot }] = await Promise.all([api('GET', '/api/notices'), api('GET', '/api/hot-models')]);
    await getGroups();
    const noticeCard = `<section class="card"><div class="card-head"><h3>最新公告</h3><div class="actions"><a class="btn sm ghost" href="${r === 'admin' ? '/admin#/notices' : '#/notices'}">${r === 'admin' ? '管理公告' : '全部公告'}</a></div></div><div class="card-body">
      ${notices.length ? `<div class="feed">${notices.slice(0, 4).map(n => noticeItem(n, true)).join('')}</div>` : '<div class="empty">暂无公告</div>'}</div></section>`;
    view.innerHTML = (r === 'tech'
      ? hero('查看资源清单和各分组最近 24 小时的服务质量；有产品需求或问题，欢迎在「产品有话说」里反馈。',
        `<a class="btn primary lg" href="#/quality">${ICON.pulse}查看服务质量</a><a class="btn lg" href="#/feedback">${ICON.msg}产品有话说</a><a class="btn lg" href="/api/sso/kkaicool" target="_blank" rel="noopener noreferrer">${ICON.rocket}测试平台</a>`)
      : hero('资源填报、分组维护、热销榜、用户与公告管理，都在管理后台里完成。',
        `<a class="btn primary lg" href="/admin">${ICON.gear}进入管理后台</a><a class="btn lg" href="/admin#/hot">${ICON.chart}更新热销榜</a>`)) +
      `<div class="biz-grid"><div class="col">${noticeCard}${hotCards(hot)}</div><div class="col">${keyCard()}</div></div>${foot}`;
    bindKeyCard(view);
  },

  async groups(view) {
    const groups = await getGroups(true);
    view.innerHTML = `<div class="page-head"><div><h1>分组信息</h1><p>各分组的资源来源与参数说明；想知道某个模型在哪个分组，直接搜模型 ID</p></div></div>`;
    groupsBlock(view, groups);
    view.insertAdjacentHTML('beforeend', foot);
  },

  // 资源清单（技术人员只读）
  async resources(view) {
    cache.res = null;
    const res = await getResources();
    const pager = new Pager(10);
    view.innerHTML = `<div class="page-head"><div><h1>资源清单</h1><p>每个分组的 TPM / RPM 档位（只读）</p></div></div>
      <div class="toolbar"><div class="search">${ICON.search}<input class="input" id="rq" placeholder="搜索分组 / 模型"></div>
        <select class="select" id="rv">${options(uniq(res.map(r => r.vendor)), '', '全部厂商')}</select>
        ${seg('rf', [['', '全部'], ['1', '已填报'], ['0', '未填报']], '')}<span class="spacer"></span><span class="count" id="rcount"></span></div>
      <div id="rlist"></div><div id="rpager"></div>${foot}`;
    const render = () => {
      const q = $('#rq').value.trim().toLowerCase(), v = $('#rv').value, f = (view.querySelector('[name=rf]:checked') || {}).value || '';
      const list = res.filter(r => (!v || r.vendor === v) && (!f || (f === '1') === !!r.reportDate) && (!q || [r.vendor, r.group, ...(r.modelIds || [])].join(' ').toLowerCase().includes(q)));
      $('#rcount').textContent = `${list.length} 个分组`;
      $('#rlist').innerHTML = table([
        { title: '分组', render: r => `<span class="strong">${esc(r.group)}</span><span class="sub">${esc(r.vendor)}</span>` },
        { title: '模型 ID', cls: 'models', render: r => modelChips(r.modelIds, 4) },
        { title: '资源来源', render: r => esc(r.source) || '-' },
        { title: 'TPM 档位', render: r => tierTag(r.tpmTier) },
        { title: 'RPM 档位', render: r => tierTag(r.rpmTier) },
        { title: '填报日期', cls: 'num', render: r => esc(r.reportDate) || '<span class="unfilled">未填报</span>' },
        { title: '', cls: 'ops', render: r => `<button class="link" data-chart="${r.id}">质量曲线</button>` }
      ], pager.slice(list), { empty: '没有符合条件的分组' });
      $('#rpager').innerHTML = pager.html();
    };
    pager.bind($('#rpager'), render);
    $('#rq').addEventListener('input', () => { pager.page = 1; render(); });
    $('#rv').addEventListener('change', () => { pager.page = 1; render(); });
    view.addEventListener('change', e => { if (e.target.name === 'rf') { pager.page = 1; render(); } });
    view.addEventListener('click', e => {
      const b = e.target.closest('[data-chart]'); if (!b) return;
      const r = res.find(x => x.id === Number(b.dataset.chart));
      openPanel({ title: `${r.group} · 服务质量`, sub: esc(r.vendor) + ' · 最近 24 小时', width: 900, body: qualityCharts([{ id: r.groupId, group: r.group, metricsHistory: r.metricsHistory }]) });
    });
    render();
  },

  // 服务质量（技术人员）
  async quality(view) {
    cache.res = null;
    const res = await getResources();
    const vendors = uniq(res.map(r => r.vendor));
    view.innerHTML = `<div class="page-head"><div><h1>服务质量</h1><p>各分组最近 24 小时的缓存命中率、TTFT（P50）与有效成功率，每小时一个点</p></div></div>
      <div class="toolbar"><select class="select" id="qv">${options(vendors, vendors.includes('Anthropic') ? 'Anthropic' : '', '全部厂商')}</select><span class="count">在图表上方切换分组，最多同时显示 8 个</span></div>
      <section class="card"><div class="card-body" id="qbox"></div></section>${foot}`;
    const render = () => {
      const v = $('#qv').value;
      $('#qbox').innerHTML = qualityCharts(res.filter(r => !v || r.vendor === v).map(r => ({ id: r.groupId, group: r.group, vendor: r.vendor, metricsHistory: r.metricsHistory })), { note: false });
    };
    $('#qv').addEventListener('change', render);
    render();
  },

  // 公告（技术人员 / 管理员只读）
  async notices(view) {
    const [{ data }] = await Promise.all([api('GET', '/api/notices'), getGroups()]);
    const pager = new Pager(10);
    const types = (state.meta && state.meta.noticeTypes) || ['新功能', '问题汇总'];
    view.innerHTML = `<div class="page-head"><div><h1>公告</h1><p>KK AI Hub 平台的新功能与问题汇总</p></div>${role() === 'admin' ? `<div class="actions"><a class="btn primary" href="/admin#/notices">${ICON.plus}发布公告</a></div>` : ''}</div>
      <div class="toolbar">${seg('nt', [['', '全部'], ...types], '')}
        <select class="select" id="nv">${options(uniq(data.map(n => n.vendor)), '', '全部厂商')}</select>
        <div class="search">${ICON.search}<input class="input" id="nq" placeholder="搜索标题 / 内容"></div><span class="spacer"></span><span class="count" id="ncount"></span></div>
      <div id="nlist"></div><div id="npager"></div>${foot}`;
    const render = () => {
      const t = (view.querySelector('[name=nt]:checked') || {}).value || '', v = $('#nv').value, q = $('#nq').value.trim().toLowerCase();
      const list = data.filter(n => (!t || n.type === t) && (!v || n.vendor === v) && (!q || (n.title + ' ' + n.content).toLowerCase().includes(q)));
      $('#ncount').textContent = `${list.length} 条`;
      $('#nlist').innerHTML = list.length ? `<div class="feed">${pager.slice(list).map(n => noticeItem(n)).join('')}</div>` : '<div class="empty">没有符合条件的公告</div>';
      $('#npager').innerHTML = list.length ? pager.html() : '';
    };
    pager.bind($('#npager'), render);
    view.addEventListener('change', e => { if (e.target.name === 'nt' || e.target.id === 'nv') { pager.page = 1; render(); } });
    $('#nq').addEventListener('input', () => { pager.page = 1; render(); });
    render();
  },

  // BD有话说 / 产品有话说
  async feedback(view) {
    const cfg = fbCfg();
    const catCls = Object.fromEntries(cfg.cats.map((c, i) => [c[0], 'c' + (i + 1)]));
    const pager = new Pager(10);
    view.innerHTML = `<div class="page-head"><div><h1>${cfg.title}</h1><p>${cfg.sub}</p></div></div>
      <div class="two-col"><section class="card"><div class="card-head"><h3>写点什么</h3></div><div class="card-body">${composerHtml(cfg, 8)}</div></section>
      <section><div class="toolbar" style="margin-bottom:12px"><h3 style="font-size:16px">我提交过的</h3><span class="spacer"></span><span class="count" id="fbCount"></span></div><div id="fbList"></div><div id="fbPager"></div></section></div>${foot}`;
    let list = [];
    const load = async () => { list = (await api('GET', '/api/feedbacks')).data; render(); };
    const render = () => {
      $('#fbCount').textContent = list.length ? `${list.length} 条` : '';
      $('#fbList').innerHTML = list.length ? `<div class="feed">${pager.slice(list).map(x => `<div class="feed-item"><div class="meta"><span class="cat ${catCls[x.category] || 'c1'}">${esc(x.category)}</span><span>${fmtTime(x.createdAt)}</span><span class="ops"><button class="link danger" data-del-fb="${x.id}">删除</button></span></div><div class="content" style="margin-top:8px">${esc(x.content)}</div></div>`).join('')}</div>`
        : '<div class="empty"><b>还没有提交过</b>在左边写下第一条吧</div>';
      $('#fbPager').innerHTML = list.length ? pager.html() : '';
    };
    pager.bind($('#fbPager'), render);
    bindComposer(view, cfg, () => { pager.page = 1; load(); });
    view.addEventListener('click', async e => {
      const b = e.target.closest('[data-del-fb]'); if (!b) return;
      if (!(await confirmDialog('确定删除这条内容吗？', { ok: '删除', danger: true }))) return;
      try { await api('DELETE', `/api/feedbacks/${b.dataset.delFb}`); toast('已删除'); await load(); } catch (err) { toastErr(err); }
    });
    await load();
  }
};

// 公告条目（含对应分组信息）
function noticeItem(n, compact) {
  const gs = (cache.groups || []).filter(g => (n.vendor || n.group) && (!n.vendor || g.vendor === n.vendor) && (!n.group || g.group === n.group));
  const scope = n.vendor ? `${esc(n.vendor)}${n.group ? ' / ' + esc(n.group) : ''}` : '通用';
  return `<div class="feed-item"><div class="meta"><span class="cat ${n.type === '问题汇总' ? 'c2' : 'c3'}">${esc(n.type)}</span><span>${esc(n.date)}</span><span>${scope}</span></div>
    <h3>${esc(n.title)}</h3><div class="content">${compact && n.content.length > 120 ? esc(n.content.slice(0, 120)) + '…' : esc(n.content)}</div>
    ${!compact && gs.length ? `<details><summary>对应分组信息（${gs.length}）</summary>${gs.map(g => `<div class="g-info"><b>${esc(g.vendor)} / ${esc(g.group)}</b>${g.source ? ` <span class="muted">· ${esc(g.source)}</span>` : ''}${g.groupDesc ? `<div class="muted" style="margin-top:4px">${esc(g.groupDesc)}</div>` : ''}${g.paramDesc ? `<div class="muted">${esc(g.paramDesc)}</div>` : ''}</div>`).join('')}</details>` : ''}</div>`;
}

(async () => { (await fetchMe()) ? boot() : showLogin(); })();
