'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { Search, Send, Loader2, Check, AlertCircle, ChevronLeft, Tag, ChevronDown, X, Image as ImageIcon } from 'lucide-react';
import { sendMessageAction, uploadImageToDriveAction, sendImageAction } from './actions';
import { Toaster, toast } from 'sonner';

import Image from 'next/image';
import Link from 'next/link';
import FallbackAvatar from '@/components/FallbackAvatar';

// ======================= Cấu hình nhỏ =======================
const PAGE_SIZE = 40; // mỗi lần load thêm hội thoại
const SOCKET_URL = process.env.NEXT_PUBLIC_REALTIME_URL || 'http://localhost:3001';

// ====== THỜI GIAN: +7 tiếng trước khi format ======
const addHours = (dateLike, h) => {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    d.setHours(d.getHours() + h);
    return d;
};

// Ghi đè format: luôn +7h rồi convert Asia/Ho_Chi_Minh
const fmtDateTimeVN = (dateLike) => {
    try {
        if (!dateLike) return 'Thời gian không xác định';
        const d = addHours(dateLike, 7); // +7h
        return d.toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return 'Thời gian không xác định';
    }
};

// ======================= Helper =======================
const isInbox = (convo) => convo?.type === 'INBOX';
const getConvoPsid = (convo) => convo?.from_psid || null;
const getConvoAvatarId = (convo) =>
    convo?.from_psid || convo?.customers?.[0]?.fb_id || convo?.from?.id || null;
const getConvoDisplayName = (convo) =>
    convo?.customers?.[0]?.name || convo?.from?.name || 'Khách hàng ẩn';
const avatarUrlFor = ({ idpage, iduser }) =>
    iduser ? `https://pancake.vn/api/v1/pages/${idpage}/avatar/${iduser}` : undefined;

// === Helpers cho messages ===
const getSenderType = (msg, pageId) => {
    if (msg?.senderType) return msg.senderType; // optimistic
    const fromId = String(msg?.from?.id || '');
    return fromId === String(pageId) ? 'page' : 'customer';
};

const htmlToPlainText = (html) => {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/div>\s*<div>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .trim();
};

// Chuẩn hoá 1 message của Pancake thành cấu trúc UI bạn dùng
const normalizePancakeMessage = (raw, pageId) => {
    const senderType = getSenderType(raw, pageId);
    const ts = raw.inserted_at;

    const atts = Array.isArray(raw.attachments) ? raw.attachments : [];

    const imageAtts = atts.filter((a) => a?.type === 'photo' && a?.url);
    if (imageAtts.length > 0) {
        return {
            id: raw.id,
            inserted_at: ts,
            senderType,
            status: raw.status || 'sent',
            content: {
                type: 'images',
                images: imageAtts.map((a) => ({
                    url: a.url,
                    width: a?.image_data?.width,
                    height: a?.image_data?.height,
                })),
            },
        };
    }

    const fileAtts = atts.filter((a) => a?.type && a?.type !== 'photo');
    if (fileAtts.length > 0) {
        return {
            id: raw.id,
            inserted_at: ts,
            senderType,
            status: raw.status || 'sent',
            content: {
                type: 'files',
                files: fileAtts.map((a) => ({
                    url: a.url,
                    kind: a.type,
                })),
            },
        };
    }

    const text =
        typeof raw.original_message === 'string' && raw.original_message.trim().length > 0
            ? raw.original_message.trim()
            : htmlToPlainText(raw.message || '');

    return {
        id: raw.id,
        inserted_at: ts,
        senderType,
        status: raw.status || 'sent',
        content: text ? { type: 'text', content: text } : { type: 'system', content: '' },
    };
};

// Hợp nhất danh sách hội thoại theo id, giữ item mới hơn (updated_at lớn hơn)
const mergeConversations = (prevList, incoming) => {
    const map = new Map();
    prevList.forEach((c) => map.set(c.id, c));
    (incoming || []).forEach((c) => {
        const old = map.get(c.id);
        if (!old) map.set(c.id, c);
        else {
            const newer =
                new Date(c.updated_at).getTime() > new Date(old.updated_at).getTime();
            map.set(c.id, newer ? c : old);
        }
    });
    return Array.from(map.values());
};

