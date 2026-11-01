# 发布到 GitHub Pages

项目已经准备好 GitHub Actions workflow。当前目录尚未初始化 Git，也没有创建远程仓库或执行上传。

## 需要你填写的地方

| 项目 | 填写位置 | 是否必需 |
| --- | --- | --- |
| 你的 GitHub 仓库地址 | 下方 `git remote add origin` 命令，替换 `YOUR_NAME` 和 `YOUR_REPOSITORY` | 必需 |
| Git 提交姓名与邮箱 | 仅当 `git commit` 提示未配置身份时，使用下方 `git config` 命令 | 按需 |
| 发布分支 | 默认 `main`；如改用其他分支，修改 `.github/workflows/pages.yml` 的 `branches` | 默认无需修改 |

**源码和 workflow 中不需要填写用户名、仓库名、域名、API Key 或发布 Token。** 图片、脚本、样式和音乐使用相对地址，适用于 `https://用户名.github.io/仓库名/` 项目站点。workflow 使用 GitHub 自动提供的 `GITHUB_TOKEN` 与 Pages 所需权限。[GitHub 官方发布说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 首次发布

1. 在 GitHub 新建一个**空仓库**，例如 `chongzhen-industry`。使用免费方案时选择公开仓库；创建时不勾选 README、`.gitignore` 或 License，避免和本地内容产生初始提交冲突。[GitHub Pages 方案范围](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
2. 在本项目目录打开终端，检查并提交：

```sh
npm test
npm run build
git init -b main
git add .
git status --short
git commit -m "Initial game release"
```

如果提交提示缺少身份，只需为此仓库配置一次，再执行 `git commit`：

```sh
git config user.name "你的提交署名"
git config user.email "你的GitHub提交邮箱"
```

3. 填入新仓库的真实地址并推送：

```sh
git remote add origin https://github.com/YOUR_NAME/YOUR_REPOSITORY.git
git push -u origin main
```

4. 在 GitHub 仓库打开 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。无需选择 `docs` 目录或 `gh-pages` 分支。[GitHub 官方设置说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
5. 打开 **Actions → Deploy GitHub Pages → Run workflow**，选择 `main` 并运行。首次推送时若 Pages 尚未启用，自动运行可能暂时失败；完成第 4 步后重新运行即可。
6. 等待 `build` 和 `deploy` 都成功。网站地址显示在 **Settings → Pages** 和该次运行的 `github-pages` deployment 中。首次部署未成功前，不应把尚未打开的站点视为已发布。

日后更新只需提交并推送 `main`，workflow 会自动测试、构建和发布。

```sh
git add .
git commit -m "Update game"
git push
```

## 已准备的发布文件

- `.github/workflows/pages.yml`：Node.js 24，先测试、后构建，上传 `dist/` 并发布 Pages；也支持手动运行。
- `.gitignore`：忽略构建目录、依赖、临时截图、本机进度记录和含本机路径的素材生成清单。图片、头像、配乐及源码正常入库。
- `scripts/build.mjs`：仅输出页面、JS/CSS、图片、音频、字体及 `.nojekyll`；生成提示词、开发笔记、测试和脚本不会进入网站。
- `tests/deploy.test.js`：检查构建内容边界及项目子路径中的本地资源地址。

`dist/` 由 Actions 自动生成，不用提交，也不用手工上传。音乐已作为静态资源包含在项目中，发布时不需要额外音频服务。

## 本地进度转移到线上

浏览器存档按网址独立保存。发布后若要接着本地进度玩，请先在本地游戏导出 JSON 存档，再在网站标题界面选择“读取存档”导入；不会自动跨网址迁移。

## 常见情况

- **Pages 配置报错**：先确认仓库 Settings → Pages 的 Source 已设为 GitHub Actions，再手动运行一次 workflow。
- **测试失败**：在 Actions 的 `build` 日志中查看失败项；测试未通过时不会部署。
- **推送权限错误**：通过 GitHub 的标准登录或本机 Git 凭据完成身份验证；不要把登录凭据写入仓库文件。
- **使用自定义域名**：后续在仓库 Settings → Pages 配置域名和 DNS；本次无需填写，也没有生成 `CNAME`。

Actions 版本核对记录（2026-11-01）：[checkout v7](https://github.com/actions/checkout/releases/tag/v7.0.1)、[setup-node v7](https://github.com/actions/setup-node/releases/tag/v7.1.0)、[configure-pages v6](https://github.com/actions/configure-pages/releases/tag/v6.0.0)、[upload-pages-artifact v5](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0)、[deploy-pages v5](https://github.com/actions/deploy-pages/releases/tag/v5.0.1)。
