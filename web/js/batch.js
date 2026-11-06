// =========================================================
// 批量导入（CSV 文件或从 Excel 粘贴）：资源档位 / 分组信息 / 用户
// =========================================================
import { $, esc, api, openPanel, toast, toastErr, busy, parseCSVText, readTextFile, toIdList } from './core.js';

const roleText = r => (['管理员', 'admin'].includes(r) ? '管理员' : ['技术人员', 'tech'].includes(r) ? '技术人员' : '普通用户');
export const BATCH = {
  resource: {
    title: '批量填报 TPM / RPM', api: '/api/resources/batch', file: '资源TPM_RPM批量填报模板.csv',
    fields: [['vendor', '模型厂商', 1], ['group', '分组', 1], ['tpm', 'TPM'], ['rpm', 'RPM'], ['cacheHit', '缓存命中率'], ['ttft', 'TTFT(P50)'], ['successRate', '有效成功率'], ['source', '资源来源'], ['modelId', '模型ID']],
    sample: ['Anthropic,claude-offical,2000w-3000w,2000-3000,92.5,1.2,99.6,,', 'Anthropic,ccmax,5000w以上,5000以上,88,1.8,99.1,,'],
    tip: 'TPM 填档位 500w-1000w / 1000w-2000w / 2000w-3000w / 3000w-5000w / 5000w以上，RPM 填 500-1000 … 5000以上，也可填具体数字自动归档。命中率和成功率填百分数，TTFT 填秒数，可留空。分组信息里没有的分组会自动新建。'
  },
  group: {
    title: '批量上新分组', api: '/api/groups/batch', file: '分组信息批量上新模板.csv',
    fields: [['vendor', '模型厂商', 1], ['group', '分组', 1], ['modelId', '模型ID', 1], ['source', '资源来源'], ['groupDesc', '分组说明'], ['paramDesc', '参数说明']],
    sample: ['DeepSeek,ds-prod,deepseek-v3,官方API,通用对话主力,"128K 上下文, 最大输出 8K"', 'Moonshot,kimi-prod,kimi-k2,官方API,长文本场景,256K 上下文'],
    tip: '一个「模型ID」格子里可填多个模型（换行或逗号分隔）；同一「模型厂商 + 分组」会合并，已存在的分组会追加模型。',
    show: r => ({ ...r, modelId: toIdList(r.modelId).length + ' 个' })
  },
  user: {
    title: '批量添加用户', api: '/api/users/batch', file: '批量添加用户模板.csv',
    fields: [['username', '用户名', 1], ['password', '密码', 1], ['displayName', '显示名'], ['role', '角色']],
    sample: ['zhangsan,Zs@2026abc,张三,普通用户', 'lisi,Ls@2026abc,李四,技术人员'],
    tip: '密码至少 6 位（建议 8 位以上）。角色填 普通用户 / 技术人员 / 管理员，留空为普通用户。用户名已存在的行会跳过。模板里的示例密码请务必替换。',
    show: r => ({ ...r, password: r.password ? '•'.repeat(Math.min(r.password.length, 10)) : '', role: roleText(r.role) })
  }
};

function parseRows(text, cfg) {
  const rows = parseCSVText(text);
  if (!rows.length) throw new Error('内容为空');
  const map = {};
  rows[0].forEach((h, i) => {
    const key = h.replace(/[*＊\s]/g, '').toLowerCase();
    cfg.fields.forEach(f => { if (key === f[0].toLowerCase() || key === f[1].toLowerCase()) map[f[0]] = i; });
  });
  const miss = cfg.fields.filter(f => f[2] && map[f[0]] === undefined);
  if (miss.length) throw new Error('缺少必填列：' + miss.map(f => f[1]).join('、') + '（请确认第一行是表头）');
  return rows.slice(1).map(cols => Object.fromEntries(cfg.fields.map(f => [f[0], map[f[0]] !== undefined ? (cols[map[f[0]]] || '') : ''])));
}

