session_id:da28545e-23f8-4dd4-89a3-0260f3eba3fc

# 禁止使用全局提示

全局提示，从 ant-design-vue 导入的 message 组件：

```
import { message } from 'ant-design-vue';
使用示例（CenterView.vue:143-160）：

message.warning('请输入要查询的 Peer ID') - 警告提示
message.success('从 xxx 发现了 n 个设备') - 成功提示
message.info('未发现任何设备') - 信息提示
message.error('查询失败') - 错误提示
```

全局提示提示完就消失，无法追溯，用户要是没注意到，无法再回头看。