// Sắp xếp tin nhắn tăng dần theo thời gian
const sortAscByTime = (arr) =>
    [...arr].sort((a, b) => new Date(a.inserted_at) - new Date(b.inserted_at));

// Lấy phần sau dấu "_" nếu có (theo API messages của Pancake)
const extractConvoKey = (cid) => {
    if (!cid) return cid;
    const idx = String(cid).indexOf('_');
    return idx >= 0 ? String(cid).slice(idx + 1) : String(cid);
};

// ======================= Subcomponents =======================
const LabelDropdown = ({
    labels = [],
    selectedLabelIds = [],
    onLabelChange,
    trigger,
    manageLabelsLink = '/label',
    style = 'left',
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

    const filteredLabels = useMemo(
        () =>
            labels.filter((label) =>
                (label?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
            ),
        [labels, searchTerm]
    );

    return (
        <div className="relative" ref={dropdownRef}>
            <div onClick={() => setIsOpen((v) => !v)}>{trigger}</div>
            {isOpen && (
                <div
                    style={{ right: style === 'right' ? 0 : 'auto', left: style === 'left' ? 0 : 'auto' }}
                    className="absolute top-full mt-2 w-72 bg-blue-50 text-gray-900 rounded-md border border-gray-200 shadow-lg z-50 overflow-hidden"
                >
                    <div className="p-3">
                        <h4 className="font-semibold text-gray-800 mb-1">Theo thẻ phân loại</h4>
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
                        {filteredLabels.map((label) => (
                            <label
                                key={label._id}
                                className="flex items-center gap-3 p-2.5 hover:bg-blue-100 rounded-md cursor-pointer"
                            >
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
                        <Link
                            href={manageLabelsLink}
                            className="block w-full text-center p-3 hover:bg-blue-100 text-sm text-blue-600 font-medium"
                        >
                            Quản lý thẻ phân loại
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};

const MessageContent = ({ content }) => {
    if (!content)
        return (
            <h5 className="italic text-gray-400" style={{ textAlign: 'end' }}>
                Nội dung không hợp lệ
            </h5>
        );

    switch (content.type) {
        case 'text':
            return (
                <h5 className="w" style={{ color: 'inherit', whiteSpace: 'pre-wrap' }}>
                    {content.content}
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

        case 'files':
            return (
                <div className="flex flex-col gap-2 mt-1">
                    {content.files.map((f, i) => (
                        <a
                            key={i}
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm"
                            title={f.kind ? `Tệp ${f.kind}` : 'Tệp đính kèm'}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" />
                                <path d="M14 2v6h6" fill="none" stroke="currentColor" />
                            </svg>
                            <span className="truncate max-w-[280px]">
                                {f.kind ? `${f.kind.toUpperCase()} file` : 'Tệp đính kèm'}
                            </span>
                        </a>
                    ))}
                </div>
            );

        case 'system':
            return (
                <div className="w-full text-center my-2">
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                        {content.content || '—'}
                    </span>
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
};

// ====================== Component chính (full socket) ======================
export default function ChatClient({
    pageConfig,
    label: initialLabels,
    token,
}) {
    // 1) State hội thoại
    const [conversations, setConversations] = useState([]);
    const [loadedCount, setLoadedCount] = useState(0);

    const [allLabels, setAllLabels] = useState(initialLabels || []);
    const [selectedConvo, setSelectedConvo] = useState(null);
    const selectedConvoRef = useRef(null);
    useEffect(() => {
        selectedConvoRef.current = selectedConvo;
    }, [selectedConvo]);

    // 2) Messages detail cho hội thoại đang chọn
    const [messages, setMessages] = useState([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);

    // Load older messages (scroll top)
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const messagesScrollRef = useRef(null);

    // 3) Search
    const [searchInput, setSearchInput] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);

    // 4) Lọc theo nhãn
    const [selectedFilterLabelIds, setSelectedFilterLabelIds] = useState([]);

    // 5) Refs UI
    const formRef = useRef(null);
    const messagesEndRef = useRef(null);
    const sidebarRef = useRef(null);
    const fileInputRef = useRef(null);

    // Ảnh pending
    const [pendingImages, setPendingImages] = useState([]);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    // 6) Ước lượng “chưa rep” từ hội thoại
    const isLastFromPage = useCallback(
        (convo) => {
            const last = convo?.last_sent_by;
            const pageId = String(pageConfig?.id ?? '');
            if (!last) return false;
            const lastId = String(last.id ?? '');
            const lastEmail = String(last.email ?? '');
            const lastName = String(last.name ?? '');
            return (
                lastId === pageId ||
                (lastEmail && lastEmail.startsWith(`${pageId}@`)) ||
                lastName === pageConfig?.name
            );
        },
        [pageConfig?.id, pageConfig?.name]
    );

    // 7) Auto scroll cuối khi messages đổi
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ============== SOCKET.IO: kết nối + handlers ==============
    const socketRef = useRef(null);

    // applyPatch cho conv:patch
    const applyPatch = useCallback((prev, patch) => {
        if (!patch || !patch.type) return prev;
        if (patch.type === 'replace' && Array.isArray(patch.items)) {
            return (patch.items || []).filter(isInbox);
        }
        if (patch.type === 'upsert' && Array.isArray(patch.items)) {
            const incoming = (patch.items || []).filter(isInbox);
            return mergeConversations(prev, incoming);
        }
        if (patch.type === 'remove' && Array.isArray(patch.ids)) {
            const set = new Set(patch.ids);
            return prev.filter((c) => !set.has(c.id));
        }
        return prev;
    }, []);

    useEffect(() => {
        const s = io(SOCKET_URL, {
            path: '/socket.io',
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 3000,
            withCredentials: true,
        });
        socketRef.current = s;

        s.on('disconnect', (r) => console.warn('[socket] disconnected:', r));
        s.on('connect_error', (e) => console.error('[socket] error:', e?.message || e));

        // Realtime: patch hội thoại
        s.on('conv:patch', (patch) => {
            if (patch?.pageId && String(patch.pageId) !== String(pageConfig.id)) return;
            setConversations((prev) => {
                const next = applyPatch(prev, patch);
                return next.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            });
        });

        // Realtime: tin nhắn mới
        s.on('msg:new', (msg) => {
            const current = selectedConvoRef.current;
            const targetId = msg?.conversationId || msg?.conversation?.id;
            if (
                current &&
                (targetId === current.id ||
                    extractConvoKey(targetId) === extractConvoKey(current.id))
            ) {
                setMessages((prev) =>
                    sortAscByTime([...prev, normalizePancakeMessage(msg, pageConfig.id)])
                );
            }
            if (targetId) {
                setConversations((prev) => {
                    const conv =
                        prev.find((c) => c.id === targetId) ||
                        prev.find((c) => extractConvoKey(c.id) === extractConvoKey(targetId)) || {
                            id: targetId,
                            type: 'INBOX',
                        };
                    const updated = {
                        ...conv,
                        snippet: (() => {
                            const n = normalizePancakeMessage(msg, pageConfig.id);
                            if (n?.content?.type === 'text') return n.content.content;
                            if (n?.content?.type === 'images') return '[Ảnh]';
                            if (n?.content?.type === 'files') return '[Tệp]';
                            return conv.snippet;
                        })(),
                        updated_at: msg?.inserted_at || new Date().toISOString(),
                    };
                    const merged = mergeConversations(prev, [updated]);
                    return merged.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
                });
            }
        });

        // Lấy danh sách ban đầu
        s.emit('conv:get', { pageId: pageConfig.id, token, current_count: 0 }, (res) => {
            if (res?.ok && Array.isArray(res.items)) {
                const incoming = res.items.filter(isInbox);
                setConversations((prev) => {
                    const merged = mergeConversations(prev, incoming);
                    return merged.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
                });
                setLoadedCount(incoming.length);
            } else if (res?.error) {
                console.error('[conv:get] error:', res.error);
            }
        });

        return () => {
            if (selectedConvoRef.current?.id) {
                try {
                    s.emit('msg:watchStop', {
                        pageId: pageConfig.id,
                        conversationId: selectedConvoRef.current.id,
                    });
                } catch (_) { }
            }
            s.off('conv:patch');
            s.off('msg:new');
            s.disconnect();
            socketRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageConfig.id, token]);

    // ===================== Load more conversations (sidebar) =====================
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const onSidebarScroll = useCallback(async () => {
        if (isSearching) return;
        const el = sidebarRef.current;
        if (!el || isLoadingMore) return;
        const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 200;
        if (!nearBottom) return;

        try {
            setIsLoadingMore(true);
            const nextCount = loadedCount + PAGE_SIZE;
            const s = socketRef.current;
            if (!s) return;
            s.emit(
                'conv:loadMore',
                { pageId: pageConfig.id, token, current_count: nextCount },
                (ack) => {
                    if (ack?.ok && Array.isArray(ack.items)) {
                        const incoming = ack.items.filter(isInbox);
                        setConversations((prev) => {
                            const merged = mergeConversations(prev, incoming);
                            return merged.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
                        });
                        setLoadedCount(nextCount);
                    } else if (ack?.error) {
                        console.error('[conv:loadMore] error:', ack.error);
                    }
                }
            );
        } finally {
            setIsLoadingMore(false);
        }
    }, [isSearching, isLoadingMore, loadedCount, pageConfig.id, token]);

    useEffect(() => {
        const el = sidebarRef.current;
        if (!el) return;
        const handler = () => onSidebarScroll();
        el.addEventListener('scroll', handler);
        return () => el.removeEventListener('scroll', handler);
    }, [onSidebarScroll]);

    // ===================== Load older messages by scroll top =====================
    const loadOlderMessages = useCallback(() => {
        if (!selectedConvo || !socketRef.current || isLoadingOlder || !hasMore) return;

        setIsLoadingOlder(true);

        const nextCount = (messages?.length || 0) + 30; // mỗi lần +30
        const scroller = messagesScrollRef.current;
        const prevScrollHeight = scroller ? scroller.scrollHeight : 0;
        const prevScrollTop = scroller ? scroller.scrollTop : 0;

        const convoKey = extractConvoKey(selectedConvo.id);
        const customerId = selectedConvo?.customers?.[0]?.id || '';

        socketRef.current.emit(
            'msg:get',
            { pageId: pageConfig.id, token, conversationId: convoKey, customerId, count: nextCount },
            (res) => {
                if (res?.ok && Array.isArray(res.items)) {
                    const normalized = sortAscByTime(
                        res.items.map((m) => normalizePancakeMessage(m, pageConfig.id))
                    );
                    setMessages(normalized);
                    setHasMore(res.items.length >= nextCount); // còn nữa nếu server trả đủ

                    requestAnimationFrame(() => {
                        if (!scroller) return;
                        const newScrollHeight = scroller.scrollHeight;
                        scroller.scrollTop = newScrollHeight - (prevScrollHeight - prevScrollTop);
                    });
                }
                setIsLoadingOlder(false);
            }
        );
    }, [selectedConvo, messages, token, pageConfig.id, isLoadingOlder, hasMore]);

    useEffect(() => {
        const el = messagesScrollRef.current;
        if (!el) return;

        const onScrollTop = () => {
            if (el.scrollTop <= 80) loadOlderMessages();
        };

        el.addEventListener('scroll', onScrollTop);
        return () => el.removeEventListener('scroll', onScrollTop);
    }, [loadOlderMessages]);

    // ===================== Handlers =====================
    const handleSelectConvo = useCallback(
        async (conversation) => {
            if (selectedConvo?.id === conversation.id) return;

            const s = socketRef.current;
            if (!s) return;

            // dừng watcher cũ (nếu có)
            if (selectedConvo?.id) {
                s.emit('msg:watchStop', { pageId: pageConfig.id, conversationId: selectedConvo.id });
            }

            // set UI & tải messages 1 lần
            setSelectedConvo(conversation);
            setMessages([]);
            setHasMore(true); // reset state load-more
            setIsLoadingMessages(true);

            const convoKey = extractConvoKey(conversation.id);
            const customerId = conversation?.customers?.[0]?.id || '';
            s.emit(
                'msg:get',
                { pageId: pageConfig.id, token, conversationId: convoKey, customerId, count: 0 },
                (res) => {
                    if (res?.ok && Array.isArray(res.items)) {
                        const normalized = sortAscByTime(
                            res.items.map((m) => normalizePancakeMessage(m, pageConfig.id))
                        );
                        setMessages(normalized);
                        setHasMore(res.items.length > 0);
                    } else if (res?.error) {
                        alert(`Error: ${res.error}`);
                    }
                    setIsLoadingMessages(false);
                }
            );

            // bật watcher realtime cho hội thoại này
            s.emit(
                'msg:watchStart',
                { pageId: pageConfig.id, token, conversationId: convoKey, customerId, count: 0, intervalMs: 2500 },
                (ack) => {
                    if (!ack?.ok) console.error('[msg:watchStart] error:', ack?.error);
                }
            );
        },
        [pageConfig.id, token, selectedConvo?.id]
    );

    const triggerPickImage = useCallback(() => {
        if (!selectedConvo) {
            toast.warning('Hãy chọn một hội thoại trước khi đính kèm ảnh.');
            return;
        }
        fileInputRef.current?.click();
    }, [selectedConvo]);

    const onPickImage = useCallback(async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setIsUploadingImage(true);
        try {
            for (const f of files) {
                const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                const res = await uploadImageToDriveAction(f);
                if (!res?.success) {
                    toast.error(`Tải ảnh thất bại: ${res?.error || ''}`);
                    continue;
                }
                setPendingImages((prev) => [...prev, { id: res.id, url: res.url, localId }]);
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
        } finally {
            setIsUploadingImage(false);
        }
    }, []);

    const removePendingImage = useCallback((localId) => {
        setPendingImages((prev) => prev.filter((x) => x.localId !== localId));
    }, []);

    const handleSendMessage = async (formData) => {
        if (!selectedConvo) return;
        const text = (formData.get('message') || '').trim();
        const hasImages = pendingImages.length > 0;
        if (!text && !hasImages) return;

        // Optimistic UI
        const now = new Date().toISOString();
        const optimisticEntries = [];
        if (hasImages) {
            const optimisticIdImages = `optimistic-img-${Date.now()}`;
            optimisticEntries.push({
                id: optimisticIdImages,
                inserted_at: now,
                senderType: 'page',
                status: 'sending',
                content: {
                    type: 'images',
                    images: pendingImages.map((p) => ({ url: p.url })),
                },
            });
        }
        if (text) {
            const optimisticIdText = `optimistic-text-${Date.now()}`;
            optimisticEntries.push({
                id: optimisticIdText,
                inserted_at: now,
                senderType: 'page',
                status: 'sending',
                content: { type: 'text', content: text },
            });
        }
        if (optimisticEntries.length) {
            setMessages((prev) => sortAscByTime([...prev, ...optimisticEntries]));
        }

        // Gửi thật
        let overallOk = true;
        let lastError = null;
        try {
            if (hasImages) {
                const first = pendingImages[0];
                const res1 = await sendImageAction(
                    pageConfig.id,
                    pageConfig.accessToken,
                    selectedConvo.id,
                    first.id,
                    text || ''
                );
                if (!res1?.success) {
                    overallOk = false;
                    lastError = res1?.error || 'SEND_IMAGE_FAILED';
                }
                for (let i = 1; i < pendingImages.length; i++) {
                    const it = pendingImages[i];
                    const r = await sendImageAction(
                        pageConfig.id,
                        pageConfig.accessToken,
                        selectedConvo.id,
                        it.id,
                        ''
                    );
                    if (!r?.success) {
                        overallOk = false;
                        lastError = r?.error || 'SEND_IMAGE_FAILED';
                    }
                }
            } else if (text) {
                const r = await sendMessageAction(
                    pageConfig.id,
                    pageConfig.accessToken,
                    selectedConvo.id,
                    text
                );
                if (!r?.success) {
                    overallOk = false;
                    lastError = r?.error || 'SEND_TEXT_FAILED';
                }
            }
        } catch (e) {
            overallOk = false;
            lastError = e?.message || 'SEND_FAILED';
        }

        // cập nhật optimistic status + snippet
        setMessages((prev) =>
            prev.map((m) => {
                if (optimisticEntries.find((o) => o.id === m.id)) {
                    return { ...m, status: overallOk ? 'sent' : 'failed', error: overallOk ? null : lastError };
                }
                return m;
            })
        );

        if (overallOk) {
            setConversations((prev) => {
                const updated = {
                    ...selectedConvo,
                    snippet: text ? text : '[Ảnh]',
                    updated_at: new Date().toISOString(),
                    last_sent_by: {
                        id: pageConfig.id,
                        name: pageConfig.name,
                        email: `${pageConfig.id}@pancake`,
                    },
                };
                const merged = mergeConversations(prev, [updated]);
                return merged.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            });
            setPendingImages([]);
            formRef.current?.reset();
        } else {
            toast.error(lastError || 'Gửi thất bại');
        }
    };

    // ===================== Search (qua socket) =====================
    const runSearch = useCallback(() => {
        const q = (searchInput || '').trim();
        if (!q) return;
        const s = socketRef.current;
        if (!s) return;
        setIsSearching(true);
        s.emit('conv:search', { pageId: pageConfig.id, token, q }, (ack) => {
            if (ack?.ok && Array.isArray(ack.items)) {
                setSearchResults(ack.items.filter(isInbox));
            } else if (ack?.error) {
                toast.error('Tìm kiếm thất bại');
                console.error('[conv:search] error:', ack.error);
            }
        });
    }, [searchInput, pageConfig.id, token]);

    const clearSearch = useCallback(() => {
        setIsSearching(false);
        setSearchInput('');
        setSearchResults([]);
    }, []);

    // ===================== Dữ liệu hiển thị =====================
    const listForSidebar = isSearching ? searchResults : conversations;

    const filteredSortedConversations = useMemo(() => {
        const list = (listForSidebar || []).filter((convo) => {
            if (selectedFilterLabelIds.length > 0) {
                const psid = getConvoPsid(convo);
                if (!psid) return false;
                const customerLabelIds = allLabels
                    .filter((label) => Array.isArray(label.customer) && label.customer.includes(psid))
                    .map((label) => label._id);
                const hasAll = selectedFilterLabelIds.every((id) => customerLabelIds.includes(id));
                if (!hasAll) return false;
            }
            return true;
        });
        return list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }, [listForSidebar, selectedFilterLabelIds, allLabels]);

    const assignedLabelsForSelectedConvo = useMemo(() => {
        if (!selectedConvo) return [];
        const psid = getConvoPsid(selectedConvo);
        if (!psid) return [];
        return allLabels.filter(
            (label) => Array.isArray(label.customer) && label.customer.includes(psid)
        );
    }, [selectedConvo, allLabels]);

    // ===================== Render =====================
    return (
        <div className="flex h-full w-full bg-white rounded-md border border-gray-200 flex-col p-2 gap-2">
            <Toaster richColors position="top-right" />

            {/* Header */}
            <div className="flex">
                <div className="flex items-center gap-3 justify-between w-full">
                    <div className="flex-1 gap-2 flex items-center">
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
                            onLabelChange={(labelId, checked) =>
                                setSelectedFilterLabelIds((prev) =>
                                    checked ? [...prev, labelId] : prev.filter((id) => id !== labelId)
                                )
                            }
                            style="left"
                            trigger={
                                <button className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 active:scale-95 cursor-pointer">
                                    {selectedFilterLabelIds.length > 0 ? (
                                        <span className="bg-blue-500 text-white rounded-full px-2 py-0.5 text-xs">
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

                        {/* Tìm kiếm */}
                        <div className="relative flex-grow">
                            <Search
                                className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 cursor-pointer"
                                onClick={() => runSearch()}
                                title="Tìm kiếm"
                            />
                            <input
                                type="text"
                                placeholder="Tìm kiếm theo tên hoặc SĐT..."
                                className="w-full bg-gray-100 rounded-md pl-10 pr-10 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        runSearch();
                                    }
                                }}
                                autoComplete="off"
                            />
                            {isSearching && (
                                <button
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                    onClick={clearSearch}
                                    title="Xoá tìm kiếm"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2 items-center">
                        <div className="flex flex-col items-end">
                            <h5 className="font-semibold">{pageConfig.name}</h5>
                            <h6 className="text-xs text-gray-500">
                                {pageConfig.platform === 'facebook'
                                    ? 'Page Facebook'
                                    : pageConfig.platform === 'instagram_official'
                                        ? 'Instagram Official'
                                        : pageConfig.platform === 'tiktok_business_messaging'
                                            ? 'TikTok Business Messaging'
                                            : null}
                            </h6>
                        </div>
                        <Image
                            src={pageConfig.avatar}
                            alt={pageConfig.name}
                            width={36}
                            height={36}
                            className="rounded-md object-cover"
                        />
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex overflow-hidden bg-white rounded-md border border-gray-200">
                {/* Sidebar hội thoại */}
                <div className="w-full max-w-sm border-r border-gray-200 flex flex-col">
                    <ul className="flex-1 overflow-y-auto" ref={sidebarRef}>
                        {filteredSortedConversations.map((convo) => {
                            const idUserForAvatar = getConvoAvatarId(convo);
                            const avatarUrl = avatarUrlFor({ idpage: pageConfig.id, iduser: idUserForAvatar });
                            const customerName = getConvoDisplayName(convo);
                            const formattedDateTime = fmtDateTimeVN(convo.updated_at);

                            const psid = getConvoPsid(convo);
                            const assignedLabels = psid
                                ? allLabels.filter(
                                    (label) => Array.isArray(label.customer) && label.customer.includes(psid)
                                )
                                : [];

                            const lastFromPage = isLastFromPage(convo);
                            const snippetPrefix = lastFromPage ? 'Bạn: ' : `${customerName}: `;
                            const unrepliedCount = lastFromPage ? 0 : 1;

                            return (
                                <li
                                    key={convo.id}
                                    onClick={() => handleSelectConvo(convo)}
                                    className={`flex items-start p-3 cursor-pointer hover:bg-gray-100 ${selectedConvo?.id === convo.id ? 'bg-blue-50' : ''
                                        }`}
                                >
                                    <div className="relative mr-3">
                                        <FallbackAvatar
                                            src={avatarUrl}
                                            alt={customerName}
                                            name={customerName}
                                            width={48}
                                            height={48}
                                            className="rounded-full object-cover"
                                        />
                                        {unrepliedCount > 0 && (
                                            <span
                                                className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center"
                                                title="Tin nhắn chưa rep"
                                            >
                                                {unrepliedCount === 1 ? '!' : null}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-hidden">
                                        <h6 className="font-semibold truncate text-gray-800">{customerName}</h6>
                                        <h6 className="text-sm text-gray-600 truncate">
                                            {snippetPrefix}
                                            {convo.snippet}
                                        </h6>

                                        {assignedLabels.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {assignedLabels.map((label) => (
                                                    <span
                                                        key={label._id}
                                                        className="rounded-full px-2 py-0.5 text-xs"
                                                        style={{ backgroundColor: label.color, color: 'white' }}
                                                    >
                                                        {label.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="text-right ml-2 whitespace-nowrap">
                                        <div className="text-xs text-gray-500">{formattedDateTime}</div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    {isLoadingMore && (
                        <div className="p-2 text-center text-xs text-gray-400">Đang tải thêm…</div>
                    )}
                </div>

                {/* Panel chi tiết */}
                <div className="flex-1 flex flex-col bg-gray-50">
                    {selectedConvo ? (
                        <>
                            <div className="flex items-center p-3 border-b border-gray-200 bg-white justify-between">
                                <div className="flex items-center">
                                    <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center font-bold mr-3">
                                        <FallbackAvatar
                                            src={avatarUrlFor({
                                                idpage: pageConfig.id,
                                                iduser: getConvoAvatarId(selectedConvo),
                                            })}
                                            alt={getConvoDisplayName(selectedConvo)}
                                            name={getConvoDisplayName(selectedConvo)}
                                            width={40}
                                            height={40}
                                            className="rounded-full object-cover"
                                        />
                                    </div>
                                    <h4 className="font-bold text-lg text-gray-900">
                                        {getConvoDisplayName(selectedConvo)}
                                    </h4>
                                </div>

                                <div>
                                    {getConvoPsid(selectedConvo) ? (
                                        <LabelDropdown
                                            labels={allLabels}
                                            selectedLabelIds={(allLabels || [])
                                                .filter(
                                                    (l) =>
                                                        Array.isArray(l.customer) &&
                                                        l.customer.includes(getConvoPsid(selectedConvo))
                                                )
                                                .map((l) => l._id)}
                                            style="right"
                                            onLabelChange={(labelId) => {/* hook gán nhãn nếu cần */ }}
                                            trigger={
                                                <button className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 active:scale-95 cursor-pointer">
                                                    <Tag className="h-4 w-4 text-gray-500" />
                                                    <span>Thêm nhãn</span>
                                                </button>
                                            }
                                        />
                                    ) : (
                                        <button
                                            disabled
                                            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-400 cursor-not-allowed"
                                            title="Hội thoại không có PSID, không thể gán nhãn"
                                        >
                                            <Tag className="h-4 w-4" />
                                            <span>Không thể gán nhãn</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div ref={messagesScrollRef} className="flex-1 p-6 space-y-1 overflow-y-auto">
                                {isLoadingOlder && (
                                    <div className="text-center text-xs text-gray-400 mb-2">
                                        Đang tải tin nhắn cũ…
                                    </div>
                                )}

                                {isLoadingMessages && (
                                    <div className="text-center text-gray-500">Đang tải tin nhắn...</div>
                                )}

                                {messages.map((msg, index) => {
                                    if (!msg) return null;
                                    const formattedTime = fmtDateTimeVN(msg.inserted_at);
                                    return msg.content?.type === 'system' ? (
                                        <MessageContent key={msg.id || `msg-${index}`} content={msg.content} />
                                    ) : (
                                        <div
                                            key={msg.id || `msg-${index}`}
                                            className={`flex flex-col my-1 ${msg.senderType === 'page' ? 'items-end' : 'items-start'
                                                }`}
                                        >
                                            <div
                                                className={`max-w-lg p-3 rounded-xl shadow-sm flex flex-col ${msg.senderType === 'page'
                                                        ? 'bg-blue-500 text-white items-end'
                                                        : 'bg-white text-gray-800'
                                                    }`}
                                            >
                                                <MessageContent content={msg.content} />
                                                <div
                                                    className={`text-xs mt-1 ${msg.senderType === 'page'
                                                            ? 'text-right text-blue-100/80'
                                                            : 'text-left text-gray-500'
                                                        }`}
                                                >
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
                                {!!pendingImages.length && (
                                    <div className="mb-2 flex flex-wrap gap-2">
                                        {pendingImages.map((img) => (
                                            <div key={img.localId} className="relative">
                                                <img
                                                    src={img.url}
                                                    alt="preview"
                                                    className="h-20 w-20 rounded object-cover border"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removePendingImage(img.localId)}
                                                    className="absolute -top-2 -right-2 bg-white border rounded-full p-0.5 shadow hover:bg-gray-50"
                                                    title="Xoá ảnh"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">
                                    <button
                                        type="button"
                                        className="text-gray-700 hover:text-gray-900 disabled:opacity-60"
                                        onClick={triggerPickImage}
                                        disabled={isUploadingImage}
                                        title="Đính kèm ảnh"
                                    >
                                        <ImageIcon className="h-5 w-5" />
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={onPickImage}
                                    />

                                    <input
                                        name="message"
                                        placeholder={isUploadingImage ? 'Đang tải ảnh...' : 'Nhập tin nhắn...'}
                                        className="flex-1 bg-transparent text-sm focus:outline-none disabled:opacity-60"
                                        autoComplete="off"
                                        disabled={isUploadingImage}
                                    />

                                    <button
                                        type="submit"
                                        className="text-blue-500 hover:text-blue-700 disabled:opacity-60"
                                        disabled={isUploadingImage}
                                    >
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
