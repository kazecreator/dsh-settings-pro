# 宠物素材包规范（Pets Material Package Spec）

> 这是「桌面宠物」用户自建宠物的**标准素材包格式**。Web「设置 Pro → 宠物」里的 zip 导入，
> 以及将来独立的「素材仓库」，都遵循本规范。一个素材包 = 一个 zip 文件，内含一个
> `manifest.json` 和若干状态图片。

## 1. 目录结构（zip 内）

```
pkg.zip
├── manifest.json      # 必填：宠物描述
├── idle.gif           # 必填：空闲状态
├── working.gif        # 可选：任务中
├── goal.png           # 可选：有目标
└── paused.webp        # 可选：暂停
```

- 文件名可任意，只要在 `manifest.json` 里正确引用即可。
- 建议文件名与状态名一致（`idle.gif` / `working.gif` / `goal.gif` / `paused.gif`），便于阅读。

## 2. manifest.json 字段

```json
{
  "id": "my-cat",          // 可选：唯一 id（小写字母/数字/._-），缺省用 name 生成
  "name": "我的猫",          // 必填：显示名
  "states": {
    "idle": "idle.gif",     // 必填
    "working": "working.gif",
    "goal": "goal.png",
    "paused": "paused.webp"
  }
}
```

- `states.<key>` 的值可以是**字符串（文件名）**，也可以是对象 `{ "file": "文件名" }`。
- 状态 key 固定四个：`idle` / `working` / `goal` / `paused`，其余 key 会被忽略。
- **只有 `idle` 是必填**；其余缺省时，该状态会回退到 `idle`（降低投稿门槛）。

## 3. 状态语义（素材作者按此设计表情）

| 状态 | 含义 | 建议表情 |
|---|---|---|
| `idle` | 空闲，监控中 | 睁眼、平静、眨眼 |
| `working` | 有任务在跑 | 专注、眯眼、动起来 |
| `goal` | 有活动目标 | 兴奋、发光、星星眼 |
| `paused` | 已暂停 | 闭眼、睡觉、静止 |

## 4. 图片约束

- 格式：`GIF` / `PNG` / `WebP` / `JPEG`（推荐 **GIF/WebP 可动图**，更生动）。
- 尺寸：建议**正方形**，≥ 84×84（桌面宠物按 84px 显示，等比缩放居中；非正方形会被 `object-fit: contain` 留白）。
- 大小：单张 ≤ **4 MB**。
- 背景：建议透明背景（PNG/WebP/GIF 透明），浮在桌面上更自然。

## 5. 校验规则（导入时）

1. zip 内必须有 `manifest.json`，且为合法 JSON。
2. `states.idle` 必须存在，且引用的文件在 zip 内能找到。
3. 每张图 ≤ 4MB；超限或缺失会报错并中止导入。
4. 导入成功后会：写入 `~/.dsh/storages/dsh-settings-pro/pets/user/<id>/`，并自动**设为当前宠物**。

## 6. 示例：最小可用包

`manifest.json`：
```json
{
  "name": "像素猫",
  "states": {
    "idle": "idle.gif"
  }
}
```
zip 内容：`manifest.json` + `idle.gif` —— 仅此两个文件即可导入成功。

## 7. 与「素材仓库」的关系（后续）

- 素材仓库 = 一个独立 git 仓库，里面就是一个一个符合本规范的 zip。
- 用户下载 zip → Web「宠物」tab 里拖入/选择 → 一键安装。
- 后续可在 Web 里加「粘贴 zip URL 安装」，直接读远程 zip 导入，无需手动下载。
