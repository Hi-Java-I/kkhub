# BI 看板 → 测试平台（AI Studio）单向免密登录 · 对接说明

面向：测试平台 kkaicool.northsea.site 的开发 / 维护同学。

## 流程

1. 用户在 BI 看板点击「🚀 测试平台」。
2. BI 看板签发一张**一次性票据**，并 302 跳转到：
   `http://kkaicool.northsea.site/sso/kk?kk_ticket=<票据>`
3. 测试平台校验票据通过后，为该用户建立登录状态，并把地址栏里的 `kk_ticket` 去掉（`history.replaceState` 或重定向）。
4. 校验不通过：忽略票据，按原来的方式显示登录页。

**单向**：BI 看板只签发票据，**不接受任何外部票据**。测试平台不能用任何方式免密登录 BI 看板。

## 票据格式

```
kk_ticket = <payload>.<signature>
payload   = base64url( JSON )
signature = base64url( HMAC-SHA256( SSO_SECRET, payload ) )
```

- `payload` 解码后的 JSON：

| 字段 | 含义 |
|---|---|
| `u` | BI 看板用户名（唯一） |
| `name` | 显示名 |
| `role` | `admin` / `tech` / `user` |
| `iat` | 签发时间（Unix 秒） |
| `exp` | 过期时间（Unix 秒），= iat + 60 |
| `nonce` | 随机串（24 位十六进制），每张票据不同 |

- `SSO_SECRET`：双方共享的密钥。BI 看板的密钥保存在服务器 `/srv/kk-ai-hub-bi/app.env` 的 `SSO_SECRET=` 一行，请由运维直接复制到测试平台的配置里，**不要通过聊天工具、邮件或代码仓库传递**。

## 测试平台必须做的校验

1. 用 `SSO_SECRET` 重新计算签名，与 `signature` **常量时间比较**（如 Java `MessageDigest.isEqual`），不一致则拒绝。
2. `exp` 必须大于当前时间（允许 ±30 秒时钟误差即可）。
3. `nonce` 防重放：记录 2 分钟内用过的 nonce，重复出现则拒绝。
4. 按 `u` 找到或创建对应用户；`role` 可用来决定测试平台里的权限。

## 测试平台已实现（IT-technology 项目）

- 接口：`GET /sso/kk?kk_ticket=...`（`SsoController`，不在 `/api` 下，不经过访问密钥 / 登录拦截器），校验通过写入 `KK_SESSION` 会话 Cookie 后 302 到 `/`；不通过直接 302 到 `/`，显示原登录页。
- 配置：`application.yaml` 的 `auth.sso-secret`，取环境变量 `SSO_SECRET`（写在服务器 `/srv/kkaicool/app.env`），留空即关闭免密登录。
- 账号映射：BI 用户名 `u` → 测试平台用户名 `kk_<u>`（独立命名空间，不会登录到平台原有账号；含中文等字符时为 `kk_` + 16 位哈希）。不存在时自动创建，随机密码、无需改密。
- 角色映射：BI `admin` → `ADMIN`，`tech` / `user` → `USER`，每次免密登录按 BI 角色同步。测试平台管理员禁用该账号后，免密登录被拒绝。

## Java 校验示例

```java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

public static String verify(String ticket, String secret) throws Exception {
    int dot = ticket.lastIndexOf('.');
    if (dot <= 0) return null;
    String payload = ticket.substring(0, dot), sig = ticket.substring(dot + 1);
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    String expect = Base64.getUrlEncoder().withoutPadding()
        .encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
    if (!MessageDigest.isEqual(expect.getBytes(StandardCharsets.UTF_8), sig.getBytes(StandardCharsets.UTF_8))) return null;
    String json = new String(Base64.getUrlDecoder().decode(payload), StandardCharsets.UTF_8);
    // 解析 json：检查 exp > 当前秒、nonce 未使用过，然后用 u 登录
    return json;
}
```

## BI 看板侧配置

- 跳转地址默认 `http://kkaicool.northsea.site/sso/kk`，可用环境变量 `KKAICOOL_URL` 修改。
- 未配置 `SSO_SECRET` 时，按钮只做普通跳转（不带票据）。
