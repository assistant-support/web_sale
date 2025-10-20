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
const FORCE_WS = (process.env.NEXT_PUBLIC_SOCKET_WS_ONLY || 'false') === 'true';

// ====== THỜI GIAN: format theo Asia/Ho_Chi_Minh (KHÔNG cộng tay) ======
/** Định dạng thời gian theo múi giờ VN, fallback chuỗi mặc định nếu lỗi */
const fmtDateTimeVN = (dateLike) => {
    try {
        if (!dateLike) return 'Thời gian không xác định';
        return new Date(dateLike).toLocaleString('vi-VN', {
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

// ======================= Helpers hội thoại =======================
/** Chỉ lấy hội thoại INBOX */
const isInbox = (convo) => convo?.type === 'INBOX';
/** Lấy PSID (nếu có) dùng cho gán nhãn */
const getConvoPsid = (convo) => convo?.from_psid || null;
/** Lấy id avatar người dùng */
const getConvoAvatarId = (convo) =>
    convo?.from_psid || convo?.customers?.[0]?.fb_id || convo?.from?.id || null;
/** Lấy tên hiển thị */
const getConvoDisplayName = (convo) =>
    convo?.customers?.[0]?.name || convo?.from?.name || 'Khách hàng ẩn';
/** Tạo URL avatar Pancake */
const avatarUrlFor = ({ idpage, iduser }) =>
    iduser ? `https://pancake.vn/api/v1/pages/${idpage}/avatar/${iduser}` : undefined;

// ======================= Helpers tin nhắn =======================
/** Xác định phía gửi (page|customer) dựa trên from.id và pageId */
const getSenderType = (msg, pageId) => {
    if (msg?.senderType) return msg.senderType; // cho optimistic
    const fromId = String(msg?.from?.id || '');
    return fromId === String(pageId) ? 'page' : 'customer';
};

/** Convert HTML <div>, <br>... sang plain text để hiển thị an toàn */
const htmlToPlainText = (html) => {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/div>\s*<div>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .trim();
};

/** 
 * Chuẩn hoá 1 message Pancake thành cấu trúc UI:
 * - Ưu tiên attachments: 'photo' => images, loại khác => files (click download)
 * - Text: dùng original_message nếu có; fallback parse plain text từ message (HTML)
 */
const normalizePancakeMessage = (raw, pageId) => {
    const senderType = getSenderType(raw, pageId);
    const ts = raw.inserted_at;

    const atts = Array.isArray(raw.attachments) ? raw.attachments : [];

    // Tách ảnh
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

    // Tách file (mọi loại khác 'photo' xem như file)
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
                    name: a?.name || a?.filename || undefined,
                })),
            },
        };
    }

    // Text: KHÔNG cố “parse JSON”, KHÔNG render HTML thô
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

/** Merge danh sách hội thoại theo id, giữ field cũ & ghi đè field mới nếu newer */
const mergeConversations = (prevList, incoming) => {
    const map = new Map(prevList.map((c) => [c.id, c]));
    (incoming || []).forEach((c) => {
        const old = map.get(c.id);
        if (!old) {
            map.set(c.id, c);
        } else {
            const newer = new Date(c.updated_at).getTime() > new Date(old.updated_at).getTime();
            map.set(c.id, newer ? { ...old, ...c } : old); // merge shallow để không mất field
        }
    });
    return Array.from(map.values());
};

/** Sắp xếp tin nhắn tăng dần theo thời gian */
const sortAscByTime = (arr) =>
    [...arr].sort((a, b) => new Date(a.inserted_at).getTime() - new Date(b.inserted_at).getTime());

/** Lấy phần sau dấu "_" nếu có (theo API messages của Pancake) */
const extractConvoKey = (cid) => {
    if (!cid) return cid;
    const idx = String(cid).indexOf('_');
    return idx >= 0 ? String(cid).slice(idx + 1) : String(cid);
};

// ======================= Subcomponents =======================
/** Dropdown chọn/lọc nhãn khách hàng */
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

