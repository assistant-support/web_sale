'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertCircle, Loader2, MessageCircle, Play, X } from 'lucide-react';

// Helper function để convert URLs trong text thành clickable links
const renderTextWithLinks = (text, isFromPage = false) => {
    if (!text || typeof text !== 'string') return text;
    
    // Regex để detect URLs (http://, https://, www.)
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = urlRegex.exec(text)) !== null) {
        // Thêm text trước URL
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }
        
        // Xử lý URL
        let url = match[0];
        // Nếu là www. thì thêm https://
        if (url.startsWith('www.')) {
            url = 'https://' + url;
        }
        
        // Style khác nhau cho tin nhắn từ page (nền xanh) và từ customer (nền trắng)
        const linkClassName = isFromPage 
            ? "text-blue-100 hover:text-white underline break-all font-medium"
            : "text-blue-600 hover:text-blue-800 underline break-all";
        
        // Thêm link
        parts.push(
            <a
                key={match.index}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClassName}
                onClick={(e) => e.stopPropagation()}
            >
                {match[0]}
            </a>
        );
        
        lastIndex = match.index + match[0].length;
    }
    
    // Thêm phần text còn lại
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }
    
    // Nếu không có URL nào, trả về text gốc
    return parts.length > 0 ? parts : text;
};

// Component hiển thị tin nhắn với animation
const AnimatedMessage = ({ message, isNew = false, pageId, onVideoClick }) => {
    const formattedTime = useMemo(() => {
        if (!message?.inserted_at) return 'Thời gian không xác định';
        try {
            const raw = String(message.inserted_at);
            const hasTZ = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
            const d = new Date(message.inserted_at);
            if (!Number.isNaN(d.getTime()) && !hasTZ) {
                d.setHours(d.getHours() + 7);
            }
            return d.toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return 'Thời gian không xác định';
        }
    }, [message?.inserted_at]);

    const isFromPage = message?.senderType === 'page';

    return (
        <motion.div
            initial={isNew ? { opacity: 0, y: 20, scale: 0.95 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`flex flex-col my-1 ${isFromPage ? 'items-end' : 'items-start'}`}
        >
            <div
                className={`max-w-lg p-3 rounded-xl shadow-sm flex flex-col relative ${
                    isFromPage
                        ? 'bg-blue-500 text-white items-end'
                        : 'bg-white text-gray-800'
                }`}
            >
                {/* New message indicator */}
                {isNew && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"
                    />
                )}

                {/* Message content */}
                <MessageContent content={message?.content} onVideoClick={onVideoClick} />
                
                {/* Message time */}
                <div
                    className={`text-xs mt-1 ${
                        isFromPage
                            ? 'text-right text-blue-100/80'
                            : 'text-left text-gray-500'
                    }`}
                >
                    {formattedTime}
                </div>
            </div>

            {/* Message status for sent messages */}
            {isFromPage && (
                <MessageStatus status={message?.status} error={message?.error} />
            )}
        </motion.div>
    );
};

