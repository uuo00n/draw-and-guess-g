# 随包素材许可

本文件只记录实际打进安装包的素材。没有逐条许可的第三方素材没有加入。

| 文件                                                                   | 作者                       | 来源                                                                           | 日期       | 许可                                                                                 |
| ---------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------ |
| `src/renderer/src/assets/sounds/*.wav`                                 | 本项目                     | 用 `scripts/generate-tones.mjs` 合成的正弦波，未下载 Kenney、Pixabay 或 Mixkit | 2026-11-05 | 项目原创，可随程序分发                                                               |
| `src/renderer/src/assets/champion-mark.json`                           | 本项目                     | 手写的最小 Lottie JSON，不是 LottieFiles 下载文件                              | 2026-11-05 | 项目原创，可随程序分发                                                               |
| `src/renderer/src/assets/fonts/FunnelSans-latin.woff2`                 | The Funnel Project Authors | Google Fonts Funnel Sans，拉丁字符子集                                         | 2026-11-05 | SIL Open Font License 1.1，全文见 `src/renderer/src/assets/fonts/OFL-FunnelSans.txt` |
| `src/renderer/src/assets/fonts/FunnelSans-latin-ext.woff2`             | The Funnel Project Authors | Google Fonts Funnel Sans，拉丁扩展子集                                         | 2026-11-05 | SIL Open Font License 1.1，全文见同目录许可                                          |
| `src/renderer/src/assets/branding/genpact-wordmark-white.png`          | Genpact                    | 项目所有者提供的白色标识，未改色、未重绘                                       | 2026-11-05 | 内部团建使用的品牌素材                                                               |
| `src/renderer/src/assets/branding/genpact-lockup-horizontal-white.png` | Genpact                    | 项目所有者提供的白色横版组合标识                                               | 2026-11-05 | 内部团建使用的品牌素材                                                               |
| `src/renderer/src/assets/branding/genpact-lockup-stacked-white.png`    | Genpact                    | 项目所有者提供的白色竖版组合标识                                               | 2026-11-05 | 内部团建使用的品牌素材                                                               |
| `src/renderer/src/assets/branding/genpact-icon-white.png`              | Genpact                    | 项目所有者提供的白色几何图标                                                   | 2026-11-05 | 内部团建使用的品牌素材                                                               |

中文界面回退到本机已安装的 Noto Sans SC、苹方或微软雅黑，不额外打包中文字体文件。Logo 组件在文件缺失时改为文字 GENPACT，不绘制替代图形。
