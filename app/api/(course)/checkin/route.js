import { NextResponse } from 'next/server'
import connectDB from '@/config/connectDB'
import PostCourse from '@/models/course'
import TrialCourse from '@/models/coursetry'
import PostStudent from '@/models/student'
import mongoose from 'mongoose'
import { revalidateTag } from 'next/cache'
import { Re_coursetry } from '@/data/course'
import { reloadCourse, reloadCoursetry } from '@/data/actions/reload'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const month = +searchParams.get('month')
    const year = +searchParams.get('year')
    if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12)
      return NextResponse.json({ error: 'month/year không hợp lệ' }, { status: 400 })

    await connectDB()
    if (mongoose.connection.readyState !== 1) await mongoose.connection.asPromise()

    const start = new Date(Date.UTC(year, month - 1, 1))
    const end = new Date(Date.UTC(year, month, 1))

    const officialAgg = PostCourse.aggregate([
      { $unwind: '$Detail' },
      { $match: { 'Detail.Day': { $gte: start, $lt: end } } },
      { $addFields: { students: { $map: { input: { $filter: { input: '$Student', as: 'st', cond: { $anyElementTrue: [{ $map: { input: '$$st.Learn', as: 'lr', in: { $eq: ['$$lr.Lesson', '$Detail._id'] } } }] } } }, as: 'st', in: { $mergeObjects: ['$$st', { Learn: { $filter: { input: '$$st.Learn', as: 'lr', cond: { $eq: ['$$lr.Lesson', '$Detail._id'] } } } }] } } } } },
      { $lookup: { from: 'books', localField: 'Book', foreignField: '_id', as: 'bk' } },
      { $set: { bk: { $arrayElemAt: ['$bk', 0] } } },
      { $set: { topic: { $arrayElemAt: [{ $filter: { input: '$bk.Topics', as: 'tp', cond: { $eq: ['$$tp._id', '$Detail.Topic'] } } }, 0] } } },
      { $lookup: { from: 'users', localField: 'Detail.Teacher', foreignField: '_id', as: 'teacher' } },
      { $lookup: { from: 'users', localField: 'Detail.TeachingAs', foreignField: '_id', as: 'teachingAs' } },
      { $lookup: { from: 'areas', localField: 'Area', foreignField: '_id', as: 'ar' } },
      { $set: { ar: { $arrayElemAt: ['$ar', 0] } } },
      { $set: { roomDoc: { $arrayElemAt: [{ $filter: { input: '$ar.rooms', as: 'r', cond: { $eq: ['$$r._id', '$Detail.Room'] } } }, 0] } } },
      {
        $project: {
          _id: '$Detail._id', courseId: '$ID', courseName: '$Name', type: { $literal: 'official' }, date: '$Detail.Day', day: { $dayOfMonth: '$Detail.Day' }, month: { $month: '$Detail.Day' }, year: { $year: '$Detail.Day' }, time: '$Detail.Time', room: { _id: { $ifNull: ['$roomDoc._id', '$Detail.Room'] }, name: { $ifNull: ['$roomDoc.name', '$Detail.Room'] }, area: '$ar.name', color: '$ar.color' }, image: '$Detail.Image', topic: '$topic', teacher: { $arrayElemAt: ['$teacher', 0] }, teachingAs: { $arrayElemAt: ['$teachingAs', 0] }, students: '$students'
        }
      }
    ])

    const trialAgg = TrialCourse.aggregate([
      { $unwind: '$sessions' },
      { $match: { 'sessions.day': { $gte: start, $lt: end } } },
      { $lookup: { from: 'books', localField: 'sessions.book', foreignField: '_id', as: 'bk' } },
      { $set: { bk: { $arrayElemAt: ['$bk', 0] } } },
      { $set: { topic: { $arrayElemAt: [{ $filter: { input: '$bk.Topics', as: 'tp', cond: { $eq: ['$$tp._id', '$sessions.topicId'] } } }, 0] } } },
      { $lookup: { from: 'users', localField: 'sessions.teacher', foreignField: '_id', as: 'teacher' } },
      { $lookup: { from: 'users', localField: 'sessions.teachingAs', foreignField: '_id', as: 'teachingAs' } },
      { $lookup: { from: 'areas', let: { roomId: '$sessions.room' }, pipeline: [{ $unwind: '$rooms' }, { $match: { $expr: { $eq: ['$rooms._id', '$$roomId'] } } }, { $project: { _id: 0, room: '$rooms', areaName: '$name', areaColor: '$color' } }], as: 'rd' } },
      { $set: { rd: { $arrayElemAt: ['$rd', 0] } } },
      {
        $project: {
          _id: '$sessions._id', courseId: '$name', courseName: '$name', type: { $literal: 'trial' }, date: '$sessions.day', day: { $dayOfMonth: '$sessions.day' }, month: { $month: '$sessions.day' }, year: { $year: '$sessions.day' }, time: '$sessions.time', room: { _id: { $ifNull: ['$rd.room._id', '$sessions.room'] }, name: { $ifNull: ['$rd.room.name', '$sessions.room'] }, area: '$rd.areaName', color: '$rd.areaColor' }, image: null, topic: '$topic', teacher: { $arrayElemAt: ['$teacher', 0] }, teachingAs: { $arrayElemAt: ['$teachingAs', 0] }, students: '$sessions.students'
        }
      }
    ])

    const [official, trial] = await Promise.all([officialAgg, trialAgg])
    const data = [...official, ...trial].sort((a, b) => a.date - b.date)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('Calendar API error:', err)
    return NextResponse.json({ success: false, error: err.message || 'internal error' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const { courseId, sessionId, attendanceData } = await req.json()
    if (!courseId || !sessionId || !Array.isArray(attendanceData))
      return NextResponse.json({ status: 1, mes: 'Thiếu tham số' }, { status: 400 })

    await connectDB()
    let sessionDate;
    const sessionIdObj = new mongoose.Types.ObjectId(sessionId);

    // Trường hợp 1: Khóa học chính thức
    const course = await PostCourse.findOne({ _id: courseId, 'Detail._id': sessionIdObj }).lean()
    if (course) {
      const lesson = course.Detail.find(d => d._id.equals(sessionIdObj));
      if (lesson) sessionDate = lesson.Day;

      for (const a of attendanceData) {
        await PostCourse.updateOne(
          { _id: course._id },
          {
            $set: {
              // Hoàn trả logic cũ: lưu checkin dưới dạng Number
              'Student.$[stu].Learn.$[les].Checkin': Number(a.checkin),
              'Student.$[stu].Learn.$[les].Cmt': a.comment || []
            }
          },
          { arrayFilters: [{ 'stu.ID': a.studentId }, { 'les.Lesson': sessionIdObj }] }
        )
      }
    } else {
      // Trường hợp 2: Khóa học thử
      const trialCourse = await TrialCourse.findOne({ 'sessions._id': sessionIdObj }).lean()
      if (!trialCourse) return NextResponse.json({ status: 1, mes: 'Không tìm thấy khóa học.' }, { status: 404 })

      const lesson = trialCourse.sessions.find(s => s._id.equals(sessionIdObj));
      if (lesson) sessionDate = lesson.day;

      const studentHumanIds = attendanceData.map(a => a.studentId);
      const studentsFound = await PostStudent.find({ ID: { $in: studentHumanIds } }, { _id: 1, ID: 1 }).lean();
      const studentIdMap = new Map(studentsFound.map(s => [s.ID, s._id]));

      for (const a of attendanceData) {
        const student_id = studentIdMap.get(a.studentId);
        if (!student_id) {
          console.warn(`Không tìm thấy học sinh với ID: ${a.studentId}.`);
          continue;
        }

        await TrialCourse.updateOne(
          { _id: trialCourse._id },
          {
            $set: {
              // Giữ nguyên logic mới: lưu checkin dưới dạng Boolean
              'sessions.$[ses].students.$[stu].checkin': (a.checkin != 2 && a.checkin != 0),
              'sessions.$[ses].students.$[stu].cmt': a.comment || []
            }
          },
          { arrayFilters: [{ 'ses._id': sessionIdObj }, { 'stu.studentId': student_id }] }
        )
      }
    }
    reloadCoursetry();
    revalidateTag(`data_lesson${sessionId}`);
    reloadCourse(courseId);
    return NextResponse.json({ status: 2, mes: 'Cập nhật điểm danh thành công!' })
  } catch (err) {
    console.error('Checkin update error:', err)
    return NextResponse.json({ status: 1, mes: err.message || 'internal error' }, { status: 500 })
  }
}