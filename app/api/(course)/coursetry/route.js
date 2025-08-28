import { google } from 'googleapis'
import { Types } from 'mongoose'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import dbConnect from '@/config/connectDB'
import TrialCourse from '@/models/coursetry'
import PostStudent from '@/models/student'
import Area from '@/models/area'
import jsonRes from '@/utils/response'
import '@/models/users'
import '@/models/book'

const TRIAL_ID = new Types.ObjectId('6871bc14ada3650715efc786')
const PARENT_ID = '1Ri-Cl-R7Exl7vP6Qy8tDHtoiSqMXVmhf'
const TAG = 'data_coursetry'
const driveScopes = ['https://www.googleapis.com/auth/drive']

async function getDrive() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        },
        projectId: process.env.GOOGLE_PROJECT_ID,
        scopes: driveScopes
    })
    return google.drive({ version: 'v3', auth })
}

async function createUniqueFolder(name) {
    const drive = await getDrive()
    const { data } = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and trashed=false and '${PARENT_ID}' in parents and name contains '${name}'`,
        fields: 'files(id,name)'
    })
    const dupCount = data.files?.length ?? 0
    const finalName = dupCount ? `${name}-${dupCount}` : name
    const res = await drive.files.create({
        requestBody: {
            name: finalName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [PARENT_ID]
        },
        fields: 'id'
    })
    return res.data.id
}

export async function GET() {
    try {
        await dbConnect()

        const course = await TrialCourse.findById(TRIAL_ID)
            .populate('sessions.teacher', 'name phone')
            .populate('sessions.teachingAs', 'name phone')
            .populate('sessions.book', 'Name Topics')
            .lean()

        if (!course) return jsonRes(404, { status: false, mes: 'Trial course không tồn tại', data: null })

        const roomIds = new Set()
        const stuIds = new Set()
        course.sessions.forEach(s => {
            if (s.room) roomIds.add(String(s.room))
            s.students.forEach(st => stuIds.add(st.studentId))
        })

        const roomMap = new Map()
        await Area.find(
            { 'rooms._id': { $in: [...roomIds].map(id => new Types.ObjectId(id)) } },
            { 'rooms.$': 1 }
        ).lean().then(res =>
            res.forEach(a => a.rooms.forEach(r => roomMap.set(String(r._id), { _id: r._id, name: r.name })))
        )

        const stuMap = new Map()
        await PostStudent.find(
            { _id: { $in: [...stuIds] } },
            { Name: 1, Trial: 1, Phone: 1, ID: 1 }
        ).lean().then(res =>
            res.forEach(st => {
                stuMap.set(String(st._id), { _id: st._id, name: st.Name, statuses: st.Trial, phone: st.Phone || '', id: st.ID })
            })
        )

        const uniqStu = new Set()
        course.sessions = course.sessions.map(s => {
            const roomObj = roomMap.get(String(s.room)) || null
            const topic = s.book?.Topics?.find(t => String(t._id) === String(s.topicId)) || null
            const students = s.students.map(st => {
                const info = stuMap.get(String(st.studentId)) || {}
                uniqStu.add(String(st.studentId))
                return { ...st, ...info }
            })
            return { ...s, room: roomObj, book: s.book ? { _id: s.book._id, name: s.book.Name } : null, topic, students, teacher: s.teacher || null, teachingAs: s.teachingAs || null }
        })

        const payload = {
            _id: course._id,
            name: course.name,
            code: course.code ?? null,
            sessions: course.sessions,
            totalSessions: course.sessions.length,
            totalStudents: uniqStu.size
        }

        return new NextResponse(JSON.stringify({ status: true, mes: 'Success', data: payload }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'x-nextjs-cache-tag': TAG }
        })
    } catch (err) {
        console.error('[GET /coursetry]', err)
        return jsonRes(500, { status: false, mes: 'Lỗi máy chủ', data: null })
    }
}

export async function POST(request) {
    try {
        await dbConnect()
        const { day, time, room, book, topicId, teacher, teachingAs, studentIds = [], note = '' } = await request.json()

        if (!day || !time || !room || !book || !topicId)
            return jsonRes(400, { status: false, mes: 'Thiếu trường bắt buộc.', data: null })

        const course = await TrialCourse.findById(TRIAL_ID).lean()
        if (!course)
            return jsonRes(404, { status: false, mes: 'TrialCourse không tồn tại.', data: null })

        const sessionId = new Types.ObjectId()
        const sessionDate = new Date(day);
        const session = {
            _id: sessionId,
            day: sessionDate,
            time,
            room: new Types.ObjectId(room),
            folderId: await createUniqueFolder(day),
            book: new Types.ObjectId(book),
            topicId: new Types.ObjectId(topicId),
            students: studentIds.map(id => ({ studentId: id })),
            teacher: teacher ? new Types.ObjectId(teacher) : undefined,
            teachingAs: teachingAs ? new Types.ObjectId(teachingAs) : undefined,
            note
        }

        await TrialCourse.updateOne({ _id: TRIAL_ID }, { $push: { sessions: session } })

        if (studentIds.length) {
            await PostStudent.bulkWrite(
                studentIds.map(id => ({
                    updateOne: {
                        filter: { _id: new Types.ObjectId(id) },
                        update: { $addToSet: { Trial: { topic: sessionId, note: '', status: 1 } } }
                    }
                }))
            )
        }

        const month = sessionDate.getMonth() + 1;
        const year = sessionDate.getFullYear();
        revalidateTag(TAG)
        revalidateTag(`data_calendar${month}-${year}`);
        revalidateTag(`data_lesson${sessionId}`);

        return jsonRes(201, { status: true, mes: 'Thêm buổi học thử thành công!', data: session })
    } catch (e) {
        console.error('[POST /coursetry]', e)
        const code = e.message === 'Authentication failed' ? 401 : 500
        return jsonRes(code, { status: false, mes: 'Lỗi máy chủ', data: null })
    }
}

export async function PUT(request) {
    try {
        await dbConnect()
        const { sessionId, students, ...fields } = await request.json()
        if (!Types.ObjectId.isValid(sessionId))
            return jsonRes(400, { status: false, mes: 'sessionId không hợp lệ.', data: null })

        const courseDoc = await TrialCourse.findOne({ _id: TRIAL_ID, 'sessions._id': sessionId }, { sessions: { $elemMatch: { _id: sessionId } } }).lean()
        if (!courseDoc?.sessions?.length)
            return jsonRes(404, { status: false, mes: 'Không tìm thấy buổi học.', data: null })

        const oldSes = courseDoc.sessions[0]
        const updates = {}
        let hasFieldChanged = false

        Object.entries(fields).forEach(([k, v]) => {
            if (k === 'folderId' || v === undefined) return
            if (k === 'room' && Types.ObjectId.isValid(v)) v = new Types.ObjectId(v)
            if (String(v) !== String(oldSes[k] ?? '')) {
                updates[`sessions.$.${k}`] = v
                hasFieldChanged = true
            }
        })

        let addIds = [], delIds = []
        let hasStudentChanged = false
        if (Array.isArray(students)) {
            const newIds = students.filter(Types.ObjectId.isValid).map(id => String(id));
            const oldIds = oldSes.students.map(s => String(s.studentId));
            addIds = newIds.filter(id => !oldIds.includes(id));
            delIds = oldIds.filter(id => !newIds.includes(id));
            if (addIds.length || delIds.length) {
                updates['sessions.$.students'] = newIds.map(id => ({ studentId: new Types.ObjectId(id) }))
                hasStudentChanged = true
            }
        }

        const wasAnythingChanged = hasFieldChanged || hasStudentChanged;
        if (!wasAnythingChanged) {
            return jsonRes(400, { status: false, mes: 'Bạn chưa thay đổi thông tin nào của buổi học.', data: null });
        }

        await TrialCourse.updateOne({ _id: TRIAL_ID, 'sessions._id': sessionId }, { $set: updates })

        if (hasStudentChanged) {
            const ops = []
            if (addIds.length) ops.push({ updateMany: { filter: { _id: { $in: addIds.map(id => new Types.ObjectId(id)) } }, update: { $addToSet: { Trial: { topic: new Types.ObjectId(sessionId), note: '', status: 1 } } } } })
            if (delIds.length) ops.push({ updateMany: { filter: { _id: { $in: delIds.map(id => new Types.ObjectId(id)) } }, update: { $pull: { Trial: { topic: new Types.ObjectId(sessionId) } } } } })
            if (ops.length) await PostStudent.bulkWrite(ops)
        }

        const oldDate = new Date(oldSes.day);
        const calendarTagsToRevalidate = new Set([`data_calendar${oldDate.getMonth() + 1}-${oldDate.getFullYear()}`]);

        if (fields.day && oldDate.toISOString().slice(0, 10) !== fields.day) {
            const newDate = new Date(fields.day);
            calendarTagsToRevalidate.add(`data_calendar${newDate.getMonth() + 1}-${newDate.getFullYear()}`);
        }

        for (const tag of calendarTagsToRevalidate) {
            revalidateTag(tag);
        }
        revalidateTag(`data_lesson${sessionId}`);
        revalidateTag(TAG);

        return jsonRes(200, { status: true, mes: 'Cập nhật thành công!', data: null })
    } catch (err) {
        console.error('[PUT /coursetry]', err)
        return jsonRes(500, { status: false, mes: 'Lỗi máy chủ', data: null })
    }
}