# KK AI Hub 资源看板 v2

零依赖 Node.js 项目，前后端分离：

```
server/            后端（纯 JSON API）
  index.js         入口：路由分发、安全响应头、可选托管前端
  config.js        环境变量配置
  http.js          请求工具 + 极简路由（:id 参数、角色权限）
  auth.js          会话 Cookie、无操作超时、登录防暴力破解
  store.js         JSON 文件存储（data/db.json，原子写入）
  services/sync.js 资源清单 ↔ 分组信息 共享字段校验
  routes/*.js      按业务拆分的接口（auth / resources / groups / insights 热销榜与密钥查模型 / content / users / system）
web/               前端（原生 ES Module，无需构建）
  index.html       主界面：商务 / 技术人员（登录页也在这里）
  admin.html       管理后台：仅管理员
  js/core.js       请求、会话守卫、水印、抽屉 / 弹窗、表格分页、CSV
  js/charts.js     SVG 图表（热销排行、占比环形图、服务质量 24 小时）
  js/batch.js      批量导入
  css/             base（设计基础）/ app（主界面）/ admin（后台）
server.js          兼容入口（docker / start.bat 仍执行 node server.js）
```

## 运行

- 本地：双击 `start.bat`，主界面 `http://localhost:3000/`，管理后台 `http://localhost:3000/admin`。管理员登录后会直接进入后台。
- 单容器（与 v1 相同）：`docker build -t <registry>/kk-ai-hub-bi:<tag> .`，推送后在服务器执行 `deploy/deploy.sh <镜像:tag>`。数据目录 `data/` 挂载不变，旧 `db.json` 直接兼容。
- 前后端分开部署：后端 `SERVE_WEB=0 TRUST_PROXY=1 node server.js`，前端 `web/` 交给 Nginx，参考 `deploy/nginx.split.conf`。

## 环境变量

| 变量 | 说明 |
|---|---|
| `PORT` | 端口，默认 3000 |
| `KK_SECRET` | 会话签名密钥，生产必填 |
| `TRUST_PROXY=1` | 在 Nginx 后面时开启，取 X-Real-IP |
| `SERVE_WEB=0` | 后端只提供 /api |
| `WEB_DIR` / `DATA_DIR` | 前端目录 / 数据目录 |
| `SESSION_TIMEOUT_MIN`、`WARN_SECONDS` | 覆盖系统设置里的超时与提醒 |
| `MODELS_API_URL` | 「密钥查模型」转发的上游，默认 https://ai-api.kkidc.com/v1/models |
| `SSO_SECRET`、`KKAICOOL_URL` | 测试平台免密跳转，见 docs/sso-kkaicool.md |

## 角色与页面

| 角色 | 主界面 | 管理后台 |
|---|---|---|
| 普通用户（销售 / 售后） | 首页（方案 PPT、上周热销排行 + 占比饼图、密钥查模型、BD有话说、分组信息）、分组信息、BD有话说 | 无 |
| 技术人员 | 首页、资源清单（只读）、服务质量、分组信息、公告、产品有话说 | 无 |
| 管理员 | 首页、分组信息、公告 | 资源概览、资源清单、分组信息、热销榜、公告、反馈、用户、登录日志、系统设置 |

旧版代码保留在 `_backup_v1/`，确认新版稳定后可删除。

商机机制已于 2026-11-06 下线（销售需求改走 BD有话说）；db.json 里旧的 opportunities 数据保留未删，只是不再使用。
