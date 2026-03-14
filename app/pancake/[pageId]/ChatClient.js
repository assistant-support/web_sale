'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { Search, Send, Loader2, Check, AlertCircle, ChevronLeft, Tag, ChevronDown, X, Image as ImageIcon, Video as VideoIcon, Play, Inbox, MessageSquare, Plus, Trash2, FileText, RefreshCw, User } from 'lucide-react';
import { sendMessageAction, uploadImageToPancakeAction, sendImageAction, uploadVideoToPancakeAction, sendVideoAction } from './actions';
import { toggleLabelForCustomer, getConversationIdsByLabelsAndPage } from '@/app/(setting)/label/actions';
import { getConversationsFromIds } from '@/lib/pancake-api';
import { Toaster, toast } from 'sonner';

import Image from 'next/image';
import Link from 'next/link';
import FallbackAvatar from '@/components/FallbackAvatar';

// ======================= Cấu hình nhỏ =======================
const PAGE_SIZE = 40; // mỗi lần load thêm hội thoại
const SOCKET_URL = process.env.NEXT_PUBLIC_REALTIME_URL || 'http://localhost:3001';

// ====== THỜI GIAN: Chuẩn hoá sang VN, chỉ cộng +7 nếu chuỗi thiếu timezone ======
const parseToVNDate = (dateLike) => {
    if (!dateLike) return null;
    const raw = String(dateLike);
    const hasTZ = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw); // có 'Z' hoặc offset +07:00
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    if (!hasTZ) {
        // API trả chuỗi không có timezone -> hiểu là UTC naive, cần +7
        d.setHours(d.getHours() + 7);
    }
    return d;
};

const fmtDateTimeVN = (dateLike) => {
    try {
        const d = parseToVNDate(dateLike);
        if (!d) return 'Thời gian không xác định';
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

// Helper: Tính SHA1 hash của file (dùng cho upload ảnh COMMENT)
const calculateSHA1 = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-1', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (e) {
        console.error('[calculateSHA1] error:', e);
        return null;
    }
};

// ======================= Helper =======================
const isInbox = (convo) => convo?.type === 'INBOX';
const isComment = (convo) => convo?.type === 'COMMENT' || convo?.type === 'POST_COMMENT';
const getConvoType = (convo) => {
    if (isInbox(convo)) return 'INBOX';
    if (isComment(convo)) return 'COMMENT';
    return 'UNKNOWN';
};
const getConvoPsid = (convo) => convo?.from_psid || null;
const getConvoAvatarId = (convo) =>
    convo?.from_psid || convo?.customers?.[0]?.fb_id || convo?.from?.id || null;
const getConvoDisplayName = (convo) =>
    convo?.customers?.[0]?.name || convo?.from?.name || 'Khách hàng ẩn';
const avatarUrlFor = ({ idpage, iduser, token }) =>
    iduser ? `https://pancake.vn/api/v1/pages/${idpage}/avatar/${iduser}?access_token=${token}` : undefined;

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

// Chuẩn hóa số điện thoại Việt Nam
const normalizeVNPhone = (digits) => {
    if (typeof digits !== 'string') return null;
    
    const cleaned = digits.replace(/[^\d+]/g, '');
    
    if (cleaned.startsWith('+84')) {
        const phone = '0' + cleaned.substring(3);
        return phone.length === 10 ? phone : null;
    } else if (cleaned.startsWith('84') && cleaned.length === 11) {
        return '0' + cleaned.substring(2);
    } else if (cleaned.startsWith('0') && cleaned.length === 10) {
        return cleaned;
    }
    
    return null;
};

// Trích xuất số điện thoại từ văn bản
const extractPhones = (text) => {
    if (typeof text !== 'string' || !text.trim()) return [];
    const out = new Set();
    
    const pattern = /(?:\+?84|0)[\s.\-_]*(?:\d[\s.\-_]*){8,10}\d/g;
    const matches = text.match(pattern) || [];

    for (const raw of matches) {
        const onlyDigits = raw.replace(/[^\d+]/g, '');
        const normalized = normalizeVNPhone(onlyDigits);
        if (normalized) out.add(normalized);
    }
    return [...out];
};

// Gọi API tạo khách hàng tự động
const createAutoCustomer = async (customerName, messageContent, conversationId, platform, pageName) => {
    try {
        const response = await fetch('/api/auto-customer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                customerName,
                messageContent,
                conversationId,
                platform,
                pageName
            })
        });

        const result = await response.json();
        
        if (result.success) {
            console.log('✅ [Auto Customer] Tạo khách hàng thành công:', result);
            return result;
        } else {
            console.log('⚠️ [Auto Customer] Không thể tạo khách hàng:', result.message);
            return null;
        }
    } catch (error) {
        console.error('❌ [Auto Customer] Lỗi khi gọi API:', error);
        return null;
    }
};

// Helper: Chuẩn hóa một raw message có thể tạo ra nhiều UI messages
// (ví dụ: INBOX message có comment attachment -> tạo cả COMMENT message và INBOX message)
const normalizeMessagesFromRaw = (raw, pageId, convFromName = null, pageName = null) => {
    const msgType = raw?.type; // 'INBOX' hoặc 'COMMENT'
    const asArray = (v) => (Array.isArray(v) ? v : []);
    const atts = [
        ...asArray(raw.attachments),
        ...asArray(raw.attachments?.data),
        ...asArray(raw.message_attachments),
        ...asArray(raw.data?.attachments),
        ...(raw.attachment ? [raw.attachment] : []),
    ];
    
    // ✅ Phát hiện COMMENT trong attachments (comment được nhúng trong INBOX messages)
    // Comment có dạng: attachments[].comment với structure:
    // { comment: { content, from, msg_id }, post_attachments: [], name: "post text", type: "link" }
    const commentAttachments = atts.filter(a => a?.comment && typeof a.comment === 'object');
    
    const messages = [];
    
    // ✅ Nếu có comment attachments trong INBOX message, tạo COMMENT message riêng
    if (commentAttachments.length > 0 && msgType === 'INBOX') {
        const commentAtt = commentAttachments[0];
        const comment = commentAtt.comment || {};
        const commentContent = comment.content || comment.message || '';
        const commentAuthor = comment.from?.name || comment.from || 'Khách hàng';
        const commentMsgId = comment.msg_id || comment.id || '';
        
        // Lấy post info
        const postAttachments = asArray(commentAtt.post_attachments);
        const postText = commentAtt.name || '';
        const postUrl = commentAtt.url || '';
        
        // ✅ QUAN TRỌNG: Parse ảnh từ comment attachment (ảnh gửi trong comment reply)
        // Ảnh nằm ở: attachments[].comment.attachment.media.image.src
        const commentImageUrl = comment.attachment?.media?.image?.src || 
                                 comment.attachment?.image?.src ||
                                 comment.attachment?.url ||
                                 null;
        const commentImageWidth = comment.attachment?.media?.image?.width ||
                                  comment.attachment?.image?.width ||
                                  null;
        const commentImageHeight = comment.attachment?.media?.image?.height ||
                                   comment.attachment?.image?.height ||
                                   null;
        
        // Tạo content cho comment message
        let commentMessageContent = {
            type: 'text',
            content: commentContent || postText || '[Bình luận]',
        };
        
        // Nếu có ảnh trong comment attachment (ảnh reply)
        if (commentImageUrl) {
            const commentImage = {
                url: commentImageUrl,
                width: commentImageWidth,
                height: commentImageHeight,
            };
            
            if (commentContent && commentContent.trim().length > 0) {
                commentMessageContent = {
                    type: 'images_with_text',
                    images: [commentImage],
                    text: commentContent,
                };
            } else {
                commentMessageContent = {
                    type: 'images',
                    images: [commentImage],
                };
            }
        } else if (postAttachments.length > 0) {
            // Nếu có post attachments (hình ảnh/video của bài post gốc), thêm vào
            const postImages = postAttachments
                .filter(pa => pa?.type === 'video_inline' || pa?.type === 'photo' || pa?.image_data)
                .map(pa => ({
                    url: pa?.url || pa?.image_data?.url,
                    width: pa?.image_data?.width || pa?.width,
                    height: pa?.image_data?.height || pa?.height,
                }))
                .filter(img => img.url);
            
            if (postImages.length > 0) {
                // Nếu có cả text post và hình ảnh
                if (postText && postText.trim().length > 0) {
                    commentMessageContent = {
                        type: 'images_with_text',
                        images: postImages,
                        text: postText,
                    };
                } else if (commentContent) {
                    commentMessageContent = {
                        type: 'images_with_text',
                        images: postImages,
                        text: commentContent,
                    };
                } else {
                    commentMessageContent = {
                        type: 'images',
                        images: postImages,
                    };
                }
            }
        }
        
        // Tạo metadata cho comment
        const commentMetadata = {
            postId: postUrl ? postUrl.split('/').pop() : null,
            conversationId: raw.conversation_id,
            author: commentAuthor,
            commentMsgId: commentMsgId,
            postUrl: postUrl,
            hasPostContent: !!(postText && postText.trim().length > 0),
            hasPostImages: postAttachments.length > 0,
        };
        
        // Thêm COMMENT message
        messages.push({
            id: raw.id + '_comment', // Unique ID cho comment message
            inserted_at: raw.inserted_at,
            senderType: getSenderType({ from: comment.from }, pageId),
            status: raw.status || 'sent',
            channel: 'COMMENT',
            content: commentMessageContent,
            metadata: commentMetadata,
        });
        
        // Loại bỏ comment attachments khỏi atts để normalizePancakeMessage không xử lý lại
        const nonCommentAtts = atts.filter(a => !commentAttachments.includes(a));
        raw = { ...raw, attachments: nonCommentAtts };
    }
    
    // ✅ Normalize message chính (INBOX hoặc COMMENT)
    const normalizedMsg = normalizePancakeMessage(raw, pageId, convFromName, pageName);
    if (normalizedMsg) {
        messages.push(normalizedMsg);
    }
    
    return messages;
};

