import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import TreatmentSession from '@/models/treatmentSession.model';
import ServiceDetail from '@/models/service_details.model';
import Service from '@/models/services.model';

const isValidObjectId = (id) => {
    if (!id) return false;
    return mongoose.Types.ObjectId.isValid(String(id));
};

async function ensureDB() {
    await connectDB();
}

async function buildDoseContext(serviceDetailIdRaw) {
    if (!isValidObjectId(serviceDetailIdRaw)) {
        throw new Error('serviceDetailId không hợp lệ.');
    }
    const serviceDetailId = new mongoose.Types.ObjectId(serviceDetailIdRaw);

    await ensureDB();

    const detail = await ServiceDetail.findById(serviceDetailId)
        .select('customerId serviceId selectedCourse')
        .lean();

    if (!detail) {
        throw new Error('Không tìm thấy đơn dịch vụ.');
    }

    const { customerId, serviceId, selectedCourse } = detail;
    const courseName = selectedCourse?.name || '';
    const medicationUnit = selectedCourse?.medicationUnit || '';

    // Tổng liều lượng thuốc của đơn (lưu trong selectedCourse.medicationDosage – ưu tiên số)
    let totalDose = null;
    if (selectedCourse?.medicationDosage) {
        const parsed = parseFloat(String(selectedCourse.medicationDosage).replace(/[^\d.,-]/g, '').replace(',', '.'));
        if (!Number.isNaN(parsed) && parsed > 0) {
            totalDose = parsed;
        }
    }

    // Tìm courseId tương ứng trong service.treatmentCourses (nếu có)
    let courseId = null;
    if (serviceId && courseName) {
        const serviceDoc = await Service.findById(serviceId)
            .select('treatmentCourses')
            .lean();
        const matchedCourse =
            serviceDoc?.treatmentCourses?.find((c) => c?.name === courseName) || null;
        if (matchedCourse?._id) {
            courseId = matchedCourse._id;
        }
    }

    // Lấy các session đã tạo cho đơn này để tính lần sử dụng + liều đã dùng
    const sessionQuery = { serviceDetailId };
    if (courseId) {
        sessionQuery.courseId = courseId;
    }
    const sessions = await TreatmentSession.find(sessionQuery)
        .select('usageIndex medicationDose medicationUnit startDate endDate performedAt createdAt')
        .sort({ usageIndex: 1, performedAt: 1, createdAt: 1 })
        .lean();

    const usedDose = sessions.reduce(
        (sum, s) => sum + (Number(s.medicationDose || 0) || 0),
        0
    );
    const nextUsageIndex =
        sessions.length > 0
            ? Math.max(...sessions.map((s) => Number(s.usageIndex || 1))) + 1
            : 1;

    const remainingDose =
        typeof totalDose === 'number' ? Math.max(0, totalDose - usedDose) : null;

    return {
        customerId: detail.customerId,
        serviceId: detail.serviceId,
        serviceDetailId,
        courseId,
        courseName,
        medicationUnit,
        totalDose,
        usedDose,
        remainingDose,
        nextUsageIndex,
        sessions,
    };
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const serviceDetailId = searchParams.get('serviceDetailId');

        if (!serviceDetailId) {
            return NextResponse.json(
                { success: false, error: 'Thiếu serviceDetailId.' },
                { status: 400 }
            );
        }

        const context = await buildDoseContext(serviceDetailId);

        return NextResponse.json({ success: true, data: context });
    } catch (error) {
        console.error(
            '[GET /api/treatment-sessions/usage] error:',
            error?.message || error
        );
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi server.' },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { serviceDetailId, medicationDose, startDate, endDate } = body || {};

        if (!serviceDetailId) {
            return NextResponse.json(
                { success: false, error: 'Thiếu serviceDetailId.' },
                { status: 400 }
            );
        }

        const doseNumber = Number(medicationDose);
        if (!Number.isFinite(doseNumber) || doseNumber <= 0) {
            return NextResponse.json(
                { success: false, error: 'Liều lượng thuốc phải lớn hơn 0.' },
                { status: 400 }
            );
        }

        const context = await buildDoseContext(serviceDetailId);
        const {
            customerId,
            serviceId,
            courseId,
            totalDose,
            usedDose,
            nextUsageIndex,
            medicationUnit,
        } = context;

        if (!courseId) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        'Không tìm thấy liệu trình tương ứng trong dịch vụ. Vui lòng kiểm tra cấu hình dịch vụ.',
                },
                { status: 400 }
            );
        }

        // Nếu đơn có tổng liều, kiểm tra không cho vượt quá
        if (typeof totalDose === 'number') {
            const newUsed = usedDose + doseNumber;
            if (newUsed - totalDose > 1e-6) {
                const remaining = Math.max(0, totalDose - usedDose);
                return NextResponse.json(
                    {
                        success: false,
                        error: `Tổng liều dùng (${newUsed}) vượt quá liều của đơn (${totalDose}). Liều còn lại tối đa là ${remaining}.`,
                        meta: {
                            totalDose,
                            usedDose,
                            remainingDose: remaining,
                        },
                    },
                    { status: 400 }
                );
            }
        }

        await ensureDB();

        const now = new Date();
        const start = startDate ? new Date(startDate) : now;
        const end = endDate ? new Date(endDate) : now;

        const sessionDoc = await TreatmentSession.create({
            customerId,
            serviceId,
            courseId,
            serviceDetailId,
            usageIndex: nextUsageIndex,
            medicationDose: doseNumber,
            medicationUnit: medicationUnit || body.medicationUnit || '',
            startDate: start,
            endDate: end,
            performedAt: start,
        });

        const updatedContext = await buildDoseContext(serviceDetailId);

        return NextResponse.json({
            success: true,
            data: {
                sessionId: sessionDoc._id,
                ...updatedContext,
            },
        });
    } catch (error) {
        console.error(
            '[POST /api/treatment-sessions/usage] error:',
            error?.message || error
        );
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi server.' },
            { status: 500 }
        );
    }
}

