/**
 * 通话管理器
 * 支持 MediaStream 音视频通话和 Data Channel 语音消息
 */
import type { CallRequest, CallResponse } from '../types';
import { commLog } from './logger';
import type { PeerHttpUtil } from './PeerHttpUtil';

// 通话状态
export type CallState = 'idle' | 'calling' | 'incall' | 'ended';

// 通话类型
export type CallType = 'audio' | 'video' | 'data_channel';

// 通话事件类型
export type CallEventType = 'incoming' | 'accepted' | 'rejected' | 'ended' | 'error';

// 通话事件
export interface CallEvent {
  type: CallEventType;
  peerId: string;
  callType: CallType;
  timestamp: number;
  error?: string;
}

// ICE 候选信息
export interface IceCandidateInfo {
  candidate: RTCIceCandidateInit;
  peerId: string;
}

class CallManager {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentPeerId: string | null = null;
  private currentCallType: CallType = 'audio';
  private callState: CallState = 'idle';

  private configuration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // 待发送的 ICE 候选（在连接建立前收集）
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  // 当前会话的 requestId
  private currentRequestId: string | null = null;

  /**
   * 发起通话请求
   */
  async initiateCall(
    peerId: string,
    callType: CallType,
    peerHttpUtil: PeerHttpUtil
  ): Promise<void> {
    console.log('[CallManager] Initiating call:', { peerId, callType });
    commLog.info(`Initiating ${callType} call to ${peerId.substring(0, 8)}...`);

    if (this.callState !== 'idle') {
      throw new Error('Already in a call');
    }

    this.currentPeerId = peerId;
    this.currentCallType = callType;
    this.callState = 'calling';
    this.pendingIceCandidates = [];

    try {
      if (callType === 'data_channel') {
        await this.initiateDataChannelCall(peerId, peerHttpUtil);
      } else {
        await this.initiateMediaStreamCall(peerId, callType, peerHttpUtil);
      }
    } catch (error) {
      console.error('[CallManager] Failed to initiate call:', error);
      this.cleanup();
      this.callState = 'idle';
      throw error;
    }
  }