// Chuẩn hoá 1 message của Pancake thành cấu trúc UI bạn dùng
const normalizePancakeMessage = (raw, pageId, convFromName = null, pageName = null) => {
    const msgType = raw?.type; // 'INBOX' hoặc 'COMMENT'
    const senderType = getSenderType(raw, pageId);
    const ts = raw.inserted_at;

    // === Normalize attachments from multiple shapes ===
    const asArray = (v) => (Array.isArray(v) ? v : []);
    const atts = [
        ...asArray(raw.attachments),
        ...asArray(raw.attachments?.data),
        ...asArray(raw.message_attachments),
        ...asArray(raw.data?.attachments),
        ...(raw.attachment ? [raw.attachment] : []),
    ];

    const deriveType = (a) => {
        const type =
            a?.type ||
            a?.attachment_type ||
            a?.attachmentType ||
            a?.payload?.type ||
            '';
        return typeof type === 'string' ? type.toLowerCase() : '';
    };

    const deriveMime = (a) => {
        const mime =
            a?.mime ||
            a?.mime_type ||
            a?.content_type ||
            a?.payload?.mime ||
            a?.payload?.mime_type ||
            '';
        return typeof mime === 'string' ? mime.toLowerCase() : '';
    };

    const resolveUrl = (a) => {
        const candidates = [
            a?.url,
            a?.content_url,
            a?.attachment_url,
            a?.preview_url,
            a?.thumbnail_url,
            a?.image_data?.url,
            a?.payload?.url,
            a?.payload?.src,
            a?.media?.image?.src,
            a?.media?.image?.url,
            a?.src,
            a?.source,
            a?.file_url,
            a?.origin_url,
        ];
        return candidates.find((u) => typeof u === 'string' && u);
    };

    // ✅ Phát hiện sticker - sticker có type="sticker" hoặc trong payload
    const stickerAtts = atts
        .filter((a) => {
            const type = deriveType(a);
            return (
                a &&
                (type === 'sticker' ||
                    a?.payload?.type === 'sticker' ||
                    a?.payload?.sticker_id ||
                    (a?.payload?.url && type !== 'photo' && type !== 'image'))
            );
        })
        .map((a) => {
            const url = resolveUrl(a) || a?.payload?.image_url;
            return url ? { ...a, url, stickerId: a?.payload?.sticker_id || a?.sticker_id } : null;
        })
        .filter((a) => a && a.url);
    
    // Nếu có sticker, ưu tiên hiển thị sticker
    if (stickerAtts.length > 0) {
        return {
            id: raw.id,
            inserted_at: ts,
            senderType,
            status: raw.status || 'sent',
            content: {
                type: 'sticker',
                stickers: stickerAtts.map((a) => ({
                    url: a.url,
                    width: a?.image_data?.width || a?.width || 200,
                    height: a?.image_data?.height || a?.height || 200,
                    stickerId: a.stickerId,
                })),
            },
        };
    }

    const imageAtts = atts
        .filter((a) => {
            if (!a) return false;
            const type = deriveType(a);
            if (type === 'sticker') return false;
            const mime = deriveMime(a);
            return (
                type === 'photo' ||
                type === 'image' ||
                (type === 'file' && mime.startsWith('image/')) ||
                mime.startsWith('image/')
            );
        })
        .map((a) => {
            const url = resolveUrl(a);
            return url
                ? {
                      ...a,
                      url,
                      width: a?.image_data?.width || a?.width,
                      height: a?.image_data?.height || a?.height,
                  }
                : a;
        })
        .filter((a) => a?.url);
    if (imageAtts.length > 0) {
        // Kiểm tra xem có text kèm theo không
        let text =
            typeof raw.original_message === 'string' && raw.original_message.trim().length > 0
                ? raw.original_message.trim()
                : htmlToPlainText(raw.message || '');
        
        const hasText = text && text.trim().length > 0;
        
        // Nếu có cả ảnh và text, trả về type 'images_with_text'
        if (hasText) {
            return {
                id: raw.id,
                inserted_at: ts,
                senderType,
                status: raw.status || 'sent',
                content: {
                    type: 'images_with_text',
                    images: imageAtts.map((a) => ({
                        url: a.url,
                        width: a?.image_data?.width || a?.width,
                        height: a?.image_data?.height || a?.height,
                    })),
                    text: text.trim(),
                },
            };
        }
        
        // Chỉ có ảnh, không có text
        return {
            id: raw.id,
            inserted_at: ts,
            senderType,
            status: raw.status || 'sent',
            content: {
                type: 'images',
                images: imageAtts.map((a) => ({
                    url: a.url,
                    width: a?.image_data?.width || a?.width,
                    height: a?.image_data?.height || a?.height,
                })),
            },
        };
    }

    const videoAtts = atts
        .map((a) => {
            const url =
                a?.video_data?.url ||
                resolveUrl(a);
            return url
                ? {
                      ...a,
                      url,
                      width: a?.video_data?.width || a?.width,
                      height: a?.video_data?.height || a?.height,
                      thumbnail:
                          a?.thumbnail_url ||
                          a?.preview_url ||
                          a?.video_data?.thumbnail_url,
                  }
                : null;
        })
        .filter((a) => {
            if (!a) return false;
            const type = deriveType(a);
            const mime = deriveMime(a);
            return type === 'video' || mime.startsWith('video/');
        });

    if (videoAtts.length > 0) {
        return {
            id: raw.id,
            inserted_at: ts,
            senderType,
            status: raw.status || 'sent',
            content: {
                type: 'videos',
                videos: videoAtts.map((a) => ({
                    url: a.url,
                    width: a.width,
                    height: a.height,
                    name: a?.name || a?.file_name || raw?.original_message,
                    length: a?.video_data?.length,
                    thumbnail: a?.thumbnail,
                    mime: a?.mime,
                })),
            },
        };
    }

    // 🔁 Một số tin nhắn (đặc biệt từ Zalo) chỉ gửi link .mp4 mà không có attachments
    const extractVideoUrlsFromMessage = () => {
        const urls = new Set();

        const collectFromText = (value) => {
            if (typeof value !== 'string') return;
            const matches = value.match(/https?:\/\/\S+/gi);
            if (!matches) return;
            matches.forEach((candidate) => {
                const clean = candidate.replace(/[>"')]+$/g, '');
                if (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(clean)) {
                    urls.add(clean);
                }
            });
        };

        collectFromText(raw.original_message);
        collectFromText(htmlToPlainText(raw.message || ''));

        if (Array.isArray(raw.message_tags)) {
            raw.message_tags.forEach((tag) => {
                collectFromText(tag?.link || tag?.url);
            });
        }

        return Array.from(urls);
    };

    const fallbackVideoUrls = extractVideoUrlsFromMessage();
    if (fallbackVideoUrls.length > 0) {
        return {
            id: raw.id,
            inserted_at: ts,
            senderType,
            status: raw.status || 'sent',
            content: {
                type: 'videos',
                videos: fallbackVideoUrls.map((url) => ({
                    url,
                    width: null,
                    height: null,
                    name: raw.original_message && !raw.original_message.startsWith('http')
                        ? raw.original_message
                        : url.split('/').pop()?.split('?')[0],
                    length: null,
                    thumbnail: null,
                    mime: undefined,
                })),
            },
        };
    }

    // ✅ QUAN TRỌNG: Lọc bỏ attachment type="REACTION" và "sticker" vì đã xử lý riêng
    // Nếu có text message, ưu tiên hiển thị text với reaction thay vì file
    const fileAtts = atts.filter((a) => {
        if (!a?.type) return false;
        const type = typeof a.type === 'string' ? a.type.toLowerCase() : '';
        const mime = typeof a.mime === 'string' ? a.mime.toLowerCase() : '';
        if (type === 'photo' || type === 'image' || type === 'video' || type === 'sticker' || type === 'reaction') {
            return false;
        }
        if (mime.startsWith('video/')) return false;
        if (a?.type === 'REACTION') return false;
        return true;
    });
    
    // Parse text message - có thể chứa reaction format: "[❤️ ] text"
    let text =
        typeof raw.original_message === 'string' && raw.original_message.trim().length > 0
            ? raw.original_message.trim()
            : htmlToPlainText(raw.message || '');
    
    // ✅ Nếu có text message, ưu tiên hiển thị text (có thể kèm reaction) thay vì file
    // Chỉ hiển thị file nếu không có text hoặc text rỗng
    const hasText = text && text.trim().length > 0;
    
    // Nếu không có text và có file attachments (không phải REACTION), hiển thị file
    if (!hasText && fileAtts.length > 0) {
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
    
    // ✅ Parse reaction từ text: format "[emoji] text" hoặc "[emoji ] text"
    // Ví dụ: "[❤️ ] À anh hiểu." → reaction: "❤️", text: "À anh hiểu."
    let reactions = [];
    let cleanText = text;
    
    if (text && typeof text === 'string') {
        // Debug log để kiểm tra dữ liệu
        if (text.includes('[') || text.includes('❤️') || text.includes(']')) {
            console.log('🔍 [Reaction Parse] Original text:', text);
            console.log('🔍 [Reaction Parse] Raw message:', {
                id: raw.id,
                original_message: raw.original_message,
                message: raw.message,
                attachments: raw.attachments
            });
        }
        
        // Tìm tất cả các reaction ở đầu message trong format [emoji] hoặc [emoji ]
        // Cải thiện regex để bắt được cả format [❤️ ] (có khoảng trắng)
        const reactionRegex = /^(\[[^\]]*?\])+\s*/;
        const match = text.match(reactionRegex);
        
        if (match) {
            // Extract tất cả reactions từ phần đầu
            const reactionPart = match[0];
            const reactionMatches = [...reactionPart.matchAll(/\[([^\]]*?)\]/g)];
            
            if (reactionMatches.length > 0) {
                // Extract reactions (loại bỏ khoảng trắng ở đầu và cuối)
                reactions = reactionMatches
                    .map(m => m[1].trim())
                    .filter(r => {
                        // Lọc bỏ các giá trị không phải emoji/reaction
                        const isReaction = r && 
                            r !== 'REACTION' && 
                            r !== 'reaction' && 
                            r.length > 0 &&
                            // Kiểm tra xem có phải emoji hoặc ký tự đặc biệt không
                            (/\p{Emoji}/u.test(r) || r.length <= 5); // Emoji hoặc text ngắn
                        return isReaction;
                    });
                
                // Loại bỏ phần reaction ở đầu khỏi text
                cleanText = text.replace(reactionRegex, '').trim();
                
                console.log('✅ [Reaction Parse] Parsed:', {
                    reactions,
                    cleanText,
                    originalText: text,
                    reactionPart,
                    reactionMatches: reactionMatches.map(m => m[1])
                });
            }
        } else {
            // Nếu không match với regex, thử cách khác: tìm pattern [xxx] ở đầu
            const simpleReactionRegex = /^\[([^\]]+?)\]\s+(.+)$/;
            const simpleMatch = text.match(simpleReactionRegex);
            if (simpleMatch) {
                const reactionText = simpleMatch[1].trim();
                cleanText = simpleMatch[2].trim();
                if (reactionText && reactionText !== 'REACTION' && reactionText !== 'reaction') {
                    reactions = [reactionText];
                    console.log('✅ [Reaction Parse] Simple match:', {
                        reactions,
                        cleanText,
                        originalText: text
                    });
                }
            }
        }
    }
    
    // Nếu không còn text sau khi loại bỏ reaction, dùng text gốc và không hiển thị reaction
    if (!cleanText && reactions.length > 0) {
        cleanText = text;
        reactions = [];
    }

    const normalizedContent = cleanText ? { 
        type: 'text', 
        content: cleanText,
        ...(reactions.length > 0 && { reactions }) // Thêm reactions nếu có
    } : { type: 'system', content: '' };
    
    // Debug log để kiểm tra kết quả cuối cùng
    if (reactions.length > 0) {
        console.log('📤 [Reaction Parse] Final normalized message:', {
            id: raw.id,
            content: normalizedContent,
            hasReactions: !!normalizedContent.reactions,
            reactionsCount: reactions.length
        });
    }
    
    // ✅ Xác định channel dựa trên message type
    let channel = 'INBOX';
    let metadata = null;
    
    if (msgType === 'COMMENT' || msgType === 'POST_COMMENT') {
        channel = 'COMMENT';
        metadata = {
            postId: raw.post_id,
            conversationId: raw.conversation_id,
            author: raw.from?.name || 'Khách hàng',
        };
    }
    
    return {
        id: raw.id,
        inserted_at: ts,
        senderType,
        status: raw.status || 'sent',
        channel, // ✅ Thêm channel để phân biệt
        content: normalizedContent,
        ...(metadata && { metadata }),
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
            if (!newer) {
                map.set(c.id, old);
            } else {
                // If incoming is newer, merge but preserve important nested fields
                // (customers, from, avatar, metadata) when incoming doesn't provide them.
                const merged = { ...old, ...c };
                if (!c.customers || (Array.isArray(c.customers) && c.customers.length === 0)) {
                    merged.customers = old.customers;
                }
                if (!c.from || Object.keys(c.from || {}).length === 0) {
                    merged.from = old.from;
                }
                if (!c.avatar && old.avatar) merged.avatar = old.avatar;
                // keep any other nested metadata if missing in incoming
                if (!c.meta && old.meta) merged.meta = old.meta;
                map.set(c.id, merged);
            }
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
    const s = String(cid);
    
    // Đặc biệt xử lý cho TikTok: sử dụng conversation ID đầy đủ
    if (s.startsWith('ttm_')) {
        return s; // Trả về conversation ID đầy đủ cho TikTok
    }
    
    // ✅ QUAN TRỌNG: Đặc biệt xử lý cho Zalo - phát hiện prefix pzl_
    // Zalo có format: "pzl_12345_67890" -> phải giữ nguyên toàn bộ
    if (s.startsWith('pzl_') || s.startsWith('igo_') || s.startsWith('zalo_') || s.startsWith('zal_')) {
        return s; // Trả về conversation ID đầy đủ cho Zalo/Instagram
    }
    
    // Xử lý bình thường cho Facebook/Instagram (format khác)
    const idx = s.indexOf('_');
    return idx >= 0 ? s.slice(idx + 1) : s;
};

const extractZaloUid = (cid) => {
    if (!cid) return null;
    const parts = String(cid).split('_');
    if (parts.length < 4) return null;
    if (parts[0] !== 'pzl') return null;
    const uidCandidate = parts[parts.length - 1];
    return uidCandidate || null;
};

const getZaloUidFromConversation = (convo) => {
    if (!convo) return null;
    return (
        extractZaloUid(convo.id) ||
        extractZaloUid(convo?.customers?.[0]?.fb_id) ||
        extractZaloUid(convo?.from?.id)
    );
};

// ======================= Subcomponents =======================
const PancakeTagDropdown = ({
    tags = [],
    selectedTagIds = [],
    onTagChange,
    trigger,
    style = 'left',
    pageId,
    accessToken,
    onLoadTags,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoadingTags, setIsLoadingTags] = useState(false);
    const [isCreatingTag, setIsCreatingTag] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#6b7280');
    const [deletingTagId, setDeletingTagId] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
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

    // Load tags khi mở dropdown
    const handleOpen = async () => {
        setIsOpen(true);
        
        // Nếu chưa có tags và có pageId, sync và load tags
        if (tags.length === 0 && pageId && accessToken) {
            setIsLoadingTags(true);
            try {
                // Sync tags từ Pancake vào MongoDB
                const syncRes = await fetch('/api/pancake/tags/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pageId, accessToken }),
                });

                if (syncRes.ok) {
                    // Lấy tags từ API (DB hoặc fallback Pancake API khi DB trống)
                    const tagsRes = await fetch(`/api/pancake/tags?pageId=${pageId}`, {
                        headers: accessToken ? { 'X-Pancake-Access-Token': accessToken } : {},
                    });
                    if (tagsRes.ok) {
                        const data = await tagsRes.json();
                        if (data.success && Array.isArray(data.data)) {
                            onLoadTags(data.data);
                        }
                    }
                }
            } catch (error) {
                console.error('[PancakeTagDropdown] Error loading tags:', error);
            } finally {
                setIsLoadingTags(false);
            }
        }
    };

    const filteredTags = useMemo(
        () =>
            tags.filter((tag) =>
                (tag?.text || '').toLowerCase().includes(searchTerm.toLowerCase())
            ),
        [tags, searchTerm]
    );

    // Tạo tag mới
    const handleCreateTag = async () => {
        if (!newTagName.trim() || !pageId || !accessToken) {
            toast.error('Vui lòng nhập tên thẻ');
            return;
        }

        setIsCreatingTag(true);
        try {
            // 1. Lấy settings hiện tại để có current_settings_key
            const settingsUrl = `https://pancake.vn/api/v1/pages/${pageId}/settings?access_token=${accessToken}`;
            const settingsResponse = await fetch(settingsUrl, { cache: 'no-store' });
            
            if (!settingsResponse.ok) {
                throw new Error(`Failed to fetch settings: ${settingsResponse.status}`);
            }

            const settingsData = await settingsResponse.json();
            const settings = settingsData?.settings || settingsData;
            const currentSettingsKey = settingsData?.current_settings_key || settings?.current_settings_key || '';
            const existingTags = Array.isArray(settings?.tags) ? settings.tags : [];

            // 2. Tính lightenColor từ color
            const hex = newTagColor.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            const lightenColor = `rgba(${r},${g},${b},0.4)`;

            // 3. Tạo tag mới với id: null (Pancake sẽ tự tạo ID)
            const newTag = {
                id: null,
                text: newTagName.trim(),
                color: newTagColor,
                is_lead_event: false,
                lighten_color: lightenColor,
            };

            // 4. Thêm tag mới vào array tags
            const updatedTags = [...existingTags, newTag];

            // 5. Gọi API POST để cập nhật settings
            const formData = new FormData();
            formData.append('changes', JSON.stringify({ tags: updatedTags }));
            if (currentSettingsKey) {
                formData.append('current_settings_key', currentSettingsKey);
            }

            const updateUrl = `https://pancake.vn/api/v1/pages/${pageId}/settings?access_token=${accessToken}`;
            const updateResponse = await fetch(updateUrl, {
                method: 'POST',
                body: formData,
            });

            if (!updateResponse.ok) {
                const errorText = await updateResponse.text().catch(() => '');
                throw new Error(`Failed to create tag: ${updateResponse.status} - ${errorText}`);
            }

            // 6. Sync lại tags từ Pancake vào MongoDB
            const syncRes = await fetch('/api/pancake/tags/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageId, accessToken }),
            });

            if (syncRes.ok) {
                // Lấy tags mới từ API (DB hoặc Pancake API)
                const tagsRes = await fetch(`/api/pancake/tags?pageId=${pageId}`, {
                    headers: accessToken ? { 'X-Pancake-Access-Token': accessToken } : {},
                });
                if (tagsRes.ok) {
                    const data = await tagsRes.json();
                    if (data.success && Array.isArray(data.data)) {
                        onLoadTags(data.data);
                    }
                }
            }

            // Reset form
            setNewTagName('');
            setNewTagColor('#6b7280');
            setIsCreatingTag(false);
            toast.success('Đã tạo thẻ mới thành công');
        } catch (error) {
            console.error('[PancakeTagDropdown] Error creating tag:', error);
            toast.error(`Lỗi khi tạo thẻ: ${error.message}`);
            setIsCreatingTag(false);
        }
    };

    // Xóa tag
    const handleDeleteTag = async (tagId) => {
        if (!tagId || !pageId || !accessToken) {
            toast.error('Thiếu thông tin để xóa thẻ');
            return;
        }

        // Xác nhận trước khi xóa
        if (!confirm(`Bạn có chắc chắn muốn xóa thẻ "${tags.find(t => t.tagId === tagId)?.text || tagId}"?`)) {
            return;
        }

        setDeletingTagId(tagId);
        try {
            // 1. Lấy settings hiện tại để có current_settings_key
            const settingsUrl = `https://pancake.vn/api/v1/pages/${pageId}/settings?access_token=${accessToken}`;
            const settingsResponse = await fetch(settingsUrl, { cache: 'no-store' });
            
            if (!settingsResponse.ok) {
                throw new Error(`Failed to fetch settings: ${settingsResponse.status}`);
            }

            const settingsData = await settingsResponse.json();
            const settings = settingsData?.settings || settingsData;
            const currentSettingsKey = settingsData?.current_settings_key || settings?.current_settings_key || '';
            const existingTags = Array.isArray(settings?.tags) ? settings.tags : [];

            // 2. Loại bỏ tag cần xóa khỏi array tags
            const updatedTags = existingTags.filter(tag => String(tag.id) !== String(tagId));

            // 3. Gọi API POST để cập nhật settings
            const formData = new FormData();
            formData.append('changes', JSON.stringify({ tags: updatedTags }));
            if (currentSettingsKey) {
                formData.append('current_settings_key', currentSettingsKey);
            }

            const updateUrl = `https://pancake.vn/api/v1/pages/${pageId}/settings?access_token=${accessToken}`;
            const updateResponse = await fetch(updateUrl, {
                method: 'POST',
                body: formData,
            });

            if (!updateResponse.ok) {
                const errorText = await updateResponse.text().catch(() => '');
                throw new Error(`Failed to delete tag: ${updateResponse.status} - ${errorText}`);
            }

            // 4. Sync lại tags từ Pancake vào MongoDB
            const syncRes = await fetch('/api/pancake/tags/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageId, accessToken }),
            });

            if (syncRes.ok) {
                // Lấy tags mới từ API (DB hoặc Pancake API)
                const tagsRes = await fetch(`/api/pancake/tags?pageId=${pageId}`, {
                    headers: accessToken ? { 'X-Pancake-Access-Token': accessToken } : {},
                });
                if (tagsRes.ok) {
                    const data = await tagsRes.json();
                    if (data.success && Array.isArray(data.data)) {
                        onLoadTags(data.data);
                    }
                }
            }

            // 5. Nếu tag đang được chọn, bỏ chọn
            if (selectedTagIds.includes(tagId)) {
                onTagChange(tagId, false);
            }

            setDeletingTagId(null);
            toast.success('Đã xóa thẻ thành công');
        } catch (error) {
            console.error('[PancakeTagDropdown] Error deleting tag:', error);
            toast.error(`Lỗi khi xóa thẻ: ${error.message}`);
            setDeletingTagId(null);
        }
    };

    // Lấy mới nhất từ Pancake và so sánh với DB
    const handleRefreshTags = async () => {
        if (!pageId || !accessToken) {
            toast.error('Thiếu thông tin để lấy mới nhất');
            return;
        }

        setIsRefreshing(true);
        try {
            // Gọi API sync với so sánh và cập nhật
            const refreshRes = await fetch('/api/pancake/tags/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageId, accessToken }),
            });

            if (!refreshRes.ok) {
                const errorData = await refreshRes.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to refresh: ${refreshRes.status}`);
            }

            const data = await refreshRes.json();
            
            if (data.success) {
                // Lấy tags mới từ API (DB hoặc Pancake API)
                const tagsRes = await fetch(`/api/pancake/tags?pageId=${pageId}`, {
                    headers: accessToken ? { 'X-Pancake-Access-Token': accessToken } : {},
                });
                if (tagsRes.ok) {
                    const tagsData = await tagsRes.json();
                    if (tagsData.success && Array.isArray(tagsData.data)) {
                        onLoadTags(tagsData.data);
                        toast.success(`Đã cập nhật: ${data.added || 0} thẻ mới, ${data.deleted || 0} thẻ đã xóa, ${data.updated || 0} thẻ đã cập nhật`);
                    }
                }
            } else {
                throw new Error(data.error || 'Refresh failed');
            }
        } catch (error) {
            console.error('[PancakeTagDropdown] Error refreshing tags:', error);
            toast.error(`Lỗi khi lấy mới nhất: ${error.message}`);
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <div onClick={handleOpen}>{trigger}</div>
            {isOpen && (
                <div
                    style={{ right: style === 'right' ? 0 : 'auto', left: style === 'left' ? 0 : 'auto' }}
                    className="absolute top-full mt-2 w-72 bg-blue-50 text-gray-900 rounded-md border border-gray-200 shadow-lg z-50 overflow-hidden"
                >
                    <div className="p-3">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-800">Lọc theo Pancake Tags</h4>
                            <button
                                type="button"
                                onClick={handleRefreshTags}
                                disabled={isRefreshing || !pageId || !accessToken}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Lấy mới nhất từ Pancake"
                            >
                                {isRefreshing ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-3 w-3" />
                                )}
                                <span>Lấy mới nhất</span>
                            </button>
                        </div>
                        <div className="relative mb-2">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Tìm tag..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white text-gray-900 rounded-md pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                        {/* Form tạo tag mới */}
                        <div className="border-t border-gray-200 pt-2 mt-2">
                            <div className="flex items-center gap-2 mb-2">
                                <input
                                    type="text"
                                    placeholder="Tên thẻ mới..."
                                    value={newTagName}
                                    onChange={(e) => setNewTagName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !isCreatingTag) {
                                            handleCreateTag();
                                        }
                                    }}
                                    className="flex-1 bg-white text-gray-900 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <input
                                    type="color"
                                    value={newTagColor}
                                    onChange={(e) => setNewTagColor(e.target.value)}
                                    className="w-10 h-8 rounded border border-gray-300 cursor-pointer"
                                    title="Chọn màu"
                                />
                                <button
                                    type="button"
                                    onClick={handleCreateTag}
                                    disabled={isCreatingTag || !newTagName.trim()}
                                    className="flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="Thêm thẻ mới"
                                >
                                    {isCreatingTag ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Plus className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto px-3">
                        {isLoadingTags ? (
                            <div className="p-3 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Đang tải tags...</span>
                            </div>
                        ) : filteredTags.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500 text-center">Không có tag nào</div>
                        ) : (
                            filteredTags.map((tag) => (
                                <div
                                    key={tag.tagId}
                                    className="flex items-center gap-3 p-2.5 hover:bg-blue-100 rounded-md group"
                                >
                                    <label className="flex items-center gap-3 flex-1 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            checked={selectedTagIds.includes(tag.tagId)}
                                            onChange={(e) => onTagChange(tag.tagId, e.target.checked)}
                                        />
                                        <span
                                            className="h-4 w-4 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: tag.color || '#6b7280' }}
                                        />
                                        <span className="flex-1">{tag.text}</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteTag(tag.tagId);
                                        }}
                                        disabled={deletingTagId === tag.tagId}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Xóa thẻ"
                                    >
                                        {deletingTagId === tag.tagId ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

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
                        {filteredLabels.map((label) => {
                            // Chỉ thẻ từ hệ thống (manual) mới có chữ màu xanh dương
                            const isManualLabel = label.from !== 'pancake';
                            return (
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
                                    <span className={`flex-1 ${isManualLabel ? 'text-blue-600' : ''}`}>{label.name}</span>
                                </label>
                            );
                        })}
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

const MessageContent = ({ content, onVideoClick, isFromPage = false }) => {
    if (!content)
        return (
            <h5 className="italic text-gray-400" style={{ textAlign: 'end' }}>
                Nội dung không hợp lệ
            </h5>
        );

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

        case 'sticker':
            return (
                <div className="flex flex-wrap gap-2 mt-1">
                    {content.stickers.map((sticker, i) => (
                        <div key={i} className="inline-block">
                            <img
                                src={sticker.url}
                                alt={`Sticker ${i + 1}`}
                                className="max-w-[200px] max-h-[200px] object-contain"
                                style={{
                                    width: sticker.width || 200,
                                    height: sticker.height || 200,
                                    maxWidth: '200px',
                                    maxHeight: '200px'
                                }}
                                loading="lazy"
                            />
                        </div>
                    ))}
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
    preselect,
    preselectConversationId,
    hideSidebar = false,
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
    const [postInfo, setPostInfo] = useState(null); // Thông tin post cho COMMENT conversations
    const selectedConvoTypeRef = useRef(null); // Lưu type của conversation đang chọn để filter messages
    const lastCommentMsgIdRef = useRef(null); // Lưu msg_id của comment khách gần nhất (để reply)
    const lastPostIdRef = useRef(null); // Lưu post_id hiện tại cho COMMENT

    // Load older messages (scroll top)
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const messagesScrollRef = useRef(null);
    const [isNearBottom, setIsNearBottom] = useState(true);
    const isNearBottomRef = useRef(true);
    const lastScrollTopRef = useRef(0);
    const isInitialLoadRef = useRef(true);
    const shouldScrollToBottomRef = useRef(false);

    // 3) Search
    const [searchInput, setSearchInput] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);

    // 4) Lọc theo nhãn
    const [selectedFilterLabelIds, setSelectedFilterLabelIds] = useState([]);
    const [labelFilterConversations, setLabelFilterConversations] = useState([]);
    const [isLoadingLabelFilter, setIsLoadingLabelFilter] = useState(false);

    // 5) Pancake Tags
    const [pancakeTags, setPancakeTags] = useState([]);
    const [selectedTagIds, setSelectedTagIds] = useState([]);
    // Conversations từ API khi filter tag (để lấy conversations cũ)
    const [tagFilterConversations, setTagFilterConversations] = useState([]);
    const [isLoadingTagFilter, setIsLoadingTagFilter] = useState(false);

    // 6) Lead Status Modal
    const [showLeadStatusModal, setShowLeadStatusModal] = useState(false);
    const [pendingLabelId, setPendingLabelId] = useState(null);
    const [pendingChecked, setPendingChecked] = useState(false);
    const [leadStatusNote, setLeadStatusNote] = useState('');
    const [conversationLeadStatuses, setConversationLeadStatuses] = useState({}); // Map conversationId -> { status, note }
    const [showNoteTooltip, setShowNoteTooltip] = useState(null); // conversationId đang hiển thị tooltip

    // 7) Phân công nhân viên
    const [showAssigneesPopup, setShowAssigneesPopup] = useState(false);
    const [assigneesData, setAssigneesData] = useState([]); // Danh sách nhân viên được phân công (cho hội thoại đang chọn)
    const [conversationAssigneesMap, setConversationAssigneesMap] = useState({}); // Map: conversationId -> danh sách nhân viên đã phân công
    const conversationAssigneesMapRef = useRef(conversationAssigneesMap);
    const [allUsers, setAllUsers] = useState([]); // Danh sách tất cả nhân viên của page
    const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
    const assigneesPopupRef = useRef(null);

    // Function để load danh sách nhân viên của page
    const loadPageUsers = useCallback(async () => {
        try {
            const url = `https://pancake.vn/api/v1/pages/users_pages?access_token=${pageConfig.accessToken}`;
            const formData = new FormData();
            formData.append('page_ids', pageConfig.id);

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                console.log('[Assignees] API users_pages response:', data);
                console.log('[Assignees] Response type:', typeof data, 'Is array:', Array.isArray(data));
                console.log('[Assignees] Response keys:', Object.keys(data));
                
                // Data trả về có structure: {success: true, users_pages: Array(13)}
                // Cần lấy data.users_pages
                let users = [];
                
                if (data?.users_pages && Array.isArray(data.users_pages)) {
                    // Lấy từ users_pages array
                    users = data.users_pages;
                    console.log('[Assignees] Found users_pages array, length:', users.length);
                } else if (Array.isArray(data)) {
                    // Nếu là array trực tiếp, dùng luôn
                    users = data;
                    console.log('[Assignees] Response is array directly, length:', users.length);
                } else if (typeof data === 'object' && data !== null) {
                    // Nếu là object với key là số thứ tự (0, 1, 2, ...)
                    console.log('[Assignees] Response is object, keys:', Object.keys(data));
                    for (let i = 0; i < 100; i++) { // Giả sử tối đa 100 users
                        if (data[i]) {
                            users.push(data[i]);
                        } else {
                            // Kiểm tra xem còn key nào khác không (có thể có key không phải số)
                            const remainingKeys = Object.keys(data).filter(k => !isNaN(parseInt(k)) && parseInt(k) >= i);
                            if (remainingKeys.length === 0) {
                                break; // Dừng khi không còn phần tử nào
                            }
                        }
                    }
                    console.log('[Assignees] Parsed users from object:', users.length);
                }
                
                console.log('[Assignees] Raw users before filtering:', users.length);
                console.log('[Assignees] Sample user object:', users[0]);
                
                // Filter để chỉ lấy users hợp lệ
                // User object có structure: {fb_id, name, page_id, phone_number, status, user_id, ...}
                const validUsers = users.filter(user => {
                    if (!user) {
                        console.log('[Assignees] Skipping null/undefined user');
                        return false;
                    }
                    
                    // Kiểm tra xem có user_id không (có thể là user_id hoặc id)
                    const userId = user.user_id || user.id;
                    const hasUserId = !!userId;
                    const hasName = !!user.name;
                    const isValid = hasUserId && hasName;
                    
                    if (!isValid) {
                        console.log('[Assignees] Invalid user:', {
                            name: user.name,
                            user_id: user.user_id,
                            id: user.id,
                            hasUserId,
                            hasName
                        });
                    }
                    return isValid;
                });
                
                console.log('[Assignees] Valid users count:', validUsers.length);
                console.log('[Assignees] Valid users:', validUsers);
                
                // Log chi tiết từng user để debug
                validUsers.forEach((user, idx) => {
                    console.log(`[Assignees] User ${idx}:`, {
                        name: user.name,
                        user_id: user.user_id,
                        id: user.id,
                        fb_id: user.fb_id,
                        status: user.status
                    });
                });
                
                setAllUsers(validUsers);
                return validUsers;
            } else {
                const errorText = await response.text().catch(() => '');
                console.error('Failed to load page users:', response.status, errorText);
                return [];
            }
        } catch (error) {
            console.error('Error loading page users:', error);
            return [];
        }
    }, [pageConfig.id, pageConfig.accessToken]);

    // Function để load lịch sử phân công của conversation
    const loadAssigneesHistory = useCallback(async (conversationId) => {
        if (!conversationId) {
            console.warn('[Assignees] No conversationId provided');
            return [];
        }

        try {
            setIsLoadingAssignees(true);
            console.log('[Assignees] Starting to load assignees for conversation:', conversationId);
            
            // Bước 1: Gọi API đầu tiên để lấy danh sách users
            console.log('[Assignees] Step 1: Loading page users...');
            console.log('[Assignees] Current allUsers cache:', allUsers.length, 'users');
            
            // Luôn gọi lại API đầu tiên để đảm bảo có data mới nhất
            // (có thể cache cũ hoặc chưa được load)
            console.log('[Assignees] Calling loadPageUsers() to get fresh data...');
            let users = await loadPageUsers();
            console.log('[Assignees] loadPageUsers() returned:', users.length, 'users');
            
            if (users.length === 0) {
                console.warn('[Assignees] ⚠️ WARNING: No users returned from API!');
                console.warn('[Assignees] This might be the reason why no assignees are shown.');
                console.warn('[Assignees] Please check if API users_pages is returning data correctly.');
            } else {
                console.log('[Assignees] ✅ Successfully loaded', users.length, 'users from API');
            }
            
            // Vẫn tiếp tục gọi API thứ hai ngay cả khi users.length === 0
            // Vì có thể conversation chưa được phân công cho ai

            // Bước 2: Gọi API thứ hai để lấy lịch sử phân công
            console.log('[Assignees] Step 2: Loading assignees history...');
            const url = `https://pancake.vn/api/v1/pages/${pageConfig.id}/conversations/${conversationId}/assignees_update_histories?access_token=${pageConfig.accessToken}`;
            console.log('[Assignees] Calling API:', url);
            const response = await fetch(url);
            console.log('[Assignees] API response status:', response.status, response.statusText);

            if (response.ok) {
                const data = await response.json();
                console.log('[Assignees] API assignees_update_histories response:', data);
                
                const histories = Array.isArray(data?.data) ? data.data : [];
                console.log('[Assignees] Histories count:', histories.length);
                console.log('[Assignees] Histories:', histories);
                
                // Lấy danh sách user_id từ lịch sử phân công (từ ins array)
                const assigneeUserIds = new Set();
                histories.forEach((history, idx) => {
                    console.log(`[Assignees] History ${idx}:`, history);
                    if (history.diff?.ins && Array.isArray(history.diff.ins)) {
                        console.log(`[Assignees] History ${idx} ins array:`, history.diff.ins);
                        history.diff.ins.forEach(userId => {
                            // Normalize userId (có thể là string hoặc number)
                            const normalizedUserId = String(userId).trim();
                            if (normalizedUserId) {
                                assigneeUserIds.add(normalizedUserId);
                            }
                        });
                    }
                });
                
                console.log('[Assignees] Assignee user IDs from history:', Array.from(assigneeUserIds));
                console.log('[Assignees] All users available:', users.length);
                console.log('[Assignees] All users:', users);

                // Bước 3: So sánh user_id từ API đầu tiên với các giá trị trong ins
                // Nếu user_id của user trong API đầu tiên = giá trị trong ins thì lấy name
                if (users.length === 0) {
                    console.warn('[Assignees] ⚠️ No users available to match with assignee IDs');
                    console.warn('[Assignees] This means API users_pages did not return any users or returned empty');
                    setAssigneesData([]);
                    return [];
                }

                console.log('[Assignees] 🔍 Starting to match users...');
                console.log('[Assignees] Looking for user_ids:', Array.from(assigneeUserIds));
                console.log('[Assignees] Available users with their user_ids:');
                users.forEach((user, idx) => {
                    console.log(`  [${idx}] Name: ${user.name}, user_id: ${user.user_id}, type: ${typeof user.user_id}`);
                });

                const assignedUsers = users.filter(user => {
                    if (!user) {
                        console.log('[Assignees] Skipping null/undefined user');
                        return false;
                    }
                    
                    if (!user.user_id) {
                        console.log('[Assignees] Skipping user (no user_id):', user);
                        return false;
                    }
                    
                    // Normalize user_id để so sánh (loại bỏ khoảng trắng, chuyển sang string)
                    const userUserId = String(user.user_id).trim();
                    const isAssigned = assigneeUserIds.has(userUserId);
                    
                    // Log chi tiết cho từng user
                    if (isAssigned) {
                        console.log('[Assignees] ✅ MATCH FOUND!');
                        console.log('[Assignees]   User name:', user.name);
                        console.log('[Assignees]   User user_id:', user.user_id, '(type:', typeof user.user_id, ')');
                        console.log('[Assignees]   Normalized:', userUserId);
                        console.log('[Assignees]   Matched with assignee ID:', userUserId);
                    } else {
                        // Chỉ log nếu có assignee IDs để tránh spam
                        if (assigneeUserIds.size > 0) {
                            console.log('[Assignees] ❌ No match for user:', user.name);
                            console.log('[Assignees]   User user_id:', user.user_id, '(type:', typeof user.user_id, ')');
                            console.log('[Assignees]   Normalized:', userUserId);
                            console.log('[Assignees]   Looking for:', Array.from(assigneeUserIds));
                            // Kiểm tra xem có khớp không sau khi normalize cả 2 bên
                            const foundMatch = Array.from(assigneeUserIds).some(assigneeId => {
                                const normalizedAssigneeId = String(assigneeId).trim();
                                const match = normalizedAssigneeId === userUserId;
                                if (match) {
                                    console.log('[Assignees]   ⚠️ Found match after double normalization!');
                                }
                                return match;
                            });
                            if (!foundMatch) {
                                console.log('[Assignees]   No match found even after double normalization');
                            }
                        }
                    }
                    return isAssigned;
                });

                console.log('[Assignees] Final assigned users count:', assignedUsers.length);
                console.log('[Assignees] Final assigned users:', assignedUsers);
                setAssigneesData(assignedUsers);

                // Lưu lại mapping để sidebar biết hội thoại nào đã được phân công nhân viên
                setConversationAssigneesMap((prev) => {
                    const next = {
                        ...prev,
                        [conversationId]: assignedUsers,
                    };
                    conversationAssigneesMapRef.current = next;
                    return next;
                });

                return assignedUsers;
            } else {
                const errorText = await response.text().catch(() => '');
                console.error('[Assignees] ❌ Failed to load assignees history:', response.status, response.statusText);
                console.error('[Assignees] Error response:', errorText);
                setAssigneesData([]);
                return [];
            }
        } catch (error) {
            console.error('Error loading assignees history:', error);
            setAssigneesData([]);
            // Nếu lỗi, đánh dấu hội thoại này là chưa có thông tin phân công (tránh icon sai)
            setConversationAssigneesMap((prev) => {
                const next = {
                    ...prev,
                    [conversationId]: [],
                };
                conversationAssigneesMapRef.current = next;
                return next;
            });
            return [];
        } finally {
            setIsLoadingAssignees(false);
        }
    }, [pageConfig.id, pageConfig.accessToken, allUsers, loadPageUsers]);

    // Handle click icon phân công nhân viên
    const handleShowAssignees = useCallback(async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        if (!selectedConvo?.id) {
            console.warn('[Assignees] No selected conversation');
            return;
        }

        console.log('[Assignees] handleShowAssignees called, current popup state:', showAssigneesPopup);
        console.log('[Assignees] Selected conversation ID:', selectedConvo.id);

        if (!showAssigneesPopup) {
            // Mở popup và load data
            console.log('[Assignees] Opening popup and loading data...');
            setShowAssigneesPopup(true);
            try {
                await loadAssigneesHistory(selectedConvo.id);
            } catch (error) {
                console.error('[Assignees] Error in loadAssigneesHistory:', error);
            }
        } else {
            // Đóng popup
            console.log('[Assignees] Closing popup');
            setShowAssigneesPopup(false);
        }
    }, [selectedConvo?.id, showAssigneesPopup, loadAssigneesHistory]);

    // Close popup when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (assigneesPopupRef.current && !assigneesPopupRef.current.contains(event.target)) {
                // Kiểm tra xem click có phải vào icon không
                const iconButton = event.target.closest('[data-assignees-icon]');
                if (!iconButton) {
                    setShowAssigneesPopup(false);
                }
            }
        };

        if (showAssigneesPopup) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showAssigneesPopup]);

    // Đóng popup và reset data khi conversation thay đổi
    useEffect(() => {
        setShowAssigneesPopup(false);
        setAssigneesData([]);
    }, [selectedConvo?.id]);

    // 5) Refs UI
    const formRef = useRef(null);
    const messagesEndRef = useRef(null);
    const sidebarRef = useRef(null);
    const fileInputRef = useRef(null);
    const videoInputRef = useRef(null);

    // Ảnh pending
    const [pendingImages, setPendingImages] = useState([]);
    const [pendingVideos, setPendingVideos] = useState([]);
    const pendingVideosRef = useRef(pendingVideos);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const hasPendingUploads = useMemo(
        () =>
            pendingImages.some((p) => !p?.contentId) ||
            pendingVideos.some((v) => !v?.contentId),
        [pendingImages, pendingVideos]
    );
    const [videoPreview, setVideoPreview] = useState(null);

    useEffect(() => {
        pendingVideosRef.current = pendingVideos;
    }, [pendingVideos]);

    useEffect(() => {
        return () => {
            pendingVideosRef.current.forEach((v) => {
                if (v?.url && v.url.startsWith('blob:')) {
                    URL.revokeObjectURL(v.url);
                }
            });
        };
    }, []);

    useEffect(() => {
        setVideoPreview(null);
    }, [selectedConvo?.id]);

    // ===================== Load Lead Statuses =====================
    // Chỉ gọi API khi tập conversation IDs thực sự thay đổi (tránh gọi liên tục khi socket conv:patch/msg:new đổi reference mảng)
    const leadStatusIdsKey = useMemo(() => {
        const fromSocket = conversations.map((c) => c.id).filter(Boolean);
        const fromLabel = (labelFilterConversations || []).map((c) => c.id).filter(Boolean);
        const fromTag = (tagFilterConversations || []).map((c) => c.id).filter(Boolean);
        const allIds = [...new Set([...fromSocket, ...fromLabel, ...fromTag])].sort();
        return allIds.length === 0 ? '' : allIds.join(',');
    }, [conversations, labelFilterConversations, tagFilterConversations]);

    useEffect(() => {
        if (!pageConfig?.id || !leadStatusIdsKey) return;

        const loadLeadStatuses = async () => {
            try {
                const res = await fetch(
                    `/api/conversation-lead-status?conversationIds=${leadStatusIdsKey}&pageId=${pageConfig.id}`
                );
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.data && typeof data.data === 'object') {
                        setConversationLeadStatuses((prev) => ({ ...prev, ...data.data }));
                    }
                }
            } catch (error) {
                console.error('[ChatClient] Error loading lead statuses:', error);
            }
        };

        loadLeadStatuses();
    }, [pageConfig?.id, leadStatusIdsKey]);

    // ===================== Load Pancake tags ngay khi mở page =====================
    useEffect(() => {
        // Tự động sync + load tags để:
        // - Có metadata (text, color) cho việc hiển thị tags dưới mỗi hội thoại
        // - Cho phép lọc theo tag ngay cả khi user chưa bấm dropdown
        const loadTags = async () => {
            if (!pageConfig?.id || !(pageConfig?.accessToken || token)) return;
            try {
                // 1) Sync tags từ Pancake vào MongoDB
                await fetch('/api/pancake/tags/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pageId: pageConfig.id,
                        accessToken: pageConfig.accessToken || token,
                    }),
                }).catch((err) => {
                    console.warn('[ChatClient] Sync Pancake tags failed (non-blocking):', err);
                });

                // 2) Lấy danh sách tags: ưu tiên DB, nếu DB trống thì API lấy trực tiếp từ Pancake (gửi token qua header)
                const tokenToSend = pageConfig.accessToken || token;
                const res = await fetch(`/api/pancake/tags?pageId=${pageConfig.id}`, {
                    headers: tokenToSend ? { 'X-Pancake-Access-Token': tokenToSend } : {},
                });
                if (!res.ok) {
                    console.warn('[ChatClient] Fetch Pancake tags failed:', res.status, res.statusText);
                    return;
                }
                const data = await res.json();
                if (data?.success && Array.isArray(data.data)) {
                    setPancakeTags(data.data);
                }
            } catch (error) {
                console.warn('[ChatClient] Error loading Pancake tags (non-blocking):', error);
            }
        };

        loadTags();
    }, [pageConfig?.id, pageConfig?.accessToken, token]);

    // ===================== Load conversations từ API khi filter tag =====================
    // ✅ THEO TÀI LIỆU ChitietLocthe.md: Gọi API CRM thay vì gọi Pancake trực tiếp
    // API sẽ tự động quyết định có gọi Pancake hay không dựa vào cache (3 phút)
    const loadConversationsByTag = useCallback(async (tagIds, forceRefresh = false) => {
        if (!pageConfig?.id || tagIds.length === 0) {
            setTagFilterConversations([]);
            return;
        }

        setIsLoadingTagFilter(true);

        try {
            // ✅ Gọi API CRM: /api/pancake/conversations/by-label
            // API sẽ tự động:
            // - Kiểm tra cache (lastSyncedAt < 3 phút)
            // - Nếu cần → gọi Pancake và sync DB
            // - Nếu không → query DB
            // - Trả về toàn bộ conversations có label đó (bao gồm cả chưa từng load)
            
            // Với nhiều tags, gọi API cho từng tag và merge kết quả
            const allConversations = [];
            const conversationMap = new Map();

            for (const tagId of tagIds) {
                try {
                    const apiUrl = `/api/pancake/conversations/by-label?pageId=${pageConfig.id}&labelId=${tagId}&limit=100&forceRefresh=${forceRefresh}&accessToken=${encodeURIComponent(pageConfig.accessToken || token || '')}`;
                    console.log(`[ChatClient] 🔍 Fetching conversations for tag ${tagId} from CRM API:`, apiUrl.replace(/accessToken=[^&]+/, 'accessToken=***'));
                    
                    const response = await fetch(apiUrl, { cache: 'no-store' });
                    
                    if (!response.ok) {
                        const errorText = await response.text().catch(() => '');
                        console.error(`[ChatClient] ❌ Failed to fetch conversations for tag ${tagId}:`, response.status, errorText);
                        continue;
                    }

                    const data = await response.json();
                    const conversations = Array.isArray(data?.data) ? data.data : [];
                    const nextCursor = data?.nextCursor || null;
                    
                    console.log(`[ChatClient] ✅ Loaded ${conversations.length} conversations for tag ${tagId} (from: ${data.from || 'unknown'})${nextCursor ? `, has nextCursor (need pagination)` : ', no more pages'}`);
                    if (conversations.length > 0) {
                        console.log(`[ChatClient] Sample conversation:`, {
                            id: conversations[0].id,
                            tags: conversations[0].tags,
                            name: conversations[0].name || conversations[0].customers?.[0]?.name,
                        });
                    }
                    
                    // ⚠️ WARNING: Nếu có nextCursor, cần pagination để lấy hết conversations
                    if (nextCursor) {
                        console.warn(`[ChatClient] ⚠️ API returned nextCursor for tag ${tagId}, but frontend only loads first page. Total conversations may be incomplete.`);
                    }

                    // Merge conversations (tránh duplicate)
                    let addedCount = 0;
                    let skippedCount = 0;
                    conversations.forEach((conv) => {
                        const convId = conv.id || conv.conversationId;
                        if (!convId) {
                            console.warn(`[ChatClient] ⚠️ Conversation missing id:`, conv);
                            skippedCount++;
                            return;
                        }
                        if (!conversationMap.has(convId)) {
                            conversationMap.set(convId, conv);
                            addedCount++;
                        } else {
                            skippedCount++;
                        }
                    });
                    console.log(`[ChatClient] Merge result for tag ${tagId}: added ${addedCount}, skipped ${skippedCount} (duplicates)`);
                } catch (error) {
                    console.error(`[ChatClient] ❌ Error fetching conversations for tag ${tagId}:`, error);
                }
            }

            // Convert map to array
            const mergedConversations = Array.from(conversationMap.values());
            console.log(`[ChatClient] 📊 After merge: ${mergedConversations.length} unique conversations from ${tagIds.length} tag(s)`);

            // ✅ Enrich với tags metadata và FILTER lại để đảm bảo chỉ có conversations có tag được chọn
            let filteredCount = 0;
            let totalCount = mergedConversations.length;
            
            const enriched = mergedConversations
                .map((conv) => {
                    const rawTags = Array.isArray(conv.tags) ? conv.tags : [];
                    
                    // ✅ QUAN TRỌNG: Filter lại ở client-side để đảm bảo chỉ có conversations có tag được chọn
                    // Vì database có thể có conversations không có tag này (do sync lỗi hoặc cache cũ)
                    const convoTagIds = rawTags.map(tagId => String(tagId));
                    const hasSelectedTag = tagIds.some((tagId) => convoTagIds.includes(String(tagId)));
                    
                    if (!hasSelectedTag) {
                        // Conversation không có tag được chọn, bỏ qua
                        filteredCount++;
                        console.warn(`[ChatClient] ⚠️ Conversation ${conv.id} does not have selected tags ${tagIds.join(',')}. Tags: [${convoTagIds.join(',')}]`);
                        return null;
                    }
                    
                    // Nếu chưa có pancakeTags, enrich từ pancakeTags state
                    if (!conv.pancakeTags || conv.pancakeTags.length === 0) {
                        const pancakeTagsEnriched = rawTags
                            .map((tagId) => {
                                const idStr = String(tagId);
                                const tag = pancakeTags.find((t) => String(t.tagId) === idStr);
                                return tag ? {
                                    tagId: String(tag.tagId),
                                    text: tag.text || tag.name,
                                    color: tag.color,
                                    isLeadEvent: tag.isLeadEvent || false,
                                } : null;
                            })
                            .filter(Boolean);
                        
                        return {
                            ...conv,
                            pancakeTags: pancakeTagsEnriched,
                        };
                    }
                    
                    return conv;
                })
                .filter(Boolean); // Loại bỏ null (conversations không có tag được chọn)

            // Sort theo updated_at
            enriched.sort((a, b) => {
                const timeA = new Date(a.updated_at || 0).getTime();
                const timeB = new Date(b.updated_at || 0).getTime();
                return timeB - timeA;
            });

            if (filteredCount > 0) {
                console.warn(`[ChatClient] ⚠️ Filtered out ${filteredCount} conversations that don't have selected tags (out of ${totalCount} total)`);
            }
            console.log(`[ChatClient] ✅ Total ${enriched.length} conversations loaded for tags: ${tagIds.join(',')} (after filtering)`);
            
            // ✅ Cập nhật UI
            setTagFilterConversations(enriched);
        } catch (error) {
            console.error('[ChatClient] Error loading conversations by tag:', error);
            setTagFilterConversations([]);
        } finally {
            setIsLoadingTagFilter(false);
        }
    }, [pageConfig?.id, pageConfig?.accessToken, token, pancakeTags]);

    // Load conversations từ API khi filter tag thay đổi
    useEffect(() => {
        if (selectedTagIds.length > 0) {
            loadConversationsByTag(selectedTagIds);
        } else {
            setTagFilterConversations([]);
        }
    }, [selectedTagIds, loadConversationsByTag]);

    // Gán/Bỏ gán nhãn cho hội thoại đang chọn
    const handleToggleLabel = useCallback(
        async (labelId, checked) => {
            try {
                const selectedConvo = selectedConvoRef.current;
                if (!selectedConvo || !selectedConvo.id) {
                    toast.error('Không thể gán nhãn: thiếu thông tin hội thoại.');
                    return;
                }

                // Lấy conversation_id từ hội thoại đang chọn
                const conversationId = selectedConvo.id;
                const pageId = pageConfig.id;
                
                // ✅ Kiểm tra xem label có phải là Pancake tag không
                // Tìm label trong allLabels hoặc pancakeTags
                // labelId có thể là _id (MongoDB) hoặc tagId (Pancake)
                const label = allLabels.find(l => l._id === labelId || (l.from === 'pancake' && String(l.tagId) === String(labelId))) 
                    || pancakeTags.find(t => t._id === labelId || String(t.tagId) === String(labelId));
                
                if (label && label.from === 'pancake') {
                    // ✅ Đây là Pancake tag, gọi Pancake API toggle_tag
                    const tagId = label.tagId || labelId;
                    const psid = selectedConvo.customers?.[0]?.fb_id 
                        || selectedConvo.from_psid 
                        || selectedConvo.from?.id 
                        || conversationId.split('_')[1] // Fallback: lấy phần sau dấu _ trong conversationId
                        || null;
                    
                    if (!psid) {
                        toast.error('Không thể gán thẻ Pancake: thiếu PSID của khách hàng.');
                        console.error('[handleToggleLabel] Missing PSID for Pancake tag:', {
                            conversationId,
                            selectedConvo: {
                                customers: selectedConvo.customers,
                                from_psid: selectedConvo.from_psid,
                                from: selectedConvo.from
                            }
                        });
                        return;
                    }
                    
                    // Tạo FormData cho Pancake API
                    const formData = new FormData();
                    formData.append('tag_id', String(tagId));
                    formData.append('value', checked ? '1' : '0'); // 1 = thêm, 0 = xóa
                    formData.append('psid', String(psid));
                    formData.append('tag[color]', label.color || '#000000');
                    formData.append('tag[id]', String(tagId));
                    formData.append('tag[is_lead_event]', label.isLeadEvent ? 'true' : 'false');
                    
                    // Tính lightenColor từ color nếu chưa có
                    let lightenColor = label.lightenColor;
                    if (!lightenColor && label.color) {
                        try {
                            const hex = label.color.replace('#', '');
                            const r = parseInt(hex.substring(0, 2), 16);
                            const g = parseInt(hex.substring(2, 4), 16);
                            const b = parseInt(hex.substring(4, 6), 16);
                            lightenColor = `rgba(${r},${g},${b},0.4)`;
                        } catch (e) {
                            lightenColor = 'rgba(0,0,0,0.4)';
                        }
                    }
                    formData.append('tag[lighten_color]', lightenColor || 'rgba(0,0,0,0.4)');
                    formData.append('tag[text]', label.name || label.text || '');
                    
                    const toggleTagUrl = `https://pancake.vn/api/v1/pages/${pageId}/conversations/${conversationId}/toggle_tag?access_token=${token}`;
                    
                    console.log('📤 [handleToggleLabel] Calling Pancake toggle_tag API:', {
                        url: toggleTagUrl.replace(/access_token=[^&]+/, 'access_token=***'),
                        tagId,
                        psid,
                        value: checked ? '1' : '0',
                        conversationId
                    });
                    
                    try {
                        const response = await fetch(toggleTagUrl, {
                            method: 'POST',
                            body: formData,
                        });
                        
                        if (!response.ok) {
                            const errorText = await response.text().catch(() => '');
                            console.error('❌ [handleToggleLabel] Pancake API error:', response.status, errorText);
                            toast.error(`Không thể ${checked ? 'gán' : 'bỏ'} thẻ Pancake: ${response.status}`);
                            return;
                        }
                        
                        const result = await response.json().catch(() => ({}));
                        console.log('✅ [handleToggleLabel] Pancake API success:', result);
                        
                        // ✅ Cập nhật tags trong selectedConvo để UI phản ánh thay đổi ngay
                        setSelectedConvo((prev) => {
                            if (!prev) return prev;
                            const currentTags = Array.isArray(prev.tags) ? prev.tags : [];
                            const tagIdNum = Number(tagId);
                            
                            if (checked) {
                                // Thêm tag nếu chưa có
                                if (!currentTags.includes(tagIdNum)) {
                                    return {
                                        ...prev,
                                        tags: [...currentTags, tagIdNum],
                                        pancakeTags: prev.pancakeTags || []
                                    };
                                }
                            } else {
                                // Xóa tag
                                return {
                                    ...prev,
                                    tags: currentTags.filter(t => t !== tagIdNum),
                                    pancakeTags: prev.pancakeTags || []
                                };
                            }
                            return prev;
                        });
                        
                        // ✅ Cập nhật conversations list để phản ánh thay đổi
                        setConversations((prev) => 
                            prev.map((conv) => {
                                if (conv.id !== conversationId) return conv;
                                const currentTags = Array.isArray(conv.tags) ? conv.tags : [];
                                const tagIdNum = Number(tagId);
                                
                                if (checked) {
                                    if (!currentTags.includes(tagIdNum)) {
                                        return {
                                            ...conv,
                                            tags: [...currentTags, tagIdNum]
                                        };
                                    }
                                } else {
                                    return {
                                        ...conv,
                                        tags: currentTags.filter(t => t !== tagIdNum)
                                    };
                                }
                                return conv;
                            })
                        );
                        
                        toast.success(checked ? 'Đã gán thẻ Pancake' : 'Đã bỏ thẻ Pancake');
                        return; // ✅ Thoát sớm, không xử lý logic manual label
                    } catch (error) {
                        console.error('❌ [handleToggleLabel] Pancake API exception:', error);
                        toast.error(`Lỗi khi ${checked ? 'gán' : 'bỏ'} thẻ Pancake`);
                        return;
                    }
                }
                
                // ✅ Nếu không phải Pancake tag, xử lý như manual label (logic cũ)
                
                // ✅ Kiểm tra nếu là label "NOT LEAD" và đang gán (checked = true)
                const isNotLeadLabel = label && (label.name === 'NOT LEAD' || label.name === 'NOT_LEAD');
                if (isNotLeadLabel && checked) {
                    // Hiển thị modal nhập lý do
                    setPendingLabelId(labelId);
                    setPendingChecked(checked);
                    setLeadStatusNote('');
                    setShowLeadStatusModal(true);
                    return; // Tạm dừng, chờ user nhập lý do
                }
                
                // Gọi API messages để lấy conversation_id và customer_id từ response
                let conversationIdFromAPI = conversationId;
                let customerIdFromAPI = '';
                
                try {
                    // Thử lấy customerId từ selectedConvo để gọi API
                    let customerIdForRequest = selectedConvo.customers?.[0]?.id 
                        || selectedConvo.customers?.[0]?.fb_id 
                        || selectedConvo.from?.id 
                        || null;
                    
                    // Gọi API messages để lấy conversation_id và customer_id từ response
                    let messagesUrl = `https://pancake.vn/api/v1/pages/${pageId}/conversations/${conversationId}/messages?customer_id=${customerIdForRequest || ''}&access_token=${token}&user_view=true&is_new_api=true&separate_pos=true`;
                    let messagesResponse = await fetch(messagesUrl);
                    
                    // Nếu lỗi 400 (thiếu customer_id), thử gọi lại không có customer_id
                    if (!messagesResponse.ok && messagesResponse.status === 400) {
                        messagesUrl = `https://pancake.vn/api/v1/pages/${pageId}/conversations/${conversationId}/messages?access_token=${token}&user_view=true&is_new_api=true&separate_pos=true`;
                        messagesResponse = await fetch(messagesUrl);
                    }
                    
                    if (messagesResponse.ok) {
                        const messagesData = await messagesResponse.json();
                        
                        // Lấy conversation_id từ messages[0].conversation_id
                        if (messagesData?.messages && Array.isArray(messagesData.messages) && messagesData.messages.length > 0) {
                            const firstMessage = messagesData.messages[0];
                            if (firstMessage?.conversation_id) {
                                conversationIdFromAPI = firstMessage.conversation_id;
                            } else if (firstMessage?.conversation?.id) {
                                conversationIdFromAPI = firstMessage.conversation.id;
                            }
                        } else if (messagesData?.conversation_id) {
                            conversationIdFromAPI = messagesData.conversation_id;
                        }
                        
                        // Lấy customer_id từ customers[0].id (ưu tiên id, sau đó mới đến fb_id)
                        if (messagesData?.customers && Array.isArray(messagesData.customers) && messagesData.customers.length > 0) {
                            const firstCustomer = messagesData.customers[0];
                            // Ưu tiên lấy id (UUID), sau đó mới đến fb_id
                            customerIdFromAPI = firstCustomer.id || firstCustomer.fb_id || '';
                            console.log('📋 [handleToggleLabel] Customer data from API:', {
                                id: firstCustomer.id,
                                fb_id: firstCustomer.fb_id,
                                customer_id: firstCustomer.customer_id,
                                selected: customerIdFromAPI,
                                fullCustomer: firstCustomer
                            });
                        } else {
                            console.warn('⚠️ [handleToggleLabel] Không tìm thấy customers array trong response');
                        }
                    } else {
                        console.warn('⚠️ [handleToggleLabel] API response không OK:', messagesResponse.status, messagesResponse.statusText);
                    }
                } catch (apiError) {
                    console.warn('[handleToggleLabel] Không thể lấy dữ liệu từ API, sử dụng dữ liệu từ hội thoại:', apiError);
                    // Vẫn tiếp tục với dữ liệu từ selectedConvo
                    customerIdFromAPI = selectedConvo.customers?.[0]?.id || selectedConvo.customers?.[0]?.fb_id || '';
                }

                console.log('📤 [handleToggleLabel] Calling toggleLabelForCustomer:', {
                    labelId,
                    pageId,
                    conversationId: conversationIdFromAPI,
                    customerId: customerIdFromAPI
                });

                // Gọi hàm toggleLabelForCustomer với pageId, conversationId và customerId
                const res = await toggleLabelForCustomer({ 
                    labelId, 
                    pageId,
                    conversationId: conversationIdFromAPI,
                    customerId: customerIdFromAPI
                });
                
                console.log('📥 [handleToggleLabel] Response:', res);
                
                if (!res?.success) {
                    toast.error(res?.error || 'Không thể cập nhật nhãn');
                    console.error('❌ [handleToggleLabel] Error:', res?.error);
                    return;
                }

                // ✅ Nếu đang bỏ gán nhãn hệ thống (LEAD hoặc NOT LEAD), xóa lead status và cập nhật state để UI bỏ nhãn ngay
                const isLeadLabel = label && (label.name === 'LEAD');
                if ((isNotLeadLabel || isLeadLabel) && !checked) {
                    try {
                        const deleteRes = await fetch(`/api/conversation-lead-status?conversationId=${conversationIdFromAPI}&pageId=${pageId}`, {
                            method: 'DELETE',
                        });
                        if (deleteRes.ok) {
                            setConversationLeadStatuses((prev) => {
                                const newStatuses = { ...prev };
                                delete newStatuses[conversationIdFromAPI];
                                delete newStatuses[extractConvoKey(conversationIdFromAPI)];
                                return newStatuses;
                            });
                            console.log('✅ [handleToggleLabel] Deleted lead status for conversation:', conversationIdFromAPI);
                        }
                    } catch (error) {
                        console.error('[handleToggleLabel] Error deleting lead status:', error);
                    }
                }

                // Tên khách hàng và tên page để lưu vào lead status (dùng cho lọc khách hàng theo thẻ)
                const customerName = selectedConvo.name || selectedConvo.customers?.[0]?.name || '';
                const platformDisplayName = { facebook: 'Facebook', instagram_official: 'Instagram', personal_zalo: 'Zalo', tiktok_business_messaging: 'TikTok' }[pageConfig?.platform] || pageConfig?.platform || 'Facebook';
                const pageDisplayName = `Tin nhắn - ${platformDisplayName} - ${pageConfig?.name || 'Page'}`;

                // ✅ Nếu là label "NOT LEAD" và đang gán, lưu lead status với note
                if (isNotLeadLabel && checked) {
                    try {
                        const leadStatusRes = await fetch('/api/conversation-lead-status', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                conversationId: conversationIdFromAPI,
                                pageId,
                                status: 'NOT_LEAD',
                                note: leadStatusNote.trim() || '',
                                labelId,
                                name: customerName || null,
                                pageDisplayName: pageDisplayName || null,
                                idcustomers: customerIdFromAPI || null,
                            }),
                        });
                        if (leadStatusRes.ok) {
                            const data = await leadStatusRes.json();
                            setConversationLeadStatuses((prev) => ({
                                ...prev,
                                [conversationIdFromAPI]: {
                                    status: 'NOT_LEAD',
                                    note: data.data?.note || leadStatusNote.trim() || '',
                                },
                            }));
                        }
                    } catch (error) {
                        console.error('[handleToggleLabel] Error saving lead status:', error);
                    }
                }

                // ✅ Nếu là label "LEAD" và đang gán, lưu lead status
                if (isLeadLabel && checked) {
                    try {
                        const leadStatusRes = await fetch('/api/conversation-lead-status', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                conversationId: conversationIdFromAPI,
                                pageId,
                                status: 'LEAD',
                                note: null,
                                labelId,
                                name: customerName || null,
                                pageDisplayName: pageDisplayName || null,
                                idcustomers: customerIdFromAPI || null,
                            }),
                        });
                        if (leadStatusRes.ok) {
                            setConversationLeadStatuses((prev) => ({
                                ...prev,
                                [conversationIdFromAPI]: {
                                    status: 'LEAD',
                                    note: null,
                                },
                            }));
                        }
                    } catch (error) {
                        console.error('[handleToggleLabel] Error saving lead status:', error);
                    }
                }

                // Cập nhật lại state allLabels theo kết quả toggle
                setAllLabels((prev) =>
                    prev.map((l) => {
                        if (l._id !== labelId) return l;
                        
                        // Cập nhật theo cấu trúc mới
                        const customerData = l.customer || {};
                        const pageData = customerData[pageId] || { IDconversation: [], IDcustomer: [] };
                        
                        if (checked) {
                            // Thêm vào
                            if (!pageData.IDconversation.includes(conversationIdFromAPI)) {
                                pageData.IDconversation.push(conversationIdFromAPI);
                                pageData.IDcustomer.push(customerIdFromAPI);
                            }
                        } else {
                            // Xóa khỏi
                            const index = pageData.IDconversation.indexOf(conversationIdFromAPI);
                            if (index !== -1) {
                                pageData.IDconversation.splice(index, 1);
                                pageData.IDcustomer.splice(index, 1);
                            }
                        }
                        
                        customerData[pageId] = pageData;
                        return { ...l, customer: customerData };
                    })
                );

                toast.success(res?.message || (checked ? 'Đã gán nhãn' : 'Đã bỏ nhãn'));
            } catch (e) {
                toast.error('Lỗi khi cập nhật nhãn');
                console.error('[handleToggleLabel] error:', e);
            }
        },
        [pageConfig.id, token, allLabels, pancakeTags, leadStatusNote]
    );

    // Xử lý khi user xác nhận nhập lý do NOT LEAD
    const handleConfirmNotLead = useCallback(async () => {
        if (!pendingLabelId || !selectedConvoRef.current) return;

        const note = leadStatusNote.trim();
        if (!note) {
            toast.error('Vui lòng nhập lý do');
            return;
        }

        const selectedConvo = selectedConvoRef.current;
        const conversationId = selectedConvo.id;
        const pageId = pageConfig.id;

        // Lấy conversationId từ API
        let conversationIdFromAPI = conversationId;
        try {
            let customerIdForRequest = selectedConvo.customers?.[0]?.id 
                || selectedConvo.customers?.[0]?.fb_id 
                || selectedConvo.from?.id 
                || null;
            
            let messagesUrl = `https://pancake.vn/api/v1/pages/${pageId}/conversations/${conversationId}/messages?customer_id=${customerIdForRequest || ''}&access_token=${token}&user_view=true&is_new_api=true&separate_pos=true`;
            let messagesResponse = await fetch(messagesUrl);
            
            if (!messagesResponse.ok && messagesResponse.status === 400) {
                messagesUrl = `https://pancake.vn/api/v1/pages/${pageId}/conversations/${conversationId}/messages?access_token=${token}&user_view=true&is_new_api=true&separate_pos=true`;
                messagesResponse = await fetch(messagesUrl);
            }
            
            if (messagesResponse.ok) {
                const messagesData = await messagesResponse.json();
                if (messagesData?.messages && Array.isArray(messagesData.messages) && messagesData.messages.length > 0) {
                    const firstMessage = messagesData.messages[0];
                    if (firstMessage?.conversation_id) {
                        conversationIdFromAPI = firstMessage.conversation_id;
                    } else if (firstMessage?.conversation?.id) {
                        conversationIdFromAPI = firstMessage.conversation.id;
                    }
                } else if (messagesData?.conversation_id) {
                    conversationIdFromAPI = messagesData.conversation_id;
                }
            }
        } catch (error) {
            console.warn('[handleConfirmNotLead] Error getting conversationId:', error);
        }

        // 1. Gán label trước
        await handleToggleLabel(pendingLabelId, pendingChecked);
        
        // 2. Lưu lead status với note (kèm tên khách hàng, tên page, idcustomers)
        const customerName = selectedConvo.name || selectedConvo.customers?.[0]?.name || '';
        const platformDisplayName = { facebook: 'Facebook', instagram_official: 'Instagram', personal_zalo: 'Zalo', tiktok_business_messaging: 'TikTok' }[pageConfig?.platform] || pageConfig?.platform || 'Facebook';
        const pageDisplayName = `Tin nhắn - ${platformDisplayName} - ${pageConfig?.name || 'Page'}`;
        const idcustomers = selectedConvo.customers?.[0]?.id || selectedConvo.customers?.[0]?.fb_id || null;
        try {
            const leadStatusRes = await fetch('/api/conversation-lead-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: conversationIdFromAPI,
                    pageId,
                    status: 'NOT_LEAD',
                    note: note,
                    labelId: pendingLabelId,
                    name: customerName || null,
                    pageDisplayName: pageDisplayName || null,
                    idcustomers: idcustomers || null,
                }),
            });
            if (leadStatusRes.ok) {
                const data = await leadStatusRes.json();
                setConversationLeadStatuses((prev) => ({
                    ...prev,
                    [conversationIdFromAPI]: {
                        status: 'NOT_LEAD',
                        note: data.data?.note || note,
                    },
                }));
                toast.success('Đã lưu lý do NOT LEAD');
            }
        } catch (error) {
            console.error('[handleConfirmNotLead] Error saving lead status:', error);
            toast.error('Lỗi khi lưu lý do');
        }
        
        // Đóng modal
        setShowLeadStatusModal(false);
        setPendingLabelId(null);
        setPendingChecked(false);
        setLeadStatusNote('');
    }, [pendingLabelId, pendingChecked, leadStatusNote, handleToggleLabel, pageConfig.id, token]);

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

    // ===================== Name normalize helpers =====================
    const stripDiacritics = useCallback((s) => {
        try {
            return String(s || '')
                .normalize('NFD')
                .replace(/\p{Diacritic}/gu, '')
                .replace(/đ/gi, (m) => (m === 'đ' ? 'd' : 'D'))
                .toLowerCase()
                .trim();
        } catch {
            return String(s || '').toLowerCase().trim();
        }
    }, []);

    const genNameVariants = useCallback((fullName) => {
        const base = stripDiacritics(fullName);
        if (!base) return [];
        const parts = base.split(/\s+/).filter(Boolean);
        const variants = new Set([base]);
        // First + last, last
        if (parts.length >= 2) {
            variants.add(`${parts[0]} ${parts[parts.length - 1]}`);
            variants.add(parts[parts.length - 1]);
        }
        // Progressive tails
        for (let i = 1; i < parts.length; i++) {
            variants.add(parts.slice(i).join(' '));
        }
        return Array.from(variants);
    }, [stripDiacritics]);

    const normalizePhone = useCallback((raw) => normalizeVNPhone(String(raw || '')), []);

    const extractPhonesFromConvo = useCallback((convo) => {
        const set = new Set();
        const add = (v) => {
            const n = normalizePhone(v);
            if (n) set.add(n);
        };
        try {
            (convo?.recent_phone_numbers || []).forEach(add);
        } catch (_) {}
        add(convo?.customers?.[0]?.phone);
        add(convo?.from?.phone);
        if (typeof convo?.snippet === 'string') {
            extractPhones(convo.snippet).forEach(add);
        }
        return Array.from(set);
    }, [normalizePhone]);

    const extractNamesFromConvo = useCallback((convo) => {
        const names = new Set();
        const base = convo?.customers?.[0]?.name || convo?.from?.name || '';
        if (base) {
            genNameVariants(base).forEach((v) => names.add(v));
        }
        return Array.from(names);
    }, [genNameVariants]);
    // ============== SOCKET.IO: kết nối + handlers ==============
    const socketRef = useRef(null);

    // applyPatch cho conv:patch
    const applyPatch = useCallback((prev, patch) => {
        if (!patch || !patch.type) return prev;
        if (patch.type === 'replace' && Array.isArray(patch.items)) {
                // Incoming replace may contain partial items; merge with existing when possible
                const incoming = (patch.items || []).filter(c => isInbox(c) || isComment(c));
                // Build map from incoming
                const incMap = new Map();
                incoming.forEach((c) => incMap.set(c.id, c));
                // Merge with prev: keep prev items not in incoming, and for items present merge fields
                const result = [];
                const prevMap = new Map(prev.map((p) => [p.id, p]));
                // add/merge incoming
                for (const inc of incoming) {
                    const old = prevMap.get(inc.id);
                    if (!old) {
                        result.push(inc);
                    } else {
                        const merged = { ...old, ...inc };
                        if (!inc.customers || (Array.isArray(inc.customers) && inc.customers.length === 0)) merged.customers = old.customers;
                        if (!inc.from || Object.keys(inc.from || {}).length === 0) merged.from = old.from;
                        if (!inc.avatar && old.avatar) merged.avatar = old.avatar;
                        result.push(merged);
                    }
                }
                // keep prev items that are not in incoming
                for (const p of prev) {
                    if (!incMap.has(p.id)) result.push(p);
                }
                return result;
        }
        if (patch.type === 'upsert' && Array.isArray(patch.items)) {
            const incoming = (patch.items || []).filter(c => isInbox(c) || isComment(c));
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

        // Realtime: tin nhắn mới - Luôn refresh messages thay vì merge
        s.on('msg:new', (msg) => {
            const current = selectedConvoRef.current;
            const targetId = msg?.conversationId || msg?.conversation?.id;
            const currentKey = current ? extractConvoKey(current.id) : null;
            const targetKey = extractConvoKey(targetId);
            
            // ✅ Normalize messages (có thể tạo nhiều messages từ 1 raw message)
            const convFromName = current ? getConvoDisplayName(current) : null;
            const pageName = pageConfig?.name || 'Page Facebook';
            const normalizedMsgs = normalizeMessagesFromRaw(msg, pageConfig.id, convFromName, pageName);
            
            // ✅ Filter theo conversation type
            const conversationType = selectedConvoTypeRef.current;
            const filteredMsgs = normalizedMsgs.filter(normalized => {
                if (conversationType === 'COMMENT') {
                    return normalized.channel === 'COMMENT';
                } else if (conversationType === 'INBOX') {
                    return normalized.channel === 'INBOX';
                }
                return true;
            });
            
            // Kiểm tra tin nhắn mới có phải từ khách hàng không và có chứa số điện thoại
            const normalizedMsg = filteredMsgs[0] || normalizedMsgs.find(m => m.senderType === 'customer');
            const isFromCustomer = normalizedMsg?.senderType === 'customer';
            
            if (isFromCustomer && normalizedMsg?.content?.type === 'text') {
                const messageText = normalizedMsg.content.content;
                const detectedPhones = extractPhones(messageText);
                
                if (detectedPhones.length > 0) {
                    const customerName = current?.customers?.[0]?.name || 'Khách hàng';
                    const conversationId = current?.id || targetId;
                    const platform = pageConfig?.platform || 'facebook';
                    const pageName = pageConfig?.name || 'Page Facebook';
                    
                    console.log('🔍 [Auto Customer] Phát hiện số điện thoại trong tin nhắn:', {
                        customerName,
                        messageText,
                        detectedPhones,
                        conversationId,
                        platform,
                        pageName,
                        rawMsg: msg
                    });
                    
                    // Gọi API tạo khách hàng tự động (không await để không block UI)
                    createAutoCustomer(customerName, messageText, conversationId, platform, pageName)
                        .then(result => {
                            if (result) {
                                console.log('✅ [Auto Customer] Đã tạo khách hàng tự động:', result);
                            }
                        })
                        .catch(error => {
                            console.error('❌ [Auto Customer] Lỗi khi tạo khách hàng:', error);
                        });
                }
            }
            
            // Nếu conversationId là undefined, vẫn refresh nếu có conversation đang chọn
            if (current && (!targetId || currentKey === targetKey)) {
                // ✅ SỬA LỖI: Không gọi lại API msg:get mỗi khi có msg:new
                // Thay vào đó, chỉ thêm tin nhắn mới vào danh sách nếu chưa có
                // Điều này tránh việc thay thế toàn bộ messages và làm mất tin nhắn cũ đã load
                
                setMessages(prevMessages => {
                    // Thêm tất cả filtered messages mới vào danh sách
                    const updated = [...prevMessages];
                    filteredMsgs.forEach(normalizedNewMsg => {
                        // Kiểm tra xem tin nhắn đã tồn tại chưa
                        const exists = updated.some(m => m.id === normalizedNewMsg.id);
                        if (!exists) {
                            updated.push(normalizedNewMsg);
                        }
                    });
                    
                    // Sắp xếp lại theo thời gian để đảm bảo đúng thứ tự
                    const sorted = sortAscByTime(updated);
                    
                    // Chỉ scroll xuống nếu user đang ở gần cuối (trong vòng 100px)
                    // Kiểm tra lại trạng thái scroll hiện tại
                    const container = messagesScrollRef.current;
                    if (container) {
                        const scrollTop = container.scrollTop;
                        const scrollHeight = container.scrollHeight;
                        const clientHeight = container.clientHeight;
                        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
                        const isNearBottom = distanceFromBottom < 100;
                        
                        if (isNearBottom) {
                            // User đang ở gần cuối, đánh dấu cần scroll
                            shouldScrollToBottomRef.current = true;
                            isNearBottomRef.current = true;
                        } else {
                            // User đang xem tin nhắn cũ, không scroll
                            shouldScrollToBottomRef.current = false;
                            isNearBottomRef.current = false;
                        }
                    } else {
                        // Nếu chưa có container, giả định user ở cuối
                        if (isNearBottomRef.current) {
                            shouldScrollToBottomRef.current = true;
                        }
                    }
                    
                    return sorted;
                });
            }
            if (targetId) {
                setConversations((prev) => {
                    // find existing conversation by id or key
                    const found = prev.find((c) => c.id === targetId) ||
                        prev.find((c) => extractConvoKey(c.id) === extractConvoKey(targetId));
                    if (!found) {
                        // if no existing conversation, don't create a minimal conv that lacks customers/from
                        // instead just update snippet in-place by returning prev
                        console.warn('[msg:new] Received msg for unknown conversation, skipping creating minimal convo:', targetId);
                        return prev;
                    }
                    const conv = found;
                    const updated = {
                        ...conv,
                        snippet: (() => {
                            const n = normalizePancakeMessage(msg, pageConfig.id);
                            const snippet = n?.content?.type === 'text' ? n.content.content : 
                                          n?.content?.type === 'images' ? '[Ảnh]' :
                                          n?.content?.type === 'videos' ? '[Video]' :
                                          n?.content?.type === 'files' ? '[Tệp]' : conv.snippet;
                            
                            
                            return snippet;
                        })(),
                        updated_at: msg?.inserted_at || new Date().toISOString(),
                    };
                    const merged = mergeConversations(prev, [updated]);
                    return merged.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
                });
            }
        });

        // Lấy danh sách ban đầu - Hỗ trợ cả INBOX và COMMENT
        s.emit('conv:get', { pageId: pageConfig.id, token, current_count: 0 }, (res) => {
            if (res?.ok && Array.isArray(res.items)) {
                const incoming = res.items.filter(c => isInbox(c) || isComment(c));
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
                        const incoming = ack.items.filter(c => isInbox(c) || isComment(c));
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

        const currentCount = messages?.length || 0;
        const scroller = messagesScrollRef.current;
        const prevScrollHeight = scroller ? scroller.scrollHeight : 0;
        const prevScrollTop = scroller ? scroller.scrollTop : 0;

        // ✅ QUAN TRỌNG: Xác định conversationIdForRequest
        const conversationType = selectedConvoTypeRef.current;
        const isComment = conversationType === 'COMMENT';
        const isZalo = pageConfig?.platform === 'personal_zalo';
        const conversationIdForRequest = (isComment || isZalo)
            ? selectedConvo.id  // ✅ COMMENT hoặc Zalo: giữ nguyên ID
            : extractConvoKey(selectedConvo.id);  // Facebook/Instagram INBOX: extract
        
        // Với một số nền tảng (ví dụ: Zalo cá nhân), conversation có thể không có customers[0].id
        // Fallback lần lượt: customers[0].id -> from.id -> from_psid
        const customerId = selectedConvo?.customers?.[0]?.id
            || selectedConvo?.from?.id
            || selectedConvo?.from_psid
            || null;
        
        const convFromName = getConvoDisplayName(selectedConvo);
        const pageName = pageConfig?.name || 'Page Facebook';
        
        socketRef.current.emit(
            'msg:get',
            { pageId: pageConfig.id, token, conversationId: conversationIdForRequest, customerId: customerId || null, count: currentCount },
            (res) => {
                if (res?.ok && Array.isArray(res.items)) {
                    const incomingMessages = res.items;

                    // ✅ Normalize messages (có thể tạo nhiều messages từ 1 raw message)
                    const allNormalized = incomingMessages.flatMap(rawMsg => 
                        normalizeMessagesFromRaw(rawMsg, pageConfig.id, convFromName, pageName)
                    );
                    
                    // ✅ Filter theo conversation type
                    const filteredNormalized = allNormalized.filter(normalized => {
                        if (conversationType === 'COMMENT') {
                            return normalized.channel === 'COMMENT';
                        } else if (conversationType === 'INBOX') {
                            return normalized.channel === 'INBOX';
                        }
                        return true;
                    });

                    // Kiểm tra xem có tin nhắn mới không
                    const prevMessageIds = new Set(messages.map(m => m.id));
                    const newMessages = filteredNormalized.filter(normalized => 
                        !prevMessageIds.has(normalized.id)
                    );

                    // Nếu không có tin nhắn mới, đánh dấu hết tin nhắn
                    if (newMessages.length === 0) {
                        setHasMore(false);
                        setIsLoadingOlder(false);
                        return;
                    }

                    // Cập nhật state bằng cách cộng dồn tin nhắn
                    setMessages(prevMessages => {
                        const messageMap = new Map();
                        // Thêm tin nhắn mới tải về (cũ hơn về mặt thời gian)
                        filteredNormalized.forEach(normalized => {
                            messageMap.set(normalized.id, normalized);
                        });
                        // Thêm tin nhắn đã có
                        prevMessages.forEach(msg => {
                            if (!messageMap.has(msg.id)) {
                                messageMap.set(msg.id, msg);
                            }
                        });
                        return sortAscByTime(Array.from(messageMap.values()));
                    });

                    // Giữ nguyên vị trí scroll sau khi tải (giống testpancake)
                    setTimeout(() => {
                        if (!scroller) return;
                        const newScrollHeight = scroller.scrollHeight;
                        const heightDiff = newScrollHeight - prevScrollHeight;
                        scroller.scrollTop = prevScrollTop + heightDiff;
                    }, 50);

                } else {
                    // Nếu API lỗi hoặc không trả về mảng, dừng việc tải
                    setHasMore(false);
                }
                setIsLoadingOlder(false);
            }
        );
    }, [selectedConvo, messages, token, pageConfig.id, isLoadingOlder, hasMore]);

    // Scroll to bottom when messages change (only on initial load or new messages from socket)
    useEffect(() => {
        // Chỉ scroll khi:
        // 1. Initial load (khi chọn conversation mới)
        // 2. Có tin nhắn mới từ socket (real-time)
        // KHÔNG scroll khi load more (giữ nguyên vị trí)
        
        if (isInitialLoadRef.current && messages.length > 0) {
            // Initial load - scroll to bottom sau khi messages được render
            setTimeout(() => {
                const container = messagesScrollRef.current;
                if (container) {
                    // Scroll xuống dưới cùng
                    container.scrollTop = container.scrollHeight;
                }
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                isInitialLoadRef.current = false;
            }, 150);
        } else if (shouldScrollToBottomRef.current && messages.length > 0) {
            // New message from socket - scroll to bottom
            // Chỉ scroll nếu user đang ở gần cuối (đã được kiểm tra khi thêm tin nhắn)
            setTimeout(() => {
                const container = messagesScrollRef.current;
                if (container) {
                    // Kiểm tra lại một lần nữa để chắc chắn
                    const scrollTop = container.scrollTop;
                    const scrollHeight = container.scrollHeight;
                    const clientHeight = container.clientHeight;
                    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
                    const isNearBottom = distanceFromBottom < 100;
                    
                    if (isNearBottom && isNearBottomRef.current) {
                        // User đang ở gần cuối, scroll xuống
                        container.scrollTop = container.scrollHeight;
                        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }
                } else {
                    // Fallback nếu không có container
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }
                shouldScrollToBottomRef.current = false;
            }, 100);
        }
    }, [messages.length]);

    useEffect(() => {
        const el = messagesScrollRef.current;
        if (!el) return;

        const handleScroll = () => {
            const currentTop = el.scrollTop;
            const previousTop = lastScrollTopRef.current;
            const scrollHeight = el.scrollHeight;
            const clientHeight = el.clientHeight;
            const distanceFromBottom = scrollHeight - currentTop - clientHeight;

            // Cập nhật trạng thái nearBottom chính xác hơn (threshold 100px)
            const nearBottom = distanceFromBottom < 100;

            // Nếu user scroll lên (currentTop < previousTop), đánh dấu không ở cuối
            if (currentTop < previousTop) {
                if (isNearBottomRef.current) {
                    isNearBottomRef.current = false;
                    setIsNearBottom(false);
                    // Khi user scroll lên, không nên scroll xuống nữa
                    shouldScrollToBottomRef.current = false;
                }
            }

            lastScrollTopRef.current = currentTop;

            // Load more when scrolled to top (within 50px threshold) - giống testpancake
            if (currentTop < 50 && hasMore && !isLoadingOlder) {
                loadOlderMessages();
            }

            // Cập nhật trạng thái nearBottom
            if (isNearBottomRef.current !== nearBottom) {
                isNearBottomRef.current = nearBottom;
                setIsNearBottom(nearBottom);
                // Nếu user scroll xuống gần cuối, có thể cho phép scroll khi có tin nhắn mới
                // Nhưng không tự động scroll ngay
            }
        };

        // Khởi tạo trạng thái ban đầu
        handleScroll();

        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [loadOlderMessages, hasMore, isLoadingOlder]);

    // ===================== Handlers =====================
    const handleSelectConvo = useCallback(
        async (conversation) => {
            // Với COMMENT type, luôn cho phép reload để lấy dữ liệu mới
            const isCommentType = conversation?.type === 'COMMENT';
            if (selectedConvo?.id === conversation.id && !isCommentType) return;

            const s = socketRef.current;
            if (!s) return;

            // dừng watcher cũ (nếu có)
            if (selectedConvo?.id) {
                s.emit('msg:watchStop', { pageId: pageConfig.id, conversationId: selectedConvo.id });
            }

            // set UI & tải messages 1 lần
            // Defensive: if conversation lacks customers/from, try to find richer object in current state
            setConversations((prev) => {
                const richer = prev.find((c) => c.id === conversation.id) || prev.find((c) => extractConvoKey(c.id) === extractConvoKey(conversation.id));
                let enrichedConvo = richer ? { ...richer, ...conversation } : conversation;
                
                // ✅ Enrich với pancakeTags nếu chưa có
                if (!enrichedConvo.pancakeTags || enrichedConvo.pancakeTags.length === 0) {
                    const rawTags = Array.isArray(enrichedConvo.tags) ? enrichedConvo.tags : [];
                    const enrichedTags = rawTags
                        .map((tagId) => {
                            const idStr = String(tagId);
                            return pancakeTags.find((t) => String(t.tagId) === idStr) || null;
                        })
                        .filter(Boolean);
                    if (enrichedTags.length > 0) {
                        enrichedConvo = { ...enrichedConvo, pancakeTags: enrichedTags };
                    }
                }
                
                setSelectedConvo(enrichedConvo);
                return prev;
            });
            
            // ✅ Lưu conversation type để filter messages
            const conversationType = getConvoType(conversation);
            selectedConvoTypeRef.current = conversationType;
            
            // Reset tất cả state khi chuyển conversation (giống testpancake)
            setMessages([]); // Clear messages trước
            setPostInfo(null); // Clear post info
            setHasMore(true); // Reset state load-more
            setIsLoadingOlder(false); // Reset loading older state
            setIsLoadingMessages(true);
            
            // Reset scroll flags và refs
            isInitialLoadRef.current = true; // Reset initial load flag - sẽ scroll xuống sau khi load
            isNearBottomRef.current = true;
            setIsNearBottom(true);
            lastScrollTopRef.current = 0;
            shouldScrollToBottomRef.current = false; // Reset scroll flag - sẽ được set sau khi load xong

            // ✅ QUAN TRỌNG: Nếu là COMMENT, không dùng socket msg:get (pipeline INBOX),
            // mà gọi trực tiếp Pancake REST để lấy đầy đủ post + comments.
            const isComment = conversationType === 'COMMENT';
            if (isComment) {
                try {
                    const convFromName = getConvoDisplayName(conversation);
                    const pageName = pageConfig?.name || 'Page Facebook';

                    const conversationPath = conversation.id; // giữ nguyên dạng pageId_postId/commentId

                    // Pancake yêu cầu customer_id cho COMMENT, lấy lần lượt từ customers[0].id, customers[0].fb_id, conv_from.id, from.id
                    const customerIdForRequest =
                        conversation?.customers?.[0]?.id ||
                        conversation?.customers?.[0]?.fb_id ||
                        conversation?.conv_from?.id ||
                        conversation?.from?.id ||
                        null;

                    const url =
                        `https://pancake.vn/api/v1/pages/${pageConfig.id}` +
                        `/conversations/${conversationPath}/messages` +
                        `?access_token=${token}` +
                        `&user_view=true&is_new_api=true&separate_pos=true` +
                        (customerIdForRequest ? `&customer_id=${encodeURIComponent(customerIdForRequest)}` : '');

                    console.log('📤 [ChatClient][COMMENT] Fetching conversation via REST:', {
                        url,
                        conversationId: conversation.id,
                    });

                    const resp = await fetch(url, { cache: 'no-store' });
                    if (!resp.ok) {
                        const text = await resp.text().catch(() => '');
                        console.error('❌ [ChatClient][COMMENT] REST error:', resp.status, text);
                        toast.error('Không thể tải bình luận từ Pancake');
                        setIsLoadingMessages(false);
                        return;
                    }

                    const data = await resp.json();

                    // ----- Post info -----
                    const postData = data.post || null;
                    if (postData) {
                        const atts = Array.isArray(postData.attachments?.data)
                            ? postData.attachments.data
                            : [];
                        const postImages = atts
                            .filter(a => a?.type === 'photo' || a?.type === 'video_inline' || a?.image_data)
                            .map(a => ({
                                url:
                                    a?.url ||
                                    a?.media?.image?.src ||
                                    a?.image_data?.url ||
                                    a?.preview_url ||
                                    '',
                                width: a?.image_data?.width || a?.media?.image?.width,
                                height: a?.image_data?.height || a?.media?.image?.height,
                            }))
                            .filter(img => img.url);

                        const finalPostId = postData.post_id || postData.id || conversation.post_id || null;

                        setPostInfo({
                            message: postData.message || '',
                            images: postImages,
                            postId: finalPostId,
                            postUrl: postData.permalink_url || postData.url,
                        });
                        lastPostIdRef.current = finalPostId;
                        console.log('🧩 [ChatClient][COMMENT] postInfo resolved:', {
                            postId: finalPostId,
                            fromPost: postData.post_id || postData.id,
                            fromConversation: conversation.post_id,
                            images: postImages.length,
                        });
                    } else {
                        setPostInfo(null);
                        lastPostIdRef.current = conversation.post_id || null;
                        console.log('🧩 [ChatClient][COMMENT] No postData, using conversation.post_id:', {
                            postId: lastPostIdRef.current,
                        });
                    }

                    // ----- Messages / comments -----
                    const rawItems = Array.isArray(data.messages)
                        ? data.messages
                        : Array.isArray(data.items)
                            ? data.items
                            : [];

                    console.log('📥 [ChatClient][COMMENT] REST messages count:', rawItems.length);

                    // Tìm commentId (msg_id) gần nhất từ rawItems để dùng cho reply_comment
                    let lastCommentMsgId = null;
                    const asArrayLocal = (v) => (Array.isArray(v) ? v : []);
                    for (const raw of rawItems) {
                        const atts = [
                            ...asArrayLocal(raw.attachments),
                            ...asArrayLocal(raw.attachments?.data),
                        ];
                        for (const att of atts) {
                            if (att?.comment?.msg_id) {
                                lastCommentMsgId = att.comment.msg_id;
                            }
                        }
                    }
                    lastCommentMsgIdRef.current = lastCommentMsgId;
                    console.log('🧩 [ChatClient][COMMENT] lastCommentMsgId extracted from raw:', {
                        lastCommentMsgId,
                    });

                    const normalized = sortAscByTime(
                        rawItems.flatMap(m =>
                            normalizeMessagesFromRaw(m, pageConfig.id, convFromName, pageName)
                        )
                    );

                    // COMMENT: hiển thị tất cả messages (INBOX + COMMENT) để không mất system text.
                    setMessages(normalized);
                    setHasMore(rawItems.length > 0);
                } catch (e) {
                    console.error('❌ [ChatClient][COMMENT] Unexpected error:', e);
                    toast.error('Không thể tải bình luận');
                    setMessages([]);
                    setPostInfo(null);
                } finally {
                    setIsLoadingMessages(false);
                }

                // Không dùng socket msg:get cho COMMENT (pipeline INBOX không phù hợp)
                return;
            }

            // ✅ QUAN TRỌNG: Xác định conversationIdForRequest cho các loại khác (INBOX/Zalo)
            const isZalo = pageConfig?.platform === 'personal_zalo';
            const conversationIdForRequest = isZalo
                ? conversation.id  // ✅ Zalo: giữ nguyên ID
                : extractConvoKey(conversation.id);  // Facebook/Instagram INBOX: extract "123456789"
            
            // Với Zalo cá nhân và một số nguồn, không có customers[0].id -> dùng from.id hoặc from_psid
            // Đối với Zalo, có thể không cần customerId để tải tin nhắn
            let customerId = conversation?.customers?.[0]?.id
                || conversation?.customers?.[0]?.fb_id
                || conversation?.from?.id
                || conversation?.from_psid
                || null;
            
            // Fallback: Nếu không có customerId, thử extract từ conversation_id
            if (!customerId && conversation?.id) {
                const convId = String(conversation.id);
                // Với TikTok: ttm_-000P2GGgk_nsouQeH7KP4Qa9bTrwp6f0URw_dTVOZ3FjdW9CUXRwT2Voa0dreGI5eHhLckE9PQ==
                if (convId.startsWith('ttm_')) {
                    const parts = convId.split('_');
                    if (parts.length >= 3) {
                        // Lấy phần sau dấu _ thứ 2 làm customer_id
                        customerId = parts.slice(2).join('_');
                    }
                } else if (convId.includes('_') && !convId.startsWith('pzl_') && !convId.startsWith('igo_')) {
                    // Với Facebook: pageId_customerId
                    const parts = convId.split('_');
                    if (parts.length >= 2) {
                        customerId = parts[parts.length - 1];
                    }
                }
            }
            
            // ✅ Lấy thông tin để normalize messages
            const convFromName = getConvoDisplayName(conversation);
            const pageName = pageConfig?.name || 'Page Facebook';
            
            console.log('📤 [ChatClient] Loading messages:', {
                platform: pageConfig?.platform,
                conversationId: conversation.id,
                conversationIdForRequest,
                isComment,
                isZalo,
                customerId,
                conversationType
            });
            
            // Tải tin nhắn - với Zalo, customerId có thể là null
            s.emit(
                'msg:get',
                { 
                    pageId: pageConfig.id, 
                    token, 
                    conversationId: conversationIdForRequest,  // ✅ Gửi ID gốc cho COMMENT/Zalo
                    customerId: customerId || null, 
                    count: 0 
                },
                (res) => {
                    console.log('📥 [ChatClient] Messages response:', {
                        ok: res?.ok,
                        itemsCount: res?.items?.length || 0,
                        hasPost: !!res?.post,
                        error: res?.error
                    });
                    
                    if (res?.ok && Array.isArray(res.items)) {
                        // ✅ Xử lý post info cho COMMENT conversations
                        if (isComment && res.post) {
                            const postData = res.post;
                            const asArrayHelper = (v) => (Array.isArray(v) ? v : []);
                            const postAttachments = asArrayHelper(postData.attachments || postData.attachment);
                            const postImages = postAttachments
                                .filter(pa => pa?.type === 'photo' || pa?.type === 'video_inline' || pa?.image_data)
                                .map(pa => ({
                                    url: pa?.url || pa?.image_data?.url || pa?.preview_url,
                                    width: pa?.image_data?.width || pa?.width,
                                    height: pa?.image_data?.height || pa?.height,
                                }))
                                .filter(img => img.url);
                            
                            setPostInfo({
                                message: postData.message || postData.text || '',
                                images: postImages,
                                postId: postData.id || conversation.post_id,
                                postUrl: postData.permalink_url || postData.url,
                            });
                        }
                        
                        // ✅ Normalize messages (có thể tạo nhiều messages từ 1 raw message)
                        console.log('🔍 [ChatClient] Raw messages from API:', {
                            count: res.items.length,
                            sample: res.items[0] ? {
                                id: res.items[0].id,
                                type: res.items[0].type,
                                original_message: res.items[0].original_message?.substring(0, 50),
                            } : null
                        });
                        
                        let normalized = sortAscByTime(
                            res.items.flatMap((m) => {
                                const normalizedMsgs = normalizeMessagesFromRaw(m, pageConfig.id, convFromName, pageName);
                                console.log('🔍 [ChatClient] Normalized from raw:', {
                                    rawType: m.type,
                                    rawId: m.id,
                                    normalizedCount: normalizedMsgs.length,
                                    channels: normalizedMsgs.map(nm => nm.channel)
                                });
                                return normalizedMsgs;
                            })
                        );
                        
                        // ✅ QUAN TRỌNG: Nếu là COMMENT conversation, đảm bảo tất cả messages có channel === 'COMMENT'
                        // (fallback cho trường hợp messages từ API không có type === 'COMMENT')
                        if (conversationType === 'COMMENT') {
                            normalized = normalized.map(msg => {
                                if (msg.channel !== 'COMMENT') {
                                    console.warn('⚠️ [ChatClient] Message không có channel === "COMMENT" trong COMMENT conversation, đang sửa:', {
                                        msgId: msg.id,
                                        currentChannel: msg.channel
                                    });
                                    return {
                                        ...msg,
                                        channel: 'COMMENT',
                                        metadata: msg.metadata || {
                                            postId: conversation.post_id,
                                            conversationId: conversation.id,
                                            author: msg.senderType === 'customer' ? convFromName : pageName,
                                        }
                                    };
                                }
                                return msg;
                            });
                        }
                        
                        // ✅ Filter messages theo conversation type
                        const filteredMessages = normalized.filter(msg => {
                            if (conversationType === 'COMMENT') {
                                return msg.channel === 'COMMENT';
                            } else if (conversationType === 'INBOX') {
                                return msg.channel === 'INBOX';
                            }
                            return true; // Nếu không xác định được, hiển thị tất cả
                        });
                        
                        console.log('✅ [ChatClient] Normalized messages:', {
                            total: normalized.length,
                            filtered: filteredMessages.length,
                            conversationType,
                            channels: normalized.map(m => ({ id: m.id, channel: m.channel, type: m.content?.type })),
                            filteredChannels: filteredMessages.map(m => ({ id: m.id, channel: m.channel, type: m.content?.type }))
                        });
                        
                        setMessages(filteredMessages);
                        // Set hasMore dựa trên số lượng tin nhắn (nếu có tin nhắn thì có thể còn tin nhắn cũ hơn)
                        setHasMore(res.items.length > 0);
                        
                        // Đánh dấu cần scroll xuống khi load lần đầu (initial load)
                        // useEffect sẽ xử lý scroll sau khi messages được set
                        if (isInitialLoadRef.current) {
                            shouldScrollToBottomRef.current = true;
                        }
                    } else if (res?.error) {
                        console.error('❌ [ChatClient] msg:get error:', res.error);
                        console.warn('⚠️ [ChatClient] Không thể tải tin nhắn:', res.error);
                        // Hiển thị thông báo lỗi cho user
                        toast.error(`Không thể tải tin nhắn: ${res.error}`);
                    } else {
                        console.warn('⚠️ [ChatClient] Response không hợp lệ:', res);
                    }
                    setIsLoadingMessages(false);
                }
            );

            // bật watcher realtime cho hội thoại này
            // Với Zalo, sử dụng conversationId gốc
            s.emit(
                'msg:watchStart',
                { 
                    pageId: pageConfig.id, 
                    token, 
                    conversationId: conversationIdForRequest,  // ✅ Gửi ID gốc cho Zalo
                    customerId: customerId || null, 
                    count: 0, 
                    intervalMs: 2500 
                },
                (ack) => {
                    if (!ack?.ok) {
                        console.error('[msg:watchStart] error:', ack?.error);
                        // Không block UI nếu watchStart thất bại
                    }
                }
            );
        },
        [pageConfig.id, token, selectedConvo?.id, pancakeTags]
    );

    // ===================== Preselect matching logic =====================
    useEffect(() => {
        // Only run for Zalo personal and when preselect provided and nothing selected yet
        if (!preselect || selectedConvoRef.current || !Array.isArray(conversations) || conversations.length === 0) return;
        if (String(pageConfig?.platform) !== 'personal_zalo') return;

        const trySelect = (convo, context = {}) => {
            if (!convo) return false;
            const convoName = convo?.customers?.[0]?.name || convo?.from?.name || 'Unknown';
            console.log('✅ [Preselect Match] Selecting conversation:', {
                id: convo.id,
                name: convoName,
                ...context,
            });
            handleSelectConvo(convo);
            return true;
        };

        const preselectUidRaw = typeof preselect.uid === 'string' ? preselect.uid.trim() : null;
        const preselectUid = preselectUidRaw ? preselectUidRaw.replace(/\s+/g, '') : null;
        if (preselectUid) {
            const expectedById = `pzl_u_${pageConfig.id}_${preselectUid}`;
            const matchedByUid = conversations.find((convo) => {
                const convoUid = getZaloUidFromConversation(convo);
                const convoId = String(convo?.id || '');
                const fbId = String(convo?.customers?.[0]?.fb_id || '');
                return (
                    convoUid === preselectUid ||
                    convoId === expectedById ||
                    fbId === expectedById
                );
            });

            if (trySelect(matchedByUid, { reason: 'uid-match', uid: preselectUid })) return;
        }

        const prePhones = (Array.isArray(preselect.phones) ? preselect.phones : [preselect.phone])
            .filter(Boolean)
            .map((p) => normalizePhone(p))
            .filter(Boolean);
        const prePhone = prePhones[0] || null;
        const preNameNormalized = stripDiacritics(preselect.name);
        const preNameParts = preNameNormalized.split(/\s+/).filter(Boolean);

        const scoreConvo = (convo) => {
            const phones = extractPhonesFromConvo(convo);
            const convoName = convo?.customers?.[0]?.name || convo?.from?.name || '';
            const convoNameNormalized = stripDiacritics(convoName);
            const convoNameParts = convoNameNormalized.split(/\s+/).filter(Boolean);

            // Priority 1: Phone exact match (highest priority)
            if (prePhone && phones.length > 0 && phones.includes(prePhone)) {
                return 1000;
            }

            // Priority 2: Full name exact match (after normalize)
            if (preNameNormalized && convoNameNormalized && preNameNormalized === convoNameNormalized) {
                return 900;
            }

            // Priority 3: First + Last name match (if name has 2+ parts)
            if (preNameParts.length >= 2 && convoNameParts.length >= 2) {
                const preFirstLast = `${preNameParts[0]} ${preNameParts[preNameParts.length - 1]}`;
                const convoFirstLast = `${convoNameParts[0]} ${convoNameParts[convoNameParts.length - 1]}`;
                if (preFirstLast === convoFirstLast) {
                    return 850;
                }
            }

            // Priority 4: All words match (but not necessarily in same order) - only if 3+ words
            if (preNameParts.length >= 3 && convoNameParts.length >= 3) {
                const preSet = new Set(preNameParts);
                const convoSet = new Set(convoNameParts);
                const intersection = new Set([...preSet].filter(x => convoSet.has(x)));
                // If all words from customer name are found in convo name
                if (intersection.size === preNameParts.length && preNameParts.length === convoNameParts.length) {
                    return 750;
                }
            }

            // Priority 5: Partial match with at least 2 consecutive words
            if (preNameParts.length >= 2) {
                // Try to find consecutive words from customer name in conversation name
                for (let i = 0; i <= preNameParts.length - 2; i++) {
                    const twoWords = `${preNameParts[i]} ${preNameParts[i + 1]}`;
                    if (convoNameNormalized.includes(twoWords)) {
                        return 600;
                    }
                }
            }

            return 0;
        };

        let best = null;
        let bestScore = 0;
        const scored = [];
        for (const c of conversations) {
            const sc = scoreConvo(c);
            if (sc > 0) {
                scored.push({
                    id: c.id,
                    name: c?.customers?.[0]?.name || c?.from?.name || 'Unknown',
                    score: sc
                });
            }
            if (sc > bestScore) {
                best = c;
                bestScore = sc;
            }
        }

        console.log('🔍 [Preselect Match] Looking for:', {
            customerName: preselect.name,
            normalized: preNameNormalized,
            phone: prePhone,
            nameParts: preNameParts
        });
        console.log('🔍 [Preselect Match] Scored conversations:', scored.sort((a, b) => b.score - a.score).slice(0, 5));
        console.log('🔍 [Preselect Match] Best match:', best ? {
            id: best.id,
            name: best?.customers?.[0]?.name || best?.from?.name || 'Unknown',
            score: bestScore
        } : 'None');

        // Only select if score is high enough (at least partial match with 2+ words)
        if (bestScore >= 600 && trySelect(best, { reason: 'score-match', score: bestScore })) return;

        // Fallback: conv:search across Pancake - only use phone or full name
        const s = socketRef.current;
        if (!s) return;
        const queries = [];
        if (prePhone) {
            queries.push(prePhone);
        } else if (preNameNormalized) {
            // Only search with full name if no phone
            queries.push(preNameNormalized);
        }
        if (queries.length === 0) return;
        
        s.emit('conv:search', { pageId: pageConfig.id, token, q: queries[0] }, (ack) => {
            if (ack?.ok && Array.isArray(ack.items)) {
                const items = ack.items.filter(c => isInbox(c) || isComment(c));
                // pick best by same scoring
                let b = null; let bs = 0;
                for (const it of items) {
                    const sc = scoreConvo(it);
                    if (sc > bs) { b = it; bs = sc; }
                }
                // Only select if score is high enough
                if (b && bs >= 600) trySelect(b);
            }
        });
    }, [preselect, conversations, pageConfig?.id, pageConfig?.platform, token, handleSelectConvo, extractPhonesFromConvo, stripDiacritics, normalizePhone]);

    // Mở sẵn hội thoại khi vào từ link (vd: /pancake/[pageId]?conversationId=xxx) - dùng khi lọc thẻ LEAD/NOT_LEAD
    const preselectConversationIdAppliedRef = useRef(false);
    const lastPreselectIdRef = useRef(null);
    useEffect(() => {
        if (preselectConversationId !== lastPreselectIdRef.current) {
            lastPreselectIdRef.current = preselectConversationId;
            preselectConversationIdAppliedRef.current = false;
        }
    }, [preselectConversationId]);
    useEffect(() => {
        if (!preselectConversationId || !conversations.length || preselectConversationIdAppliedRef.current) return;
        const targetId = String(preselectConversationId).trim();
        const matched = conversations.find(
            (c) => c.id === targetId || extractConvoKey(c.id) === extractConvoKey(targetId)
        );
        if (matched) {
            preselectConversationIdAppliedRef.current = true;
            handleSelectConvo(matched);
        }
    }, [preselectConversationId, conversations, handleSelectConvo]);

    const triggerPickImage = useCallback(() => {
        if (!selectedConvo) {
            toast.warning('Hãy chọn một hội thoại trước khi đính kèm ảnh.');
            return;
        }
        fileInputRef.current?.click();
    }, [selectedConvo]);

    const triggerPickVideo = useCallback(() => {
        if (!selectedConvo) {
            toast.warning('Hãy chọn một hội thoại trước khi đính kèm video.');
            return;
        }
        videoInputRef.current?.click();
    }, [selectedConvo]);

    const onPickImage = useCallback(async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setIsUploadingImage(true);

        const readAsDataUrl = (file) => new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            } catch (err) { reject(err); }
        });

        try {
            for (const f of files) {
                const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                // 1) Show preview immediately
                try {
                    const dataUrl = await readAsDataUrl(f);
                    setPendingImages((prev) => [
                        ...prev,
                        {
                            contentId: null,
                            attachmentId: null,
                            remoteUrl: null,
                            contentUrl: null,
                            previewUrl: null,
                            url: String(dataUrl),
                            localId,
                            name: f.name,
                            mime: f.type,
                            size: f.size,
                            width: null,
                            height: null,
                            file: f, // ✅ Lưu file object để dùng cho tính SHA1 (COMMENT)
                        },
                    ]);
                } catch (_) {
                    setPendingImages((prev) => [
                        ...prev,
                        {
                            contentId: null,
                            attachmentId: null,
                            remoteUrl: null,
                            contentUrl: null,
                            previewUrl: null,
                            url: '',
                            localId,
                            name: f.name,
                            mime: f.type,
                            size: f.size,
                            width: null,
                            height: null,
                            file: f, // ✅ Lưu file object để dùng cho tính SHA1 (COMMENT)
                        },
                    ]);
                }
                // 2) Upload in background; store returned id for sending
                try {
                    const res = await uploadImageToPancakeAction(f, {
                        pageId: pageConfig.id,
                        accessToken: token,
                    });
                    if (!res?.success) {
                        toast.error(`Tải ảnh thất bại: ${res?.error || ''}`);
                        continue;
                    }
                    setPendingImages((prev) =>
                        prev.map((it) =>
                            it.localId === localId
                                ? {
                                      ...it,
                                      contentId: res.contentId,
                                      attachmentId: res.attachmentId,
                                      remoteUrl: res.url,
                                      contentUrl: res.url,
                                      previewUrl: res.previewUrl || res.url,
                                      thumbnailUrl: res.thumbnailUrl || null,
                                      name: res.name || it.name,
                                      mime: res.mimeType || it.mime,
                                      size: res.size ?? it.size,
                                      width: res.width ?? it.width,
                                      height: res.height ?? it.height,
                                  }
                                : it
                        )
                    );
                } catch (err) {
                    toast.error(`Tải ảnh thất bại: ${err?.message || ''}`);
                }
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
        } finally {
            setIsUploadingImage(false);
        }
    }, []);

    const removePendingImage = useCallback((localId) => {
        setPendingImages((prev) => prev.filter((x) => x.localId !== localId));
    }, []);

    // Upload video qua API route để tránh CORS và xử lý tốt hơn
    const uploadVideoDirectly = useCallback(async (file, pageId, accessToken) => {
        try {
            const form = new FormData();
            form.append('file', file);
            form.append('pageId', pageId);
            form.append('accessToken', accessToken);

            const response = await fetch('/api/pancake/upload-video', {
                method: 'POST',
                body: form,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Upload thất bại với mã lỗi ${response.status}`);
            }

            const data = await response.json().catch(() => null);

            if (!data?.success || !data?.contentId || !data?.attachmentId || !data?.url) {
                throw new Error(data?.error || 'Phản hồi từ server không hợp lệ');
            }

            return data;
        } catch (error) {
            console.error('[uploadVideoDirectly] error:', error);
            return {
                success: false,
                error: error?.message || 'UPLOAD_FAILED'
            };
        }
    }, []);

    const onPickVideo = useCallback(async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setIsUploadingVideo(true);

        // Giới hạn kích thước video: 50MB
        const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

        try {
            for (const f of files) {
                if (!f.type?.startsWith('video/')) {
                    toast.error('Vui lòng chọn tệp video hợp lệ');
                    continue;
                }
                
                // Kiểm tra kích thước file trước khi upload
                if (f.size > MAX_VIDEO_SIZE) {
                    const sizeInMB = (f.size / 1024 / 1024).toFixed(2);
                    toast.error(`Video nặng ${sizeInMB} MB, không thể tải lên qua hệ thống. Vui lòng chọn video nhỏ hơn 50MB.`);
                    continue; // Bỏ qua file này, không upload
                }

                const localId = `local-video-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                const objectUrl = URL.createObjectURL(f);
                setPendingVideos((prev) => [
                    ...prev,
                    {
                        contentId: null,
                        attachmentId: null,
                        remoteUrl: null,
                        previewUrl: null,
                        thumbnailUrl: null,
                        url: objectUrl,
                        localId,
                        name: f.name,
                        size: f.size,
                        mime: f.type,
                        width: null,
                        height: null,
                        length: null,
                    },
                ]);

                try {
                    // Upload qua API route
                    const res = await uploadVideoDirectly(f, pageConfig.id, token);
                    if (!res?.success) {
                        toast.error(`Tải video thất bại: ${res?.error || ''}`);
                        // Xóa video pending nếu upload thất bại
                        setPendingVideos((prev) => prev.filter((it) => it.localId !== localId));
                        URL.revokeObjectURL(objectUrl);
                        continue;
                    }
                    setPendingVideos((prev) =>
                        prev.map((it) =>
                            it.localId === localId
                                ? {
                                      ...it,
                                      contentId: res.contentId,
                                      attachmentId: res.attachmentId,
                                      remoteUrl: res.url,
                                      previewUrl: res.previewUrl || res.url,
                                      thumbnailUrl: res.thumbnailUrl || null,
                                      name: res.name || it.name,
                                      mime: res.mimeType || it.mime,
                                      size: res.size ?? it.size,
                                      width: res.width ?? it.width,
                                      height: res.height ?? it.height,
                                      length: res.length ?? it.length,
                                  }
                                : it
                        )
                    );
                    toast.success(`Đã tải video "${f.name}" thành công`);
                } catch (err) {
                    toast.error(`Tải video thất bại: ${err?.message || ''}`);
                    // Xóa video pending nếu upload thất bại
                    setPendingVideos((prev) => prev.filter((it) => it.localId !== localId));
                    URL.revokeObjectURL(objectUrl);
                }
            }
            if (videoInputRef.current) videoInputRef.current.value = '';
        } finally {
            setIsUploadingVideo(false);
        }
    }, [pageConfig.id, token, uploadVideoDirectly]);

    const removePendingVideo = useCallback((localId) => {
        setPendingVideos((prev) => {
            const target = prev.find((x) => x.localId === localId);
            if (target?.url && target.url.startsWith('blob:')) {
                URL.revokeObjectURL(target.url);
            }
            return prev.filter((x) => x.localId !== localId);
        });
    }, []);

    const handleSendMessage = async (formData) => {
        console.log('=== SENDING MESSAGE ===');
        console.log('FormData:', formData);
        console.log('Selected conversation:', selectedConvo);
        console.log('PageConfig:', pageConfig);
        
        if (!selectedConvo) {
            console.log('❌ No selected conversation');
            return;
        }
        
        const text = (formData.get('message') || '').trim();
        const hasImages = pendingImages.length > 0;
        const hasVideos = pendingVideos.length > 0;
        const hasUnreadyImages = pendingImages.some((img) => !img?.contentId || !img?.remoteUrl);
        const hasUnreadyVideos = pendingVideos.some((v) => !v?.contentId || !v?.remoteUrl);
        console.log('Message text:', text);
        console.log('Has images:', hasImages);
        console.log('Has videos:', hasVideos);
        console.log('Has unready images:', hasUnreadyImages);
        console.log('Has unready videos:', hasUnreadyVideos);
        
        if (hasUnreadyImages || hasUnreadyVideos) {
            toast.error('Tệp đang được tải lên, vui lòng chờ hoàn tất trước khi gửi.');
            return;
        }

        if (!text && !hasImages && !hasVideos) {
            console.log('❌ No text or media to send');
            return;
        }

        // ================== COMMENT conversation: gửi reply_comment + sync_comments ==================
        if (selectedConvo?.type === 'COMMENT') {
            // COMMENT conversation: hỗ trợ cả text và ảnh
            if (!text && !hasImages) {
                toast.error('Vui lòng nhập nội dung bình luận hoặc chọn ảnh');
                return;
            }
            if (hasVideos) {
                toast.error('Hiện tại chỉ hỗ trợ gửi bình luận dạng text và ảnh cho COMMENT');
                return;
            }

            try {
                const pageId = pageConfig.id;
                const accessToken = pageConfig.accessToken || token;
                const conversationId = selectedConvo.id;

                // Lấy postId và commentId ưu tiên từ ref đã lưu khi load COMMENT
                const postId =
                    lastPostIdRef.current ||
                    postInfo?.postId ||
                    selectedConvo?.post_id ||
                    null;

                let commentId = lastCommentMsgIdRef.current || null;

                // Fallback 1: nếu ref chưa có, thử tìm từ messages hiện tại
                let lastCustomerComment = null;
                if (!commentId) {
                    lastCustomerComment = [...messages]
                        .filter((m) =>
                            m.channel === 'COMMENT' &&
                            m.senderType === 'customer' &&
                            m.metadata?.commentMsgId
                        )
                        .sort((a, b) => new Date(b.inserted_at) - new Date(a.inserted_at))[0];
                    commentId = lastCustomerComment?.metadata?.commentMsgId || null;
                }

                // Fallback 2: theo spec Pancake, với COMMENT conversation,
                // conversationId và commentId có thể giống nhau (postId_commentId).
                if (!commentId && typeof conversationId === 'string') {
                    commentId = conversationId;
                }

                console.log('[COMMENT][send] prepared variables:', {
                    pageId,
                    conversationId,
                    postId,
                    commentId,
                    lastPostIdRef: lastPostIdRef.current,
                    lastCommentMsgIdRef: lastCommentMsgIdRef.current,
                    lastCustomerComment: lastCustomerComment
                        ? {
                              id: lastCustomerComment.id,
                              inserted_at: lastCustomerComment.inserted_at,
                              metadata: lastCustomerComment.metadata,
                          }
                        : null,
                    accessTokenPreview: accessToken ? accessToken.slice(0, 10) + '...' : null,
                });

                if (!postId || !commentId) {
                    toast.error('Không tìm được post/comment để reply');
                    return;
                }

                // ========== XỬ LÝ ẢNH CHO COMMENT (nếu có) ==========
                if (hasImages) {
                    // Helper: Load ảnh để lấy width/height (fallback nếu chưa có)
                    const getImageDimensions = (file) => {
                        return new Promise((resolve) => {
                            const img = new Image();
                            const url = URL.createObjectURL(file);
                            img.onload = () => {
                                URL.revokeObjectURL(url);
                                resolve({ width: img.width, height: img.height });
                            };
                            img.onerror = () => {
                                URL.revokeObjectURL(url);
                                resolve({ width: null, height: null });
                            };
                            img.src = url;
                        });
                    };

                    // Gửi từng ảnh: ảnh đã được upload sẵn lên Pancake bằng uploadImageToPancakeAction
                    // => chỉ cần lấy contentUrl đã có và gọi reply_comment
                    for (let i = 0; i < pendingImages.length; i++) {
                        const img = pendingImages[i];
                        const file = img.file; // File object từ onPickImage

                        // Ảnh COMMENT sử dụng chính contentUrl đã được upload bằng uploadImageToPancakeAction
                        const contentUrl = img.contentUrl || img.remoteUrl;

                        if (!contentUrl) {
                            console.error('[COMMENT][image] Missing contentUrl for image:', {
                                index: i,
                                localId: img.localId,
                                name: img.name,
                            });
                            toast.error(`Ảnh ${i + 1} chưa upload xong, vui lòng chờ rồi thử lại`);
                            continue;
                        }

                        try {
                            // Lấy dimensions nếu chưa có
                            let imageWidth = img.width;
                            let imageHeight = img.height;
                            if ((!imageWidth || !imageHeight) && file) {
                                const dimensions = await getImageDimensions(file);
                                imageWidth = dimensions.width;
                                imageHeight = dimensions.height;
                            }

                            console.log('[COMMENT][image][reply] using existing contentUrl:', {
                                index: i,
                                contentUrl,
                                imageWidth,
                                imageHeight,
                            });

                            // Gửi reply_comment với content_url đã có
                            const imageMessage = i === 0 ? text : ''; // Chỉ gửi text kèm ảnh đầu tiên
                            const replyRes = await fetch(
                                `https://pancake.vn/api/v1/pages/${pageId}/conversations/${conversationId}/messages?access_token=${accessToken}`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        action: 'reply_comment',
                                        message: imageMessage,
                                        content_url: contentUrl,
                                        image_data: {
                                            width: imageWidth,
                                            height: imageHeight,
                                        },
                                        message_id: commentId,
                                        parent_id: commentId,
                                        post_id: postId,
                                        send_by_platform: 'web',
                                    }),
                                }
                            );

                            const replyText = await replyRes.text().catch(() => '');
                            console.log('[COMMENT][image][reply_comment] status:', replyRes.status, 'body:', replyText);
                            if (!replyRes.ok) {
                                toast.error(`Không thể gửi ảnh ${i + 1} lên Pancake`);
                                continue;
                            }

                        } catch (err) {
                            console.error(`[COMMENT][image] Error processing image ${i + 1}:`, err);
                            toast.error(`Lỗi khi xử lý ảnh ${i + 1}: ${err.message}`);
                        }
                    }

                    // Bước 5: Sync comments (sau khi gửi tất cả ảnh)
                    const syncRes = await fetch(
                        `https://pancake.vn/api/v1/pages/${pageId}/sync_comments?access_token=${accessToken}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({ post_id: postId }),
                        }
                    );

                    const syncText = await syncRes.text().catch(() => '');
                    console.log('[COMMENT][image][sync_comments] status:', syncRes.status, 'body:', syncText);
                    if (!syncRes.ok) {
                        toast.error('Không thể đồng bộ bình luận từ Facebook');
                    }

                    // Reload messages
                    if (selectedConvoRef.current) {
                        await handleSelectConvo({ ...selectedConvoRef.current });
                    } else {
                        await handleSelectConvo(selectedConvo);
                    }

                    setPendingImages([]);
                    formRef.current?.reset();
                    return;
                }

                // ========== GỬI TEXT ONLY (không có ảnh) ==========
                // (1) reply_comment
                const replyRes = await fetch(
                    `https://pancake.vn/api/v1/pages/${pageId}/conversations/${conversationId}/messages?access_token=${accessToken}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'reply_comment',
                            message: text,
                            message_id: commentId,
                            parent_id: commentId,
                            post_id: postId,
                            send_by_platform: 'web',
                        }),
                    }
                );

                const replyText = await replyRes.text().catch(() => '');
                console.log('[COMMENT][reply_comment] status:', replyRes.status, 'body:', replyText);
                if (!replyRes.ok) {
                    toast.error('Không thể gửi bình luận lên Pancake');
                    return;
                }

                // (2) sync_comments
                const syncRes = await fetch(
                    `https://pancake.vn/api/v1/pages/${pageId}/sync_comments?access_token=${accessToken}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ post_id: postId }),
                    }
                );

                const syncText = await syncRes.text().catch(() => '');
                console.log('[COMMENT][sync_comments] status:', syncRes.status, 'body:', syncText);
                if (!syncRes.ok) {
                    toast.error('Không thể đồng bộ bình luận từ Facebook');
                    return;
                }

                // (3) Lấy lại toàn bộ messages cho COMMENT bằng handleSelectConvo (đã dùng REST)
                if (selectedConvoRef.current) {
                    await handleSelectConvo({ ...selectedConvoRef.current });
                } else {
                    await handleSelectConvo(selectedConvo);
                }

                formRef.current?.reset();
            } catch (e) {
                console.error('❌ [COMMENT][send] error:', e);
                toast.error('Gửi bình luận thất bại');
            }

            return; // Không chạy pipeline INBOX bên dưới
        }

        // Optimistic UI - chỉ hiển thị loading state, không tạo tin nhắn tạm
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
        if (hasVideos) {
            const optimisticIdVideos = `optimistic-video-${Date.now()}`;
            optimisticEntries.push({
                id: optimisticIdVideos,
                inserted_at: now,
                senderType: 'page',
                status: 'sending',
                content: {
                    type: 'videos',
                    videos: pendingVideos.map((p) => ({ url: p.url, name: p.name })),
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
        // Chỉ thêm optimistic entries nếu không có tin nhắn nào đang gửi
        if (optimisticEntries.length) {
            setMessages((prev) => {
                const hasSendingMessages = prev.some(m => m.status === 'sending');
                if (hasSendingMessages) {
                    // Nếu đã có tin nhắn đang gửi, không thêm optimistic entries
                    return prev;
                }
                return sortAscByTime([...prev, ...optimisticEntries]);
            });
        }

        // Gửi thật
        console.log('🚀 Sending message to server...');
        let overallOk = true;
        let lastError = null;
        let remainingText = text;
        try {
            if (hasImages) {
                console.log('📷 Sending image message...');
                for (let i = 0; i < pendingImages.length; i++) {
                    const it = pendingImages[i];
                    const messageToSend = i === 0 ? remainingText : '';
                    const res = await sendImageAction(
                        pageConfig.id,
                        pageConfig.accessToken,
                        selectedConvo.id,
                        {
                            contentId: it.contentId,
                            attachmentId: it.attachmentId,
                            url: it.remoteUrl || it.contentUrl,
                            previewUrl: it.previewUrl,
                            thumbnailUrl: it.thumbnailUrl,
                            mimeType: it.mime,
                            name: it.name,
                            size: it.size,
                            width: it.width,
                            height: it.height,
                        },
                        messageToSend
                    );
                    console.log(`📷 Image ${i} send result:`, res);
                    if (!res?.success) {
                        overallOk = false;
                        lastError = res?.error || 'SEND_IMAGE_FAILED';
                    } else if (i === 0 && messageToSend) {
                        remainingText = '';
                    }
                }
            }

            if (hasVideos) {
                console.log('🎬 Sending video message...');
                setIsUploadingVideo(true); // Vô hiệu hóa input khi đang gửi video
                try {
                    for (let i = 0; i < pendingVideos.length; i++) {
                        const it = pendingVideos[i];
                        console.log('🎬 [Debug] video payload ready?', it);
                        const messageToSend = !hasImages && i === 0 ? remainingText : '';
                        const res = await sendVideoAction(
                            pageConfig.id,
                            pageConfig.accessToken,
                            selectedConvo.id,
                            {
                                contentId: it.contentId,
                                attachmentId: it.attachmentId,
                                url: it.remoteUrl || it.url,
                                previewUrl: it.previewUrl || it.remoteUrl || it.url,
                                thumbnailUrl: it.thumbnailUrl,
                                mimeType: it.mime,
                                name: it.name,
                            },
                            messageToSend
                        );
                        console.log(`🎬 Video ${i} send result:`, res);
                        if (!res?.success) {
                            overallOk = false;
                            lastError = res?.error || 'SEND_VIDEO_FAILED';
                            console.warn('🎬 Video send failure payload:', {
                                request: it,
                                response: res,
                            });
                        } else if (!hasImages && i === 0 && messageToSend) {
                            remainingText = '';
                        }
                    }
                } finally {
                    setIsUploadingVideo(false); // Bật lại input sau khi gửi xong
                }
            }

            if (!hasImages && !hasVideos && remainingText) {
                console.log('💬 Sending text message...');
                const r = await sendMessageAction(
                    pageConfig.id,
                    pageConfig.accessToken,
                    selectedConvo.id,
                    remainingText,
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
        

        // Xóa optimistic entries sau khi gửi (tin nhắn thật sẽ được thêm qua msg:new)
        if (overallOk) {
            setMessages((prev) => prev.filter(m => !optimisticEntries.find(o => o.id === m.id)));
        } else {
            // Nếu gửi thất bại, cập nhật status của optimistic entries
            setMessages((prev) =>
                prev.map((m) => {
                    if (optimisticEntries.find((o) => o.id === m.id)) {
                        return { ...m, status: 'failed', error: lastError };
                    }
                    return m;
                })
            );
        }

        if (overallOk) {
            setConversations((prev) => {
                const updated = {
                    ...selectedConvo,
                    snippet: text
                        ? text
                        : hasImages
                            ? '[Ảnh]'
                            : hasVideos
                                ? '[Video]'
                                : selectedConvo.snippet,
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
            pendingVideos.forEach((v) => {
                if (v?.url && v.url.startsWith('blob:')) {
                    URL.revokeObjectURL(v.url);
                }
            });
            setPendingImages([]);
            setPendingVideos([]);
            formRef.current?.reset();
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            
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
                setSearchResults(ack.items.filter(c => isInbox(c) || isComment(c)));
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

    // Load conversations từ label filter
    useEffect(() => {
        console.log('🔄 [useEffect] Label filter triggered:', {
            selectedFilterLabelIds,
            pageId: pageConfig.id,
            token: token ? 'exists' : 'missing'
        });

        const loadLabelFilterConversations = async () => {
            if (selectedFilterLabelIds.length === 0) {
                console.log('⚠️ [loadLabelFilterConversations] No labels selected, clearing filter');
                setLabelFilterConversations([]);
                return;
            }

            console.log('🚀 [loadLabelFilterConversations] Starting to load conversations for labels:', selectedFilterLabelIds);
            setIsLoadingLabelFilter(true);
            
            try {
                // Lấy conversation_ids và conversationCustomerMap từ database
                console.log('📞 [loadLabelFilterConversations] Calling getConversationIdsByLabelsAndPage...');
                const result = await getConversationIdsByLabelsAndPage({
                    labelIds: selectedFilterLabelIds,
                    pageId: pageConfig.id
                });

                console.log('📥 [loadLabelFilterConversations] Response from getConversationIdsByLabelsAndPage:', result);

                const { conversationIds, conversationCustomerMap } = result;

                console.log('🔍 [loadLabelFilterConversations] Data from database:', {
                    conversationIdsCount: conversationIds?.length || 0,
                    conversationIds: conversationIds,
                    conversationCustomerMap,
                    pageId: pageConfig.id
                });

                if (!conversationIds || conversationIds.length === 0) {
                    console.warn('⚠️ [loadLabelFilterConversations] No conversations found in database');
                    setLabelFilterConversations([]);
                    setIsLoadingLabelFilter(false);
                    return;
                }

                // Gọi API để lấy thông tin conversations, truyền conversationCustomerMap để sử dụng customer_id từ database
                console.log('📞 [loadLabelFilterConversations] Calling getConversationsFromIds...');
                const conversationsFromIds = await getConversationsFromIds(
                    pageConfig.id,
                    conversationIds,
                    token,
                    conversationCustomerMap
                );

                console.log('✅ [loadLabelFilterConversations] Loaded conversations:', {
                    count: conversationsFromIds.length,
                    conversations: conversationsFromIds
                });
                setLabelFilterConversations(conversationsFromIds);
            } catch (error) {
                console.error('❌ [loadLabelFilterConversations] Error loading label filter conversations:', error);
                console.error('❌ [loadLabelFilterConversations] Error stack:', error.stack);
                toast.error('Không thể tải danh sách hội thoại theo thẻ: ' + (error.message || 'Unknown error'));
                setLabelFilterConversations([]);
            } finally {
                setIsLoadingLabelFilter(false);
            }
        };

        loadLabelFilterConversations();
    }, [selectedFilterLabelIds, pageConfig.id, token]);

    // ===================== Dữ liệu hiển thị =====================
    const listForSidebar = isSearching ? searchResults : conversations;

    const filteredSortedConversations = useMemo(() => {
        // Helper: map convo.tags (ID) -> full tag objects từ pancakeTags
        const getConvPancakeTags = (convo) => {
            if (!convo) return [];
            const rawTags = Array.isArray(convo.tags) ? convo.tags : [];
            // Nếu đã là object (đã được enrich ở đâu đó) thì dùng luôn
            if (rawTags.length > 0 && typeof rawTags[0] === 'object') {
                return rawTags;
            }
            // Pancake API trả về tags dạng number[] -> join với pancakeTags (từ Mongo)
            return rawTags
                .map((tagId) => {
                    const idStr = String(tagId);
                    return pancakeTags.find((t) => String(t.tagId) === idStr) || null;
                })
                .filter(Boolean);
        };
        
        // Debug logging
        if (selectedTagIds.length > 0) {
            console.log(`[filteredSortedConversations] 🔍 Filtering with tags: ${selectedTagIds.join(',')}, tagFilterConversations: ${tagFilterConversations.length}, listForSidebar: ${listForSidebar.length}`);
        }

        // Nếu có filter theo label, sử dụng conversations từ label filter
        if (selectedFilterLabelIds.length > 0) {
            // Merge conversations từ label filter với conversations hiện tại
            const merged = [...labelFilterConversations];
            const existingIds = new Set(merged.map((c) => c.id));

            // Thêm các conversations từ listForSidebar nếu chưa có
            listForSidebar.forEach((convo) => {
                const conversationId = convo?.id;
                if (conversationId && !existingIds.has(conversationId)) {
                    // Kiểm tra xem conversation có thuộc các label đã chọn không (theo cấu trúc mới)
                    const customerLabelIds = allLabels
                        .filter((label) => {
                            const customerData = label.customer || {};
                            const pageData = customerData[pageConfig.id];
                            if (pageData && Array.isArray(pageData.IDconversation)) {
                                return pageData.IDconversation.includes(conversationId);
                            }
                            return false;
                        })
                        .map((label) => label._id);
                    const hasAll = selectedFilterLabelIds.every((id) =>
                        customerLabelIds.includes(id)
                    );
                    if (hasAll) {
                        merged.push({
                            ...convo,
                            pancakeTags: getConvPancakeTags(convo),
                        });
                        existingIds.add(conversationId);
                    }
                }
            });

            return merged.sort((a, b) => {
                const timeA = new Date(a.updated_at || 0).getTime();
                const timeB = new Date(b.updated_at || 0).getTime();
                return timeB - timeA;
            });
        }

        // ✅ THEO TÀI LIỆU: Khi filter tag, dùng conversations từ API (có conversations cũ)
        // Merge với conversations từ socket để có realtime updates
        let list = [];
        
        if (selectedTagIds.length > 0) {
            // ✅ QUAN TRỌNG: Khi filter tag, CHỈ dùng conversations từ API
            // KHÔNG merge với conversations từ socket để tránh hiển thị tất cả conversations
            if (tagFilterConversations.length === 0) {
                // Chưa load xong từ API, trả về rỗng (sẽ hiển thị loading)
                console.log('[filteredSortedConversations] ⏳ Waiting for tagFilterConversations to load...');
                return [];
            }
            
            // ✅ CHỈ dùng conversations từ API (đã filter theo tag từ Pancake)
            // Không merge với socket để tránh hiển thị tất cả conversations
            list = tagFilterConversations;
            
            console.log(`[filteredSortedConversations] ✅ Using ${list.length} conversations from API for tags: ${selectedTagIds.join(',')} (NOT merging with socket)`);
        } else {
            // Không filter tag, dùng conversations từ socket
            list = listForSidebar || [];
        }

        // Enrich tất cả conversations với pancakeTags để dùng ở UI (sidebar)
        const enriched = list.map((convo) => ({
            ...convo,
            pancakeTags: getConvPancakeTags(convo),
        }));

        return enriched.sort(
            (a, b) =>
                new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime(),
        );
    }, [
        listForSidebar,
        selectedFilterLabelIds,
        allLabels,
        labelFilterConversations,
        selectedTagIds,
        pancakeTags,
        pageConfig.id,
        tagFilterConversations,
    ]);

    // Tự động preload thông tin phân công nhân viên cho các hội thoại đang hiển thị ở sidebar
    useEffect(() => {
        const list = Array.isArray(filteredSortedConversations) ? filteredSortedConversations : [];
        if (!list.length) return;

        // Lấy danh sách conversationId chưa có dữ liệu phân công trong map (dựa trên ref, không đưa map vào deps)
        const idsToFetch = [...new Set(
            list
                .map((c) => c?.id)
                .filter((id) => id && !(id in (conversationAssigneesMapRef.current || {})))
        )];

        if (!idsToFetch.length) return;

        let cancelled = false;

        const preloadAssignees = async () => {
            for (const convoId of idsToFetch) {
                if (cancelled) break;
                try {
                    await loadAssigneesHistory(convoId);
                } catch (err) {
                    console.error('[Assignees] Error preloading assignees for conversation:', convoId, err);
                }
            }
        };

        preloadAssignees();

        return () => {
            cancelled = true;
        };
    }, [filteredSortedConversations, loadAssigneesHistory]);

    // Helper: gộp labels từ Labelfb (customer[pageId].IDconversation) + label từ conversationleadstatuses (LEAD/NOT_LEAD)
    const getAssignedLabelsForConversation = useCallback((conversationId) => {
        if (!conversationId) return [];
        const cidStr = String(conversationId);
        const labelsFromDB = allLabels.filter((label) => {
            const customerData = label.customer || {};
            const pageData = customerData[pageConfig.id];
            if (pageData && Array.isArray(pageData.IDconversation)) {
                return pageData.IDconversation.some((id) => String(id) === cidStr);
            }
            return false;
        });
        // Tra cứu lead status: thử đúng id và cả extractConvoKey (tránh lệch format sau reload)
        const leadStatus =
            conversationLeadStatuses[cidStr] ||
            conversationLeadStatuses[extractConvoKey(cidStr)];
        if (!leadStatus) return labelsFromDB;
        const leadLabel = leadStatus.labelId
            ? allLabels.find((l) => String(l._id) === String(leadStatus.labelId))
            : allLabels.find((l) =>
                (leadStatus.status === 'LEAD' && l.name === 'LEAD') ||
                ((leadStatus.status === 'NOT_LEAD') && (l.name === 'NOT LEAD' || l.name === 'NOT_LEAD'))
            );
        if (leadLabel && !labelsFromDB.some((l) => String(l._id) === String(leadLabel._id))) {
            return [...labelsFromDB, leadLabel];
        }
        return labelsFromDB;
    }, [allLabels, pageConfig.id, conversationLeadStatuses]);

    const assignedLabelsForSelectedConvo = useMemo(() => {
        if (!selectedConvo || !selectedConvo.id) return [];
        return getAssignedLabelsForConversation(selectedConvo.id);
    }, [selectedConvo, getAssignedLabelsForConversation]);

    // ===================== Render =====================
    return (
        <div className="flex h-full w-full bg-white rounded-md border border-gray-200 flex-col p-2 gap-2">
            <Toaster richColors position="top-right" />

            {/* Header */}
            <div className="flex">
                <div className="flex items-center gap-3 justify-between w-full">
                    <div className="flex-1 gap-2 flex items-center">
                        {!hideSidebar && (
                            <>
                                <Link
                                    href="/pancake"
                                    className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-transparent pr-4 pl-2 py-2 text-sm font-semibold text-[--main_b] transition-colors duration-200 ease-in-out hover:bg-[--main_b] hover:text-white active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[--main_b]"
                                >
                                    <ChevronLeft className="h-5 w-5" />
                                    <span>Quay lại</span>
                                </Link>
                                <PancakeTagDropdown
                                    tags={pancakeTags}
                                    selectedTagIds={selectedTagIds}
                                    onTagChange={(tagId, checked) =>
                                        setSelectedTagIds((prev) =>
                                            checked ? [...prev, tagId] : prev.filter((id) => id !== tagId)
                                        )
                                    }
                                    pageId={pageConfig.id}
                                    accessToken={pageConfig.accessToken || token}
                                    onLoadTags={(tags) => setPancakeTags(tags)}
                                    style="left"
                                    trigger={
                                        <button className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 active:scale-95 cursor-pointer">
                                            {selectedTagIds.length > 0 ? (
                                                <span className="bg-green-500 text-white rounded-full px-2 py-0.5 text-xs">
                                                    {selectedTagIds.length}
                                                </span>
                                            ) : (
                                                <MessageSquare className="h-4 w-4 text-gray-500" />
                                            )}
                                            <span>Pancake Tags</span>
                                            <ChevronDown className="h-4 w-4 text-gray-500" />
                                        </button>
                                    }
                                />
                                <LabelDropdown
                                    labels={allLabels.filter(l => l.from !== 'pancake')}
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
                            </>
                        )}
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
                                    : pageConfig.platform === 'personal_zalo'
                                        ? 'Zalo Personal'
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
                {!hideSidebar && (
                <div className="w-full max-w-sm border-r border-gray-200 flex flex-col">
                    <ul className="flex-1 overflow-y-auto" ref={sidebarRef}>
                        {isLoadingLabelFilter && (
                            <li className="flex items-center justify-center p-4">
                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                                <span className="ml-2 text-sm text-gray-500">
                                    {isLoadingLabelFilter ? 'Đang tải hội thoại theo nhãn...' : 'Đang tải hội thoại theo thẻ...'}
                                </span>
                            </li>
                        )}
                        {(isLoadingTagFilter && !isLoadingLabelFilter) && (
                            <li className="flex items-center justify-center p-4">
                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                                <span className="ml-2 text-sm text-gray-500">Đang tải hội thoại theo thẻ...</span>
                            </li>
                        )}
                        {filteredSortedConversations.map((convo) => {
                            const idUserForAvatar = getConvoAvatarId(convo);
                            const avatarUrl = avatarUrlFor({ idpage: pageConfig.id, iduser: idUserForAvatar, token });
                            const customerName = getConvoDisplayName(convo);
                            const formattedDateTime = fmtDateTimeVN(convo.updated_at);

                            const conversationId = convo?.id;
                            // Labels hệ thống: từ Labelfb (customer[pageId]) + từ conversationleadstatuses (LEAD/NOT_LEAD)
                            const assignedLabels = conversationId ? getAssignedLabelsForConversation(conversationId) : [];
                            const leadStatus = conversationId ? conversationLeadStatuses[conversationId] : null;

                            const lastFromPage = isLastFromPage(convo);
                            const snippetPrefix = lastFromPage ? 'Bạn: ' : `${customerName}: `;
                            const unrepliedCount = lastFromPage ? 0 : 1;

                            // Hội thoại đã có nhân viên được phân công hay chưa (dùng cho icon trong danh sách)
                            const hasAssignedStaff =
                                conversationId &&
                                Array.isArray(conversationAssigneesMap[conversationId]) &&
                                conversationAssigneesMap[conversationId].length > 0;
                            
                            // ✅ Xác định loại conversation và icon tương ứng
                            const convoType = getConvoType(convo);
                            const isInboxType = isInbox(convo);
                            const isCommentType = isComment(convo);
                            const borderColor = isInboxType ? 'border-l-4 border-l-red-500' : isCommentType ? 'border-l-4 border-l-blue-500' : '';

                            return (
                                <li
                                    key={convo.id}
                                    onClick={() => handleSelectConvo(convo)}
                                    className={`flex items-start p-3 cursor-pointer hover:bg-gray-100 ${selectedConvo?.id === convo.id ? 'bg-blue-50' : ''} ${borderColor}`}
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
                                        <div className="flex items-center gap-2">
                                            <h6 className="font-semibold truncate text-gray-800">{customerName}</h6>
                                            {/* ✅ Icon hiển thị loại conversation */}
                                            {isInboxType && (
                                                <Inbox className="h-4 w-4 text-red-500 flex-shrink-0" title="Tin nhắn" />
                                            )}
                                            {isCommentType && (
                                                <MessageSquare className="h-4 w-4 text-blue-500 flex-shrink-0" title="Bình luận" />
                                            )}
                                            {/* ✅ Icon hiển thị hội thoại đã được phân công nhân viên */}
                                            {hasAssignedStaff && (
                                                <User
                                                    className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0"
                                                    title="Hội thoại đã được phân công nhân viên"
                                                />
                                            )}
                                        </div>
                                        <h6 className="text-sm text-gray-600 truncate">
                                            {snippetPrefix}
                                            {convo.snippet}
                                        </h6>

                                        {/* Hiển thị Pancake tags */}
                                        {Array.isArray(convo.pancakeTags) && convo.pancakeTags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {convo.pancakeTags.map((tag, idx) => {
                                                    const tagId = tag.tagId || tag.id || tag._id || idx;
                                                    const tagText = tag.text || tag.name || '';
                                                    const tagColor = tag.color || '#6b7280';
                                                    return (
                                                        <span
                                                            key={tagId}
                                                            className="rounded-full px-2 py-0.5 text-xs font-medium"
                                                            style={{
                                                                backgroundColor: tagColor,
                                                                color: 'white',
                                                            }}
                                                            title={tagText}
                                                        >
                                                            {tagText}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {/* Hiển thị labels (nếu có) - Manual labels: hình chữ nhật, có viền đen */}
                                        {assignedLabels.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1 items-center relative">
                                                {assignedLabels.map((label) => {
                                                    const isNotLeadLabel = label.name === 'NOT LEAD' || label.name === 'NOT_LEAD';
                                                    const leadStatus = conversationId ? conversationLeadStatuses[conversationId] : null;
                                                    const hasNote = isNotLeadLabel && leadStatus?.status === 'NOT_LEAD' && leadStatus?.note;
                                                    return (
                                                        <span
                                                            key={label._id}
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs border border-black relative"
                                                            style={{ backgroundColor: label.color, color: 'white' }}
                                                            title={hasNote ? `Lý do: ${leadStatus.note}` : label.name}
                                                        >
                                                            {label.name}
                                                            {hasNote && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setShowNoteTooltip(showNoteTooltip === conversationId ? null : conversationId);
                                                                    }}
                                                                    className="hover:bg-white/20 rounded p-0.5 flex items-center justify-center"
                                                                    title={`Lý do: ${leadStatus.note}`}
                                                                >
                                                                    <FileText className="h-3 w-3" />
                                                                </button>
                                                            )}
                                                        </span>
                                                    );
                                                })}
                                                {/* Tooltip hiển thị note trong sidebar */}
                                                {showNoteTooltip === conversationId && conversationLeadStatuses[conversationId]?.note && (
                                                    <div className="absolute z-50 bg-gray-900 text-white text-xs rounded-md p-2 max-w-xs mt-1 shadow-lg" style={{ top: '100%', left: 0 }}>
                                                        <div className="font-semibold mb-1">Lý do NOT LEAD:</div>
                                                        <div>{conversationLeadStatuses[conversationId].note}</div>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setShowNoteTooltip(null);
                                                            }}
                                                            className="absolute top-1 right-1 text-white hover:text-gray-300"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                )}
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
                )}

                {/* Panel chi tiết */}
                <div className="flex-1 flex flex-col bg-gray-50">
                    {selectedConvo ? (
                        <>
                            <div className="flex items-center p-3 border-b border-gray-200 bg-white justify-between">
                                <div className="flex items-center flex-1 min-w-0">
                                    <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center font-bold mr-3 flex-shrink-0">
                                        <FallbackAvatar
                                            src={avatarUrlFor({
                                                idpage: pageConfig.id,
                                                iduser: getConvoAvatarId(selectedConvo),
                                                token,
                                            })}
                                            alt={getConvoDisplayName(selectedConvo)}
                                            name={getConvoDisplayName(selectedConvo)}
                                            width={40}
                                            height={40}
                                            className="rounded-full object-cover"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-lg text-gray-900">
                                            {getConvoDisplayName(selectedConvo)}
                                        </h4>
                                        {/* Hiển thị Pancake tags trong chi tiết conversation */}
                                        {(() => {
                                            const rawTags = Array.isArray(selectedConvo.tags) ? selectedConvo.tags : [];
                                            const selectedConvoPancakeTags = rawTags
                                                .map((tagId) => {
                                                    const idStr = String(tagId);
                                                    return pancakeTags.find((t) => String(t.tagId) === idStr) || null;
                                                })
                                                .filter(Boolean);
                                            
                                            // Nếu đã có pancakeTags trong selectedConvo (đã được enrich), dùng luôn
                                            const tagsToDisplay = selectedConvo.pancakeTags && Array.isArray(selectedConvo.pancakeTags) && selectedConvo.pancakeTags.length > 0
                                                ? selectedConvo.pancakeTags
                                                : selectedConvoPancakeTags;
                                            
                                            if (tagsToDisplay.length === 0) return null;
                                            
                                            return (
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {tagsToDisplay.map((tag, idx) => {
                                                        const tagId = tag.tagId || tag.id || tag._id || idx;
                                                        const tagText = tag.text || tag.name || '';
                                                        const tagColor = tag.color || '#6b7280';
                                                        // Tìm labelId từ tagId để gọi handleToggleLabel
                                                        const labelId = allLabels.find(l => l.from === 'pancake' && String(l.tagId) === String(tagId))?._id 
                                                            || pancakeTags.find(t => String(t.tagId) === String(tagId))?._id
                                                            || tagId;
                                                        
                                                        return (
                                                            <span
                                                                key={tagId}
                                                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium group"
                                                                style={{
                                                                    backgroundColor: tagColor,
                                                                    color: 'white',
                                                                }}
                                                                title={tagText}
                                                            >
                                                                <span>{tagText}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation(); // Ngăn trigger onClick của parent
                                                                        handleToggleLabel(labelId, false); // Hủy thẻ
                                                                    }}
                                                                    className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 hover:bg-white/20 rounded-full p-0.5 flex items-center justify-center"
                                                                    title="Hủy thẻ"
                                                                >
                                                                    <X className="h-3 w-3" />
                                                                </button>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                        {/* Hiển thị manual labels trong chi tiết conversation */}
                                        {assignedLabelsForSelectedConvo.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1.5 relative">
                                                {assignedLabelsForSelectedConvo.map((label) => {
                                                    const selectedConvoId = selectedConvo?.id;
                                                    const isNotLeadLabel = label.name === 'NOT LEAD' || label.name === 'NOT_LEAD';
                                                    const leadStatus = selectedConvoId ? conversationLeadStatuses[selectedConvoId] : null;
                                                    const hasNote = isNotLeadLabel && leadStatus?.status === 'NOT_LEAD' && leadStatus?.note;
                                                    return (
                                                        <span
                                                            key={label._id}
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium group border border-black"
                                                            style={{
                                                                backgroundColor: label.color,
                                                                color: 'white',
                                                            }}
                                                            title={hasNote ? `Lý do: ${leadStatus.note}` : label.name}
                                                        >
                                                            <span>{label.name}</span>
                                                            {hasNote && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setShowNoteTooltip(showNoteTooltip === selectedConvoId ? null : selectedConvoId);
                                                                    }}
                                                                    className="hover:bg-white/20 rounded p-0.5 flex items-center justify-center"
                                                                    title={`Lý do: ${leadStatus.note}`}
                                                                >
                                                                    <FileText className="h-3 w-3" />
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleToggleLabel(label._id, false);
                                                                }}
                                                                className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 hover:bg-white/20 p-0.5 flex items-center justify-center"
                                                                title="Hủy nhãn"
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        </span>
                                                    );
                                                })}
                                                {/* Tooltip hiển thị note trong chi tiết */}
                                                {showNoteTooltip === selectedConvo?.id && conversationLeadStatuses[selectedConvo?.id]?.note && (
                                                    <div className="absolute z-50 bg-gray-900 text-white text-xs rounded-md p-2 max-w-xs mt-1 shadow-lg">
                                                        <div className="font-semibold mb-1">Lý do NOT LEAD:</div>
                                                        <div>{conversationLeadStatuses[selectedConvo.id].note}</div>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setShowNoteTooltip(null);
                                                            }}
                                                            className="absolute top-1 right-1 text-white hover:text-gray-300"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-shrink-0 ml-3 flex items-center gap-2">
                                    {/* Icon Phân công nhân viên */}
                                    {selectedConvo?.id && (
                                        <div className="relative" ref={assigneesPopupRef}>
                                            <button
                                                data-assignees-icon
                                                type="button"
                                                onClick={handleShowAssignees}
                                                className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-200 bg-transparent hover:bg-gray-100 active:scale-95 cursor-pointer transition-colors"
                                                title="Phân công nhân viên"
                                            >
                                                <User className="h-4 w-4 text-gray-600" />
                                            </button>

                                            {/* Popup hiển thị danh sách nhân viên được phân công */}
                                            {showAssigneesPopup && (
                                                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                                                    <div className="p-3 border-b border-gray-200">
                                                        <h3 className="font-semibold text-sm text-gray-900">Phân công nhân viên</h3>
                                                    </div>
                                                    <div className="max-h-64 overflow-y-auto">
                                                        {isLoadingAssignees ? (
                                                            <div className="p-4 flex items-center justify-center">
                                                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                                                                <span className="ml-2 text-sm text-gray-500">Đang tải...</span>
                                                            </div>
                                                        ) : assigneesData.length > 0 ? (
                                                            <div className="p-2">
                                                                {assigneesData.map((user, idx) => (
                                                                    <div
                                                                        key={user.user_id || idx}
                                                                        className="flex items-center gap-2 p-2 rounded hover:bg-gray-50"
                                                                    >
                                                                        <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                                                            <User className="h-4 w-4 text-gray-600" />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="text-sm font-medium text-gray-900 truncate">
                                                                                {user.name || 'Không tên'}
                                                                            </div>
                                                                            {user.phone_number && (
                                                                                <div className="text-xs text-gray-500 truncate">
                                                                                    {user.phone_number}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="p-4 text-center text-sm text-gray-500">
                                                                Chưa có nhân viên được phân công
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {selectedConvo?.id ? (
                                        <LabelDropdown
                                            labels={allLabels}
                                            selectedLabelIds={(allLabels || [])
                                                .filter((l) => {
                                                    const customerData = l.customer || {};
                                                    const pageData = customerData[pageConfig.id];
                                                    if (pageData && Array.isArray(pageData.IDconversation)) {
                                                        return pageData.IDconversation.includes(selectedConvo.id);
                                                    }
                                                    return false;
                                                })
                                                .map((l) => l._id)}
                                            style="right"
                                            onLabelChange={handleToggleLabel}
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
                                {/* ✅ Hiển thị post info cho COMMENT conversations */}
                                {!isLoadingMessages && selectedConvo?.type === 'COMMENT' && postInfo && (
                                    <div className="mb-4 p-4 bg-white rounded-lg border-2 border-blue-200 shadow-sm">
                                        <div className="flex items-center gap-2 mb-2">
                                            <MessageSquare className="h-5 w-5 text-blue-500" />
                                            <h5 className="font-semibold text-gray-800">Bài viết gốc</h5>
                                        </div>
                                        {postInfo.message && (
                                            <p className="text-gray-700 mb-3 whitespace-pre-wrap">{postInfo.message}</p>
                                        )}
                                        {postInfo.images && postInfo.images.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {postInfo.images.map((img, idx) => (
                                                    <a
                                                        key={idx}
                                                        href={img.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="block"
                                                    >
                                                        <img
                                                            src={img.url}
                                                            alt={`Post image ${idx + 1}`}
                                                            className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
                                                            loading="lazy"
                                                        />
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                        {postInfo.postUrl && (
                                            <a
                                                href={postInfo.postUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                                            >
                                                Xem bài viết trên Facebook
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                            </a>
                                        )}
                                    </div>
                                )}
                                
                                {/* Loading more indicator at top - giống testpancake */}
                                {isLoadingOlder && (
                                    <div className="flex items-center justify-center py-2 mb-2">
                                        <div className="text-sm text-gray-500 flex items-center gap-2">
                                            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                                            Đang tải thêm tin nhắn...
                                        </div>
                                    </div>
                                )}
                                
                                {/* No more messages indicator */}
                                {!hasMore && messages.length > 0 && (
                                    <div className="flex items-center justify-center py-2 mb-2">
                                        <div className="text-xs text-gray-400">Đã hiển thị tất cả tin nhắn</div>
                                    </div>
                                )}

                                {isLoadingMessages && (
                                    <div className="text-center text-gray-500">Đang tải tin nhắn...</div>
                                )}

                                {messages.map((msg, index) => {
                                    if (!msg) return null;
                                    const formattedTime = fmtDateTimeVN(msg.inserted_at);
                                    const isComment = msg.channel === 'COMMENT';
                                    const isSystemMessage = msg.content?.type === 'system';
                                    
                                return isSystemMessage ? (
                                    <div key={msg.id || `msg-${index}`} className="flex items-center justify-center my-2">
                                        <div className="text-xs text-gray-500 italic bg-gray-100 px-3 py-1 rounded-full">
                                            <MessageContent
                                                content={msg.content}
                                                onVideoClick={setVideoPreview}
                                            />
                                        </div>
                                    </div>
                                    ) : (
                                        <div
                                            key={msg.id || `msg-${index}`}
                                            className={`flex flex-col my-1 ${msg.senderType === 'page' ? 'items-end' : 'items-start'
                                                }`}
                                        >
                                            {/* ✅ Icon và label cho COMMENT messages */}
                                            {isComment && (
                                                <div className="flex items-center gap-1 mb-1 text-xs text-blue-600">
                                                    <MessageSquare className="h-3 w-3" />
                                                    <span>Bình luận</span>
                                                    {msg.metadata?.author && (
                                                        <span className="text-gray-500">• {msg.metadata.author}</span>
                                                    )}
                                                </div>
                                            )}
                                            
                                            <div className={`flex flex-col ${msg.senderType === 'page' ? 'items-end' : 'items-start'}`}>
                                                <div
                                                    className={`max-w-lg p-3 rounded-xl shadow-sm flex flex-col ${
                                                        isComment
                                                            ? 'bg-blue-50 border-2 border-blue-300 text-gray-800'
                                                            : msg.senderType === 'page'
                                                                ? 'bg-blue-500 text-white items-end'
                                                                : 'bg-white text-gray-800'
                                                    }`}
                                                >
                                                <MessageContent content={msg.content} onVideoClick={setVideoPreview} isFromPage={msg.senderType === 'page'} />
                                                    <div
                                                        className={`text-xs mt-1 ${msg.senderType === 'page'
                                                            ? 'text-right text-blue-100/80'
                                                            : 'text-left text-gray-500'
                                                            }`}
                                                    >
                                                        {formattedTime}
                                                    </div>
                                                </div>
                                                {/* ✅ Hiển thị reactions ngay dưới tin nhắn, căn trái với message bubble */}
                                                {(() => {
                                                    const hasReactions = msg.content?.type === 'text' && 
                                                                        msg.content?.reactions && 
                                                                        Array.isArray(msg.content.reactions) && 
                                                                        msg.content.reactions.length > 0;
                                                    
                                                    // Debug log để kiểm tra
                                                    if (msg.content?.type === 'text') {
                                                        console.log('🎨 [Render] Message check:', {
                                                            id: msg.id,
                                                            content: msg.content.content,
                                                            hasReactions,
                                                            reactions: msg.content?.reactions,
                                                            reactionsType: typeof msg.content?.reactions,
                                                            reactionsIsArray: Array.isArray(msg.content?.reactions),
                                                            fullContent: msg.content
                                                        });
                                                    }
                                                    
                                                    return hasReactions ? (
                                                        <div 
                                                            className="flex flex-wrap gap-1 mt-1 pl-1"
                                                            style={{
                                                                minWidth: 'fit-content',
                                                                alignSelf: msg.senderType === 'page' ? 'flex-end' : 'flex-start'
                                                            }}
                                                        >
                                                            {msg.content.reactions.map((reaction, idx) => (
                                                                <span 
                                                                    key={idx} 
                                                                    className="inline-block"
                                                                    title={`Reaction: ${reaction}`}
                                                                    style={{ 
                                                                        fontSize: '18px',
                                                                        lineHeight: '1.2',
                                                                        display: 'inline-block'
                                                                    }}
                                                                >
                                                                    {reaction}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : null;
                                                })()}
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
                                {(pendingImages.length > 0 || pendingVideos.length > 0) && (
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
                                        {pendingVideos.map((video) => (
                                            <div key={video.localId} className="relative">
                                                <video
                                                    src={video.url}
                                                    muted
                                                    playsInline
                                                    preload="metadata"
                                                    className="h-20 w-20 rounded border object-cover bg-black"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removePendingVideo(video.localId)}
                                                    className="absolute -top-2 -right-2 bg-white border rounded-full p-0.5 shadow hover:bg-gray-50"
                                                    title="Xoá video"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2" >
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

                                    <button
                                        type="button"
                                        className="text-gray-700 hover:text-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
                                        onClick={triggerPickVideo}
                                        disabled={isUploadingVideo || selectedConvo?.type === 'COMMENT'}
                                        title={selectedConvo?.type === 'COMMENT' ? 'Bạn đang ở bình luận- không thể gửi bằng video' : 'Đính kèm video'}
                                    >
                                        <VideoIcon className="h-5 w-5" />
                                    </button>
                                    <input
                                        ref={videoInputRef}
                                        type="file"
                                        accept="video/*"
                                        className="hidden"
                                        onChange={onPickVideo}
                                    />

                                    <input
                                        name="message"
                                        placeholder={
                                            isUploadingImage || isUploadingVideo || pendingVideos.length > 0
                                                ? pendingVideos.length > 0 ? 'Upload video hãy nhấn nút gửi để gửi...' : 'Đang tải tệp...'
                                                : 'Nhập tin nhắn...'
                                        }
                                        className="flex-1 bg-transparent text-sm focus:outline-none disabled:opacity-60"
                                        autoComplete="off"
                                        disabled={isUploadingImage || isUploadingVideo || pendingVideos.length > 0}
                                    />

                                    <button
                                        type="submit"
                                        className={`disabled:opacity-60 ${
                                            isUploadingImage || isUploadingVideo || hasPendingUploads
                                                ? 'text-gray-400 cursor-not-allowed'
                                                : 'text-blue-500 hover:text-blue-700'
                                        }`}
                                        disabled={isUploadingImage || isUploadingVideo || hasPendingUploads}
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
            {videoPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/70"
                        onClick={() => setVideoPreview(null)}
                    />
                    <div className="relative z-10 w-full max-w-3xl px-4">
                        <div className="relative overflow-hidden rounded-2xl bg-black shadow-2xl">
                            <button
                                type="button"
                                className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                onClick={() => setVideoPreview(null)}
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <video
                                src={videoPreview.url}
                                controls
                                autoPlay
                                className="w-full max-h-[75vh] bg-black"
                            />
                            {videoPreview.name && (
                                <div className="px-4 py-3 text-sm text-white/90">
                                    {videoPreview.name}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal nhập lý do NOT LEAD */}
            {showLeadStatusModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold mb-4">Nhập lý do NOT LEAD</h3>
                        <textarea
                            value={leadStatusNote}
                            onChange={(e) => setLeadStatusNote(e.target.value)}
                            placeholder="Nhập lý do tại sao không phải LEAD..."
                            className="w-full border border-gray-300 rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={4}
                            autoFocus
                        />
                        <div className="flex gap-2 mt-4 justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowLeadStatusModal(false);
                                    setPendingLabelId(null);
                                    setPendingChecked(false);
                                    setLeadStatusNote('');
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmNotLead}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                            >
                                Xác nhận
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
