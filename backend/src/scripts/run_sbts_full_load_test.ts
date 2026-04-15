import dotenv from 'dotenv';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { Prisma, Semester } from '@prisma/client';
import prisma from '../utils/prisma';

dotenv.config();

const LOAD_TEST_PROGRAM_CODE = 'SBTS';
const LOAD_TEST_HEADER_NAME = 'x-sbts-load-test-secret';
const DEFAULT_AUTOSAVE_WINDOW_MS = 20_000;
const DEFAULT_AUTOSAVE_ROUNDS = 2;
const DEFAULT_REPORT_DIR = '/tmp/sis-sbts-load-tests';

type CliArgs = {
    mode: 'run' | 'restore';
    snapshotPath: string | null;
    reportPath: string | null;
    autosaveWindowMs: number;
    autosaveRounds: number;
    skipAvailable: boolean;
    keepSnapshot: boolean;
};

type StudentRow = {
    id: number;
    name: string;
    classId: number;
};

type ClassRow = {
    id: number;
    name: string;
};

type ScheduleRow = {
    id: number;
    classId: number;
    className: string;
    startTime: Date;
    endTime: Date;
    examType: string | null;
    packetId: number;
    packetTitle: string;
    packetType: string;
    programCode: string | null;
    subjectId: number;
    subjectName: string;
    subjectCode: string;
    academicYearId: number;
    semester: Semester;
    packetQuestions: Record<string, unknown>[];
};

type StudentTarget = {
    studentId: number;
    studentName: string;
    classId: number;
    className: string;
    scheduleId: number;
};

type SlotSelection = {
    key: string;
    startTime: string;
    endTime: string;
    studentCount: number;
    weightedPacketBytes: number;
    packetBytes: number;
    scheduleCount: number;
    schedules: Array<{
        scheduleId: number;
        classId: number;
        className: string;
        packetId: number;
        packetTitle: string;
        subjectId: number;
        subjectName: string;
        subjectCode: string;
        studentCount: number;
        packetBytes: number;
        academicYearId: number;
        semester: Semester;
        programCode: string | null;
        examType: string | null;
    }>;
};

type SnapshotPayload = {
    meta: {
        capturedAt: string;
        academicYearId: number;
        academicYearName: string;
        semester: Semester;
        slot: SlotSelection;
        scheduleIds: number[];
        studentIds: number[];
        subjectIds: number[];
    };
    tables: {
        studentExamSessions: Array<{
            id: number;
            studentId: number;
            startTime: string;
            endTime: string | null;
            answers: Prisma.JsonValue | null;
            score: number | null;
            scheduleId: number;
            submitTime: string | null;
            createdAt: string;
            updatedAt: string;
            status: string;
        }>;
        studentGrades: Array<{
            id: number;
            studentId: number;
            subjectId: number;
            componentId: number;
            academicYearId: number;
            score: number;
            nf1: number | null;
            nf2: number | null;
            nf3: number | null;
            nf4: number | null;
            nf5: number | null;
            nf6: number | null;
            semester: Semester;
        }>;
        studentScoreEntries: Array<{
            id: number;
            studentId: number;
            subjectId: number;
            academicYearId: number;
            semester: Semester;
            componentCode: string;
            componentType: string | null;
            componentTypeCode: string | null;
            reportSlot: string;
            reportSlotCode: string;
            score: number;
            rawScore: number | null;
            maxScore: number | null;
            sourceType: string;
            sourceKey: string;
            metadata: Prisma.JsonValue | null;
            recordedAt: string;
            createdAt: string;
            updatedAt: string;
        }>;
        reportGrades: Array<{
            id: number;
            studentId: number;
            subjectId: number;
            academicYearId: number;
            finalScore: number;
            predicate: string | null;
            description: string | null;
            formatifScore: number | null;
            sasScore: number | null;
            sbtsScore: number | null;
            slotScores: Prisma.JsonValue | null;
            semester: Semester;
            usScore: number | null;
        }>;
        gradeComponents: Array<{
            id: number;
            code: string | null;
            name: string;
            weight: number;
            isActive: boolean;
            subjectId: number;
            type: string;
            typeCode: string;
        }>;
    };
};

type PhaseResult<TPayload = unknown> = {
    ok: boolean;
    studentId: number;
    scheduleId: number;
    statusCode: number;
    latencyMs: number;
    responseBytes: number;
    errorMessage: string | null;
    payload?: TPayload;
};

type StartedExam = {
    target: StudentTarget;
    packetTitle: string;
    questionCount: number;
    questions: Record<string, unknown>[];
};

type PhaseSummary = {
    requestCount: number;
    successCount: number;
    errorCount: number;
    durationMs: number;
    totalResponseBytes: number;
    estimatedMbps: number;
    latencyMs: {
        min: number;
        p50: number;
        p95: number;
        max: number;
        avg: number;
    };
    sampleErrors: string[];
};

function printUsage() {
    console.log(`
Usage:
  node -r ts-node/register src/scripts/run_sbts_full_load_test.ts [options]
  node -r ts-node/register src/scripts/run_sbts_full_load_test.ts --mode restore --snapshot <path>

Options:
  --mode <run|restore>        Mode script. Default: run
  --snapshot <path>           Path file snapshot JSON.
  --report <path>             Path file laporan JSON.
  --autosave-window-ms <ms>   Durasi sebaran autosave. Default: 20000
  --autosave-rounds <n>       Jumlah autosave parsial sebelum submit final. Default: 2
  --skip-available            Lewati phase GET /exams/available.
  --keep-snapshot             Jangan hapus file snapshot setelah restore berhasil.
  -h, --help                  Tampilkan bantuan.
`);
}

