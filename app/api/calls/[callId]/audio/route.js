import connectDB from '@/config/connectDB';
import checkAuthToken from '@/utils/checktoken';
import getDriveClient from '@/function/drive/index';
import Call from '@/models/call.model';
import '@/models/customer.model';
import '@/models/users';

export async function GET(req, { params }) {
    try {
        const { callId } = params || {};
        if (!callId) return new Response('Missing callId', { status: 400 });

        // 1) Auth
        const session = await checkAuthToken();
        if (!session?.id) return new Response('Unauthorized', { status: 401 });

        await connectDB();

        // 2) Tìm Call và kiểm tra quyền
        const call = await Call.findById(callId).populate({ path: 'user', select: 'name role' }).lean();
        if (!call) return new Response('Not found', { status: 404 });

        const isAdmin = Array.isArray(session.role) ? session.role.includes('Admin') :
            Array.isArray(call?.user?.role) ? call.user.role.includes('Admin') : false;
        const isOwner = String(call.user?._id || call.user) === String(session.id);

        if (!isAdmin && !isOwner) {
            return new Response('Forbidden', { status: 403 });
        }

        const fileId = call.file;
        if (!fileId) return new Response('No recording', { status: 404 });

        const drive = await getDriveClient();

        // 3) Lấy metadata để biết mimeType/size
        const metaRes = await drive.files.get({
            fileId,
            fields: 'name, mimeType, size',
        });
        const name = metaRes?.data?.name || `recording-${fileId}.webm`;
        const mime = metaRes?.data?.mimeType || 'audio/webm';
        const size = Number(metaRes?.data?.size || 0);

        // 4) Hỗ trợ Range để tua
        const range = req.headers.get('range'); // e.g. "bytes=0-"
        let status = 200;
        let headers = {
            'Content-Type': mime,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=0, no-store',
            'Content-Disposition': `inline; filename="${encodeURIComponent(name)}"`,
        };

        let driveGetOpts = { fileId, alt: 'media' };
        let driveReqOpts = { responseType: 'stream' };

        if (range && size > 0) {
            // parse "bytes=start-end"
            const m = range.match(/bytes=(\d*)-(\d*)/);
            const start = m && m[1] ? parseInt(m[1], 10) : 0;
            const end = m && m[2] ? parseInt(m[2], 10) : Math.min(start + 1024 * 1024 - 1, size - 1); // ~1MB chunk
            const chunkSize = (end - start) + 1;

            driveReqOpts.headers = { Range: `bytes=${start}-${end}` };
            status = 206;
            headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
            headers['Content-Length'] = String(chunkSize);
        } else if (size > 0) {
            headers['Content-Length'] = String(size);
        }

        // 5) Lấy stream nội dung
        const fileRes = await drive.files.get(driveGetOpts, driveReqOpts);
        const stream = fileRes.data; // Node stream

        return new Response(stream, { status, headers });
    } catch (err) {
        console.error('STREAM AUDIO ERROR:', err);
        return new Response('Server error', { status: 500 });
    }
}
