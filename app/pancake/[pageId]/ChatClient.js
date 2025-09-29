'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, Send, Loader2, Check, AlertCircle, ChevronLeft, Tag, ChevronDown, X } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { getMessagesAction, sendMessageAction } from './actions';
import { toggleLabelForCustomer } from '@/app/(setting)/label/actions';

import Image from 'next/image';
import Link from 'next/link';
import FallbackAvatar from '@/components/FallbackAvatar';

// ... (Các component LabelDropdown, MessageContent, MessageStatus không thay đổi từ trước)
const LabelDropdown = ({
    labels = [],
    selectedLabelIds = [],
    onLabelChange,
    trigger,
    manageLabelsLink = "/label",
    style = 'left'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredLabels = labels.filter(label =>
        label.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="relative" ref={dropdownRef}>
            <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
            {isOpen && (
                <div style={{ right: style === 'right' ? 0 : 'auto', left: style === 'left' ? 0 : 'auto' }} className="absolute top-full mt-2 w-72 bg-blue-50 text-gray-900 rounded-md border border-gray-200 shadow-lg z-50 overflow-hidden">
                    <div className="p-3">
                        <h4 className="font-semibold text-gray-800" style={{ marginBottom: 4 }}>Theo thẻ phân loại</h4>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Tìm thẻ..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white text-gray-900 rounded-md pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto px-3">
                        {filteredLabels.map(label => (
                            <label key={label._id} className="flex items-center gap-3 p-2.5 hover:bg-blue-100 rounded-md cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    checked={selectedLabelIds.includes(label._id)}
                                    onChange={(e) => onLabelChange(label._id, e.target.checked)}
                                />
                                <Tag className="h-4 w-4" style={{ color: label.color }} />
                                <span className="flex-1">{label.name}</span>
                            </label>
                        ))}
                    </div>
                    <div className="border-t border-gray-200 mt-1">
                        <Link href={manageLabelsLink} className="block w-full text-center p-3 hover:bg-blue-100 text-sm text-blue-600 font-medium">
                            Quản lý thẻ phân loại
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};
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
const avatar = ({ idpage, iduser }) => `https://pancake.vn/api/v1/pages/${idpage}/avatar/${iduser}`;


export default function ChatClient({ initialConversations, initialError, pageConfig, label: initialLabels }) {
    const [conversations] = useState(initialConversations);
    const [allLabels, setAllLabels] = useState(initialLabels);
    const [selectedConvo, setSelectedConvo] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilterLabelIds, setSelectedFilterLabelIds] = useState([]);

    const formRef = useRef(null);
    const messagesEndRef = useRef(null);

    // ... (Toàn bộ logic hooks và handlers không thay đổi)
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
                    const filteredMessages = prevMessages.filter(msg => !msg.id.toString().startsWith('optimistic-'));
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
            setMessages(prev => prev.map(msg => msg.id === optimisticId ? { ...msg, status: 'sent' } : msg));
        } else {
            setMessages(prev => prev.map(msg => msg.id === optimisticId ? { ...msg, status: 'failed', error: result.error || 'Gửi thất bại' } : msg));
        }
    };
    const handleFilterLabelChange = (labelId, isChecked) => {
        setSelectedFilterLabelIds(prev =>
            isChecked ? [...prev, labelId] : prev.filter(id => id !== labelId)
        );
    };
    const handleAssignLabelChange = async (labelId) => {
        if (!selectedConvo) return;
        const psid = selectedConvo.page_customer.psid;

        const originalLabels = JSON.parse(JSON.stringify(allLabels));

        setAllLabels(prevLabels =>
            prevLabels.map(label => {
                if (label._id === labelId) {
                    const customerExists = label.customer.includes(psid);
                    const newCustomerList = customerExists
                        ? label.customer.filter(cId => cId !== psid)
                        : [...label.customer, psid];
                    return { ...label, customer: newCustomerList };
                }
                return label;
            })
        );

        const result = await toggleLabelForCustomer({ labelId, psid });

        if (result.success) {
            toast.success(result.message);
        } else {
            toast.error(result.error || 'Có lỗi xảy ra');
            setAllLabels(originalLabels);
        }
    };
    const assignedLabelsForSelectedConvo = useMemo(() => {
        if (!selectedConvo) return [];
        const psid = selectedConvo.page_customer.psid;
        return allLabels.filter(label => label.customer?.includes(psid));
    }, [selectedConvo, allLabels]);
    const filteredConversations = useMemo(() => {
        return conversations.filter(convo => {
            const query = searchQuery.toLowerCase().trim();
            if (query) {
                const customerName = (convo.customers?.[0]?.name || '').toLowerCase();
                const phoneNumbers = convo.recent_phone_numbers?.map(p => p.phone_number) || [];
                const searchMatches = customerName.includes(query) || phoneNumbers.some(phone => phone.includes(query));
                if (!searchMatches) return false;
            }

            if (selectedFilterLabelIds.length > 0) {
                const psid = convo.page_customer.psid;
                const customerLabelIds = allLabels
                    .filter(label => label.customer?.includes(psid))
                    .map(label => label._id);

                const hasAllLabels = selectedFilterLabelIds.every(filterId => customerLabelIds.includes(filterId));
                if (!hasAllLabels) return false;
            }

            return true;
        });
    }, [conversations, searchQuery, selectedFilterLabelIds, allLabels]);


    return (
        <div className='flex h-full w-full bg-white rounded-md border border-gray-200 flex-col p-2 gap-2'>
            <Toaster richColors position="top-right" />
            <div className='flex'>
                {/* ... (Phần Header không thay đổi) */}
                <div className='flex items-center gap-3 justify-between w-full'>
                    <div className='flex-1 gap-2 flex items-center'>
                        <Link
                            href="/pancake"
                            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-transparent pr-4 pl-2 py-2 text-sm font-semibold text-[--main_b] transition-colors duration-200 ease-in-out hover:bg-[--main_b] hover:text-white active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[--main_b]"
                        >
                            <ChevronLeft className="h-5 w-5" />
                            <span>Quay lại</span>
                        </Link>

                        <LabelDropdown
                            labels={allLabels}
                            selectedLabelIds={selectedFilterLabelIds}
                            onLabelChange={handleFilterLabelChange}
                            style='left'
                            trigger={
                                <button className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 active:scale-95 cursor-pointer">
                                    {selectedFilterLabelIds.length > 0 ? (
                                        <span className='bg-blue-500 text-white rounded-full px-2 py-0.5 text-xs'>
                                            {selectedFilterLabelIds.length}
                                        </span>
                                    ) : (
                                        <Tag className="h-4 w-4 text-gray-500" />
                                    )}
                                    <span>Thẻ</span>
                                    <ChevronDown className="h-4 w-4 text-gray-500" />
                                </button>
                            }
                        />

                        <div className="relative flex-grow">
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
                    <div className=' flex gap-2 items-center'>
                        <div className='flex flex-col items-end'>
                            <h5 className='font-semibold'>{pageConfig.name}</h5>
                            <h6 className='text-xs text-gray-500'>{pageConfig.platform === 'facebook' ? 'Page Facebook' : pageConfig.platform === 'instagram_official' ? 'Instagram Official' : pageConfig.platform === 'tiktok_business_messaging' ? 'TikTok Business Messaging' : null}</h6>
                        </div>
                        <Image src={pageConfig.avatar} alt={pageConfig.name} width={36} height={36} className="rounded-md object-cover" />
                    </div>
                </div>
            </div>
            <div className="flex-1 flex overflow-hidden bg-white rounded-md border border-gray-200">
                <div className="w-full max-w-sm border-r border-gray-200 flex flex-col">
                    <ul className="flex-1 overflow-y-auto">
                        {/* CẬP NHẬT PHẦN HIỂN THỊ NHÃN TRONG DANH SÁCH */}
                        {filteredConversations.map((convo) => {
                            const avatarUrl = avatar({ idpage: pageConfig.id, iduser: convo.page_customer.psid });
                            const customerName = convo.customers?.[0]?.name || 'Khách hàng ẩn';
                            let date = new Date(convo.updated_at);
                            let formattedTime = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

                            // Tìm các nhãn được gán cho conversation này
                            const assignedLabels = allLabels.filter(label =>
                                label.customer?.includes(convo.page_customer.psid)
                            );

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
                                        <h6 style={{ fontWeight: 600 }} className="font-semibold truncate text-gray-800">{customerName}</h6>
                                        <h6 className="text-sm text-gray-500 truncate">{convo.snippet}</h6>

                                        {/* Thêm phần hiển thị chip nhãn */}
                                        {assignedLabels.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {assignedLabels.map(label => (
                                                    <h6 key={label._id}
                                                        className=" rounded-full px-2 py-0.5"
                                                        style={{ backgroundColor: label.color, color: 'white' }}>
                                                        {label.name}
                                                    </h6>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-400">{formattedTime}</div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                {/* ... (Phần còn lại của component không thay đổi) */}
                <div className="flex-1 flex flex-col bg-gray-50">
                    {selectedConvo ? (
                        <>
                            <div className="flex items-center p-3 border-b border-gray-200 bg-white justify-between">
                                <div className='flex items-center'>
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
                                <div>
                                    <LabelDropdown
                                        labels={allLabels}
                                        selectedLabelIds={assignedLabelsForSelectedConvo.map(l => l._id)}
                                        style='right'
                                        onLabelChange={(labelId) => handleAssignLabelChange(labelId)}
                                        trigger={
                                            <button className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 active:scale-95 cursor-pointer">
                                                <Tag className="h-4 w-4 text-gray-500" />
                                                <span>Thêm nhãn</span>
                                            </button>
                                        }
                                    />
                                </div>
                            </div>

                            {assignedLabelsForSelectedConvo.length > 0 && (
                                <div className="px-3 py-2 flex flex-wrap gap-2 border-b border-gray-200 bg-white">
                                    {assignedLabelsForSelectedConvo.map(label => (
                                        <div key={label._id} className="flex items-center text-xs font-medium text-white rounded-full pl-2 pr-1 py-0.5" style={{ backgroundColor: label.color }}>
                                            {label.name}
                                            <button onClick={() => handleAssignLabelChange(label._id)} className="ml-1 opacity-70 hover:opacity-100">
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex-1 p-6 space-y-1 overflow-y-auto">
                                {isLoadingMessages && <div className="text-center text-gray-500">Đang tải tin nhắn...</div>}
                                {messages.map((msg, index) => {
                                    if (!msg) return null;
                                    let date = new Date(msg.inserted_at);
                                    let formattedTime = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                                    return (
                                        msg.content?.type === 'system' ?
                                            <MessageContent key={msg.id || `msg-${index}`} content={msg.content} /> :
                                            <div key={msg.id || `msg-${index}`} className={`flex flex-col my-1 ${msg.senderType === 'page' ? 'items-end' : 'items-start'}`}>
                                                <div className={`max-w-lg p-3 rounded-xl shadow-sm flex flex-col ${msg.senderType === 'page' ? 'bg-blue-500 text-white items-end' : 'bg-white text-gray-800'}`}>
                                                    <MessageContent content={msg.content} />
                                                    <div className={`text-xs mt-1 ${msg.senderType === 'page' ? 'text-right text-blue-100/80' : 'text-left text-gray-500'}`}>
                                                        {formattedTime}
                                                    </div>
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
        </div>
    );
}