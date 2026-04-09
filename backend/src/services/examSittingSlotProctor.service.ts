import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma';

function normalizeRoomLookupKey(raw: unknown): string {
    return String(raw || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeSessionLabel(raw: unknown): string | null {
    const normalized = String(raw || '')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized ? normalized.toLowerCase() : null;
}

export function buildExamSittingSlotProctorKey(params: {
    sittingId: number;
    roomName: string;
    startTime: Date;
    endTime: Date;
    periodNumber: number | null;
    sessionId: number | null;
    sessionLabel: string | null;
    subjectId: number | null;
    subjectName: string;
}) {
    const subjectScope =
        Number.isFinite(Number(params.subjectId)) && Number(params.subjectId) > 0
            ? `sub:${Number(params.subjectId)}`
            : `subn:${String(params.subjectName || '').trim().toLowerCase() || '-'}`;
    const sessionScope =
        Number.isFinite(Number(params.sessionId)) && Number(params.sessionId) > 0
            ? `sid:${Number(params.sessionId)}`
            : `sl:${normalizeSessionLabel(params.sessionLabel) || '__no_session__'}`;
    return [
        `sit:${params.sittingId}`,
        `room:${normalizeRoomLookupKey(params.roomName) || '-'}`,
        `start:${params.startTime.toISOString()}`,
        `end:${params.endTime.toISOString()}`,
        `period:${Number.isFinite(Number(params.periodNumber)) && Number(params.periodNumber) > 0 ? Number(params.periodNumber) : 0}`,
        subjectScope,
        sessionScope,
    ].join('::');
}

type SlotProctorAssignmentRow = {
    slot_key: string;
    proctor_id: number | null;
    proctor_name: string | null;
};

export async function listExamSittingSlotProctorsByKeys(slotKeys: string[]) {
    const normalizedKeys = Array.from(
        new Set(
            slotKeys
                .map((item) => String(item || '').trim())
                .filter(Boolean),
        ),
    );
    if (normalizedKeys.length === 0) {
        return new Map<string, { proctorId: number | null; proctor: { id: number; name: string } | null }>();
    }

    const rows = await prisma.$queryRaw<SlotProctorAssignmentRow[]>(
        Prisma.sql`
            SELECT esp.slot_key, esp.proctor_id, u.name AS proctor_name
            FROM exam_sitting_slot_proctors esp
            LEFT JOIN users u ON u.id = esp.proctor_id
            WHERE esp.slot_key IN (${Prisma.join(normalizedKeys)})
        `,
    );

    const result = new Map<string, { proctorId: number | null; proctor: { id: number; name: string } | null }>();
    rows.forEach((row) => {
        const proctorId = Number(row.proctor_id || 0) || null;
        result.set(String(row.slot_key), {
            proctorId,
            proctor:
                proctorId && row.proctor_name
                    ? {
                          id: proctorId,
                          name: String(row.proctor_name),
                      }
                    : null,
        });
    });

    return result;
}

export async function saveExamSittingSlotProctorAssignment(input: {
    sittingId: number;
    academicYearId: number;
    examType: string;
    semester?: string | null;
    roomName: string;
    startTime: Date;
    endTime: Date;
    periodNumber?: number | null;
    sessionId?: number | null;
    sessionLabel?: string | null;
    subjectId?: number | null;
    subjectName: string;
    proctorId: number | null;
}) {
    const slotKey = buildExamSittingSlotProctorKey({
        sittingId: input.sittingId,
        roomName: input.roomName,
        startTime: input.startTime,
        endTime: input.endTime,
        periodNumber: input.periodNumber ?? null,
        sessionId: input.sessionId ?? null,
        sessionLabel: input.sessionLabel ?? null,
        subjectId: input.subjectId ?? null,
        subjectName: input.subjectName,
    });

    if (!input.proctorId) {
        await prisma.$executeRaw(
            Prisma.sql`DELETE FROM exam_sitting_slot_proctors WHERE slot_key = ${slotKey}`,
        );
        return {
            slotKey,
            proctorId: null,
            proctor: null,
        };
    }

    const rows = await prisma.$queryRaw<Array<{ slot_key: string; proctor_id: number; proctor_name: string | null }>>(
        Prisma.sql`
            INSERT INTO exam_sitting_slot_proctors (
                slot_key,
                sitting_id,
                academic_year_id,
                exam_type,
                semester,
                room_name,
                start_time,
                end_time,
                period_number,
                session_id,
                session_label,
                subject_id,
                subject_name,
                proctor_id,
                updated_at
            )
            VALUES (
                ${slotKey},
                ${input.sittingId},
                ${input.academicYearId},
                ${String(input.examType || '').trim().toUpperCase()},
                ${input.semester ? String(input.semester).trim().toUpperCase() : null},
                ${String(input.roomName || '').trim()},
                ${input.startTime},
                ${input.endTime},
                ${Number.isFinite(Number(input.periodNumber)) && Number(input.periodNumber) > 0 ? Number(input.periodNumber) : null},
                ${Number.isFinite(Number(input.sessionId)) && Number(input.sessionId) > 0 ? Number(input.sessionId) : null},
                ${input.sessionLabel ? String(input.sessionLabel).trim() : null},
                ${Number.isFinite(Number(input.subjectId)) && Number(input.subjectId) > 0 ? Number(input.subjectId) : null},
                ${String(input.subjectName || '').trim() || null},
                ${input.proctorId},
                NOW()
            )
            ON CONFLICT (slot_key) DO UPDATE SET
                sitting_id = EXCLUDED.sitting_id,
                academic_year_id = EXCLUDED.academic_year_id,
                exam_type = EXCLUDED.exam_type,
                semester = EXCLUDED.semester,
                room_name = EXCLUDED.room_name,
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                period_number = EXCLUDED.period_number,
                session_id = EXCLUDED.session_id,
                session_label = EXCLUDED.session_label,
                subject_id = EXCLUDED.subject_id,
                subject_name = EXCLUDED.subject_name,
                proctor_id = EXCLUDED.proctor_id,
                updated_at = NOW()
            RETURNING slot_key, proctor_id, (
                SELECT name
                FROM users
                WHERE id = exam_sitting_slot_proctors.proctor_id
            ) AS proctor_name
        `,
    );

    const row = rows[0] || null;
    const proctorId = Number(row?.proctor_id || 0) || null;
    return {
        slotKey,
        proctorId,
        proctor:
            proctorId && row?.proctor_name
                ? {
                      id: proctorId,
                      name: String(row.proctor_name),
                  }
                : null,
    };
}
