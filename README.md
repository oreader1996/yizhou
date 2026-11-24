# 译舟

译舟是 Windows、macOS 和 Linux 上的中英翻译侧栏。打开右侧的「译」按钮，输入或粘贴单词、句子，停顿片刻后会自动发送给百度翻译。面板支持自动识别、切换翻译方向和复制译文，也可以点击「翻译」立即提交或重试。Wayland 使用普通窗口。

点击原文或译文旁的扬声器即可使用本机语音朗读。英文优先使用美式发音，中文使用普通话。单个英文单词若能在随应用打包的 [CMU 发音词典](https://github.com/words/cmu-pronouncing-dictionary)中查到，会显示美式国际音标。查音标和朗读均无需联网。

Windows 和 macOS 使用已安装的系统语音。Linux 桌面端在 WebView 没有对应本地语音时会调用 `espeak-ng`，请通过系统包管理器安装，例如 Ubuntu 的 `sudo apt install espeak-ng` 或 Arch Linux 的 `sudo pacman -S espeak-ng`。

## 本地开发

准备 Node.js 24、Rust stable 和 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```sh
npm ci
npm test
npm run tauri dev
```

通过 `npm run dev` 可以在浏览器预览布局。桌面窗口和翻译请求通过 Tauri 运行。

本地翻译服务默认监听 `127.0.0.1:8787`。在另一个终端进入项目目录，复制配置模板。

```sh
cp -n service/config.example.json service/config.json
```

打开 `service/config.json`，把百度翻译开放平台的 **APP ID** 和**密钥**分别填入 `BAIDU_APP_ID` 和 `BAIDU_APP_SECRET`。用 `openssl rand -hex 32` 生成随机值填入 `QUOTA_SECRET`，保存后运行 `npm run service`。百度账号需开通文本语种识别和通用文本翻译。真实配置文件已加入 `.gitignore`。

正式发布时将翻译服务的 HTTPS 地址嵌入客户端，用户安装后可直接翻译。参见[部署和打包](docs/release.md)。
