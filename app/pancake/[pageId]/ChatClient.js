'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Send, Loader2, Check, AlertCircle, ChevronLeft } from 'lucide-react';
import { getMessagesAction, sendMessageAction } from './actions';
import Image from 'next/image';
import Link from 'next/link';
import FallbackAvatar from '@/components/FallbackAvatar';

const avatar = ({ idpage, iduser }) => `https://pancake.vn/api/v1/pages/${idpage}/avatar/${iduser}`;

const MessageContent = ({ content }) => {
    if (!content) return <h5 className="italic text-gray-400 " style={{ textAlign: 'end' }}> Nội dung không hợp lệ</h5>;

    switch (content.type) {
        case 'text':
            return <h5 className="w" style={{ color: 'inherit', whiteSpace: 'wrap' }}>{content.content}</h5>;
        case 'image':
            return <img src={content.url} alt="Attachment" className="max-w-xs rounded-lg mt-1" />;
        case 'receipt':
            return (
                <div className="border-t border-gray-500/30 mt-2 pt-2">
                    <h5 className="font-bold">{content.title}</h5>
                    <h5 className="text-sm">Sản phẩm: {content.items}</h5>
                    <h5 className="text-sm font-semibold">Tổng cộng: {content.total}</h5>
                </div>
            );
        case 'system':
            return (
                <div className="w-full text-center my-2">
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">{content.content}</span>
                </div>
            );
        default:
            return <h5 className="italic text-gray-400">Tin nhắn không được hỗ trợ</h5>;
    }
};

const MessageStatus = ({ status, error }) => {
    switch (status) {
        case 'sending':
            return (
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-1 px-1 justify-end">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Đang gửi...</span>
                </div>
            );
        case 'sent':
            return (
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-1 px-1 justify-end">
                    <Check className="h-3 w-3" />
                    <span>Đã nhận</span>
                </div>
            );
        case 'failed':
            return (
                <div className="flex items-center gap-1 text-xs text-red-500 mt-1 px-1 justify-end">
                    <AlertCircle className="h-3 w-3" />
                    <span>Lỗi: {error}</span>
                </div>
            );
        default:
            return (
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-1 px-1 justify-end">
                    <Check className="h-3 w-3" />
                    <span>Đã nhận</span>
                </div>
            );
    }
}

