"use client";

// ✅ SỬA LỖI: Thay đổi import từ 'react-dom' sang 'react' và đổi tên hook
import { useState, useEffect, useRef, useActionState } from 'react';
// useFormStatus vẫn ở trong react-dom
import { useFormStatus } from 'react-dom';
import Script from 'next/script';

// ShadCN UI & Lucide Icons
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Loader2, Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Pause, Play, Download, Trash2, Settings, CircleDot, AlertCircle, CheckCircle, PhoneOutgoing } from 'lucide-react';

import { maskPhoneNumber } from '@/function/index';
import { saveCallResultAction } from '@/data/customers/wraperdata.db';

// --- Constants & Helper Components ---
const CALL_STATUS_OPTIONS = [
    { value: 'consulted_pending_4', label: 'Đã tư vấn, chờ quyết định' },
    { value: 'callback_4', label: 'Yêu cầu gọi lại' },
    { value: 'not_interested_4', label: 'Không quan tâm' },
    { value: 'no_contact_4', label: 'Không liên lạc được' },
];

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu kết quả
        </Button>
    );
}

// --- Post Call Form Dialog Component ---
function PostCallFormDialog({ isOpen, onOpenChange, lastCallInfo, customer }) {
    const initialState = { success: false, error: null, message: null };
    // ✅ Đổi useFormState → useActionState
    const [state, formAction] = useActionState(saveCallResultAction, initialState);

    useEffect(() => {
        if (state.success) {
            console.info('[POST-CALL] Lưu kết quả thành công, đóng modal sau 1.5s');
            setTimeout(() => {
                onOpenChange(false);
            }, 1500);
        }
    }, [state.success, onOpenChange]);

    if (!isOpen || !lastCallInfo) return null;

    const handleFormSubmit = (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        if (lastCallInfo.file) {
            formData.append('recordingFile', lastCallInfo.file, lastCallInfo.name);
        }
        console.groupCollapsed('[POST-CALL] Submit form');
        console.info('[POST-CALL] customerId:', customer?._id);
        console.info('[POST-CALL] duration:', lastCallInfo.duration);
        console.info('[POST-CALL] startTime:', lastCallInfo.startTime);
        console.info('[POST-CALL] recordingFileName:', lastCallInfo.name);
        console.groupEnd();
        formAction(formData);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Cập nhật kết quả cuộc gọi</DialogTitle>
                    <DialogDescription>
                        Chọn trạng thái cho khách hàng <span className="font-bold">{customer.name}</span>.
                        Cuộc gọi kéo dài: {lastCallInfo.duration}.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleFormSubmit}>
                    <input type="hidden" name="customerId" value={customer._id} />
                    <input type="hidden" name="callDuration" value={lastCallInfo.duration} />
                    <input type="hidden" name="callStartTime" value={lastCallInfo.startTime.toISOString()} />
                    <input type="hidden" name="recordingFileName" value={lastCallInfo.name} />

                    <div className="py-4">
                        <RadioGroup name="status" defaultValue={CALL_STATUS_OPTIONS[0].value} className="space-y-3">
                            {CALL_STATUS_OPTIONS.map(opt => (
                                <div key={opt.value} className="flex items-center space-x-2">
                                    <RadioGroupItem value={opt.value} id={opt.value} />
                                    <Label htmlFor={opt.value} className="cursor-pointer">{opt.label}</Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    <DialogFooter>
                        <div className="w-full text-center mb-2 h-5">
                            {state.error && <p className="text-sm text-red-500">{state.error}</p>}
                            {state.message && <p className="text-sm text-green-500">{state.message}</p>}
                        </div>
                        <div className="flex w-full justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={state.success}>Hủy</Button>
                            <SubmitButton />
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// === Helper: Map SIP status → lý do dễ đọc ===
const mapEndReason = (code) => {
    if (!code) return 'completed';
    if (code === 486) return 'busy';         // Busy Here
    if (code === 603) return 'declined';     // Decline
    if (code === 480) return 'unavailable';  // Temporarily Unavailable
    if (code === 408) return 'timeout';      // Request Timeout
    if (code === 487) return 'cancelled';    // Request Terminated
    if (code >= 500 && code < 600) return 'server_error';
    if (code >= 400 && code < 500) return 'client_error';
    return 'completed';
};

// --- Main OMICall Client Component ---
export default function OMICallClient({ customer, user }) {
    const isSale = user?.role?.includes('Sale');

    // --- Common States ---
    const [connectionStatus, setConnectionStatus] = useState({ status: 'disconnected', text: 'Chưa kết nối' });
    const [callInfo, setCallInfo] = useState(null);
    const [callDuration, setCallDuration] = useState('00:00');
    const [isRecording, setIsRecording] = useState(false);

    // --- Sale Specific States ---
    const [isPostCallModalOpen, setIsPostCallModalOpen] = useState(false);
    const [lastCallInfo, setLastCallInfo] = useState(null);

    // --- Full UI Specific States ---
    const [sipUser, setSipUser] = useState('100'); // Lấy từ user prop nếu có
    const [hotlineNumber, setHotlineNumber] = useState('842471233474'); // Cấu hình chung
    const [phoneNumber, setPhoneNumber] = useState('');
    const [logs, setLogs] = useState([]);
    const [audioDevices, setAudioDevices] = useState({ microphones: [], speakers: [] });
    const [selectedMic, setSelectedMic] = useState('');
    const [selectedSpeaker, setSelectedSpeaker] = useState('');
    const [volume, setVolume] = useState(80);
    const [micGain, setMicGain] = useState(100);
    const [micLevel, setMicLevel] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isHeld, setIsHeld] = useState(false);
    const [isVideoOn, setIsVideoOn] = useState(false);
    const [recordings, setRecordings] = useState([]);
    const [recordingTime, setRecordingTime] = useState('00:00');

    // --- Call history (Sale only) ---
    const [callHistory, setCallHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState(null);

    // --- Common Refs ---
    const sdkRef = useRef(null);
    const currentCallRef = useRef(null);
    const callDurationIntervalRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const remoteAudioRef = useRef(null);

    // --- Flags/Payload để xác định ai gác máy & lý do ---
    const endedByRef = useRef(null);      // 'local' | 'remote' | 'system' | null
    const lastEndInfoRef = useRef(null);  // lưu payload 'ended' gần nhất (debug)

    // --- Full UI Specific Refs ---
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const micGainNodeRef = useRef(null);
    const audioMonitoringIntervalRef = useRef(null);
    const recordingTimerRef = useRef(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);

    // --- Logging (for Full UI) ---
    const log = (message, type = 'info') => {
        if (!isSale) {
            const timestamp = new Date().toLocaleTimeString();
            setLogs(prevLogs => [...prevLogs.slice(-49), { timestamp, message, type }]);
        }
    };

    // ====== SDK load & cleanup ======
    const handleSDKLoad = () => {
        console.info('[OMI] SDK script loaded');
        if (window.OMICallSDK) {
            initializeSDK();
        } else {
            console.error('[OMI] OMICall SDK not found on window object.');
        }
    };

    useEffect(() => {
        return () => {
            console.info('[OMI] Unmount cleanup');
            if (sdkRef.current && typeof sdkRef.current.destroy === 'function') {
                console.log('[OMI] Destroying SDK instance');
                sdkRef.current.destroy();
            }
            clearInterval(callDurationIntervalRef.current);
            clearInterval(audioMonitoringIntervalRef.current);
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
            const scriptElement = document.getElementById('omicall-sdk-script');
            if (scriptElement) document.body.removeChild(scriptElement);
        };
    }, []);

    const initializeSDK = async () => {
        console.groupCollapsed('[OMI] initializeSDK');
        try {
            console.info('[OMI] init() start');
            const initSuccess = await window.OMICallSDK.init({ lng: 'vi', ui: { toggleDial: 'hide' } });
            console.info('[OMI] init() result:', initSuccess);
            if (!initSuccess) throw new Error('SDK initialization failed');

            sdkRef.current = window.OMICallSDK;
            setupEventListeners();
            await connectToServer();
            if (!isSale) await initializeAudioDevices();
            console.info('[OMI] SDK initialized & connected');
        } catch (error) {
            console.error('[OMI] initializeSDK ERROR:', error);
            log(`Lỗi khởi tạo: ${error.message}`, 'error');
            setConnectionStatus({ status: 'disconnected', text: 'Lỗi khởi tạo' });
        } finally {
            console.groupEnd();
        }
    };

    const connectToServer = async () => {
        console.groupCollapsed('[OMI] connectToServer');
        try {
            setConnectionStatus({ status: 'connecting', text: 'Đang kết nối...' });
            log('Đang kết nối tới tổng đài...', 'info');
            const registerStatus = await sdkRef.current.register({
                sipRealm: 'thanhnth',
                sipUser: '100',            // Thay bằng SIP User của bạn
                sipPassword: 'LCJw1HK8i2', // Thay bằng mật khẩu của bạn
            });
            console.info('[OMI] register() result:', registerStatus);
            if (!registerStatus.status) throw new Error(registerStatus.error || 'register failed');
        } catch (error) {
            console.error('[OMI] connectToServer ERROR:', error);
            log(`Lỗi kết nối: ${error.message}`, 'error');
            setConnectionStatus({ status: 'disconnected', text: 'Kết nối thất bại' });
        } finally {
            console.groupEnd();
        }
    };

    const setupEventListeners = () => {
        const sdk = sdkRef.current;
        if (!sdk) return;

        console.info('[OMI] setupEventListeners');

        sdk.on('register', (data) => {
            console.info('[OMI] event: register', data);
            const statusMap = {
                connected: { status: 'connected', text: 'Đã kết nối' },
                connecting: { status: 'connecting', text: 'Đang kết nối...' },
                disconnect: { status: 'disconnected', text: 'Mất kết nối' },
            };
            setConnectionStatus(statusMap[data.status] || { status: 'disconnected', text: 'Không xác định' });
        });

        sdk.on('connecting', (data) => {
            console.info('[OMI] event: connecting', data);
            endedByRef.current = null; // reset
            setCallInfo({ number: data.remoteNumber, state: 'Đang kết nối...' });
        });

        sdk.on('ringing', (data) => {
            console.info('[OMI] event: ringing', data);
            setCallInfo(prev => ({ ...prev, state: 'Đang đổ chuông...' }));
        });

        sdk.on('accepted', (callData) => {
            console.info('[OMI] event: accepted', callData);
            handleAcceptedEvent(callData);
        });

        // 🔴 Quan trọng: truyền payload vào handler để xác định lý do kết thúc
        sdk.on('ended', (info) => {
            console.info('[OMI] event: ended', info);
            handleEndedEvent(info);
        });
    };

    // ==== CALL FLOW ====
    const handleAcceptedEvent = (callData) => {
        console.groupCollapsed('[OMI] CALL ACCEPTED');
        console.info('[OMI] callData:', callData);

        currentCallRef.current = callData;
        setCallInfo(prev => ({ ...prev, state: 'Đang trong cuộc gọi' }));

        localStreamRef.current = callData.streams?.local || null;
        remoteStreamRef.current = callData.streams?.remote || null;

        if (remoteAudioRef.current && remoteStreamRef.current) {
            remoteAudioRef.current.srcObject = remoteStreamRef.current;
        }

        setupMediaElements(callData);
        startCallDuration();

        if (isSale) {
            startRecording();
        } else {
            initializeAudioContext();
            startAudioMonitoring();
        }
        console.groupEnd();
    };

    const handleEndedEvent = (info) => {
        console.groupCollapsed('[OMI] CALL ENDED');
        try {
            lastEndInfoRef.current = info;

            const code = info?.statusCode ?? info?.code ?? info?.reasonCode ?? null;
            const reason = mapEndReason(code);
            const endedBy = info?.by || endedByRef.current || 'remote_or_system';

            console.info('[OMI] end details:', {
                statusCode: code,
                mappedReason: reason,
                endedBy,
                remoteNumber: callInfo?.number ?? info?.remoteNumber,
                durationUI: callDuration,
                raw: info
            });

            // --- Reset UI/cleanup ---
            stopCallDuration();
            stopRecording();
            stopAudioMonitoring();

            currentCallRef.current = null;
            setCallInfo(null);
            setIsMuted(false);
            setIsHeld(false);
            setIsVideoOn(false);

            localStreamRef.current = null;
            remoteStreamRef.current = null;
            if (localVideoRef.current) localVideoRef.current.srcObject = null;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
            if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

            // Nếu muốn tự refetch lịch sử ngay (ngoài quy trình PostCallDialog), có thể bật:
            // if (isSale) fetchCallHistory();
        } catch (e) {
            console.error('[OMI] handleEndedEvent ERROR:', e);
        } finally {
            endedByRef.current = null;
            console.groupEnd();
        }
    };

    const makeCall = async (number) => {
        console.groupCollapsed('[OMI] makeCall');
        try {
            if (connectionStatus.status !== 'connected') {
                console.warn('[OMI] not connected, abort calling');
                log('Chưa kết nối tới tổng đài.', 'error');
                return;
            }
            if (currentCallRef.current) {
                console.warn('[OMI] already in call');
                log('Đang có cuộc gọi khác.', 'error');
                return;
            }
            if (!number) {
                console.warn('[OMI] empty number');
                log('Vui lòng nhập số điện thoại.', 'error');
                return;
            }
            console.info('[OMI] dialing:', number);
            await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await sdkRef.current.makeCall(number, { isVideo: false, sipNumber: { number: hotlineNumber } });
        } catch (error) {
            console.error('[OMI] makeCall ERROR:', error);
            log(`Lỗi khi gọi: ${error.message}`, 'error');
        } finally {
            console.groupEnd();
        }
    };

    const endCall = () => {
        console.info('[OMI] endCall() pressed');
        endedByRef.current = 'local';
        currentCallRef.current?.end();
    };

    const startCallDuration = () => {
        console.info('[OMI] startCallDuration');
        let seconds = 0;
        clearInterval(callDurationIntervalRef.current);
        callDurationIntervalRef.current = setInterval(() => {
            seconds++;
            const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
            const secs = String(seconds % 60).padStart(2, '0');
            setCallDuration(`${mins}:${secs}`);
        }, 1000);
    };

    const stopCallDuration = () => {
        console.info('[OMI] stopCallDuration');
        clearInterval(callDurationIntervalRef.current);
        if (!isSale) setCallDuration("00:00");
    };

    // ==== Recording ====
    const startRecording = () => {
        console.groupCollapsed('[OMI] startRecording');
        try {
            if (!localStreamRef.current && !remoteStreamRef.current) {
                console.error('[OMI] No stream to record');
                log('Không có stream để ghi âm', 'error');
                console.groupEnd();
                return;
            }
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const destination = audioContext.createMediaStreamDestination();
            if (localStreamRef.current) audioContext.createMediaStreamSource(localStreamRef.current).connect(destination);
            if (remoteStreamRef.current) audioContext.createMediaStreamSource(remoteStreamRef.current).connect(destination);

            recordedChunksRef.current = [];
            mediaRecorderRef.current = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
            mediaRecorderRef.current.ondataavailable = (e) => e.data.size > 0 && recordedChunksRef.current.push(e.data);

            mediaRecorderRef.current.start();
            setIsRecording(true);
            console.info('[OMI] Recording started');
            log('Bắt đầu ghi âm', 'success');

            if (!isSale) {
                let seconds = 0;
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = setInterval(() => {
                    seconds++;
                    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
                    const secs = (seconds % 60).toString().padStart(2, '0');
                    setRecordingTime(`${mins}:${secs}`);
                }, 1000);
            }
        } catch (error) {
            console.error('[OMI] Recording Start ERROR:', error);
            log(`Lỗi bắt đầu ghi âm: ${error.message}`, 'error');
        } finally {
            console.groupEnd();
        }
    };

    const stopRecording = () => {
        console.groupCollapsed('[OMI] stopRecording');
        try {
            if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.onstop = () => {
                    console.info('[OMI] MediaRecorder stopped, chunks:', recordedChunksRef.current.length);
                    if (recordedChunksRef.current.length > 0) {
                        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
                        const targetPhone = customer?.phone || phoneNumber || 'unknown';
                        const fileName = `rec-${targetPhone}-${new Date().toISOString().replace(/:/g, '-')}.webm`;

                        if (isSale) {
                            const file = new File([blob], fileName, { type: 'audio/webm' });
                            // Tính startTime từ UI callDuration
                            const totalSecs = callDuration.split(':').reduce((acc, t) => (60 * acc) + +t, 0);
                            const callStartTime = new Date(Date.now() - (totalSecs * 1000));
                            setLastCallInfo({ file, name: fileName, duration: callDuration, startTime: callStartTime });
                            setIsPostCallModalOpen(true);
                            setCallDuration("00:00");
                            console.info('[OMI] Prepared Sale post-call info:', { fileName, callDuration, callStartTime });
                        } else {
                            const url = URL.createObjectURL(blob);
                            setRecordings(prev => [...prev, { name: fileName, url }]);
                            log(`Đã lưu ghi âm: ${fileName}`, 'success');
                        }
                    }
                    recordedChunksRef.current = [];
                };
                mediaRecorderRef.current.stop();
                setIsRecording(false);
                if (!isSale) {
                    clearInterval(recordingTimerRef.current);
                    setRecordingTime('00:00');
                    log('Dừng ghi âm', 'info');
                }
                console.info('[OMI] Recording stopped');
            }
        } catch (e) {
            console.error('[OMI] stopRecording ERROR:', e);
        } finally {
            console.groupEnd();
        }
    };

    // ==== Audio devices & monitoring ====
    const initializeAudioDevices = async () => {
        console.groupCollapsed('[OMI] initializeAudioDevices');
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const microphones = devices.filter(d => d.kind === 'audioinput');
            const speakers = devices.filter(d => d.kind === 'audiooutput');
            setAudioDevices({ microphones, speakers });
            if (microphones.length > 0) setSelectedMic(microphones[0].deviceId);
            if (speakers.length > 0) setSelectedSpeaker(speakers[0].deviceId);
            console.info('[OMI] mics:', microphones.length, 'speakers:', speakers.length);
            log(`Đã tải ${microphones.length} mic và ${speakers.length} loa`, 'success');
        } catch (error) {
            console.error('[OMI] initializeAudioDevices ERROR:', error);
            log(`Lỗi tải thiết bị âm thanh: ${error.message}`, 'error');
        } finally {
            console.groupEnd();
        }
    };

    const setupMediaElements = (callData) => {
        if (isSale) return;
        if (callData.isVideo) {
            setIsVideoOn(true);
            if (localVideoRef.current && callData.streams.local) localVideoRef.current.srcObject = callData.streams.local;
            if (remoteVideoRef.current && callData.streams.remote) remoteVideoRef.current.srcObject = callData.streams.remote;
            console.info('[OMI] setupMediaElements video ON');
        }
    };

    const initializeAudioContext = () => {
        console.groupCollapsed('[OMI] initializeAudioContext');
        try {
            if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();

            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;

            if (localStreamRef.current) {
                const source = audioContextRef.current.createMediaStreamSource(localStreamRef.current);
                micGainNodeRef.current = audioContextRef.current.createGain();
                micGainNodeRef.current.gain.value = micGain / 100;
                source.connect(micGainNodeRef.current);
                micGainNodeRef.current.connect(analyserRef.current);
            }
            console.info('[OMI] AudioContext initialized');
        } catch (error) {
            console.error('[OMI] initializeAudioContext ERROR:', error);
            log(`Lỗi khởi tạo audio context: ${error.message}`, 'error');
        } finally {
            console.groupEnd();
        }
    };

    const startAudioMonitoring = () => {
        if (isSale) return;
        console.info('[OMI] startAudioMonitoring');
        clearInterval(audioMonitoringIntervalRef.current);
        audioMonitoringIntervalRef.current = setInterval(() => {
            if (!analyserRef.current) return;
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            setMicLevel(Math.round((average / 255) * 100));
        }, 100);
    };

    const stopAudioMonitoring = () => {
        if (isSale) return;
        console.info('[OMI] stopAudioMonitoring');
        clearInterval(audioMonitoringIntervalRef.current);
        setMicLevel(0);
    };

    // ==== Toggles ====
    const toggleMute = () => {
        console.info('[OMI] toggleMute pressed');
        currentCallRef.current?.mute(isMuted => setIsMuted(isMuted));
    };
    const toggleHold = () => {
        console.info('[OMI] toggleHold pressed');
        currentCallRef.current?.hold(isHeld => setIsHeld(isHeld));
    };
    const toggleVideo = () => {
        console.info('[OMI] toggleVideo pressed');
        currentCallRef.current?.camera(isVideoOn => setIsVideoOn(isVideoOn));
    };
    const toggleRecording = () => {
        console.info('[OMI] toggleRecording pressed');
        isRecording ? stopRecording() : startRecording();
    };
    const deleteRecording = (urlToDelete) => {
        console.info('[OMI] deleteRecording:', urlToDelete);
        setRecordings(prev => prev.filter(rec => rec.url !== urlToDelete));
        URL.revokeObjectURL(urlToDelete);
    };

    useEffect(() => {
        if (micGainNodeRef.current) {
            micGainNodeRef.current.gain.value = micGain / 100;
            console.info('[OMI] micGain changed:', micGain);
        }
    }, [micGain]);
    useEffect(() => {
        if (remoteAudioRef.current) {
            remoteAudioRef.current.volume = volume / 100;
            console.info('[OMI] volume changed:', volume);
        }
    }, [volume]);

    // ==== Call History (Sale only) ====
    const fetchCallHistory = async () => {
        if (!isSale) return;
        console.groupCollapsed('[OMI] fetchCallHistory');
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const q = customer?._id ? `?customerId=${customer._id}` : '';
            const res = await fetch(`/api/omicall/history${q}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const rows = json?.data || json || [];
            console.info('[OMI] history fetched:', { count: rows.length });
            setCallHistory(rows);
        } catch (e) {
            console.error('[OMI] fetchCallHistory ERROR:', e);
            setHistoryError(e.message);
        } finally {
            setHistoryLoading(false);
            console.groupEnd();
        }
    };

    // mount + đổi customer → refetch
    useEffect(() => {
        if (isSale) fetchCallHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSale, customer?._id]);

    // Sau khi đóng modal post-call (Sale) → refetch để cập nhật record mới
    useEffect(() => {
        if (isSale && !isPostCallModalOpen && lastCallInfo) {
            fetchCallHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSale, isPostCallModalOpen, lastCallInfo]);

    // ==== UI ====
    const renderSaleUI = () => (
        <>
            <Card className="shadow-lg w-full max-w-sm" style={{ height: 'max-content' }}>
                <CardHeader className="text-center">
                    <div className="flex flex-col items-center gap-3">
                        <Avatar className="w-20 h-20 border-2 border-primary/20">
                            <AvatarImage src={customer?.zaloavt} alt={customer?.name} />
                            <AvatarFallback>{customer?.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <h4 className='text-lg font-semibold'>{customer?.name}</h4>
                            <h5 className='text-sm text-muted-foreground'>{maskPhoneNumber(customer?.phone)}</h5>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        {connectionStatus.status === 'connected' ? <CheckCircle className="h-5 w-5 text-green-500" /> : connectionStatus.status === 'connecting' ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertCircle className="h-5 w-5 text-red-500" />}
                        <h5 className='font-medium'>{connectionStatus.text}</h5>
                    </div>

                    <div className="text-center h-16 flex flex-col justify-center">
                        {callInfo ? (
                            <>
                                <h5 className='font-semibold text-blue-600'>{callInfo.state}</h5>
                                <h5 className='text-2xl font-mono tracking-wider mt-1'>{callDuration}</h5>
                            </>
                        ) : (
                            <h5 className='text-gray-500'>Sẵn sàng để gọi</h5>
                        )}
                    </div>

                    {isRecording && (
                        <div className="flex items-center gap-2 text-red-500 animate-pulse">
                            <CircleDot className="h-4 w-4" />
                            <span>Đang ghi âm...</span>
                        </div>
                    )}

                    <div className="w-full mt-2">
                        {!callInfo ? (
                            <Button size="lg" className="w-full" onClick={() => makeCall(customer?.phone)} disabled={connectionStatus.status !== 'connected'}>
                                <Phone className="mr-2 h-5 w-5" /> Gọi
                            </Button>
                        ) : (
                            <Button size="lg" variant="destructive" className="w-full" onClick={endCall}>
                                <PhoneOff className="mr-2 h-5 w-5" /> Kết thúc
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <PostCallFormDialog
                isOpen={isPostCallModalOpen}
                onOpenChange={setIsPostCallModalOpen}
                lastCallInfo={lastCallInfo}
                customer={customer}
            />
        </>
    );

    const renderFullUI = () => {
        const getStatusIcon = () => {
            switch (connectionStatus.status) {
                case 'connected': return <CheckCircle className="h-5 w-5 text-green-500" />;
                case 'connecting': return <CircleDot className="h-5 w-5 text-yellow-500 animate-pulse" />;
                case 'disconnected': return <AlertCircle className="h-5 w-5 text-red-500" />;
                default: return null;
            }
        };

        const getLogIcon = (type) => {
            switch (type) {
                case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
                case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
                case 'info': return <PhoneOutgoing className="h-4 w-4 text-blue-500" />;
                default: return null;
            }
        };

        return (
            <div className="container mx-auto p-4 max-w-6xl">
                <header className="text-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-800">Bảng điều khiển OMICall</h1>
                    <p className="text-md text-gray-600">Giao diện quản lý và gội điện nâng cao</p>
                </header>

                <Card className="mb-6">
                    <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                        <div className="flex flex-col items-center">
                            <span className="text-sm font-medium text-gray-500">Trạng thái</span>
                            <div className="flex items-center gap-2 mt-1">
                                {getStatusIcon()}
                                <span className="font-semibold text-gray-700">{connectionStatus.text}</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-sm font-medium text-gray-500">Số nội bộ</span>
                            <span className="font-semibold text-gray-700 mt-1">{sipUser}</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-sm font-medium text-gray-500">Số hotline</span>
                            <span className="font-semibold text-gray-700 mt-1">{hotlineNumber}</span>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-6">
                        <Card>
                            <CardHeader><CardTitle>Gọi Điện</CardTitle></CardHeader>
                            <CardContent>
                                <div className="flex gap-2">
                                    <Input
                                        type="tel"
                                        placeholder="Nhập số điện thoại..."
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && makeCall(phoneNumber)}
                                    />
                                    <Button onClick={() => makeCall(phoneNumber)} disabled={!!callInfo || connectionStatus.status !== 'connected'}>
                                        <Phone className="mr-2 h-4 w-4" /> Gọi
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {callInfo && (
                            <Card>
                                <CardHeader><CardTitle>Thông tin cuộc gọi</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex justify-between items-center"><span className="font-medium">Số gọi:</span><span className="font-bold text-lg">{callInfo.number}</span></div>
                                    <div className="flex justify-between items-center"><span className="font-medium">Trạng thái:</span><span className="text-blue-600">{callInfo.state}</span></div>
                                    <div className="flex justify-between items-center"><span className="font-medium">Thời gian:</span><span className="font-mono text-lg">{callDuration}</span></div>

                                    {isRecording && (<div className="flex items-center gap-2 text-red-600"><CircleDot className="h-4 w-4 animate-pulse" /><span>Đang ghi âm: {recordingTime}</span></div>)}

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-4 border-t">
                                        <Button variant={isMuted ? "destructive" : "outline"} onClick={toggleMute}><MicOff className="mr-2 h-4 w-4" /> Tắt mic</Button>
                                        <Button variant={isHeld ? "secondary" : "outline"} onClick={toggleHold}><Pause className="mr-2 h-4 w-4" /> Giữ máy</Button>
                                        <Button variant="outline" onClick={toggleVideo} disabled={!callInfo?.isVideo}><Video className="mr-2 h-4 w-4" /> Video</Button>
                                        <Button variant={isRecording ? "destructive" : "outline"} onClick={toggleRecording}><CircleDot className="mr-2 h-4 w-4" /> {isRecording ? 'Dừng' : 'Ghi âm'}</Button>
                                        <Button variant="destructive" className="col-span-2 md:col-span-3" onClick={endCall}><PhoneOff className="mr-2 h-4 w-4" /> Kết thúc</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    <div className="flex flex-col gap-6">
                        <Card>
                            <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Cài đặt âm thanh</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label>Microphone</Label>
                                    <Select value={selectedMic} onValueChange={setSelectedMic}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {audioDevices.microphones.map(mic => (<SelectItem key={mic.deviceId} value={mic.deviceId}>{mic.label}</SelectItem>))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Loa</Label>
                                    <Select value={selectedSpeaker} onValueChange={setSelectedSpeaker}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {audioDevices.speakers.map(spk => (<SelectItem key={spk.deviceId} value={spk.deviceId}>{spk.label}</SelectItem>))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div><Label>Volume: {volume}%</Label><Slider value={[volume]} onValueChange={v => setVolume(v[0])} /></div>
                                <div><Label>Mic Level</Label><Progress value={micLevel} /></div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    <Card>
                        <CardHeader><CardTitle>Nhật ký hoạt động</CardTitle></CardHeader>
                        <CardContent>
                            <div className="h-64 overflow-y-auto bg-gray-100 p-2 rounded-md text-sm font-mono">
                                {logs.map((log, index) => (
                                    <div key={index} className="flex items-start gap-2 mb-1">
                                        <span className="text-gray-500">{log.timestamp}</span>
                                        <div className="flex-shrink-0 pt-0.5">
                                            {(() => {
                                                switch (log.type) {
                                                    case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
                                                    case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
                                                    case 'info': return <PhoneOutgoing className="h-4 w-4 text-blue-500" />;
                                                    default: return null;
                                                }
                                            })()}
                                        </div>
                                        <span className={`flex-grow ${log.type === 'error' ? 'text-red-600' : log.type === 'success' ? 'text-green-600' : 'text-gray-800'}`}>{log.message}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>File Ghi âm</CardTitle></CardHeader>
                        <CardContent>
                            <div className="h-64 overflow-y-auto space-y-2">
                                {recordings.length === 0 && <p className="text-sm text-gray-500">Chưa có bản ghi âm nào.</p>}
                                {recordings.map((rec, index) => (
                                    <div key={index} className="flex items-center gap-2 p-2 bg-gray-100 rounded-md">
                                        <span className="flex-grow text-sm truncate">{rec.name}</span>
                                        <audio controls src={rec.url} className="h-8"></audio>
                                        <Button asChild variant="ghost" size="icon"><a href={rec.url} download={rec.name}><Download className="h-4 w-4" /></a></Button>
                                        <Button variant="ghost" size="icon" onClick={() => deleteRecording(rec.url)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* 📞 Lịch sử gọi (Sale) */}
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle>Lịch sử gọi</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {historyLoading && <p className="text-sm text-gray-500">Đang tải lịch sử…</p>}
                        {historyError && <p className="text-sm text-red-500">Lỗi tải lịch sử: {historyError}</p>}
                        {!historyLoading && !historyError && callHistory.length === 0 && (
                            <p className="text-sm text-gray-500">Chưa có lịch sử cuộc gọi.</p>
                        )}

                        <div className="divide-y rounded-md border bg-white max-h-80 overflow-auto">
                            {callHistory.map((h) => (
                                <div key={h._id || `${h.startedAt}-${h.number}`} className="p-3 flex items-center gap-3">
                                    <div className="w-48 text-xs text-gray-500">
                                        {new Date(h.startedAt || h.createdAt).toLocaleString()}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-medium">
                                            {h.direction === 'in' ? '⬅️ In' : '➡️ Out'} • {h.number || h.remoteNumber || h.to}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            Trạng thái: <span className="font-medium">{h.status || h.reason || 'completed'}</span>
                                            {' • '}Thời lượng: <span className="font-mono">{h.duration || '-'}</span>
                                            {h.endedBy ? <> {' • '}Kết thúc bởi: <span className="font-medium">{h.endedBy}</span></> : null}
                                        </div>
                                    </div>
                                    {h.recordingUrl && (
                                        <Button asChild variant="outline" size="sm">
                                            <a href={h.recordingUrl} download> <Download className="h-4 w-4 mr-1" />Tải ghi âm</a>
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    };

    return (
        <>
            <Script
                id="omicall-sdk-script"
                src="https://cdn.omicrm.com/sdk/web/3.0.0/core.min.js"
                onLoad={handleSDKLoad}
                strategy="lazyOnload"
            />
            <div className="flex-1 scroll p-4 bg-gray-50 flex items-center justify-center">
                {/* Lưu ý: logic hiện tại là Sale → renderFullUI; Non-Sale → renderSaleUI */}
                {isSale ? renderSaleUI() : renderFullUI()}
            </div>
            <audio ref={remoteAudioRef} playsInline style={{ display: 'none' }} />
        </>
    );
}
