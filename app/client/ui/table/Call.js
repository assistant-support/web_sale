// OmicallInterface.jsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';

// Giả lập các component UI để code có thể chạy. 
// Bạn hãy thay thế bằng các component từ thư viện của mình (shadcn/ui, etc.)
const Button = ({ children, onClick, variant, className }) => <button onClick={onClick} className={`${className} ${variant}`}>{children}</button>;
const Input = (props) => <input {...props} />;
const Label = ({ children, ...props }) => <label {...props}>{children}</label>;
const Progress = ({ value, ...props }) => <div {...props}><div style={{ width: `${value}%`, backgroundColor: 'blue', height: '100%' }}></div></div>;
const Slider = ({ onValueChange, value, ...props }) => <input type="range" value={value ? value[0] : 0} onChange={(e) => onValueChange([parseInt(e.target.value)])} {...props} />;
const Switch = ({ checked, onCheckedChange }) => <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />;


// === MAIN COMPONENT ===
const OmicallInterface = () => {
    // --- Refs for persistent instances and non-rendering data ---
    const sdkRef = useRef(null);
    const currentCallRef = useRef(null); // Use Ref for the call object to avoid dependency issues in callbacks
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);

    // DOM element Refs
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const remoteAudioRef = useRef(null);

    // Web Audio API Refs
    const audioContextRef = useRef(null);
    const analyserNodeRef = useRef(null);
    const micGainNodeRef = useRef(null);
    const localStreamSourceRef = useRef(null); // To disconnect later

    // Timer Refs
    const callTimerRef = useRef(null);
    const recTimerRef = useRef(null);
    const micLevelIntervalRef = useRef(null);
    const calibrationFrameRef = useRef(null);

    // --- State for triggering UI re-renders ---
    const [isSdkReady, setIsSdkReady] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('Chưa kết nối');
    const [logMessages, setLogMessages] = useState([]);

    const [phoneNumber, setPhoneNumber] = useState('');
    const [hotline, setHotline] = useState('842471233474');

    const [callInfo, setCallInfo] = useState({
        isCalling: false,
        number: '',
        state: 'Tạm dừng',
        duration: '00:00',
        isVideo: false,
    });
    const [isMuted, setIsMuted] = useState(false);
    const [isHeld, setIsHeld] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recTimer, setRecTimer] = useState('00:00');

    const [micLevel, setMicLevel] = useState(0);
    const [micGain, setMicGain] = useState(150); // Default to 150% as in original
    const [volume, setVolume] = useState(80);
    const [audioSettings, setAudioSettings] = useState({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
    });
    const [audioDevices, setAudioDevices] = useState({ microphones: [], speakers: [] });
    const [isCalibrating, setIsCalibrating] = useState(false);


    // --- Core Logic ---

    const log = useCallback((message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = `[${timestamp}] ${message}`;
        // Use functional update to avoid stale state issues
        setLogMessages(prev => [formattedMessage, ...prev].slice(0, 50));
    }, []);

    const resetCallState = useCallback(() => {
        clearInterval(callTimerRef.current);
        clearInterval(recTimerRef.current);
        clearInterval(micLevelIntervalRef.current);
        cancelAnimationFrame(calibrationFrameRef.current);

        // Stop any active recording
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
        }

        currentCallRef.current = null;
        setCallInfo({ isCalling: false, number: '', state: 'Tạm dừng', duration: '00:00', isVideo: false });
        setIsMuted(false);
        setIsHeld(false);
        setIsRecording(false);
        setMicLevel(0);

        // Disconnect and close the audio context
        if (localStreamSourceRef.current) localStreamSourceRef.current.disconnect();
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().then(() => audioContextRef.current = null);
        }

        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

        log('Trạng thái cuộc gọi đã được reset.');
    }, [log]);


    // --- SDK Initialization and Event Handling ---
    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://cdn.omicrm.com/sdk/web/3.0.0/core.min.js';
        script.async = true;

        const handleRegisterEvent = (data) => {
            setConnectionStatus(data.name);
            log(`Trạng thái kết nối: ${data.name}`, 'info');
        };

        const handleCallEvent = (eventType, callData) => {
            currentCallRef.current = callData;
            switch (eventType) {
                case 'connecting':
                    log(`Đang gọi tới ${callData.remoteNumber}...`, 'info');
                    setCallInfo({ isCalling: true, number: callData.remoteNumber, state: 'Đang kết nối...', duration: '00:00', isVideo: callData.isVideo });
                    break;
                case 'ringing':
                    log(`Đang đổ chuông...`, 'info');
                    setCallInfo(prev => ({ ...prev, state: 'Đang đổ chuông...' }));
                    break;
                case 'accepted':
                    log(`Cuộc gọi đã bắt đầu`, 'success');
                    setCallInfo(prev => ({ ...prev, state: 'Đang trong cuộc gọi' }));
                    startCallTimer();
                    setupMediaAndAudio(callData);
                    break;
                case 'ended':
                    log(`Cuộc gọi kết thúc`, 'info');
                    resetCallState();
                    break;
                default:
                    break;
            }
        };

        const initializeSdk = async () => {
            if (typeof window.OMICallSDK === 'undefined') {
                log('Lỗi: OMICall SDK chưa được tải.', 'error'); return;
            }

            log('Đang khởi tạo OMICall SDK...');
            const initSuccess = await window.OMICallSDK.init({ lng: 'vi', ui: { toggleDial: 'hide' } });

            if (!initSuccess) {
                log('Lỗi: Không thể khởi tạo SDK', 'error'); return;
            }

            sdkRef.current = window.OMICallSDK;
            setIsSdkReady(true);
            log('SDK đã được khởi tạo thành công', 'success');

            sdkRef.current.on('register', handleRegisterEvent);
            sdkRef.current.on('connecting', (data) => handleCallEvent('connecting', data));
            sdkRef.current.on('ringing', (data) => handleCallEvent('ringing', data));
            sdkRef.current.on('accepted', (data) => handleCallEvent('accepted', data));
            sdkRef.current.on('ended', (data) => handleCallEvent('ended', data));

            connectToServer();
            initializeAudioDevices();
        };

        script.onload = initializeSdk;
        script.onerror = () => log('Lỗi tải script OMICall SDK.', 'error');
        document.body.appendChild(script);

        return () => { // Cleanup
            document.body.removeChild(script);
            if (sdkRef.current) {
                sdkRef.current.off('register'); sdkRef.current.off('connecting');
                sdkRef.current.off('ringing'); sdkRef.current.off('accepted');
                sdkRef.current.off('ended');
            }
            resetCallState();
            if (remoteAudioRef.current) {
                remoteAudioRef.current.remove();
                remoteAudioRef.current = null;
            }
        };
    }, [log, resetCallState]); // Add dependencies for functions defined outside

    const connectToServer = useCallback(async () => {
        setConnectionStatus('Đang kết nối...');
        log('Đang kết nối tới tổng đài...');
        await sdkRef.current.register({ sipRealm: 'thanhnth', sipUser: '100', sipPassword: 'LCJw1HK8i2' });
    }, [log]);
 

    // --- Media and Audio Logic ---
    const initializeAudioDevices = useCallback(async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permission
            const devices = await navigator.mediaDevices.enumerateDevices();
            setAudioDevices({
                microphones: devices.filter(d => d.kind === 'audioinput'),
                speakers: devices.filter(d => d.kind === 'audiooutput'),
            });
            log(`Đã tìm thấy ${devices.filter(d => d.kind === 'audioinput').length} micro.`, 'success');
        } catch (error) {
            log(`Lỗi khi lấy thiết bị âm thanh: ${error.message}`, 'error');
        }
    }, [log]);

    const setupMediaAndAudio = useCallback(async (callData) => {
        // Attach streams to video/audio elements
        if (callData.isVideo) {
            if (localVideoRef.current) localVideoRef.current.srcObject = callData.streams.local;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = callData.streams.remote;
        }
        if (!remoteAudioRef.current) {
            remoteAudioRef.current = document.createElement('audio');
            remoteAudioRef.current.autoplay = true;
            document.body.appendChild(remoteAudioRef.current);
        }
        remoteAudioRef.current.srcObject = callData.streams.remote;
        updateVolume([volume]); // Apply current volume

        // Setup advanced audio processing pipeline
        try {
            if (!callData.streams.local) return;
            const context = new (window.AudioContext || window.webkitAudioContext)();
            const source = context.createMediaStreamSource(callData.streams.local);
            localStreamSourceRef.current = source; // Store source for later disconnect

            const highpassNode = context.createBiquadFilter();
            highpassNode.type = 'highpass'; highpassNode.frequency.value = 120;

            const compressorNode = context.createDynamicsCompressor();
            compressorNode.threshold.value = -30; compressorNode.knee.value = 20; compressorNode.ratio.value = 6;

            const gainNode = context.createGain();
            gainNode.gain.value = micGain / 100;

            const analyser = context.createAnalyser();
            analyser.fftSize = 256;

            source.connect(highpassNode).connect(compressorNode).connect(gainNode).connect(analyser);

            audioContextRef.current = context;
            analyserNodeRef.current = analyser;
            micGainNodeRef.current = gainNode;

            // Start monitoring mic level
            micLevelIntervalRef.current = setInterval(() => {
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
                setMicLevel(Math.round((average / 255) * 100));
            }, 100);
            log('Chuỗi xử lý âm thanh nâng cao đã được kích hoạt.', 'success');
        } catch (error) {
            log(`Lỗi cài đặt pipeline âm thanh: ${error.message}`, 'error');
        }
    }, [micGain, log, volume]); // Added volume to dependencies


    // --- Timers ---
    const startCallTimer = () => {
        clearInterval(callTimerRef.current);
        let seconds = 0;
        callTimerRef.current = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            setCallInfo(prev => ({ ...prev, duration: `${mins}:${secs}` }));
        }, 1000);
    };

    const startRecTimer = () => {
        clearInterval(recTimerRef.current);
        let seconds = 0;
        recTimerRef.current = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
            const secs = (seconds % 60).toString().padStart(2, '0');
            setRecTimer(`${mins}:${secs}`);
        }, 1000);
    };


    // --- UI Interaction Handlers (LOGIC ONLY) ---

    const makeCall = useCallback(async () => {
        if (!isSdkReady || connectionStatus !== 'connected') {
            return log('SDK chưa sẵn sàng hoặc chưa kết nối tổng đài.', 'error');
        }
        if (callInfo.isCalling) {
            return log('Đang trong cuộc gọi khác.', 'error');
        }
        if (!phoneNumber) {
            return log('Vui lòng nhập số điện thoại.', 'error');
        }
        await sdkRef.current.makeCall(phoneNumber, { sipNumber: { number: hotline } });
    }, [isSdkReady, connectionStatus, callInfo.isCalling, phoneNumber, hotline, log]);

    const endCall = useCallback(() => {
        if (currentCallRef.current) {
            currentCallRef.current.end();
            // Call state reset is handled by the 'ended' event
        } else {
            log('Không có cuộc gọi nào để kết thúc.', 'error');
        }
    }, [log]);

    const toggleMute = useCallback(() => {
        if (currentCallRef.current) {
            currentCallRef.current.mute(isMuted => {
                setIsMuted(isMuted);
                log(isMuted ? 'Đã tắt mic' : 'Đã bật mic', 'info');
            });
        }
    }, [log]);

    const toggleHold = useCallback(() => {
        if (currentCallRef.current) {
            currentCallRef.current.hold(isHeld => {
                setIsHeld(isHeld);
                log(isHeld ? 'Đã giữ máy' : 'Đã nối lại cuộc gọi', 'info');
            });
        }
    }, [log]);

    const toggleRecording = useCallback(() => {
        if (isRecording) { // --- STOP RECORDING ---
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                mediaRecorderRef.current.stop(); // This will trigger the 'onstop' event
            }
            clearInterval(recTimerRef.current);
            setIsRecording(false);
            log('Đã dừng ghi âm.');

        } else { // --- START RECORDING ---
            const call = currentCallRef.current;
            if (!call || !call.streams.local || !call.streams.remote) {
                return log('Không thể ghi âm, thiếu luồng âm thanh.', 'error');
            }
            try {
                // Mix audio tracks for a single recording file
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const destination = audioCtx.createMediaStreamDestination();

                audioCtx.createMediaStreamSource(call.streams.local).connect(destination);
                audioCtx.createMediaStreamSource(call.streams.remote).connect(destination);

                const mixedStream = destination.stream;

                mediaRecorderRef.current = new MediaRecorder(mixedStream, { mimeType: 'audio/webm;codecs=opus' });
                recordedChunksRef.current = [];

                mediaRecorderRef.current.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                        recordedChunksRef.current.push(event.data);
                    }
                };
                mediaRecorderRef.current.onstop = () => {
                    const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
                    const url = URL.createObjectURL(blob);
                    log(`Ghi âm đã được lưu. Bạn có thể tải xuống tại: ${url}`, 'success');
                    // In a real app, you would upload this blob or offer it for download
                };

                mediaRecorderRef.current.start();
                setIsRecording(true);
                setRecTimer('00:00');
                startRecTimer();
                log('Đã bắt đầu ghi âm.', 'success');

            } catch (error) {
                log(`Lỗi bắt đầu ghi âm: ${error.message}`, 'error');
            }
        }
    }, [isRecording, log]);

    const updateMicGain = useCallback((value) => {
        const newGain = value[0];
        setMicGain(newGain);
        if (micGainNodeRef.current) {
            micGainNodeRef.current.gain.value = newGain / 100;
        }
    }, []);

    const updateVolume = useCallback((value) => {
        const newVolume = value[0];
        setVolume(newVolume);
        if (remoteAudioRef.current) remoteAudioRef.current.volume = newVolume / 100;
        if (remoteVideoRef.current) remoteVideoRef.current.volume = newVolume / 100;
    }, []);

    const handleCalibrate = useCallback(() => {
        if (!analyserNodeRef.current || !micGainNodeRef.current) {
            return log('Không thể chuẩn hóa, audio context chưa sẵn sàng', 'error');
        }
        setIsCalibrating(true);
        log('Bắt đầu chuẩn hóa microphone...');

        const targetLoudness = 0.61, durationMs = 3000, startTime = Date.now();

        const step = () => {
            const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount);
            analyserNodeRef.current.getByteFrequencyData(dataArray);
            const currentLoudness = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;

            let newGain = micGainNodeRef.current.gain.value + 0.5 * (targetLoudness - currentLoudness);
            newGain = Math.max(0.2, Math.min(3.0, newGain)); // Clamp

            updateMicGain([Math.round(newGain * 100)]);

            if (Date.now() - startTime < durationMs) {
                calibrationFrameRef.current = requestAnimationFrame(step);
            } else {
                setIsCalibrating(false);
                log(`Chuẩn hóa hoàn tất. Gain: ${Math.round(newGain * 100)}%`, 'success');
            }
        };
        requestAnimationFrame(step);
    }, [log, updateMicGain]);


    // --- RENDER ---
    return (
        <> {/* Use Fragment to contain multiple root-level elements */}
            <div className="main-content w-full max-w-2xl bg-gray-200 rounded-lg shadow-lg p-8">
                {!callInfo.isCalling ? (
                    <div className="call-panel">
                        <h5>Gọi Điện (Trạng thái: {connectionStatus})</h5>
                        <div className="flex space-x-2 my-2">
                            <Input
                                type="tel" placeholder="Nhập số điện thoại cần gọi..." maxLength="15"
                                value={phoneNumber} style={{ backgroundColor: 'white' }}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') makeCall(); }}
                            />
                            <Button onClick={makeCall}>📞 Gọi</Button>
                        </div>
                        <div className="flex flex-col space-y-2 my-2">
                            <Label htmlFor="hotline-input">Số hotline gọi ra:</Label>
                            <div className="flex space-x-2 my-2">
                                <Input
                                    id="hotline-input" type="tel" value={hotline}
                                    style={{ backgroundColor: 'white' }}
                                    onChange={(e) => setHotline(e.target.value)}
                                    placeholder="Nhập số hotline..." maxLength="15"
                                />
                                <Button onClick={() => log(`Hotline đã cập nhật thành: ${hotline}`, 'success')}>Cập nhật</Button>
                            </div>
                        </div>
                        <div className="mt-6">
                            <h5 className="text-xl font-semibold text-blue-400 mb-2">Số gọi nhanh</h5>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" onClick={() => setPhoneNumber('842471233474')}>842471233474</Button>
                                <Button variant="secondary" onClick={() => setPhoneNumber('71308')}>71308 (Nhóm)</Button>
                                <Button variant="secondary" onClick={() => setPhoneNumber('100')}>100 (Nội bộ)</Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="call-info text-center">
                        <h3 className="text-2xl font-semibold text-blue-400 mb-4">Thông tin cuộc gọi</h3>
                        <div className="space-y-1 mb-4">
                            <p className="text-lg"><strong>Số gọi:</strong> <span>{callInfo.number}</span></p>
                            <p className="text-lg"><strong>Trạng thái:</strong> <span>{callInfo.state}</span></p>
                            <p className="text-lg"><strong>Thời gian:</strong> <span>{callInfo.duration}</span></p>
                        </div>
                        <div className="flex justify-center gap-4 mt-6">
                            <Button variant="secondary" onClick={toggleMute} className="rounded-full w-12 h-12 p-0 text-xl">{isMuted ? '🔊' : '🔇'}</Button>
                            <Button variant="secondary" className="rounded-full w-12 h-12 p-0 text-xl">📹</Button>
                            <Button variant="secondary" onClick={toggleHold} className="rounded-full w-12 h-12 p-0 text-xl">{isHeld ? '▶️' : '⏸️'}</Button>
                            <Button variant="secondary" onClick={toggleRecording} className={`rounded-full w-12 h-12 p-0 text-xl ${isRecording ? 'bg-red-600 hover:bg-red-700' : ''}`}>
                                {isRecording ? '⏹️' : '⏺️'}
                            </Button>
                            <Button variant="destructive" onClick={endCall} className="rounded-full w-12 h-12 p-0 text-xl">📴</Button>
                        </div>
                        {isRecording && (
                            <div className="recording-inline flex items-center justify-center gap-2 mt-4 text-red-500 font-bold">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                <span>Đang ghi:</span>
                                <span>{recTimer}</span>
                            </div>
                        )}
                        <div className="audio-controls mt-6 p-4 border border-gray-700 rounded-lg">
                            <h4 className="text-lg font-semibold text-blue-400 mb-3">Điều khiển âm thanh</h4>
                            <div className="flex flex-col space-y-3">
                                <div className="flex items-center space-x-2">
                                    <Label className="w-32 text-left">Mic Level:</Label>
                                    <div className="flex-1"><Progress value={micLevel} className="h-2" /></div>
                                    <span className="w-12 text-right">{micLevel}%</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Label className="w-32 text-left">Mic Gain:</Label>
                                    <Slider value={[micGain]} max={200} step={1} onValueChange={updateMicGain} className="w-full" />
                                    <span className="w-12 text-right">{micGain}%</span>
                                    <Button onClick={handleCalibrate}> {isCalibrating ? 'Đang chuẩn hóa...' : 'Chuẩn hóa'}</Button>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Label className="w-32 text-left">Volume:</Label>
                                    <Slider value={[volume]} max={100} step={1} onValueChange={updateVolume} className="w-full" />
                                    <span className="w-12 text-right">{volume}%</span>
                                </div>
                                <div className="flex flex-col space-y-2 mt-4">
                                    <h5 className="font-semibold text-gray-300">Cài đặt nâng cao</h5>
                                    {/* These are usually set on getUserMedia, so changing them mid-call has no effect. 
                                        Logic to re-acquire media is complex and omitted for simplicity. */}
                                    <div className="flex items-center space-x-2">
                                        <Switch checked={audioSettings.echoCancellation} onCheckedChange={(c) => setAudioSettings(s => ({ ...s, echoCancellation: c }))} /><Label>Echo Cancellation</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Switch checked={audioSettings.noiseSuppression} onCheckedChange={(c) => setAudioSettings(s => ({ ...s, noiseSuppression: c }))} /><Label>Noise Suppression</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Switch checked={audioSettings.autoGainControl} onCheckedChange={(c) => setAudioSettings(s => ({ ...s, autoGainControl: c }))} /><Label>Auto Gain Control</Label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {callInfo.isCalling && callInfo.isVideo && (
                    <div className="mt-8 relative w-full h-0 pb-[56.25%] bg-black rounded-lg overflow-hidden">
                        <video ref={localVideoRef} autoPlay muted playsInline className="absolute top-0 left-0 w-full h-full object-cover"></video>
                        <video ref={remoteVideoRef} autoPlay playsInline className="absolute bottom-4 right-4 w-36 h-24 object-cover border-2 border-white rounded-md"></video>
                    </div>
                )}
            </div>
            <div className="logs w-full max-w-2xl mt-2">
                <div className="log-container bg-gray-200 border rounded-lg p-4 h-52 overflow-y-auto text-sm">
                    <h4>Nhật ký hoạt động</h4>
                    {[...logMessages].reverse().map((msg, index) => ( // Reverse for chronological order display
                        <div key={index} className="mb-1">{msg}</div>
                    ))}
                </div>
            </div>
        </>
    );
};

export default OmicallInterface;