function parseArgs(argv: string[]): CliArgs {
    let mode: CliArgs['mode'] = 'run';
    let snapshotPath: string | null = null;
    let reportPath: string | null = null;
    let autosaveWindowMs = DEFAULT_AUTOSAVE_WINDOW_MS;
    let autosaveRounds = DEFAULT_AUTOSAVE_ROUNDS;
    let skipAvailable = false;
    let keepSnapshot = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = argv[index + 1];

        if (arg === '--mode' && next) {
            if (next !== 'run' && next !== 'restore') {
                throw new Error('Argumen --mode harus bernilai run atau restore.');
            }
            mode = next;
            index += 1;
            continue;
        }
        if (arg === '--snapshot' && next) {
            snapshotPath = path.resolve(next);
            index += 1;
            continue;
        }
        if (arg === '--report' && next) {
            reportPath = path.resolve(next);
            index += 1;
            continue;
        }
        if (arg === '--autosave-window-ms' && next) {
            autosaveWindowMs = Number(next);
            index += 1;
            continue;
        }
        if (arg === '--autosave-rounds' && next) {
            autosaveRounds = Number(next);
            index += 1;
            continue;
        }
        if (arg === '--skip-available') {
            skipAvailable = true;
            continue;
        }
        if (arg === '--keep-snapshot') {
            keepSnapshot = true;
            continue;
        }
        if (arg === '-h' || arg === '--help') {
            printUsage();
            process.exit(0);
        }
    }

    if (!Number.isFinite(autosaveWindowMs) || autosaveWindowMs < 1000) {
        throw new Error('Argumen --autosave-window-ms minimal 1000.');
    }
    if (!Number.isFinite(autosaveRounds) || autosaveRounds < 0 || autosaveRounds > 6) {
        throw new Error('Argumen --autosave-rounds harus di antara 0 sampai 6.');
    }
    if (mode === 'restore' && !snapshotPath) {
        throw new Error('Mode restore wajib memakai --snapshot <path>.');
    }

    return {
        mode,
        snapshotPath,
        reportPath,
        autosaveWindowMs,
        autosaveRounds,
        skipAvailable,
        keepSnapshot,
    };
}

function resolveCurrentSemester(params: {
    semester1End: Date | null;
    semester2Start: Date | null;
    semester2End: Date | null;
    now: Date;
}): Semester {
    if (
        params.semester2Start &&
        params.semester2End &&
        params.now >= params.semester2Start &&
        params.now <= params.semester2End
    ) {
        return Semester.EVEN;
    }

    return Semester.ODD;
}

function toNullableJsonInput(value: Prisma.JsonValue | null): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
    return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    if (items.length === 0) return [];
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
}

async function createManyInChunks<T>(items: T[], chunkSize: number, runner: (chunk: T[]) => Promise<unknown>) {
    for (const chunk of chunkArray(items, chunkSize)) {
        await runner(chunk);
    }
}

function serializePhaseSummary(results: PhaseResult[], durationMs: number): PhaseSummary {
    const latencies = results.map((item) => item.latencyMs).sort((left, right) => left - right);
    const sumLatency = latencies.reduce((total, item) => total + item, 0);
    const totalResponseBytes = results.reduce((total, item) => total + item.responseBytes, 0);
    const errorSamples = Array.from(
        new Set(results.filter((item) => !item.ok && item.errorMessage).map((item) => item.errorMessage as string)),
    ).slice(0, 10);

    const percentile = (ratio: number) => {
        if (!latencies.length) return 0;
        const index = Math.min(latencies.length - 1, Math.max(0, Math.ceil(latencies.length * ratio) - 1));
        return Number(latencies[index].toFixed(2));
    };

    const estimatedMbps =
        durationMs > 0 ? Number((((totalResponseBytes * 8) / (durationMs / 1000)) / 1_000_000).toFixed(4)) : 0;

    return {
        requestCount: results.length,
        successCount: results.filter((item) => item.ok).length,
        errorCount: results.filter((item) => !item.ok).length,
        durationMs: Number(durationMs.toFixed(2)),
        totalResponseBytes,
        estimatedMbps,
        latencyMs: {
            min: latencies.length ? Number(latencies[0].toFixed(2)) : 0,
            p50: percentile(0.5),
            p95: percentile(0.95),
            max: latencies.length ? Number(latencies[latencies.length - 1].toFixed(2)) : 0,
            avg: latencies.length ? Number((sumLatency / latencies.length).toFixed(2)) : 0,
        },
        sampleErrors: errorSamples,
    };
}

function stringifyResponseBytes(payload: unknown): number {
    try {
        return Buffer.byteLength(JSON.stringify(payload ?? null));
    } catch {
        return 0;
    }
}

function createStudentToken(studentId: number): string {
    const jwtSecret = String(process.env.JWT_SECRET || '').trim();
    if (!jwtSecret) {
        throw new Error('JWT_SECRET belum tersedia di environment.');
    }

    return jwt.sign(
        {
            id: studentId,
            role: 'STUDENT',
        },
        jwtSecret,
        {
            expiresIn: '1d',
        },
    );
}

function buildRequestHeaders(studentId: number): Record<string, string> {
    const secret = String(process.env.SBTS_LOAD_TEST_BYPASS_SECRET || '').trim();
    if (!secret) {
        throw new Error('SBTS_LOAD_TEST_BYPASS_SECRET wajib diisi saat menjalankan load test.');
    }

    return {
        Authorization: `Bearer ${createStudentToken(studentId)}`,
        [LOAD_TEST_HEADER_NAME]: secret,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
    };
}

