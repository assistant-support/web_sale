// components/OMICallClient.jsx
"use client";

/**
 * SALE UI (2 phần dọc)
 *  - Trên: kết nối + avatar + tên + phonex + nút Gọi/Kết thúc; khi gọi hiển thị trạng thái & thời lượng
 *  - Dưới: lịch sử cuộc gọi giữa customer - user
 * 
 * Điểm chính:
 *  - Lấy duration từ SDK event `on_calling` (callData.callingDuration.text), fallback theo acceptedAt→endedAt
 *  - Chặn lưu trùng: endedOnceRef, recordingStopOnceRef, modalShownRef
 *  - Lưu bằng server action + toast từ `sonner` (loading/success/error), không dùng useActionState
 */

import { useState, useEffect, useRef } from 'react';
import Script from 'next/script';
import { toast } from 'sonner';
import RecordingPlayer from '@/components/call/RecordingPlayer';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, PhoneOff, CircleDot, AlertCircle, CheckCircle } from 'lucide-react';

import { maskPhoneNumber } from '@/function/index';
import { saveCallAction, call_data } from '@/data/call/wraperdata.db';

// ==== CRM status (Step 4) ====
const CRM_STATUS_OPTIONS = [
    { value: 'consulted_pending_4', label: 'Đã tư vấn, chờ quyết định' },
    { value: 'callback_4', label: 'Yêu cầu gọi lại' },
    { value: 'not_interested_4', label: 'Không quan tâm' },
    { value: 'no_contact_4', label: 'Không liên lạc được' },
];

// Map SIP → Call.status (enum của model)
const toCallStatus = (sipCode, seconds) => {
    if (Number(seconds) > 0) return 'completed';
    const c = Number(sipCode) || 0;
    if (c === 486) return 'busy';
    if (c === 603) return 'rejected';
    if (c === 480 || c === 408) return 'no_answer';
    if (c === 487) return 'missed';
    if (c >= 500 || c >= 400) return 'failed';
    return 'failed';
};

