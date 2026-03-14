import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import TreatmentSession from '@/models/treatmentSession.model';
import ServiceDetail from '@/models/service_details.model';
import Service from '@/models/services.model';

export async function GET(request, context) {
    const { params } = context || {};
    const { customerId } = (await params) || {};

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
        return NextResponse.json({ success: false, error: 'customerId không hợp lệ.' }, { status: 400 });
    }

    try {
        await connectDB();

        const customerOid = new mongoose.Types.ObjectId(customerId);

        // Lấy thống kê session theo (serviceId, courseId, serviceDetailId) — mỗi ĐƠN một entry
        const sessions = await TreatmentSession.aggregate([
            { $match: { customerId: customerOid } },
            { $sort: { performedAt: 1 } },
            {
                $group: {
                    _id: {
                        serviceId: '$serviceId',
                        courseId: '$courseId',
                        serviceDetailId: { $ifNull: ['$serviceDetailId', null] },
                    },
                    firstTime: { $first: '$performedAt' },
                    lastTime: { $last: '$performedAt' },
                    total: { $sum: 1 },
                },
            },
        ]);

        // Nhóm theo serviceId; mỗi service có mảng "done" entries (mỗi entry = 1 đơn + 1 liệu trình)
        const byServiceId = new Map();
        for (const row of sessions) {
            const serviceIdStr = String(row._id.serviceId);
            const courseIdStr = String(row._id.courseId);
            const serviceDetailId = row._id.serviceDetailId
                ? String(row._id.serviceDetailId)
                : null;

            if (!byServiceId.has(serviceIdStr)) {
                byServiceId.set(serviceIdStr, []);
            }
            byServiceId.get(serviceIdStr).push({
                courseId: courseIdStr,
                firstTime: row.firstTime,
                lastTime: row.lastTime,
                total: row.total,
                serviceDetailId,
            });
        }

        // Gộp đơn có 0 session từ service_details (đơn mới chốt chưa thực hiện lần nào)
        const detailsWithCourse = await ServiceDetail.find({
            customerId: customerOid,
            'selectedCourse.name': { $exists: true, $ne: '' },
        })
            .select('_id serviceId selectedCourse')
            .lean();

        const detailServiceIds = [
            ...new Set(
                detailsWithCourse
                    .map((d) => (d.serviceId ? String(d.serviceId) : null))
                    .filter(Boolean)
            ),
        ];
        const servicesForDetail =
            detailServiceIds.length > 0
                ? await Service.find({ _id: { $in: detailServiceIds.map((id) => new mongoose.Types.ObjectId(id)) } })
                    .select('treatmentCourses')
                    .lean()
                : [];
        const serviceDocByStr = new Map();
        servicesForDetail.forEach((s) => serviceDocByStr.set(String(s._id), s));

        for (const detail of detailsWithCourse) {
            const serviceIdStr = detail.serviceId ? String(detail.serviceId) : null;
            const courseName = detail.selectedCourse?.name;
            if (!serviceIdStr || !courseName) continue;

            const serviceDetailIdStr = String(detail._id);
            const existing = byServiceId.get(serviceIdStr) || [];
            const alreadyHas = existing.some(
                (e) => e.serviceDetailId === serviceDetailIdStr
            );
            if (alreadyHas) continue;

            const serviceDoc = serviceDocByStr.get(serviceIdStr);
            const matched = serviceDoc?.treatmentCourses?.find(
                (c) => (c?.name || '') === courseName
            );
            const courseIdStr = matched?._id ? String(matched._id) : null;
            if (!courseIdStr) continue;

            if (!byServiceId.has(serviceIdStr)) {
                byServiceId.set(serviceIdStr, []);
            }
            byServiceId.get(serviceIdStr).push({
                courseId: courseIdStr,
                firstTime: null,
                lastTime: null,
                total: 0,
                serviceDetailId: serviceDetailIdStr,
            });
        }

        const uniqueServiceIds = Array.from(byServiceId.keys()).map((id) => new mongoose.Types.ObjectId(id));
        const services = await Service.find({ _id: { $in: uniqueServiceIds } })
            .select('name treatmentCourses')
            .lean();

        const serviceMap = new Map();
        services.forEach((s) => serviceMap.set(String(s._id), s));

        const result = [];

        for (const [serviceIdStr, doneEntries] of byServiceId) {
            const serviceDoc = serviceMap.get(serviceIdStr);
            if (!serviceDoc) continue;

            const treatmentCourses = Array.isArray(serviceDoc.treatmentCourses) ? serviceDoc.treatmentCourses : [];
            const courseNameById = new Map();
            treatmentCourses.forEach((c) => {
                if (c._id) courseNameById.set(String(c._id), c.name || 'Liệu trình');
            });

            const courses = [];
            // Mỗi đơn (serviceDetailId) + liệu trình (courseId) = 1 entry "done"
            for (const entry of doneEntries) {
                const courseName = courseNameById.get(entry.courseId) || 'Liệu trình';
                courses.push({
                    courseId: entry.courseId,
                    courseName,
                    status: 'done',
                    firstTime: entry.firstTime,
                    lastTime: entry.lastTime,
                    total: entry.total,
                    serviceDetailId: entry.serviceDetailId,
                });
            }
            // Liệu trình chưa làm: course có trong treatmentCourses nhưng chưa có trong doneEntries (theo courseId)
            const doneCourseIds = new Set(doneEntries.map((e) => e.courseId));
            for (const course of treatmentCourses) {
                const courseIdStr = String(course._id);
                if (doneCourseIds.has(courseIdStr)) continue;
                courses.push({
                    courseId: courseIdStr,
                    courseName: course.name || 'Liệu trình',
                    status: 'not_done',
                    firstTime: null,
                    lastTime: null,
                    total: 0,
                });
            }

            result.push({
                serviceId: serviceIdStr,
                serviceName: serviceDoc.name || 'Không rõ dịch vụ',
                courses,
            });
        }

        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        console.error('[GET /api/treatment-sessions/summary/[customerId]] error:', error);
        return NextResponse.json(
            { success: false, error: 'Lỗi server khi lấy lịch sử liệu trình.' },
            { status: 500 }
        );
    }
}

