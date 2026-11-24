# 桌面翻译栏实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Windows、macOS 和 Linux 上提供开箱即用的右侧中英翻译栏。

**Architecture:** TypeScript 界面通过 Tauri 调用 Rust 窗口和网络命令。单实例 Node.js 服务使用持久化 SQLite 数据库限制每日额度，通过百度翻译开放平台识别语种和翻译。

**Tech Stack:** Tauri 2、Rust、TypeScript、Vite、Vitest、Node.js 24、SQLite、百度翻译开放平台。

**Spec:** [桌面翻译栏首版设计](../specs/2026-11-23-desktop-translator-design.md)

## 全局约束

- 首版验收覆盖 Windows 11（x64）、macOS 14 或更新版本（Apple Silicon）和 Ubuntu 24.04 LTS（x64，X11 和 Wayland）。
- 手动输入或粘贴后点击翻译。默认自动中英互译，也可以手动选方向。支持复制译文。
- Windows、macOS 与支持定位的 Linux 使用右侧悬浮按钮，展开后可固定置顶。Wayland 提供普通应用窗口入口。侧栏是独立窗口。
- 安装包通过内置 HTTPS 地址访问服务。服务端凭据仅用于托管环境，试用按额度运行。服务日志只记录状态和计数等元数据。

## 审查重点

1. 全角空格和换行组成的输入无法提交。
2. 翻译过程中编辑原文，旧译文不能显示为新输入的结果。
3. 超时后保留输入并可重试。
4. 高 DPI 和副屏负坐标下，按钮与面板正确对齐工作区。
5. 同时请求最后一份服务额度时，只有一个请求进入翻译供应商。

## 1. 翻译面板

**文件** `package.json`、`index.html`、`src/main.ts`、`src/panel.ts`、`src/panel.css`、`src/translation.ts`、`tests/panel.test.ts`

**接口** `translate(request: { text: string, direction: Direction }): Promise<Translation>`。`Direction = 'auto' | 'zh-en' | 'en-zh'`，`Translation = { text: string, from: 'zh' | 'en', to: 'zh' | 'en' }`。错误码为 `invalid_input`、`unsupported_language`、`rate_limited`、`unavailable`，机器码由界面映射到中文提示。`mountPanel(root: HTMLElement, deps: { translate: Translate, copy: (text: string) => Promise<void>, setWindowMode: SetWindowMode }): void`。`SetWindowMode = (mode: 'collapsed' | 'expanded' | 'pinned') => Promise<void>`。

- [ ] 写 DOM 测试。`startsInAutoAndSubmitsOnlyOnClick` 确认输入「你好」期间调用数为 0，点击后收到 `{ text: '你好', direction: 'auto' }`。`rendersAndCopiesSentence` 确认手动选 `en-zh` 后提交 `Good morning.`，显示并复制供应商返回的「早上好。」。
- [ ] 写 DOM 边界测试。`rejectsWhitespace` 使用 `　\n` 并确认调用数为 0。`ignoresStaleResponse` 在请求尚未完成时修改输入，然后确认旧响应不显示。`retainsInputOnFailureAndRetries` 在首次返回 `unavailable` 后确认提示重试，原文不变，第二次成功显示译文。
- [ ] 运行 `npm test -- tests/panel.test.ts`，确认缺少面板实现时测试失败。
- [ ] 建立 Vite 和 Vitest（jsdom）脚手架，实现 `mountPanel`。依次显示语言方向、输入框、翻译按钮、译文区。以纯文本渲染结果，异步请求用递增编号识别过期响应，提交期间避免重复请求。在桌面命令接入前，用注入的假翻译函数运行测试。
- [ ] 运行 `npm test -- tests/panel.test.ts` 和 `npm run build`，确认面板测试通过并生成静态资源。

## 2. 桌面窗口与请求

