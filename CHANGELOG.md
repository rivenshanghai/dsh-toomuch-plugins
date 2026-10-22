# Changelog / 变更日志

All notable changes to this project are documented here. / 本项目的所有重要变更都记录在此。

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## Unreleased / 未发布

## 0.1.1 (2026-10-22)

### Changed / 变更

- Published to npm as **`dsh-toomuch-plugins`** — the package name now matches the repository name, and the bundle id in `cordis.patch.yml` plus the client module id follow it. / 包名改为 **`dsh-toomuch-plugins`**（与仓库同名），`cordis.patch.yml` 的 bundle id 与 client 模块 id 同步改名。
- `package.json` is no longer `private`, so the package can be published. / 去掉 `package.json` 里的 `private`，可以正式发布到 npm。

## 0.1.0 (2026-10-19)

### Added / 新增

- First public release. / 首个公开版本。
- Still on `0.x`: plugin behaviour and the install path may still change; `1.0` comes after the interface settles. / 当前为 `0.x` 版本：插件行为与安装方式仍可能调整，接口稳定后再进 `1.0`。
- **Sidebar panel collapse** — collapses the global-panel entry list above the workspace in the DSH Web left sidebar into a single toggle in the sidebar footer. The choice is remembered in `localStorage` and survives reloads. / **侧栏面板收起** —— 把 DSH Web 左栏工作区上方的全局面板入口收起成侧栏底部的一个开关，选择记在 `localStorage` 里，刷新后保持。
- Works in the narrow 56px rail, where the toggle collapses into a round icon button. / 窄栏（56px rail）下自动变成圆钮。

[Unreleased]: https://github.com/rivenshanghai/dsh-toomuch-plugins/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.1.1
[0.1.0]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.1.0
