# Resume DSL 文档 / Resume DSL Reference

本项目使用一套轻量 TeX-like DSL 编写简历。它的目标是让简历像 LaTeX 一样通过源码维护，但不会解析完整 LaTeX。  
This project uses a lightweight TeX-like DSL for resumes. It aims to keep resumes source-driven like LaTeX, without parsing full LaTeX syntax.

## 基本规则 / Basic Rules

- 命令可以写成单行；如果参数很长，也可以在 `{}` 内换行。  
  Commands can be written on one line; long values can be wrapped inside `{}`.
- 空行会被忽略，可用于分隔源码段落。  
  Blank lines are ignored and can separate source sections.
- 以 `%` 开头的行会被当作注释忽略。  
  Lines starting with `%` are treated as comments.
- 非命令文本会按普通正文渲染。  
  Plain text outside commands is rendered as normal content.
- 未知命令会在编辑器中显示提示，并尽量作为普通文本保留。  
  Unknown commands show editor hints and are preserved as plain text when possible.
- 参数使用 `{}` 包裹，例如 `\section{项目经历}`。  
  Parameters use `{}`, for example `\section{项目经历}`.
- 多行命令会从 `\命令{` 开始读取，直到大括号闭合。  
  Multi-line commands start at `\command{` and continue until the closing brace.
- `\field`、`\bullet` 和普通正文参数里的手动换行会在右侧预览中保留。  
  Manual line breaks in `\field`, `\bullet`, and plain-text parameters are preserved in the preview.
- 如果内容里需要写字面量大括号，可以使用 `\{` 和 `\}`。  
  Use `\{` and `\}` to write literal braces.

## `\resume{...}`

定义简历顶部基础信息。  
Defines the top-level resume metadata.

```tex
\resume{name=姓名, role=目标岗位, phone=（+86） xxxxx, email=yourname@example.com, hometown=城市, link=github.com/yourname}
```

也可以写成多行，便于维护。如果希望右侧顶部联系方式也手动换行，使用 `contact` 字段：  
You can also write it across multiple lines. If you want manual line breaks in the contact block, use `contact`:

```tex
\resume{
  name=姓名,
  role=目标岗位,
  contact=电话：（+86） xxxxx | 邮箱：yourname@example.com
          籍贯：城市 | 链接：your-portfolio.example.com
}
```

支持字段 / Supported fields:

| 字段 / Field | 说明 / Meaning |
| --- | --- |
| `name` | 姓名 / Name |
| `role` | 求职意向 / Target role |
| `phone` | 电话 / Phone |
| `email` | 邮箱 / Email |
| `hometown` | 籍贯 / Hometown |
| `link` | 可选链接，例如 GitHub、博客、作品集 / Optional link such as GitHub, blog, or portfolio |
| `contact` | 自定义顶部联系方式；填写后优先使用，并保留手动换行 / Custom contact block; takes priority and preserves manual line breaks |

注意：`\resume{...}` 内部使用英文逗号分隔键值，不建议在单个值里再写英文逗号。`contact` 会覆盖 `phone/email/hometown/link` 的默认拼接展示。  
Note: `\resume{...}` uses commas between key-value pairs. Avoid extra commas inside a single value. `contact` overrides the default `phone/email/hometown/link` display.

## `\photo{...}`

定义第一页右上角的一寸照。  
Defines the one-inch photo shown at the top-right of the first page.

```tex
\photo{local}
```

`\photo{local}` 是本项目自定义的短命令，不是官方 LaTeX 标准命令。通常不需要手写这段内容。点击页面里的“插入照片”后，浏览器会自动完成：  
`\photo{local}` is a project-specific shortcut, not an official LaTeX command. You usually do not type it manually. When you click “Insert photo”, the browser automatically:

- 读取 `jpg/jpeg/png/webp` 图片。  
  Reads `jpg/jpeg/png/webp` images.
- 限制原始文件最大 `5MB`。  
  Limits the original file size to `5MB`.
- 按 `5:7` 比例居中裁剪。  
  Crops the image to a centered `5:7` ratio.
- 压缩成 `500x700` JPEG data URL 并单独保存。  
  Compresses it into a `500x700` JPEG data URL and stores it separately.
- 自动插入或替换源码中的 `\photo{local}`。  
  Inserts or replaces `\photo{local}` in source automatically.

登录后照片会随当前账号的草稿保存到数据库，用于跨设备恢复。没有 `\photo{...}` 时，简历不会显示空白照片框。旧版本生成的 `\photo{data:image/...}` 会自动迁移为 `\photo{local}`，避免源码里出现很长的 base64。  
After login, the photo is stored with the current account draft in the database for cross-device recovery. If `\photo{...}` is missing, no empty photo placeholder is shown. Older `\photo{data:image/...}` values are migrated to `\photo{local}` to avoid long base64 strings in source.

## `\section{标题}`

定义一个简历章节。章节标题会渲染为蓝色标题和同色横线。  
Defines a resume section. Section titles render as blue headings with matching underlines.

```tex
\section{教育背景}
\section{项目经历}
\section{实习经历}
\section{专业技能}
```

标题文本可以自定义，例如：  
Section titles are fully customizable, for example:

```tex
\section{科研经历}
\section{竞赛经历}
\section{作品集}
```

## `\entry{标题}{副标题}{时间}`

