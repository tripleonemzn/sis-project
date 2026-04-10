import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { AdditionalDuty, ExamSessionStatus, Prisma, Semester } from '@prisma/client';
import QRCode from 'qrcode';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';
import {
    listHistoricalStudentsByIdsForAcademicYear,
    listHistoricalStudentsForClass,
} from '../utils/studentAcademicHistory';
import { createManyInAppNotifications } from '../services/mobilePushNotification.service';
import {
    getExamRequesterProfile,
    hasCurriculumExamManagementDuty,
} from '../utils/examManagementAccess';
import { listExamSittingRoomSlots, type ExamSittingRoomSlotRow } from '../services/examSittingRoomSlot.service';

const SCHOOL_NAME = 'SMKS Karya Guna Bhakti 2';
const SCHOOL_LOGO_PATH = '/logo-kgb2.png';
const FOUNDATION_LOGO_PATH = '/logo-yayasan.png';
const SCHOOL_FOUNDATION_NAME = 'YAYASAN PENDIDIKAN AL AMIEN';
const SCHOOL_FORMAL_NAME = 'SEKOLAH MENENGAH KEJURUAN (SMK) KARYA GUNA BHAKTI 2';
const SCHOOL_NSS = '342026504072';
const SCHOOL_NPSN = '20223112';
const SCHOOL_ACCREDITATION_LABEL = 'STATUS TERAKREDITASI A';
const SCHOOL_EMAIL = 'info@siskgb2.id';
const SCHOOL_WEBSITE = 'www.smkkgb2.sch.id | www.siskgb2.id';
const SCHOOL_CAMPUSES = [
    {
        label: 'Kampus A',
        address: 'Jl. Anggrek 1 RT. 002/016 Duren Jaya Kota Bekasi Telp. (021) 88352851',
    },
    {
        label: 'Kampus B',
        address: 'Jl. H. Ujan RT. 05/07 Duren Jaya Kota Bekasi Telp. 081211625618',
    },
] as const;
const FALLBACK_COMPETENCY_NAMES = [
    'Teknik Komputer dan Jaringan',
    'Manajemen Perkantoran',
    'Akuntansi',
] as const;
const roomNameCollator = new Intl.Collator('id', {
    numeric: true,
    sensitivity: 'base',
});

function countAnsweredEntries(rawAnswers: unknown): number {
    if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) return 0;
    const entries = Object.entries(rawAnswers as Record<string, unknown>).filter(([key]) => !key.startsWith('__'));
    return entries.reduce((total, [, value]) => {
        if (value === null || value === undefined) return total;
        if (Array.isArray(value)) return total + (value.length > 0 ? 1 : 0);
        if (typeof value === 'string') return total + (value.trim() !== '' ? 1 : 0);
        return total + 1;
    }, 0);
}

function parseMonitoringSummary(rawAnswers: unknown): {
    totalViolations: number;
    tabSwitchCount: number;
    fullscreenExitCount: number;
    appSwitchCount: number;
    lastViolationType: string | null;
    lastViolationAt: string | null;
    currentQuestionIndex: number;
    currentQuestionNumber: number;
    currentQuestionId: string | null;
    lastSyncAt: string | null;
} {
    const defaultValue = {
        totalViolations: 0,
        tabSwitchCount: 0,
        fullscreenExitCount: 0,
        appSwitchCount: 0,
        lastViolationType: null,
        lastViolationAt: null,
        currentQuestionIndex: 0,
        currentQuestionNumber: 1,
        currentQuestionId: null,
        lastSyncAt: null,
    };
    if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) return defaultValue;
    const monitoring = (rawAnswers as Record<string, any>).__monitoring;
    if (!monitoring || typeof monitoring !== 'object') return defaultValue;
    return {
        totalViolations: Number(monitoring.totalViolations || 0),
        tabSwitchCount: Number(monitoring.tabSwitchCount || 0),
        fullscreenExitCount: Number(monitoring.fullscreenExitCount || 0),
        appSwitchCount: Number(monitoring.appSwitchCount || 0),
        lastViolationType: monitoring.lastViolationType ? String(monitoring.lastViolationType) : null,
        lastViolationAt: monitoring.lastViolationAt ? String(monitoring.lastViolationAt) : null,
        currentQuestionIndex: Number.isFinite(Number(monitoring.currentQuestionIndex))
            ? Number(monitoring.currentQuestionIndex)
            : 0,
        currentQuestionNumber: Number.isFinite(Number(monitoring.currentQuestionNumber))
            ? Number(monitoring.currentQuestionNumber)
            : 1,
        currentQuestionId: monitoring.currentQuestionId ? String(monitoring.currentQuestionId) : null,
        lastSyncAt: monitoring.lastSyncAt ? String(monitoring.lastSyncAt) : null,
    };
}

function normalizeSessionLabel(rawValue: unknown): string | null {
    const normalized = String(rawValue || '')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized ? normalized.toLowerCase() : null;
}

function normalizeExamTypeKey(rawValue: unknown): string {
    return String(rawValue || '')
        .trim()
        .toUpperCase()
        .replace(/QUIZ/g, 'FORMATIF')
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function resolveExamTypeCandidates(rawValue: unknown): string[] {
    const normalized = normalizeExamTypeKey(rawValue);
    if (!normalized) return [];

    const candidates = new Set<string>([normalized]);

    const isFinalFamily = [
        'FINAL',
        'SAS',
        'SAT',
        'PAS',
        'PAT',
        'SAS_SAT',
        'SUMATIF_AKHIR_SEMESTER',
        'SUMATIF_AKHIR_TAHUN',
    ].includes(normalized);
    if (isFinalFamily) {
        candidates.add('FINAL');
        candidates.add('SAS');
        candidates.add('SAT');
    }

    const isMidtermFamily = ['MIDTERM', 'SBTS', 'SUMATIF_BERSAMA_TENGAH_SEMESTER'].includes(normalized);
    if (isMidtermFamily) {
        candidates.add('MIDTERM');
        candidates.add('SBTS');
    }

    const isFormativeFamily = ['FORMATIF', 'FORMATIVE', 'UH', 'ULANGAN_HARIAN'].includes(normalized);
    if (isFormativeFamily) {
        candidates.add('FORMATIF');
        candidates.add('UH');
        candidates.add('ULANGAN_HARIAN');
    }

    return Array.from(candidates.values());
}

function hasExamTypeIntersection(left: unknown, right: unknown): boolean {
    const leftCandidates = new Set(resolveExamTypeCandidates(left));
    const rightCandidates = resolveExamTypeCandidates(right);
    return rightCandidates.some((candidate) => leftCandidates.has(candidate));
}

function isSameSlotTime(
    leftStart: Date | null | undefined,
    leftEnd: Date | null | undefined,
    rightStart: Date | null | undefined,
    rightEnd: Date | null | undefined,
): boolean {
    if (!leftStart || !leftEnd || !rightStart || !rightEnd) return true;
    const toleranceMs = 60_000; // toleransi 1 menit
    return (
        Math.abs(leftStart.getTime() - rightStart.getTime()) <= toleranceMs &&
        Math.abs(leftEnd.getTime() - rightEnd.getTime()) <= toleranceMs
    );
}

function isSameSessionScope(params: {
    leftSessionId?: number | null;
    leftSessionLabel?: string | null;
    rightSessionId?: number | null;
    rightSessionLabel?: string | null;
}): boolean {
    const leftSessionId =
        Number.isFinite(Number(params.leftSessionId)) && Number(params.leftSessionId) > 0
            ? Number(params.leftSessionId)
            : null;
    const rightSessionId =
        Number.isFinite(Number(params.rightSessionId)) && Number(params.rightSessionId) > 0
            ? Number(params.rightSessionId)
            : null;

    if (leftSessionId && rightSessionId) return leftSessionId === rightSessionId;
    if (leftSessionId || rightSessionId) return false;

    const leftLabel = normalizeSessionLabel(params.leftSessionLabel);
    const rightLabel = normalizeSessionLabel(params.rightSessionLabel);
    if (leftLabel || rightLabel) return leftLabel === rightLabel;
    return true;
}

function parseDateOnly(value: unknown): Date | null {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getFirstHeaderValue(value: string | string[] | undefined): string {
    const rawValue = Array.isArray(value) ? value[0] : value;
    return String(rawValue || '')
        .split(',')
        .map((item) => item.trim())
        .find((item) => item.length > 0) || '';
}

function resolvePublicAppBaseUrl(req: Request): string {
    const configuredBaseUrl = String(
        process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || process.env.FRONTEND_BASE_URL || '',
    ).trim();

    if (configuredBaseUrl) {
        const normalized =
            /^https?:\/\//i.test(configuredBaseUrl) ? configuredBaseUrl : `https://${configuredBaseUrl}`;
        return normalized.replace(/\/+$/, '');
    }

    const forwardedProto = getFirstHeaderValue(req.headers['x-forwarded-proto']);
    const forwardedHost = getFirstHeaderValue(req.headers['x-forwarded-host']);
    const host = forwardedHost || getFirstHeaderValue(req.headers.host);
    if (host) {
        const protocol = forwardedProto || req.protocol || 'https';
        return `${protocol}://${host}`.replace(/\/+$/, '');
    }

    return 'https://siskgb2.id';
}

function normalizeOptionalText(value: unknown): string | null {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    return normalized || null;
}

function normalizeMultilineText(value: unknown): string | null {
    const normalized = String(value || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');
    return normalized || null;
}

function composeProctorReportNotes(notes: unknown, incident: unknown): string | null {
    const noteParts = [normalizeMultilineText(notes), normalizeMultilineText(incident)].filter(Boolean) as string[];
    if (noteParts.length === 0) return null;
    return noteParts.join('\n\n');
}

function formatTimeLabel(value: Date | null | undefined): string {
    if (!value) return '-';
    return new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta',
    }).format(value);
}

function formatDateLabel(value: Date | null | undefined): string {
    if (!value) return '-';
    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
    }).format(value);
}

function getDatePieces(value: Date | null | undefined): {
    weekday: string;
    day: string;
    month: string;
    year: string;
    fullDateLabel: string;
} {
    if (!value) {
        return {
            weekday: '-',
            day: '-',
            month: '-',
            year: '-',
            fullDateLabel: '-',
        };
    }

    const date = new Date(value);
    return {
        weekday: new Intl.DateTimeFormat('id-ID', {
            weekday: 'long',
            timeZone: 'Asia/Jakarta',
        }).format(date),
        day: new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            timeZone: 'Asia/Jakarta',
        }).format(date),
        month: new Intl.DateTimeFormat('id-ID', {
            month: 'long',
            timeZone: 'Asia/Jakarta',
        }).format(date),
        year: new Intl.DateTimeFormat('id-ID', {
            year: 'numeric',
            timeZone: 'Asia/Jakarta',
        }).format(date),
        fullDateLabel: formatDateLabel(date),
    };
}

function sanitizeDocumentToken(value: unknown, fallback: string): string {
    const normalized = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || fallback;
}

function buildProctorReportDocumentNumber(params: {
    reportId: number;
    examType: string | null;
    executionDate: Date;
}): string {
    const examToken = sanitizeDocumentToken(params.examType, 'UJIAN');
    const dateToken = [
        params.executionDate.getFullYear(),
        String(params.executionDate.getMonth() + 1).padStart(2, '0'),
        String(params.executionDate.getDate()).padStart(2, '0'),
    ].join('');
    return `BAU/${examToken}/${dateToken}/${String(params.reportId).padStart(5, '0')}`;
}

function buildProctorAttendanceDocumentNumber(params: {
    reportId: number;
    examType: string | null;
    executionDate: Date;
}): string {
    const examToken = sanitizeDocumentToken(params.examType, 'UJIAN');
    const dateToken = [
        params.executionDate.getFullYear(),
        String(params.executionDate.getMonth() + 1).padStart(2, '0'),
        String(params.executionDate.getDate()).padStart(2, '0'),
    ].join('');
    return `DHU/${examToken}/${dateToken}/${String(params.reportId).padStart(5, '0')}`;
}

type ProctorReportDocumentSnapshot = {
    schoolName: string;
    schoolLogoPath: string;
    documentHeader: StandardSchoolDocumentHeaderSnapshot;
    title: string;
    examLabel: string;
    academicYearName: string;
    documentNumber: string;
    schedule: {
        subjectName: string;
        roomName: string;
        executionOrder: number | null;
        sessionLabel: string | null;
        classNames: string[];
        startTimeLabel: string;
        endTimeLabel: string;
        executionDateLabel: string;
        executionYear: string;
    };
    narrative: string;
    counts: {
        expectedParticipants: number;
        absentParticipants: number;
        presentParticipants: number;
    };
    notes: string | null;
    incident: string | null;
    submittedAt: string;
    proctor: {
        id: number;
        name: string;
        signatureLabel: string;
    };
    verification: {
        token: string;
        verificationUrl: string;
        note: string;
    };
};

type ProctorAttendanceParticipantSnapshot = {
    id: number;
    name: string;
    nis: string | null;
    className: string | null;
    status: 'PRESENT' | 'ABSENT';
    statusLabel: string;
    startTimeLabel: string;
    submitTimeLabel: string;
    absentReason: string | null;
    permissionStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
};

type StandardSchoolDocumentHeaderSnapshot = {
    foundationName: string;
    schoolFormalName: string;
    competencyNames: string[];
    nss: string;
    npsn: string;
    accreditationLabel: string;
    campuses: Array<{
        label: string;
        address: string;
    }>;
    email: string;
    website: string;
    foundationLogoPath: string;
    schoolLogoPath: string;
};

