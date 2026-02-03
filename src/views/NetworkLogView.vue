<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { FileTextOutlined, EyeOutlined, DeleteOutlined, ReloadOutlined, ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons-vue';
import type { NetworkLog } from '../util/networkLogDB';
import { networkLogDB } from '../util/networkLogDB';

const columns = [
  { title: '时间', dataIndex: 'timestamp', key: 'timestamp', width: 150 },
  { title: '对端', dataIndex: 'peerId', key: 'peerId', width: 180 },
  { title: '业务类型', dataIndex: 'businessType', key: 'businessType', width: 150 },
  { title: 'Request', dataIndex: 'request', key: 'request', width: 80 },
  { title: 'Response', dataIndex: 'response', key: 'response', width: 80 },
  { title: '数据大小', dataIndex: 'dataSize', key: 'dataSize', width: 100 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80 },
  { title: '操作', dataIndex: 'actions', key: 'actions', width: 80, fixed: 'right' as const },
];

const logs = ref<NetworkLog[]>([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);

const detailVisible = ref(false);
const currentLog = ref<NetworkLog | null>(null);
const currentTab = ref<'request' | 'response'>('request');

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

function getDirectionBadge(): { text: string; color: string; icon: any } {
  return {
    text: '请求',
    color: 'blue',
    icon: ArrowUpOutlined,
  };
}

function showDetail(log: NetworkLog) {
  currentLog.value = log;
  currentTab.value = 'request';
  detailVisible.value = true;
}

function getCurrentData(): unknown {
  if (!currentLog.value) return null;
  return currentTab.value === 'request' ? currentLog.value.request : currentLog.value.response;
}

function formatDataSizeForValue(value: unknown): string {
  if (!value) return '0 B';
  const json = JSON.stringify(value);
  const size = new Blob([json]).size;
  return formatDataSize(size);
}

async function handlePageChange(page: number) {
  currentPage.value = page;
  await loadLogs();
}

async function handleRefresh() {
  currentPage.value = 1;
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
    <div class="page-header">
      <h1 class="page-title">
        <FileTextOutlined class="title-icon" />
        网络数据日志
      </h1>
      <p class="page-subtitle">查看和分析所有网络通信记录</p>
    </div>

    <a-card class="log-card" :bordered="false">
      <template #title>
        <div class="card-title">
          <span>通信记录</span>
          <a-badge :count="total" :number-style="{ backgroundColor: '#1890ff' }" style="margin-left: 8px;" />
        </div>
      </template>
      <template #extra>
        <a-space>
          <a-button @click="handleRefresh" aria-label="refresh-logs">
            <template #icon>
              <ReloadOutlined />
            </template>
            刷新
          </a-button>
          <a-button
            type="primary"
            danger
            @click="handleClearAll"
            aria-label="clear-all-logs"
          >
            <template #icon>
              <DeleteOutlined />
            </template>
            清空日志
          </a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="logs"
        :loading="loading"
        :pagination="false"
        size="small"
        :scroll="{ x: 1200, y: 500 }"
        class="log-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'timestamp'">
            <span class="timestamp-text">{{ formatTimestamp(record.timestamp) }}</span>
          </template>
          <template v-else-if="column.key === 'peerId'">
            <a-typography-text copyable :text="record.peerId" class="peer-id-text">
              {{ formatPeerId(record.peerId) }}
            </a-typography-text>
          </template>
          <template v-else-if="column.key === 'businessType'">
            <a-tag color="blue">{{ record.businessType }}</a-tag>
          </template>
          <template v-else-if="column.key === 'request'">
            <a-tag v-if="record.request" color="green" style="cursor: pointer;" @click="showDetail(record)">
              <EyeOutlined style="margin-right: 4px;" />
              查看
            </a-tag>
            <span v-else class="empty-text">-</span>
          </template>
          <template v-else-if="column.key === 'response'">
            <a-tag v-if="record.response" color="orange" style="cursor: pointer;" @click="showDetail(record); currentTab = 'response'">
              <EyeOutlined style="margin-right: 4px;" />
              查看
            </a-tag>
            <span v-else class="empty-text">-</span>
          </template>
          <template v-else-if="column.key === 'dataSize'">
            <span class="size-text">{{ formatDataSize(record.dataSize) }}</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="formatStatus(record.status).color">
              {{ formatStatus(record.status).text }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-button
              type="link"
              size="small"
              @click="showDetail(record)"
              aria-label="view-detail"
            >
              <EyeOutlined />
            </a-button>
          </template>
        </template>
      </a-table>

      <div class="pagination-wrapper">
        <a-pagination
          v-model:current="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :show-total="(total: number) => `共 ${total} 条记录`"
          :page-size-options="['10', '20', '50', '100']"
          show-size-changer
          @change="handlePageChange"
        />
      </div>
    </a-card>

    <!-- 详情弹窗 -->
    <a-modal
      v-model:open="detailVisible"
      :title="`通信详情 - ${currentLog?.businessType || ''}`"
      width="700px"
      :footer="null"
      class="detail-modal"
    >
      <div v-if="currentLog" class="detail-content">
        <!-- 元信息 -->
        <a-descriptions :column="2" size="small" bordered class="meta-info">
          <a-descriptions-item label="时间">
            {{ formatTimestamp(currentLog.timestamp) }}
          </a-descriptions-item>
          <a-descriptions-item label="对端">
            {{ currentLog.peerId }}
          </a-descriptions-item>
          <a-descriptions-item label="业务类型">
            {{ currentLog.businessType }}
          </a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="formatStatus(currentLog.status).color">
              {{ formatStatus(currentLog.status).text }}
            </a-tag>
          </a-descriptions-item>
        </a-descriptions>

        <!-- 数据切换标签 -->
        <a-tabs v-model:activeKey="currentTab" class="data-tabs" style="margin-top: 16px;">
          <a-tab-pane key="request" tab="Request">
            <template #tab>
              <ArrowUpOutlined style="margin-right: 4px;" />
              Request (请求)
            </template>
            <div v-if="currentLog.request" class="data-container">
              <div class="data-size-info">
                数据大小: {{ formatDataSizeForValue(currentLog.request) }}
              </div>
              <pre class="json-data">{{ JSON.stringify(currentLog.request, null, 2) }}</pre>
            </div>
            <a-empty v-else description="无请求数据" />
          </a-tab-pane>
          <a-tab-pane key="response" tab="Response">
            <template #tab>
              <ArrowDownOutlined style="margin-right: 4px;" />
              Response (响应)
            </template>
            <div v-if="currentLog.response" class="data-container">
              <div class="data-size-info">
                数据大小: {{ formatDataSizeForValue(currentLog.response) }}
              </div>
              <pre class="json-data">{{ JSON.stringify(currentLog.response, null, 2) }}</pre>
            </div>
            <a-empty v-else description="无响应数据" />
          </a-tab-pane>
        </a-tabs>

        <!-- 错误信息 -->
        <div v-if="currentLog.error" class="error-section">
          <a-alert
            type="error"
            message="错误信息"
            :description="currentLog.error"
            show-icon
          />
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.network-log-view {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
}

/* 页面标题 */
.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: #1890ff;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-icon {
  font-size: 28px;
}

.page-subtitle {
  font-size: 14px;
  color: #8c8c8c;
  margin: 0;
}

/* 日志卡片 */
.log-card {
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.card-title {
  display: flex;
  align-items: center;
}

/* 表格样式 */
.log-table {
  font-size: 13px;
}

.timestamp-text {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #595959;
}

.peer-id-text {
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.empty-text {
  color: #bfbfbf;
}

.size-text {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #595959;
}

/* 分页 */
.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

/* 详情弹窗 */
.detail-modal .meta-info {
  margin-bottom: 16px;
}

.data-tabs :deep(.ant-tabs-tab) {
  font-size: 14px;
}

.data-container {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px;
}

.data-size-info {
  font-size: 12px;
  color: #8c8c8c;
  margin-bottom: 8px;
  font-family: 'Courier New', monospace;
}

.json-data {
  margin: 0;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.5;
  max-height: 400px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-section {
  margin-top: 16px;
}

/* 响应式 */
@media (max-width: 768px) {
  .network-log-view {
    padding: 16px;
  }

  .page-title {
    font-size: 24px;
  }
}
</style>
