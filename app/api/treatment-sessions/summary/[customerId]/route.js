import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import TreatmentSession from '@/models/treatmentSession.model';
import Service from '@/models/services.model';

export async function GET(request, context) {
    const { params } = context || {};
    const { customerId } = (await params) || {};

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
        return NextResponse.json({ success: false, error: 'customerId không hợp lệ.' }, { status: 400 });
    }

    try {
        await connectDB();

        // Lấy toàn bộ thống kê session theo serviceId + courseId của khách hàng
        const sessions = await TreatmentSession.aggregate([
            {
                $match: {
                    customerId: new mongoose.Types.ObjectId(customerId),
                },
            },
            // Sắp xếp theo thời gian để lấy đúng serviceDetailId cuối cùng
            {
                $sort: {
                    performedAt: 1,
                },
            },
            {
                $group: {
                    _id: {
                        serviceId: '$serviceId',
                        courseId: '$courseId',
                    },
                    firstTime: { $first: '$performedAt' },
                    lastTime: { $last: '$performedAt' },
                    total: { $sum: 1 },
                    lastServiceDetailId: { $last: '$serviceDetailId' },
                },
            },
        ]);

        // Build map để tra cứu nhanh theo serviceId + courseId
        const statsByServiceAndCourse = {};
        for (const row of sessions) {
            const serviceId = String(row._id.serviceId);
            const courseId = String(row._id.courseId);
            if (!statsByServiceAndCourse[serviceId]) {
                statsByServiceAndCourse[serviceId] = {};
            }
            statsByServiceAndCourse[serviceId][courseId] = {
                firstTime: row.firstTime,
                lastTime: row.lastTime,
                total: row.total,
                serviceDetailId: row.lastServiceDetailId || null,
            };
        }

        // Lấy danh sách services mà khách đã có session
        const uniqueServiceIds = Object.keys(statsByServiceAndCourse).map((id) => new mongoose.Types.ObjectId(id));

        const services = await Service.find({ _id: { $in: uniqueServiceIds } })
            .select('name treatmentCourses')
            .lean();

        // Map serviceId -> service document
        const serviceMap = new Map();
        services.forEach((s) => {
            serviceMap.set(String(s._id), s);
        });

        // Tạo dữ liệu trả về cho frontend: mỗi service gồm toàn bộ course (đã làm / chưa làm)
        const result = [];

        for (const [serviceIdStr, perCourse] of Object.entries(statsByServiceAndCourse)) {
            const serviceDoc = serviceMap.get(serviceIdStr);
            if (!serviceDoc) continue;

            const serviceItem = {
                serviceId: serviceIdStr,
                serviceName: serviceDoc.name || 'Không rõ dịch vụ',
                courses: [],
            };

            const courses = Array.isArray(serviceDoc.treatmentCourses) ? serviceDoc.treatmentCourses : [];

            for (const course of courses) {
                const courseIdStr = String(course._id);
                const stats = perCourse[courseIdStr];

                if (stats) {
                    serviceItem.courses.push({
                        courseId: courseIdStr,
                        courseName: course.name || 'Liệu trình',
                        status: 'done',
                        firstTime: stats.firstTime,
                        lastTime: stats.lastTime,
                        total: stats.total,
                        serviceDetailId: stats.serviceDetailId ? String(stats.serviceDetailId) : null,
                    });
                } else {
                    serviceItem.courses.push({
                        courseId: courseIdStr,
                        courseName: course.name || 'Liệu trình',
                        status: 'not_done',
                        firstTime: null,
                        lastTime: null,
                        total: 0,
                    });
                }
            }

            result.push(serviceItem);
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

