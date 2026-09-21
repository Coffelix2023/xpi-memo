# THEMES.md

## 主题原则与作用域

窗口有两套**主题原则 (theme principle)**，每套各带明/暗两个变体，共四个令牌块：

| 原则 | 明 | 暗 | 说明 |
| --- | --- | --- | --- |
| `default` | `:root` | `.dark` | 默认主题 (`TUI-DESIGN.md` §2.A) |
| `atlas` | `.atlas` | `.atlas.dark` | 图鉴风格（复古印刷） |

- 两个类都挂在 `<html>` 上：`class="dark"` 管明暗，`class="atlas"` 管原则；标题栏的两个控件各切一个。
- `src/glimpse/tokens.ts` 是本文件的**运行时镜像**，不是第二份事实来源：`tokens.test.ts` 逐块解析这里的 fenced css 块，与 `LIGHT_TOKENS` / `DARK_TOKENS` / `ATLAS_LIGHT_TOKENS` / `ATLAS_DARK_TOKENS` 一一比对，任何一侧单独改动都会让测试失败。
- 令牌范围是**机械规则**：取该原则 `:root` 与 `.dark` 的**交集**。只在单块出现的变量（`--spacing`、`--tracking-normal`、Atlas 的 `--font-display`）不属于双主题契约，因此不进 `tokens.ts`。
- 颜色一律 oklch：渲染出的整个文档禁止字面色值（`document.test.ts` 断言），所以 Atlas 的原始 hex 写作等值 oklch。

## Default-Themes

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(0.9818 0.0054 95.0986);
  --foreground: oklch(0.3438 0.0269 95.7226);
  --card: oklch(0.9818 0.0054 95.0986);
  --card-foreground: oklch(0.1908 0.0020 106.5859);
  --popover: oklch(1.0000 0 0);
  --popover-foreground: oklch(0.2671 0.0196 98.9390);
  --primary: oklch(0.6171 0.1375 39.0427);
  --primary-foreground: oklch(1.0000 0 0);
  --secondary: oklch(0.9245 0.0138 92.9892);
  --secondary-foreground: oklch(0.4334 0.0177 98.6048);
  --muted: oklch(0.9341 0.0153 90.2390);
  --muted-foreground: oklch(0.6059 0.0075 97.4233);
  --accent: oklch(0.9245 0.0138 92.9892);
  --accent-foreground: oklch(0.2671 0.0196 98.9390);
  --destructive: oklch(0.1908 0.0020 106.5859);
  --destructive-foreground: oklch(1.0000 0 0);
  --border: oklch(0.8847 0.0069 97.3627);
  --input: oklch(0.7621 0.0156 98.3528);
  --ring: oklch(0.6171 0.1375 39.0427);
  --chart-1: oklch(0.5583 0.1276 42.9956);
  --chart-2: oklch(0.6898 0.1581 290.4107);
  --chart-3: oklch(0.8816 0.0276 93.1280);
  --chart-4: oklch(0.8822 0.0403 298.1792);
  --chart-5: oklch(0.5608 0.1348 42.0584);
  --sidebar: oklch(0.9663 0.0080 98.8792);
  --sidebar-foreground: oklch(0.3590 0.0051 106.6524);
  --sidebar-primary: oklch(0.6171 0.1375 39.0427);
  --sidebar-primary-foreground: oklch(0.9881 0 0);
  --sidebar-accent: oklch(0.9245 0.0138 92.9892);
  --sidebar-accent-foreground: oklch(0.3250 0 0);
  --sidebar-border: oklch(0.9401 0 0);
  --sidebar-ring: oklch(0.7731 0 0);
  --font-sans: Inter, ui-sans-serif, sans-serif, system-ui;
  --font-serif: Noto Serif, ui-serif, serif;
  --font-mono: JetBrains Mono, ui-monospace, monospace;
  --radius: 0.5rem;
  --shadow-x: 0;
  --shadow-y: 1px;
  --shadow-blur: 3px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.1;
  --shadow-color: oklch(0 0 0);
  --shadow-2xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-sm: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow-md: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10);
  --shadow-lg: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10);
  --shadow-xl: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10);
  --shadow-2xl: 0 1px 3px 0px hsl(0 0% 0% / 0.25);
  --tracking-normal: 0em;
  --spacing: 0.25rem;
}