type ProctorAttendanceDocumentSnapshot = {
    documentHeader: StandardSchoolDocumentHeaderSnapshot;
    schoolName: string;
    schoolLogoPath: string;
    title: string;
    examLabel: string;
    academicYearName: string;
    documentNumber: string;
    schedule: {
        subjectName: string;
        roomName: string;
        executionOrder: number | null;
        sessionLabel: string | null;
        classNames: string[];
        startTimeLabel: string;
        endTimeLabel: string;
        executionDateLabel: string;
        executionYear: string;
    };
    counts: {
        expectedParticipants: number;
        absentParticipants: number;
        presentParticipants: number;
    };
    participants: ProctorAttendanceParticipantSnapshot[];
    submittedAt: string;
    proctor: {
        id: number;
        name: string;
        signatureLabel: string;
    };
    verification: {
        token: string;
        verificationUrl: string;
        note: string;
    };
};

function toDateRangeByDay(date: Date): { start: Date; end: Date } {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
}

async function resolveScheduleExecutionOrder(params: {
    academicYearId: number | null | undefined;
    examType: string | null | undefined;
    executionDate: Date;
    startTime: Date;
    endTime: Date;
}): Promise<number | null> {
    const { start, end } = toDateRangeByDay(params.executionDate);
    const where: Prisma.ExamScheduleWhereInput = {
        isActive: true,
        startTime: { gte: start, lt: end },
    };

    if (Number.isFinite(Number(params.academicYearId)) && Number(params.academicYearId) > 0) {
        where.academicYearId = Number(params.academicYearId);
    }

    const normalizedExamType = String(params.examType || '').trim().toUpperCase();
    if (normalizedExamType) {
        where.examType = normalizedExamType;
    }

    const schedules = await prisma.examSchedule.findMany({
        where,
        select: {
            startTime: true,
            endTime: true,
        },
        orderBy: [{ startTime: 'asc' }, { endTime: 'asc' }],
    });

    const slotKeys: string[] = [];
    for (const schedule of schedules) {
        const key = `${schedule.startTime.toISOString()}::${schedule.endTime.toISOString()}`;
        if (!slotKeys.includes(key)) {
            slotKeys.push(key);
        }
    }

    const currentKey = `${params.startTime.toISOString()}::${params.endTime.toISOString()}`;
    const slotIndex = slotKeys.indexOf(currentKey);
    return slotIndex >= 0 ? slotIndex + 1 : null;
}

type PermissionSnapshot = {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reason: string | null;
    approvalNote: string | null;
    approvedBy: {
        id: number;
        name: string;
        additionalDuties: AdditionalDuty[];
        role: string;
    } | null;
};

function resolveAbsentReason(permission: PermissionSnapshot | null): string {
    if (!permission) return 'Tidak ada pengajuan izin pada jadwal ini.';

    const requestedReason = String(permission.reason || '').trim();
    const approvalReason = String(permission.approvalNote || '').trim();
    const resolvedReason = approvalReason || requestedReason || 'Tanpa catatan.';
    const approverName = String(permission.approvedBy?.name || '').trim();
    const approverSuffix = approverName ? ` (${approverName})` : '';

    if (permission.status === 'REJECTED') {
        return `Izin ditolak wali kelas${approverSuffix}: ${resolvedReason}`;
    }
    if (permission.status === 'APPROVED') {
        return `Izin disetujui wali kelas${approverSuffix}: ${resolvedReason}`;
    }
    return `Pengajuan izin masih menunggu persetujuan wali kelas: ${resolvedReason}`;
}

type ProctorRoomScheduleScope = {
    id: number;
    classId: number | null;
    packetId: number | null;
    semester?: Semester | null;
    room: string | null;
    startTime: Date;
    endTime: Date;
    sessionId: number | null;
    sessionLabel: string | null;
    examType: string | null;
    academicYearId: number | null;
    subjectId: number | null;
    proctorId: number | null;
    class: {
        id: number;
        name: string;
    } | null;
};

function compareRoomNameNatural(left: string | null | undefined, right: string | null | undefined) {
    return roomNameCollator.compare(String(left || ''), String(right || ''));
}

function compareClassName(left: string | null | undefined, right: string | null | undefined) {
    return String(left || '').localeCompare(String(right || ''), 'id', {
        numeric: true,
        sensitivity: 'base',
    });
}

async function resolveSlotScopeForSchedule(params: {
    scheduleId: number;
    academicYearId: number | null;
    examType: string | null;
    semester?: Semester | null;
    date: Date | null;
    roomName?: string | null;
    subjectId?: number | null;
    classId?: number | null;
    preferredProctorId?: number | null;
}) {
    if (!Number.isFinite(Number(params.academicYearId)) || Number(params.academicYearId) <= 0 || !params.date) {
        return null;
    }

    const slotResponse = await listExamSittingRoomSlots({
        academicYearId: Number(params.academicYearId),
        examType: params.examType,
        semester: params.semester || null,
        date: params.date,
    });
    const candidateSlots = slotResponse.slots.filter((slot) => slot.scheduleIds.includes(params.scheduleId));
    if (candidateSlots.length === 0) return null;

    return candidateSlots
        .slice()
        .sort((a, b) => {
            const scoreFor = (slot: ExamSittingRoomSlotRow) => {
                let score = 0;
                if (
                    Number.isFinite(Number(params.preferredProctorId)) &&
                    Number(params.preferredProctorId) > 0 &&
                    Number(slot.proctorId) === Number(params.preferredProctorId)
                ) {
                    score += 100;
                }
                if (
                    String(params.roomName || '').trim() &&
                    String(slot.roomName || '').trim().toLowerCase() === String(params.roomName || '').trim().toLowerCase()
                ) {
                    score += 40;
                }
                if (
                    Number.isFinite(Number(params.subjectId)) &&
                    Number(params.subjectId) > 0 &&
                    Number(slot.subjectId) === Number(params.subjectId)
                ) {
                    score += 20;
                }
                if (
                    Number.isFinite(Number(params.classId)) &&
                    Number(params.classId) > 0 &&
                    Array.isArray(slot.classIds) &&
                    slot.classIds.includes(Number(params.classId))
                ) {
                    score += 10;
                }
                return score;
            };

            const scoreDiff = scoreFor(b) - scoreFor(a);
            if (scoreDiff !== 0) return scoreDiff;
            return compareRoomNameNatural(a.roomName, b.roomName);
        })[0] || null;
}

type ProctorRoomSittingRow = {
    id: number;
    roomName: string;
    academicYearId: number;
    examType: string;
    sessionId: number | null;
    sessionLabel: string | null;
    startTime: Date | null;
    endTime: Date | null;
    students: Array<{
        studentId: number;
    }>;
};

type ProctorHistoricalStudentRow = {
    id: number;
    name: string;
    nis: string | null;
    classId: number | null;
    className: string | null;
};

function buildProctorHistoricalStudentRowFromCurrentStudent(student: {
    id: number;
    name: string | null;
    nis: string | null;
    classId: number | null;
    studentClass?: { name?: string | null } | null;
}): ProctorHistoricalStudentRow {
    return {
        id: Number(student.id),
        name: String(student.name || '-'),
        nis: student.nis ? String(student.nis) : null,
        classId: Number.isFinite(Number(student.classId)) && Number(student.classId) > 0 ? Number(student.classId) : null,
        className: student.studentClass?.name ? String(student.studentClass.name) : null,
    };
}

function buildProctorHistoricalStudentRow(snapshot: {
    id: number;
    name: string;
    nis: string | null;
    studentClass?: { id?: number | null; name?: string | null } | null;
}): ProctorHistoricalStudentRow {
    return {
        id: Number(snapshot.id),
        name: String(snapshot.name || '-'),
        nis: snapshot.nis ? String(snapshot.nis) : null,
        classId:
            Number.isFinite(Number(snapshot.studentClass?.id)) && Number(snapshot.studentClass?.id) > 0
                ? Number(snapshot.studentClass?.id)
                : null,
        className: snapshot.studentClass?.name ? String(snapshot.studentClass.name) : null,
    };
}

function sortProctorHistoricalStudents(rows: ProctorHistoricalStudentRow[]): ProctorHistoricalStudentRow[] {
    return [...rows].sort((a, b) => {
        const classCompare = String(a.className || '').localeCompare(String(b.className || ''), 'id', {
            numeric: true,
            sensitivity: 'base',
        });
        if (classCompare !== 0) return classCompare;
        return String(a.name || '').localeCompare(String(b.name || ''), 'id', {
            numeric: true,
            sensitivity: 'base',
        });
    });
}

function collectHistoricalClassNames(rows: Array<{ className: string | null }>): string[] {
    return Array.from(new Set(rows.map((row) => String(row.className || '').trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }),
    );
}

async function listHistoricalProctorStudentsByIds(
    studentIds: number[],
    academicYearId: number | null | undefined,
): Promise<ProctorHistoricalStudentRow[]> {
    const normalizedStudentIds = Array.from(
        new Set(
            studentIds
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item) && item > 0),
        ),
    );
    if (normalizedStudentIds.length === 0) return [];

    if (Number.isFinite(Number(academicYearId)) && Number(academicYearId) > 0) {
        return sortProctorHistoricalStudents(
            (
                await listHistoricalStudentsByIdsForAcademicYear(normalizedStudentIds, Number(academicYearId))
            ).map((snapshot) => buildProctorHistoricalStudentRow(snapshot)),
        );
    }

    return sortProctorHistoricalStudents(
        (
            await prisma.user.findMany({
                where: {
                    id: { in: normalizedStudentIds },
                    role: 'STUDENT',
                },
                select: {
                    id: true,
                    name: true,
                    nis: true,
                    classId: true,
                    studentClass: {
                        select: {
                            name: true,
                        },
                    },
                },
            })
        ).map((student) => buildProctorHistoricalStudentRowFromCurrentStudent(student)),
    );
}

async function listHistoricalProctorStudentsForClasses(
    classIds: number[],
    academicYearId: number | null | undefined,
): Promise<ProctorHistoricalStudentRow[]> {
    const normalizedClassIds = Array.from(
        new Set(
            classIds
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item) && item > 0),
        ),
    );
    if (normalizedClassIds.length === 0) return [];

    if (Number.isFinite(Number(academicYearId)) && Number(academicYearId) > 0) {
        const seenStudentIds = new Set<number>();
        const rosterGroups = await Promise.all(
            normalizedClassIds.map(async (classId) => listHistoricalStudentsForClass(classId, Number(academicYearId))),
        );

        return sortProctorHistoricalStudents(
            rosterGroups
                .flatMap((rows) => rows)
                .map((snapshot) => buildProctorHistoricalStudentRow(snapshot))
                .filter((row) => {
                    if (seenStudentIds.has(row.id)) return false;
                    seenStudentIds.add(row.id);
                    return true;
                }),
        );
    }

    return sortProctorHistoricalStudents(
        (
            await prisma.user.findMany({
                where: {
                    role: 'STUDENT',
                    classId: { in: normalizedClassIds },
                },
                select: {
                    id: true,
                    name: true,
                    nis: true,
                    classId: true,
                    studentClass: {
                        select: {
                            name: true,
                        },
                    },
                },
            })
        ).map((student) => buildProctorHistoricalStudentRowFromCurrentStudent(student)),
    );
}

