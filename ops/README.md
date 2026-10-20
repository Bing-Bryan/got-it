# 私人运营看板

这是本地运营查看页面，不属于公开托管前端，也不会被打包进 `dist-hosted`。它只读取 `/api/hosted/ops` 的版本化汇总，不提供告警重试或任何写操作。

## 构建与运行

```sh
npm run build:ops
HOSTED_OPS_TOKEN=<secure local environment> \
HOSTED_OPS_API_ORIGIN=http://127.0.0.1:8788 \
HOSTED_OPS_VIEWER_PORT=8790 \
HOSTED_OPS_STATIC_DIR=dist-ops \
npm run ops:viewer
```

先建立 SSH 本地转发（把服务器回环 ops 映射到本机回环），再打开 `http://127.0.0.1:8790/`。查看器只监听回环地址，不接受任意代理目标或写操作。

## 安全边界

- token 只在查看器服务端环境读取，不写页面、URL、命令行参数、localStorage、sessionStorage 或日志。
- 固定 Host/Origin；拒绝跨站、代理头、非 GET 和上游重定向；无 CORS；严格 CSP 与 `no-store`。
- 不把 ops/查看器发布到公网；公网 nginx 对 `/api/hosted/ops` 返回 404。
- 打开、刷新、筛选只读取汇总；零模型、零搜索、零抓取、零发信。

## 指标限制

- 资源指标每 60 秒采样、最多 60 个内存样本；重启不保留历史。
- 主机 CPU、`MemAvailable`、数据盘仅在 Linux 读取固定 `/proc` 与数据挂载点；容器明确标注可见范围。
- 不同来源独立显示等待/失败/过期；旧值不会因为接口读取成功而刷新采样时间。
- v2 统计是已送达匿名批次增量，可能漏报、补报或包含机器人；材料筛选不显示转换率。
