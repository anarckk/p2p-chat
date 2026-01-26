/claude-skill-guide  

把 `npx playwright test e2e/center.spec.ts -g "设备 A 添加设备 B 时"` 写成脚本

放到 .claude\skills\e2e-test\script\single-e2e-test.py

因为，不知道为什么AI去执行 `npx playwright test e2e/center.spec.ts -g "设备 A 添加设备 B 时"` 命令时就会出错。
所以封装成一个脚本，套一层，看能不能正常。

同时修改一下 .claude\skills\e2e-test\SKILL.md ，写简单一点，没必要写这么多。