function buildBaseUrl(): string {
    const port = Number(process.env.PORT || 3000);
    return `http://127.0.0.1:${Number.isFinite(port) ? port : 3000}/api`;
}

function answerForQuestion(question: Record<string, unknown>): unknown {
    const type = String(question.type || question.question_type || 'MULTIPLE_CHOICE')
        .trim()
        .toUpperCase();

    if (type === 'ESSAY') {
        return 'Jawaban uji beban SBTS.';
    }

    if (type === 'MATRIX_SINGLE_CHOICE') {
        const rows = Array.isArray(question.matrixRows)
            ? (question.matrixRows as Array<Record<string, unknown>>)
            : Array.isArray(question.rows)
                ? (question.rows as Array<Record<string, unknown>>)
                : [];
        const columns = Array.isArray(question.matrixColumns)
            ? (question.matrixColumns as Array<Record<string, unknown>>)
            : [];
        const fallbackColumnId = String(columns[0]?.id || '').trim();
        const answerMap: Record<string, string> = {};

        rows.forEach((row) => {
            const rowId = String(row.id || '').trim();
            const columnId = String(row.correctOptionId || fallbackColumnId || '').trim();
            if (!rowId || !columnId) return;
            answerMap[rowId] = columnId;
        });

        return answerMap;
    }

    const options = Array.isArray(question.options) ? (question.options as Array<Record<string, unknown>>) : [];
    const firstOptionId = String(options[0]?.id || '').trim();
    if (!firstOptionId) return null;

    if (type === 'COMPLEX_MULTIPLE_CHOICE') {
        return [firstOptionId];
    }

    return firstOptionId;
}

function buildAnswerPayload(questions: Record<string, unknown>[], ratio: number): Record<string, unknown> {
    const safeRatio = Math.max(0, Math.min(1, ratio));
    const answerLimit = safeRatio >= 1 ? questions.length : Math.max(1, Math.floor(questions.length * safeRatio));
    const payload: Record<string, unknown> = {};

    questions.slice(0, answerLimit).forEach((question) => {
        const questionId = String(question.id || '').trim();
        if (!questionId) return;
        const answerValue = answerForQuestion(question);
        if (answerValue === null || answerValue === undefined) return;
        payload[questionId] = answerValue;
    });

    return payload;
}