async function resolveRoomScopeSchedules(baseScheduleId: number, preferredProctorId?: number | null): Promise<{
    baseSchedule: ProctorRoomScheduleScope | null;
    monitoredSchedules: ProctorRoomScheduleScope[];
    monitoredScheduleIds: number[];
    monitoredClassIds: number[];
    monitoredClassNames: string[];
    slotContext: ExamSittingRoomSlotRow | null;
}> {
    const baseSchedule = await prisma.examSchedule.findUnique({
        where: { id: baseScheduleId },
        select: {
            id: true,
            classId: true,
            packetId: true,
            semester: true,
            room: true,
            startTime: true,
            endTime: true,
            sessionId: true,
            sessionLabel: true,
            examType: true,
            academicYearId: true,
            subjectId: true,
            proctorId: true,
            class: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    if (!baseSchedule) {
        return {
            baseSchedule: null,
            monitoredSchedules: [],
            monitoredScheduleIds: [],
            monitoredClassIds: [],
            monitoredClassNames: [],
            slotContext: null,
        };
    }

    const slotContext = await resolveSlotScopeForSchedule({
        scheduleId: baseScheduleId,
        academicYearId: baseSchedule.academicYearId,
        examType: baseSchedule.examType,
        semester: baseSchedule.semester || null,
        date: baseSchedule.startTime,
        roomName: baseSchedule.room,
        subjectId: baseSchedule.subjectId,
        classId: baseSchedule.classId,
        preferredProctorId: preferredProctorId ?? baseSchedule.proctorId ?? null,
    });

    if (slotContext) {
        const slotScheduleIds = Array.from(
            new Set(
                (slotContext.scheduleIds || [])
                    .map((item) => Number(item))
                    .filter((item) => Number.isFinite(item) && item > 0),
            ),
        );
        const monitoredSchedules = slotScheduleIds.length > 0
            ? await prisma.examSchedule.findMany({
                  where: { id: { in: slotScheduleIds } },
                  select: {
                      id: true,
                      classId: true,
                      packetId: true,
                      semester: true,
                      room: true,
                      startTime: true,
                      endTime: true,
                      sessionId: true,
                      sessionLabel: true,
                      examType: true,
                      academicYearId: true,
                      subjectId: true,
                      proctorId: true,
                      class: {
                          select: {
                              id: true,
                              name: true,
                          },
                      },
                  },
                  orderBy: { classId: 'asc' },
              })
            : [];
        const normalizedMonitoredSchedules: ProctorRoomScheduleScope[] =
            monitoredSchedules.length > 0 ? monitoredSchedules : [baseSchedule];
        const monitoredClassIds =
            slotContext.classIds.length > 0
                ? Array.from(
                      new Set(
                          slotContext.classIds
                              .map((item) => Number(item))
                              .filter((item) => Number.isFinite(item) && item > 0),
                      ),
                  )
                : Array.from(
                      new Set(
                          normalizedMonitoredSchedules
                              .map((item) => Number(item.classId))
                              .filter((classId) => Number.isFinite(classId) && classId > 0),
                      ),
                  );
        const monitoredClassNames =
            slotContext.classNames.length > 0
                ? Array.from(new Set(slotContext.classNames.filter(Boolean))).sort(compareClassName)
                : Array.from(
                      new Set(normalizedMonitoredSchedules.map((item) => item.class?.name || '').filter(Boolean)),
                  ).sort(compareClassName);

        return {
            baseSchedule: {
                ...baseSchedule,
                room: slotContext.roomName || baseSchedule.room,
                startTime: slotContext.startTime ? new Date(slotContext.startTime) : baseSchedule.startTime,
                endTime: slotContext.endTime ? new Date(slotContext.endTime) : baseSchedule.endTime,
                sessionId:
                    Number.isFinite(Number(slotContext.sessionId)) && Number(slotContext.sessionId) > 0
                        ? Number(slotContext.sessionId)
                        : baseSchedule.sessionId,
                sessionLabel: slotContext.sessionLabel || baseSchedule.sessionLabel,
                examType: slotContext.examType || baseSchedule.examType,
                academicYearId:
                    Number.isFinite(Number(slotContext.academicYearId)) && Number(slotContext.academicYearId) > 0
                        ? Number(slotContext.academicYearId)
                        : baseSchedule.academicYearId,
                subjectId:
                    Number.isFinite(Number(slotContext.subjectId)) && Number(slotContext.subjectId) > 0
                        ? Number(slotContext.subjectId)
                        : baseSchedule.subjectId,
                proctorId:
                    Number.isFinite(Number(slotContext.proctorId)) && Number(slotContext.proctorId) > 0
                        ? Number(slotContext.proctorId)
                        : baseSchedule.proctorId,
            },
            monitoredSchedules: normalizedMonitoredSchedules,
            monitoredScheduleIds: slotScheduleIds.length > 0 ? slotScheduleIds : Array.from(new Set(normalizedMonitoredSchedules.map((item) => item.id))),
            monitoredClassIds,
            monitoredClassNames,
            slotContext,
        };
    }

    const roomScopeWhere: any = {
        isActive: true,
        startTime: baseSchedule.startTime,
        endTime: baseSchedule.endTime,
        room: baseSchedule.room ?? null,
    };

    if (baseSchedule.sessionId && Number.isFinite(baseSchedule.sessionId)) {
        roomScopeWhere.OR = [{ sessionId: baseSchedule.sessionId }];
        if (baseSchedule.sessionLabel) {
            roomScopeWhere.OR.push({
                sessionId: null,
                sessionLabel: baseSchedule.sessionLabel,
            });
        }
    } else {
        roomScopeWhere.sessionId = null;
        roomScopeWhere.sessionLabel = baseSchedule.sessionLabel ?? null;
    }

    if (baseSchedule.examType) {
        roomScopeWhere.examType = baseSchedule.examType;
    }
    if (baseSchedule.academicYearId) {
        roomScopeWhere.academicYearId = baseSchedule.academicYearId;
    }
    if (baseSchedule.subjectId) {
        roomScopeWhere.subjectId = baseSchedule.subjectId;
    }
    if (baseSchedule.proctorId) {
        roomScopeWhere.proctorId = baseSchedule.proctorId;
    }

    const roomSchedules = await prisma.examSchedule.findMany({
        where: roomScopeWhere,
        select: {
            id: true,
            classId: true,
            packetId: true,
            room: true,
            startTime: true,
            endTime: true,
            sessionId: true,
            sessionLabel: true,
            examType: true,
            academicYearId: true,
            subjectId: true,
            proctorId: true,
            class: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
        orderBy: { classId: 'asc' },
    });

    const monitoredSchedules: ProctorRoomScheduleScope[] =
        roomSchedules.length > 0
            ? roomSchedules
            : [baseSchedule];
    const monitoredScheduleIds = Array.from(new Set(monitoredSchedules.map((item) => item.id)));
    const monitoredClassIds = Array.from(
        new Set(
            monitoredSchedules
                .map((item) => Number(item.classId))
                .filter((classId) => Number.isFinite(classId) && classId > 0),
        ),
    );
    const monitoredClassNames = Array.from(
        new Set(monitoredSchedules.map((item) => item.class?.name || '').filter(Boolean)),
    );

    return {
        baseSchedule,
        monitoredSchedules,
        monitoredScheduleIds,
        monitoredClassIds,
        monitoredClassNames,
        slotContext: null,
    };
}

function filterMatchedSittingsForSlot(params: {
    sittings: ProctorRoomSittingRow[];
    roomName: string | null;
    academicYearId: number | null;
    examType: string | null;
    startTime: Date | null;
    endTime: Date | null;
    sessionId: number | null;
    sessionLabel: string | null;
}): ProctorRoomSittingRow[] {
    const roomLookup = String(params.roomName || '').trim().toLowerCase();
    if (!roomLookup) return [];

    return params.sittings.filter((sitting) => {
        if (String(sitting.roomName || '').trim().toLowerCase() !== roomLookup) return false;
        if (
            Number.isFinite(Number(params.academicYearId)) &&
            Number(params.academicYearId) > 0 &&
            Number(sitting.academicYearId) !== Number(params.academicYearId)
        ) {
            return false;
        }
        if (!hasExamTypeIntersection(params.examType, sitting.examType)) return false;
        if (
            !isSameSessionScope({
                leftSessionId: params.sessionId,
                leftSessionLabel: params.sessionLabel,
                rightSessionId: sitting.sessionId,
                rightSessionLabel: sitting.sessionLabel,
            })
        ) {
            return false;
        }
        if (!isSameSlotTime(params.startTime, params.endTime, sitting.startTime, sitting.endTime)) {
            return false;
        }
        return true;
    });
}

function collectSittingParticipants(sittings: ProctorRoomSittingRow[]): {
    studentIds: Set<number>;
} {
    const studentIds = new Set<number>();

    sittings.forEach((sitting) => {
        sitting.students.forEach((row) => {
            if (Number.isFinite(Number(row.studentId)) && Number(row.studentId) > 0) {
                studentIds.add(Number(row.studentId));
            }
        });
    });

    return {
        studentIds,
    };
}

function buildProctorSessionScopeWhere(params: {
    expectedStudentIds: number[];
    monitoredScheduleIds: number[];
    sessionScheduleScope: Prisma.ExamScheduleWhereInput;
    statuses?: ExamSessionStatus[];
}): Prisma.StudentExamSessionWhereInput {
    const normalizedExpectedStudentIds = Array.from(
        new Set(
            (params.expectedStudentIds || [])
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item) && item > 0),
        ),
    );
    const normalizedScheduleIds = Array.from(
        new Set(
            (params.monitoredScheduleIds || [])
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item) && item > 0),
        ),
    );
    const orSchedules: Prisma.StudentExamSessionWhereInput[] = [{ schedule: { is: params.sessionScheduleScope } }];
    if (normalizedScheduleIds.length > 0) {
        orSchedules.push({ scheduleId: { in: normalizedScheduleIds } });
    }

    return {
        ...(normalizedExpectedStudentIds.length > 0 ? { studentId: { in: normalizedExpectedStudentIds } } : {}),
        ...(Array.isArray(params.statuses) && params.statuses.length > 0
            ? {
                  status: {
                      in: params.statuses,
                  },
              }
            : {}),
        ...(orSchedules.length === 1 ? orSchedules[0] : { OR: orSchedules }),
    };
}

function normalizeProctorSessionStatus(
    status: string | null | undefined,
    startTime: Date | null | undefined,
    submitTime: Date | null | undefined,
): 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT' {
    const normalizedStatus = String(status || '').trim().toUpperCase();
    if (submitTime) return 'COMPLETED';
    if (normalizedStatus === 'COMPLETED') return 'COMPLETED';
    if (normalizedStatus === 'TIMEOUT') return 'TIMEOUT';
    if (startTime || normalizedStatus === 'IN_PROGRESS') return 'IN_PROGRESS';
    return 'NOT_STARTED';
}

async function resolveRealtimeProctorAttendanceRoster(scheduleId: number): Promise<{
    classNames: string[];
    expectedParticipants: number;
    presentParticipants: number;
    absentParticipants: number;
    participants: ProctorAttendanceParticipantSnapshot[];
}> {
    const scope = await resolveRoomScopeSchedules(scheduleId);
    if (!scope.baseSchedule || scope.monitoredScheduleIds.length === 0) {
        return {
            classNames: [],
            expectedParticipants: 0,
            presentParticipants: 0,
            absentParticipants: 0,
            participants: [],
        };
    }

    const sittingExamTypeCandidates = resolveExamTypeCandidates(scope.baseSchedule.examType);
    const [roomStudents, roomSittings] = await Promise.all([
        scope.monitoredClassIds.length > 0
            ? listHistoricalProctorStudentsForClasses(scope.monitoredClassIds, scope.baseSchedule.academicYearId)
            : Promise.resolve([]),
        scope.baseSchedule.room
            ? prisma.examSitting.findMany({
                  where: {
                      roomName: {
                          equals: scope.baseSchedule.room,
                          mode: 'insensitive',
                      },
                      ...(scope.baseSchedule.academicYearId
                          ? { academicYearId: scope.baseSchedule.academicYearId }
                          : {}),
                      ...(sittingExamTypeCandidates.length > 0
                          ? {
                                examType: {
                                    in: sittingExamTypeCandidates,
                                },
                            }
                          : {}),
                  },
                  select: {
                      id: true,
                      roomName: true,
                      academicYearId: true,
                      examType: true,
                      sessionId: true,
                      sessionLabel: true,
                      startTime: true,
                      endTime: true,
                      students: {
                          select: {
                              studentId: true,
                          },
                      },
                  },
              })
            : Promise.resolve([]),
    ]);

    const matchedSittings = filterMatchedSittingsForSlot({
        sittings: roomSittings as ProctorRoomSittingRow[],
        roomName: scope.baseSchedule.room,
        academicYearId: scope.baseSchedule.academicYearId,
        examType: scope.baseSchedule.examType,
        startTime: scope.baseSchedule.startTime,
        endTime: scope.baseSchedule.endTime,
        sessionId: scope.baseSchedule.sessionId,
        sessionLabel: scope.baseSchedule.sessionLabel,
    });
    const sittingParticipants = collectSittingParticipants(matchedSittings);
    const expectedStudentIds =
        sittingParticipants.studentIds.size > 0
            ? sittingParticipants.studentIds
            : new Set(roomStudents.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0));
    const expectedStudentIdList = Array.from(expectedStudentIds.values());
    const expectedStudentProfiles =
        expectedStudentIdList.length > 0
            ? await listHistoricalProctorStudentsByIds(expectedStudentIdList, scope.baseSchedule.academicYearId)
            : roomStudents;
    const profileIds = new Set(
        expectedStudentProfiles
            .map((item) => Number(item.id))
            .filter((item) => Number.isFinite(item) && item > 0),
    );
    const normalizedExpectedStudentProfiles = sortProctorHistoricalStudents([
        ...expectedStudentProfiles,
        ...expectedStudentIdList
            .filter((studentId) => !profileIds.has(studentId))
            .map((studentId) => ({
                id: studentId,
                name: `Siswa #${studentId}`,
                nis: null,
                classId: null,
                className: null,
            })),
    ]);
    const expectedStudentIdLookup =
        normalizedExpectedStudentProfiles.length > 0
            ? new Set(
                  normalizedExpectedStudentProfiles
                      .map((item) => Number(item.id))
                      .filter((item) => Number.isFinite(item) && item > 0),
              )
            : expectedStudentIds;

    const collectedExpectedClassNames = collectHistoricalClassNames(normalizedExpectedStudentProfiles);
    const sittingParticipantClassNames = collectedExpectedClassNames;
    const expectedParticipants = normalizedExpectedStudentProfiles.length;

    const sessionScheduleScope: any = {
        isActive: true,
        startTime: scope.baseSchedule.startTime,
        endTime: scope.baseSchedule.endTime,
        ...(scope.baseSchedule.academicYearId ? { academicYearId: scope.baseSchedule.academicYearId } : {}),
        ...(scope.baseSchedule.subjectId ? { subjectId: scope.baseSchedule.subjectId } : {}),
        ...(sittingExamTypeCandidates.length > 0 ? { examType: { in: sittingExamTypeCandidates } } : {}),
    };
    if (scope.baseSchedule.sessionId && Number.isFinite(scope.baseSchedule.sessionId)) {
        sessionScheduleScope.OR = [{ sessionId: scope.baseSchedule.sessionId }];
        if (scope.baseSchedule.sessionLabel) {
            sessionScheduleScope.OR.push({
                sessionId: null,
                sessionLabel: scope.baseSchedule.sessionLabel,
            });
        }
    } else {
        sessionScheduleScope.sessionId = null;
        sessionScheduleScope.sessionLabel = scope.baseSchedule.sessionLabel ?? null;
    }

    const roomSessions =
        expectedStudentIdList.length > 0 || scope.monitoredScheduleIds.length > 0
            ? await prisma.studentExamSession.findMany({
                  where: buildProctorSessionScopeWhere({
                      expectedStudentIds: expectedStudentIdList,
                      monitoredScheduleIds: scope.monitoredScheduleIds,
                      sessionScheduleScope,
                      statuses: [ExamSessionStatus.IN_PROGRESS, ExamSessionStatus.COMPLETED, ExamSessionStatus.TIMEOUT],
                  }),
                  select: {
                      studentId: true,
                      startTime: true,
                      submitTime: true,
                  },
              })
            : [];

    const sessionInfoByStudentId = new Map<number, { startTime: Date | null; submitTime: Date | null }>();
    roomSessions.forEach((row) => {
        const studentId = Number(row.studentId);
        if (!Number.isFinite(studentId) || studentId <= 0) return;
        if (expectedStudentIdLookup.size > 0 && !expectedStudentIdLookup.has(studentId)) return;

        const existing = sessionInfoByStudentId.get(studentId);
        const existingScore = existing ? (existing.submitTime ? 2 : 0) + (existing.startTime ? 1 : 0) : -1;
        const nextScore = (row.submitTime ? 2 : 0) + (row.startTime ? 1 : 0);

        if (!existing || nextScore >= existingScore) {
            sessionInfoByStudentId.set(studentId, {
                startTime: row.startTime,
                submitTime: row.submitTime,
            });
        }
    });

    const absentStudentIds = expectedStudentProfiles
        .map((student) => Number(student.id))
        .filter((studentId) => Number.isFinite(studentId) && studentId > 0 && !sessionInfoByStudentId.has(studentId));

    const overlappingPermissions =
        absentStudentIds.length > 0
            ? await prisma.studentPermission.findMany({
                  where: {
                      studentId: { in: absentStudentIds },
                      ...(scope.baseSchedule.academicYearId ? { academicYearId: scope.baseSchedule.academicYearId } : {}),
                      startDate: { lte: scope.baseSchedule.endTime },
                      endDate: { gte: scope.baseSchedule.startTime },
                  },
                  select: {
                      studentId: true,
                      status: true,
                      reason: true,
                      approvalNote: true,
                      updatedAt: true,
                      id: true,
                      approvedBy: {
                          select: {
                              id: true,
                              name: true,
                              additionalDuties: true,
                              role: true,
                          },
                      },
                  },
                  orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
              })
            : [];

    const permissionByStudentId = new Map<number, PermissionSnapshot>();
    overlappingPermissions.forEach((permission) => {
        if (!permissionByStudentId.has(permission.studentId)) {
            permissionByStudentId.set(permission.studentId, {
                status: permission.status,
                reason: permission.reason,
                approvalNote: permission.approvalNote,
                approvedBy: permission.approvedBy
                    ? {
                          id: permission.approvedBy.id,
                          name: permission.approvedBy.name,
                          additionalDuties: permission.approvedBy.additionalDuties || [],
                          role: permission.approvedBy.role,
                      }
                    : null,
            });
        }
    });

    const participants = normalizedExpectedStudentProfiles.map((student) => {
        const studentId = Number(student.id);
        const sessionInfo = sessionInfoByStudentId.get(studentId) || null;
        const permission = sessionInfo ? null : permissionByStudentId.get(studentId) || null;
        const isPresent = Boolean(sessionInfo);

        return {
            id: studentId,
            name: String(student.name || `Siswa #${studentId}`),
            nis: student.nis ? String(student.nis) : null,
            className: student.className ? String(student.className) : null,
            status: isPresent ? 'PRESENT' : 'ABSENT',
            statusLabel: isPresent ? 'Hadir' : 'Tidak Hadir',
            startTimeLabel: isPresent ? formatTimeLabel(sessionInfo?.startTime) : '-',
            submitTimeLabel: isPresent ? formatTimeLabel(sessionInfo?.submitTime) : '-',
            absentReason: !isPresent ? resolveAbsentReason(permission) : null,
            permissionStatus: !isPresent ? permission?.status || null : null,
        } satisfies ProctorAttendanceParticipantSnapshot;
    });

    const presentParticipants = participants.filter((row) => row.status === 'PRESENT').length;
    const absentParticipants = Math.max(0, participants.length - presentParticipants);
    const classNames =
        sittingParticipantClassNames.length > 0
            ? sittingParticipantClassNames
            : collectedExpectedClassNames.length > 0
                ? collectedExpectedClassNames
                : scope.monitoredClassNames;

    return {
        classNames,
        expectedParticipants: participants.length,
        presentParticipants,
        absentParticipants,
        participants,
    };
}

