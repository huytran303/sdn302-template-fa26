const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');
const { connectDb } = require('./dal/database');
const { Attendance, Class, Student } = require('./models');
const isValidId = (id) => mongoose.isObjectIdOrHexString(id);

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT'];
const isDateStr = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s))
    && new Date(s).toISOString().slice(0, 10) === s;

// Shared: validate :classId and load the class, or send 400/404 and return null
const loadClass = async (req, res) => {
    const { classId } = req.params;
    if (!isValidId(classId)) { res.status(400).json({ error: `Invalid classId: ${classId}` }); return null; }
    const cls = await Class.findById(classId).lean();
    if (!cls) { res.status(404).json({ error: `Class with id = ${classId} not found` }); return null; }
    return cls;
};

app.get('/api', (req, res) => {
    res.status(200).json({ message: `Welcome Express server` });
});

// Q1: GET /api/classes/:classId/students?status=enrolled
app.get('/api/classes/:classId/students', async (req, res) => {
    const cls = await loadClass(req, res);
    if (!cls) return;

    const { status } = req.query;
    if (status === undefined || status === '') return res.status(400).json({ error: 'Status is required' });
    if (!['enrolled', 'dropped'].includes(status)) return res.status(400).json({ error: `Invalid status: ${status}` });

    const ids = cls.enrollments.filter(e => e.status === status).map(e => e.studentId);
    const students = await Student.find({ _id: { $in: ids } }).lean();
    const byId = new Map(students.map(s => [String(s._id), s]));

    const result = ids.map(id => byId.get(String(id))).filter(Boolean)
        .map(s => ({ id: s._id, studentCode: s.studentCode, fullName: s.fullName, email: s.email }));
    res.status(200).json(result);
});

// Q2: GET /api/classes/:classId/attendance-summary
app.get('/api/classes/:classId/attendance-summary', async (req, res) => {
    const cls = await loadClass(req, res);
    if (!cls) return;

    const ids = cls.enrollments.filter(e => e.status === 'enrolled').map(e => e.studentId);
    const students = await Student.find({ _id: { $in: ids } }).lean();
    const attendances = await Attendance.find({ classId: cls._id }).lean();

    const result = students.map(s => {
        const mine = attendances.filter(a => String(a.studentId) === String(s._id));
        const totalSessions = mine.length;
        const present = mine.filter(a => a.status === 'PRESENT').length;
        const absent = mine.filter(a => a.status === 'ABSENT').length;
        const rate = totalSessions ? Math.round(present / totalSessions * 1000) / 10 : 0;
        return {
            studentCode: s.studentCode,
            fullName: s.fullName,
            totalSessions,
            present,
            absent,
            attendanceRate: JSON.rawJSON(rate.toFixed(1)), // keeps 90.0 as a number in the JSON output
            warning: rate < 80,
        };
    });
    res.status(200).json(result);
});

// Q3: GET /api/students/:studentId/attendances
app.get('/api/students/:studentId/attendances', async (req, res) => {
    const { studentId } = req.params;
    if (!isValidId(studentId)) return res.status(400).json({ error: `Invalid studentId: ${studentId}` });
    if (!(await Student.exists({ _id: studentId }))) return res.status(404).json({ error: `Student with id = ${studentId} not found` });

    const attendances = await Attendance.find({ studentId })
        .sort({ date: -1, _id: -1 })
        .populate({ path: 'classId', select: 'className subjectId', populate: { path: 'subjectId', select: 'name' } })
        .lean();

    const result = attendances.map(a => ({
        id: a._id,
        className: a.classId?.className ?? null,
        subjectName: a.classId?.subjectId?.name ?? null,
        date: a.date,
        status: a.status,
    }));
    res.status(200).json(result);
});

// Q4: POST /api/classes/:classId/attendances (upsert)
app.post('/api/classes/:classId/attendances', async (req, res) => {
    const cls = await loadClass(req, res);
    if (!cls) return;

    const { date, records } = req.body ?? {};
    if (date === undefined || date === null || date === '') return res.status(400).json({ error: 'Date is required' });
    if (!isDateStr(date)) return res.status(400).json({ error: `Invalid date: ${date}` });
    const sessionDate = new Date(date);
    if (sessionDate > new Date()) return res.status(400).json({ error: 'Date cannot be in the future' });

    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'Records are required and cannot be empty' });

    // Validate everything before writing -> nothing is saved if one record is invalid
    const enrolled = cls.enrollments.filter(e => e.status === 'enrolled').map(e => String(e.studentId));
    const members = new Set(enrolled);
    const seen = new Set();
    for (const r of records) {
        const studentId = r?.studentId;
        if (!members.has(String(studentId))) return res.status(400).json({ error: `Student ${studentId} does not belong to class` });
        if (seen.has(String(studentId))) return res.status(400).json({ error: `Duplicate student ${studentId} in records` });
        seen.add(String(studentId));
        if (!ATTENDANCE_STATUSES.includes(r.status)) return res.status(400).json({ error: `Invalid status: ${r.status}` });
    }

    const missingIds = enrolled.filter(id => !seen.has(id));
    if (missingIds.length) {
        const s = await Student.findById(missingIds[0]).lean();
        return res.status(400).json({ error: `Missing attendance for student ${s?.studentCode ?? missingIds[0]} (${s?.fullName ?? 'unknown'})` });
    }

    const writeResult = await Attendance.bulkWrite(records.map(r => ({
        updateOne: {
            filter: { classId: cls._id, studentId: r.studentId, date: sessionDate },
            update: { $set: { status: r.status } },
            upsert: true,
        },
    })));

    const present = records.filter(r => r.status === 'PRESENT').length;
    const result = {
        message: 'Attendance recorded successfully',
        totalRecords: records.length,
        present,
        absent: records.length - present,
        updatedCount: writeResult.matchedCount,
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