async function resolveSlotSelection(): Promise<{
    academicYearId: number;
    academicYearName: string;
    semester: Semester;
    selectedSlot: SlotSelection;
    targets: StudentTarget[];
}> {
    const activeAcademicYear = await prisma.academicYear.findFirst({
        where: { isActive: true },
        select: {
            id: true,
            name: true,
            semester1End: true,
            semester2Start: true,
            semester2End: true,
        },
    });

    if (!activeAcademicYear) {
        throw new Error('Tahun ajaran aktif tidak ditemukan.');
    }

    const semester = resolveCurrentSemester({
        semester1End: activeAcademicYear.semester1End,
        semester2Start: activeAcademicYear.semester2Start,
        semester2End: activeAcademicYear.semester2End,
        now: new Date(),
    });

    const rawSchedules = await prisma.examSchedule.findMany({
        where: {
            isActive: true,
            academicYearId: activeAcademicYear.id,
            semester,
            classId: { not: null },
            packet: {
                is: {
                    programCode: LOAD_TEST_PROGRAM_CODE,
                },
            },
        },
        select: {
            id: true,
            classId: true,
            startTime: true,
            endTime: true,
            examType: true,
            packet: {
                select: {
                    id: true,
                    title: true,
                    type: true,
                    programCode: true,
                    subjectId: true,
                    academicYearId: true,
                    semester: true,
                    questions: true,
                    subject: {
                        select: {
                            name: true,
                            code: true,
                        },
                    },
                },
            },
        },
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });

    const schedulesWithoutNullClass = rawSchedules.filter(
        (row): row is typeof row & { classId: number; packet: NonNullable<typeof row.packet> } =>
            Number.isFinite(Number(row.classId)) && Boolean(row.packet),
    );

    if (!schedulesWithoutNullClass.length) {
        throw new Error('Jadwal SBTS aktif tidak ditemukan untuk semester aktif.');
    }

    const classIds = Array.from(new Set(schedulesWithoutNullClass.map((row) => Number(row.classId))));
    const [classes, students] = await Promise.all([
        prisma.class.findMany({
            where: { id: { in: classIds } },
            select: { id: true, name: true },
        }),
        prisma.user.findMany({
            where: {
                role: 'STUDENT',
                studentStatus: 'ACTIVE',
                classId: { in: classIds },
            },
            select: {
                id: true,
                name: true,
                classId: true,
            },
            orderBy: [{ classId: 'asc' }, { id: 'asc' }],
        }),
    ]);

    const classById = new Map<number, ClassRow>(classes.map((item) => [item.id, item]));
    const studentsByClassId = new Map<number, StudentRow[]>();
    students.forEach((student) => {
        if (!student.classId) return;
        const current = studentsByClassId.get(student.classId) || [];
        current.push({
            id: student.id,
            name: String(student.name || '').trim() || `Siswa ${student.id}`,
            classId: student.classId,
        });
        studentsByClassId.set(student.classId, current);
    });

    const normalizedSchedules: ScheduleRow[] = schedulesWithoutNullClass.map((row) => ({
        id: row.id,
        classId: Number(row.classId),
        className: classById.get(Number(row.classId))?.name || `Kelas ${row.classId}`,
        startTime: row.startTime,
        endTime: row.endTime,
        examType: row.examType,
        packetId: Number(row.packet.id),
        packetTitle: String(row.packet.title || '').trim() || `Packet ${row.packet.id}`,
        packetType: String(row.packet.type || '').trim(),
        programCode: row.packet.programCode,
        subjectId: Number(row.packet.subjectId),
        subjectName: String(row.packet.subject?.name || '').trim() || `Subject ${row.packet.subjectId}`,
        subjectCode: String(row.packet.subject?.code || '').trim() || '-',
        academicYearId: Number(row.packet.academicYearId),
        semester: row.packet.semester,
        packetQuestions: Array.isArray(row.packet.questions)
            ? (row.packet.questions as Record<string, unknown>[])
            : [],
    }));

    const groups = new Map<
        string,
        {
            startTime: Date;
            endTime: Date;
            schedules: ScheduleRow[];
            classIds: Set<number>;
            studentCount: number;
            weightedPacketBytes: number;
            packetBytes: number;
        }
    >();

    normalizedSchedules.forEach((schedule) => {
        const slotKey = `${schedule.startTime.toISOString()}__${schedule.endTime.toISOString()}`;
        const packetBytes = Buffer.byteLength(JSON.stringify(schedule.packetQuestions));
        const classStudentCount = studentsByClassId.get(schedule.classId)?.length || 0;
        const existing =
            groups.get(slotKey) ||
            {
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                schedules: [],
                classIds: new Set<number>(),
                studentCount: 0,
                weightedPacketBytes: 0,
                packetBytes: 0,
            };

        if (existing.classIds.has(schedule.classId)) {
            throw new Error(
                `Slot ${slotKey} memiliki lebih dari satu jadwal untuk classId ${schedule.classId}. Load test dibatalkan demi aman.`,
            );
        }

        existing.schedules.push(schedule);
        existing.classIds.add(schedule.classId);
        existing.studentCount += classStudentCount;
        existing.weightedPacketBytes += packetBytes * classStudentCount;
        existing.packetBytes += packetBytes;
        groups.set(slotKey, existing);
    });

    const orderedGroups = Array.from(groups.entries())
        .map(([key, value]) => ({
            key,
            ...value,
        }))
        .sort((left, right) => {
            if (right.studentCount !== left.studentCount) return right.studentCount - left.studentCount;
            if (right.weightedPacketBytes !== left.weightedPacketBytes) {
                return right.weightedPacketBytes - left.weightedPacketBytes;
            }
            return left.startTime.getTime() - right.startTime.getTime();
        });

    const selectedGroup = orderedGroups[0];
    if (!selectedGroup) {
        throw new Error('Tidak ada slot SBTS yang bisa dipilih untuk load test.');
    }

    const scheduleByClassId = new Map<number, ScheduleRow>(
        selectedGroup.schedules.map((schedule) => [schedule.classId, schedule]),
    );

    const targets = Array.from(scheduleByClassId.entries())
        .flatMap(([classId, schedule]) =>
            (studentsByClassId.get(classId) || []).map((student) => ({
                studentId: student.id,
                studentName: student.name,
                classId: student.classId,
                className: schedule.className,
                scheduleId: schedule.id,
            })),
        )
        .sort((left, right) => left.studentId - right.studentId);

    const selectedSlot: SlotSelection = {
        key: selectedGroup.key,
        startTime: selectedGroup.startTime.toISOString(),
        endTime: selectedGroup.endTime.toISOString(),
        studentCount: selectedGroup.studentCount,
        weightedPacketBytes: selectedGroup.weightedPacketBytes,
        packetBytes: selectedGroup.packetBytes,
        scheduleCount: selectedGroup.schedules.length,
        schedules: selectedGroup.schedules.map((schedule) => ({
            scheduleId: schedule.id,
            classId: schedule.classId,
            className: schedule.className,
            packetId: schedule.packetId,
            packetTitle: schedule.packetTitle,
            subjectId: schedule.subjectId,
            subjectName: schedule.subjectName,
            subjectCode: schedule.subjectCode,
            studentCount: studentsByClassId.get(schedule.classId)?.length || 0,
            packetBytes: Buffer.byteLength(JSON.stringify(schedule.packetQuestions)),
            academicYearId: schedule.academicYearId,
            semester: schedule.semester,
            programCode: schedule.programCode,
            examType: schedule.examType,
        })),
    };

    return {
        academicYearId: activeAcademicYear.id,
        academicYearName: activeAcademicYear.name,
        semester,
        selectedSlot,
        targets,
    };
}

