# 部署和打包

在百度翻译开放平台开通语种识别和通用文本翻译。将 `service/config.example.json` 复制为 `service/config.json`，填入 `BAIDU_APP_ID`、`BAIDU_APP_SECRET` 和随机生成的 `QUOTA_SECRET`。`QUOTA_PER_MINUTE` 限制每个来源每分钟提交的请求数，`QUOTA_PER_DAY` 限制每天预留的百度调用数。自动模式最多预留两次，手动模式预留一次。`BAIDU_CALLS_PER_SECOND` 限制发往百度的请求频率，默认为每秒一次。按百度账号的额度配置这些参数。

服务默认监听本机 `127.0.0.1:8787`。用系统服务运行时，将工作目录设为项目根目录。用 `docker build -f service/Dockerfile -t yizhou-service .` 构建镜像时，在 Linux 主机采用 host 网络和 `/data` 持久卷。运行容器时把配置文件只读挂载到 `/app/service/config.json`，确保容器的 `node` 用户可读，并在配置文件中将 `QUOTA_DB` 设为 `/data/quota.sqlite`。服务和反向代理放在同一主机，由反向代理提供 HTTPS。只有当代理覆盖 `X-Real-IP` 并使用可信的客户端地址时才将 `TRUST_LOOPBACK_PROXY` 设为 `true`。代理转发 `/v1/translate`，限制请求体大小，避免记录请求或响应正文。

发布包用 `TRANSLATION_ENDPOINT` 注入完整 HTTPS 地址，包括 `/v1/translate`。分别在目标系统构建 `nsis`、`dmg` 和 `deb`。GitHub Actions 的手动构建读取仓库变量 `TRANSLATION_ENDPOINT`。公开分发前确认百度两个接口的留存和训练条款，在面板明确标注留存期限，并按分发方式配置签名。