async function resolveRealtimeProctorReportMetrics(scheduleId: number): Promise<{
    classNames: string[];
    expectedParticipants: number;
    presentParticipants: number;
    absentParticipants: number;
}> {
    const roster = await resolveRealtimeProctorAttendanceRoster(scheduleId);
    return {
        classNames: roster.classNames,
        expectedParticipants: roster.expectedParticipants,
        presentParticipants: roster.presentParticipants,
        absentParticipants: roster.absentParticipants,
    };
}

async function resolveExamProgramLabel(academicYearId: number | null | undefined, examType: string | null | undefined) {
    const normalizedExamType = String(examType || '').trim().toUpperCase();
    if (Number.isFinite(Number(academicYearId)) && Number(academicYearId) > 0 && normalizedExamType) {
        const programConfig = await prisma.examProgramConfig.findFirst({
            where: {
                academicYearId: Number(academicYearId),
                code: normalizedExamType,
            },
            select: {
                displayLabel: true,
                shortLabel: true,
                code: true,
            },
        });
        const resolved = normalizeOptionalText(programConfig?.displayLabel || programConfig?.shortLabel || programConfig?.code);
        if (resolved) return resolved;
    }
    return normalizeOptionalText(normalizedExamType) || 'Ujian';
}

async function resolveStandardSchoolDocumentHeaderSnapshot(): Promise<StandardSchoolDocumentHeaderSnapshot> {
    const majors = await prisma.major.findMany({
        select: {
            name: true,
        },
        orderBy: [
            { code: 'asc' },
            { name: 'asc' },
        ],
    });

    const competencyNames = Array.from(
        new Set(
            majors
                .map((major) => normalizeOptionalText(major.name))
                .filter(Boolean) as string[],
        ),
    );

    return {
        foundationName: SCHOOL_FOUNDATION_NAME,
        schoolFormalName: SCHOOL_FORMAL_NAME,
        competencyNames: competencyNames.length > 0 ? competencyNames : Array.from(FALLBACK_COMPETENCY_NAMES),
        nss: SCHOOL_NSS,
        npsn: SCHOOL_NPSN,
        accreditationLabel: SCHOOL_ACCREDITATION_LABEL,
        campuses: SCHOOL_CAMPUSES.map((campus) => ({
            label: campus.label,
            address: campus.address,
        })),
        email: SCHOOL_EMAIL,
        website: SCHOOL_WEBSITE,
        foundationLogoPath: FOUNDATION_LOGO_PATH,
        schoolLogoPath: SCHOOL_LOGO_PATH,
    };
}

function buildProctorReportNarrative(params: {
    executionDate: Date;
    examLabel: string;
    subjectName: string;
    startTime: Date;
    endTime: Date;
    roomName: string;
}) {
    const pieces = getDatePieces(params.executionDate);
    const normalizedExamLabel = normalizeOptionalText(params.examLabel) || 'Ujian';
    const examPhrase = /^ujian\b/i.test(normalizedExamLabel)
        ? normalizedExamLabel
        : `Ujian ${normalizedExamLabel}`;
    return `Pada hari ini, ${pieces.weekday} tanggal ${pieces.day} bulan ${pieces.month} tahun ${pieces.year} telah dilaksanakan ${examPhrase} Mata Pelajaran ${params.subjectName} mulai pukul ${formatTimeLabel(params.startTime)} sampai dengan pukul ${formatTimeLabel(params.endTime)} di ruang ${params.roomName}.`;
}

function buildProctorReportSnapshot(params: {
    req: Request;
    documentHeader: StandardSchoolDocumentHeaderSnapshot;
    documentNumber: string;
    verificationToken: string;
    academicYearName: string;
    examLabel: string;
    subjectName: string;
    roomName: string;
    executionOrder: number | null;
    sessionLabel: string | null;
    classNames: string[];
    startTime: Date;
    endTime: Date;
    expectedParticipants: number;
    absentParticipants: number;
    presentParticipants: number;
    notes: string | null;
    incident: string | null;
    signedAt: Date;
    proctorId: number;
    proctorName: string;
}): ProctorReportDocumentSnapshot {
    const verificationUrl = `${resolvePublicAppBaseUrl(params.req)}/verify/proctor-report/${params.verificationToken}`;
    const executionPieces = getDatePieces(params.startTime);
    const roomName = normalizeOptionalText(params.roomName) || 'Belum ditentukan';
    const subjectName = normalizeOptionalText(params.subjectName) || '-';
    const examLabel = normalizeOptionalText(params.examLabel) || 'Ujian';

    return {
        schoolName: SCHOOL_NAME,
        schoolLogoPath: SCHOOL_LOGO_PATH,
        documentHeader: params.documentHeader,
        title: 'BERITA ACARA',
        examLabel,
        academicYearName: normalizeOptionalText(params.academicYearName) || '-',
        documentNumber: params.documentNumber,
        schedule: {
            subjectName,
            roomName,
            executionOrder: Number.isFinite(Number(params.executionOrder)) ? Number(params.executionOrder) : null,
            sessionLabel: normalizeOptionalText(params.sessionLabel),
            classNames: Array.from(
                new Set((params.classNames || []).map((item) => String(item || '').trim()).filter(Boolean)),
            ),
            startTimeLabel: formatTimeLabel(params.startTime),
            endTimeLabel: formatTimeLabel(params.endTime),
            executionDateLabel: executionPieces.fullDateLabel,
            executionYear: executionPieces.year,
        },
        narrative: buildProctorReportNarrative({
            executionDate: params.startTime,
            examLabel,
            subjectName,
            startTime: params.startTime,
            endTime: params.endTime,
            roomName,
        }),
        counts: {
            expectedParticipants: Math.max(0, Number(params.expectedParticipants || 0)),
            absentParticipants: Math.max(0, Number(params.absentParticipants || 0)),
            presentParticipants: Math.max(0, Number(params.presentParticipants || 0)),
        },
        notes: composeProctorReportNotes(params.notes, params.incident),
        incident: null,
        submittedAt: params.signedAt.toISOString(),
        proctor: {
            id: Number(params.proctorId),
            name: normalizeOptionalText(params.proctorName) || 'Pengawas',
            signatureLabel: 'Ditandatangani dan dikirim ke Kurikulum secara digital oleh pengawas ruang.',
        },
        verification: {
            token: params.verificationToken,
            verificationUrl,
            note: 'Keaslian dokumen ini dapat diverifikasi melalui QR code atau tautan verifikasi.',
        },
    };
}

function buildProctorAttendanceDocumentSnapshot(params: {
    req: Request;
    documentHeader: StandardSchoolDocumentHeaderSnapshot;
    documentNumber: string;
    verificationToken: string;
    academicYearName: string;
    examLabel: string;
    subjectName: string;
    roomName: string;
    executionOrder: number | null;
    sessionLabel: string | null;
    classNames: string[];
    startTime: Date;
    endTime: Date;
    expectedParticipants: number;
    absentParticipants: number;
    presentParticipants: number;
    participants: ProctorAttendanceParticipantSnapshot[];
    signedAt: Date;
    proctorId: number;
    proctorName: string;
}): ProctorAttendanceDocumentSnapshot {
    const verificationUrl = `${resolvePublicAppBaseUrl(params.req)}/verify/proctor-report/${params.verificationToken}`;
    const executionPieces = getDatePieces(params.startTime);
    const subjectName = normalizeOptionalText(params.subjectName) || '-';
    const roomName = normalizeOptionalText(params.roomName) || 'Belum ditentukan';
    const examLabel = normalizeOptionalText(params.examLabel) || 'Ujian';

    return {
        documentHeader: params.documentHeader,
        schoolName: SCHOOL_NAME,
        schoolLogoPath: SCHOOL_LOGO_PATH,
        title: 'DAFTAR HADIR',
        examLabel,
        academicYearName: normalizeOptionalText(params.academicYearName) || '-',
        documentNumber: params.documentNumber,
        schedule: {
            subjectName,
            roomName,
            executionOrder:
                Number.isFinite(Number(params.executionOrder)) && Number(params.executionOrder) > 0
                    ? Number(params.executionOrder)
                    : null,
            sessionLabel: normalizeOptionalText(params.sessionLabel),
            classNames: Array.from(
                new Set((params.classNames || []).map((item) => String(item || '').trim()).filter(Boolean)),
            ),
            startTimeLabel: formatTimeLabel(params.startTime),
            endTimeLabel: formatTimeLabel(params.endTime),
            executionDateLabel: executionPieces.fullDateLabel,
            executionYear: executionPieces.year,
        },
        counts: {
            expectedParticipants: Math.max(0, Number(params.expectedParticipants || 0)),
            absentParticipants: Math.max(0, Number(params.absentParticipants || 0)),
            presentParticipants: Math.max(0, Number(params.presentParticipants || 0)),
        },
        participants: params.participants,
        submittedAt: params.signedAt.toISOString(),
        proctor: {
            id: Number(params.proctorId),
            name: normalizeOptionalText(params.proctorName) || 'Pengawas',
            signatureLabel: 'Dokumen daftar hadir ini dibuat dari laporan pengawas ruang dan diverifikasi melalui QR internal SIS KGB2.',
        },
        verification: {
            token: params.verificationToken,
            verificationUrl,
            note: 'Keaslian daftar hadir ini dapat diverifikasi melalui QR code atau tautan verifikasi.',
        },
    };
}