// Component hiển thị nội dung tin nhắn
const MessageContent = ({ content, onVideoClick, isFromPage = false }) => {
    if (!content) {
        return (
            <h5 className="italic text-gray-400" style={{ textAlign: 'end' }}>
                Nội dung không hợp lệ
            </h5>
        );
    }

    switch (content.type) {
        case 'text':
            return (
                <h5 className="w-full" style={{ color: 'inherit', whiteSpace: 'pre-wrap' }}>
                    {renderTextWithLinks(content.content, isFromPage)}
                </h5>
            );

        case 'images':
            return (
                <div className="flex flex-wrap gap-2 mt-1">
                    {content.images.map((img, i) => (
                        <a key={i} href={img.url} target="_blank" rel="noreferrer">
                            <img
                                src={img.url}
                                alt={`Attachment ${i + 1}`}
                                className="max-w-[240px] max-h-[240px] rounded-lg object-cover"
                                loading="lazy"
                            />
                        </a>
                    ))}
                </div>
            );

        case 'images_with_text':
            return (
                <div className="flex flex-col gap-2 mt-1">
                    {/* Hiển thị text trước */}
                    {content.text && (
                        <h5 className="w-full" style={{ color: 'inherit', whiteSpace: 'pre-wrap' }}>
                            {renderTextWithLinks(content.text, isFromPage)}
                        </h5>
                    )}
                    {/* Hiển thị ảnh sau */}
                    <div className="flex flex-wrap gap-2">
                        {content.images.map((img, i) => (
                            <a key={i} href={img.url} target="_blank" rel="noreferrer">
                                <img
                                    src={img.url}
                                    alt={`Attachment ${i + 1}`}
                                    className="max-w-[240px] max-h-[240px] rounded-lg object-cover"
                                    loading="lazy"
                                />
                            </a>
                        ))}
                    </div>
                </div>
            );

        case 'videos':
            return (
                <div className="flex flex-col gap-2 mt-1">
                    {content.videos.map((video, i) => (
                        <button
                            key={i}
                            type="button"
                            className="group relative overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            onClick={() => onVideoClick?.(video)}
                        >
                            <div className="relative w-[260px] max-w-full rounded-lg overflow-hidden border border-gray-200 bg-black">
                                {video.thumbnail ? (
                                    <img
                                        src={video.thumbnail}
                                        alt={video.name || `Video ${i + 1}`}
                                        className="w-full aspect-video object-cover opacity-80 group-hover:opacity-60 transition"
                                        loading="lazy"
                                    />
                                ) : (
                                    <video
                                        src={video.url}
                                        muted
                                        playsInline
                                        preload="metadata"
                                        className="w-full aspect-video object-cover opacity-80 group-hover:opacity-60 transition"
                                    />
                                )}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white shadow-lg">
                                        <Play className="h-6 w-6" />
                                    </div>
                                </div>
                            </div>
                            {video.name && (
                                <div className="mt-1 flex justify-center">
                                    <span className="max-w-[240px] truncate text-sm text-blue-600 group-hover:underline">
                                        {video.name}
                                    </span>
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            );

        case 'files':
            return (
                <div className="flex flex-wrap gap-2 mt-1">
                    {content.files.map((file, i) => (
                        <a
                            key={i}
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
                        >
                            <span className="text-blue-500">📎</span>
                            <span>Tệp {file.kind}</span>
                        </a>
                    ))}
                </div>
            );

        default:
            return (
                <h5 className="italic text-gray-400" style={{ textAlign: 'end' }}>
                    Tin nhắn không được hỗ trợ
                </h5>
            );
    }
};

// Component hiển thị trạng thái tin nhắn
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
};

// Component chính - Enhanced Message List
const EnhancedMessageList = ({
    messages = [],
    pageId,
    isLoadingMessages = false,
    isLoadingOlder = false,
    hasMore = true,
    onLoadMore,
    messagesEndRef,
    messagesScrollRef,
    className = ""
}) => {
    const [newMessageIds, setNewMessageIds] = useState(new Set());
    const [isNearBottom, setIsNearBottom] = useState(true);
    const lastMessageCountRef = useRef(messages.length);
    const [selectedVideo, setSelectedVideo] = useState(null);

    // Theo dõi tin nhắn mới
    useEffect(() => {
        if (messages.length > lastMessageCountRef.current) {
            const newCount = messages.length - lastMessageCountRef.current;
            const newIds = messages.slice(-newCount).map(m => m.id);
            setNewMessageIds(new Set(newIds));
            
            // Tự động scroll xuống nếu đang ở gần cuối
            if (isNearBottom) {
                setTimeout(() => {
                    messagesEndRef?.current?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }
            
            // Xóa flag "new" sau 3 giây
            setTimeout(() => {
                setNewMessageIds(new Set());
            }, 3000);
        }
        lastMessageCountRef.current = messages.length;
    }, [messages.length, messagesEndRef, isNearBottom]);

    // Theo dõi scroll position
    const handleScroll = useCallback(() => {
        if (messagesScrollRef?.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesScrollRef.current;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            setIsNearBottom(distanceFromBottom < 100);
        }
    }, [messagesScrollRef]);

    // Load more messages khi scroll lên đầu
    const handleScrollToTop = useCallback(() => {
        if (messagesScrollRef?.current) {
            const { scrollTop } = messagesScrollRef.current;
            if (scrollTop === 0 && hasMore && !isLoadingOlder && onLoadMore) {
                onLoadMore();
            }
        }
    }, [hasMore, isLoadingOlder, onLoadMore, messagesScrollRef]);

    const handleScrollEvent = useCallback(() => {
        handleScroll();
        handleScrollToTop();
    }, [handleScroll, handleScrollToTop]);

    return (
        <div
            className={`flex-1 overflow-y-auto ${className}`}
            ref={messagesScrollRef}
            onScroll={handleScrollEvent}
        >
            <div className="p-6 space-y-1">
                {/* Loading indicator for older messages */}
                {isLoadingOlder && (
                    <div className="text-center text-xs text-gray-400 mb-2">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                        Đang tải tin nhắn cũ…
                    </div>
                )}

                {/* Loading indicator for initial messages */}
                {isLoadingMessages && (
                    <div className="text-center text-gray-500 py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Đang tải tin nhắn...
                    </div>
                )}

                {/* Messages */}
                <AnimatePresence mode="popLayout">
                    {messages.map((msg, index) => {
                        if (!msg) return null;
                        const isNew = newMessageIds.has(msg.id);
                        
                        return msg.content?.type === 'system' ? (
                            <MessageContent
                                key={msg.id || `msg-${index}`}
                                content={msg.content}
                                onVideoClick={setSelectedVideo}
                            />
                        ) : (
                            <AnimatedMessage
                                key={msg.id || `msg-${index}`}
                                message={msg}
                                isNew={isNew}
                                pageId={pageId}
                                onVideoClick={setSelectedVideo}
                            />
                        );
                    })}
                </AnimatePresence>

                {/* Scroll to bottom button */}
                {!isNearBottom && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={() => {
                            messagesEndRef?.current?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="fixed bottom-20 right-4 bg-blue-500 text-white p-2 rounded-full shadow-lg hover:bg-blue-600 transition-colors z-10"
                    >
                        <MessageCircle className="h-5 w-5" />
                    </motion.button>
                )}

                {/* End of messages marker */}
                <div ref={messagesEndRef} />
            </div>

            {selectedVideo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/70"
                        onClick={() => setSelectedVideo(null)}
                    />
                    <div className="relative z-10 w-full max-w-3xl px-4">
                        <div className="relative overflow-hidden rounded-2xl bg-black shadow-2xl">
                            <button
                                type="button"
                                className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                onClick={() => setSelectedVideo(null)}
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <video
                                src={selectedVideo.url}
                                controls
                                autoPlay
                                className="w-full max-h-[75vh] bg-black"
                            />
                            {selectedVideo.name && (
                                <div className="px-4 py-3 text-sm text-white/90">
                                    {selectedVideo.name}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EnhancedMessageList;

