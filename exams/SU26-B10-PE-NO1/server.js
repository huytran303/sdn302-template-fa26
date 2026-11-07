const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');
const { connectDb } = require('./dal/database');
const { Attendance, Class, Student, Subject } = require('./models');
const isValidId = (id) => mongoose.isObjectIdOrHexString(id);

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT'];
const DAY_MS = 24 * 60 * 60 * 1000;

app.get('/api', (req, res) => {
    res.status(200).json({ message: `Welcome Express server` });
});

// Q1: GET /api/subjects?status=ACTIVE
app.get('/api/subjects', async (req, res) => {
    const { status } = req.query;
    if (status === undefined || status === '') return res.status(400).json({ error: 'Status is required' });
    if (!['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({ error: `Invalid status: ${status}` });

    const subjects = await Subject.find({ status }).lean();
    const result = subjects.map(s => ({ id: s._id, code: s.code, name: s.name, credits: s.credits }));
    res.status(200).json(result);
});

// Q2: GET /api/subjects/:subjectId/attendance-summary
app.get('/api/subjects/:subjectId/attendance-summary', async (req, res) => {
    const { subjectId } = req.params;
    if (!isValidId(subjectId)) return res.status(400).json({ error: `Invalid subjectId: ${subjectId}` });
    if (!(await Subject.exists({ _id: subjectId }))) return res.status(404).json({ error: `Subject with id = ${subjectId} not found` });

    const classes = await Class.find({ subjectId }).sort({ _id: 1 }).lean();
    const attendances = await Attendance.find({ classId: { $in: classes.map(c => c._id) } }).lean();

    const result = classes.map(c => {
        const mine = attendances.filter(a => String(a.classId) === String(c._id));
        const sessions = new Set(mine.map(a => a.date.getTime()));
        // per-student PRESENT rate, then averaged across students
        const perStudent = {};
        for (const a of mine) {
            const k = String(a.studentId);
            perStudent[k] ??= { present: 0, total: 0 };
            perStudent[k].total++;
            if (a.status === 'PRESENT') perStudent[k].present++;
        }
        const rates = Object.values(perStudent).map(s => s.present / s.total * 100);
        const avg = rates.length ? Math.round(rates.reduce((x, y) => x + y, 0) / rates.length * 10) / 10 : 0;
        return {
            classId: c._id,
            className: c.className,
            totalSessions: sessions.size,
            averageAttendanceRate: avg,
            warning: avg < 70,
        };
    });
    res.status(200).json(result);
});

// Q3: PATCH /api/attendances/:attendanceId
app.patch('/api/attendances/:attendanceId', async (req, res) => {
    const { attendanceId } = req.params;
    const { status } = req.body ?? {};
    if (!isValidId(attendanceId)) return res.status(400).json({ error: `Invalid attendanceId: ${attendanceId}` });

    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) return res.status(404).json({ error: `Attendance with id = ${attendanceId} not found` });

    if (status === undefined || status === null || status === '') return res.status(400).json({ error: 'Status is required' });
    if (!ATTENDANCE_STATUSES.includes(status)) return res.status(400).json({ error: `Invalid status: ${status}` });

    if (Date.now() - attendance.date.getTime() > 2 * DAY_MS)
        return res.status(400).json({ error: 'Cannot update attendance. Session date exceeded 2-day limit' });

    attendance.status = status;
    await attendance.save();
    const result = {
        id: attendance._id,
        studentId: attendance.studentId,
        classId: attendance.classId,
        date: attendance.date,
        status: attendance.status,
    };
    res.status(200).json(result);
});

// Q4: POST /api/classes/:classId/attendances
app.post('/api/classes/:classId/attendances', async (req, res) => {
    const { classId } = req.params;
    const { date, records } = req.body ?? {};
    if (!isValidId(classId)) return res.status(400).json({ error: `Invalid classId: ${classId}` });

    const cls = await Class.findById(classId).lean();
    if (!cls) return res.status(404).json({ error: `Class with id = ${classId} not found` });

    if (!date) return res.status(400).json({ error: 'Date is required' });
    const sessionDate = new Date(date);
    if (typeof date !== 'string' || isNaN(sessionDate)) return res.status(400).json({ error: `Invalid date: ${date}` });
    if (sessionDate > new Date()) return res.status(400).json({ error: 'Date cannot be in the future' });

    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'Records are required and cannot be empty' });

    if (cls.status === 'CLOSED') return res.status(400).json({ error: `Class ${cls.className} is closed and cannot accept attendance` });

    // Validate every record before writing anything -> nothing is saved if one is invalid
    const members = new Set(cls.enrollments.filter(e => e.status === 'enrolled').map(e => String(e.studentId)));
    const seen = new Set();
    for (const r of records) {
        const studentId = r?.studentId;
        if (!members.has(String(studentId))) return res.status(400).json({ error: `Student ${studentId} does not belong to class` });
        if (seen.has(String(studentId))) return res.status(400).json({ error: `Duplicate student ${studentId} in records` });
        seen.add(String(studentId));
        if (!ATTENDANCE_STATUSES.includes(r.status)) return res.status(400).json({ error: `Invalid status: ${r.status}` });
    }

    if (await Attendance.exists({ classId, date: sessionDate }))
        return res.status(409).json({ error: `Attendance for date ${date} already exists in this class` });

    const students = await Student.find({ _id: { $in: records.map(r => r.studentId) } }).lean();
    const byId = new Map(students.map(s => [String(s._id), s]));
    const missing = records.find(r => !byId.has(String(r.studentId)));
    if (missing) return res.status(400).json({ error: `Student ${missing.studentId} not found` });

    await Attendance.insertMany(records.map(r => ({ studentId: r.studentId, classId, date: sessionDate, status: r.status })));
    const present = records.filter(r => r.status === 'PRESENT').length;

    const result = {
        message: 'Attendance recorded successfully',
        totalRecords: records.length,
        present,
        absent: records.length - present,
        records: records.map(r => {
            const s = byId.get(String(r.studentId));
            return { studentCode: s.studentCode, fullName: s.fullName, status: r.status };
        }),
    };
    res.status(201).json(result);
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message });
});

(async () => {
    try {
        await connectDb();
        app.listen(process.env.PORT, () => {
            console.log(`API chạy tại http://localhost:${process.env.PORT}/api`);
        });
    } catch (error) {
        console.error(`Không khởi động được server: `, error.message);
        process.exit(1);
    }
})()
