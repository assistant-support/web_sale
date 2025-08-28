// app/api/session/[id]/route.js
import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import connect from '@/config/connectDB'
import Course from '@/models/course'
import Trial from '@/models/coursetry'
import Book from '@/models/book'
import Student from '@/models/student'
import User from '@/models/users'
import Area from '@/models/area'

const isId = v => Types.ObjectId.isValid(v)

/* ───────── helpers ───────── */
const topicById = async tid =>
    Book.findOne({ 'Topics._id': tid }, { 'Topics.$': 1 })
        .lean()
        .then(b => b?.Topics?.[0] || null)

const roomName = async rid =>
    Area.aggregate([
        { $unwind: '$rooms' },
        { $match: { 'rooms._id': rid } },
        { $replaceRoot: { newRoot: '$rooms' } },
        { $limit: 1 }
    ]).then(r => r[0]?.name || rid)

const buildStudents = (raw, mapById, lessonId) =>
    raw.map(st => {
        console.log(st);

        const info = mapById.get(st.studentId || st.ID) || {}
        const a = st.attendance || st
        return {
            _id: info._id ?? null,
            ID: info.ID ?? st.studentId ?? '–––',
            Name: info.Name ?? 'Không tên',
            Avt: info.Avt ?? null,
            attendance: {
                Checkin: a.Checkin ?? (st.checkin ? 1 : 0),
                Cmt: a.Cmt ?? a.cmt ?? [],
                CmtFn: a.CmtFn ?? st.cmtFn ?? '',
                Note: a.Note ?? st.note ?? '',
                Lesson: lessonId,
                Image: a.Image ?? st.images ?? []
            }
        }
    })

export async function GET(_req, { params }) {
    const { id } = params
    if (!isId(id))
        return NextResponse.json({ success: false, message: 'ID không hợp lệ' }, { status: 400 })

    try {
        await connect()
        const c = await Course.findOne(
            { 'Detail._id': id },
            { ID: 1, Version: 1, Area: 1, Student: 1, Detail: { $elemMatch: { _id: id } } }
        ).lean()
        if (c) {
            const ses = c.Detail[0]

            const [topic, teachers, studs, room] = await Promise.all([
                topicById(ses.Topic),
                User.find({ _id: { $in: [ses.Teacher, ses.TeachingAs].filter(Boolean) } })
                    .select('name')
                    .lean(),
                Student.find({ ID: { $in: c.Student.map(s => s.ID) } })
                    .select('ID Name Avt')
                    .lean(),
                roomName(ses.Room)
            ])

            const uMap = new Map(teachers.map(u => [u._id.toString(), u]))
            const sMap = new Map(studs.map(s => [s.ID, s]))

            const students = buildStudents(
                c.Student.flatMap(s => {
                    const attendance = s.Learn.find(lr => lr.Lesson.toString() === id);
                    return attendance ? [{ ...s, attendance }] : [];
                }),
                sMap,
                id
            );
            return NextResponse.json({
                success: true,
                data: {
                    course: { _id: c._id, ID: c.ID, Version: c.Version },
                    session: {
                        _id: ses._id,
                        Topic: topic,
                        Day: ses.Day,
                        Room: room,
                        Time: ses.Time,
                        Teacher: uMap.get(String(ses.Teacher)) || null,
                        TeachingAs: uMap.get(String(ses.TeachingAs)) || null,
                        Image: ses.Image,
                        DetailImage: ses.DetailImage
                    },
                    students
                }
            })
        }

        /* ───── Khóa học thử ───── */
        const t = await Trial.findOne(
            { 'sessions._id': id },
            { name: 1, sessions: { $elemMatch: { _id: id } } }
        ).lean()

        if (!t)
            return NextResponse.json({ success: false, message: 'Không tìm thấy buổi học.' }, { status: 404 })

        const s = t.sessions[0]

        const [topic2, teachers2, studs2, room2] = await Promise.all([
            topicById(s.topicId),
            User.find({ _id: { $in: [s.teacher, s.teachingAs].filter(Boolean) } })
                .select('name')
                .lean(),
            Student.find({
                $or: [
                    { _id: { $in: s.students.filter(x => isId(x.studentId)).map(x => x.studentId) } },
                    { ID: { $in: s.students.map(x => x.studentId) } }
                ]
            }).select('ID Name Avt').lean(),
            roomName(s.room)
        ])

        const uMap2 = new Map(teachers2.map(u => [u._id.toString(), u]))
        const sMap2 = new Map([
            ...studs2.map(st => [st._id?.toString() || st.ID, st]),
            ...studs2.map(st => [st.ID, st])
        ])

        const students2 = buildStudents(s.students, sMap2, id)

        return NextResponse.json({
            success: true,
            data: {
                course: { _id: t._id, ID: 'trycourse', Version: 1, type: 'trial' },
                session: {
                    _id: s._id,
                    Topic: topic2,
                    Day: s.day,
                    Room: room2,
                    Time: s.time,
                    Teacher: uMap2.get(String(s.teacher)) || null,
                    TeachingAs: uMap2.get(String(s.teachingAs)) || null,
                    Image: s.folderId,
                    DetailImage: s.images
                },
                students: students2
            }
        })
    } catch (err) {
        console.error('[SESSION_GET]', err)
        return NextResponse.json(
            { success: false, message: 'Đã xảy ra lỗi máy chủ.' },
            { status: 500 }
        )
    }
}
