服务器已经启动了。

调用 list-e2e-tests skill 获得所有的 e2e 测试用例。

通过Task工具的调用子代理执行单个e2e测试：“运行 e2e 单个测试 {e2e测试名称}，如果e2e测试出问题，就修正 e2e 测试发现的问题”。
子代理处理完一个e2e测试之后，继续通过Task工具调用子代理运行下一个e2e测试，直到所有的e2e测试运行完毕为止。

单个e2e测试不是指单个文件，而是文件中一个 describe 里的测试 。

使用这样的命令格式：npx playwright test e2e/user-setup.spec.ts -g "中文用户名场景" 
来调用单个测试。如果失败则重试几次。