.dark {
  --background: oklch(0.2679 0.0036 106.6427);
  --foreground: oklch(0.8074 0.0142 93.0137);
  --card: oklch(0.2679 0.0036 106.6427);
  --card-foreground: oklch(0.9818 0.0054 95.0986);
  --popover: oklch(0.3085 0.0035 106.6039);
  --popover-foreground: oklch(0.9211 0.0040 106.4781);
  --primary: oklch(0.6724 0.1308 38.7559);
  --primary-foreground: oklch(1.0000 0 0);
  --secondary: oklch(0.9818 0.0054 95.0986);
  --secondary-foreground: oklch(0.3085 0.0035 106.6039);
  --muted: oklch(0.2213 0.0038 106.7070);
  --muted-foreground: oklch(0.7713 0.0169 99.0657);
  --accent: oklch(0.2130 0.0078 95.4245);
  --accent-foreground: oklch(0.9663 0.0080 98.8792);
  --destructive: oklch(0.6368 0.2078 25.3313);
  --destructive-foreground: oklch(1.0000 0 0);
  --border: oklch(0.3618 0.0101 106.8928);
  --input: oklch(0.4336 0.0113 100.2195);
  --ring: oklch(0.6724 0.1308 38.7559);
  --chart-1: oklch(0.5583 0.1276 42.9956);
  --chart-2: oklch(0.6898 0.1581 290.4107);
  --chart-3: oklch(0.2130 0.0078 95.4245);
  --chart-4: oklch(0.3074 0.0516 289.3230);
  --chart-5: oklch(0.5608 0.1348 42.0584);
  --sidebar: oklch(0.2357 0.0024 67.7077);
  --sidebar-foreground: oklch(0.8074 0.0142 93.0137);
  --sidebar-primary: oklch(0.3250 0 0);
  --sidebar-primary-foreground: oklch(0.9881 0 0);
  --sidebar-accent: oklch(0.1680 0.0020 106.6177);
  --sidebar-accent-foreground: oklch(0.8074 0.0142 93.0137);
  --sidebar-border: oklch(0.9401 0 0);
  --sidebar-ring: oklch(0.7731 0 0);
  --font-sans: Inter, ui-sans-serif, sans-serif, system-ui;
  --font-serif: Noto Serif, ui-serif, serif;
  --font-mono: JetBrains Mono, ui-monospace, monospace;
  --radius: 0.5rem;
  --shadow-x: 0;
  --shadow-y: 1px;
  --shadow-blur: 3px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.1;
  --shadow-color: oklch(0 0 0);
  --shadow-2xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-sm: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow-md: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10);
  --shadow-lg: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10);
  --shadow-xl: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10);
  --shadow-2xl: 0 1px 3px 0px hsl(0 0% 0% / 0.25);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-serif: var(--font-serif);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow: var(--shadow);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

## Atlas-Themes (图鉴风格)

