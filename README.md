# @kazecreator/dsh-settings-pro

DeepSeek Harness settings-pro plugin. A single package bundling four features into a "设置 Pro" settings section:

- **IM Bridge** — Telegram & WeChat bridge (merged from `@kazecreator/dsh-im`), with a built-in `IM Bridge` tab.
- **用量 (Usage)** — DeepSeek balance via `/user/balance` + locally aggregated daily usage with peak/off-peak pricing.
- **记忆 (Memory)** — cross-restart conversation memory: summary auto-injected into new sessions + `read_memory`/`write_memory` tools.
- **宠物 (Pets)** — desktop pet overlay + a guardian loop that auto-follows every conversation when enabled.

## Install

Add to the profile's `package.json` dependencies and insert into `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-settings-pro
      name: '@kazecreator/dsh-settings-pro'
      config:
        usageEnabled: true
        memoryEnabled: true
        petsEnabled: false
        telegramEnabled: true
        telegramBotToken: '<token>'
        telegramAllowedUserIds:
          - '<telegram-user-id>'
        wechatEnabled: true
```