**文件** `src/desktop.ts`、`src/main.ts`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/default.json`、`src-tauri/src/lib.rs`、`src-tauri/src/placement.rs`、`src-tauri/src/translate.rs`、`src-tauri/tests/translate.rs`

**接口** Tauri 命令 `set_window_mode(mode: WindowMode) -> Result<(), CommandError>` 和 `translate(request: TranslateRequest) -> Result<Translation, CommandError>`，请求、响应和错误码采用任务 1 的 JSON 结构。`edge_rect(area: WorkArea, scale: f64, mode: WindowMode) -> Rect` 使用物理像素坐标。

- [ ] 写 Rust 测试。`positions_on_scaled_left_monitor` 使用工作区 `(-1920, 0, 1920, 1040)` 与比例 `1.5`，收起后断言矩形 `(-90, 484, 72, 72)`；展开后断言 `(-588, 18, 570, 1004)`。`maps_timeout_to_unavailable` 让本地测试 HTTP 端点延迟响应并断言 `unavailable`。`accepts_translation_json` 断言本地端点收到原请求并返回可反序列化的译文。
- [ ] 运行 `cargo test --manifest-path src-tauri/Cargo.toml`，确认缺少实现时对应测试失败。
- [ ] 实现贴边窗口。按钮 48 × 48 逻辑像素，距右侧 12 逻辑像素并竖直居中。面板宽 380 逻辑像素，上下各留 12 逻辑像素。按工作区限制尺寸。收起与固定展开置顶，普通展开可收起或切换固定。通过 Tauri 读取窗口所在显示器工作区，失败时用主屏。Wayland 直接显示普通独立窗口，该模式下保留窗口装饰和正常关闭行为。
- [ ] 在 Rust 实现 `translate`，使用 `reqwest` POST JSON，15 秒请求超时。正式构建要求 `TRANSLATION_ENDPOINT` 为 HTTPS 并在构建时内置，开发和测试可接本地端点。用 `src/desktop.ts` 连接界面、Tauri 命令和 Tauri 剪贴板插件，仅开放写入文本权限。
- [ ] 运行 `cargo test --manifest-path src-tauri/Cargo.toml` 和 `npm test`，确认测试全通过。在本机运行 `npm run tauri dev` 检查启动窗口、展开、固定与收起。

## 3. 在线翻译入口

**文件** `service/package.json`、`service/src/server.ts`、`service/src/translate.ts`、`service/src/quota.ts`、`service/src/baidu.ts`、`service/test/translate.test.ts`、`service/test/quota.test.ts`

**接口** `POST /v1/translate` 接收任务 1 的请求。成功返回 `200` 和 `Translation`。错误返回 `{ code: ErrorCode }`，对应 `400`、`422`、`429` 或 `503`。`Provider` 提供 `detect(text: string): Promise<string | null>` 和 `translate(text: string, from: 'zh' | 'en', to: 'zh' | 'en'): Promise<string>`。`reserveQuota(ipKey: string, now: Date): Promise<boolean>` 一次原子预留每分钟来源额度和每日总额度。

- [ ] 写服务测试。`autoRoutesBothDirections` 用检测桩分别返回 `zh` 和 `en`，确认反向翻译。`manualDirectionSkipsDetection` 确认 `zh-en` 直接调用翻译。`rejectsUnsupportedOrUncertainLanguage` 用 `jp` 和 `null` 分别断言 `422`。`rejectsOversizedText` 分别传入 1001 个 ASCII 字符和 667 个汉字，断言 `400` 且供应商未调用。`lastSlotCanOnlyBeReservedOnce` 对最后一个名额并发预留两次，断言恰好一次成功。`returnsRateLimitWithoutCallingProvider` 断言额度不足时返回 `429`。
- [ ] 运行 `npm --prefix service test`，确认缺少路由、翻译和额度逻辑时测试失败。额度测试使用临时 SQLite 文件。
- [ ] 实现路由。请求体限制 16 KiB，文本去除首尾空白后要求 1–1000 个 Unicode 字符且 UTF-8 编码不超过 2000 字节。自动模式调用百度语种识别接口 `/api/trans/vip/language`，接受 `data.src` 中的 `zh` 和 `en`，其他语种和无法判断的结果提示手动选择。手动模式跳过语种识别。
- [ ] 实现百度适配器。两种接口都向 `https://fanyi-api.baidu.com` 发送表单 POST。服务端通过 `BAIDU_APP_ID` 和 `BAIDU_APP_SECRET` 按百度文档生成签名。翻译调用 `/api/trans/vip/translate`，传明确的 `from` 和 `to`，按顺序用换行合并 `trans_result[].dst`。禁用正文日志和上游错误详情回传。开发和测试使用 HTTP 桩。[通用文本翻译文档](https://fanyi-api.baidu.com/product/113) · [语种识别产品文档](https://fanyi-api.baidu.com/product/14)
- [ ] 用 SQLite 写入事务实现限流，默认每来源每分钟 10 次，每 UTC 日总计 200 次。用可信的部署入口确定客户端地址，以服务端密钥计算其摘要，用到期时间清理限流记录。部署时按百度账号的频率及用量额度设置上限，额度用尽时返回 `429`。
- [ ] 运行 `npm --prefix service test`，确认包括额度竞争测试在内的全部用例通过。用本地 HTTP 服务连通桌面应用，验证成功、超时与限流时的提示。

## 4. 打包、部署与验收

**文件** `.github/workflows/desktop.yml`、`service/Dockerfile`、`docs/release.md`、`docs/acceptance.md`

- [ ] 配置原生构建矩阵。Windows x64 产出 NSIS 安装包，macOS ARM64 产出 DMG，Ubuntu 24.04 x64 产出 DEB。分别运行 `npm run tauri build -- --bundles nsis`、`npm run tauri build -- --bundles dmg` 和 `npm run tauri build -- --bundles deb`。保留实际产物位置与构建日志。
- [ ] 发布方开通百度翻译开放平台的通用文本翻译和语种识别后，在可访问百度接口的 Linux 主机部署单实例服务。挂载 SQLite 持久卷，把百度凭据注入服务端环境，配置限流和 HTTPS 入口。核对两个接口的数据使用及留存条款，在界面说明留存期限。测试包使用本地端点，正式包在构建时注入实际 HTTPS 地址。
- [ ] 在三端新安装验收。自动翻译 `apple` 和「我今天有空。」；再手动验证中英两个方向。检查复制译文、离线时保留输入和恢复网络后的重试。测试电脑不配置供应商密钥。
- [ ] 在 Windows 和 macOS 记录贴边、置顶、展开、固定和收起结果。Ubuntu 分别在 X11 验证侧栏操作、在 Wayland 验证普通窗口入口。将操作系统、安装包、每项结果和任何未验证项记录到 `docs/acceptance.md`。