```css
/* themes.md —— 复古印刷风（Vintage Editorial / Retro Print）主题
   适用：Tailwind CSS v4.3+ / shadcn-ui v4 / Next.js 16+
   用法：替换 app/globals.css 中同名变量块；暗色模式由 <html class="dark"> 触发 */
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  /* 纸面：奶油纸 */
  --background: oklch(0.9442 0.0184 86.1479);
  --foreground: oklch(0.3398 0.0652 248.9571);
  --card: oklch(0.9618 0.0168 87.9987);
  --card-foreground: oklch(0.3398 0.0652 248.9571);
  --popover: oklch(0.9732 0.0151 90.2337);
  --popover-foreground: oklch(0.3398 0.0652 248.9571);
  /* 结构色：普鲁士蓝（标题栏、徽章、双线框） */
  --primary: oklch(0.3058 0.0641 249.4045);
  --primary-foreground: oklch(0.9585 0.018 89.3579);
  --secondary: oklch(0.9016 0.0281 88.7586);
  --secondary-foreground: oklch(0.3398 0.0652 248.9571);
  --muted: oklch(0.9195 0.0252 89.2183);
  --muted-foreground: oklch(0.5243 0.019 91.6812);
  /* 高亮色：柿橙（编号、激活态、图表线） */
  --accent: oklch(0.6769 0.1554 56.7868);
  --accent-foreground: oklch(0.9808 0.0199 84.5897);
  --destructive: oklch(0.5156 0.155 30.0196);
  --destructive-foreground: oklch(0.9808 0.0199 84.5897);
  --border: oklch(0.3693 0.0605 248.2026);
  --input: oklch(0.4905 0.0446 241.8758);
  --ring: oklch(0.6769 0.1554 56.7868);
  --chart-1: oklch(0.3058 0.0641 249.4045);
  --chart-2: oklch(0.6769 0.1554 56.7868);
  --chart-3: oklch(0.6528 0.047 248.5505);
  --chart-4: oklch(0.7887 0.0592 89.6434);
  --chart-5: oklch(0.5156 0.155 30.0196);
  /* 索引轨：藏青底（对应 ATLAS INDEX 侧栏） */
  --sidebar: oklch(0.3058 0.0641 249.4045);
  --sidebar-foreground: oklch(0.9442 0.0184 86.1479);
  --sidebar-primary: oklch(0.6769 0.1554 56.7868);
  --sidebar-primary-foreground: oklch(0.9808 0.0199 84.5897);
  --sidebar-accent: oklch(0.3558 0.0676 250.2684);
  --sidebar-accent-foreground: oklch(0.9442 0.0184 86.1479);
  --sidebar-border: oklch(0.3976 0.0609 246.4672);
  --sidebar-ring: oklch(0.6769 0.1554 56.7868);
  /* 扩展令牌：方格纸线 / 进度条轨道 */
  --grid-line: oklch(0.8863 0.0282 88.761);
  --track: oklch(0.8706 0.0172 88.0085);
  /* 字体：宋体衬线标题 + 窄体编号 + 等宽小标签 */
  --font-sans: "Noto Sans SC", "PingFang SC", ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Noto Serif SC", "Songti SC", Georgia, ui-serif, serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  --font-display: "Oswald", "Arial Narrow", "Noto Sans SC", sans-serif;
  /* 印刷直角 + 平版无阴影 */
  --radius: 0rem;
  --shadow-x: 0;
  --shadow-y: 0;
  --shadow-blur: 0;
  --shadow-spread: 0px;
  --shadow-opacity: 0;
  --shadow-color: oklch(0.3058 0.0641 249.4045);
  --shadow-2xs: none;
  --shadow-xs: none;
  --shadow-sm: none;
  --shadow: none;
  --shadow-md: none;
  --shadow-lg: none;
  --shadow-xl: none;
  --shadow-2xl: none;
  --tracking-normal: 0em;
  --spacing: 0.25rem;
}

.dark {
  /* 夜纸：藏青底 + 奶油字 + 橙高亮 */
  --background: oklch(0.2539 0.0467 249.0998);
  --foreground: oklch(0.9102 0.0265 90.1074);
  --card: oklch(0.2866 0.0536 250.2057);
  --card-foreground: oklch(0.9278 0.0248 91.6213);
  --popover: oklch(0.3095 0.0576 249.3827);
  --popover-foreground: oklch(0.9278 0.0248 91.6213);
  --primary: oklch(0.7102 0.1389 59.4035);
  --primary-foreground: oklch(0.2718 0.0488 252.0843);
  --secondary: oklch(0.3412 0.0616 250.8275);
  --secondary-foreground: oklch(0.9102 0.0265 90.1074);
  --muted: oklch(0.3163 0.0609 253.3487);
  --muted-foreground: oklch(0.7383 0.0248 90.8045);
  --accent: oklch(0.6459 0.1377 62.2708);
  --accent-foreground: oklch(0.2718 0.0488 252.0843);
  --destructive: oklch(0.6627 0.135 30.5788);
  --destructive-foreground: oklch(0.1963 0.0301 34.021);
  --border: oklch(0.3998 0.0624 249.6356);
  --input: oklch(0.4501 0.061 249.3183);
  --ring: oklch(0.7102 0.1389 59.4035);
  --chart-1: oklch(0.7548 0.0635 246.4807);
  --chart-2: oklch(0.7102 0.1389 59.4035);
  --chart-3: oklch(0.6157 0.0483 247.5984);
  --chart-4: oklch(0.7887 0.0592 89.6434);
  --chart-5: oklch(0.6627 0.135 30.5788);
  --sidebar: oklch(0.2347 0.0462 251.4574);
  --sidebar-foreground: oklch(0.9102 0.0265 90.1074);
  --sidebar-primary: oklch(0.7102 0.1389 59.4035);
  --sidebar-primary-foreground: oklch(0.2718 0.0488 252.0843);
  --sidebar-accent: oklch(0.3412 0.0616 250.8275);
  --sidebar-accent-foreground: oklch(0.9102 0.0265 90.1074);
  --sidebar-border: oklch(0.3871 0.0749 252.0744);
  --sidebar-ring: oklch(0.7102 0.1389 59.4035);
  --grid-line: oklch(0.3221 0.0582 250.883);
  --track: oklch(0.3567 0.0626 251.4689);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-grid-line: var(--grid-line);
  --color-track: var(--track);
  --font-sans: var(--font-sans);
  --font-serif: var(--font-serif);
  --font-mono: var(--font-mono);
  --font-display: var(--font-display);
  --radius-sm: 0rem;
  --radius-md: 0rem;
  --radius-lg: 0rem;
  --radius-xl: 0rem;
  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow: var(--shadow);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```