export function openBatch(mode, onDone) {
  const cfg = BATCH[mode];
  let rows = [];
  const valid = r => cfg.fields.filter(f => f[2]).every(f => String(r[f[0]] || '').trim());
  openPanel({
    title: cfg.title, sub: '上传 CSV 文件，或直接从 Excel / WPS 复制粘贴（含表头）', width: 760,
    body: `<div class="note" style="margin-bottom:14px">${esc(cfg.tip)}</div>
      <div class="field"><span class="label">表头列（顺序不限，中英文均可，<b style="color:var(--brand-d)">蓝色</b>为必填）</span>
        <div class="batch-cols">${cfg.fields.map(f => `<span class="chip ${f[2] ? 'req' : ''}">${f[1]}</span>`).join('')}</div></div>
      <div style="display:flex;gap:10px;margin-bottom:12px"><button type="button" class="btn sm" data-tpl>下载模板</button></div>
      <label class="dropzone" data-drop><input type="file" accept=".csv,.txt,text/csv,text/plain" data-file><span data-fname>点击选择 CSV 文件，或拖到这里</span></label>
      <div class="field" style="margin-top:14px"><span class="label">或粘贴内容</span><textarea class="textarea" rows="6" data-text placeholder="${esc(cfg.fields.map(f => f[1]).join(',') + '\n' + cfg.sample[0])}"></textarea></div>
      <div class="section-title" data-stat>预览</div><div data-preview class="muted" style="font-size:13px">粘贴或选择文件后自动解析</div>`,
    foot: `<button class="btn" data-x>取消</button><button class="btn primary" data-submit disabled>导入</button>`,
    onMount: (el, close) => {
      const text = $('[data-text]', el), sub = $('[data-submit]', el);
      const parse = () => {
        const t = text.value.trim();
        if (!t) { rows = []; $('[data-preview]', el).innerHTML = '粘贴或选择文件后自动解析'; sub.disabled = true; sub.textContent = '导入'; return; }
        try {
          rows = parseRows(t, cfg);
          const ok = rows.filter(valid).length, bad = rows.length - ok;
          $('[data-stat]', el).innerHTML = `预览 <span class="muted" style="font-weight:400">共 ${rows.length} 行，可导入 ${ok} 行${bad ? `，<span style="color:var(--red)">${bad} 行缺必填项将跳过</span>` : ''}</span>`;
          const show = cfg.show || (r => r);
          $('[data-preview]', el).innerHTML = `<div class="preview"><table class="tbl"><thead><tr><th>#</th>${cfg.fields.map(f => `<th>${f[1]}</th>`).join('')}</tr></thead><tbody>${
            rows.slice(0, 50).map((r, i) => `<tr class="${valid(r) ? '' : 'bad'}"><td>${i + 1}</td>${cfg.fields.map(f => `<td>${esc(show(r)[f[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${rows.length > 50 ? `<div class="muted" style="font-size:12px;margin-top:6px">仅预览前 50 行</div>` : ''}`;
          sub.disabled = !ok; sub.textContent = `导入 ${ok} 行`;
        } catch (err) {
          rows = []; sub.disabled = true; sub.textContent = '导入';
          $('[data-preview]', el).innerHTML = `<div class="note danger">${esc(err.message)}</div>`;
        }
      };
      let tmr;
      text.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(parse, 250); });
      const load = async file => { if (!file) return; $('[data-fname]', el).textContent = file.name; text.value = await readTextFile(file); parse(); };
      $('[data-file]', el).addEventListener('change', e => load(e.target.files[0]));
      const dz = $('[data-drop]', el);
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); load(e.dataTransfer.files[0]); });
      $('[data-tpl]', el).addEventListener('click', () => {
        const blob = new Blob(['﻿' + cfg.fields.map(f => f[1]).join(',') + '\n' + cfg.sample.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = cfg.file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      sub.addEventListener('click', () => busy(sub, async () => {
        try {
          const res = await api('POST', cfg.api, { items: rows.filter(valid) });
          close();
          const extra = res.created !== undefined ? `（新建 ${res.created}，合并 ${res.merged}）` : '';
          toast(`导入完成：成功 ${res.added} 行${extra}` + (res.errors.length ? `\n跳过 ${res.errors.length} 行：` + res.errors.slice(0, 5).map(e => `第 ${e.row} 行 ${e.reason}`).join('；') : ''), res.errors.length ? 'err' : 'ok', 6000);
          if (onDone) onDone();
        } catch (err) { toastErr(err); }
      }));
    }
  });
}