// Parse "MM:SS" hoặc "HH:MM:SS" → seconds
const hhmmssToSec = (txt = '00:00') => {
    const parts = String(txt).split(':').map(n => Number(n) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
};

// ====== Popup lưu sau cuộc gọi (dùng toast) ======
function PostCallFormDialog({ isOpen, onOpenChange, lastCallInfo, customer, currentUser, onSaved }) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen || !lastCallInfo) return null;

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        const fd = new FormData(e.currentTarget);
        if (lastCallInfo.file) {
            fd.append('recordingFile', lastCallInfo.file, lastCallInfo.name);
        }
        // Server action cần:
        fd.set('userId', currentUser?._id || '');
        fd.set('duration', String(lastCallInfo.durationSec || 0));
        fd.set('startTime', lastCallInfo.startTime.toISOString());
        fd.set('callStatus', lastCallInfo.callStatus || 'completed');
        if (lastCallInfo.sipStatusCode != null) {
            fd.set('sipStatusCode', String(lastCallInfo.sipStatusCode));
        }

        setIsSubmitting(true);
        const promise = saveCallAction(null, fd);

        toast.promise(promise, {
            loading: 'Đang lưu kết quả & ghi âm...',
            success: (res) => {
                onOpenChange(false);
                onSaved?.(); // Cho parent refetch lịch sử ngay
                setIsSubmitting(false);
                return res?.message || 'Lưu cuộc gọi thành công!';
            },
            error: (err) => {
                setIsSubmitting(false);
                const msg = err?.error || err?.message || 'Lưu thất bại. Vui lòng thử lại.';
                return msg;
            },
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle></DialogTitle>
                    <h4>Cập nhật kết quả cuộc gọi</h4>
                    <DialogDescription>
                        Khách: <b>{customer?.name}</b> — Thời lượng: {lastCallInfo.durationText || '-'}
                        <br />
                        <span className="text-xs text-muted-foreground">
                            Trạng thái cuộc gọi: <b>{lastCallInfo.callStatus}</b>
                            {lastCallInfo.sipStatusCode ? ` (SIP ${lastCallInfo.sipStatusCode})` : ''}
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleFormSubmit}>
                    <input type="hidden" name="customerId" value={customer?._id || ''} />
                    <input type="hidden" name="recordingFileName" value={lastCallInfo.name || ''} />

                    <div className="py-2">
                        <Label className="text-sm mb-2 block">Trạng thái chăm sóc (Step 4)</Label>
                        <RadioGroup name="crmStatus" defaultValue={CRM_STATUS_OPTIONS[0].value} className="space-y-3">
                            {CRM_STATUS_OPTIONS.map(opt => (
                                <div key={opt.value} className="flex items-center space-x-2">
                                    <RadioGroupItem value={opt.value} id={opt.value} />
                                    <Label htmlFor={opt.value} className="cursor-pointer">{opt.label}</Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    <DialogFooter>
                        <div className="flex w-full justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Hủy</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Đang lưu...</>) : 'Lưu kết quả'}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function OMICallClient({ customer, user }) {
    // chuẩn hoá user
    const currentUser = Array.isArray(user) ? user[0] : user;
    const isAdmin = !!currentUser?.role?.includes('Admin');
    const playbackReadyRef = useRef(false);           // tránh retry vô hạn
    const playbackCtxRef = useRef(null);              // optional: dùng để resume
    // Kết nối / Call state

    const [connectionStatus, setConnectionStatus] = useState({ status: 'disconnected', text: 'Chưa kết nối' });
    const [callStage, setCallStage] = useState('idle'); // idle | connecting | ringing | in_call
    const [statusText, setStatusText] = useState('Sẵn sàng để gọi');
    const [durationText, setDurationText] = useState('00:00'); // cập nhật từ SDK on_calling
    const [isRecording, setIsRecording] = useState(false);

    // Popup lưu call
    const [isPostCallModalOpen, setIsPostCallModalOpen] = useState(false);
    const [lastCallInfo, setLastCallInfo] = useState(null);

    // Lịch sử customer-user
    const [callHistory, setCallHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState(null);

    // refs SDK & media
    const sdkRef = useRef(null);
    const currentCallRef = useRef(null);
    const remoteAudioRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);

    // Recoder/mix
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const mixedCtxRef = useRef(null);
    const mixedDestRef = useRef(null);

    // chống trùng
    const endedOnceRef = useRef(false);
    const recordingStopOnceRef = useRef(false);
    const modalShownRef = useRef(false);

    // ended info + duration tracking
    const lastEndInfoRef = useRef({ statusCode: null, by: null });
    const lastDurationSecRef = useRef(0);
    const acceptedAtRef = useRef(0);

    // hotline (sipNumber)
    const hotlineNumber = '842471233474';

    // ====== console log gọn ======
    const clog = (...args) => null;
    const ensureRemotePlayback = async (stream) => {
        const el = remoteAudioRef.current;
        if (!el || !stream) return;

        // Gán stream và cấu hình âm lượng tối đa
        if (el.srcObject !== stream) el.srcObject = stream;
        el.autoplay = true;
        el.playsInline = true;
        el.muted = false;
        el.volume = 1.0;

        // Nếu trình duyệt hỗ trợ chọn ngõ ra, đảm bảo dùng output mặc định
        try {
            if (typeof el.setSinkId === 'function') {
                await el.setSinkId('default');
            }
        } catch { /* bỏ qua nếu không hỗ trợ */ }

        // Thử play() với 4 lần retry, cách nhau 300ms
        for (let i = 0; i < 4; i++) {
            try {
                // 1) Một số trình duyệt cần AudioContext resume (nếu bạn dùng AudioContext ở nơi khác)
                if (playbackCtxRef.current && playbackCtxRef.current.state === 'suspended') {
                    await playbackCtxRef.current.resume().catch(() => { });
                }
                // 2) Nếu audio element chưa có metadata, chờ một nhịp
                if (el.readyState < 2) {
                    await new Promise(r => setTimeout(r, 120));
                }
                await el.play();
                playbackReadyRef.current = true;
                break;
            } catch {
                await new Promise(r => setTimeout(r, 300));
            }
        }

        // Nếu vẫn chưa phát được (autoplay policy), chờ 1 lần click tiếp theo rồi play
        if (!playbackReadyRef.current) {
            const onFirstUserGesture = async () => {
                try { await el.play(); } catch { }
                playbackReadyRef.current = true;
                document.removeEventListener('click', onFirstUserGesture, true);
                window.removeEventListener('keydown', onFirstUserGesture, true);
            };
            document.addEventListener('click', onFirstUserGesture, true);
            window.addEventListener('keydown', onFirstUserGesture, true);
        }
    };

    // ====== SDK ======
    const handleSDKLoad = () => {
        clog('SDK script loaded');
        if (window.OMICallSDK) initializeSDK();
    };

    useEffect(() => {
        return () => {
            clog('Unmount cleanup');
            if (sdkRef.current?.destroy) sdkRef.current.destroy();
            const script = document.getElementById('omicall-sdk-script');
            if (script) document.body.removeChild(script);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const initializeSDK = async () => {
        try {
            // Init có ui, nếu lỗi → fallback plain
            clog('SDK init() with ui');
            let ok = false;
            try {
                ok = await window.OMICallSDK.init({ lng: 'vi', ui: { toggleDial: 'hide' }, ringtoneVolume: 0.9 });
            } catch (e) {
                clog('SDK init ui error → fallback:', e?.message || e);
            }
            if (!ok) {
                clog('SDK init() fallback plain');
                ok = await window.OMICallSDK.init({ lng: 'vi' });
            }
            clog('SDK init() result:', ok);
            if (!ok) throw new Error('SDK init failed');

            sdkRef.current = window.OMICallSDK;
            setupEventListeners();
            await connectToServer();
        } catch (err) {
            clog('SDK init ERROR:', err);
            setConnectionStatus({ status: 'disconnected', text: 'Lỗi khởi tạo' });
        }
    };

    const connectToServer = async () => {
        try {
            setConnectionStatus({ status: 'connecting', text: 'Đang kết nối...' });
            clog('register() start');
            const registerStatus = await sdkRef.current.register({
                sipRealm: 'thanhnth',
                sipUser: '100',
                sipPassword: 'LCJw1HK8i2',
            });
            clog('register() result:', registerStatus);
            if (!registerStatus?.status) throw new Error(registerStatus?.error || 'register failed');
            setConnectionStatus({ status: 'connected', text: 'Đã kết nối' }); // đề phòng event tới trễ
        } catch (err) {
            clog('connectToServer ERROR:', err);
            setConnectionStatus({ status: 'disconnected', text: 'Kết nối thất bại' });
            toast.error('Kết nối tổng đài thất bại. Vui lòng thử lại.');
        }
    };

    const setupEventListeners = () => {
        const sdk = sdkRef.current;
        if (!sdk) return;
        clog('setupEventListeners()');

        // Kết nối tổng đài
        sdk.on('register', (data) => {
            clog('event: register', data);
            const map = {
                connected: { status: 'connected', text: 'Đã kết nối' },
                connecting: { status: 'connecting', text: 'Đang kết nối...' },
                disconnect: { status: 'disconnected', text: 'Mất kết nối' },
            };
            setConnectionStatus(map[data?.status] || { status: 'disconnected', text: 'Không xác định' });
        });

        // Dòng sự kiện cuộc gọi
        sdk.on('connecting', (callData) => {
            clog('event: connecting', callData);
            resetPerCallFlags();
            currentCallRef.current = callData;
            setCallStage('connecting');
            setStatusText('Đang kết nối...');
            setDurationText('00:00');
            lastDurationSecRef.current = 0;
            acceptedAtRef.current = 0;
        });

        sdk.on('ringing', (callData) => {
            clog('event: ringing', callData);
            currentCallRef.current = callData;
            setCallStage('ringing');
            setStatusText('Đang đổ chuông...');
        });

        sdk.on('accepted', (callData) => {
            clog('event: accepted');
            onAccepted(callData);
        });

        // Tick thời lượng
        sdk.on('on_calling', (callData) => {
            const text = callData?.callingDuration?.text || '00:00';
            setDurationText(text);
            lastDurationSecRef.current = hhmmssToSec(text);
        });

        sdk.on('ended', (info) => {
            clog('event: ended', info);
            onEnded(info);
        });
    };

    const resetPerCallFlags = () => {
        endedOnceRef.current = false;
        recordingStopOnceRef.current = false;
        modalShownRef.current = false;
        lastEndInfoRef.current = { statusCode: null, by: null };
    };

    // ====== CALL FLOW ======
    const onAccepted = (callData) => {
        currentCallRef.current = callData;
        setCallStage('in_call');
        setStatusText('Đang trong cuộc gọi');
        acceptedAtRef.current = Date.now();

        localStreamRef.current = callData?.streams?.local || null;
        remoteStreamRef.current = callData?.streams?.remote || null;

        // PHÁT remote cho sale nghe — gọi ngay khi có stream
        ensureRemotePlayback(remoteStreamRef.current);

        // Nếu remote track tới MUỘN, gắn listener để phát lại
        try {
            remoteStreamRef.current?.addEventListener?.('addtrack', () => {
                ensureRemotePlayback(remoteStreamRef.current);
            });
        } catch { }

        // ✅ Recorder vẫn như cũ
        startRecording();
    };


    const onEnded = (info) => {
        if (endedOnceRef.current) {
            clog('onEnded ignored (already handled)');
            return;
        }
        endedOnceRef.current = true;

        const code = info?.statusCode ?? info?.code ?? info?.reasonCode ?? null;
        const by = info?.by || null;
        lastEndInfoRef.current = { statusCode: code, by };

        setCallStage('idle');
        setStatusText('Sẵn sàng để gọi');

        stopRecording(); // sẽ mở popup 1 lần
        currentCallRef.current = null;
    };

    // Sau khi popup đóng & đã có lastCallInfo → refetch lịch sử (đã gọi onSaved trong toast.success)
    const afterSaved = () => fetchCallHistory();

    // ====== ACTIONS ======
    const makeCall = async () => {
        try {
            if (connectionStatus.status !== 'connected') {
                toast.error('Chưa kết nối tổng đài.');
                return;
            }
            if (currentCallRef.current) {
                toast.warning('Đang có cuộc gọi khác.');
                return;
            }
            const target = customer?.phone;
            if (!target) {
                toast.error('Thiếu số điện thoại khách hàng.');
                return;
            }
            clog('makeCall →', target);

            // Yêu cầu mic trước call (giống logic gốc)
            await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false
            });

            await sdkRef.current.makeCall(target, {
                isVideo: false,
                sipNumber: { number: hotlineNumber },
                userData: `Gọi từ web app - ${new Date().toLocaleString('vi-VN')}`
            });
        } catch (err) {
            const msg = err?.message || 'Không thể thực hiện cuộc gọi.';
            toast.error(msg);
            clog('makeCall ERROR:', msg);
        }
    };

    const endCall = () => {
        clog('endCall pressed');
        currentCallRef.current?.end();
    };

    // ====== Recording (mix local + remote) ======
    const startRecording = () => {
        try {
            clog('startRecording');
            // Tạo mix dest
            if (!mixedCtxRef.current) {
                mixedCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            // luôn tạo dest mới cho mỗi cuộc
            mixedDestRef.current = mixedCtxRef.current.createMediaStreamDestination();

            if (localStreamRef.current) {
                const localSrc = mixedCtxRef.current.createMediaStreamSource(localStreamRef.current);
                localSrc.connect(mixedDestRef.current);
            }
            if (remoteStreamRef.current) {
                const remoteSrc = mixedCtxRef.current.createMediaStreamSource(remoteStreamRef.current);
                remoteSrc.connect(mixedDestRef.current);
            }

            recordedChunksRef.current = [];
            mediaRecorderRef.current = new MediaRecorder(mixedDestRef.current.stream, { mimeType: 'audio/webm;codecs=opus' });
            mediaRecorderRef.current.ondataavailable = (e) => e.data?.size > 0 && recordedChunksRef.current.push(e.data);
            mediaRecorderRef.current.start();
            setIsRecording(true);
            clog('Recording started');
        } catch (err) {
            clog('Recording start ERROR:', err?.message || err);
        }
    };

    const stopRecording = () => {
        try {
            if (recordingStopOnceRef.current) {
                clog('stopRecording ignored (already called)');
                return;
            }
            recordingStopOnceRef.current = true;

            clog('stopRecording');
            const rec = mediaRecorderRef.current;
            if (rec && rec.state === 'recording') {
                rec.onstop = () => {
                    clog('MediaRecorder.onstop');

                    if (!modalShownRef.current) {
                        // Tính duration: ưu tiên SDK; fallback acceptedAt→now
                        const sdkSec = lastDurationSecRef.current || 0;
                        const fallbackSec = acceptedAtRef.current ? Math.max(0, Math.floor((Date.now() - acceptedAtRef.current) / 1000)) : 0;
                        const durationSec = sdkSec || fallbackSec || hhmmssToSec(durationText);
                        const durationTextFinal = durationSec ? new Date(durationSec * 1000).toISOString().substr(14, 5) : (durationText || '00:00');

                        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
                        const fileName = `rec-${customer?.phone || 'unknown'}-${new Date().toISOString().replace(/:/g, '-')}.webm`;

                        const startTime = new Date(Date.now() - durationSec * 1000);
                        const sipCode = lastEndInfoRef.current?.statusCode ?? null;
                        const mapped = toCallStatus(sipCode, durationSec);

                        const file = new File([blob], fileName, { type: 'audio/webm' });
                        setLastCallInfo({
                            file,
                            name: fileName,
                            durationText: durationTextFinal,
                            durationSec,
                            startTime,
                            sipStatusCode: sipCode,
                            callStatus: mapped,
                        });

                        modalShownRef.current = true;
                        setIsPostCallModalOpen(true);
                        clog('Open PostCall modal');
                    }

                    recordedChunksRef.current = [];
                    setIsRecording(false);
                    setDurationText('00:00');
                };
                rec.stop();
            } else {
                clog('MediaRecorder not recording → skip');
            }
        } catch (err) {
            clog('Recording stop ERROR:', err?.message || err);
        }
    };

    // ====== History (customer-user) ======
    const fetchCallHistory = async () => {
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            let rows = [];
            if (customer?._id) {
                rows = await call_data({ customerId: customer._id });
                rows = (Array.isArray(rows) ? rows : []).filter(
                    (c) => String(c.user?._id || c.user) === String(currentUser?._id)
                );
            } else {
                rows = [];
            }
            setCallHistory(rows);
            clog('History fetched:', rows?.length || 0, 'items');
        } catch (e) {
            const msg = e?.message || 'Không thể tải lịch sử cuộc gọi.';
            setHistoryError(msg);
            clog('History ERROR:', msg);
        } finally {
            setHistoryLoading(false);
        }
    };
    useEffect(() => { fetchCallHistory(); /* eslint-disable-next-line */ }, [customer?._id, currentUser?._id]);

    // ====== UI (2 phần dọc) ======
    const displayPhoneMasked = customer?.phonex ?? maskPhoneNumber(customer?.phone);

    const TopSection = () => (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Thông tin & Gọi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Kết nối */}
                <div className="flex items-center gap-2 justify-center">
                    {connectionStatus.status === 'connected' && <CheckCircle className="h-5 w-5 text-green-500" />}
                    {connectionStatus.status === 'connecting' && <Loader2 className="h-5 w-5 animate-spin" />}
                    {connectionStatus.status === 'disconnected' && <AlertCircle className="h-5 w-5 text-red-500" />}
                    <span className="font-medium">{connectionStatus.text}</span>
                </div>

                {/* Avatar + Tên + phonex */}
                <div className="flex items-center gap-3 justify-center">
                    <Avatar className="w-10 h-10">
                        <AvatarImage src={customer?.zaloavt} alt={customer?.name} />
                        <AvatarFallback>{customer?.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="text-center">
                        <div className="font-semibold">{customer?.name || '-'}</div>
                        <div className="text-sm text-muted-foreground">{displayPhoneMasked || '—'}</div>
                    </div>
                </div>

                {/* Nút gọi/Kết thúc (không cho đổi số) */}
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

                {/* Khi đang gọi: trạng thái + thời gian */}
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
    );

    const BottomSection = () => (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Lịch sử cuộc gọi (giữa bạn và khách này)</CardTitle>
            </CardHeader>
            <CardContent>
                {historyLoading && <p className="text-sm text-muted-foreground">Đang tải lịch sử…</p>}
                {historyError && <p className="text-sm text-red-500">Lỗi: {historyError}</p>}
                {!historyLoading && !historyError && callHistory.length === 0 && (
                    <p className="text-sm text-muted-foreground">Chưa có lịch sử.</p>
                )}
                <div className="divide-y rounded-md border bg-white max-h-80 overflow-auto">
                    {callHistory.map((h) => (
                        <div key={h._id} className="p-3 flex items-center gap-3">
                            <div className="flex-1">
                                <div className="font-medium flex">
                                    <h5>{new Date(h.createdAt).toLocaleString('vi-VN')}</h5>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    NV: <b>{h.user?.name || '-'}</b>
                                    {' • '}Trạng thái: <b>{h.status}</b>
                                    {' • '}Thời lượng: <span className="font-mono">{(h.duration ?? 0)}s</span>
                                </div>
                            </div>

                            {/* Player ẩn nguồn */}
                            {h.file && (
                                <div className="w-72">
                                    <RecordingPlayer callId={h._id} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );

    return (
        <>
            {/* OMICall SDK */}
            <Script
                id="omicall-sdk-script"
                src="https://cdn.omicrm.com/sdk/web/3.0.0/core.min.js"
                onLoad={handleSDKLoad}
                strategy="lazyOnload"
            />

            <div className="p-4 max-w-3xl scroll space-y-6">
                <TopSection />
                <BottomSection />
            </div>

            {/* Popup lưu kết quả sau khi gọi */}
            <PostCallFormDialog
                isOpen={isPostCallModalOpen}
                onOpenChange={setIsPostCallModalOpen}
                lastCallInfo={lastCallInfo}
                customer={customer}
                currentUser={currentUser}
                onSaved={afterSaved}
            />

            {/* Remote audio output (ẩn) */}
            <audio ref={remoteAudioRef} playsInline style={{ display: 'none' }} />
        </>
    );
}
