"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Phone, PhoneOff, CircleDot, AlertCircle, CheckCircle, Play, Pause, Download } from 'lucide-react';
import { maskPhoneNumber } from '@/function/index';
import Script from 'next/script';

export default function CallComponent({ customer, user }) {
    // ===== STATE MANAGEMENT =====
    
    // Connection & Call State
    const [connectionStatus, setConnectionStatus] = useState({ 
        status: 'disconnected', 
        text: 'Chưa kết nối' 
    });
    const [callStage, setCallStage] = useState('idle'); // idle | connecting | ringing | in_call
    const [statusText, setStatusText] = useState('Sẵn sàng để gọi');
    const [durationText, setDurationText] = useState('00:00');
    const [isRecording, setIsRecording] = useState(false);
    
    // Modal & History State
    const [isPostCallModalOpen, setIsPostCallModalOpen] = useState(false);
    const [lastCallInfo, setLastCallInfo] = useState(null);
    const [callHistory, setCallHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    
    // ===== REFS =====
    
    // SDK & Media Refs
    const sdkRef = useRef(null);
    const socketRef = useRef(null);
    const callIdRef = useRef(null);
    const currentCallRef = useRef(null);
    const remoteAudioRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    
    // Recording Refs
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const mixedCtxRef = useRef(null);
    const mixedDestRef = useRef(null);
    
    // Anti-duplicate Refs
    const endedOnceRef = useRef(false);
    const recordingStopOnceRef = useRef(false);
    const modalShownRef = useRef(false);
    const playbackReadyRef = useRef(false);
    const playbackCtxRef = useRef(null);
    // Watchdog timers to avoid stuck states
    const connectTimeoutRef = useRef(null);
    const ringingTimeoutRef = useRef(null);
    
    // Duration & Info Refs
    const lastEndInfoRef = useRef({ statusCode: null, by: null });
    const lastDurationSecRef = useRef(0);
    const acceptedAtRef = useRef(0);
    
    // ===== CONFIGURATION =====
    const hotlineNumber = '842471238879'; // Số hotline của bạn
    
    // ===== HELPER FUNCTIONS =====
    
    // Parse duration từ "MM:SS" hoặc "HH:MM:SS" → seconds
    const hhmmssToSec = (txt = '00:00') => {
        const parts = String(txt).split(':').map(n => Number(n) || 0);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return 0;
    };
    
    // Map SIP status code to call status
    const toCallStatus = (statusCode, durationSec) => {
        if (durationSec === 0) {
            if (statusCode === 486) return 'busy';
            else if (statusCode === 603) return 'rejected';
            else if (statusCode === 480 || statusCode === 408) return 'no_answer';
            else if (statusCode === 487) return 'missed';
            else return 'failed';
        }
        return 'completed';
    };
    
    // Reset flags cho mỗi cuộc gọi
    const resetPerCallFlags = () => {
        endedOnceRef.current = false;
        recordingStopOnceRef.current = false;
        modalShownRef.current = false;
        lastEndInfoRef.current = { statusCode: null, by: null };
    };
    
    const clearCallTimers = () => {
        if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
        }
        if (ringingTimeoutRef.current) {
            clearTimeout(ringingTimeoutRef.current);
            ringingTimeoutRef.current = null;
        }
    };

    const resetUIToIdle = () => {
        clearCallTimers();
        currentCallRef.current = null;
        setCallStage('idle');
        setStatusText('Sẵn sàng để gọi');
        setDurationText('00:00');
        setIsRecording(false);
        endedOnceRef.current = false;
        recordingStopOnceRef.current = false;
        modalShownRef.current = false;
        playbackReadyRef.current = false;
        lastDurationSecRef.current = 0;
        acceptedAtRef.current = 0;
    };
    
    // ===== SDK INITIALIZATION =====
    
    const initializeSDK = async () => {
        try {
            
            // Kiểm tra nếu SDK đã tồn tại
            if (window.OMICallSDK && sdkRef.current) {
                 await handleSDKLoad();
                return;
            }
            
            // Nếu SDK chưa tồn tại, load script
            if (!window.OMICallSDK) {
               
                const script = document.createElement('script');
                script.src = 'https://cdn.omicrm.com/sdk/web/3.0.0/core.min.js';
                script.onload = handleSDKLoad;
                script.onerror = () => {
                    console.error('[CallComponent] Failed to load SDK script');
                    setConnectionStatus({ status: 'disconnected', text: 'Lỗi tải SDK' });
                };
                document.head.appendChild(script);
            } else {
                await handleSDKLoad();
            }
            
        } catch (err) {
            console.error('[CallComponent] SDK init ERROR:', err);
            setConnectionStatus({ status: 'disconnected', text: 'Lỗi khởi tạo' });
            toast.error('Không thể khởi tạo OMI Call SDK');
        }
    };
    
    // Initialize Socket.IO connection
    const initializeSocket = useCallback(() => {
        try {
            // Nếu socket đã tồn tại và connected, không tạo mới
            if (socketRef.current && socketRef.current.connected) {
               
                return;
            }
            
            // Nếu socket tồn tại nhưng disconnected, disconnect trước
            if (socketRef.current) {
               
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            
            // Import socket.io-client dynamically
            import('socket.io-client').then(({ io }) => {
                const socket = io('http://localhost:3001', {
                    path: '/socket.io',
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000,
                });
                
                socket.on('connect', () => {
                    
                    socketRef.current = socket;
                });
                
                socket.on('disconnect', (reason) => {
                   
                    socketRef.current = null;
                });
                
                socket.on('connect_error', (error) => {
                    console.error('[CallComponent] Socket connection error:', error);
                });

                // Lắng nghe trạng thái cuộc gọi từ client khác (đồng bộ)
                socket.on('call:status', (data) => {
                    console.log('[CallComponent] Received call:status from other client:', data);
                    // Chỉ cập nhật UI nếu không phải cuộc gọi của mình
                    if (data.by !== socket.id) {
                        // Có thể hiển thị thông báo có client khác đang gọi
                        console.log('Another client is making a call:', data);
                    }
                });

                socket.on('call:ended', (data) => {
                    
                    // Xử lý cuộc gọi kết thúc từ server
                    if (data.callId === callIdRef.current) {
                        
                        // Force cleanup and reset UI
                        cleanupAudioResources();
                        resetUIToIdle();
                    } else if (data.by !== socket.id) {
                        console.log('Another client ended a call:', data);
                    }
                });

                socket.on('call:error', (data) => {
                   
                    // Có thể hiển thị thông báo lỗi từ client khác
                    if (data.by !== socket.id) {
                        console.log('Another client had a call error:', data);
                    }
                });
                
                // Handle graceful cleanup on page unload
                const handleBeforeUnload = () => {
                   
                    if (currentCallRef.current) {
                        // End current call if any
                        console.log('[CallComponent] Ending current call due to new call from other client');
                    }
                };
                
                window.addEventListener('beforeunload', handleBeforeUnload);
                
                // Store cleanup function
                socket._cleanup = () => {
                    window.removeEventListener('beforeunload', handleBeforeUnload);
                };
                
            }).catch(error => {
                console.error('[CallComponent] Failed to load socket.io-client:', error);
            });
        } catch (error) {
            console.error('[CallComponent] Socket initialization error:', error);
        }
    }, []);
    
    // ===== SIP CONNECTION =====
    
    const connectToServer = async () => {
        try {
            setConnectionStatus({ status: 'connecting', text: 'Đang kết nối...' });
            
            // Nếu đã connected, không cần reconnect
            if (connectionStatus.status === 'connected') {
                return;
            }
            
            const registerStatus = await sdkRef.current.register({
                sipRealm: 'info268',
                sipUser: '100',
                sipPassword: 'Ws9nsNEClG',
            });
            
            setConnectionStatus({ status: 'connected', text: 'Đã kết nối' });
            
        } catch (err) {
            console.error('[CallComponent] connectToServer ERROR:', err);
            setConnectionStatus({ status: 'disconnected', text: 'Kết nối thất bại' });
            toast.error('Kết nối tổng đài thất bại. Vui lòng thử lại.');
        }
    };
    
    // ===== EVENT LISTENERS =====
    
    const setupEventListeners = useCallback(() => {
        
        const sdk = sdkRef.current;
        if (!sdk) {
            console.error('[CallComponent] No SDK available for event listeners');
            return;
        }
        
        // Kết nối tổng đài
        sdk.on('register', (data) => {
            const statusMap = {
                connected: { status: 'connected', text: 'Đã kết nối' },
                connecting: { status: 'connecting', text: 'Đang kết nối...' },
                disconnect: { status: 'disconnected', text: 'Mất kết nối' }
            };
            const status = statusMap[data?.status] || { status: 'disconnected', text: 'Chưa kết nối' };
            setConnectionStatus(status);
            
            if (status.status === 'connected') {
                toast.success('Đã kết nối tổng đài');
            } else if (status.status === 'disconnected') {
                toast.error('Mất kết nối tổng đài');
            }
        });
        
        // Chuỗi sự kiện cuộc gọi
        sdk.on('connecting', (callData) => {
            resetPerCallFlags();
            currentCallRef.current = callData;
            // Set callId for server communication
            callIdRef.current = callData?.callId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            setCallStage('connecting');
            setStatusText('Đang kết nối...');
            setDurationText('00:00');
            lastDurationSecRef.current = 0;
            acceptedAtRef.current = 0;
            
            // Notify server about call start
            if (socketRef.current && !socketRef.current.disconnected) {
                 socketRef.current.emit('call:start', {
                    phoneNumber: customer?.phone,
                    customerId: customer?._id
                });
            }
        });
        
        sdk.on('ringing', (callData) => {
            currentCallRef.current = callData;
            setCallStage('ringing');
            setStatusText('Đang đổ chuông...');
        });
        
        sdk.on('accepted', (callData) => {
            onAccepted(callData);
        });
        
        sdk.on('on_calling', (callData) => {
            const text = callData?.callingDuration?.text || '00:00';
            setDurationText(text);
            lastDurationSecRef.current = hhmmssToSec(text);
        });
        
        sdk.on('ended', (info) => {
           onEnded(info);
        });
        
        // Cleanup function
        return () => {
            console.log('[CallComponent] Cleaning up event listeners...');
            // SDK events sẽ tự động cleanup khi component unmount
        };
    }, []);
    
    // Handle call events
    const handleCallEvent = useCallback((event, data) => {
       
        switch (event) {
            case 'connecting':
                console.log('[CallComponent] Connecting event:', data);
                resetPerCallFlags();
                currentCallRef.current = data;
                setCallStage('connecting');
                setStatusText('Đang kết nối...');
                setDurationText('00:00');
                lastDurationSecRef.current = 0;
                acceptedAtRef.current = 0;
                break;
                
            case 'ringing':
                console.log('[CallComponent] Ringing event:', data);
                currentCallRef.current = data;
                setCallStage('ringing');
                setStatusText('Đang đổ chuông...');
                break;
                
            case 'accepted':
                console.log('[CallComponent] Accepted event:', data);
                clearCallTimers();
                onAccepted(data);
                break;
                
            case 'on_calling':
                const text = data?.callingDuration?.text || '00:00';
                setDurationText(text);
                lastDurationSecRef.current = hhmmssToSec(text);
                break;
                
            case 'ended':
                console.log('[CallComponent] Ended event:', data);
                clearCallTimers();
                onEnded(data);
                break;
                
            case 'idle':
                console.log('[CallComponent] Idle event:', data);
                setCallStage('idle');
                setStatusText('Sẵn sàng để gọi');
                setDurationText('00:00');
                setIsRecording(false);
                break;
                
            default:
                console.log('[CallComponent] Unknown event:', event);
                break;
        }
    }, []);
    
    // ===== CALL FLOW HANDLERS =====
    
    const onAccepted = (callData) => {
       
        currentCallRef.current = callData;
        setCallStage('in_call');
        setStatusText('Đang trong cuộc gọi');
        acceptedAtRef.current = Date.now();
        
        // Lưu audio streams
        localStreamRef.current = callData?.streams?.local || null;
        remoteStreamRef.current = callData?.streams?.remote || null;
        
        // Phát audio remote
        ensureRemotePlayback(remoteStreamRef.current);
        
        // Bắt đầu ghi âm
        startRecording();
    };
    
    const onEnded = (info) => {
        if (endedOnceRef.current) return; // Chống trùng
        endedOnceRef.current = true;
        
        // Lưu thông tin kết thúc
        const code = info?.statusCode ?? info?.code ?? info?.reasonCode ?? null;
        lastEndInfoRef.current = { statusCode: code, by: info?.by };
        
        // Reset UI
        setCallStage('idle');
        setStatusText('Sẵn sàng để gọi');
        
        // Dừng ghi âm và mở popup
        stopRecording();
        currentCallRef.current = null;
        
        // ✅ CLEANUP QUAN TRỌNG!
        cleanupAudioResources();
        
        // Reset state sau 2s
        setTimeout(() => {
            endedOnceRef.current = false;
            recordingStopOnceRef.current = false;
            modalShownRef.current = false;
            playbackReadyRef.current = false;
            lastDurationSecRef.current = 0;
            acceptedAtRef.current = 0;
        }, 2000);
    };
    
    // ===== AUDIO HANDLING =====
    
    const ensureRemotePlayback = async (stream) => {
        const el = remoteAudioRef.current;
        if (!el || !stream) return;
        
        // Reset audio element
        el.pause();
        el.currentTime = 0;
        el.srcObject = null;
        
        // Gán stream mới
        el.srcObject = stream;
        el.autoplay = true;
        el.volume = 1.0;
        
        // Resume AudioContext nếu cần
        if (mixedCtxRef.current && mixedCtxRef.current.state === 'suspended') {
            await mixedCtxRef.current.resume();
        }
        
        // Thử play với retry
        for (let i = 0; i < 4; i++) {
            try {
                await el.play();
                playbackReadyRef.current = true;
                break;
            } catch {
                await new Promise(r => setTimeout(r, 300));
            }
        }
    };
    
    // ===== RECORDING =====
    
    const startRecording = () => {
        try {
           
            // ✅ TẠO AUDIO CONTEXT MỚI CHO MỖI CUỘC GỌI
            if (mixedCtxRef.current && mixedCtxRef.current.state !== 'closed') {
                mixedCtxRef.current.close();
            }
            mixedCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            
            // Tạo destination để mix streams
            mixedDestRef.current = mixedCtxRef.current.createMediaStreamDestination();
            
            // Kết nối local stream
            if (localStreamRef.current) {
                const localSrc = mixedCtxRef.current.createMediaStreamSource(localStreamRef.current);
                localSrc.connect(mixedDestRef.current);
            }
            
            // Kết nối remote stream
            if (remoteStreamRef.current) {
                const remoteSrc = mixedCtxRef.current.createMediaStreamSource(remoteStreamRef.current);
                remoteSrc.connect(mixedDestRef.current);
            }
            
            // Bắt đầu ghi âm
            recordedChunksRef.current = [];
            mediaRecorderRef.current = new MediaRecorder(mixedDestRef.current.stream, { 
                mimeType: 'audio/webm;codecs=opus' 
            });
            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data?.size > 0) recordedChunksRef.current.push(e.data);
            };
            mediaRecorderRef.current.start();
            setIsRecording(true);
            
           
        } catch (err) {
            console.error('❌ Recording start ERROR:', err);
            toast.error('Không thể bắt đầu ghi âm');
        }
    };
    
    const stopRecording = () => {
        if (recordingStopOnceRef.current) return;
        recordingStopOnceRef.current = true;
        
        const rec = mediaRecorderRef.current;
        if (rec && rec.state === 'recording') {
            rec.onstop = () => {
                // Tính duration
                const sdkSec = lastDurationSecRef.current || 0;
                const fallbackSec = acceptedAtRef.current ? 
                    Math.max(0, Math.floor((Date.now() - acceptedAtRef.current) / 1000)) : 0;
                const durationSec = sdkSec || fallbackSec;
                
                // Tạo file audio
                const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
                const fileName = `rec-${customer?.phone}-${new Date().toISOString()}.webm`;
                
                // Lưu thông tin cuộc gọi
                setLastCallInfo({
                    file: new File([blob], fileName, { type: 'audio/webm' }),
                    name: fileName,
                    durationText: new Date(durationSec * 1000).toISOString().substr(14, 5),
                    durationSec,
                    startTime: new Date(Date.now() - durationSec * 1000),
                    sipStatusCode: lastEndInfoRef.current?.statusCode,
                    callStatus: toCallStatus(lastEndInfoRef.current?.statusCode, durationSec),
                });
                
                // Mở popup lưu kết quả
                setIsPostCallModalOpen(true);
            };
            rec.stop();
        }
    };
    
    // ===== CLEANUP AUDIO RESOURCES (CHÌA KHÓA THÀNH CÔNG) =====
    
    const cleanupAudioResources = () => {
        try {
            // 1. Stop MediaRecorder
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            mediaRecorderRef.current = null;
            recordedChunksRef.current = [];
            
            // 2. Stop tất cả audio tracks
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
                localStreamRef.current = null;
            }
            
            if (remoteStreamRef.current) {
                remoteStreamRef.current.getTracks().forEach(track => track.stop());
                remoteStreamRef.current = null;
            }
            
            // 3. Close AudioContext
            if (mixedCtxRef.current && mixedCtxRef.current.state !== 'closed') {
                mixedCtxRef.current.close();
                mixedCtxRef.current = null;
            }
            mixedDestRef.current = null;
            
            // 4. Reset audio element
            if (remoteAudioRef.current) {
                remoteAudioRef.current.pause();
                remoteAudioRef.current.currentTime = 0;
                remoteAudioRef.current.srcObject = null;
            }
            
            // 5. Reset playback state
            playbackReadyRef.current = false;
            playbackCtxRef.current = null;
            
        } catch (err) {
            console.error('Cleanup error:', err);
        }
    };
    
    // ===== CALL ACTIONS =====
    
    const makeCall = async () => {
        // 1. Kiểm tra kết nối
        if (connectionStatus.status !== 'connected') return;
        
        // 2. Kiểm tra cuộc gọi hiện tại
        if (currentCallRef.current) return;
        
        // 3. CLEANUP TRƯỚC KHI GỌI MỚI (QUAN TRỌNG!)
        cleanupAudioResources();
        
        // 4. Reset state
        endedOnceRef.current = false;
        recordingStopOnceRef.current = false;
        modalShownRef.current = false;
        
        // 5. Yêu cầu quyền microphone
        await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        
        // 6. Thực hiện cuộc gọi
        await sdkRef.current.makeCall(customer?.phone, {
            isVideo: false,
            sipNumber: { number: hotlineNumber },
            userData: `Gọi từ web app - ${new Date().toLocaleString('vi-VN')}`
        });
    };
    
    const endCall = async () => {
        
        try {
            // 1. Clear timers trước
            clearCallTimers();
            
            // 2. End call through current call object
            if (currentCallRef.current) {
                
                // Gọi method end() của call object hiện tại
                if (typeof currentCallRef.current.end === 'function') {
                    currentCallRef.current.end();
                } else {
                    console.warn('[CallComponent] currentCallRef.current.end() not available');
                    console.log('[CallComponent] currentCallRef.current:', currentCallRef.current);
                    console.log('[CallComponent] Available methods:', Object.getOwnPropertyNames(currentCallRef.current));
                }
                
                console.log('[CallComponent] Call end signal sent');
            }
            
            // 3. Broadcast kết thúc cuộc gọi đến server
            if (socketRef.current && !socketRef.current.disconnected) {
                console.log('[CallComponent] Broadcasting call end to server...');
                socketRef.current.emit('call:end', {
                    callId: callIdRef.current,
                    customerId: customer?._id,
                    reason: 'user_ended',
                    timestamp: new Date().toISOString()
                });
            }
            
            // 4. Force cleanup audio resources
            cleanupAudioResources();
            
            // 5. Reset UI
            resetUIToIdle();
            
            
        } catch (error) {
            console.error('[CallComponent] Error ending call:', error);
            
            // Force cleanup even if there's an error
            cleanupAudioResources();
            resetUIToIdle();
        }
    };
    
    // ===== POST CALL MODAL =====
    
    const handleSaveCall = async () => {
        if (!lastCallInfo) return;
        
        try {
            const formData = new FormData();
            formData.append('customerId', customer._id);
            formData.append('userId', user[0]._id);
            formData.append('callStatus', lastCallInfo.callStatus);
            formData.append('duration', lastCallInfo.durationSec);
            formData.append('startTime', lastCallInfo.startTime.toISOString());
            formData.append('sipStatusCode', lastCallInfo.sipStatusCode);
            formData.append('recordingFile', lastCallInfo.file);
            formData.append('recordingFileName', lastCallInfo.name);
            
            const response = await fetch('/api/calls', {
                method: 'POST',
                body: formData,
            });
            
            const result = await response.json();
            
            if (result.success) {
                toast.success('Lưu cuộc gọi thành công!');
                setIsPostCallModalOpen(false);
                setLastCallInfo(null);
                // Refresh call history
                loadCallHistory();
            } else {
                toast.error(result.error || 'Lỗi khi lưu cuộc gọi');
            }
            
        } catch (error) {
            console.error('Save call error:', error);
            toast.error('Lỗi khi lưu cuộc gọi');
        }
    };
    
    // ===== CALL HISTORY =====
    
    const loadCallHistory = async () => {
        if (!customer?._id) return;
        
        try {
            setHistoryLoading(true);
            const response = await fetch(`/api/calls?customerId=${customer._id}`);
            const data = await response.json();
            
            if (data.success) {
                setCallHistory(data.calls || []);
            }
        } catch (error) {
            console.error('Load call history error:', error);
        } finally {
            setHistoryLoading(false);
        }
    };
    
    // ===== SDK LOADING =====
    
    const handleSDKLoad = async () => {
         try {
            // Nếu SDK đã được init, chỉ cần reconnect
            if (sdkRef.current) {
                await connectToServer();
                return;
            }
            
            // Initialize SDK với UI ẩn
            await window.OMICallSDK.init({ 
                lng: 'vi', 
                ui: { toggleDial: 'hide' }, 
                ringtoneVolume: 0.9 
            });
            
            sdkRef.current = window.OMICallSDK;
            
            // Setup event listeners
            setupEventListeners();
            
            // Connect to server
            await connectToServer();
            
        } catch (error) {
            console.error('[CallComponent] ❌ SDK initialization failed:', error);
            setConnectionStatus({ status: 'disconnected', text: 'Lỗi khởi tạo SDK' });
        }
    };
    
    // ===== FORCE RE-INITIALIZATION =====
    
    const forceReinitialize = async () => {
        
        // Cleanup existing connections
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        
        // Reset connection status
        setConnectionStatus({ status: 'disconnected', text: 'Đang khởi tạo lại...' });
        
        // Re-initialize
        await initializeSocket();
        await initializeSDK();
    };
    
    // ===== INITIALIZATION & CLEANUP =====
    
    useEffect(() => {
       
        // Initialize Socket.IO first
        initializeSocket();
        
        // Initialize SDK
        initializeSDK();
        
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            // Cleanup audio resources
            cleanupAudioResources();
        };
    }, []);
    
    // Load call history when customer changes - TEMPORARILY DISABLED
    // useEffect(() => {
    //     if (customer?._id) {
    //         loadCallHistory();
    //     }
    // }, [customer?._id]);
    
    // Sync với SDK state khi component mount lại
    useEffect(() => {
        const syncWithSDK = () => {
            try {
                // SDK sẽ được sync qua event listeners
                console.log('[CallComponent] SDK sync handled by event listeners');
            } catch (error) {
                console.error('[CallComponent] Error syncing with SDK:', error);
            }
        };
        
        // Sync ngay lập tức
        syncWithSDK();
        
        // Sync lại sau 100ms để đảm bảo
        const timeout = setTimeout(syncWithSDK, 100);
        
        return () => clearTimeout(timeout);
    }, []);
    
    // ===== UI RENDER =====
    
    return (
        <>
            <div className="p-4 max-w-3xl space-y-6">
                {/* Connection Status */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Trạng thái kết nối</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2 justify-center">
                            {connectionStatus.status === 'connected' && <CheckCircle className="h-5 w-5 text-green-500" />}
                            {connectionStatus.status === 'connecting' && <Loader2 className="h-5 w-5 animate-spin" />}
                            {connectionStatus.status === 'disconnected' && <AlertCircle className="h-5 w-5 text-red-500" />}
                            <span className="font-medium">{connectionStatus.text}</span>
                        </div>
                    </CardContent>
                </Card>
                
                {/* Call Controls */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Điều khiển cuộc gọi</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {/* Customer Info */}
                        <div className="text-center">
                            <div className="font-semibold">{customer?.name || 'Khách hàng'}</div>
                            <div className="text-sm text-muted-foreground">{maskPhoneNumber(customer?.phone) || 'Chưa có SĐT'}</div>
                        </div>
                        
                        {/* Call Button */}
                        <div className="pt-1">
                            {callStage === 'idle' ? (
                                <Button
                                    onClick={makeCall}
                                    disabled={connectionStatus.status !== 'connected' || !customer?.phone}
                                    className="w-full"
                                >
                                    <Phone className="mr-2 h-4 w-4" /> Gọi
                                </Button>
                            ) : (
                                <Button variant="destructive" onClick={endCall} className="w-full">
                                    <PhoneOff className="mr-2 h-4 w-4" /> Kết thúc
                                </Button>
                            )}
                        </div>
                        
                        {/* Reconnect Button */}
                        {connectionStatus.status === 'disconnected' && (
                            <div className="pt-2">
                                <Button
                                    onClick={forceReinitialize}
                                    variant="outline"
                                    className="w-full"
                                >
                                    <CircleDot className="mr-2 h-4 w-4" /> Kết nối lại
                                </Button>
                            </div>
                        )}
                        
                        {/* Call Status */}
                        {callStage !== 'idle' && (
                            <div className="text-center">
                                <div className="font-medium text-blue-600">{statusText}</div>
                                <div className="text-2xl font-mono tracking-wider mt-1">{durationText}</div>
                                {isRecording && (
                                    <div className="mt-2 inline-flex items-center gap-2 text-red-600">
                                        <CircleDot className="h-4 w-4 animate-pulse" />
                                        <span>Đang ghi âm…</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
                
                {/* Call History - TEMPORARILY DISABLED */}
                {/* <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Lịch sử cuộc gọi</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {historyLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                        ) : callHistory.length > 0 ? (
                            <div className="space-y-2">
                                {callHistory.map((call, index) => (
                                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                                        <div>
                                            <div className="font-medium">{call.status}</div>
                                            <div className="text-sm text-gray-600">
                                                {call.duration ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}` : '00:00'}
                                            </div>
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {new Date(call.createdAt).toLocaleString('vi-VN')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-4 text-gray-500">
                                Chưa có lịch sử cuộc gọi
                            </div>
                        )}
                    </CardContent>
                </Card> */}
            </div>
            
            {/* Hidden audio element for remote playback */}
            <audio ref={remoteAudioRef} playsInline style={{ display: 'none' }} />
            
            {/* Post Call Modal */}
            <Dialog open={isPostCallModalOpen} onOpenChange={setIsPostCallModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Kết quả cuộc gọi</DialogTitle>
                        <DialogDescription>
                            Cuộc gọi đã kết thúc. Vui lòng lưu thông tin.
                        </DialogDescription>
                    </DialogHeader>
                    
                    {lastCallInfo && (
                        <div className="space-y-4">
                            <div className="text-center">
                                <div className="text-lg font-semibold">Thời lượng: {lastCallInfo.durationText}</div>
                                <div className="text-sm text-gray-600">Trạng thái: {lastCallInfo.callStatus}</div>
                            </div>
                            
                            <div className="flex gap-2">
                                <Button onClick={handleSaveCall} className="flex-1">
                                    Lưu cuộc gọi
                                </Button>
                                <Button 
                                    variant="outline" 
                                    onClick={() => setIsPostCallModalOpen(false)}
                                    className="flex-1"
                                >
                                    Bỏ qua
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            
            {/* Load OMI Call SDK */}
            <Script
                id="omicall-sdk-script"
                src="https://cdn.omicrm.com/sdk/web/3.0.0/core.min.js"
                onLoad={handleSDKLoad}
                strategy="lazyOnload"
            />
        </>
    );
}
