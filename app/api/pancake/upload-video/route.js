import { NextResponse } from 'next/server';

// Cấu hình route để xử lý file lớn
export const maxDuration = 300; // 5 phút timeout
export const runtime = 'nodejs';

// Giới hạn kích thước video: 50MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const pageId = formData.get('pageId');
        const accessToken = formData.get('accessToken');

        // Validation
        if (!file) {
            return NextResponse.json(
                { success: false, error: 'Không có file được tải lên' },
                { status: 400 }
            );
        }

        if (!pageId || !accessToken) {
            return NextResponse.json(
                { success: false, error: 'Thiếu thông tin xác thực' },
                { status: 400 }
            );
        }

        // Kiểm tra kích thước file
        if (file.size > MAX_VIDEO_SIZE) {
            const sizeInMB = (file.size / 1024 / 1024).toFixed(2);
            return NextResponse.json(
                { 
                    success: false, 
                    error: `Video nặng ${sizeInMB} MB, không thể tải lên qua hệ thống. Vui lòng chọn video nhỏ hơn 50MB.` 
                },
                { status: 413 }
            );
        }

        // Kiểm tra loại file
        if (!file.type?.startsWith('video/')) {
            return NextResponse.json(
                { success: false, error: 'File không phải là video hợp lệ' },
                { status: 400 }
            );
        }

        // Upload lên pancake.vn
        const uploadForm = new FormData();
        uploadForm.append('file', file, file.name || `video_${Date.now()}.mp4`);

        const uploadUrl = `https://pancake.vn/api/v1/pages/${pageId}/contents?access_token=${accessToken}`;

        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: uploadForm,
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            
            // Xử lý lỗi 413 từ pancake.vn
            if (response.status === 413) {
                const sizeInMB = (file.size / 1024 / 1024).toFixed(2);
                return NextResponse.json(
                    { 
                        success: false, 
                        error: `Video nặng ${sizeInMB} MB, không thể tải lên qua hệ thống. Vui lòng chọn video nhỏ hơn.` 
                    },
                    { status: 413 }
                );
            }

            return NextResponse.json(
                { 
                    success: false, 
                    error: text || `Upload thất bại với mã lỗi ${response.status}` 
                },
                { status: response.status }
            );
        }

        const data = await response.json().catch(() => null);

        if (!data?.content_id || !data?.id || !data?.content_url) {
            return NextResponse.json(
                { success: false, error: 'Phản hồi từ server không hợp lệ' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            contentId: data.content_id,
            attachmentId: data.id,
            url: data.content_url,
            previewUrl: data.content_preview_url || data.content_url,
            thumbnailUrl: data.image_data?.thumbnail_url || null,
            mimeType: data.mime_type || file.type || 'video/mp4',
            name: data.name || file.name || 'video.mp4',
            size: file.size,
            width: data.image_data?.width || null,
            height: data.image_data?.height || null,
            length: data.video_data?.length || null,
        });
    } catch (error) {
        console.error('[upload-video API] error:', error);
        return NextResponse.json(
            { 
                success: false, 
                error: error?.message || 'Có lỗi xảy ra khi tải video lên' 
            },
            { status: 500 }
        );
    }
}

