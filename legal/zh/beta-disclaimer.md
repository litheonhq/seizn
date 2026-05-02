---
doc_type: beta-disclaimer
language: zh-hans
version: v1
generated_at: 2026-05-02
status: draft (待律师审核)
master: false
translated_from: ../en/beta-disclaimer.md
applies_to: seizn.com (Author flagship), engine.seizn.com (NPC SDK surface)
beta_until: 2026-08-31
data_controller: Litheon LLC, Wyoming, USA
---

# 测试期免责声明

最近更新日期: 2026-05-02

## 1. 本文档涵盖范围

Seizn 目前以测试 (beta) 服务形式提供。本文档以平实语言解释测试期与正式启动的区别,具体涉及基础设施所有权及其对您的数据的影响。

## 2. 本文档存在的原因

我们希望您准确知道您的数据存放在哪里,以及在测试期间谁可以接触它。我们将本文档独立公开,而非埋藏于隐私政策中,因为我们认为开始阶段的透明性比法律最小化更重要。

## 3. 核心事实

> 本服务在 2026-08-31 之前以测试期 ('测试期') 形式运营。在测试期内,某些基础设施组件 — 具体而言是文件存储 (Cloudflare R2) 和支付处理中介 — 在运营者 (iruhana25@gmail.com) 的临时个人所有制下运营,以待迁移至法定数据控制者 Litheon LLC。在测试期间和之后,Litheon LLC 始终是唯一的数据控制者;您的数据仅用于提供 Seizn Author 服务而处理。您可以随时导出或删除您的数据。

## 4. 测试期间在个人名下运营的项目

| 组件 | 测试期所有者 | 迁移目标 | 迁移触发条件 |
|---|---|---|---|
| Cloudflare R2 存储桶 (`seizn-author-uploads-temp`) | 运营者个人 Cloudflare 账户 | Litheon LLC Cloudflare 账户、新桶 `seizn-author-uploads` | 累积充足收入以支撑 Mercury 初始入金;预计 2026-06-30 前 |
| 订阅计费 (Stripe) | Litheon LLC (已在法人下) | 不适用 | 不适用 |
| AI 推理 (默认 Anthropic) | Litheon LLC API 密钥 | 不适用 | 不适用 |
| 应用托管 (Vercel) | Litheon LLC 团队 | 不适用 | 不适用 |
| 身份认证 (NextAuth、Google、GitHub) | Litheon LLC OAuth 应用 | 不适用 | 不适用 |

简而言之: 临时存放在个人账户的只有文件存储层及随之的少量 Cloudflare 访问令牌。计费、代码、AI、认证、监控均已在 Litheon LLC 名下。

## 5. 个人所有为何必要

Litheon LLC 是美国怀俄明州法人。新法人激活 Cloudflare R2 企业级服务需要一张美国法人卡,这又需要 Mercury (或同等) 银行的激活,而后者需要初始入金。在初始入金清算之前,我们无法创建 Litheon 名下的 R2 桶。我们选择不延迟启动,而是在测试期内通过运营者个人 Cloudflare 账户上的临时桶运营。出于审计目的,这已记录在内部文档 `docs/migrations/20260502-r2-litheon-migration.md`。

## 6. 这对您意味着什么

- **数据控制者不变**: 在整个测试期内,Litheon LLC 始终是唯一的法定数据控制者。运营者与您不存在另外的法律关系。
- **最小权限访问**: 仅运维脚本和运营者 (以服务身份) 可以访问存储桶。除非您发起支持请求,否则不会发生人工读取访问。
- **加密适用**: 无论哪个 Cloudflare 账户持有该桶,所有上传均在传输中和静态时加密。
- **随时可导出**: Settings → Export。无需请求。
- **随时可删除**: Settings → Account → Delete。确认后 30 天内清除您的数据。
- **迁移可审计**: 当我们迁移到 Litheon 名下的桶时,我们将公布 SHA-256 完整性报告,以便您验证未被篡改或丢失。报告发布于 seizn.com/docs/migrations。

## 7. 测试期结束

测试期在 2026-08-31 结束,或在迁移至 Litheon 名下存储完成并通过验证时结束 — 以较早者为准。

如迁移在 2026-08-31 后延迟,我们将:

1. 在 seizn.com/blog 发布状态更新及新目标日期。
2. 在原始截止日后 7 天内向所有活跃账户发送邮件。
3. 继续履行所有数据权利和合同义务。

## 8. 测试期后的变化

- 临时桶在 Litheon 名下桶通过验证、迁移报告发布后被删除。
- 运营者不再持有任何基础设施访问令牌;所有凭证均轮换至 Litheon LLC。
- 本测试期免责声明被归档;后续运营仅由隐私政策和服务条款管辖。

## 9. 如果您对测试期条款不放心,可以选择

您可以:

- 等待测试期后的正式启动 (预计 2026-08-31 或之前) 再注册。
- 现在注册,并在测试期内随时导出或删除账户。
- 致函 privacy@seizn.com 反映具体顾虑。

无论您选择哪种方式我们都尊重,不会因您选择观望而对您不利。

## 10. 联系方式

- 测试期问题: beta@seizn.com
- 隐私: privacy@seizn.com
- 运营者 (透明渠道): iruhana25@gmail.com

---

*本免责声明在测试期内具备约束力。状态: 待律师审核草案。自启动日起具备约束力。*
