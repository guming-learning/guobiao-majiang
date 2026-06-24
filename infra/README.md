# 部署到 Azure（App Service · Linux · Node 20 · WebSocket）

本目录提供国标麻将的基础设施即代码（Bicep）与部署脚本。

## 架构

- **Azure App Service (Linux)**，运行 Node 20，启用 **WebSocket**（Socket.IO 实时通信）。
- 开启 **clientAffinity（粘性会话）**：房间状态保存在单实例内存中，粘性会话保证同一玩家始终连到同一实例。
- 默认 **B1** 计划（支持 WebSocket 与 Always On）；可用 **F1** 免费层（Socket.IO 自动回退长轮询）。
- `SCM_DO_BUILD_DURING_DEPLOYMENT=true`：平台 Oryx 在部署时执行 `npm install`，仅安装生产依赖（express、socket.io）。

## 文件

- `main.bicep` —— App Service 计划 + Web App（资源组作用域）。
- `deploy.ps1` —— 选订阅、建资源组、部署 Bicep、打包并 zip 部署。
- `../.github/workflows/azure-deploy.yml` —— 推送到 main 自动部署（需配置发布配置文件）。

## 一、登录目标租户/订阅

目标订阅位于租户 `mingguthueeoutlook.onmicrosoft.com`。在无浏览器的环境用设备码登录：

```pwsh
az login --tenant mingguthueeoutlook.onmicrosoft.com --use-device-code
az account set --subscription 174fdafa-d969-48fc-a15d-5abc25bda633
```

## 二、一键部署

```pwsh
pwsh infra/deploy.ps1                   # 默认 centralus + F1(免费)
pwsh infra/deploy.ps1 -Sku B1           # 付费层(需 App Service 配额>0)
pwsh infra/deploy.ps1 -Location eastus  # 指定区域
```

> 注意：本订阅(VS Enterprise)对 App Service 计算配额按区域限制——`eastus`/`westus2` 的「Total VMs」配额为 0，**`centralus` 可用**，故默认用 `centralus`。若某区域报「additional quota / Total VMs: 0」，换区域或提配额工单即可。

脚本完成后输出形如 `https://guobiao-majiang-xxxx.azurewebsites.net` 的访问地址，手机横屏即可玩。

## 已部署实例

- 订阅：`174fdafa-d969-48fc-a15d-5abc25bda633`（Visual Studio Enterprise）
- 资源组：`rg-guobiao-majiang` · 区域：`centralus` · 计划：`F1`
- **线上地址：https://guobiao-majiang-qndfyvrqqz5c6.azurewebsites.net**

## 三、（可选）GitHub Actions 持续部署

1. 在 App Service «概述 → 获取发布配置文件» 下载 XML。
2. 仓库 Settings → Secrets 添加 `AZURE_WEBAPP_PUBLISH_PROFILE`（粘贴 XML），Variables 添加 `AZURE_WEBAPP_NAME`（站点名）。
3. 之后推送到 `main` 即自动部署。

## 费用与清理

- **B1** 约 ¥90+/月（约 $13/月）；**F1** 免费（每天 60 CPU 分钟、无常驻、会休眠）。
- 停止计费：`az group delete -n rg-guobiao-majiang --yes`（删除整个资源组）。
- 仅停应用：在门户停止 App Service，或将计划缩到 F1。
