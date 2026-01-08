'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { QrCode, Loader2, User, X, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getSocket } from '@/lib/realtime/socket-client';
import { toast } from 'sonner';
import ZaloQR from './ZaloQR';

export default function ZaloSystemModal({ isOpen, onClose }) {
    const [activeTab, setActiveTab] = useState('login'); // 'login' hoặc 'accounts'
    const [accounts, setAccounts] = useState([]);
    const [totalCount, setTotalCount] = useState(0); // Tổng số lượng tài khoản từ database
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
    const [socket, setSocket] = useState(null);
    const [showQRModal, setShowQRModal] = useState(false);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false); // Đánh dấu đã load ít nhất 1 lần

    // Lấy socket instance
    useEffect(() => {
        const socketInstance = getSocket();
        setSocket(socketInstance);
    }, []);

    const loadAccounts = useCallback((showLoading = true, keepOldData = false) => {
        if (!socket || !socket.connected) {
            console.warn('[ZaloSystemModal] Socket not connected');
            return;
        }

        // Chỉ hiển thị loading nếu chưa có dữ liệu hoặc yêu cầu hiển thị loading
        if (showLoading && !hasLoadedOnce) {
            setIsLoadingAccounts(true);
        }
        console.log('[ZaloSystemModal] Requesting accounts list...');
        
        socket.emit('zalo:getAccounts', {}, (response) => {
            setIsLoadingAccounts(false);
            if (response && response.ok) {
                console.log('[ZaloSystemModal] Accounts received:', response.accounts);
                setAccounts(response.accounts || []);
                setTotalCount(response.totalCount || response.accounts?.length || 0);
                setHasLoadedOnce(true);
            } else {
                console.error('[ZaloSystemModal] Failed to load accounts:', response?.error);
                console.error('[ZaloSystemModal] Error message:', response?.message);
                // Chỉ clear data nếu không giữ dữ liệu cũ
                if (!keepOldData) {
                    setAccounts([]);
                    setTotalCount(0);
                }
                // Hiển thị thông báo lỗi nếu có
                if (response?.message) {
                    // Có thể thêm toast notification ở đây nếu cần
                }
            }
        });
    }, [socket, hasLoadedOnce]);

    // Cập nhật trạng thái tài khoản mỗi lần mở modal
    const updateAccountStatus = useCallback(() => {
        if (!socket || !socket.connected) {
            console.warn('[ZaloSystemModal] Socket not connected, cannot update account status');
            return;
        }

        console.log('[ZaloSystemModal] Updating account status...');
        
        socket.emit('zalo:updateAccountStatus', {}, (response) => {
            if (response && response.ok) {
                console.log('[ZaloSystemModal] Account status updated:', response.results);
                // Sau khi cập nhật trạng thái, load lại danh sách để hiển thị trạng thái mới
                // Nhưng không hiển thị loading và giữ dữ liệu cũ để tránh nhấp nháy
                if (activeTab === 'accounts') {
                    setTimeout(() => loadAccounts(false, true), 500);
                }
            } else {
                console.error('[ZaloSystemModal] Failed to update account status:', response?.error);
            }
        });
    }, [socket, activeTab, loadAccounts]);

    // Reset hasLoadedOnce khi mở/đóng modal
    useEffect(() => {
        if (isOpen) {
            setHasLoadedOnce(false);
        }
    }, [isOpen]);

    // Gọi updateAccountStatus và load số lượng tài khoản mỗi lần mở modal
    useEffect(() => {
        if (isOpen && socket) {
            // Gọi updateAccountStatus ngay khi mở modal
            updateAccountStatus();
            
            // Load số lượng tài khoản ngay khi mở modal
            // Nếu đang ở tab accounts và chưa có dữ liệu, hiển thị loading
            // Nếu đang ở tab login, chỉ load totalCount không hiển thị loading
            const timer = setTimeout(() => {
                const shouldShowLoading = activeTab === 'accounts';
                loadAccounts(shouldShowLoading, true);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isOpen, socket, updateAccountStatus, loadAccounts, activeTab]);

    // Lấy danh sách tài khoản khi chuyển sang tab accounts
    useEffect(() => {
        if (isOpen && activeTab === 'accounts' && socket) {
            // Chỉ load nếu chưa có dữ liệu hoặc chưa load lần nào
            if (!hasLoadedOnce) {
                const timer = setTimeout(() => {
                    loadAccounts(true, true);
                }, 100);
                return () => clearTimeout(timer);
            }
        }
    }, [activeTab, socket, isOpen, hasLoadedOnce, loadAccounts]);

    // Lắng nghe event khi có tài khoản mới đăng nhập
    useEffect(() => {
        if (!socket) return;

        const handleLoginSuccess = () => {
            // Tự động refresh số lượng và danh sách
            // Giữ dữ liệu cũ để tránh nhấp nháy
            loadAccounts(false, true);
        };

        socket.on('zalo:qr:loginSuccess', handleLoginSuccess);

        return () => {
            socket.off('zalo:qr:loginSuccess', handleLoginSuccess);
        };
    }, [socket, activeTab]);


    const handleOpenQR = () => {
        setShowQRModal(true);
    };

    const handleCloseQR = () => {
        setShowQRModal(false);
        // Refresh số lượng và danh sách sau khi đóng QR modal (có thể đã đăng nhập thành công)
        // Giữ dữ liệu cũ để tránh nhấp nháy
        setTimeout(() => {
            loadAccounts(false, true);
        }, 1000);
    };

    // Hàm xóa tài khoản
    const handleDeleteAccount = useCallback((accountKey, displayName) => {
        if (!socket || !socket.connected) {
            toast.error('Socket chưa kết nối');
            return;
        }

        // Xác nhận trước khi xóa
        if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${displayName || accountKey}"?`)) {
            return;
        }

        console.log('[ZaloSystemModal] Deleting account:', accountKey);
        
        socket.emit('zalo:deleteAccount', { accountKey }, (response) => {
            if (response && response.ok) {
                console.log('[ZaloSystemModal] Account deleted successfully:', accountKey);
                toast.success('Đã xóa tài khoản thành công');
                // Refresh danh sách sau khi xóa
                setTimeout(() => {
                    loadAccounts(true, false);
                }, 300);
            } else {
                console.error('[ZaloSystemModal] Failed to delete account:', response?.error);
                toast.error(response?.error || 'Không thể xóa tài khoản');
            }
        });
    }, [socket, loadAccounts]);

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle style={{ textAlign: 'center', fontSize: '18px', fontWeight: 'bold' }}>Zalo Hệ Thống</DialogTitle>
                        <DialogDescription style={{ fontSize: '14px', color: '#666' }}>
                            Quản lý tài khoản Zalo đã đăng nhập
                        </DialogDescription>
                    </DialogHeader>
                    
                    {/* Tabs */}
                    <div className="flex border-b mb-4">
                        <button
                            onClick={() => setActiveTab('login')}
                            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                                activeTab === 'login'
                                    ? 'border-b-2 border-primary text-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <QrCode className="inline-block mr-2 h-4 w-4" />
                            Đăng nhập QR
                        </button>
                        <button
                            onClick={() => setActiveTab('accounts')}
                            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                                activeTab === 'accounts'
                                    ? 'border-b-2 border-primary text-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <User className="inline-block mr-2 h-4 w-4" />
                            Danh sách tài khoản ({totalCount > 0 ? totalCount : accounts.length})
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto">
                        {activeTab === 'login' ? (
                            <div className="flex flex-col items-center justify-center p-6 space-y-4">
                                
                                <Button
                                    onClick={handleOpenQR}
                                    variant="default"
                                    size="lg"
                                    className="w-full"
                                >
                                    <QrCode className="h-4 w-4 mr-2" />
                                    Tạo QR Đăng Nhập
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {isLoadingAccounts && !hasLoadedOnce ? (
                                    <div className="flex flex-col items-center justify-center p-8">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                                        <p className="text-sm text-muted-foreground">Đang tải danh sách tài khoản...</p>
                                    </div>
                                ) : accounts.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-8">
                                        <User className="h-12 w-12 text-muted-foreground mb-4" />
                                        <p className="text-sm text-muted-foreground">Chưa có tài khoản nào đăng nhập</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {accounts.map((account, index) => (
                                            <div
                                                key={account.accountKey || account.zaloId || `account-${index}`}
                                                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent transition-colors "
                                                style={{ fontSize: '14px', color: '#666' }}
                                            >
                                                <Avatar className="h-12 w-12">
                                                    <AvatarImage 
                                                        src={account.avatar || undefined} 
                                                        alt={account.displayName || 'User'} 
                                                    />
                                                    <AvatarFallback>
                                                        {account.displayName?.charAt(0)?.toUpperCase() || 'U'}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold truncate"  style={{ fontSize: '13px', color: '#666' }}>
                                                        {account.displayName || 'Người dùng Zalo'}
                                                    </h4>
                                                    <p className="text-sm text-muted-foreground truncate" style={{ fontSize: '13px', color: '#666' }}>
                                                        ID: {account.zaloId}
                                                    </p>
                                                    {account.phoneMasked && (
                                                        <p className="text-xs text-muted-foreground" style={{ fontSize: '13px', color: '#666' }}>
                                                            {account.phoneMasked}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    <span className={`text-xs px-2 py-1 rounded ${
                                                        account.status === 'active' 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : account.status === 'disconnected'
                                                            ? 'bg-yellow-100 text-yellow-800'
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {account.status === 'active' ? 'Hoạt động' : 
                                                         account.status === 'disconnected' ? 'Mất kết nối' : 'Đã khóa'}
                                                    </span>
                                                    <Button
                                                        onClick={() => handleDeleteAccount(account.accountKey, account.displayName)}
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                        title="Xóa tài khoản"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* QR Modal */}
            <ZaloQR isOpen={showQRModal} onClose={handleCloseQR} />
        </>
    );
}

