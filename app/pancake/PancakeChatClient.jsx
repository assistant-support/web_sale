'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Paperclip, Send, Image as ImageIcon } from 'lucide-react';

const MessageContent = ({ content }) => {
    if (!content) return null;
    switch (content.type) {
        case 'text':
            return <h5 className="whitespace-pre-wrap" style={{color:'inherit'}}>{content.content}</h5>;
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
                    <span className="text-xs text-text-secondary bg-bg-btn px-2 py-1 rounded-full">{content.content}</span>
                </div>
            )
        default:
            return <h5 className="italic text-gray-400">Tin nhắn không được hỗ trợ</h5>;
    }
};

export default function PancakeChatClient({
    initialConversations,
    initialError,
    getMessagesAction,
    sendMessageAction
}) {
    const [selectedConvo, setSelectedConvo] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const formRef = useRef(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // --- NEW: Polling for real-time updates ---
    useEffect(() => {
        if (!selectedConvo) return;

        // Bắt đầu polling khi một cuộc hội thoại được chọn
        const intervalId = setInterval(async () => {
            console.log(`Polling messages for ${selectedConvo.id}...`);
            const result = await getMessagesAction(selectedConvo.id);

            if (result.success) {
                // Chỉ cập nhật state nếu có sự thay đổi về số lượng tin nhắn
                // để tránh render lại không cần thiết
                setMessages(currentMessages => {
                    if (result.data.length !== currentMessages.length) {
                        return result.data;
                    }
                    return currentMessages;
                });
            }
        }, 3000); // Lấy tin nhắn mới mỗi 3 giây

        // Dọn dẹp interval khi component unmount hoặc khi selectedConvo thay đổi
        return () => {
            clearInterval(intervalId);
        };
    }, [selectedConvo, getMessagesAction]);


    const handleSelectConvo = async (conversation) => {
        setSelectedConvo(conversation);
        setMessages([]);
        setIsLoadingMessages(true);
        const result = await getMessagesAction(conversation.id);
        if (result.success) {
            setMessages(result.data);
        } else {
            alert(`Error: ${result.error}`);
        }
        setIsLoadingMessages(false);
    };

    const handleSendMessage = async (formData) => {
        const messageText = formData.get('message');
        if (!messageText.trim() || !selectedConvo) return;

        const optimisticMessage = {
            id: Date.now().toString(),
            inserted_at: new Date().toISOString(),
            senderType: 'page',
            content: { type: 'text', content: messageText.trim() }
        };

        setMessages(prev => [...prev, optimisticMessage]);
        formRef.current?.reset();

        const result = await sendMessageAction(formData);

        if (!result.success) {
            alert(`Failed to send message: ${result.error}`);
            setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
        } else {
            // Sau khi gửi thành công, gọi lại API để lấy tin nhắn mới nhất
            const updatedMessages = await getMessagesAction(selectedConvo.id);
            if (updatedMessages.success) {
                setMessages(updatedMessages.data);
            }
        }
    };

    if (initialError) {
        return <div className="h-screen w-screen flex items-center justify-center bg-bg-secondary text-red">{initialError}</div>;
    }

    return (
        <div className="flex-1 bg-white text-text-primary flex font-sans overflow-hidden rounded-sm">
            {/* Sidebar */}
            <div className="w-full max-w-xs border-r border-border-color flex flex-col">
                <div className="p-3 border-b border-border-color">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input type="text" placeholder="Tìm kiếm hội thoại..." className="w-full bg-bg-secondary rounded-md pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-main_b" />
                    </div>
                </div>
                <ul className="scroll flex-1 overflow-y-auto">
                    {initialConversations.map((convo) => {
                        const customerName = convo.customers?.[0]?.name || 'Khách hàng ẩn';
                        return (
                            <li
                                key={convo.id}
                                onClick={() => handleSelectConvo(convo)}
                                className={`flex items-start p-3 cursor-pointer hover:bg-hover ${selectedConvo?.id === convo.id ? 'bg-bg-secondary' : ''}`}
                            >
                                <div className="relative mr-3">
                                    <div className="h-12 w-12 rounded-full bg-gray-300 flex items-center justify-center font-bold text-xl text-text-secondary">
                                        {customerName.charAt(0).toUpperCase()}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <h4 className="font-semibold truncate text-gray-800">{customerName}</h4>
                                    <h5 className="text-sm text-text-secondary truncate">{convo.snippet}</h5>
                                </div>
                                <div className="text-xs text-text-secondary">{new Date(convo.updated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-bg-secondary">
                {selectedConvo ? (
                    <>
                        <div className="flex items-center p-2.5 border-b border-border-color bg-bg-primary">
                            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center font-bold mr-3">
                                {selectedConvo.customers?.[0]?.name?.charAt(0).toUpperCase() || '?'}
                            </div>
                            <h4 className="font-bold text-lg text-gray-900">{selectedConvo.customers?.[0]?.name || 'Khách hàng'}</h4>
                        </div>

                        <div className="flex-1 scroll p-6 space-y-1 overflow-y-auto">
                            {isLoadingMessages && <p className="text-center text-text-secondary">Đang tải tin nhắn...</p>}
                            {messages.map((msg) => (
                                msg.content.type === 'system' ?
                                    <MessageContent key={msg.id} content={msg.content} />
                                    :
                                    <div key={msg.id} className={`flex items-end gap-3 my-2 ${msg.senderType === 'page' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-lg p-3 rounded-xl shadow-sm `} style={{ backgroundColor: msg.senderType === 'page' ? 'var(--main_d)' : 'var(--bg-primary)',color: msg.senderType === 'page' ? 'white' : 'inherit' }}>
                                            <MessageContent content={msg.content} />
                                            <h6 className={`text-xs mt-1 opacity-70`} style={{color:'inherit'}}>
                                                {new Date(msg.inserted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                            </h6>
                                        </div>
                                    </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <form ref={formRef} action={handleSendMessage} className="p-4 border-t border-border-color bg-bg-primary">
                            <input type="hidden" name="conversationId" value={selectedConvo.id} />
                            <div className="flex items-center space-x-3 bg-bg-secondary border border-border-color rounded-lg px-3 py-2">
                                <input
                                    name="message"
                                    placeholder="Nhập tin nhắn..."
                                    required
                                    className="flex-1 bg-transparent text-sm focus:outline-none"
                                    autoComplete="off"
                                />
                                <button type="submit" className="text-main_b hover:text-main_d">
                                    <Send className="h-5 w-5" />
                                </button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-text-secondary text-lg">Chọn một cuộc hội thoại để bắt đầu</p>
                    </div>
                )}
            </div>
        </div>
    );
}

