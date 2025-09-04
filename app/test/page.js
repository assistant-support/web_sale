"use client";

import { useState, useEffect, useRef } from 'react';
import Script from 'next/script';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Phone, Mic, MicOff, Video, VideoOff, PhoneOff, Pause, Play, Download, Trash2, Settings, CircleDot, AlertCircle, CheckCircle, PhoneOutgoing } from 'lucide-react';

const OMICallClient = () => {
    const [connectionStatus, setConnectionStatus] = useState({ status: 'disconnected', text: 'Chưa kết nối' });
    const [sipUser, setSipUser] = useState('100');
    const [hotlineNumber, setHotlineNumber] = useState('842471233474');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [logs, setLogs] = useState([]);
    const [callInfo, setCallInfo] = useState(null);
    const [callDuration, setCallDuration] = useState('00:00');
    const [audioDevices, setAudioDevices] = useState({ microphones: [], speakers: [] });
    const [selectedMic, setSelectedMic] = useState('');
    const [selectedSpeaker, setSelectedSpeaker] = useState('');
    const [volume, setVolume] = useState(80);
    const [micGain, setMicGain] = useState(100);
    const [audioSettings, setAudioSettings] = useState({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
    });
    const [micLevel, setMicLevel] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isHeld, setIsHeld] = useState(false);
    const [isVideoOn, setIsVideoOn] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordings, setRecordings] = useState([]);
    const [recordingTime, setRecordingTime] = useState('00:00');

    const sdkRef = useRef(null);
    const currentCallRef = useRef(null);
    const callDurationIntervalRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const micGainNodeRef = useRef(null);
    const audioMonitoringIntervalRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const mixedStreamRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const recordingTimerRef = useRef(null);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const remoteAudioRef = useRef(null);

    const log = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prevLogs => [...prevLogs.slice(-49), { timestamp, message, type }]);
    };

    const handleSDKLoad = () => {
        if (window.OMICallSDK) {
            initializeSDK();
        }
    };

    const initializeSDK = async () => {
        try {
            log('Đang khởi tạo OMICall SDK...', 'info');
            const sdkConfigs = {
                lng: 'vi',
                ui: { toggleDial: 'hide' },
                ringtoneVolume: 0.9,
            };
            const initSuccess = await window.OMICallSDK.init(sdkConfigs);
            if (!initSuccess) {
                log('Lỗi: Không thể khởi tạo SDK', 'error');
                return;
            }
            sdkRef.current = window.OMICallSDK;
            log('SDK đã được khởi tạo thành công', 'success');
            setupEventListeners();
            await connectToServer();
            await initializeAudioDevices();
        } catch (error) {
            log(`Lỗi khởi tạo: ${error.message}`, 'error');
        }
    };

    const setupEventListeners = () => {
        if (!sdkRef.current) return;
        sdkRef.current.on('register', handleRegisterEvent);
        sdkRef.current.on('connecting', (callData) => handleCallEvent('connecting', callData));
        sdkRef.current.on('ringing', (callData) => handleCallEvent('ringing', callData));
        sdkRef.current.on('accepted', (callData) => handleCallEvent('accepted', callData));
        sdkRef.current.on('ended', (callData) => handleCallEvent('ended', callData));
    };

    const connectToServer = async () => {
        try {
            log('Đang kết nối tới tổng đài...', 'info');
            setConnectionStatus({ status: 'connecting', text: 'Đang kết nối...' });
            const registerStatus = await sdkRef.current.register({
                sipRealm: 'thanhnth',
                sipUser: '100',
                sipPassword: 'LCJw1HK8i2',
            });
            if (registerStatus.status) {
                log('Kết nối tổng đài thành công!', 'success');
                setConnectionStatus({ status: 'connected', text: 'Đã kết nối' });
            } else {
                log(`Lỗi kết nối: ${registerStatus.error}`, 'error');
                setConnectionStatus({ status: 'disconnected', text: 'Kết nối thất bại' });
            }
        } catch (error) {
            log(`Lỗi kết nối tổng đài: ${error.message}`, 'error');
            setConnectionStatus({ status: 'disconnected', text: 'Lỗi kết nối' });
        }
    };

    const handleRegisterEvent = (data) => {
        log(`Trạng thái kết nối: ${data.name}`, 'info');
        switch (data.status) {
            case 'connected':
                setConnectionStatus({ status: 'connected', text: 'Đã kết nối' });
                break;
            case 'connecting':
                setConnectionStatus({ status: 'connecting', text: 'Đang kết nối...' });
                break;
            case 'disconnect':
                setConnectionStatus({ status: 'disconnected', text: 'Mất kết nối' });
                break;
        }
    };

    const handleCallEvent = (eventType, callData) => {
        currentCallRef.current = callData;
        switch (eventType) {
            case 'connecting':
                log(`Đang gọi tới ${callData.remoteNumber}...`, 'info');
                setCallInfo({ number: callData.remoteNumber, state: 'Đang kết nối...' });
                break;
            case 'ringing':
                log(`Đang đổ chuông tới ${callData.remoteNumber}...`, 'info');
                setCallInfo(prev => ({ ...prev, state: 'Đang đổ chuông...' }));
                break;
            case 'accepted':
                log(`Cuộc gọi đã được chấp nhận`, 'success');
                setCallInfo(prev => ({ ...prev, state: 'Đang trong cuộc gọi' }));
                startCallDuration();
                setupMediaElements(callData);
                initializeAudioContext();
                startAudioMonitoring();
                break;
            case 'ended':
                log(`Cuộc gọi đã kết thúc`, 'info');
                stopCallDuration();
                stopAudioMonitoring();
                stopRecording();
                setCallInfo(null);
                currentCallRef.current = null;
                localStreamRef.current = null;
                remoteStreamRef.current = null;
                if (localVideoRef.current) localVideoRef.current.srcObject = null;
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
                if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
                break;
        }
    };

    const makeCall = async () => {
        if (connectionStatus.status !== 'connected') {
            log('Chưa kết nối tới tổng đài.', 'error');
            return;
        }
        if (currentCallRef.current) {
            log('Đang có cuộc gọi khác.', 'error');
            return;
        }
        if (!phoneNumber) {
            log('Vui lòng nhập số điện thoại.', 'error');
            return;
        }
        try {
            log(`Bắt đầu gọi tới ${phoneNumber}...`, 'info');
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const options = {
                isVideo: false,
                sipNumber: { number: hotlineNumber },
            };
            await sdkRef.current.makeCall(phoneNumber, options);
        } catch (error) {
            log(`Lỗi khi gọi: ${error.message}`, 'error');
        }
    };

    const startCallDuration = () => {
        let seconds = 0;
        callDurationIntervalRef.current = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            setCallDuration(`${mins}:${secs}`);
        }, 1000);
    };

    const stopCallDuration = () => {
        clearInterval(callDurationIntervalRef.current);
        setCallDuration('00:00');
    };

    const setupMediaElements = (callData) => {
        if (callData.isVideo) {
            setIsVideoOn(true);
            if (localVideoRef.current && callData.streams.local) {
                localVideoRef.current.srcObject = callData.streams.local;
            }
            if (remoteVideoRef.current && callData.streams.remote) {
                remoteVideoRef.current.srcObject = callData.streams.remote;
            }
        }
        if (remoteAudioRef.current && callData.streams.remote) {
            remoteAudioRef.current.srcObject = callData.streams.remote;
            remoteAudioRef.current.play().catch(e => log(`Lỗi phát audio: ${e.message}`, 'error'));
        }
        localStreamRef.current = callData.streams.local;
        remoteStreamRef.current = callData.streams.remote;
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

    const initializeAudioContext = () => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume();
            }
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            analyserRef.current.smoothingTimeConstant = 0.8;

            if (localStreamRef.current) {
                const source = audioContextRef.current.createMediaStreamSource(localStreamRef.current);
                micGainNodeRef.current = audioContextRef.current.createGain();
                micGainNodeRef.current.gain.value = micGain / 100;
                source.connect(micGainNodeRef.current);
                micGainNodeRef.current.connect(analyserRef.current);
            }
            log('Audio context đã được khởi tạo', 'success');
        } catch (error) {
            log(`Lỗi khởi tạo audio context: ${error.message}`, 'error');
        }
    };

    const startAudioMonitoring = () => {
        audioMonitoringIntervalRef.current = setInterval(() => {
            if (!analyserRef.current) return;
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            setMicLevel(Math.round((average / 255) * 100));
        }, 100);
    };

    const stopAudioMonitoring = () => {
        clearInterval(audioMonitoringIntervalRef.current);
        setMicLevel(0);
    };

    const toggleMute = () => {
        currentCallRef.current?.mute(isMuted => {
            setIsMuted(isMuted);
            log(`Microphone ${isMuted ? 'đã tắt' : 'đã bật'}`, 'info');
        });
    };

    const toggleHold = () => {
        currentCallRef.current?.hold(isHeld => {
            setIsHeld(isHeld);
            log(`Cuộc gọi ${isHeld ? 'đã được giữ' : 'đã bỏ giữ'}`, 'info');
        });
    };

    const toggleVideo = () => {
        currentCallRef.current?.camera(isVideoOn => {
            setIsVideoOn(isVideoOn);
            log(`Camera ${isVideoOn ? 'đã bật' : 'đã tắt'}`, 'info');
        });
    };

    const endCall = () => {
        currentCallRef.current?.end();
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
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
            if (localStreamRef.current) {
                audioContext.createMediaStreamSource(localStreamRef.current).connect(destination);
            }
            if (remoteStreamRef.current) {
                audioContext.createMediaStreamSource(remoteStreamRef.current).connect(destination);
            }
            mixedStreamRef.current = destination.stream;

            recordedChunksRef.current = [];
            mediaRecorderRef.current = new MediaRecorder(mixedStreamRef.current, { mimeType: 'audio/webm;codecs=opus' });

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                const name = `recording-${new Date().toISOString()}.webm`;
                setRecordings(prev => [...prev, { name, url }]);
                log(`Đã lưu ghi âm: ${name}`, 'success');
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            log('Bắt đầu ghi âm', 'success');

            let seconds = 0;
            recordingTimerRef.current = setInterval(() => {
                seconds++;
                const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
                const secs = (seconds % 60).toString().padStart(2, '0');
                setRecordingTime(`${mins}:${secs}`);
            }, 1000);

        } catch (error) {
            log(`Lỗi bắt đầu ghi âm: ${error.message}`, 'error');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(recordingTimerRef.current);
            setRecordingTime('00:00');
            log('Dừng ghi âm', 'info');
        }
    };

    const deleteRecording = (urlToDelete) => {
        setRecordings(prev => prev.filter(rec => rec.url !== urlToDelete));
        URL.revokeObjectURL(urlToDelete);
    };

    useEffect(() => {
        return () => {
            // Cleanup on unmount
            sdkRef.current?.destroy();
            clearInterval(callDurationIntervalRef.current);
            clearInterval(audioMonitoringIntervalRef.current);
            clearInterval(recordingTimerRef.current);
            audioContextRef.current?.close();
        };
    }, []);

    useEffect(() => {
        if (micGainNodeRef.current) {
            micGainNodeRef.current.gain.value = micGain / 100;
        }
    }, [micGain]);

    useEffect(() => {
        if (remoteAudioRef.current) {
            remoteAudioRef.current.volume = volume / 100;
        }
    }, [volume]);

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
        <>
            <Script
                src="https://cdn.omicrm.com/sdk/web/3.0.0/core.min.js"
                onLoad={handleSDKLoad}
            />
            <div className="container mx-auto p-4 max-w-6xl bg-gray-50">
                <header className="text-center mb-6">
                    <h1 className="text-4xl font-bold text-gray-800">OMICall SDK v3 Demo</h1>
                    <p className="text-lg text-gray-600">Ứng dụng gọi điện tích hợp OMICall SDK với Next.js & TailwindCSS</p>
                </header>

                <Card className="mb-6">
                    <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                        <div className="flex flex-col items-center">
                            <span className="text-sm font-medium text-gray-500">Trạng thái kết nối</span>
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
                            <CardHeader>
                                <CardTitle>Gọi Điện</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex gap-2">
                                    <Input
                                        type="tel"
                                        placeholder="Nhập số điện thoại..."
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && makeCall()}
                                        className="flex-grow"
                                    />
                                    <Button onClick={makeCall} disabled={!!callInfo}>
                                        <Phone className="mr-2 h-4 w-4" /> Gọi
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-gray-600">Số gọi nhanh</p>
                                    <div className="flex flex-wrap gap-2">
                                        {['842471233474', '71308 (Nhóm)', '100 (Nội bộ)'].map(num => (
                                            <Button key={num} variant="outline" onClick={() => {
                                                const numberToCall = num.split(' ')[0];
                                                setPhoneNumber(numberToCall);
                                                makeCall();
                                            }}>{num}</Button>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {callInfo && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Thông tin cuộc gọi</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium">Số gọi:</span>
                                        <span className="font-bold text-lg">{callInfo.number}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium">Trạng thái:</span>
                                        <span className="text-blue-600">{callInfo.state}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium">Thời gian:</span>
                                        <span className="font-mono text-lg">{callDuration}</span>
                                    </div>

                                    {isRecording && (
                                        <div className="flex items-center gap-2 text-red-600">
                                            <CircleDot className="h-4 w-4 animate-pulse" />
                                            <span>Đang ghi âm: {recordingTime}</span>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-4 border-t">
                                        <Button variant={isMuted ? "destructive" : "outline"} onClick={toggleMute}>
                                            {isMuted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />} Tắt mic
                                        </Button>
                                        <Button variant={isHeld ? "secondary" : "outline"} onClick={toggleHold}>
                                            {isHeld ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />} Giữ máy
                                        </Button>
                                        <Button variant="outline" onClick={toggleVideo} disabled={!callInfo?.isVideo}>
                                            {isVideoOn ? <VideoOff className="mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />} Video
                                        </Button>
                                        <Button variant={isRecording ? "destructive" : "outline"} onClick={toggleRecording}>
                                            <CircleDot className="mr-2 h-4 w-4" /> {isRecording ? 'Dừng' : 'Ghi âm'}
                                        </Button>
                                        <Button variant="destructive" className="col-span-2 md:col-span-3" onClick={endCall}>
                                            <PhoneOff className="mr-2 h-4 w-4" /> Kết thúc
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    <div className="flex flex-col gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Settings className="h-5 w-5" />
                                    <span>Điều khiển âm thanh</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Microphone</label>
                                    <Select value={selectedMic} onValueChange={setSelectedMic}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Chọn microphone..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {audioDevices.microphones.map(mic => (
                                                <SelectItem key={mic.deviceId} value={mic.deviceId}>{mic.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Loa</label>
                                    <Select value={selectedSpeaker} onValueChange={setSelectedSpeaker}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Chọn loa..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {audioDevices.speakers.map(spk => (
                                                <SelectItem key={spk.deviceId} value={spk.deviceId}>{spk.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Volume: {volume}%</label>
                                    <Slider value={[volume]} onValueChange={(v) => setVolume(v[0])} max={100} step={1} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Mic Gain: {micGain}%</label>
                                    <Slider value={[micGain]} onValueChange={(v) => setMicGain(v[0])} max={200} step={1} />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="echo-cancel" checked={audioSettings.echoCancellation} onCheckedChange={(c) => setAudioSettings(s => ({ ...s, echoCancellation: c }))} />
                                    <label htmlFor="echo-cancel" className="text-sm font-medium">Khử vọng</label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="noise-reduction" checked={audioSettings.noiseSuppression} onCheckedChange={(c) => setAudioSettings(s => ({ ...s, noiseSuppression: c }))} />
                                    <label htmlFor="noise-reduction" className="text-sm font-medium">Giảm nhiễu</label>
                                </div>
                                <div className="space-y-2 pt-2">
                                    <label className="text-sm font-medium">Mic Level</label>
                                    <Progress value={micLevel} />
                                </div>
                            </CardContent>
                        </Card>

                        {isVideoOn && (
                            <Card>
                                <CardHeader><CardTitle>Video Call</CardTitle></CardHeader>
                                <CardContent className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-center mb-2">Local</p>
                                        <video ref={localVideoRef} autoPlay muted playsInline className="w-full bg-black rounded-md"></video>
                                    </div>
                                    <div>
                                        <p className="text-sm text-center mb-2">Remote</p>
                                        <video ref={remoteVideoRef} autoPlay playsInline className="w-full bg-black rounded-md"></video>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
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
                        <CardHeader><CardTitle>Ghi âm cuộc gọi</CardTitle></CardHeader>
                        <CardContent>
                            <div className="h-64 overflow-y-auto space-y-2">
                                {recordings.length === 0 && <p className="text-sm text-gray-500">Chưa có bản ghi âm nào.</p>}
                                {recordings.map((rec, index) => (
                                    <div key={index} className="flex items-center gap-2 p-2 bg-gray-100 rounded-md">
                                        <span className="flex-grow text-sm truncate">{rec.name}</span>
                                        <audio controls src={rec.url} className="h-8"></audio>
                                        <Button asChild variant="ghost" size="icon">
                                            <a href={rec.url} download={rec.name}><Download className="h-4 w-4" /></a>
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => deleteRecording(rec.url)}>
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <audio ref={remoteAudioRef} playsInline style={{ display: 'none' }} />
            </div>
        </>
    );
};

export default OMICallClient;
