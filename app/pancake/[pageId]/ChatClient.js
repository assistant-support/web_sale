'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Send } from 'lucide-react';
import { getMessagesAction, sendMessageAction } from './actions';
import Image from 'next/image';

const avatar = ({ idpage, iduser }) => `https://pancake.vn/api/v1/pages/${idpage}/avatar/${iduser}`; // Placeholder avatar

const MessageContent = ({ content }) => {
    if (!content) return null;
    switch (content.type) {
        case 'text':
            return <h5 className="whitespace-pre-wrap" style={{ color: 'inherit' }}>{content.content}</h5>;
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
            )
        default:
            return <h5 className="italic text-gray-400">Tin nhắn không được hỗ trợ</h5>;
    }
};

export default function ChatClient({ initialConversations, initialError, pageConfig }) {
    const [conversations, setConversations] = useState(initialConversations);
    const [selectedConvo, setSelectedConvo] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const formRef = useRef(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Polling for real-time updates
    useEffect(() => {
        if (!selectedConvo) return;

        const intervalId = setInterval(async () => {
            const result = await getMessagesAction(pageConfig.id, pageConfig.accessToken, selectedConvo.id);
            if (result.success && result.data.length !== messages.length) {
                setMessages(result.data);
            }
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(intervalId);
    }, [selectedConvo, pageConfig, messages.length]);

    const handleSelectConvo = useCallback(async (conversation) => {
        if (selectedConvo?.id === conversation.id) return;

        setSelectedConvo(conversation);
        setMessages([]);
        setIsLoadingMessages(true);
        const result = await getMessagesAction(pageConfig.id, pageConfig.accessToken, conversation.id);
        if (result.success) {
            setMessages(result.data);
        } else {
            alert(`Error: ${result.error}`);
        }
        setIsLoadingMessages(false);
    }, [pageConfig, selectedConvo?.id]);

    const handleSendMessage = async (formData) => {
        const messageText = formData.get('message');
        if (!messageText?.trim() || !selectedConvo) return;

        const optimisticMessage = {
            id: Date.now().toString(),
            inserted_at: new Date().toISOString(),
            senderType: 'page',
            content: { type: 'text', content: messageText.trim() }
        };

        setMessages(prev => [...prev, optimisticMessage]);
        formRef.current?.reset();

        const result = await sendMessageAction(pageConfig.id, pageConfig.accessToken, selectedConvo.id, messageText);
        
        if (!result.success) {
            alert(`Failed to send message: ${result.error}`);
            setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
        } else {
            const updatedMessages = await getMessagesAction(pageConfig.id, pageConfig.accessToken, selectedConvo.id);
            if (updatedMessages.success) {
                setMessages(updatedMessages.data);
            }
        }
    };

    if (initialError) {
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-100 text-red-500">{initialError}</div>;
    }

    return (
        <div className="flex h-screen w-full bg-white text-gray-800 font-sans">
            {/* Column 1: Conversations List */}
            <div className="w-full max-w-sm border-r border-gray-200 flex flex-col">
                <div className="p-3 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-800">Quay lại</h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input type="text" placeholder="Tìm kiếm hội thoại..." className="w-full bg-gray-100 rounded-md pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                </div>
                <ul className="flex-1 overflow-y-auto">
                    {conversations.map((convo) => {
                        const avatarUrl = avatar({ idpage: pageConfig.id, iduser: convo.page_customer.psid });
                        const customerName = convo.customers?.[0]?.name || 'Khách hàng ẩn';
                        return (
                            <li
                                key={convo.id}
                                onClick={() => handleSelectConvo(convo)}
                                className={`flex items-start p-3 cursor-pointer hover:bg-gray-100 ${selectedConvo?.id === convo.id ? 'bg-blue-50' : ''}`}
                            >
                                <div className="relative mr-3">
                                    <div className="h-12 w-12 rounded-full bg-gray-300 flex items-center justify-center font-bold text-xl text-gray-600">
                                        <Image src={avatarUrl} alt={customerName} width={48} height={48} className="rounded-full object-cover" />
                                    </div>
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

            {/* Column 2: Main Chat Area */}
            <div className="flex-1 flex flex-col bg-gray-50">
                {selectedConvo ? (
                    <>
                        <div className="flex items-center p-3 border-b border-gray-200 bg-white shadow-sm">
                            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center font-bold mr-3">
                                <Image src={avatar({ idpage: pageConfig.id, iduser: selectedConvo.page_customer.psid })} alt={selectedConvo.customers?.[0]?.name || 'Khách hàng'} width={40} height={40} className="rounded-full object-cover" />
                            </div>
                            <h4 className="font-bold text-lg text-gray-900">{selectedConvo.customers?.[0]?.name || 'Khách hàng'}</h4>
                        </div>
                        <div className="flex-1 p-6 space-y-1 overflow-y-auto">
                            {isLoadingMessages && <p className="text-center text-gray-500">Đang tải tin nhắn...</p>}
                            {messages.map((msg) => (
                                msg.content.type === 'system' ?
                                    <MessageContent key={msg.id} content={msg.content} /> :
                                    <div key={msg.id} className={`flex items-end gap-3 my-2 ${msg.senderType === 'page' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-lg p-3 rounded-xl shadow-sm ${msg.senderType === 'page' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800'}`}>
                                            <MessageContent content={msg.content} />
                                            <h6 className={`text-xs mt-1 ${msg.senderType === 'page' ? 'text-blue-100' : 'text-gray-400'}`}>
                                                {new Date(msg.inserted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                            </h6>
                                        </div>
                                    </div>
                            ))}
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
                        <p>Xin chọn 1 hội thoại từ danh sách bên trái</p>
                    </div>
                )}
            </div>

            {/* Column 3: Customer Info */}
            <div className="w-full max-w-sm border-l border-gray-200 bg-white">
                <div className="p-6 h-full flex items-center justify-center">
                    <p className="text-gray-500">Chưa có thông tin khách hàng</p>
                </div>
            </div>
        </div>
    );
}