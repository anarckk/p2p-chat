---
name: list-e2e
description: 列出项目所有 E2E 测试文件、测试套件和单个测试用例，附带运行命令
argument-hint: [filter]
---

# E2E 测试列表

当前项目包含以下 E2E 测试：

&#33;`cd .claude/skills/list-e2e-tests/scripts && node parse-e2e-tests.mjs $ARGUMENTS`

---

## 使用方式

- `/list-e2e` - 列出所有测试
- `/list-e2e center` - 筛选包含 "center" 的测试文件
- `/list-e2e --json` - 以 JSON 格式输出