async function snapshotCurrentState(params: {
    academicYearId: number;
    academicYearName: string;
    semester: Semester;
    selectedSlot: SlotSelection;
    targets: StudentTarget[];
    snapshotPath: string;
}): Promise<SnapshotPayload> {
    const scheduleIds = Array.from(new Set(params.targets.map((item) => item.scheduleId)));
    const studentIds = Array.from(new Set(params.targets.map((item) => item.studentId)));
    const subjectIds = Array.from(new Set(params.selectedSlot.schedules.map((item) => item.subjectId)));

    const [studentExamSessions, studentGrades, studentScoreEntries, reportGrades, gradeComponents] = await Promise.all([
        prisma.studentExamSession.findMany({
            where: {
                studentId: { in: studentIds },
                scheduleId: { in: scheduleIds },
            },
            orderBy: [{ id: 'asc' }],
        }),
        prisma.studentGrade.findMany({
            where: {
                studentId: { in: studentIds },
                subjectId: { in: subjectIds },
                academicYearId: params.academicYearId,
                semester: params.semester,
            },
            orderBy: [{ id: 'asc' }],
        }),
        prisma.studentScoreEntry.findMany({
            where: {
                studentId: { in: studentIds },
                subjectId: { in: subjectIds },
                academicYearId: params.academicYearId,
                semester: params.semester,
            },
            orderBy: [{ id: 'asc' }],
        }),
        prisma.reportGrade.findMany({
            where: {
                studentId: { in: studentIds },
                subjectId: { in: subjectIds },
                academicYearId: params.academicYearId,
                semester: params.semester,
            },
            orderBy: [{ id: 'asc' }],
        }),
        prisma.gradeComponent.findMany({
            where: {
                subjectId: { in: subjectIds },
            },
            orderBy: [{ id: 'asc' }],
        }),
    ]);

    if (studentExamSessions.length > 0) {
        throw new Error(
            `Ditemukan ${studentExamSessions.length} student_exam_sessions existing pada slot target. Load test dibatalkan agar tidak menimpa attempt yang sudah ada.`,
        );
    }

    const snapshotPayload: SnapshotPayload = {
        meta: {
            capturedAt: new Date().toISOString(),
            academicYearId: params.academicYearId,
            academicYearName: params.academicYearName,
            semester: params.semester,
            slot: params.selectedSlot,
            scheduleIds,
            studentIds,
            subjectIds,
        },
        tables: {
            studentExamSessions: studentExamSessions.map((row) => ({
                id: row.id,
                studentId: row.studentId,
                startTime: row.startTime.toISOString(),
                endTime: row.endTime ? row.endTime.toISOString() : null,
                answers: (row.answers as Prisma.JsonValue | null) ?? null,
                score: row.score,
                scheduleId: row.scheduleId,
                submitTime: row.submitTime ? row.submitTime.toISOString() : null,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
                status: row.status,
            })),
            studentGrades: studentGrades.map((row) => ({
                id: row.id,
                studentId: row.studentId,
                subjectId: row.subjectId,
                componentId: row.componentId,
                academicYearId: row.academicYearId,
                score: row.score,
                nf1: row.nf1,
                nf2: row.nf2,
                nf3: row.nf3,
                nf4: row.nf4,
                nf5: row.nf5,
                nf6: row.nf6,
                semester: row.semester,
            })),
            studentScoreEntries: studentScoreEntries.map((row) => ({
                id: row.id,
                studentId: row.studentId,
                subjectId: row.subjectId,
                academicYearId: row.academicYearId,
                semester: row.semester,
                componentCode: row.componentCode,
                componentType: row.componentType,
                componentTypeCode: row.componentTypeCode,
                reportSlot: row.reportSlot,
                reportSlotCode: row.reportSlotCode,
                score: row.score,
                rawScore: row.rawScore,
                maxScore: row.maxScore,
                sourceType: row.sourceType,
                sourceKey: row.sourceKey,
                metadata: (row.metadata as Prisma.JsonValue | null) ?? null,
                recordedAt: row.recordedAt.toISOString(),
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
            })),
            reportGrades: reportGrades.map((row) => ({
                id: row.id,
                studentId: row.studentId,
                subjectId: row.subjectId,
                academicYearId: row.academicYearId,
                finalScore: row.finalScore,
                predicate: row.predicate,
                description: row.description,
                formatifScore: row.formatifScore,
                sasScore: row.sasScore,
                sbtsScore: row.sbtsScore,
                slotScores: (row.slotScores as Prisma.JsonValue | null) ?? null,
                semester: row.semester,
                usScore: row.usScore,
            })),
            gradeComponents: gradeComponents.map((row) => ({
                id: row.id,
                code: row.code,
                name: row.name,
                weight: row.weight,
                isActive: row.isActive,
                subjectId: row.subjectId,
                type: row.type,
                typeCode: row.typeCode,
            })),
        },
    };

    await mkdir(path.dirname(params.snapshotPath), { recursive: true });
    await writeFile(params.snapshotPath, `${JSON.stringify(snapshotPayload, null, 2)}\n`, 'utf8');

    return snapshotPayload;
}

