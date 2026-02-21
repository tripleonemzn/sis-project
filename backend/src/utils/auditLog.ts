import prisma from './prisma';

export async function writeAuditLog(
  actorId: number,
  actorRole: string,
  actorDuties: string[] | null,
  action: string,
  entity: string,
  entityId?: number,
  before?: any,
  after?: any,
  reason?: string
) {
  await (prisma as any).auditLog.create({
    data: {
      actorId,
      actorRole,
      actorDuties: actorDuties ?? undefined,
      action,
      entity,
      entityId: entityId ?? null,
      reason: reason ?? null,
      before: before ?? null,
      after: after ?? null,
    },
  });
}