  /**
   * 发起 MediaStream 通话
   */
  private async initiateMediaStreamCall(
    peerId: string,
    callType: 'audio' | 'video',
    peerHttpUtil: PeerHttpUtil
  ): Promise<void> {
    // 获取本地媒体流
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video',
    });

    // 设置本地视频
    if (this.onLocalStream) {
      this.onLocalStream(this.localStream);
    }

    // 创建 RTCPeerConnection
    this.peerConnection = new RTCPeerConnection(this.configuration);

    // 监听 ICE 候选
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[CallManager] ICE candidate generated:', event.candidate);
        this.handleIceCandidate(event.candidate, peerId, peerHttpUtil);
      }
    };

    // 监听连接状态
    this.peerConnection.onconnectionstatechange = () => {
      console.log('[CallManager] Connection state:', this.peerConnection?.connectionState);
      if (this.peerConnection?.connectionState === 'disconnected') {
        console.warn('[CallManager] Connection disconnected');
        this.hangup();
      }
    };

    // 监听远程流
    this.peerConnection.ontrack = (event) => {
      console.log('[CallManager] Received remote track:', event.track.kind);
      const stream = event.streams[0];
      if (stream) {
        this.remoteStream = stream;
        if (this.onRemoteStream) {
          this.onRemoteStream(stream);
        }
      }
    };

    // 添加本地流
    this.localStream.getTracks().forEach((track) => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    // 创建 offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    console.log('[CallManager] Local description set');

    // 发送通话请求
    try {
      const rrManager = peerHttpUtil.getRRManager();
      const response = await rrManager.sendRequest<any>(
        peerId,
        'call_request',
        {
          callType,
          offer,
        },
        30000 // 30秒超时
      ) as CallResponse;

      if (response?.accepted && response?.answer) {
        console.log('[CallManager] Call accepted');
        await this.handleAnswer(response.answer);
      } else {
        throw new Error('Call rejected');
      }
    } catch (error) {
      console.error('[CallManager] Failed to send call request:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * 发起 Data Channel 通话
   */
  private async initiateDataChannelCall(
    peerId: string,
    peerHttpUtil: PeerHttpUtil
  ): Promise<void> {
    console.log('[CallManager] Initiating data channel call');

    // 创建 RTCPeerConnection
    this.peerConnection = new RTCPeerConnection(this.configuration);

    // 创建 Data Channel
    this.dataChannel = this.peerConnection.createDataChannel('voice-call', {
      ordered: false,
    });

    this.setupDataChannel();

    // 监听 ICE 候选
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[CallManager] ICE candidate generated:', event.candidate);
        this.handleIceCandidate(event.candidate, peerId, peerHttpUtil);
      }
    };

    // 创建 offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // 发送通话请求
    try {
      const rrManager = peerHttpUtil.getRRManager();
      const response = await rrManager.sendRequest<any>(
        peerId,
        'call_request',
        {
          callType: 'data_channel',
          offer,
        },
        30000
      ) as CallResponse;

      if (response?.accepted && response?.answer) {
        await this.handleAnswer(response.answer);
      } else {
        throw new Error('Call rejected');
      }
    } catch (error) {
      console.error('[CallManager] Failed to send data channel call request:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * 接听通话
   */
  async answerCall(
    peerId: string,
    offer: RTCSessionDescriptionInit,
    callType: CallType,
    peerHttpUtil: PeerHttpUtil
  ): Promise<void> {
    console.log('[CallManager] Answering call:', { peerId, callType });

    if (this.callState !== 'idle') {
      throw new Error('Already in a call');
    }

    this.currentPeerId = peerId;
    this.currentCallType = callType;
    this.callState = 'incall';
    this.pendingIceCandidates = [];

    try {
      if (callType === 'data_channel') {
        await this.answerDataChannelCall(peerId, offer, peerHttpUtil);
      } else {
        await this.answerMediaStreamCall(peerId, offer, callType, peerHttpUtil);
      }
    } catch (error) {
      console.error('[CallManager] Failed to answer call:', error);
      this.cleanup();
      this.callState = 'idle';
      throw error;
    }
  }

  /**
   * 接听 MediaStream 通话
   */
  private async answerMediaStreamCall(
    peerId: string,
    offer: RTCSessionDescriptionInit,
    callType: 'audio' | 'video',
    peerHttpUtil: PeerHttpUtil
  ): Promise<void> {
    // 获取本地媒体流
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video',
    });

    // 设置本地视频
    if (this.onLocalStream) {
      this.onLocalStream(this.localStream);
    }

    // 创建 RTCPeerConnection
    this.peerConnection = new RTCPeerConnection(this.configuration);

    // 监听 ICE 候选
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[CallManager] ICE candidate generated:', event.candidate);
        this.handleIceCandidate(event.candidate, peerId, peerHttpUtil);
      }
    };

    // 监听连接状态
    this.peerConnection.onconnectionstatechange = () => {
      console.log('[CallManager] Connection state:', this.peerConnection?.connectionState);
      if (this.peerConnection?.connectionState === 'disconnected') {
        console.warn('[CallManager] Connection disconnected');
        this.hangup();
      }
    };

    // 监听远程流
    this.peerConnection.ontrack = (event) => {
      console.log('[CallManager] Received remote track:', event.track.kind);
      const stream = event.streams[0];
      if (stream) {
        this.remoteStream = stream;
        if (this.onRemoteStream) {
          this.onRemoteStream(stream);
        }
      }
    };

    // 添加本地流
    this.localStream.getTracks().forEach((track) => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    // 设置远程描述
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    console.log('[CallManager] Remote description set');

    // 创建 answer
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    console.log('[CallManager] Local description set');

    // 发送响应
    try {
      const rrManager = peerHttpUtil.getRRManager();
      await rrManager.sendRequest(
        peerId,
        'call_response',
        {
          accepted: true,
          answer,
        }
      );
    } catch (error) {
      console.error('[CallManager] Failed to send answer:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * 接听 Data Channel 通话
   */
  private async answerDataChannelCall(
    peerId: string,
    offer: RTCSessionDescriptionInit,
    peerHttpUtil: PeerHttpUtil
  ): Promise<void> {
    console.log('[CallManager] Answering data channel call');

    // 创建 RTCPeerConnection
    this.peerConnection = new RTCPeerConnection(this.configuration);

    // 监听 Data Channel
    this.peerConnection.ondatachannel = (event) => {
      console.log('[CallManager] Data channel received');
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };

    // 监听 ICE 候选
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[CallManager] ICE candidate generated:', event.candidate);
        this.handleIceCandidate(event.candidate, peerId, peerHttpUtil);
      }
    };

    // 设置远程描述
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // 创建 answer
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    // 发送响应
    try {
      const rrManager = peerHttpUtil.getRRManager();
      await rrManager.sendRequest(
        peerId,
        'call_response',
        {
          accepted: true,
          answer,
        }
      );
    } catch (error) {
      console.error('[CallManager] Failed to send data channel answer:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * 处理响应
   */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('No active peer connection');
    }
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('[CallManager] Remote description set');
    this.callState = 'incall';

    // 发送待处理的 ICE 候选
    if (this.onIceCandidate && this.currentPeerId) {
      for (const candidate of this.pendingIceCandidates) {
        this.onIceCandidate({ candidate, peerId: this.currentPeerId });
      }
      this.pendingIceCandidates = [];
    }
  }

  /**
   * 处理 ICE 候选
   */
  private handleIceCandidate(
    candidate: RTCIceCandidate,
    peerId: string,
    peerHttpUtil: PeerHttpUtil
  ): void {
    if (this.callState === 'calling' || this.callState === 'incall') {
      if (this.onIceCandidate) {
        this.onIceCandidate({ candidate, peerId });
      } else {
        // 存储待发送的候选
        this.pendingIceCandidates.push(candidate);
      }
    }
  }

  /**
   * 添加 ICE 候选
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      console.warn('[CallManager] No peer connection to add ICE candidate');
      return;
    }

    // 等待远程描述设置完成
    if (this.peerConnection.remoteDescription === null) {
      console.log('[CallManager] Waiting for remote description before adding ICE candidate');
      // 存储候选，稍后添加
      this.pendingIceCandidates.push(candidate);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[CallManager] ICE candidate added successfully');
    } catch (error) {
      console.error('[CallManager] Error adding ICE candidate:', error);
    }
  }

  /**
   * 设置 Data Channel
   */
  private setupDataChannel(): void {
    if (!this.dataChannel) {
      return;
    }

    this.dataChannel.onopen = () => {
      console.log('[CallManager] Data channel opened');
      if (this.onDataChannelOpen) {
        this.onDataChannelOpen();
      }
    };

    this.dataChannel.onmessage = (event) => {
      console.log('[CallManager] Data channel message:', event.data);
      if (this.onDataChannelMessage) {
        this.onDataChannelMessage(event.data);
      }
    };

    this.dataChannel.onclose = () => {
      console.log('[CallManager] Data channel closed');
    };
  }

  /**
   * 通过 Data Channel 发送数据
   */
  sendDataChannelData(data: string | ArrayBuffer | Blob): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      if (typeof data === 'string') {
        this.dataChannel.send(data);
      } else {
        this.dataChannel.send(data as ArrayBuffer);
      }
    } else {
      console.warn('[CallManager] Data channel not ready');
    }
  }

  /**
   * 挂断通话
   */
  async hangup(): Promise<void> {
    console.log('[CallManager] Hanging up');
    this.cleanup();
    this.callState = 'ended';
    if (this.onCallEnded) {
      this.onCallEnded();
    }
    // 重置状态
    setTimeout(() => {
      this.callState = 'idle';
    }, 100);
  }

  /**
   * 拒绝通话
   */
  async rejectCall(peerId: string, peerHttpUtil: any): Promise<void> {
    console.log('[CallManager] Rejecting call from:', peerId);
    try {
      const rrManager = peerHttpUtil.getRRManager();
      await rrManager.sendRequest(
        peerId,
        'call_response',
        {
          accepted: false,
        }
      );
    } catch (error) {
      console.error('[CallManager] Failed to send rejection:', error);
    }
  }

  /**
   * 切换静音
   */
  toggleMute(): boolean {
    if (!this.localStream) {
      return false;
    }
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled;
    }
    return false;
  }

  /**
   * 切换视频
   */
  toggleVideo(): boolean {
    if (!this.localStream) {
      return false;
    }
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled;
    }
    return false;
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    this.remoteStream = null;
    this.currentPeerId = null;
    this.currentCallType = 'audio';
    this.pendingIceCandidates = [];
    this.currentRequestId = null;
  }

  /**
   * 获取本地流
   */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * 获取远程流
   */
  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * 是否在通话中
   */
  isInCall(): boolean {
    return this.callState === 'incall';
  }

  /**
   * 获取当前通话状态
   */
  getCallState(): CallState {
    return this.callState;
  }

  /**
   * 获取当前通话的 PeerId
   */
  getCurrentPeerId(): string | null {
    return this.currentPeerId;
  }

  /**
   * 获取当前通话类型
   */
  getCurrentCallType(): CallType {
    return this.currentCallType;
  }

  // 事件回调
  onRemoteStream?: (stream: MediaStream) => void;
  onLocalStream?: (stream: MediaStream) => void;
  onCallEnded?: () => void;
  onIceCandidate?: (info: IceCandidateInfo) => void;
  onDataChannelOpen?: () => void;
  onDataChannelMessage?: (data: string | ArrayBuffer) => void;
  onIncomingCall?: (event: CallEvent) => void;
}

export const callManager = new CallManager();
