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
    if (!normalized) return null;
    const lowered = normalized.toLowerCase();
    return lowered === '__no_session__' ? null : lowered;
}

function normalizeSubjectLookupKey(raw: unknown): string {
    return String(raw || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
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

type ParsedSlotKey = {
    rawKey: string;
    sittingId: number | null;
    roomKey: string;
    startTime: Date | null;
    endTime: Date | null;
    periodNumber: number | null;
    subjectId: number | null;
    subjectNameKey: string;
    sessionId: number | null;
    sessionLabel: string | null;
};

type SlotProctorCandidateRow = {
    slot_key: string;
    sitting_id: number | null;
    room_name: string | null;
    start_time: Date | null;
    end_time: Date | null;
    period_number: number | null;
    session_id: number | null;
    session_label: string | null;
    subject_id: number | null;
    subject_name: string | null;
    proctor_id: number | null;
    proctor_name: string | null;
};

function parseDateOrNull(raw: string | null | undefined): Date | null {
    if (!raw) return null;
    const value = new Date(raw);
    return Number.isNaN(value.getTime()) ? null : value;
}

function parseExamSittingSlotProctorKey(rawKey: string): ParsedSlotKey | null {
    const normalizedKey = String(rawKey || '').trim();
    if (!normalizedKey) return null;
    const segments = normalizedKey.split('::');
    const parsed: ParsedSlotKey = {
        rawKey: normalizedKey,
        sittingId: null,
        roomKey: '',
        startTime: null,
        endTime: null,
        periodNumber: null,
        subjectId: null,
        subjectNameKey: '',
        sessionId: null,
        sessionLabel: null,
    };

    segments.forEach((segment) => {
        if (segment.startsWith('sit:')) {
            const value = Number(segment.slice(4));
            parsed.sittingId = Number.isFinite(value) && value > 0 ? value : null;
            return;
        }
        if (segment.startsWith('room:')) {
            parsed.roomKey = normalizeRoomLookupKey(segment.slice(5));
            return;
        }
        if (segment.startsWith('start:')) {
            parsed.startTime = parseDateOrNull(segment.slice(6));
            return;
        }
        if (segment.startsWith('end:')) {
            parsed.endTime = parseDateOrNull(segment.slice(4));
            return;
        }
        if (segment.startsWith('period:')) {
            const value = Number(segment.slice(7));
            parsed.periodNumber = Number.isFinite(value) && value > 0 ? value : null;
            return;
        }
        if (segment.startsWith('sub:')) {
            const value = Number(segment.slice(4));
            parsed.subjectId = Number.isFinite(value) && value > 0 ? value : null;
            return;
        }
        if (segment.startsWith('subn:')) {
            parsed.subjectNameKey = normalizeSubjectLookupKey(segment.slice(5));
            return;
        }
        if (segment.startsWith('sid:')) {
            const value = Number(segment.slice(4));
            parsed.sessionId = Number.isFinite(value) && value > 0 ? value : null;
            return;
        }
        if (segment.startsWith('sl:')) {
            parsed.sessionLabel = normalizeSessionLabel(segment.slice(3));
        }
    });

    return parsed.sittingId && parsed.roomKey ? parsed : null;
}

function scoreSlotProctorFallbackMatch(scope: ParsedSlotKey, row: SlotProctorCandidateRow): number {
    const rowSittingId = Number(row.sitting_id || 0) || null;
    if (!rowSittingId || rowSittingId !== scope.sittingId) return -1;

    const rowRoomKey = normalizeRoomLookupKey(row.room_name);
    if (!rowRoomKey || rowRoomKey !== scope.roomKey) return -1;

    let score = 400;

    const rowPeriod = Number(row.period_number || 0) || null;
    if (scope.periodNumber && rowPeriod) {
        if (scope.periodNumber !== rowPeriod) return -1;
        score += 60;
    }

    const rowSubjectId = Number(row.subject_id || 0) || null;
    if (scope.subjectId && rowSubjectId) {
        if (scope.subjectId !== rowSubjectId) return -1;
        score += 120;
    } else if (scope.subjectNameKey) {
        const rowSubjectNameKey = normalizeSubjectLookupKey(row.subject_name);
        if (!rowSubjectNameKey || rowSubjectNameKey !== scope.subjectNameKey) return -1;
        score += 80;
    }

    const rowSessionId = Number(row.session_id || 0) || null;
    const rowSessionLabel = normalizeSessionLabel(row.session_label);
    if (scope.sessionId && rowSessionId) {
        if (scope.sessionId !== rowSessionId) return -1;
        score += 40;
    } else if (scope.sessionLabel || rowSessionLabel) {
        if (scope.sessionLabel !== rowSessionLabel) return -1;
        score += 20;
    }

    const scopeStartMs = scope.startTime?.getTime() || null;
    const rowStartMs = row.start_time instanceof Date ? row.start_time.getTime() : null;
    if (scopeStartMs && rowStartMs) {
        const delta = Math.abs(scopeStartMs - rowStartMs);
        if (delta === 0) score += 40;
        else if (delta <= 30 * 60 * 1000) score += 10;
        else return -1;
    }

    const scopeEndMs = scope.endTime?.getTime() || null;
    const rowEndMs = row.end_time instanceof Date ? row.end_time.getTime() : null;
    if (scopeEndMs && rowEndMs) {
        const delta = Math.abs(scopeEndMs - rowEndMs);
        if (delta === 0) score += 30;
        else if (delta <= 30 * 60 * 1000) score += 8;
        else return -1;
    }

    return score;
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

    const missingKeys = normalizedKeys.filter((slotKey) => !result.has(slotKey));
    if (missingKeys.length === 0) {
        return result;
    }

    const parsedScopes = missingKeys
        .map((slotKey) => parseExamSittingSlotProctorKey(slotKey))
        .filter((item): item is ParsedSlotKey => Boolean(item && item.sittingId));

    if (parsedScopes.length === 0) {
        return result;
    }

    const sittingIds = Array.from(
        new Set(
            parsedScopes
                .map((scope) => Number(scope.sittingId || 0))
                .filter((value) => Number.isFinite(value) && value > 0),
        ),
    );
    if (sittingIds.length === 0) {
        return result;
    }

    const fallbackRows = await prisma.$queryRaw<SlotProctorCandidateRow[]>(
        Prisma.sql`
            SELECT
                esp.slot_key,
                esp.sitting_id,
                esp.room_name,
                esp.start_time,
                esp.end_time,
                esp.period_number,
                esp.session_id,
                esp.session_label,
                esp.subject_id,
                esp.subject_name,
                esp.proctor_id,
                u.name AS proctor_name
            FROM exam_sitting_slot_proctors esp
            LEFT JOIN users u ON u.id = esp.proctor_id
            WHERE esp.sitting_id IN (${Prisma.join(sittingIds)})
        `,
    );

    const rowsBySittingId = new Map<number, SlotProctorCandidateRow[]>();
    fallbackRows.forEach((row) => {
        const sittingId = Number(row.sitting_id || 0);
        if (!Number.isFinite(sittingId) || sittingId <= 0) return;
        const bucket = rowsBySittingId.get(sittingId) || [];
        bucket.push(row);
        rowsBySittingId.set(sittingId, bucket);
    });

    const canonicalUpdates = new Map<string, { oldKey: string; scope: ParsedSlotKey }>();

    parsedScopes.forEach((scope) => {
        const candidates = rowsBySittingId.get(Number(scope.sittingId || 0)) || [];
        const ranked = candidates
            .map((row) => ({
                row,
                score: scoreSlotProctorFallbackMatch(scope, row),
            }))
            .filter((item) => item.score >= 0)
            .sort((left, right) => {
                const scoreDiff = right.score - left.score;
                if (scoreDiff !== 0) return scoreDiff;
                const leftUpdated = left.row.end_time instanceof Date ? left.row.end_time.getTime() : 0;
                const rightUpdated = right.row.end_time instanceof Date ? right.row.end_time.getTime() : 0;
                return rightUpdated - leftUpdated;
            });

        const matched = ranked[0]?.row;
        if (!matched) return;

        const proctorId = Number(matched.proctor_id || 0) || null;
        result.set(scope.rawKey, {
            proctorId,
            proctor:
                proctorId && matched.proctor_name
                    ? {
                          id: proctorId,
                          name: String(matched.proctor_name),
                      }
                    : null,
        });

        if (String(matched.slot_key) !== scope.rawKey) {
            canonicalUpdates.set(scope.rawKey, {
                oldKey: String(matched.slot_key),
                scope,
            });
        }
    });

    for (const [targetKey, update] of canonicalUpdates.entries()) {
        const scope = update.scope;
        await prisma.$executeRaw(
            Prisma.sql`
                UPDATE exam_sitting_slot_proctors
                SET
                    slot_key = ${targetKey},
                    start_time = ${scope.startTime},
                    end_time = ${scope.endTime},
                    period_number = ${scope.periodNumber},
                    session_id = ${scope.sessionId},
                    subject_id = ${scope.subjectId},
                    updated_at = NOW()
                WHERE slot_key = ${update.oldKey}
                  AND NOT EXISTS (
                      SELECT 1
                      FROM exam_sitting_slot_proctors existing
                      WHERE existing.slot_key = ${targetKey}
                  )
            `,
        );
    }

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
