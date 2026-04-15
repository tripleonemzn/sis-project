export const REALTIME_DOMAIN_ACTIVITY_EVENT = 'sis:realtime:domain-activity';

export type RealtimeDomainActivityDetail = {
  domain: string;
  occurredAt: number;
};