async function hydrateProctorReportArtifacts(
    req: Request,
    params: {
        report: {
            id: number;
            scheduleId: number;
            proctorId: number;
            notes: string | null;
            incident: string | null;
            signedAt: Date;
            studentCountPresent: number;
            studentCountAbsent: number;
            documentNumber: string | null;
            verificationToken: string | null;
            documentSnapshot: Prisma.JsonValue | null;
            proctor: { id: number; name: string } | null;
            schedule: {
                id: number;
                room: string | null;
                startTime: Date;
                endTime: Date;
                sessionId: number | null;
                sessionLabel: string | null;
                examType: string | null;
                academicYearId: number | null;
                academicYear: { id: number; name: string } | null;
                subject: { id: number; name: string } | null;
                packet: {
                    title: string | null;
                    subject: { name: string } | null;
                } | null;
                class: { id: number; name: string } | null;
            };
        };
        classNames?: string[];
        expectedParticipants?: number;
        presentParticipants?: number;
        absentParticipants?: number;
    },
) {
    const existingSnapshot =
        params.report.documentSnapshot && typeof params.report.documentSnapshot === 'object' && !Array.isArray(params.report.documentSnapshot)
            ? (params.report.documentSnapshot as unknown as ProctorReportDocumentSnapshot)
            : null;

    let resolvedClassNames =
        Array.isArray(params.classNames) && params.classNames.length > 0
            ? params.classNames
            : existingSnapshot?.schedule?.classNames || [];
    if (resolvedClassNames.length === 0) {
        const scope = await resolveRoomScopeSchedules(params.report.scheduleId);
        resolvedClassNames =
            scope.monitoredClassNames.length > 0
                ? scope.monitoredClassNames
                : (params.report.schedule.class?.name ? [params.report.schedule.class.name] : []);
    }

    const expectedParticipants =
        Number.isFinite(Number(params.expectedParticipants))
            ? Number(params.expectedParticipants)
            : Number(existingSnapshot?.counts?.expectedParticipants || 0) ||
              Number(params.report.studentCountPresent || 0) + Number(params.report.studentCountAbsent || 0);
    const presentParticipants =
        Number.isFinite(Number(params.presentParticipants))
            ? Number(params.presentParticipants)
            : Number(existingSnapshot?.counts?.presentParticipants || 0) || Number(params.report.studentCountPresent || 0);
    const absentParticipants =
        Number.isFinite(Number(params.absentParticipants))
            ? Number(params.absentParticipants)
            : Number(existingSnapshot?.counts?.absentParticipants || 0) || Number(params.report.studentCountAbsent || 0);

    const documentNumber =
        normalizeOptionalText(params.report.documentNumber) ||
        buildProctorReportDocumentNumber({
            reportId: params.report.id,
            examType: params.report.schedule.examType,
            executionDate: params.report.schedule.startTime,
        });
    const verificationToken = normalizeOptionalText(params.report.verificationToken) || randomUUID();
    const academicYearName =
        normalizeOptionalText(params.report.schedule.academicYear?.name) ||
        (
            await prisma.academicYear.findUnique({
                where: { id: Number(params.report.schedule.academicYearId || 0) || -1 },
                select: { name: true },
            })
        )?.name ||
        '-';
    const examLabel = await resolveExamProgramLabel(params.report.schedule.academicYearId, params.report.schedule.examType);
    const documentHeader = await resolveStandardSchoolDocumentHeaderSnapshot();
    const executionOrder = await resolveScheduleExecutionOrder({
        academicYearId: params.report.schedule.academicYearId,
        examType: params.report.schedule.examType,
        executionDate: params.report.schedule.startTime,
        startTime: params.report.schedule.startTime,
        endTime: params.report.schedule.endTime,
    });
    const subjectName =
        normalizeOptionalText(params.report.schedule.packet?.subject?.name) ||
        normalizeOptionalText(params.report.schedule.subject?.name) ||
        '-';
    const nextSnapshot = buildProctorReportSnapshot({
        req,
        documentHeader,
        documentNumber,
        verificationToken,
        academicYearName,
        examLabel,
        subjectName,
        roomName: params.report.schedule.room || 'Belum ditentukan',
        executionOrder,
        sessionLabel: params.report.schedule.sessionLabel,
        classNames: resolvedClassNames,
        startTime: params.report.schedule.startTime,
        endTime: params.report.schedule.endTime,
        expectedParticipants,
        absentParticipants,
        presentParticipants,
        notes: params.report.notes,
        incident: params.report.incident,
        signedAt: params.report.signedAt,
        proctorId: params.report.proctor?.id || params.report.proctorId,
        proctorName: params.report.proctor?.name || 'Pengawas',
    });

    const snapshotChanged = JSON.stringify(existingSnapshot || null) !== JSON.stringify(nextSnapshot);
    const shouldPersist =
        !params.report.documentNumber ||
        !params.report.verificationToken ||
        !existingSnapshot ||
        snapshotChanged;

    if (shouldPersist) {
        await prisma.examProctoringReport.update({
            where: { id: params.report.id },
            data: {
                documentNumber,
                verificationToken,
                documentSnapshot: nextSnapshot as unknown as Prisma.InputJsonValue,
            },
        });
    }

    return {
        documentNumber,
        verificationToken,
        snapshot: nextSnapshot,
    };
}

// Get schedules assigned to me as Proctor or Author
export const getProctorSchedules = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { mode } = req.query; // 'proctor' (default) or 'author'

    const where: any = { isActive: true };
    let assignedSlots: ExamSittingRoomSlotRow[] = [];

    if (mode === 'author') {
        where.packet = { authorId: user.id };
    } else {
        const activeAcademicYear = await prisma.academicYear.findFirst({
            where: { isActive: true },
            select: { id: true },
        });
        assignedSlots = activeAcademicYear
            ? (await listExamSittingRoomSlots({ academicYearId: activeAcademicYear.id })).slots.filter(
                  (slot) => Number(slot.proctorId) === Number(user.id),
              )
            : [];
        const slotScheduleIds = Array.from(
            new Set(
                assignedSlots
                    .flatMap((slot) => slot.scheduleIds || [])
                    .map((item) => Number(item))
                    .filter((item) => Number.isFinite(item) && item > 0),
            ),
        );
        where.OR = [{ proctorId: user.id }];
        if (slotScheduleIds.length > 0) {
            where.OR.push({ id: { in: slotScheduleIds } });
        }
    }

    const schedules = await prisma.examSchedule.findMany({
        where,
        include: {
            packet: {
                select: { title: true, subject: { select: { name: true } }, duration: true, type: true }
            },
            subject: {
                select: { name: true }
            },
            class: {
                select: { name: true }
            },
            academicYear: {
                select: { name: true }
            },
            _count: {
                select: { sessions: true }
            }
        },
        orderBy: { startTime: 'asc' }
    });

    const slotByScheduleId = new Map<number, ExamSittingRoomSlotRow>();
    assignedSlots.forEach((slot) => {
        (slot.scheduleIds || []).forEach((scheduleId) => {
            const normalizedScheduleId = Number(scheduleId);
            if (!Number.isFinite(normalizedScheduleId) || normalizedScheduleId <= 0) return;
            if (!slotByScheduleId.has(normalizedScheduleId)) {
                slotByScheduleId.set(normalizedScheduleId, slot);
            }
        });
    });

    const roomScopeRosterCache = new Map<string, Promise<{
        participantCount: number;
        classNames: string[];
    }>>();

    const buildScopeKey = (schedule: (typeof schedules)[number]) =>
        [
            String(schedule.room || '').trim().toLowerCase(),
            schedule.startTime?.toISOString?.() || '',
            schedule.endTime?.toISOString?.() || '',
            Number(schedule.sessionId || 0) || 0,
            String(schedule.sessionLabel || '').trim().toLowerCase(),
            String(schedule.examType || '').trim().toUpperCase(),
            Number(schedule.academicYearId || 0) || 0,
            Number(schedule.subjectId || 0) || 0,
            Number(schedule.proctorId || 0) || 0,
        ].join('::');

    const enrichedSchedules = await Promise.all(
        schedules.map(async (schedule) => {
            const assignedSlot = slotByScheduleId.get(schedule.id) || null;
            if (assignedSlot) {
                return {
                    ...schedule,
                    room: assignedSlot.roomName || schedule.room,
                    startTime: assignedSlot.startTime || schedule.startTime,
                    endTime: assignedSlot.endTime || schedule.endTime,
                    sessionLabel: assignedSlot.sessionLabel || schedule.sessionLabel,
                    proctorId:
                        Number.isFinite(Number(assignedSlot.proctorId)) && Number(assignedSlot.proctorId) > 0
                            ? Number(assignedSlot.proctorId)
                            : schedule.proctorId,
                    participantCount: Number(assignedSlot.participantCount || 0),
                    classNames:
                        Array.isArray(assignedSlot.classNames) && assignedSlot.classNames.length > 0
                            ? assignedSlot.classNames
                            : (schedule.class?.name ? [schedule.class.name] : []),
                };
            }

            const scopeKey = buildScopeKey(schedule);
            if (!roomScopeRosterCache.has(scopeKey)) {
                roomScopeRosterCache.set(
                    scopeKey,
                    resolveRealtimeProctorAttendanceRoster(schedule.id).then((roster) => ({
                        participantCount: Number(roster.expectedParticipants || 0),
                        classNames: Array.isArray(roster.classNames) ? roster.classNames : [],
                    })),
                );
            }

            const roster = await roomScopeRosterCache.get(scopeKey)!;
            return {
                ...schedule,
                participantCount: roster.participantCount,
                classNames:
                    roster.classNames.length > 0
                        ? roster.classNames
                        : (schedule.class?.name ? [schedule.class.name] : []),
            };
        }),
    );

    res.json(new ApiResponse(200, enrichedSchedules));
});

