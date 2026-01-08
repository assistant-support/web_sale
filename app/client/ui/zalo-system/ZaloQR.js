'use client';

import React, { useState, useEffect, useRef } from 'react';
import { QrCode, Loader2, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/realtime/socket-client';

export default function ZaloQR({ isOpen, onClose }) {
    const router = useRouter();
    const [qrUrl, setQrUrl] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loginId, setLoginId] = useState(null);
    const [userInfo, setUserInfo] = useState(null);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    
    // Ref để lưu socket instance (không cần state vì socket là singleton)
    const socketRef = useRef(null);
    const isLoadingRef = useRef(false);

    // Lấy socket instance (singleton)
    useEffect(() => {
        socketRef.current = getSocket();
    }, []);

    // Lắng nghe sự kiện đăng nhập thành công từ server
    useEffect(() => {
        const socket = socketRef.current;
        if (!socket) return;

        const handleLoginSuccess = (data) => {
            console.log('[ZaloQR] 📥 Login success event received:', data);
            
            // Kiểm tra xem loginId có khớp không
            if (data.loginId === loginId) {
                console.log('[ZaloQR] ✅ LoginId matches, processing login success');
                setUserInfo(data.profile);
                setShowSuccessPopup(true);
                toast.success('Đăng nhập thành công!');
                
                // Dừng QR session trên server
                socket.emit('zalo:qr:stop', { loginId });
            } else {
                console.warn('[ZaloQR] ⚠️ LoginId mismatch:', {
                    received: data.loginId,
                    expected: loginId
                });
            }
        };

        socket.on('zalo:qr:loginSuccess', handleLoginSuccess);

        return () => {
            socket.off('zalo:qr:loginSuccess', handleLoginSuccess);
        };
    }, [loginId]);

    // Khi mở popup: emit zalo:qr:start và lắng nghe QR response
    useEffect(() => {
        if (!isOpen) {
            // Khi đóng popup, emit stop nếu có loginId
            const socket = socketRef.current;
            if (socket && loginId) {
                console.log('[ZaloQR] Closing popup, emitting zalo:qr:stop for loginId:', loginId);
                socket.emit('zalo:qr:stop', { loginId });
                // Reset state
                setQrUrl(null);
                setIsLoading(false);
                setLoginId(null);
                setUserInfo(null);
                setShowSuccessPopup(false);
                isLoadingRef.current = false;
            }
            return;
        }
        
        const socket = socketRef.current;
        if (!socket) {
            console.error('[ZaloQR] Socket not available');
            return;
        }

        // Reset state khi mở popup
        setQrUrl(null);
        setIsLoading(false);
        setLoginId(null);
        setUserInfo(null);
        setShowSuccessPopup(false);
        isLoadingRef.current = false;

        let currentLoginId = null;

        // Lắng nghe QR response từ server
        const handleQRResponse = (data) => {
            console.log('[ZaloQR] 📥 QR response received:', data);
            if (data && data.qrPublicUrl) {
                let qrPublicUrl = data.qrPublicUrl;
                // Nếu URL là relative path, thêm base URL
                if (!qrPublicUrl.startsWith('http://') && !qrPublicUrl.startsWith('https://')) {
                    const socketUrl = process.env.NEXT_PUBLIC_REALTIME_URL || 'http://localhost:3001';
                    qrPublicUrl = `${socketUrl}${qrPublicUrl.startsWith('/') ? '' : '/'}${qrPublicUrl}`;
                }
                // Thêm timestamp để tránh cache
                const separator = qrPublicUrl.includes('?') ? '&' : '?';
                qrPublicUrl = `${qrPublicUrl}${separator}t=${Date.now()}`;
                setQrUrl(qrPublicUrl);
                currentLoginId = data.loginId;
                setLoginId(data.loginId);
                setIsLoading(false);
                isLoadingRef.current = false;
                toast.success('Đã tạo QR code thành công!');
            }
        };

        // Lắng nghe lỗi QR
        const handleQRError = (error) => {
            console.error('[ZaloQR] QR error:', error);
            setIsLoading(false);
            isLoadingRef.current = false;
            toast.error(error?.message || 'Không thể tạo QR code');
        };

        socket.on('zalo:qr', handleQRResponse);
        socket.on('zalo:qr:error', handleQRError);

        // Emit zalo:qr:start để bắt đầu tạo QR
        if (!isLoadingRef.current) {
            isLoadingRef.current = true;
            setIsLoading(true);
            console.log('[ZaloQR] Emitting zalo:qr:start...');
            socket.emit('zalo:qr:start', { userAgent: navigator.userAgent });
        }

        // Cleanup: emit zalo:qr:stop và remove listeners
        return () => {
            console.log('[ZaloQR] Cleaning up QR session...');
            if (currentLoginId) {
                socket.emit('zalo:qr:stop', { loginId: currentLoginId });
            }
            socket.off('zalo:qr', handleQRResponse);
            socket.off('zalo:qr:error', handleQRError);
        };
    }, [isOpen]); // Chỉ phụ thuộc vào isOpen, không phụ thuộc vào loginId

    // Hàm đóng popup QR
    const handleCloseQRPopup = (open) => {
        if (open === false) {
            const socket = socketRef.current;
            if (socket && loginId) {
                // Emit stop để server dừng QR session
                socket.emit('zalo:qr:stop', { loginId });
            }
            // Reset state
            setQrUrl(null);
            setIsLoading(false);
            setLoginId(null);
            setUserInfo(null);
            setShowSuccessPopup(false);
            isLoadingRef.current = false;
            // Đóng popup cha
            onClose();
        }
    };

    // Hàm đóng popup thành công
    const handleCloseSuccessPopup = () => {
        setShowSuccessPopup(false);
        setUserInfo(null);
        // Refresh để cập nhật danh sách tài khoản
        router.refresh();
        // Đóng tất cả popup
        onClose();
    };

    return (
        <>
            {/* Popup hiển thị QR code */}
            <Dialog open={isOpen && !showSuccessPopup} onOpenChange={handleCloseQRPopup}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle style={{ fontSize: '25px' }}>Quét QR Code</DialogTitle>
                        <DialogDescription style={{ fontSize: '15px' }}>
                            Quét mã QR này bằng ứng dụng Zalo để đăng nhập vào hệ thống
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex flex-col items-center justify-center p-6 space-y-4">
                        {qrUrl ? (
                            <div className="bg-white p-4 rounded-lg border-2 border-gray-200 flex items-center justify-center">
                                <img
                                    src={qrUrl}
                                    alt="Zalo QR Code"
                                    className="w-64 h-64 object-contain"
                                    onLoad={() => {
                                        console.log('[ZaloQR] QR image loaded successfully');
                                    }}
                                    onError={(e) => {
                                        console.error('[ZaloQR] Failed to load QR image from:', qrUrl);
                                        toast.error('Không thể tải hình ảnh QR code. Vui lòng thử lại.');
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center space-y-4">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">
                                    Đang tải QR code...
                                </p>
                            </div>
                        )}
                        <Button
                            onClick={() => handleCloseQRPopup(false)}
                            variant="outline"
                            className="w-full"
                        >
                            Đóng
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Popup thứ ba: Hiển thị thông tin đăng nhập thành công */}
            <Dialog open={showSuccessPopup} onOpenChange={handleCloseSuccessPopup}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2" style={{ fontSize: '25px' }}>
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            Đăng nhập thành công
                        </DialogTitle>
                        <DialogDescription style={{ fontSize: '15px' }}>
                            Bạn đã đăng nhập thành công vào hệ thống Zalo
                        </DialogDescription>
                    </DialogHeader>
                    
                    {userInfo && (
                        <div className="flex flex-col items-center justify-center p-6 space-y-4">
                            {/* Avatar */}
                            <Avatar className="h-20 w-20">
                                <AvatarImage 
                                    src={userInfo.avatar || undefined} 
                                    alt={userInfo.displayName || 'User'} 
                                />
                                <AvatarFallback className="text-sm">
                                    {userInfo.displayName?.charAt(0)?.toUpperCase() || 'U'}
                                </AvatarFallback>
                            </Avatar>

                            {/* Thông tin user */}
                            <div className="text-center space-y-2">
                                <h3 className="text-lg font-semibold" style={{ fontSize: '20px' }}>
                                    {userInfo.displayName || 'Người dùng Zalo'}
                                </h3>
                                {userInfo.zaloId && (
                                    <p className="text-sm text-muted-foreground" style={{ fontSize: '15px' }}>
                                        ID: {userInfo.zaloId}
                                    </p>
                                )}
                                {userInfo.phone && (
                                    <p className="text-sm text-muted-foreground" style={{ fontSize: '15px' }}>
                                        Số điện thoại: {userInfo.phone}
                                    </p>
                                )}
                            </div>

                            <Button
                                onClick={handleCloseSuccessPopup}
                                variant="default"
                                className="w-full"
                                style={{ fontSize: '15px' }}
                            >
                                Đóng
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