export default function ChatClient({ initialConversations, initialError, pageConfig }) {
    const [conversations, setConversations] = useState(initialConversations);
    const [selectedConvo, setSelectedConvo] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const formRef = useRef(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!selectedConvo) return;

        const eventSource = new EventSource(
            `/api/messages/${selectedConvo.id}/stream?pageId=${pageConfig.id}&accessToken=${pageConfig.accessToken}`
        );

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'new-message') {
                const newMessage = data.payload;

                setMessages(prevMessages => {
                    // Xóa tin nhắn tạm (optimistic) nếu có trước khi thêm tin nhắn thật từ server
                    const filteredMessages = prevMessages.filter(msg => !msg.id.toString().startsWith('optimistic-'));

                    // Thêm tin nhắn mới nếu nó chưa tồn tại
                    if (!filteredMessages.some(msg => msg.id === newMessage.id)) {
                        return [...filteredMessages, { ...newMessage, status: 'sent' }];
                    }
                    return filteredMessages;
                });
            }
        };

        eventSource.onerror = (err) => {
            console.error('Lỗi EventSource:', err);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [selectedConvo, pageConfig.id, pageConfig.accessToken]);

    const handleSelectConvo = useCallback(async (conversation) => {
        if (selectedConvo?.id === conversation.id) return;

        setSelectedConvo(conversation);
        setMessages([]);
        setIsLoadingMessages(true);

        // Vẫn dùng getMessagesAction để tải lịch sử chat ban đầu
        const result = await getMessagesAction(pageConfig.id, pageConfig.accessToken, conversation.id);

        if (result.success) {
            const messagesWithStatus = result.data.map(m => ({ ...m, status: 'sent' }));
            setMessages(messagesWithStatus);
        } else {
            alert(`Error: ${result.error}`);
        }
        setIsLoadingMessages(false);
    }, [pageConfig, selectedConvo?.id]);

    const handleSendMessage = async (formData) => {
        const messageText = formData.get('message');
        if (!messageText?.trim() || !selectedConvo) return;

        const optimisticId = `optimistic-${Date.now()}`;
        const optimisticMessage = {
            id: optimisticId,
            inserted_at: new Date().toISOString(),
            senderType: 'page',
            content: { type: 'text', content: messageText.trim() },
            status: 'sending',
            error: null,
        };

        setMessages(prev => [...prev, optimisticMessage]);
        formRef.current?.reset();

        const result = await sendMessageAction(pageConfig.id, pageConfig.accessToken, selectedConvo.id, messageText);
        if (result.success) {
            setMessages(prev => prev.map(msg =>
                msg.id === optimisticId
                    ? { ...msg, status: 'sent' }
                    : msg
            ));
        } else {
            setMessages(prev => prev.map(msg =>
                msg.id === optimisticId
                    ? { ...msg, status: 'failed', error: result.error || 'Gửi thất bại' }
                    : msg
            ));
        }
    };

    if (initialError) {
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-100 text-red-500">{initialError}</div>;
    }
    const filteredConversations = conversations.filter(convo => {
        // Lấy từ khóa tìm kiếm và chuẩn hóa (bỏ khoảng trắng, viết thường)
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true; // Nếu không có từ khóa, hiển thị tất cả

        // Lấy tên khách hàng và chuẩn hóa
        const customerName = (convo.customers?.[0]?.name || '').toLowerCase();

        // Kiểm tra xem tên có chứa từ khóa tìm kiếm không
        const nameMatches = customerName.includes(query);

        // Lấy danh sách số điện thoại
        const phoneNumbers = convo.recent_phone_numbers?.map(p => p.phone_number) || [];
        const phoneMatches = phoneNumbers.some(phone => phone.includes(query));
        return nameMatches || phoneMatches;
    });
    return (
        <div className="flex h-full w-full bg-white rounded-md border border-gray-200">
            {/* === Cột 1: Danh sách hội thoại === */}
            <div className="w-full max-w-sm border-r border-gray-200 flex flex-col">
                <div className="p-3 border-b border-gray-200">
                    <div className='flex items-center gap-3'>
                        <Link
                            href="/pancake"
                            className="inline-flex items-center gap-2 rounded-lg border-2 border-[--main_b] bg-transparent pr-4 pl-2 py-2 text-sm font-semibold text-[--main_b] transition-colors duration-200 ease-in-out hover:bg-[--main_b] hover:text-white active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[--main_b]"
                        >
                            <ChevronLeft className="h-5 w-5" />
                            <span>Quay lại</span>
                        </Link>
                        <div className='flex-1 flex justify-end gap-2 items-center'>
                            <div className='flex flex-col items-end'>
                                <h5 className='text_w_600'>{pageConfig.name}</h5>
                                <h6>{pageConfig.platform === 'facebook' ? 'Page Facebook' : pageConfig.platform === 'instagram_official' ? 'Instagram Official' : pageConfig.platform === 'tiktok_business_messaging' ? 'TikTok Business Messaging' : null}</h6>
                            </div>
                            <Image src={pageConfig.avatar} alt={pageConfig.name} width={36} height={36} className="rounded-md object-cover" />
                        </div>
                    </div>
                    <div className="relative mt-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm theo tên hoặc SĐT..."
                            className="w-full bg-gray-100 rounded-md pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <ul className="flex-1 overflow-y-auto">
                    {filteredConversations.map((convo) => {
                        const avatarUrl = avatar({ idpage: pageConfig.id, iduser: convo.page_customer.psid });
                        const customerName = convo.customers?.[0]?.name || 'Khách hàng ẩn';
                        return (
                            <li key={convo.id} onClick={() => handleSelectConvo(convo)}
                                className={`flex items-start p-3 cursor-pointer hover:bg-gray-100 ${selectedConvo?.id === convo.id ? 'bg-blue-50' : ''}`}>
                                <div className="relative mr-3">
                                    <FallbackAvatar
                                        src={avatarUrl}
                                        alt={customerName}
                                        name={customerName}
                                        width={48}
                                        height={48}
                                        className="rounded-full object-cover"
                                    />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <h4 className="font-semibold truncate text-gray-800">{customerName}</h4>
                                    <h5 className="text-sm text-gray-500 truncate">{convo.snippet}</h5>
                                </div>
                                <div className="text-xs text-gray-400">{new Date(convo.updated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* === Cột 2: Khung chat chính === */}
            <div className="flex-1 flex flex-col bg-gray-50">
                {selectedConvo ? (
                    <>
                        <div className="flex items-center p-3 border-b border-gray-200 bg-white shadow-sm">
                            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center font-bold mr-3">
                                <FallbackAvatar
                                    src={avatar({ idpage: pageConfig.id, iduser: selectedConvo.page_customer.psid })}
                                    alt={selectedConvo.customers?.[0]?.name || 'Khách hàng'}
                                    name={selectedConvo.customers?.[0]?.name || 'Khách hàng'}
                                    width={40}
                                    height={40}
                                    className="rounded-full object-cover"
                                />
                            </div>
                            <h4 className="font-bold text-lg text-gray-900">{selectedConvo.customers?.[0]?.name || 'Khách hàng'}</h4>
                        </div>
                        <div className="flex-1 p-6 space-y-1 overflow-y-auto">
                            {isLoadingMessages && <h5 className="text-center text-gray-500">Đang tải tin nhắn...</h5>}
                            {messages.map((msg, index) => {
                                if (!msg) return null;
                                return (
                                    msg.content?.type === 'system' ?
                                        <MessageContent key={msg.id} content={msg.content} /> :
                                        <div key={msg.id} className={`flex flex-col my-1 ${msg.senderType === 'page' ? 'items-end' : 'items-start'}`}>
                                            <div className={`max-w-lg p-3 rounded-xl shadow-sm flex flex-col ${msg.senderType === 'page' ? 'bg-blue-500 text-white items-end' : 'bg-white text-gray-800'}`}>
                                                <MessageContent content={msg.content} />
                                                <h6 className={`text-xs mt-1 ${msg.senderType === 'page' ? 'text-right' : 'text-left'}`} style={{ color: msg.senderType == 'page' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.5)' }}>
                                                    {new Date(msg.inserted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                </h6>
                                            </div>
                                            {msg.senderType === 'page' && index === messages.length - 1 && (
                                                <MessageStatus status={msg.status} error={msg.error} />
                                            )}
                                        </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                        <form ref={formRef} action={handleSendMessage} className="p-4 border-t border-gray-200 bg-white">
                            <input type="hidden" name="conversationId" value={selectedConvo.id} />
                            <div className="flex items-center space-x-3 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">
                                <input name="message" placeholder="Nhập tin nhắn..." required className="flex-1 bg-transparent text-sm focus:outline-none" autoComplete="off" />
                                <button type="submit" className="text-blue-500 hover:text-blue-700">
                                    <Send className="h-5 w-5" />
                                </button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <p>Chọn một hội thoại để bắt đầu</p>
                    </div>
                )}
            </div>
        </div>
    );
}