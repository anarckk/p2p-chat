<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/userStore';
import { usePeerManager } from '../composables/usePeerManager';
import { message } from 'ant-design-vue';
import { SaveOutlined, UserOutlined, ThunderboltOutlined } from '@ant-design/icons-vue';

const router = useRouter();
const userStore = useUserStore();
const peerManager = usePeerManager();
const {
  setNetworkAccelerationEnabled,
  broadcastNetworkAccelerationStatus,
} = peerManager;

// 用户名
const username = ref('');
const originalUsername = ref('');

// 头像
const avatarPreview = ref<string | null>(null);
const avatarFile = ref<File | null>(null);

// 网络加速
const networkAcceleration = ref(false);
const originalNetworkAcceleration = ref(false);

// 加载中状态
const isLoading = ref(false);
const isSaving = ref(false);

onMounted(() => {
  // 确保从 localStorage 加载用户信息
  userStore.loadUserInfo();

  // 加载用户信息
  username.value = userStore.userInfo.username || '';
  originalUsername.value = username.value;
  avatarPreview.value = userStore.userInfo.avatar;

  // 加载网络加速开关状态
  networkAcceleration.value = userStore.loadNetworkAcceleration();
  originalNetworkAcceleration.value = networkAcceleration.value;

  // 同步 peerManager 的网络加速状态
  setNetworkAccelerationEnabled(networkAcceleration.value);
});

// 是否有修改
const hasChanges = computed(() => {
  return username.value !== originalUsername.value ||
    avatarFile.value !== null ||
    networkAcceleration.value !== originalNetworkAcceleration.value;
});

// 处理文件选择
function handleFileChange(info: any) {
  const file = info.file;
  if (file && file.originFileObj) {
    const originFileObj = file.originFileObj;

    // 验证文件类型
    if (!originFileObj.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return;
    }

    // 验证文件大小（2MB）
    if (originFileObj.size > 2 * 1024 * 1024) {
      message.error('图片大小不能超过 2MB');
      return;
    }

    avatarFile.value = originFileObj;

    // 预览图片
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarPreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(originFileObj);
  }
}

// 移除头像
function removeAvatar() {
  avatarPreview.value = null;
  avatarFile.value = null;
}

// 保存设置
async function handleSave() {
  if (!username.value.trim()) {
    message.warning('用户名不能为空');
    return;
  }

  isSaving.value = true;

  try {
    // 保存用户信息
    userStore.saveUserInfo({
      username: username.value.trim(),
      avatar: avatarPreview.value,
    });

    // 保存网络加速开关
    if (networkAcceleration.value !== originalNetworkAcceleration.value) {
      userStore.setNetworkAcceleration(networkAcceleration.value);
      setNetworkAccelerationEnabled(networkAcceleration.value);

      // 广播网络加速状态给所有在线设备
      await broadcastNetworkAccelerationStatus();

      message.success(networkAcceleration.value ? '已开启网络加速' : '已关闭网络加速');
    }

    originalUsername.value = username.value;
    originalNetworkAcceleration.value = networkAcceleration.value;
    avatarFile.value = null;

    message.success('设置已保存');
  } catch (error) {
    console.error('[Settings] Save error:', error);
    message.error('保存失败');
  } finally {
    isSaving.value = false;
  }
}

// 取消编辑
function handleCancel() {
  username.value = originalUsername.value;
  avatarPreview.value = userStore.userInfo.avatar;
  avatarFile.value = null;
  networkAcceleration.value = originalNetworkAcceleration.value;
}

// 跳转到发现中心
function goToCenter() {
  router.push('/center');
}
</script>

<template>
  <div class="settings-container">
    <a-row :gutter="[16, 16]">
      <!-- 用户信息设置 -->
      <a-col :xs="24" :md="12">
        <a-card title="用户信息" :bordered="false">
          <template #extra>
            <UserOutlined />
          </template>

          <a-form layout="vertical">
            <!-- 用户名 -->
            <a-form-item label="用户名">
              <a-input
                v-model:value="username"
                placeholder="请输入用户名"
                :maxlength="20"
                show-count
                allow-clear
              />
            </a-form-item>

            <!-- 头像 -->
            <a-form-item label="头像">
              <div class="avatar-section">
                <a-avatar
                  :size="80"
                  :src="avatarPreview"
                  v-if="avatarPreview"
                >
                  {{ username.charAt(0).toUpperCase() }}
                </a-avatar>
                <a-avatar
                  :size="80"
                  v-else
                >
                  {{ username.charAt(0).toUpperCase() }}
                </a-avatar>

                <div class="avatar-actions">
                  <a-upload
                    :before-upload="() => false"
                    @change="handleFileChange"
                    :show-upload-list="false"
                    accept="image/*"
                  >
                    <a-button size="small">
                      <template #icon>📷</template>
                      选择图片
                    </a-button>
                  </a-upload>
                  <a-button
                    v-if="avatarPreview"
                    size="small"
                    danger
                    @click="removeAvatar"
                  >
                    移除
                  </a-button>
                </div>
              </div>
              <div class="avatar-hint">
                支持 JPG、PNG 格式，文件大小不超过 2MB
              </div>
            </a-form-item>
          </a-form>
        </a-card>
      </a-col>

      <!-- 网络加速设置 -->
      <a-col :xs="24" :md="12">
        <a-card title="网络加速" :bordered="false">
          <template #extra>
            <ThunderboltOutlined />
          </template>

          <div class="network-acceleration-section">
            <p class="description">
              开启网络加速后，您的设备可以帮助其他设备转发消息。
              同时，当您与某些设备直连失败时，也可以通过其他开启网络加速的设备中转消息。
            </p>

            <a-switch
              v-model:checked="networkAcceleration"
              checked-children="开启"
              un-checked-children="关闭"
            />

            <div class="status-info">
              <a-alert
                v-if="networkAcceleration"
                type="info"
                show-icon
                message="网络加速已开启"
                description="您正在帮助其他设备转发消息，同时也可以使用其他设备的中转服务。"
              />
              <a-alert
                v-else
                type="warning"
                show-icon
                message="网络加速已关闭"
                description="您不会帮助其他设备转发消息，其他设备也不会帮助您转发消息。所有通信均为直连。"
              />
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 操作按钮 -->
      <a-col :span="24">
        <div class="action-buttons">
          <a-button
            type="primary"
            :loading="isSaving"
            :disabled="!hasChanges"
            @click="handleSave"
            aria-label="save-settings-button"
          >
            <template #icon>
              <SaveOutlined />
            </template>
            保存设置
          </a-button>
          <a-button
            v-if="hasChanges"
            @click="handleCancel"
          >
            取消
          </a-button>
          <a-button @click="goToCenter">
            返回发现中心
          </a-button>
        </div>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.settings-container {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

.avatar-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.avatar-hint {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
}

.network-acceleration-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.network-acceleration-section .description {
  color: #666;
  line-height: 1.6;
  margin: 0;
}

.status-info {
  margin-top: 8px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 16px 0;
}

@media (max-width: 768px) {
  .avatar-section {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .action-buttons {
    flex-direction: column;
  }

  .action-buttons button {
    width: 100%;
  }
}
</style>
