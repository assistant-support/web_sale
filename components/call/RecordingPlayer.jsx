"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCw } from "lucide-react";
import { toast } from "sonner";

// format mm:ss
const fmt = (s) => {
    const mm = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

/**
 * Props:
 *  - callId: string (Mongo _id của Call)
 *  - className?: string
 */
export default function RecordingPlayer({ callId, className }) {
    const audioRef = useRef(null);

    const [src, setSrc] = useState(null);      // ❗ KHÔNG để chuỗi rỗng
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [dur, setDur] = useState(0);
    const [cur, setCur] = useState(0);
    const [seeking, setSeeking] = useState(false);
    const [error, setError] = useState("");

    // Kiểm tra support webm/opus (Safari có thể không phát được)
    const webmSupported = useMemo(() => {
        if (typeof document === "undefined") return true;
        const a = document.createElement("audio");
        if (!a || !a.canPlayType) return true;
        return !!(a.canPlayType('audio/webm;codecs="opus"') || a.canPlayType("audio/webm"));
    }, []);

    useEffect(() => {
        // Build URL stream từ API của bạn
        if (!callId) {
            setSrc(null);
            return;
        }
        setSrc(`/api/calls/${encodeURIComponent(callId)}/audio`);
        setError("");
        setReady(false);
        setDur(0);
        setCur(0);
        setPlaying(false);
    }, [callId]);

    const onLoaded = () => {
        if (!audioRef.current) return;
        const d = audioRef.current.duration;
        setDur(Number.isFinite(d) ? d : 0);
        setReady(true);
        setLoading(false);
    };

    const onTimeUpdate = () => {
        if (seeking || !audioRef.current) return;
        setCur(audioRef.current.currentTime);
    };

    const onEnded = () => {
        setPlaying(false);
        setCur(0);
    };

    const onAudioError = (e) => {
        // Thường do 401/403/404 hoặc Safari không support webm
        setLoading(false);
        setReady(false);
        setPlaying(false);
        const msg = webmSupported
            ? "Không thể tải ghi âm. Kiểm tra quyền hoặc file."
            : "Trình duyệt không hỗ trợ định dạng WebM/Opus. Vui lòng dùng Chrome/Edge, hoặc đổi định dạng ghi âm.";
        setError(msg);
        toast.error(msg);
    };

    const reload = () => {
        if (!src) return;
        setLoading(true);
        setError("");
        // Force refresh bằng cache-buster nhẹ
        const url = new URL(src, window.location.origin);
        url.searchParams.set("_", Date.now().toString());
        setSrc(url.pathname + "?" + url.searchParams.toString());
    };

    const toggle = async () => {
        if (!audioRef.current || !ready) return;
        if (playing) {
            audioRef.current.pause();
            setPlaying(false);
        } else {
            try {
                await audioRef.current.play();
                setPlaying(true);
            } catch (e) {
                setPlaying(false);
                toast.error(e?.message || "Không phát được ghi âm");
            }
        }
    };

    const onSeek = (e) => {
        setSeeking(true);
        setCur(Number(e.target.value));
    };
    const onSeekEnd = () => {
        if (audioRef.current) audioRef.current.currentTime = cur;
        setSeeking(false);
    };

    return (
        <div className={`w-full flex items-center gap-3 ${className || ""}`}>
            {/* ❗ Không render audio khi chưa có src để tránh src="" */}
            {src && (
                <audio
                    key={src} // Force re-init mỗi lần đổi link (cache-buster)
                    ref={audioRef}
                    src={src ?? undefined}
                    preload="metadata"
                    onLoadedMetadata={onLoaded}
                    onTimeUpdate={onTimeUpdate}
                    onEnded={onEnded}
                    onError={onAudioError}
                    // Ẩn controls mặc định, không lộ nguồn
                    controls={false}
                    controlsList="nodownload noplaybackrate noremoteplayback"
                />
            )}

            <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={toggle}
                disabled={!src || !ready || loading}
                title={!src ? "Chưa sẵn sàng" : ready ? "Phát / Tạm dừng" : "Đang nạp"}
            >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>

            <div className="flex-1 flex items-center gap-2">
                <span className="text-xs tabular-nums w-10 text-right">{fmt(cur)}</span>
                <input
                    type="range"
                    min={0}
                    max={Math.max(1, Math.floor(dur))}
                    value={Math.floor(cur)}
                    onChange={onSeek}
                    onMouseUp={onSeekEnd}
                    onTouchEnd={onSeekEnd}
                    className="w-full accent-primary"
                    disabled={!ready || !src || loading}
                />
                <span className="text-xs tabular-nums w-10">{dur ? fmt(dur) : "--:--"}</span>
            </div>

            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={reload}
                disabled={!src}
                title="Tải lại"
            >
                <RotateCw className="h-4 w-4" />
            </Button>

            {/* Thông báo lỗi gọn ở cạnh (tuỳ UI bạn có thể bỏ) */}
            {error ? <span className="text-xs text-red-500 truncate">{error}</span> : null}
        </div>
    );
}
