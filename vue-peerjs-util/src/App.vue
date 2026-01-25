<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import axios from 'axios'
import type { TableProps } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons-vue'

interface User {
  id: number
  name: string
  gender: string
  email: string
  birthDate: string
  idCard: string
  createdDate: string
}

interface PageResult {
  records: User[]
  total: number
  size: number
  current: number
  pages: number
}

interface SearchParams {
  name: string
  gender: string
  email: string
  birthDate: string
  idCard: string
}

const dataSource = ref<User[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const searchParams = ref<SearchParams>({
  name: '',
  gender: '',
  email: '',
  birthDate: '',
  idCard: ''
})
const tableContainerRef = ref<HTMLElement | null>(null)
const tableContainerHeight = ref(0)

const tableScrollY = computed(() => {
  if (tableContainerHeight.value > 0) {
    return tableContainerHeight.value - 80 - 32
  }
  return 500
})

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 80, align: 'center' as const },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
  { title: '性别', dataIndex: 'gender', key: 'gender', width: 80, align: 'center' as const },
  { title: '邮箱', dataIndex: 'email', key: 'email' },
  { title: '生日', dataIndex: 'birthDate', key: 'birthDate', width: 120 },
  { title: '身份证号', dataIndex: 'idCard', key: 'idCard', width: 200 },
  { title: '创建日期', dataIndex: 'createdDate', key: 'createdDate', width: 180 },
]

const fetchUsers = async () => {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: currentPage.value,
      size: pageSize.value,
    }

    if (searchParams.value.name) params.name = searchParams.value.name
    if (searchParams.value.gender) params.gender = searchParams.value.gender
    if (searchParams.value.email) params.email = searchParams.value.email
    if (searchParams.value.birthDate) params.birthDate = searchParams.value.birthDate
    if (searchParams.value.idCard) params.idCard = searchParams.value.idCard

    const { data } = await axios.get<any, { data: { data: PageResult } }>('/api/users/page', {
      params,
    })
    dataSource.value = data.data.records
    total.value = data.data.total
  } catch (error) {
    console.error('获取用户列表失败:', error)
  } finally {
    loading.value = false
  }
}

const handlePageChange: TableProps['onChange'] = (pagination, filters, sorter) => {
  currentPage.value = pagination.current || 1
  pageSize.value = pagination.pageSize || 10
  fetchUsers()
}

const handleSearch = () => {
  currentPage.value = 1
  fetchUsers()
}

const clearSearch = () => {
  searchParams.value = {
    name: '',
    gender: '',
    email: '',
    birthDate: '',
    idCard: ''
  }
  currentPage.value = 1
  fetchUsers()
}

const updateTableContainerHeight = () => {
  nextTick(() => {
    if (tableContainerRef.value) {
      tableContainerHeight.value = tableContainerRef.value.offsetHeight
    }
  })
}

onMounted(() => {
  fetchUsers()
  updateTableContainerHeight()
  window.addEventListener('resize', updateTableContainerHeight)
})
</script>

<template>
  <div class="container">
    <div class="header">
      <h1 class="title">用户管理系统</h1>
      <p class="subtitle">User Management System</p>
    </div>

    <div class="search-bar">
      <a-space :size="12" wrap>
        <a-input
          v-model:value="searchParams.name"
          placeholder="姓名(模糊)"
          allow-clear
          :style="{ width: '150px' }"
        >
          <template #prefix>
            <SearchOutlined />
          </template>
        </a-input>

        <a-select
          v-model:value="searchParams.gender"
          placeholder="性别"
          allow-clear
          :style="{ width: '100px' }"
        >
          <a-select-option value="男">男</a-select-option>
          <a-select-option value="女">女</a-select-option>
        </a-select>

        <a-input
          v-model:value="searchParams.email"
          placeholder="邮箱(模糊)"
          allow-clear
          :style="{ width: '200px' }"
        >
          <template #prefix>
            <SearchOutlined />
          </template>
        </a-input>

        <a-date-picker
          v-model:value="searchParams.birthDate"
          placeholder="生日"
          allow-clear
          :style="{ width: '150px' }"
          value-format="YYYY-MM-DD"
        />

        <a-input
          v-model:value="searchParams.idCard"
          placeholder="身份证号(精确)"
          allow-clear
          :style="{ width: '200px' }"
        >
          <template #prefix>
            <SearchOutlined />
          </template>
        </a-input>

        <a-button type="primary" size="large" @click="handleSearch">
          <template #icon>
            <SearchOutlined />
          </template>
          搜索
        </a-button>

        <a-button size="large" @click="clearSearch">
          重置
        </a-button>

        <a-button size="large" @click="fetchUsers" :loading="loading">
          <template #icon>
            <ReloadOutlined />
          </template>
          刷新
        </a-button>
      </a-space>
    </div>

    <div class="table-container" ref="tableContainerRef">
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total) => `共 ${total.toLocaleString()} 条数据`,
          onChange: (page, size) => handlePageChange({ current: page, pageSize: size }),
        }"
        row-key="id"
        bordered
        size="small"
        :scroll="{ y: tableScrollY }"
        :row-class-name="(_record, index) => index % 2 === 1 ? 'table-row-odd' : ''"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'gender'">
            <a-tag :color="record.gender === '男' ? 'blue' : 'pink'">
              {{ record.gender }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'name'">
            <a>{{ record.name }}</a>
          </template>
          <template v-else-if="column.key === 'email'">
            <a :href="`mailto:${record.email}`">{{ record.email }}</a>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<style scoped>

.container {
  height: 100%;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 16px;
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  flex-shrink: 0;
  text-align: center;
  margin-bottom: 16px;
  padding: 16px 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #1890ff;
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: #8c8c8c;
  letter-spacing: 2px;
}

.search-bar {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
  padding: 16px 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.table-container {
  flex: 1;
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