async function restoreSnapshot(snapshot: SnapshotPayload) {
    await prisma.$transaction(async (tx) => {
        await tx.studentExamSession.deleteMany({
            where: {
                studentId: { in: snapshot.meta.studentIds },
                scheduleId: { in: snapshot.meta.scheduleIds },
            },
        });

        await tx.studentScoreEntry.deleteMany({
            where: {
                studentId: { in: snapshot.meta.studentIds },
                subjectId: { in: snapshot.meta.subjectIds },
                academicYearId: snapshot.meta.academicYearId,
                semester: snapshot.meta.semester,
            },
        });

        await tx.studentGrade.deleteMany({
            where: {
                studentId: { in: snapshot.meta.studentIds },
                subjectId: { in: snapshot.meta.subjectIds },
                academicYearId: snapshot.meta.academicYearId,
                semester: snapshot.meta.semester,
            },
        });

        await tx.reportGrade.deleteMany({
            where: {
                studentId: { in: snapshot.meta.studentIds },
                subjectId: { in: snapshot.meta.subjectIds },
                academicYearId: snapshot.meta.academicYearId,
                semester: snapshot.meta.semester,
            },
        });

        await createManyInChunks(snapshot.tables.studentExamSessions, 250, async (chunk) => {
            await tx.studentExamSession.createMany({
                data: chunk.map((row) => ({
                    id: row.id,
                    studentId: row.studentId,
                    startTime: row.startTime,
                    endTime: row.endTime,
                    answers: toNullableJsonInput(row.answers),
                    score: row.score,
                    scheduleId: row.scheduleId,
                    submitTime: row.submitTime,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                    status: row.status as any,
                })),
            });
        });

        await createManyInChunks(snapshot.tables.studentGrades, 500, async (chunk) => {
            await tx.studentGrade.createMany({
                data: chunk.map((row) => ({
                    id: row.id,
                    studentId: row.studentId,
                    subjectId: row.subjectId,
                    componentId: row.componentId,
                    academicYearId: row.academicYearId,
                    score: row.score,
                    nf1: row.nf1,
                    nf2: row.nf2,
                    nf3: row.nf3,
                    nf4: row.nf4,
                    nf5: row.nf5,
                    nf6: row.nf6,
                    semester: row.semester,
                })),
            });
        });

        await createManyInChunks(snapshot.tables.studentScoreEntries, 500, async (chunk) => {
            await tx.studentScoreEntry.createMany({
                data: chunk.map((row) => ({
                    id: row.id,
                    studentId: row.studentId,
                    subjectId: row.subjectId,
                    academicYearId: row.academicYearId,
                    semester: row.semester,
                    componentCode: row.componentCode,
                    componentType: row.componentType as any,
                    componentTypeCode: row.componentTypeCode,
                    reportSlot: row.reportSlot as any,
                    reportSlotCode: row.reportSlotCode,
                    score: row.score,
                    rawScore: row.rawScore,
                    maxScore: row.maxScore,
                    sourceType: row.sourceType as any,
                    sourceKey: row.sourceKey,
                    metadata: toNullableJsonInput(row.metadata),
                    recordedAt: row.recordedAt,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                })),
            });
        });

        await createManyInChunks(snapshot.tables.reportGrades, 500, async (chunk) => {
            await tx.reportGrade.createMany({
                data: chunk.map((row) => ({
                    id: row.id,
                    studentId: row.studentId,
                    subjectId: row.subjectId,
                    academicYearId: row.academicYearId,
                    finalScore: row.finalScore,
                    predicate: row.predicate,
                    description: row.description,
                    formatifScore: row.formatifScore,
                    sasScore: row.sasScore,
                    sbtsScore: row.sbtsScore,
                    slotScores: toNullableJsonInput(row.slotScores),
                    semester: row.semester,
                    usScore: row.usScore,
                })),
            });
        });

        const snapshotGradeComponentIds = new Set(snapshot.tables.gradeComponents.map((row) => row.id));
        const currentGradeComponents = await tx.gradeComponent.findMany({
            where: {
                subjectId: { in: snapshot.meta.subjectIds },
            },
            select: { id: true },
        });
        const extraGradeComponentIds = currentGradeComponents
            .map((row) => row.id)
            .filter((id) => !snapshotGradeComponentIds.has(id));

        if (extraGradeComponentIds.length > 0) {
            await tx.gradeComponent.deleteMany({
                where: {
                    id: { in: extraGradeComponentIds },
                },
            });
        }
    });

    const [studentExamSessionCount, studentGradeCount, studentScoreEntryCount, reportGradeCount, currentGradeComponentIds] =
        await Promise.all([
            prisma.studentExamSession.count({
                where: {
                    studentId: { in: snapshot.meta.studentIds },
                    scheduleId: { in: snapshot.meta.scheduleIds },
                },
            }),
            prisma.studentGrade.count({
                where: {
                    studentId: { in: snapshot.meta.studentIds },
                    subjectId: { in: snapshot.meta.subjectIds },
                    academicYearId: snapshot.meta.academicYearId,
                    semester: snapshot.meta.semester,
                },
            }),
            prisma.studentScoreEntry.count({
                where: {
                    studentId: { in: snapshot.meta.studentIds },
                    subjectId: { in: snapshot.meta.subjectIds },
                    academicYearId: snapshot.meta.academicYearId,
                    semester: snapshot.meta.semester,
                },
            }),
            prisma.reportGrade.count({
                where: {
                    studentId: { in: snapshot.meta.studentIds },
                    subjectId: { in: snapshot.meta.subjectIds },
                    academicYearId: snapshot.meta.academicYearId,
                    semester: snapshot.meta.semester,
                },
            }),
            prisma.gradeComponent.findMany({
                where: {
                    subjectId: { in: snapshot.meta.subjectIds },
                },
                select: { id: true },
            }),
        ]);

    const currentGradeComponentIdSet = new Set(currentGradeComponentIds.map((row) => row.id));
    const snapshotGradeComponentIdSet = new Set(snapshot.tables.gradeComponents.map((row) => row.id));

    return {
        studentExamSessionCount,
        expectedStudentExamSessionCount: snapshot.tables.studentExamSessions.length,
        studentGradeCount,
        expectedStudentGradeCount: snapshot.tables.studentGrades.length,
        studentScoreEntryCount,
        expectedStudentScoreEntryCount: snapshot.tables.studentScoreEntries.length,
        reportGradeCount,
        expectedReportGradeCount: snapshot.tables.reportGrades.length,
        gradeComponentsMatch:
            currentGradeComponentIdSet.size === snapshotGradeComponentIdSet.size &&
            Array.from(snapshotGradeComponentIdSet).every((id) => currentGradeComponentIdSet.has(id)),
    };
}

async function loadSnapshotFromFile(snapshotPath: string): Promise<SnapshotPayload> {
    const raw = await readFile(snapshotPath, 'utf8');
    return JSON.parse(raw) as SnapshotPayload;
}