定义一段经历。常用于教育经历、项目经历、实习经历、科研经历、竞赛经历。  
Defines an experience block, commonly used for education, projects, internships, research, and competitions.

```tex
\entry{学校名称}{专业名称 · 学历}{开始时间-结束时间}
\entry{项目名称}{角色或方向}{项目时间}
```

参数说明 / Parameter meanings:

| 参数 / Parameter | 说明 / Meaning |
| --- | --- |
| 第 1 个 `{}` | 主标题，例如学校名、项目名、公司名 / Main title, such as school, project, or company |
| 第 2 个 `{}` | 副标题，例如专业、学历、岗位、角色；没有可留空 / Subtitle, such as major, degree, role, or empty |
| 第 3 个 `{}` | 时间，右对齐显示 / Time range, right-aligned |

副标题里的 `·`、`|`、`｜` 会自动拆分成多个片段显示。  
The separators `·`, `|`, and `｜` in the subtitle are automatically split into separate display chunks.

## `\field{标签}{内容}`

定义一行标签内容。既可以放在 `\entry` 下面，也可以直接放在 `\section` 下面。  
Defines a labeled line. It can be placed under an `\entry` block or directly under a `\section`.

```tex
\field{项目介绍}{填写项目背景、个人职责和最终效果。}
\field{工具方法}{填写软件、平台、工具链、方法论或技术栈。}
\field{专业能力}{填写与目标岗位相关的能力关键词。}
```

内容较长时可以手动换行，右侧预览也会换行：  
Long content can be wrapped manually, and the preview will preserve the breaks:

```tex
\field{工具方法}{
  按目标岗位填写核心工具、软件、平台、语言、框架、
  分析方法、设计方法或协作流程。
}
```

渲染效果为：  
Rendered as:

```text
项目介绍：填写项目背景、个人职责和最终效果。
```

特殊字段 / Special fields:

| 标签 / Label | 效果 / Behavior |
| --- | --- |
| `学校标签` | 不单独成行，会跟在学校名后面高亮显示 / Inline badge after school name |
| `院校标签` | 同上 / Same as above |
| `学校层次` | 同上 / Same as above |
| `核心内容` | 可写成空内容，用来在项目要点前显示小标题 / Can be empty and acts as a heading before bullets |
| `项目内容` | 同上，适合科研或作品经历 / Same behavior, suitable for research or portfolio entries |

## `\bullet{内容}`

定义经历中的编号要点。放在 `\entry` 下面时，会渲染为 `1. 2. 3.` 编号列表。  
Defines numbered bullet points within an experience block. Under `\entry`, bullets render as `1. 2. 3.`.

```tex
\bullet{职责贡献：填写你承担的任务、负责的模块或完成的工作。}
\bullet{结果产出：填写指标提升、上线成果、奖项、作品或文档沉淀。}
```

要点也可以手动换行：  
Bullets can also wrap manually:

```tex
\bullet{
  难点解决：填写关键问题、解决方案和验证方式。
  可以补充数据、结果、复盘或后续优化。
}
```

如果要点开头包含 `：` 或 `:`，冒号前的文字会自动加粗：  
If a bullet begins with `：` or `:`, the text before the colon is auto-bolded:

```tex
\bullet{成果产出：填写可量化结果、作品链接、奖项或团队认可。}
```

渲染时 `成果产出：` 会加粗。  
In rendering, `成果产出：` is bold.

## 推荐通用结构 / Recommended Generic Template

```tex
\resume{
  name=姓名,
  role=目标岗位,
  contact=电话：电话 | 邮箱：邮箱
          籍贯：城市 | 链接：作品集或主页
}
\photo{local}

\section{教育背景}
\entry{学校名称}{专业名称 · 学历}{开始时间-结束时间}
\field{学校标签}{如：985、211、双一流、重点实验室；没有可删除}
\field{奖项荣誉}{填写奖学金、竞赛奖项、学生工作或其他校园荣誉。}

\section{项目经历}
\entry{项目名称}{角色或方向}{项目时间}
\field{项目介绍}{填写项目背景、业务目标、个人职责和最终效果。}
\field{工具方法}{按目标岗位填写软件、平台、方法、工具链或技术栈。}
\field{核心内容}{}
\bullet{职责贡献：填写你负责的模块、流程、交付物或协作内容。}
\bullet{难点解决：填写关键问题、解决方案和验证方式。}
\bullet{结果产出：填写指标提升、作品链接、上线成果或奖项。}

\section{专业技能}
\field{专业能力}{填写与目标岗位相关的能力关键词。}
\field{工具能力}{填写常用软件、平台、语言、框架或协作工具。}
\field{证书与语言}{填写证书、语言能力、作品集或其他加分项。}
```

## 分页和打印 / Pagination and Printing

- 预览会按 A4 纸张尺寸分页。  
  The preview paginates to A4 page sizes.
- 内容超出当前页时，会自动流到下一页。  
  Overflow content automatically continues onto the next page.
- 分页优先保持经历块完整；块太长时，会拆分字段和要点。  
  Pagination prefers keeping experience blocks intact; oversized blocks are split into fields and bullets when needed.
- 打印导出复用屏幕预览结果，通过浏览器 `window.print()` 完成。  
  Printing reuses the on-screen preview and is completed through browser `window.print()`.
