"use client";

// ✅ SỬA LỖI: Thay đổi import từ 'react-dom' sang 'react' và đổi tên hook
import { useState, useEffect, useRef, useActionState } from 'react';
// import { useFormState, useFormStatus } from 'react-dom'; // Dòng cũ
import { useFormStatus } from 'react-dom'; // useFormStatus vẫn ở trong react-dom
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

    // ✅ SỬA LỖI: Đổi tên useFormState thành useActionState
    const [state, formAction] = useActionState(saveCallResultAction, initialState);

    useEffect(() => {
        if (state.success) {
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


// --- Main OMICall Client Component ---
// ... (Phần còn lại của component không thay đổi)
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

    // --- Common Refs ---
    const sdkRef = useRef(null);
    const currentCallRef = useRef(null);
    const callDurationIntervalRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const remoteAudioRef = useRef(null);

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

    const handleSDKLoad = () => {
        if (window.OMICallSDK) {
            initializeSDK();
        } else {
            console.error("OMICall SDK not found on window object.");
        }
    };

    useEffect(() => {
        return () => {
            if (sdkRef.current && typeof sdkRef.current.destroy === 'function') {
                console.log("OMICall SDK is being destroyed.");
                sdkRef.current.destroy();
            }
            clearInterval(callDurationIntervalRef.current);
            clearInterval(audioMonitoringIntervalRef.current);

            // Đóng audio context nếu nó tồn tại và chưa đóng
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }

            // Gỡ script khỏi body (nếu cần)
            const scriptElement = document.getElementById('omicall-sdk-script');
            if (scriptElement) {
                document.body.removeChild(scriptElement);
            }
        };
    }, []);

    const initializeSDK = async () => {
        try {
            log('Đang khởi tạo OMICall SDK...', 'info');
            const initSuccess = await window.OMICallSDK.init({ lng: 'vi', ui: { toggleDial: 'hide' } });
            if (!initSuccess) throw new Error('SDK initialization failed');
            sdkRef.current = window.OMICallSDK;
            log('SDK đã được khởi tạo thành công', 'success');
            setupEventListeners();
            await connectToServer();
            if (!isSale) await initializeAudioDevices();
        } catch (error) {
            console.error("SDK Error:", error);
            log(`Lỗi khởi tạo: ${error.message}`, 'error');
            setConnectionStatus({ status: 'disconnected', text: 'Lỗi khởi tạo' });
        }
    };

    const connectToServer = async () => {
        try {
            setConnectionStatus({ status: 'connecting', text: 'Đang kết nối...' });
            log('Đang kết nối tới tổng đài...', 'info');
            // THAY THÔNG TIN SIP CỦA BẠN VÀO ĐÂY
            const registerStatus = await sdkRef.current.register({
                sipRealm: 'thanhnth',
                sipUser: '100', // Thay bằng SIP User
                sipPassword: 'LCJw1HK8i2', // Thay bằng mật khẩu
            });
            if (!registerStatus.status) throw new Error(registerStatus.error);
        } catch (error) {
            console.error("Connection Error:", error);
            log(`Lỗi kết nối: ${error.message}`, 'error');
            setConnectionStatus({ status: 'disconnected', text: 'Kết nối thất bại' });
        }
    };

    const setupEventListeners = () => {
        const sdk = sdkRef.current;
        if (!sdk) return;

        sdk.on('register', (data) => {
            log(`Trạng thái kết nối: ${data.name}`, 'info');
            const statusMap = {
                connected: { status: 'connected', text: 'Đã kết nối' },
                connecting: { status: 'connecting', text: 'Đang kết nối...' },
                disconnect: { status: 'disconnected', text: 'Mất kết nối' },
            };
            setConnectionStatus(statusMap[data.status] || { status: 'disconnected', text: 'Không xác định' });
        });

        sdk.on('connecting', (data) => {
            log(`Đang gọi tới ${data.remoteNumber}...`, 'info');
            setCallInfo({ number: data.remoteNumber, state: 'Đang kết nối...' })
        });
        sdk.on('ringing', (data) => {
            log(`Đang đổ chuông tới ${data.remoteNumber}...`, 'info');
            setCallInfo(prev => ({ ...prev, state: 'Đang đổ chuông...' }))
        });
        sdk.on('accepted', handleAcceptedEvent);
        sdk.on('ended', handleEndedEvent);
    };

    const handleAcceptedEvent = (callData) => {
        log(`Cuộc gọi đã được chấp nhận`, 'success');
        currentCallRef.current = callData;
        setCallInfo(prev => ({ ...prev, state: 'Đang trong cuộc gọi' }));

        localStreamRef.current = callData.streams.local;
        remoteStreamRef.current = callData.streams.remote;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = callData.streams.remote;

        setupMediaElements(callData);
        startCallDuration();

        if (isSale) {
            startRecording();
        } else {
            initializeAudioContext();
            startAudioMonitoring();
        }
    };

    const handleEndedEvent = () => {
        log(`Cuộc gọi đã kết thúc`, 'info');
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
    };

    const makeCall = async (number) => {
        if (connectionStatus.status !== 'connected') {
            log('Chưa kết nối tới tổng đài.', 'error');
            return;
        }
        if (currentCallRef.current) {
            log('Đang có cuộc gọi khác.', 'error');
            return;
        }
        if (!number) {
            log('Vui lòng nhập số điện thoại.', 'error');
            return;
        }
        try {
            log(`Bắt đầu gọi tới ${number}...`, 'info');
            await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            await sdkRef.current.makeCall(number, { isVideo: false, sipNumber: { number: hotlineNumber } });
        } catch (error) {
            console.error("Make Call Error:", error);
            log(`Lỗi khi gọi: ${error.message}`, 'error');
        }
    };

    const endCall = () => {
        currentCallRef.current?.end();
    };

    const startCallDuration = () => {
        let seconds = 0;
        callDurationIntervalRef.current = setInterval(() => {
            seconds++;
            const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
            const secs = String(seconds % 60).padStart(2, '0');
            setCallDuration(`${mins}:${secs}`);
        }, 1000);
    };

    const stopCallDuration = () => {
        clearInterval(callDurationIntervalRef.current);
        if (!isSale) {
            setCallDuration("00:00");
        }
    };

    const startRecording = () => {
        try {
            if (!localStreamRef.current && !remoteStreamRef.current) {
                log('Không có stream để ghi âm', 'error');
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
            log('Bắt đầu ghi âm', 'success');

            if (!isSale) {
                let seconds = 0;
                recordingTimerRef.current = setInterval(() => {
                    seconds++;
                    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
                    const secs = (seconds % 60).toString().padStart(2, '0');
                    setRecordingTime(`${mins}:${secs}`);
                }, 1000);
            }
        } catch (error) {
            console.error("Recording Start Error:", error);
            log(`Lỗi bắt đầu ghi âm: ${error.message}`, 'error');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.onstop = () => {
                if (recordedChunksRef.current.length > 0) {
                    const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
                    const targetPhone = customer?.phone || phoneNumber || 'unknown';
                    const fileName = `rec-${targetPhone}-${new Date().toISOString().replace(/:/g, '-')}.webm`;

                    if (isSale) {
                        const file = new File([blob], fileName, { type: 'audio/webm' });
                        const callStartTime = new Date(Date.now() - (callDuration.split(':').reduce((acc, time) => (60 * acc) + +time) * 1000));
                        setLastCallInfo({ file, name: fileName, duration: callDuration, startTime: callStartTime });
                        setIsPostCallModalOpen(true);
                        setCallDuration("00:00");
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
        }
    };

    const initializeAudioDevices = async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const microphones = devices.filter(d => d.kind === 'audioinput');
            const speakers = devices.filter(d => d.kind === 'audiooutput');
            setAudioDevices({ microphones, speakers });
            if (microphones.length > 0) setSelectedMic(microphones[0].deviceId);
            if (speakers.length > 0) setSelectedSpeaker(speakers[0].deviceId);
            log(`Đã tải ${microphones.length} mic và ${speakers.length} loa`, 'success');
        } catch (error) {
            log(`Lỗi tải thiết bị âm thanh: ${error.message}`, 'error');
        }
    };

    const setupMediaElements = (callData) => {
        if (isSale) return;
        if (callData.isVideo) {
            setIsVideoOn(true);
            if (localVideoRef.current && callData.streams.local) localVideoRef.current.srcObject = callData.streams.local;
            if (remoteVideoRef.current && callData.streams.remote) remoteVideoRef.current.srcObject = callData.streams.remote;
        }
    };

    const initializeAudioContext = () => {
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
        } catch (error) {
            log(`Lỗi khởi tạo audio context: ${error.message}`, 'error');
        }
    };

    const startAudioMonitoring = () => {
        if (isSale) return;
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
        clearInterval(audioMonitoringIntervalRef.current);
        setMicLevel(0);
    };

    const toggleMute = () => currentCallRef.current?.mute(isMuted => setIsMuted(isMuted));
    const toggleHold = () => currentCallRef.current?.hold(isHeld => setIsHeld(isHeld));
    const toggleVideo = () => currentCallRef.current?.camera(isVideoOn => setIsVideoOn(isVideoOn));
    const toggleRecording = () => isRecording ? stopRecording() : startRecording();
    const deleteRecording = (urlToDelete) => {
        setRecordings(prev => prev.filter(rec => rec.url !== urlToDelete));
        URL.revokeObjectURL(urlToDelete);
    };

    useEffect(() => {
        if (micGainNodeRef.current) micGainNodeRef.current.gain.value = micGain / 100;
    }, [micGain]);
    useEffect(() => {
        if (remoteAudioRef.current) remoteAudioRef.current.volume = volume / 100;
    }, [volume]);

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
                                        type="tel" placeholder="Nhập số điện thoại..."
                                        value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
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
                                <div><Label>Microphone</Label><Select value={selectedMic} onValueChange={setSelectedMic}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{audioDevices.microphones.map(mic => (<SelectItem key={mic.deviceId} value={mic.deviceId}>{mic.label}</SelectItem>))}</SelectContent></Select></div>
                                <div><Label>Loa</Label><Select value={selectedSpeaker} onValueChange={setSelectedSpeaker}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{audioDevices.speakers.map(spk => (<SelectItem key={spk.deviceId} value={spk.deviceId}>{spk.label}</SelectItem>))}</SelectContent></Select></div>
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
                                        <div className="flex-shrink-0 pt-0.5">{getLogIcon(log.type)}</div>
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
            </div>
        )
    };

    return (
        <>
            <Script
                src="https://cdn.omicrm.com/sdk/web/3.0.0/core.min.js"
                onLoad={handleSDKLoad}
                strategy="lazyOnload"
            />
            <div className="flex-1 scroll p-4 bg-gray-50 flex items-center justify-center">
                {!isSale ? renderSaleUI() : renderFullUI()}
            </div>
            <audio ref={remoteAudioRef} playsInline style={{ display: 'none' }} />
        </>
    );
}