async function requestPhase<TPayload>(params: {
    baseUrl: string;
    target: StudentTarget;
    method: 'GET' | 'POST';
    url: string;
    body?: Record<string, unknown>;
    payloadExtractor?: (data: any) => TPayload;
}): Promise<PhaseResult<TPayload>> {
    const startedAt = performance.now();

    try {
        const response = await axios.request({
            baseURL: params.baseUrl,
            url: params.url,
            method: params.method,
            data: params.body,
            headers: buildRequestHeaders(params.target.studentId),
            httpAgent: new http.Agent({
                keepAlive: true,
                maxSockets: 512,
            }),
            timeout: 60_000,
            validateStatus: () => true,
        });

        const payload = response.data?.data;
        const ok = response.status >= 200 && response.status < 300;
        const elapsedMs = performance.now() - startedAt;
        const extractedPayload = ok && params.payloadExtractor ? params.payloadExtractor(response.data) : undefined;
        const errorMessage = ok
            ? null
            : String(response.data?.message || response.statusText || 'Unknown error').trim() || 'Unknown error';

        return {
            ok,
            studentId: params.target.studentId,
            scheduleId: params.target.scheduleId,
            statusCode: response.status,
            latencyMs: Number(elapsedMs.toFixed(2)),
            responseBytes: stringifyResponseBytes(response.data),
            errorMessage,
            payload: extractedPayload,
        };
    } catch (error) {
        const elapsedMs = performance.now() - startedAt;
        const message = error instanceof Error ? error.message : String(error);
        return {
            ok: false,
            studentId: params.target.studentId,
            scheduleId: params.target.scheduleId,
            statusCode: 0,
            latencyMs: Number(elapsedMs.toFixed(2)),
            responseBytes: 0,
            errorMessage: message,
        };
    }
}

async function executeBurstPhase<TPayload>(runner: () => Promise<Array<PhaseResult<TPayload>>>) {
    const startedAt = performance.now();
    const results = await runner();
    const durationMs = performance.now() - startedAt;
    return {
        results,
        summary: serializePhaseSummary(results, durationMs),
    };
}

async function executeSpreadPhase<TPayload>(params: {
    items: StartedExam[];
    windowMs: number;
    runner: (item: StartedExam) => Promise<PhaseResult<TPayload>>;
}) {
    const startedAt = performance.now();
    const promises = params.items.map(
        (item, index) =>
            new Promise<PhaseResult<TPayload>>((resolve) => {
                const offsetMs =
                    params.items.length <= 1 ? 0 : Math.floor((index * params.windowMs) / params.items.length);

                setTimeout(() => {
                    void params
                        .runner(item)
                        .then(resolve)
                        .catch((error) => {
                            const message = error instanceof Error ? error.message : String(error);
                            resolve({
                                ok: false,
                                studentId: item.target.studentId,
                                scheduleId: item.target.scheduleId,
                                statusCode: 0,
                                latencyMs: 0,
                                responseBytes: 0,
                                errorMessage: message,
                            });
                        });
                }, offsetMs);
            }),
    );

    const results = await Promise.all(promises);
    const durationMs = performance.now() - startedAt;

    return {
        results,
        summary: serializePhaseSummary(results, durationMs),
    };
}

