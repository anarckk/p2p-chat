<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { PeerHttpUtil } from './util/PeerHttpUtil';

const targetId = ref('');
const message = ref('');
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
  const msg = message.value.trim();

  if (!tid) {
    alert('请输入对方 ID');
    return;
  }

  if (!msg) {
    alert('请输入消息内容');
    return;
  }

  peerHttp!
    .send(tid, msg)
    .then(() => {
      addMessage('我', msg);
      message.value = '';
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
    <h2>PeerJS 测试</h2>

    <div class="status">
      我的 ID: <span class="my-id">{{ myId }}</span>
    </div>

    <div class="section">
      <label>对方 ID:</label>
      <input v-model="targetId" type="text" placeholder="粘贴对方的 ID" />
    </div>

    <div class="section">
      <label>消息内容:</label>
      <textarea v-model="message" rows="3" placeholder="输入要发送的消息" />
    </div>

    <button @click="sendMessage">发送消息</button>

    <div class="section" style="margin-top: 20px">
      <label>消息记录:</label>
      <div id="messages">
        <div v-for="(msg, index) in messages" :key="index" class="msg">
          <span class="msg-time">[{{ msg.time }}]</span>
          <span v-if="msg.isSystem" class="msg-content" style="color: #dcdcaa">
            {{ msg.content }}
          </span>
          <span v-else>
            <span class="msg-from">{{ msg.from }}:</span>
            <span class="msg-content">{{ msg.content }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.container {
  font-family: monospace;
  padding: 20px;
  background: #1e1e1e;
  color: #d4d4d4;
  min-height: 100vh;
  max-width: 500px;
}

h2 {
  color: #4ec9b0;
  margin-bottom: 15px;
}

.section {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 5px;
  color: #9cdcfe;
}

input,
textarea {
  width: 100%;
  padding: 8px;
  margin-bottom: 10px;
  background: #252526;
  border: 1px solid #3c3c3c;
  color: #d4d4d4;
  font-family: monospace;
}

input:focus,
textarea:focus {
  outline: 1px solid #007acc;
}

button {
  padding: 8px 20px;
  background: #0e639c;
  color: white;
  border: none;
  cursor: pointer;
  font-family: monospace;
}

button:hover {
  background: #1177bb;
}

.status {
  padding: 10px;
  background: #252526;
  border-left: 3px solid #4ec9b0;
  margin-bottom: 15px;
}

.my-id {
  color: #ce9178;
  word-break: break-all;
  user-select: all;
}

#messages {
  background: #252526;
  padding: 10px;
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
}

.msg {
  padding: 5px 0;
  border-bottom: 1px solid #3c3c3c;
}

.msg-from {
  color: #4ec9b0;
}

.msg-content {
  color: #d4d4d4;
}

.msg-time {
  color: #808080;
  font-size: 12px;
}
</style>
