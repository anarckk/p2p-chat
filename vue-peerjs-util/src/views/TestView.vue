<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { message } from 'ant-design-vue';
import { PeerHttpUtil } from '../util/PeerHttpUtil';

const targetId = ref('');
const messageContent = ref('');
const myId = ref('连接中...');
const messages = ref<Array<{ from: string; content: string; time: string; isSystem?: boolean }>>(
  [],
);
let peerHttp: PeerHttpUtil | null = null;

onMounted(() => {
  peerHttp = new PeerHttpUtil();

  peerHttp.on('open', (id: string) => {
    myId.value = id;
  });

  peerHttp.on('message', (data: any) => {
    addMessage(data.from, data.data);
  });
});

onUnmounted(() => {
  if (peerHttp) {
    peerHttp.destroy();
  }
});

function sendMessage() {
  const tid = targetId.value.trim();
  const msg = messageContent.value.trim();

  if (!tid) {
    message.warning('请输入对方 ID');
    return;
  }

  if (!msg) {
    message.warning('请输入消息内容');
    return;
  }

  peerHttp!
    .send(tid, msg)
    .then(() => {
      addMessage('我', msg);
      messageContent.value = '';
    })
    .catch((err: Error) => {
      addMessage('系统', '发送失败: ' + err.message, true);
    });
}

function addMessage(from: string, content: string, isSystem = false) {
  messages.value.push({
    from,
    content,
    time: new Date().toLocaleTimeString(),
    isSystem,
  });
}
</script>

<template>
  <div class="container">
    <a-card title="PeerJS 测试" :bordered="false">
      <a-descriptions bordered :column="1">
        <a-descriptions-item label="我的 ID">
          <a-typography-text copyable>{{ myId }}</a-typography-text>
        </a-descriptions-item>
      </a-descriptions>

      <a-divider />

      <a-form layout="vertical">
        <a-form-item label="对方 ID">
          <a-input v-model:value="targetId" placeholder="粘贴对方的 ID" />
        </a-form-item>

        <a-form-item label="消息内容">
          <a-textarea
            v-model:value="messageContent"
            :rows="3"
            placeholder="输入要发送的消息"
          />
        </a-form-item>

        <a-form-item>
          <a-button type="primary" @click="sendMessage">发送消息</a-button>
        </a-form-item>
      </a-form>

      <a-divider />

      <a-typography-title :level="5">消息记录</a-typography-title>
      <div class="messages-container">
        <a-list :data-source="messages" size="small">
          <template #renderItem="{ item }">
            <a-list-item>
              <a-typography-text type="secondary">[{{ item.time }}]</a-typography-text>
              <template v-if="item.isSystem">
                <a-tag color="warning">{{ item.content }}</a-tag>
              </template>
              <template v-else>
                <a-tag color="blue">{{ item.from }}</a-tag>
                <span>{{ item.content }}</span>
              </template>
            </a-list-item>
          </template>
        </a-list>
      </div>
    </a-card>
  </div>
</template>

<style scoped>
.container {
  padding: 20px;
  display: flex;
  justify-content: center;
  min-height: calc(100vh - 64px);
  background: #f0f2f5;
}

.container :deep(.ant-card) {
  width: 100%;
  max-width: 600px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.messages-container {
  max-height: 400px;
  overflow-y: auto;
}
</style>
