<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  AudioMutedOutlined,
  AudioOutlined,
  VideoCameraOutlined,
  VideoCameraAddOutlined,
  PhoneOutlined,
} from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { callManager, type CallState, type CallType, type CallEvent } from '../util/callManager';

// 状态
const isInCall = ref(false);
const isMuted = ref(false);
const isVideoOff = ref(false);
const callState = ref<CallState>('idle');
const callType = ref<CallType>('audio');
const remotePeerId = ref<string | null>(null);

// 视频引用
const remoteVideoRef = ref<HTMLVideoElement>();
const localVideoRef = ref<HTMLVideoElement>();

// 设置通话管理器回调
callManager.onRemoteStream = (stream) => {
  console.log('[CallView] Remote stream received');
  if (remoteVideoRef.value) {
    remoteVideoRef.value.srcObject = stream;
  }
  isInCall.value = true;
  callState.value = 'incall';
};

callManager.onLocalStream = (stream) => {
  console.log('[CallView] Local stream received');
  if (localVideoRef.value) {
    localVideoRef.value.srcObject = stream;
  }
};

callManager.onCallEnded = () => {
  console.log('[CallView] Call ended');
  isInCall.value = false;
  callState.value = 'ended';
  remotePeerId.value = null;

  // 清空视频源
  if (remoteVideoRef.value) {
    remoteVideoRef.value.srcObject = null;
  }
  if (localVideoRef.value) {
    localVideoRef.value.srcObject = null;
  }

  // 重置状态
  setTimeout(() => {
    callState.value = 'idle';
    isMuted.value = false;
    isVideoOff.value = false;
  }, 100);
};

callManager.onIncomingCall = (event: CallEvent) => {
  console.log('[CallView] Incoming call:', event);
  remotePeerId.value = event.peerId;
  callType.value = event.callType;
};

callManager.onIceCandidate = (info) => {
  console.log('[CallView] ICE candidate:', info);
  // 发送 ICE 候选给对方（通过 peerHttpUtil）
};

// 切换静音
function toggleMute() {
  const muted = callManager.toggleMute();
  isMuted.value = muted;
  message.info(muted ? '麦克风已关闭' : '麦克风已开启');
}

// 切换视频
function toggleVideo() {
  const off = callManager.toggleVideo();
  isVideoOff.value = off;
  message.info(off ? '摄像头已关闭' : '摄像头已开启');
}

// 挂断
async function hangup() {
  try {
    await callManager.hangup();
    message.info('通话已结束');
  } catch (error) {
    console.error('[CallView] Error hanging up:', error);
    message.error('挂断失败');
  }
}

// 清理
onUnmounted(() => {
  if (isInCall.value) {
    hangup();
  }
});

// 计算属性
const isVideoCall = computed(() => callType.value === 'video');
const showLocalVideo = computed(() => isVideoCall.value && isInCall.value);
const callStateText = computed(() => {
  switch (callState.value) {
    case 'calling':
      return '正在呼叫...';
    case 'incall':
      return '通话中';
    case 'ended':
      return '通话已结束';
    default:
      return '没有进行中的通话';
  }
});
</script>

<template>
  <div class="call-container">
    <div v-if="isInCall" class="call-active">
      <!-- 远程视频（全屏） -->
      <video
        v-if="isVideoCall"
        ref="remoteVideoRef"
        autoplay
        playsinline
        class="remote-video"
        aria-label="Remote video"
      />
      <div v-else class="audio-call-placeholder">
        <div class="audio-icon">
          <AudioOutlined />
        </div>
        <div class="audio-info">
          <p>语音通话中</p>
          <p class="peer-id">{{ remotePeerId }}</p>
        </div>
      </div>

      <!-- 本地视频（小窗） -->
      <video
        v-if="showLocalVideo"
        ref="localVideoRef"
        autoplay
        muted
        playsinline
        class="local-video"
        :class="{ 'video-off': isVideoOff }"
        aria-label="Local video"
      />

      <!-- 通话状态 -->
      <div class="call-status">
        {{ callStateText }}
      </div>

      <!-- 控制按钮 -->
      <div class="call-controls">
        <a-button
          :type="isMuted ? 'primary' : 'default'"
          shape="circle"
          size="large"
          @click="toggleMute"
          :aria-label="isMuted ? 'Unmute microphone' : 'Mute microphone'"
          class="control-button"
        >
          <template #icon>
            <AudioMutedOutlined v-if="isMuted" />
            <AudioOutlined v-else />
          </template>
        </a-button>

        <a-button
          v-if="isVideoCall"
          :type="isVideoOff ? 'primary' : 'default'"
          shape="circle"
          size="large"
          @click="toggleVideo"
          :aria-label="isVideoOff ? 'Turn on camera' : 'Turn off camera'"
          class="control-button"
        >
          <template #icon>
            <VideoCameraAddOutlined v-if="isVideoOff" />
            <VideoCameraOutlined v-else />
          </template>
        </a-button>

        <a-button
          type="primary"
          danger
          shape="circle"
          size="large"
          @click="hangup"
          aria-label="Hang up"
          class="control-button hangup-button"
        >
          <template #icon>
            <PhoneOutlined />
          </template>
        </a-button>
      </div>
    </div>

    <div v-else class="call-idle">
      <a-empty description="没有进行中的通话">
        <PhoneOutlined style="font-size: 64px; color: #ccc;" />
      </a-empty>
    </div>
  </div>
</template>

<style scoped>
.call-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #000;
  overflow: hidden;
}

.call-active {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}

.remote-video {
  flex: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.audio-call-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
}

.audio-icon {
  font-size: 128px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 24px;
}

.audio-info {
  text-align: center;
  color: white;
}

.audio-info p:first-child {
  font-size: 24px;
  margin-bottom: 8px;
}

.peer-id {
  font-size: 14px;
  opacity: 0.7;
  font-family: monospace;
}

.local-video {
  position: fixed;
  bottom: 100px;
  right: 20px;
  width: 150px;
  height: 200px;
  background: #333;
  border: 2px solid #fff;
  border-radius: 8px;
  object-fit: cover;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.local-video.video-off {
  opacity: 0.5;
}

.call-status {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border-radius: 20px;
  font-size: 14px;
  z-index: 10;
}

.call-controls {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 16px;
  z-index: 10;
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 40px;
  backdrop-filter: blur(10px);
}

.control-button {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-button .anticon {
  font-size: 24px;
}

.hangup-button {
  width: 64px;
  height: 64px;
}

.hangup-button .anticon {
  font-size: 28px;
}

.call-idle {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .local-video {
    width: 100px;
    height: 133px;
    bottom: 90px;
    right: 10px;
  }

  .call-controls {
    gap: 12px;
    padding: 10px 16px;
  }

  .control-button {
    width: 48px;
    height: 48px;
  }

  .control-button .anticon {
    font-size: 20px;
  }

  .hangup-button {
    width: 56px;
    height: 56px;
  }

  .hangup-button .anticon {
    font-size: 24px;
  }

  .audio-icon {
    font-size: 96px;
  }

  .audio-info p:first-child {
    font-size: 20px;
  }
}
</style>
