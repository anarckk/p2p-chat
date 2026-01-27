session_id:f23108ce-c085-4f4a-a137-e813a13dec36

<ide_selection>The user selected the lines 57 to 91 from c:\bee\projects\sx-peerjs-http-util\e2e\universe-bootstrap.spec.ts:
    // 创建第二个浏览器上下文模拟第二个设备
    const browser2 = await context.browser()?.newContext();
    const page2 = await browser2.newPage();

    try {
      // 设置第一个用户（可能是启动者）
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '宇宙启动者');

      const peerId1 = await getPeerIdFromStorage(page);
      if (!peerId1) {
        test.skip();
        return;
      }

      // 设置第二个用户
      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '新加入设备');

      const peerId2 = await getPeerIdFromStorage(page2);
      if (!peerId2) {
        test.skip();
        return;
      }

      // 监听第二个设备的控制台日志
      const logs: string[] = [];
      page2.on('console', msg => {
        logs.push(msg.text());
      });

      // 第二个设备手动添加第一个设备


This may or may not be related to the current task.</ide_selection>
“后续设备应该能向宇宙启动者请求设备列表”，这个测试真的有用吗