// Get details for a specific exam room (Proctor View)
export const getProctoringDetail = asyncHandler(async (req: Request, res: Response) => {
    const { scheduleId } = req.params;
    const user = (req as any).user;
    const scheduleIdNumber = Number.parseInt(scheduleId, 10);

    if (!Number.isInteger(scheduleIdNumber) || scheduleIdNumber <= 0) {
        throw new ApiError(400, 'ID jadwal ujian tidak valid');
    }

    // Check if user is admin or wakasek to allow broader access
    const schedule = await prisma.examSchedule.findFirst({
        where: { 
            id: scheduleIdNumber,
        },
        include: {
            packet: { select: { title: true, subject: { select: { name: true } }, authorId: true, subjectId: true, academicYearId: true } },
            subject: { select: { id: true, name: true } },
            academicYear: { select: { name: true } },
            class: { select: { id: true, name: true } },
            proctor: { select: { id: true, name: true } },
            proctoringReports: true
        }
    });

    if (!schedule) throw new ApiError(404, 'Jadwal tidak ditemukan');
    const scope = await resolveRoomScopeSchedules(scheduleIdNumber, Number(user?.id) || null);
    const effectiveProctorId = Number(scope.baseSchedule?.proctorId || schedule.proctorId || 0) || null;

    // Access Control Logic
    const isProctor = effectiveProctorId === Number(user.id);
    const isAuthor = schedule.packet?.authorId === user.id;
    const isAdmin = user.role === 'ADMIN';
    
    let isSubjectTeacher = false;
    if (!isProctor && !isAuthor && !isAdmin) {
        // Check if user is the teacher for this subject in this class
        const subjectId = schedule.packet?.subjectId || schedule.subjectId;
        const academicYearId = schedule.packet?.academicYearId || schedule.academicYearId;

        if (subjectId && schedule.class?.id) {
            const assignment = await prisma.teacherAssignment.findFirst({
                where: {
                    teacherId: user.id,
                    classId: schedule.class.id,
                    subjectId: subjectId,
                    academicYearId: academicYearId || undefined
                }
            });
            if (assignment) {
                isSubjectTeacher = true;
            }
        }
    }

    if (!isProctor && !isAuthor && !isAdmin && !isSubjectTeacher) {
        throw new ApiError(403, 'Anda tidak memiliki akses untuk memantau ujian ini');
    }

    const resolvedSubjectId = schedule.packet?.subjectId || schedule.subjectId || null;
    const resolvedAcademicYearId = schedule.packet?.academicYearId || schedule.academicYearId || null;
    const monitoredSchedules = scope.monitoredSchedules.length > 0
        ? scope.monitoredSchedules
        : [{ id: schedule.id, classId: schedule.classId, packetId: schedule.packetId, class: schedule.class }];
    const monitoredScheduleIds =
        scope.monitoredScheduleIds.length > 0
            ? scope.monitoredScheduleIds
            : Array.from(new Set(monitoredSchedules.map((row: any) => row.id)));
    const monitoredClassIds =
        scope.monitoredClassIds.length > 0
            ? scope.monitoredClassIds
            : Array.from(
                  new Set(
                      monitoredSchedules
                          .map((row: any) => Number(row.classId))
                          .filter((classId: number) => Number.isFinite(classId) && classId > 0),
                  ),
              );
    const monitoredClassNames =
        scope.monitoredClassNames.length > 0
            ? scope.monitoredClassNames
            : (Array.from(new Set(monitoredSchedules.map((row: any) => row.class?.name).filter(Boolean))) as string[]);
    const monitoredPacketIds = Array.from(
        new Set(
            monitoredSchedules
                .map((row: any) => Number(row.packetId))
                .filter((packetId: number) => Number.isFinite(packetId) && packetId > 0),
        ),
    );
    const sittingExamTypeCandidates = resolveExamTypeCandidates(schedule.examType);

    const effectiveRoomName = scope.baseSchedule?.room || schedule.room;
    const effectiveStartTime = scope.baseSchedule?.startTime || schedule.startTime;
    const effectiveEndTime = scope.baseSchedule?.endTime || schedule.endTime;
    const effectiveSessionId = scope.baseSchedule?.sessionId ?? schedule.sessionId;
    const effectiveSessionLabel = scope.baseSchedule?.sessionLabel ?? schedule.sessionLabel;
    const effectiveExamType = scope.baseSchedule?.examType || schedule.examType;

    const roomSittings: ProctorRoomSittingRow[] = effectiveRoomName
        ? await prisma.examSitting.findMany({
              where: {
                  roomName: {
                      equals: effectiveRoomName,
                      mode: 'insensitive',
                  },
                  ...(resolvedAcademicYearId ? { academicYearId: resolvedAcademicYearId } : {}),
                  ...(sittingExamTypeCandidates.length > 0
                      ? {
                            examType: {
                                in: sittingExamTypeCandidates,
                            },
                        }
                      : {}),
              },
              select: {
                  id: true,
                  roomName: true,
                  academicYearId: true,
                  examType: true,
                  sessionId: true,
                  sessionLabel: true,
                  startTime: true,
                  endTime: true,
                  students: {
                      select: {
                          studentId: true,
                      },
                  },
              },
          })
        : [];

    const matchedSittings = filterMatchedSittingsForSlot({
        sittings: roomSittings,
        roomName: effectiveRoomName,
        academicYearId: resolvedAcademicYearId,
        examType: effectiveExamType,
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        sessionId: effectiveSessionId,
        sessionLabel: effectiveSessionLabel,
    });
    const sittingParticipants = collectSittingParticipants(matchedSittings);
    const sittingParticipantIds = Array.from(sittingParticipants.studentIds.values());

    const packetQuestionCounts = monitoredPacketIds.length > 0
        ? await prisma.examPacket.findMany({
            where: { id: { in: monitoredPacketIds } },
            select: { id: true, questions: true },
        })
        : [];
    const questionCountByPacketId = new Map<number, number>();
    packetQuestionCounts.forEach((packet) => {
        const questions = packet.questions;
        questionCountByPacketId.set(packet.id, Array.isArray(questions) ? questions.length : 0);
    });

    // Get Students in all monitored classes + their session status.
    const students =
        sittingParticipantIds.length > 0
            ? await listHistoricalProctorStudentsByIds(sittingParticipantIds, resolvedAcademicYearId)
            : await listHistoricalProctorStudentsForClasses(monitoredClassIds, resolvedAcademicYearId);

    const monitoredStudentIds = students
        .map((row) => Number(row.id))
        .filter((studentId) => Number.isFinite(studentId) && studentId > 0);
    const monitoredClassIdsFromRoom = Array.from(
        new Set(
            students
                .map((row) => Number(row.classId))
                .filter((classId) => Number.isFinite(classId) && classId > 0),
        ),
    );
    const effectiveMonitoredClassIds =
        monitoredClassIdsFromRoom.length > 0 ? monitoredClassIdsFromRoom : monitoredClassIds;
    const sittingParticipantClassNames = collectHistoricalClassNames(students);

    const sessionScheduleScope: any = {
        isActive: true,
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        ...(resolvedAcademicYearId ? { academicYearId: resolvedAcademicYearId } : {}),
        ...(resolvedSubjectId ? { subjectId: resolvedSubjectId } : {}),
        ...(sittingExamTypeCandidates.length > 0 ? { examType: { in: sittingExamTypeCandidates } } : {}),
    };
    if (effectiveSessionId && Number.isFinite(effectiveSessionId)) {
        sessionScheduleScope.OR = [{ sessionId: effectiveSessionId }];
        if (effectiveSessionLabel) {
            sessionScheduleScope.OR.push({ sessionId: null, sessionLabel: effectiveSessionLabel });
        }
    } else {
        sessionScheduleScope.sessionId = null;
        sessionScheduleScope.sessionLabel = effectiveSessionLabel ?? null;
    }

    const sessions = await prisma.studentExamSession.findMany({
        where: buildProctorSessionScopeWhere({
            expectedStudentIds: monitoredStudentIds,
            monitoredScheduleIds,
            sessionScheduleScope,
        }),
        select: {
            studentId: true,
            scheduleId: true,
            status: true,
            startTime: true,
            submitTime: true,
            score: true,
            updatedAt: true,
        }
    });
    const progressSessions = await prisma.studentExamSession.findMany({
        where: buildProctorSessionScopeWhere({
            expectedStudentIds: monitoredStudentIds,
            monitoredScheduleIds,
            sessionScheduleScope,
            statuses: [ExamSessionStatus.IN_PROGRESS, ExamSessionStatus.TIMEOUT, ExamSessionStatus.COMPLETED],
        }),
        select: {
            studentId: true,
            scheduleId: true,
            answers: true,
        },
    });

    const questionCountByScheduleId = new Map<number, number>();
    monitoredSchedules.forEach((row: any) => {
        const packetId = Number(row.packetId);
        const total = Number.isFinite(packetId)
            ? (questionCountByPacketId.get(packetId) || 0)
            : 0;
        questionCountByScheduleId.set(row.id, total);
    });
    const sessionScheduleIds = Array.from(
        new Set(
            sessions
                .map((row) => Number(row.scheduleId))
                .filter((scheduleId) => Number.isFinite(scheduleId) && scheduleId > 0),
        ),
    );
    const missingScheduleIds = sessionScheduleIds.filter((scheduleId) => !questionCountByScheduleId.has(scheduleId));
    if (missingScheduleIds.length > 0) {
        const sessionScheduleRows = await prisma.examSchedule.findMany({
            where: { id: { in: missingScheduleIds } },
            select: { id: true, packetId: true },
        });
        const missingPacketIds = Array.from(
            new Set(
                sessionScheduleRows
                    .map((row) => Number(row.packetId))
                    .filter((packetId) => Number.isFinite(packetId) && packetId > 0),
            ),
        );
        const missingPacketRows = missingPacketIds.length
            ? await prisma.examPacket.findMany({
                  where: { id: { in: missingPacketIds } },
                  select: { id: true, questions: true },
              })
            : [];
        const missingPacketCountMap = new Map<number, number>();
        missingPacketRows.forEach((packet) => {
            const questions = packet.questions;
            missingPacketCountMap.set(packet.id, Array.isArray(questions) ? questions.length : 0);
        });
        sessionScheduleRows.forEach((row) => {
            const packetId = Number(row.packetId);
            const total = Number.isFinite(packetId) ? missingPacketCountMap.get(packetId) || 0 : 0;
            questionCountByScheduleId.set(row.id, total);
        });
    }
    const progressSessionMap = new Map<string, (typeof progressSessions)[number]>();
    progressSessions.forEach((row) => {
        progressSessionMap.set(`${row.studentId}:${row.scheduleId}`, row);
    });

    const bestSessionByStudent = new Map<number, (typeof sessions)[number]>();
    const sessionRank: Record<string, number> = {
        COMPLETED: 4,
        IN_PROGRESS: 3,
        TIMEOUT: 2,
        NOT_STARTED: 1,
    };

    sessions.forEach((sess: any) => {
        const current = bestSessionByStudent.get(sess.studentId);
        if (!current) {
            bestSessionByStudent.set(sess.studentId, sess);
            return;
        }
        const currentRank = sessionRank[current.status] || 0;
        const nextRank = sessionRank[sess.status] || 0;
        if (nextRank > currentRank) {
            bestSessionByStudent.set(sess.studentId, sess);
            return;
        }
        if (nextRank === currentRank && new Date(sess.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
            bestSessionByStudent.set(sess.studentId, sess);
        }
    });

    const studentList = students.map((s: any) => {
        const session = bestSessionByStudent.get(s.id);
        const normalizedStatus = normalizeProctorSessionStatus(
            session?.status,
            session?.startTime,
            session?.submitTime,
        );
        const totalQuestions = session ? (questionCountByScheduleId.get(session.scheduleId) || 0) : 0;
        const progressSession = session
            ? progressSessionMap.get(`${session.studentId}:${session.scheduleId}`)
            : null;
        const answeredCount = progressSession
            ? countAnsweredEntries(progressSession.answers)
            : session?.status === 'COMPLETED'
                ? totalQuestions
                : 0;
        return {
            id: s.id,
            name: s.name,
            nis: s.nis,
            className: s.className || '-',
            status: normalizedStatus,
            startTime: session?.startTime,
            submitTime: session?.submitTime,
            score: session?.score,
            answeredCount,
            totalQuestions,
            monitoring: progressSession ? parseMonitoringSummary(progressSession.answers) : parseMonitoringSummary(null),
        };
    });
    const attendancePresentCount = studentList.filter(
        (student) => Boolean(student.startTime) || student.status !== 'NOT_STARTED',
    ).length;
    const attendanceExpectedCount = studentList.length;
    const attendanceAbsentCount = Math.max(0, attendanceExpectedCount - attendancePresentCount);

    const teacherNames = resolvedSubjectId
        ? Array.from(
            new Set(
                (
                    await prisma.teacherAssignment.findMany({
                        where: {
                            classId: { in: effectiveMonitoredClassIds },
                            subjectId: resolvedSubjectId,
                            ...(resolvedAcademicYearId ? { academicYearId: resolvedAcademicYearId } : {}),
                        },
                        select: {
                            teacher: { select: { name: true } },
                        },
                    })
                )
                    .map((row: any) => row.teacher?.name)
                    .filter(Boolean),
            ),
        )
        : [];

    const subjectName = schedule.packet?.subject?.name || schedule.subject?.name || '-';
    const displayTitle = schedule.packet?.title || `Ujian ${subjectName}`;
    const examLabel = await resolveExamProgramLabel(resolvedAcademicYearId, schedule.examType);

    res.json(new ApiResponse(200, {
        schedule: {
            ...schedule,
            room: effectiveRoomName || schedule.room,
            startTime: effectiveStartTime,
            endTime: effectiveEndTime,
            sessionId: effectiveSessionId,
            sessionLabel: effectiveSessionLabel,
            examType: effectiveExamType,
            proctorId: effectiveProctorId,
            subjectName,
            displayTitle,
            examLabel,
            academicYearName: schedule.academicYear?.name || null,
            classNames:
                sittingParticipantClassNames.length > 0 ? sittingParticipantClassNames : monitoredClassNames,
            teacherNames,
            monitoredScheduleIds,
            serverNow: new Date().toISOString(),
            attendanceSummary: {
                expectedParticipants: attendanceExpectedCount,
                presentParticipants: attendancePresentCount,
                absentParticipants: attendanceAbsentCount,
            },
        },
        students: studentList,
        isProctor,
        isAuthor,
        isSubjectTeacher
    }));
});

// Submit Berita Acara
export const submitBeritaAcara = asyncHandler(async (req: Request, res: Response) => {
    const { scheduleId } = req.params;
    const parsedScheduleId = Number.parseInt(String(scheduleId), 10);
    if (!Number.isInteger(parsedScheduleId) || parsedScheduleId <= 0) {
        throw new ApiError(400, 'ID jadwal ujian tidak valid');
    }

    const { notes, incident } = req.body;
    const user = (req as any).user;

    const schedule = await prisma.examSchedule.findUnique({
        where: { id: parsedScheduleId },
        select: {
            id: true,
            proctorId: true,
            room: true,
            startTime: true,
            endTime: true,
            sessionId: true,
            sessionLabel: true,
            examType: true,
            academicYearId: true,
            academicYear: {
                select: {
                    id: true,
                    name: true,
                },
            },
            subject: {
                select: {
                    id: true,
                    name: true,
                },
            },
            packet: {
                select: {
                    title: true,
                    subject: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
            class: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });
    if (!schedule) {
        throw new ApiError(404, 'Jadwal ujian tidak ditemukan');
    }

    const scope = await resolveRoomScopeSchedules(parsedScheduleId, Number(user?.id) || null);
    const isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN';
    const effectiveProctorId = Number(scope.baseSchedule?.proctorId || schedule.proctorId || 0) || null;
    if (!isAdmin && Number(effectiveProctorId) !== Number(user?.id)) {
        throw new ApiError(403, 'Hanya pengawas ruangan yang dapat menyimpan berita acara');
    }

    if (!scope.baseSchedule || scope.monitoredScheduleIds.length === 0) {
        throw new ApiError(404, 'Data ruang ujian tidak ditemukan');
    }
    const sittingExamTypeCandidates = resolveExamTypeCandidates(scope.baseSchedule.examType);

    const [roomStudents, roomSittings] = await Promise.all([
        scope.monitoredClassIds.length > 0
            ? listHistoricalProctorStudentsForClasses(scope.monitoredClassIds, scope.baseSchedule.academicYearId)
            : Promise.resolve([]),
        scope.baseSchedule.room
            ? prisma.examSitting.findMany({
                  where: {
                      roomName: {
                          equals: scope.baseSchedule.room,
                          mode: 'insensitive',
                      },
                      ...(scope.baseSchedule?.academicYearId
                          ? { academicYearId: scope.baseSchedule.academicYearId }
                          : {}),
                      ...(sittingExamTypeCandidates.length > 0
                          ? {
                                examType: {
                                    in: sittingExamTypeCandidates,
                                },
                            }
                          : {}),
                  },
                  select: {
                      id: true,
                      roomName: true,
                      academicYearId: true,
                      examType: true,
                      sessionId: true,
                      sessionLabel: true,
                      startTime: true,
                      endTime: true,
                      students: {
                          select: {
                              studentId: true,
                          },
                      },
                  },
              })
            : Promise.resolve([]),
    ]);

    const matchedSittings = filterMatchedSittingsForSlot({
        sittings: roomSittings as ProctorRoomSittingRow[],
        roomName: scope.baseSchedule.room,
        academicYearId: scope.baseSchedule?.academicYearId ?? null,
        examType: scope.baseSchedule?.examType ?? null,
        startTime: scope.baseSchedule?.startTime ?? null,
        endTime: scope.baseSchedule?.endTime ?? null,
        sessionId: scope.baseSchedule?.sessionId ?? null,
        sessionLabel: scope.baseSchedule?.sessionLabel ?? null,
    });
    const sittingParticipants = collectSittingParticipants(matchedSittings);
    const sittingParticipantProfiles = await listHistoricalProctorStudentsByIds(
        Array.from(sittingParticipants.studentIds.values()),
        scope.baseSchedule.academicYearId,
    );
    const sittingParticipantClassNames = collectHistoricalClassNames(sittingParticipantProfiles);

    const expectedStudentIds =
        sittingParticipants.studentIds.size > 0
            ? sittingParticipants.studentIds
            : new Set(roomStudents.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0));
    const expectedCount = expectedStudentIds.size;

    const expectedStudentIdList = Array.from(expectedStudentIds.values());
    const sessionScheduleScope: any = {
        isActive: true,
        startTime: scope.baseSchedule.startTime,
        endTime: scope.baseSchedule.endTime,
        ...(scope.baseSchedule.academicYearId ? { academicYearId: scope.baseSchedule.academicYearId } : {}),
        ...(scope.baseSchedule.subjectId ? { subjectId: scope.baseSchedule.subjectId } : {}),
        ...(sittingExamTypeCandidates.length > 0 ? { examType: { in: sittingExamTypeCandidates } } : {}),
    };
    if (scope.baseSchedule.sessionId && Number.isFinite(scope.baseSchedule.sessionId)) {
        sessionScheduleScope.OR = [{ sessionId: scope.baseSchedule.sessionId }];
        if (scope.baseSchedule.sessionLabel) {
            sessionScheduleScope.OR.push({
                sessionId: null,
                sessionLabel: scope.baseSchedule.sessionLabel,
            });
        }
    } else {
        sessionScheduleScope.sessionId = null;
        sessionScheduleScope.sessionLabel = scope.baseSchedule.sessionLabel ?? null;
    }

    const roomSessions =
        expectedStudentIdList.length > 0 || scope.monitoredScheduleIds.length > 0
            ? await prisma.studentExamSession.findMany({
                  where: buildProctorSessionScopeWhere({
                      expectedStudentIds: expectedStudentIdList,
                      monitoredScheduleIds: scope.monitoredScheduleIds,
                      sessionScheduleScope,
                      statuses: [ExamSessionStatus.IN_PROGRESS, ExamSessionStatus.COMPLETED, ExamSessionStatus.TIMEOUT],
                  }),
                  select: {
                      studentId: true,
                  },
              })
            : [];

    const presentSet = new Set<number>();
    roomSessions.forEach((row) => {
        const studentId = Number(row.studentId);
        if (!Number.isFinite(studentId) || studentId <= 0) return;
        if (expectedStudentIds.size > 0 && !expectedStudentIds.has(studentId)) return;
        presentSet.add(studentId);
    });
    const presentCount = presentSet.size;
    const absentCount = Math.max(0, expectedCount - presentCount);

    const monitoredClassNames =
        sittingParticipantClassNames.length > 0 ? sittingParticipantClassNames : scope.monitoredClassNames;

    const normalizedNotes = String(notes || '').trim();
    const normalizedIncident = String(incident || '').trim();

    const existingReport = await prisma.examProctoringReport.findFirst({
        where: {
            scheduleId: parsedScheduleId,
            proctorId: Number(user.id),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            documentNumber: true,
            verificationToken: true,
            documentSnapshot: true,
        },
    });

    const savedReport = existingReport
        ? await prisma.examProctoringReport.update({
              where: { id: existingReport.id },
              data: {
                  notes: normalizedNotes || null,
                  incident: normalizedIncident || null,
                  studentCountPresent: presentCount,
                  studentCountAbsent: absentCount,
                  signedAt: new Date(),
              },
              include: {
                  proctor: { select: { id: true, name: true } },
              },
          })
        : await prisma.examProctoringReport.create({
              data: {
                  scheduleId: parsedScheduleId,
                  proctorId: Number(user.id),
                  notes: normalizedNotes || null,
                  incident: normalizedIncident || null,
                  studentCountPresent: presentCount,
                  studentCountAbsent: absentCount,
                  signedAt: new Date(),
              },
              include: {
                  proctor: { select: { id: true, name: true } },
              },
          });

    const artifactBundle = await hydrateProctorReportArtifacts(req, {
        report: {
            id: savedReport.id,
            scheduleId: parsedScheduleId,
            proctorId: Number(user.id),
            notes: savedReport.notes,
            incident: savedReport.incident,
            signedAt: savedReport.signedAt,
            studentCountPresent: presentCount,
            studentCountAbsent: absentCount,
            documentNumber: existingReport?.documentNumber || null,
            verificationToken: existingReport?.verificationToken || null,
            documentSnapshot: existingReport?.documentSnapshot || null,
            proctor: savedReport.proctor,
            schedule: {
                id: schedule.id,
                room: scope.baseSchedule.room,
                startTime: scope.baseSchedule.startTime,
                endTime: scope.baseSchedule.endTime,
                sessionId: scope.baseSchedule.sessionId,
                sessionLabel: scope.baseSchedule.sessionLabel,
                examType: scope.baseSchedule.examType || null,
                academicYearId: scope.baseSchedule.academicYearId || null,
                academicYear: schedule.academicYear || null,
                subject: schedule.subject || null,
                packet: schedule.packet || null,
                class: schedule.class || null,
            },
        },
        classNames: monitoredClassNames,
        expectedParticipants: expectedCount,
        presentParticipants: presentCount,
        absentParticipants: absentCount,
    });

    const curriculumReceivers = await prisma.user.findMany({
        where: {
            OR: [
                { role: 'ADMIN' },
                {
                    role: 'TEACHER',
                    additionalDuties: {
                        has: AdditionalDuty.WAKASEK_KURIKULUM,
                    },
                },
            ],
        },
        select: { id: true },
    });
    if (curriculumReceivers.length > 0) {
        await createManyInAppNotifications({
            data: curriculumReceivers.map((receiver) => ({
                userId: receiver.id,
                title: 'Berita Acara Pengawas Baru',
                message: `Berita acara ruang ${schedule.room || '-'} telah dikirim ke kurikulum untuk slot ${new Date(schedule.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - ${new Date(schedule.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.`,
                type: 'EXAM_PROCTOR_REPORT',
                data: {
                    scheduleId: parsedScheduleId,
                    reportId: savedReport.id,
                    room: schedule.room,
                    classNames: monitoredClassNames,
                    expectedCount,
                    presentCount,
                    absentCount,
                    documentNumber: artifactBundle.documentNumber,
                } as any,
            })),
            skipDuplicates: false,
        });
    }

    res.json(
        new ApiResponse(
            existingReport ? 200 : 201,
            {
                ...savedReport,
                documentNumber: artifactBundle.documentNumber,
                verificationUrl: artifactBundle.snapshot.verification.verificationUrl,
                summary: {
                    room: schedule.room,
                    classNames: monitoredClassNames,
                    expectedParticipants: expectedCount,
                    presentParticipants: presentCount,
                    absentParticipants: absentCount,
                    totalParticipants: expectedCount,
                },
            },
            existingReport ? 'Berita acara berhasil diperbarui dan dikirim ke kurikulum' : 'Berita acara berhasil dikirim ke kurikulum',
        ),
    );
});

export const getProctoringReportDocument = asyncHandler(async (req: Request, res: Response) => {
    const parsedReportId = Number.parseInt(String(req.params.reportId || ''), 10);
    if (!Number.isInteger(parsedReportId) || parsedReportId <= 0) {
        throw new ApiError(400, 'ID berita acara tidak valid');
    }

    const user = (req as any).user as { id?: number; role?: string } | undefined;
    if (!user?.id) {
        throw new ApiError(401, 'Tidak memiliki otorisasi.');
    }

    const requester = await getExamRequesterProfile(Number(user.id));
    const report = await prisma.examProctoringReport.findUnique({
        where: { id: parsedReportId },
        select: {
            id: true,
            scheduleId: true,
            proctorId: true,
            notes: true,
            incident: true,
            signedAt: true,
            studentCountPresent: true,
            studentCountAbsent: true,
            documentNumber: true,
            verificationToken: true,
            documentSnapshot: true,
            proctor: {
                select: {
                    id: true,
                    name: true,
                },
            },
            schedule: {
                select: {
                    id: true,
                    room: true,
                    startTime: true,
                    endTime: true,
                    sessionId: true,
                    sessionLabel: true,
                    examType: true,
                    academicYearId: true,
                    academicYear: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    subject: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    packet: {
                        select: {
                            title: true,
                            subject: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                    class: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
        },
    });

    if (!report) {
        throw new ApiError(404, 'Berita acara tidak ditemukan');
    }

    const canAccessTeacher =
        requester.role === 'TEACHER' &&
        (Number(requester.id) === Number(report.proctorId) || hasCurriculumExamManagementDuty(requester.additionalDuties));
    const canAccess = requester.role === 'ADMIN' || requester.role === 'PRINCIPAL' || canAccessTeacher;
    if (!canAccess) {
        throw new ApiError(403, 'Anda tidak memiliki akses ke dokumen berita acara ini.');
    }

    const realtimeMetrics = await resolveRealtimeProctorReportMetrics(report.scheduleId);
    const artifactBundle = await hydrateProctorReportArtifacts(req, {
        report,
        classNames: realtimeMetrics.classNames,
        expectedParticipants: realtimeMetrics.expectedParticipants,
        presentParticipants: realtimeMetrics.presentParticipants,
        absentParticipants: realtimeMetrics.absentParticipants,
    });
    const verificationQrDataUrl = await QRCode.toDataURL(artifactBundle.snapshot.verification.verificationUrl, {
        width: 128,
        margin: 1,
    });

    res.json(
        new ApiResponse(200, {
            reportId: report.id,
            documentNumber: artifactBundle.documentNumber,
            snapshot: artifactBundle.snapshot,
            verificationQrDataUrl,
        }),
    );
});

export const getProctoringAttendanceDocument = asyncHandler(async (req: Request, res: Response) => {
    const parsedReportId = Number.parseInt(String(req.params.reportId || ''), 10);
    if (!Number.isInteger(parsedReportId) || parsedReportId <= 0) {
        throw new ApiError(400, 'ID daftar hadir tidak valid');
    }

    const user = (req as any).user as { id?: number; role?: string } | undefined;
    if (!user?.id) {
        throw new ApiError(401, 'Tidak memiliki otorisasi.');
    }

    const requester = await getExamRequesterProfile(Number(user.id));
    const report = await prisma.examProctoringReport.findUnique({
        where: { id: parsedReportId },
        select: {
            id: true,
            scheduleId: true,
            proctorId: true,
            notes: true,
            incident: true,
            signedAt: true,
            studentCountPresent: true,
            studentCountAbsent: true,
            documentNumber: true,
            verificationToken: true,
            documentSnapshot: true,
            proctor: {
                select: {
                    id: true,
                    name: true,
                },
            },
            schedule: {
                select: {
                    id: true,
                    room: true,
                    startTime: true,
                    endTime: true,
                    sessionId: true,
                    sessionLabel: true,
                    examType: true,
                    academicYearId: true,
                    academicYear: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    subject: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    packet: {
                        select: {
                            title: true,
                            subject: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                    class: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
        },
    });

    if (!report) {
        throw new ApiError(404, 'Daftar hadir tidak ditemukan');
    }

    const canAccessTeacher =
        requester.role === 'TEACHER' &&
        (Number(requester.id) === Number(report.proctorId) || hasCurriculumExamManagementDuty(requester.additionalDuties));
    const canAccess = requester.role === 'ADMIN' || requester.role === 'PRINCIPAL' || canAccessTeacher;
    if (!canAccess) {
        throw new ApiError(403, 'Anda tidak memiliki akses ke daftar hadir ini.');
    }

    const realtimeRoster = await resolveRealtimeProctorAttendanceRoster(report.scheduleId);
    const artifactBundle = await hydrateProctorReportArtifacts(req, {
        report,
        classNames: realtimeRoster.classNames,
        expectedParticipants: realtimeRoster.expectedParticipants,
        presentParticipants: realtimeRoster.presentParticipants,
        absentParticipants: realtimeRoster.absentParticipants,
    });
    const attendanceDocumentNumber = buildProctorAttendanceDocumentNumber({
        reportId: report.id,
        examType: report.schedule.examType,
        executionDate: report.schedule.startTime,
    });
    const attendanceSnapshot = buildProctorAttendanceDocumentSnapshot({
        req,
        documentHeader: artifactBundle.snapshot.documentHeader,
        documentNumber: attendanceDocumentNumber,
        verificationToken: artifactBundle.verificationToken,
        academicYearName: artifactBundle.snapshot.academicYearName,
        examLabel: artifactBundle.snapshot.examLabel,
        subjectName: artifactBundle.snapshot.schedule.subjectName,
        roomName: report.schedule.room || 'Belum ditentukan',
        executionOrder: artifactBundle.snapshot.schedule.executionOrder,
        sessionLabel: report.schedule.sessionLabel,
        classNames: realtimeRoster.classNames,
        startTime: report.schedule.startTime,
        endTime: report.schedule.endTime,
        expectedParticipants: realtimeRoster.expectedParticipants,
        presentParticipants: realtimeRoster.presentParticipants,
        absentParticipants: realtimeRoster.absentParticipants,
        participants: realtimeRoster.participants,
        signedAt: report.signedAt,
        proctorId: report.proctor?.id || report.proctorId,
        proctorName: report.proctor?.name || 'Pengawas',
    });
    const verificationQrDataUrl = await QRCode.toDataURL(attendanceSnapshot.verification.verificationUrl, {
        width: 128,
        margin: 1,
    });

    res.json(
        new ApiResponse(200, {
            reportId: report.id,
            documentNumber: attendanceDocumentNumber,
            snapshot: attendanceSnapshot,
            verificationQrDataUrl,
        }),
    );
});

export const verifyPublicProctorReport = asyncHandler(async (req: Request, res: Response) => {
    const token = normalizeOptionalText(req.params.token);
    if (!token) {
        throw new ApiError(400, 'Token verifikasi tidak valid.');
    }

    const report = await prisma.examProctoringReport.findFirst({
        where: {
            verificationToken: token,
        },
        select: {
            id: true,
            scheduleId: true,
            proctorId: true,
            notes: true,
            incident: true,
            signedAt: true,
            studentCountPresent: true,
            studentCountAbsent: true,
            documentNumber: true,
            verificationToken: true,
            documentSnapshot: true,
            proctor: {
                select: {
                    id: true,
                    name: true,
                },
            },
            schedule: {
                select: {
                    id: true,
                    room: true,
                    startTime: true,
                    endTime: true,
                    sessionId: true,
                    sessionLabel: true,
                    examType: true,
                    academicYearId: true,
                    academicYear: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    subject: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    packet: {
                        select: {
                            title: true,
                            subject: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                    class: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
        },
    });

    if (!report) {
        throw new ApiError(404, 'Dokumen berita acara tidak ditemukan.');
    }

    const realtimeMetrics = await resolveRealtimeProctorReportMetrics(report.scheduleId);
    const artifactBundle = await hydrateProctorReportArtifacts(req, {
        report,
        classNames: realtimeMetrics.classNames,
        expectedParticipants: realtimeMetrics.expectedParticipants,
        presentParticipants: realtimeMetrics.presentParticipants,
        absentParticipants: realtimeMetrics.absentParticipants,
    });
    const attendanceDocumentNumber = buildProctorAttendanceDocumentNumber({
        reportId: report.id,
        examType: report.schedule.examType,
        executionDate: report.schedule.startTime,
    });
    res.json(
        new ApiResponse(200, {
            valid: true,
            reportId: report.id,
            documentNumber: artifactBundle.documentNumber,
            snapshot: artifactBundle.snapshot,
            attendanceDocument: {
                documentNumber: attendanceDocumentNumber,
                counts: {
                    expectedParticipants: realtimeMetrics.expectedParticipants,
                    presentParticipants: realtimeMetrics.presentParticipants,
                    absentParticipants: realtimeMetrics.absentParticipants,
                },
            },
            verifiedAt: new Date().toISOString(),
        }),
    );
});

// Receive proctor reports in curriculum monitoring flow
export const getProctoringReports = asyncHandler(async (req: Request, res: Response) => {
    const parsedAcademicYearId = Number(req.query.academicYearId);
    const examType = String(req.query.examType || req.query.programCode || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    const semesterRaw = String(req.query.semester || '').trim().toUpperCase();
    const semester =
        semesterRaw === 'ODD' || semesterRaw === 'GANJIL'
            ? Semester.ODD
            : semesterRaw === 'EVEN' || semesterRaw === 'GENAP'
              ? Semester.EVEN
              : null;
    const date = parseDateOnly(req.query.date);
    const dateFrom = parseDateOnly(req.query.dateFrom);
    const dateTo = parseDateOnly(req.query.dateTo);
    if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId <= 0) {
        res.json(
            new ApiResponse(200, {
                rows: [],
                summary: {
                    totalRooms: 0,
                    totalExpected: 0,
                    totalPresent: 0,
                    totalAbsent: 0,
                    reportedRooms: 0,
                },
            }),
        );
        return;
    }

    const slotResponse = await listExamSittingRoomSlots({
        academicYearId: parsedAcademicYearId,
        examType,
        semester,
    });

    const reportSlots = slotResponse.slots.filter((slot) => {
        const slotStart = new Date(slot.startTime);
        if (date) {
            const range = toDateRangeByDay(date);
            return slotStart >= range.start && slotStart < range.end;
        }
        if (dateFrom || dateTo) {
            const startDate = dateFrom || dateTo;
            const endDate = dateTo || dateFrom;
            if (startDate && endDate) {
                const rangeStart = toDateRangeByDay(startDate).start;
                const rangeEnd = toDateRangeByDay(endDate).end;
                const normalizedStart = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
                const normalizedEnd = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
                return slotStart >= normalizedStart && slotStart < normalizedEnd;
            }
        }
        return true;
    });

    const allScheduleIds = Array.from(
        new Set(
            reportSlots
                .flatMap((slot) => slot.scheduleIds || [])
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item) && item > 0),
        ),
    );
    const allSittingIds = Array.from(
        new Set(
            reportSlots
                .map((slot) => Number(slot.sittingId))
                .filter((item) => Number.isFinite(item) && item > 0),
        ),
    );

    const [roomSittings, reportCandidates, sessionRows] = await Promise.all([
        allSittingIds.length > 0
            ? prisma.examSitting.findMany({
                  where: { id: { in: allSittingIds } },
                  select: {
                      id: true,
                      students: {
                          select: {
                              studentId: true,
                          },
                      },
                  },
              })
            : Promise.resolve([]),
        allScheduleIds.length > 0
            ? prisma.examProctoringReport.findMany({
                  where: {
                      scheduleId: { in: allScheduleIds },
                  },
                  orderBy: [{ updatedAt: 'desc' }, { signedAt: 'desc' }, { id: 'desc' }],
                  select: {
                      id: true,
                      scheduleId: true,
                      proctorId: true,
                      signedAt: true,
                      notes: true,
                      incident: true,
                      studentCountPresent: true,
                      studentCountAbsent: true,
                      documentNumber: true,
                      verificationToken: true,
                      documentSnapshot: true,
                      proctor: {
                          select: {
                              id: true,
                              name: true,
                          },
                      },
                  },
              })
            : Promise.resolve([]),
        allScheduleIds.length > 0
            ? prisma.studentExamSession.findMany({
                  where: {
                      scheduleId: { in: allScheduleIds },
                      status: { in: [ExamSessionStatus.IN_PROGRESS, ExamSessionStatus.COMPLETED, ExamSessionStatus.TIMEOUT] },
                  },
                  select: {
                      scheduleId: true,
                      studentId: true,
                  },
              })
            : Promise.resolve([]),
    ]);

    const sittingStudentIdMap = new Map<number, number[]>();
    roomSittings.forEach((sitting) => {
        sittingStudentIdMap.set(
            sitting.id,
            Array.from(
                new Set(
                    (sitting.students || [])
                        .map((row) => Number(row.studentId))
                        .filter((studentId) => Number.isFinite(studentId) && studentId > 0),
                ),
            ),
        );
    });

    const allSlotStudentIds = Array.from(
        new Set(
            Array.from(sittingStudentIdMap.values()).flatMap((studentIds) => studentIds),
        ),
    );
    const studentProfiles = await listHistoricalProctorStudentsByIds(allSlotStudentIds, parsedAcademicYearId);
    const studentProfileMap = new Map(
        studentProfiles.map((student) => [
            Number(student.id),
            {
                id: Number(student.id),
                name: student.name,
                nis: student.nis,
                className: student.className,
                classId: student.classId,
            },
        ]),
    );

    const sessionStudentIdsBySchedule = new Map<number, Set<number>>();
    sessionRows.forEach((row) => {
        const scheduleIdNumber = Number(row.scheduleId);
        const studentIdNumber = Number(row.studentId);
        if (!Number.isFinite(scheduleIdNumber) || scheduleIdNumber <= 0) return;
        if (!Number.isFinite(studentIdNumber) || studentIdNumber <= 0) return;
        const bucket = sessionStudentIdsBySchedule.get(scheduleIdNumber) || new Set<number>();
        bucket.add(studentIdNumber);
        sessionStudentIdsBySchedule.set(scheduleIdNumber, bucket);
    });

    const reportRows = (
        await Promise.all(
            reportSlots.map(async (slot) => {
                const sittingStudentIds = sittingStudentIdMap.get(Number(slot.sittingId)) || [];
                const expectedStudentIds = new Set<number>();
                sittingStudentIds.forEach((studentId) => {
                    const profile = studentProfileMap.get(studentId) || null;
                    const classId = Number(profile?.classId || 0) || null;
                    const className = String(profile?.className || '').trim() || null;
                    if (classId && slot.classIds.includes(classId)) {
                        expectedStudentIds.add(studentId);
                        return;
                    }
                    if (className && slot.classNames.includes(className)) {
                        expectedStudentIds.add(studentId);
                    }
                });

                const presentSet = new Set<number>();
                slot.scheduleIds.forEach((scheduleId) => {
                    const bucket = sessionStudentIdsBySchedule.get(Number(scheduleId));
                    if (!bucket) return;
                    bucket.forEach((studentId) => {
                        if (expectedStudentIds.has(studentId)) {
                            presentSet.add(studentId);
                        }
                    });
                });

                const absentStudentIds = Array.from(expectedStudentIds.values()).filter((studentId) => !presentSet.has(studentId));
                const overlappingPermissions =
                    absentStudentIds.length > 0
                        ? await prisma.studentPermission.findMany({
                              where: {
                                  studentId: { in: absentStudentIds },
                                  academicYearId: parsedAcademicYearId,
                                  startDate: { lte: new Date(slot.endTime) },
                                  endDate: { gte: new Date(slot.startTime) },
                              },
                              select: {
                                  studentId: true,
                                  status: true,
                                  reason: true,
                                  approvalNote: true,
                                  updatedAt: true,
                                  id: true,
                                  approvedBy: {
                                      select: {
                                          id: true,
                                          name: true,
                                          additionalDuties: true,
                                          role: true,
                                      },
                                  },
                              },
                              orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
                          })
                        : [];

                const permissionByStudentId = new Map<number, PermissionSnapshot>();
                overlappingPermissions.forEach((permission) => {
                    if (!permissionByStudentId.has(permission.studentId)) {
                        permissionByStudentId.set(permission.studentId, {
                            status: permission.status,
                            reason: permission.reason,
                            approvalNote: permission.approvalNote,
                            approvedBy: permission.approvedBy
                                ? {
                                      id: permission.approvedBy.id,
                                      name: permission.approvedBy.name,
                                      additionalDuties: permission.approvedBy.additionalDuties || [],
                                      role: permission.approvedBy.role,
                                  }
                                : null,
                        });
                    }
                });

                const absentStudents = absentStudentIds
                    .map((studentId) => {
                        const profile = studentProfileMap.get(studentId);
                        const permission = permissionByStudentId.get(studentId) || null;
                        return {
                            id: studentId,
                            name: profile?.name || `Siswa #${studentId}`,
                            nis: profile?.nis || null,
                            className: profile?.className || null,
                            absentReason: resolveAbsentReason(permission),
                            permissionStatus: permission?.status || null,
                        };
                    })
                    .sort((a, b) => {
                        const classCompare = compareClassName(String(a.className || ''), String(b.className || ''));
                        if (classCompare !== 0) return classCompare;
                        return String(a.name || '').localeCompare(String(b.name || ''), 'id');
                    });

                const latestReport =
                    reportCandidates.find((report) => {
                        if (!(slot.scheduleIds || []).includes(Number(report.scheduleId))) return false;
                        const snapshot = report.documentSnapshot && typeof report.documentSnapshot === 'object' && !Array.isArray(report.documentSnapshot)
                            ? (report.documentSnapshot as Record<string, any>)
                            : null;
                        const snapshotRoom = String(snapshot?.schedule?.roomName || '').trim().toLowerCase();
                        const slotRoom = String(slot.roomName || '').trim().toLowerCase();
                        if (snapshotRoom && slotRoom && snapshotRoom === slotRoom) {
                            return true;
                        }
                        if (Number.isFinite(Number(slot.proctorId)) && Number(slot.proctorId) > 0) {
                            return Number(report.proctorId) === Number(slot.proctorId);
                        }
                        return true;
                    }) || null;

                const expectedParticipants = expectedStudentIds.size || Number(slot.participantCount || 0);
                const presentParticipants = presentSet.size;
                const absentParticipants = Math.max(0, expectedParticipants - presentParticipants);

                return {
                    room: slot.roomName || null,
                    startTime: new Date(slot.startTime),
                    endTime: new Date(slot.endTime),
                    periodNumber:
                        Number.isFinite(Number(slot.periodNumber)) && Number(slot.periodNumber) > 0
                            ? Number(slot.periodNumber)
                            : null,
                    sessionLabel: slot.sessionLabel || null,
                    examType: slot.examType || null,
                    subjectName: slot.subjectName || null,
                    classNames: Array.from(new Set(slot.classNames || [])).sort(compareClassName),
                    scheduleIds: Array.from(new Set(slot.scheduleIds || [])),
                    expectedParticipants,
                    presentParticipants,
                    absentParticipants,
                    totalParticipants: expectedParticipants,
                    absentStudents,
                    reportedPresentParticipants: latestReport?.studentCountPresent ?? null,
                    reportedAbsentParticipants: latestReport?.studentCountAbsent ?? null,
                    report: latestReport
                        ? {
                              id: latestReport.id,
                              signedAt: latestReport.signedAt,
                              notes: latestReport.notes,
                              incident: latestReport.incident,
                              documentNumber: latestReport.documentNumber,
                              verificationUrl: latestReport.verificationToken
                                  ? `${resolvePublicAppBaseUrl(req)}/verify/proctor-report/${latestReport.verificationToken}`
                                  : null,
                              proctor: latestReport.proctor
                                  ? {
                                        id: latestReport.proctor.id,
                                        name: latestReport.proctor.name,
                                    }
                                  : null,
                          }
                        : null,
                };
            }),
        )
    ).sort((a, b) => {
        const timeDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        if (timeDiff !== 0) return timeDiff;
        return compareRoomNameNatural(a.room, b.room);
    });

    res.json(
        new ApiResponse(200, {
            rows: reportRows,
            summary: {
                totalRooms: reportRows.length,
                totalExpected: reportRows.reduce((sum, row) => sum + row.expectedParticipants, 0),
                totalPresent: reportRows.reduce((sum, row) => sum + row.presentParticipants, 0),
                totalAbsent: reportRows.reduce((sum, row) => sum + row.absentParticipants, 0),
                reportedRooms: reportRows.filter((row) => !!row.report).length,
            },
        }),
    );
});