/** Render nội dung tin nhắn (text/images/files/system) */
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
                            title={f.name || (f.kind ? `Tệp ${f.kind}` : 'Tệp đính kèm')}
                            download
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" />
                                <path d="M14 2v6h6" fill="none" stroke="currentColor" />
                            </svg>
                            <span className="truncate max-w-[280px]">
                                {f.name || (f.kind ? `${String(f.kind).toUpperCase()} file` : 'Tệp đính kèm')}
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

/** Hiển thị trạng thái gửi của tin nhắn optimistic (gần nhất) */
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

    const [allLabels] = useState(initialLabels || []);
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
    /** Kiểm tra tin cuối có phải do page gửi không (để ước lượng badge chưa rep) */
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

    // ============== SOCKET.IO: kết nối + handlers ==============
    const socketRef = useRef(null);

    // Tránh trùng tin nhắn
    const seenMsgIdsRef = useRef(new Set());

    // Nhớ số lượng tin từ server (không tính optimistic) để load-more chính xác
    const fetchedCountRef = useRef(0);

    // Nhớ số hội thoại đã load để phục hồi sau reconnect
    const loadedCountRef = useRef(0);
    useEffect(() => {
        loadedCountRef.current = loadedCount;
    }, [loadedCount]);

    // Nhớ hội thoại đang watch để bật lại khi reconnect
    const watchingConvoRef = useRef(null);

    /** Áp patch conv:patch -> trả danh sách mới đã sort */
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

    /** Thiết lập socket, nhận conv:patch và msg:new (realtime), + phục hồi watcher khi reconnect */
    useEffect(() => {
        const s = io(SOCKET_URL, {
            path: '/socket.io',
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 3000,
            reconnectionDelayMax: 10000,
            randomizationFactor: 0.5,
            withCredentials: true,
            ...(FORCE_WS ? { transports: ['websocket'] } : {}),
        });
        socketRef.current = s;

        // Khi connect: lấy danh sách và bật lại watcher nếu có
        s.on('connect', () => {
            s.emit('conv:get', { pageId: pageConfig.id, token, current_count: loadedCountRef.current }, (res) => {
                if (res?.ok && Array.isArray(res.items)) {
                    const incoming = res.items.filter(isInbox);
                    setConversations((prev) => {
                        const merged = mergeConversations(prev, incoming);
                        return merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
                    });
                    setLoadedCount(incoming.length);
                }
            });

            const curId = watchingConvoRef.current || selectedConvoRef.current?.id;
            if (curId) {
                const convoKey = extractConvoKey(curId);
                const customerId = selectedConvoRef.current?.customers?.[0]?.id || '';
                s.emit(
                    'msg:watchStart',
                    { pageId: pageConfig.id, token, conversationId: convoKey, customerId, count: 0, intervalMs: 2500 },
                    () => { /* no-op */ }
                );
            }
        });

        // Patch hội thoại realtime
        s.on('conv:patch', (patch) => {
            if (patch?.pageId && String(patch.pageId) !== String(pageConfig.id)) return;
            setConversations((prev) => {
                const next = applyPatch(prev, patch);
                return next.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
            });
        });

        // Tin nhắn mới realtime (de-dup + upsert)
        s.on('msg:new', (incomingMsg) => {
            console.log(incomingMsg);
            
            // chống trùng theo id
            if (incomingMsg?.id) {
                if (seenMsgIdsRef.current.has(incomingMsg.id)) return;
                seenMsgIdsRef.current.add(incomingMsg.id);
                if (seenMsgIdsRef.current.size > 5000) {
                    // tránh phình bộ nhớ: giữ lại 2500 id gần nhất
                    seenMsgIdsRef.current = new Set(Array.from(seenMsgIdsRef.current).slice(-2500));
                }
            }

            // xác định hội thoại đích
            let targetId = incomingMsg?.conversationId || incomingMsg?.conversation?.id;
            if (!targetId && selectedConvoRef.current) {
                targetId = selectedConvoRef.current.id;
                incomingMsg = { ...incomingMsg, conversationId: targetId };
            }

            const current = selectedConvoRef.current;
            if (
                current &&
                (targetId === current.id ||
                    extractConvoKey(String(targetId)) === extractConvoKey(String(current.id)))
            ) {
                const n = normalizePancakeMessage(incomingMsg, pageConfig.id);
                setMessages((prev) => {
                    const i = prev.findIndex((m) => m.id === n.id);
                    if (i >= 0) {
                        const next = [...prev];
                        next[i] = n;
                        return sortAscByTime(next);
                    }
                    return sortAscByTime([...prev, n]);
                });
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }

            // Cập nhật snippet sidebar
            if (targetId) {
                setConversations((prev) => {
                    const conv =
                        prev.find((c) => c.id === targetId) ||
                        prev.find((c) => extractConvoKey(String(c.id)) === extractConvoKey(String(targetId))) || {
                            id: targetId,
                            type: 'INBOX',
                        };
                    const n = normalizePancakeMessage(incomingMsg, pageConfig.id);
                    const updated = {
                        ...conv,
                        snippet:
                            n?.content?.type === 'text'
                                ? n.content.content
                                : n?.content?.type === 'images'
                                    ? '[Ảnh]'
                                    : n?.content?.type === 'files'
                                        ? '[Tệp]'
                                        : conv.snippet,
                        updated_at: incomingMsg?.inserted_at || new Date().toISOString(),
                    };
                    const merged = mergeConversations(prev, [updated]);
                    return merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
                });
            }
        });

        // Lấy danh sách ban đầu khi mount
        s.emit('conv:get', { pageId: pageConfig.id, token, current_count: 0 }, (res) => {
            if (res?.ok && Array.isArray(res.items)) {
                const incoming = res.items.filter(isInbox);
                setConversations((prev) => {
                    const merged = mergeConversations(prev, incoming);
                    return merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
                });
                setLoadedCount(incoming.length);
            }
        });

        return () => {
            if (selectedConvoRef.current?.id) {
                try {
                    s.emit('msg:watchStop', {
                        pageId: pageConfig.id,
                        conversationId: selectedConvoRef.current.id,
                    });
                } catch { }
            }
            s.off('conv:patch');
            s.off('msg:new');
            s.off('connect');
            s.off('connect_error');
            s.off('disconnect');
            s.disconnect();
            socketRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageConfig.id, token, applyPatch]);

    // ===================== Load more conversations (sidebar) =====================
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    /** Khi scroll gần cuối sidebar -> gọi conv:loadMore */
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
                            return merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
                        });
                        setLoadedCount(nextCount);
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
    /** Khi kéo lên trên cùng khung chat -> tăng count để lấy thêm message cũ */
    const loadOlderMessages = useCallback(() => {
        if (!selectedConvo || !socketRef.current || isLoadingOlder || !hasMore) return;

        setIsLoadingOlder(true);

        const nextCount = fetchedCountRef.current + 30; // mỗi lần +30
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
                    const incomingMessages = res.items;

                    // Nếu tổng không tăng -> hết dữ liệu
                    if (incomingMessages.length === fetchedCountRef.current) {
                        setHasMore(false);
                    } else {
                        setHasMore(true);
                        fetchedCountRef.current = incomingMessages.length; // cập nhật mốc
                    }

                    // Cộng dồn unique theo id
                    setMessages((prevMessages) => {
                        const map = new Map();
                        incomingMessages.forEach((raw) => {
                            const n = normalizePancakeMessage(raw, pageConfig.id);
                            map.set(n.id, n);
                        });
                        prevMessages.forEach((m) => {
                            if (!map.has(m.id)) map.set(m.id, m);
                        });
                        return sortAscByTime(Array.from(map.values()));
                    });

                    // Giữ nguyên vị trí scroll sau khi tải
                    requestAnimationFrame(() => {
                        if (!scroller) return;
                        const newScrollHeight = scroller.scrollHeight;
                        scroller.scrollTop = newScrollHeight - (prevScrollHeight - prevScrollTop);
                    });
                } else {
                    setHasMore(false);
                }
                setIsLoadingOlder(false);
            }
        );
    }, [selectedConvo, token, pageConfig.id, isLoadingOlder, hasMore]);

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
    /** Chọn 1 hội thoại -> dừng watcher cũ, load lịch sử, seed de-dup, bật watcher mới */
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
            seenMsgIdsRef.current = new Set(); // reset chống trùng khi đổi hội thoại

            const convoKey = extractConvoKey(conversation.id);
            const customerId = conversation?.customers?.[0]?.id || '';
            s.emit(
                'msg:get',
                { pageId: pageConfig.id, token, conversationId: convoKey, customerId, count: 0 },
                (res) => {
                    if (res?.ok && Array.isArray(res.items)) {
                        fetchedCountRef.current = res.items.length; // mốc server

                        const normalized = sortAscByTime(
                            res.items.map((m) => normalizePancakeMessage(m, pageConfig.id))
                        );

                        // seed chống trùng ngay tại đây để watcher không bắn lại các tin vừa load
                        seenMsgIdsRef.current = new Set(normalized.map((m) => m.id).filter(Boolean));

                        setMessages(normalized);
                        setHasMore(res.items.length > 0);
                    } else if (res?.error) {
                        toast.error(res.error);
                    }
                    setIsLoadingMessages(false);
                }
            );

            // bật watcher realtime cho hội thoại này
            s.emit(
                'msg:watchStart',
                { pageId: pageConfig.id, token, conversationId: convoKey, customerId, count: 0, intervalMs: 2500 },
                (ack) => {
                    if (ack?.ok) watchingConvoRef.current = conversation?.id || null;
                }
            );
        },
        [pageConfig.id, token, selectedConvo?.id]
    );

    /** Mở file picker ảnh */
    const triggerPickImage = useCallback(() => {
        if (!selectedConvo) {
            toast.warning('Hãy chọn một hội thoại trước khi đính kèm ảnh.');
            return;
        }
        fileInputRef.current?.click();
    }, [selectedConvo]);

    /** Sau khi chọn ảnh -> upload lên Drive (hoặc nơi của bạn) và đưa vào pending */
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

    /** Xoá ảnh pending trước khi gửi */
    const removePendingImage = useCallback((localId) => {
        setPendingImages((prev) => prev.filter((x) => x.localId !== localId));
    }, []);

    /** Gửi tin nhắn (text + ảnh pending) với optimistic UI */
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
                    text,
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
                return merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
            });
            setPendingImages([]);
            formRef.current?.reset();
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
            toast.error(lastError || 'Gửi thất bại');
        }
    };

    // ===================== Search (qua socket) =====================
    /** Gọi conv:search theo tên/SĐT */
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
            }
        });
    }, [searchInput, pageConfig.id, token]);

    /** Xoá trạng thái tìm kiếm */
    const clearSearch = useCallback(() => {
        setIsSearching(false);
        setSearchInput('');
        setSearchResults([]);
    }, []);

    // ===================== Dữ liệu hiển thị =====================
    const listForSidebar = isSearching ? searchResults : conversations;

    /** Lọc theo nhãn + sort by updated_at */
    const filteredSortedConversations = useMemo(() => {
        const list = (listForSidebar || []).filter((convo) => {
            if (selectedFilterLabelIds.length > 0) {
                const psid = getConvoPsid(convo);
                if (!psid) return false;
                const customerLabelIds = (allLabels || [])
                    .filter((label) => Array.isArray(label.customer) && label.customer.includes(psid))
                    .map((label) => label._id);
                const hasAll = selectedFilterLabelIds.every((id) => customerLabelIds.includes(id));
                if (!hasAll) return false;
            }
            return true;
        });
        return list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }, [listForSidebar, selectedFilterLabelIds, allLabels]);

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
                                ? (allLabels || []).filter(
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
                                            onLabelChange={() => {
                                                /* hook gán nhãn nếu cần */
                                            }}
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
                                        <MessageContent key={msg.id ?? `sys-${index}`} content={msg.content} />
                                    ) : (
                                        <div
                                            key={msg.id ?? `m-${msg.inserted_at}-${index}`}
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