async function runLoadTest(args: CliArgs) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = args.reportPath || path.join(DEFAULT_REPORT_DIR, `sbts-load-test-report-${timestamp}.json`);
    const snapshotPath = args.snapshotPath || path.join(DEFAULT_REPORT_DIR, `sbts-load-test-snapshot-${timestamp}.json`);
    const baseUrl = buildBaseUrl();
    const slotContext = await resolveSlotSelection();
    const snapshot = await snapshotCurrentState({
        academicYearId: slotContext.academicYearId,
        academicYearName: slotContext.academicYearName,
        semester: slotContext.semester,
        selectedSlot: slotContext.selectedSlot,
        targets: slotContext.targets,
        snapshotPath,
    });

    const report: Record<string, unknown> = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        academicYear: {
            id: slotContext.academicYearId,
            name: slotContext.academicYearName,
            semester: slotContext.semester,
        },
        slot: slotContext.selectedSlot,
        options: {
            autosaveRounds: args.autosaveRounds,
            autosaveWindowMs: args.autosaveWindowMs,
            skipAvailable: args.skipAvailable,
        },
        snapshotPath,
    };

    let restoreResult: Record<string, unknown> | null = null;
    let shouldDeleteSnapshot = false;

    try {
        if (!args.skipAvailable) {
            const availablePhase = await executeBurstPhase(async () =>
                Promise.all(
                    slotContext.targets.map((target) =>
                        requestPhase({
                            baseUrl,
                            target,
                            method: 'GET',
                            url: `/exams/available?_t=${Date.now()}`,
                            payloadExtractor: (envelope) => {
                                const exams = Array.isArray(envelope?.data?.exams) ? envelope.data.exams : [];
                                const targetExam = exams.find((item: any) => Number(item?.id) === target.scheduleId) || null;
                                return {
                                    hasTargetExam: Boolean(targetExam),
                                    isBlocked: Boolean(targetExam?.isBlocked),
                                    status: targetExam?.status || null,
                                };
                            },
                        }),
                    ),
                ),
            );

            const availabilityChecks = availablePhase.results.map((item) => ({
                studentId: item.studentId,
                scheduleId: item.scheduleId,
                hasTargetExam: Boolean((item.payload as any)?.hasTargetExam),
                isBlocked: Boolean((item.payload as any)?.isBlocked),
                status: (item.payload as any)?.status || null,
                ok: item.ok,
                errorMessage: item.errorMessage,
            }));

            report.availablePhase = {
                summary: availablePhase.summary,
                missingTargetCount: availabilityChecks.filter((item) => item.ok && !item.hasTargetExam).length,
                blockedCount: availabilityChecks.filter((item) => item.ok && item.isBlocked).length,
                sampleIssues: availabilityChecks.filter((item) => !item.ok || !item.hasTargetExam || item.isBlocked).slice(0, 20),
            };
        }

        const startPhase = await executeBurstPhase(async () =>
            Promise.all(
                slotContext.targets.map((target) =>
                    requestPhase({
                        baseUrl,
                        target,
                        method: 'GET',
                        url: `/exams/${target.scheduleId}/start?_t=${Date.now()}`,
                        payloadExtractor: (envelope) => {
                            const payload = envelope?.data;
                            const packet = payload?.packet || {};
                            const questions = Array.isArray(packet?.questions) ? packet.questions : [];
                            return {
                                packetTitle: String(packet?.title || '').trim() || `Schedule ${target.scheduleId}`,
                                questionCount: questions.length,
                                questions,
                            };
                        },
                    }),
                ),
            ),
        );

        const startedExams = startPhase.results
            .filter((item) => item.ok && item.payload)
            .map((item) => ({
                target: slotContext.targets.find((target) => target.studentId === item.studentId)!,
                packetTitle: String((item.payload as any).packetTitle || ''),
                questionCount: Number((item.payload as any).questionCount || 0),
                questions: Array.isArray((item.payload as any).questions)
                    ? ((item.payload as any).questions as Record<string, unknown>[])
                    : [],
            }));

        report.startPhase = {
            summary: startPhase.summary,
            startedStudentCount: startedExams.length,
            questionCountRange: {
                min: startedExams.length ? Math.min(...startedExams.map((item) => item.questionCount)) : 0,
                max: startedExams.length ? Math.max(...startedExams.map((item) => item.questionCount)) : 0,
            },
        };

        if (startedExams.length !== slotContext.targets.length) {
            throw new Error(
                `Start exam hanya berhasil untuk ${startedExams.length}/${slotContext.targets.length} siswa. Load test dihentikan sebelum autosave.`,
            );
        }

        const autosaveRatios =
            args.autosaveRounds <= 0
                ? []
                : Array.from({ length: args.autosaveRounds }, (_, index) =>
                      Number(((index + 1) / (args.autosaveRounds + 1)).toFixed(4)),
                  );

        const autosavePhases: Array<Record<string, unknown>> = [];
        for (let index = 0; index < autosaveRatios.length; index += 1) {
            const ratio = autosaveRatios[index];
            const autosavePhase = await executeSpreadPhase({
                items: startedExams,
                windowMs: args.autosaveWindowMs,
                runner: async (item) =>
                    requestPhase({
                        baseUrl,
                        target: item.target,
                        method: 'POST',
                        url: `/exams/${item.target.scheduleId}/answers`,
                        body: {
                            answers: buildAnswerPayload(item.questions, ratio),
                            finish: false,
                            is_final_submit: false,
                        },
                    }),
            });

            autosavePhases.push({
                round: index + 1,
                ratio,
                summary: autosavePhase.summary,
            });
        }
        report.autosavePhases = autosavePhases;

        const finalSubmitPhase = await executeBurstPhase(async () =>
            Promise.all(
                startedExams.map((item) =>
                    requestPhase({
                        baseUrl,
                        target: item.target,
                        method: 'POST',
                        url: `/exams/${item.target.scheduleId}/answers`,
                        body: {
                            answers: buildAnswerPayload(item.questions, 1),
                            finish: true,
                            is_final_submit: true,
                        },
                    }),
                ),
            ),
        );

        report.finalSubmitPhase = {
            summary: finalSubmitPhase.summary,
        };

        const [completedSessionCount, timeoutSessionCount] = await Promise.all([
            prisma.studentExamSession.count({
                where: {
                    studentId: { in: snapshot.meta.studentIds },
                    scheduleId: { in: snapshot.meta.scheduleIds },
                    status: 'COMPLETED',
                },
            }),
            prisma.studentExamSession.count({
                where: {
                    studentId: { in: snapshot.meta.studentIds },
                    scheduleId: { in: snapshot.meta.scheduleIds },
                    status: 'TIMEOUT',
                },
            }),
        ]);

        report.postRunState = {
            completedSessionCount,
            timeoutSessionCount,
        };
    } finally {
        restoreResult = await restoreSnapshot(snapshot);
        report.restore = restoreResult;
        shouldDeleteSnapshot = true;
        await mkdir(path.dirname(reportPath), { recursive: true });
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    if (shouldDeleteSnapshot && !args.keepSnapshot) {
        await rm(snapshotPath, { force: true });
    }

    process.stdout.write(
        `${JSON.stringify(
            {
                reportPath,
                snapshotPath: args.keepSnapshot ? snapshotPath : null,
                slot: slotContext.selectedSlot,
                restore: restoreResult,
            },
            null,
            2,
        )}\n`,
    );
}

async function runRestoreOnly(snapshotPath: string) {
    const snapshot = await loadSnapshotFromFile(snapshotPath);
    const result = await restoreSnapshot(snapshot);
    process.stdout.write(
        `${JSON.stringify(
            {
                restoredAt: new Date().toISOString(),
                snapshotPath,
                result,
            },
            null,
            2,
        )}\n`,
    );
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.mode === 'restore') {
        await runRestoreOnly(args.snapshotPath as string);
        return;
    }

    await runLoadTest(args);
}

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
