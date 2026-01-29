<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { NetworkLog } from '../util/networkLogDB';
import { networkLogDB } from '../util/networkLogDB';

const columns = [
  { title: '时间', dataIndex: 'timestamp', key: 'timestamp', width: 150 },
  { title: '方向', dataIndex: 'direction', key: 'direction', width: 80 },
  { title: '对端', dataIndex: 'peerId', key: 'peerId', width: 200 },
  { title: '协议', dataIndex: 'protocol', key: 'protocol', width: 150 },
  { title: '阶段', dataIndex: 'stage', key: 'stage', width: 100 },
  { title: '数据大小', dataIndex: 'dataSize', key: 'dataSize', width: 100 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80 },
];

const logs = ref<NetworkLog[]>([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);

const dataDetailVisible = ref(false);
const currentData = ref<any>(null);
const currentLog = ref<NetworkLog | null>(null);

async function loadLogs() {
  loading.value = true;
  try {
    const result = await networkLogDB.getLogs(currentPage.value, pageSize.value);
    logs.value = result.data;
    total.value = result.total;
  } catch (error) {
    console.error('Failed to load logs:', error);
  } finally {
    loading.value = false;
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDirection(direction: string): string {
  return direction === 'outgoing' ? '发送' : '接收';
}

function formatPeerId(peerId: string): string {
  if (peerId.length <= 20) {
    return peerId;
  }
  return peerId.substring(0, 10) + '...' + peerId.substring(peerId.length - 7);
}

function formatDataSize(size: number): string {
  if (size < 1024) {
    return size + ' B';
  } else if (size < 1024 * 1024) {
    return (size / 1024).toFixed(2) + ' KB';
  } else {
    return (size / (1024 * 1024)).toFixed(2) + ' MB';
  }
}

function formatStatus(status: string): { text: string; color: string } {
  switch (status) {
    case 'success':
      return { text: '成功', color: 'green' };
    case 'error':
      return { text: '错误', color: 'red' };
    case 'pending':
      return { text: '进行中', color: 'blue' };
    default:
      return { text: status, color: 'gray' };
  }
}

function showDataDetail(log: NetworkLog) {
  currentLog.value = log;
  currentData.value = JSON.stringify(log.data, null, 2);
  dataDetailVisible.value = true;
}

async function handlePageChange(page: number) {
  currentPage.value = page;
  await loadLogs();
}

async function handleClearAll() {
  try {
    await networkLogDB.clearAllLogs();
    currentPage.value = 1;
    await loadLogs();
  } catch (error) {
    console.error('Failed to clear logs:', error);
  }
}

onMounted(() => {
  loadLogs();
});
</script>

<template>
  <div class="network-log-view">
    <a-card title="网络数据日志" :bordered="false">
      <template #extra>
        <a-button
          type="primary"
          danger
          @click="handleClearAll"
          :aria-label="'清空所有日志'"
        >
          清空日志
        </a-button>
      </template>

      <a-table
        :columns="columns"
        :data-source="logs"
        :loading="loading"
        :pagination="false"
        size="small"
        :scroll="{ y: 500 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'timestamp'">
            {{ formatTimestamp(record.timestamp) }}
          </template>
          <template v-else-if="column.key === 'direction'">
            <a-tag :color="record.direction === 'outgoing' ? 'blue' : 'green'">
              {{ formatDirection(record.direction) }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'peerId'">
            <a-typography-text copyable :text="record.peerId">
              {{ formatPeerId(record.peerId) }}
            </a-typography-text>
          </template>
          <template v-else-if="column.key === 'protocol'">
            {{ record.protocol }}
          </template>
          <template v-else-if="column.key === 'stage'">
            {{ record.stage || '-' }}
          </template>
          <template v-else-if="column.key === 'dataSize'">
            {{ formatDataSize(record.dataSize) }}
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="formatStatus(record.status).color">
              {{ formatStatus(record.status).text }}
            </a-tag>
          </template>
        </template>
        <template #expandedRowRender="{ record }">
          <a-button
            type="link"
            size="small"
            @click="showDataDetail(record)"
            :aria-label="'查看数据详情'"
          >
            查看数据详情
          </a-button>
          <div v-if="record.error" style="color: red; margin-top: 8px;">
            <strong>错误信息:</strong> {{ record.error }}
          </div>
        </template>
      </a-table>

      <a-pagination
        v-model:current="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :show-total="(total: number) => `共 ${total} 条`"
        @change="handlePageChange"
        style="margin-top: 16px; text-align: right;"
      />
    </a-card>

    <a-modal
      v-model:open="dataDetailVisible"
      title="数据详情"
      :footer="null"
      width="800px"
    >
      <pre
        style="
          background: #f5f5f5;
          padding: 12px;
          border-radius: 4px;
          max-height: 500px;
          overflow: auto;
          font-size: 12px;
        "
      >{{ currentData }}</pre>
    </a-modal>
  </div>
</template>

<style scoped>
.network-log-view {
  padding: 16px;
}
</style>
