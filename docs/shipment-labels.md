# 本地外箱标签生成

货件新增、单票箱标和批量箱标现在使用本地 PDF 生成器，无需访问 melinet.cn。
每箱一页，箱序号从 1 开始；跨境版为 283.5 × 283.5 pt（约 100 × 100 mm），
本土版为 283.5 × 425.25 pt（约 100 × 150 mm），与历史 PDF 尺寸相同。
打印时使用实际尺寸，不要缩放到 A4。

## 兼容接口

`POST /api/download-shipment-label`，`Content-Type: application/json`。
使用 ERP 已登录的会话 Cookie，且账号须有货件管理权限；成功返回 `application/pdf`。
未登录返回 401，无权限返回 403，参数错误返回 400，生成失败返回 500。

跨境店铺示例：

```json
{
  "status": { "isId": true, "isNew": false },
  "data": {
    "id": "82370401",
    "warehouseNumber": "",
    "warehouseName": "",
    "nb": "5",
    "shopId": "3389953312",
    "shopName": "MSXLSHOPMXF"
  }
}
```

本土店铺示例：

```json
{
  "status": { "isId": true, "isNew": true },
  "data": {
    "id": "82370464",
    "warehouseNumber": "MXRC03",
    "warehouseName": "Centro logístico Danhos Cuautitlán - MXRC03",
    "nb": "5",
    "shopId": "1631227415",
    "shopName": ""
  }
}
```

保持现有 `status/data` 入参结构。支持当前 ERP 使用的 `isId: true` 模式；
`isNew` 必须为布尔值。`nb` 接受整数或整数字符串，范围 1–500。
货件号和店铺 ID 接受 1–32 位数字字符串（保留前导零），也接受安全整数；
店铺 ID 可带一个前导 `#`。本土版要求仓库编号及名称，跨境版要求店铺别名。
可打印文字使用拉丁字符及西班牙语重音字符；无法打印的字符或过长文字会明确报错。
不支持的 `isId: false` 模式不会被静默当作货件号模式处理。

## 独立命令行

使用项目要求的 Node.js 24 安装依赖后运行，无需数据库账号或登录：

```sh
npm run generate:shipment-label -- input.json output.pdf
```

`input.json` 与上述 HTTP 请求体完全相同。目标 PDF 已存在时命令报错，避免覆盖。
业务代码也可以直接调用 `src/lib/shipment-label.ts` 中的 `generateShipmentLabels(body)`。

## 二维码与验证

编码格式来自已保存的历史跨境、本土标签，经独立二维码解码核对。
跨境版使用 `id/operation/type/source`；本土版使用
`id/reference_id/t/ops_data`。二维码中的箱序号和可见文字使用相同的 `货件号/箱序号`。
二维码纠错等级为 L，与历史样本一致；高分辨率 PNG 保留二维码四周的页面留白。

```sh
npm run test:shipment-labels
```

测试覆盖入参校验、历史编码格式、页数、纸张尺寸及离线生成。
视觉和扫码验证还应将两种 PDF 渲染为图片，并用独立解码器核对每页二维码内容，
特别是第 1 箱、第 10 箱及最后一箱。软件验证不等同于仓库实收验证。

本土版的两个标识图像来自现有历史箱标，仅包含标识，不包含货件、店铺或二维码数据。
