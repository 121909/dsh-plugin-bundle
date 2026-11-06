# agy-context-unlock

把本机官方 Antigravity 客户端的上下文窗口从默认 256K 放到约 1M（983,040）。

这个目录不进 DSH 插件安装包。只运行这里的脚本才会改写本机官方 `agy` 二进制。`agy` 或 Antigravity 桌面端升级后，新二进制会回到 256K，要再运行一次。

插件 [`dsh-llm-antigravity-acp`](../dsh-llm-antigravity-acp) 的 `autoPatch` 默认会寻找：

```text
~/.gemini/antigravity/tools/agy-patch.py
```

把本目录的 `agy-patch.py` 放到这个路径后，插件下次启动会做一次检查。找不到脚本时，窗口保持官方的 256K，模型仍可使用。

## 解锁终端里的 agy

```sh
python3 agy-patch.py --binary ~/.local/bin/agy --dry-run
python3 agy-patch.py --binary ~/.local/bin/agy --in-place
```

`--dry-run` 只报告门禁状态，不写文件。`--in-place` 会先备份再改写，并在 macOS 上重新签名。

## 解锁桌面端

退出 Antigravity 后执行：

```sh
python3 agy-patch.py \
  --binary "/Applications/Antigravity.app/Contents/Resources/bin/language_server" \
  --in-place --no-backup
```

改之前自己复制一份 `language_server`。桌面端下次启动后使用新二进制。

## 升级后自动再解锁

`agy-autopatch.py` 会再次调用 `agy-patch.py`。它先做 `--dry-run`，只有二进制仍是官方原版时才写入。对桌面端，写入后会给当前的 `language_server` 发一次 `SIGTERM`，让它从磁盘上的新二进制重新拉起。

脚本默认寻找这两个路径：

```text
~/.local/bin/agy
/Applications/Antigravity.app/Contents/Resources/bin/language_server
~/.gemini/antigravity/tools/agy-patch.py
```

手动跑一次：

```sh
python3 agy-autopatch.py
```

要在升级后自动跑，用 launchd 监听 `~/.local/bin` 和 `/Applications/Antigravity.app`，程序指向本机的 `agy-autopatch.py`。不要直接使用别人机器上的 plist：里面的家目录路径是各自的。
