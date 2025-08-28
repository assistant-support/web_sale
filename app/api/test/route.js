// app/api/verify-student-courses/route.js
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import PostStudent from '@/models/student'; // điều chỉnh đường dẫn nếu khác
import PostCourse from '@/models/course';   // điều chỉnh đường dẫn nếu khác

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
    await connectDB();

    let body = {};
    try { body = await req.json(); } catch (_) { }

    try {
        // 1) Lấy danh sách học sinh cần xử lý
        const students = body && body._id
            ? await PostStudent.findById(body._id).select('_id ID Course').lean()
            : await PostStudent.find({}).select('_id ID Course').lean();

        if (!students || (Array.isArray(students) && students.length === 0)) {
            return NextResponse.json({ ok: true, processed: 0, updated: 0, results: [] }, { status: 200 });
        }

        const list = Array.isArray(students) ? students : [students];

        const results = [];
        let updatedCount = 0;

        // 2) Duyệt từng học sinh
        for (const s of list) {
            const studentID = s?.ID;
            if (!studentID) {
                results.push({
                    studentMongoId: String(s._id),
                    studentID: '',
                    matchedCourses: 0,
                    existingCourses: s.Course?.length ?? 0,
                    added: 0,
                    statusChanged: 0,
                    updated: false,
                    skippedReason: 'Missing student.ID',
                });
                continue;
            }

            // 3) Tìm các course có Student[].ID == student.ID
            const courses = await PostCourse.find(
                { 'Student.ID': studentID },
                { _id: 1, Status: 1 }
            ).lean();

            // Map courseId -> status mong muốn (2 nếu course.Status=true, ngược lại 0)
            const desiredStatusByCourseId = new Map();
            for (const c of courses) {
                desiredStatusByCourseId.set(String(c._id), c.Status ? 2 : 0);
            }

            // Map courseId -> entry hiện có trong student.Course
            const existingByCourseId = new Map();
            for (const entry of s.Course || []) {
                if (entry && entry.course) {
                    existingByCourseId.set(String(entry.course), entry);
                }
            }

            const newCourseArray = [];
            let added = 0;
            let statusChanged = 0;

            // 4) Giữ lại entry đang có (và chỉnh status nếu cần)
            for (const [courseId, entry] of existingByCourseId.entries()) {
                const desired = desiredStatusByCourseId.get(courseId);
                if (typeof desired === 'number' && entry.status !== desired) {
                    entry.status = desired;
                    statusChanged++;
                }

                newCourseArray.push({
                    course: entry.course, // giữ nguyên ObjectId
                    tuition: entry.tuition ?? null,
                    status: typeof entry.status === 'number' ? entry.status : 0,
                });
            }

            // 5) Thêm những course còn thiếu
            for (const [courseId, desired] of desiredStatusByCourseId.entries()) {
                if (!existingByCourseId.has(courseId)) {
                    newCourseArray.push({
                        course: new mongoose.Types.ObjectId(courseId),
                        tuition: null,
                        status: desired,
                    });
                    added++;
                }
            }

            const changed = added > 0 || statusChanged > 0;
            if (changed) {
                // Chỉ cập nhật field Course
                await PostStudent.updateOne(
                    { _id: s._id },
                    { $set: { Course: newCourseArray } }
                );
                updatedCount++;
            }

            results.push({
                studentMongoId: String(s._id),
                studentID,
                matchedCourses: courses.length,
                existingCourses: s.Course?.length ?? 0,
                added,
                statusChanged,
                updated: changed,
            });
        }

        return NextResponse.json(
            { ok: true, processed: list.length, updated: updatedCount, results },
            { status: 200 }
        );
    } catch (err) {
        console.error(err);
        return NextResponse.json(
            { ok: false, error: err?.message ?? 'Unknown error' },
            { status: 500 }
        );
    }
}
