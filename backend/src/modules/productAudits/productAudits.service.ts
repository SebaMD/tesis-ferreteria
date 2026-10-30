import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditDTO, auditOperations, type AuditRow } from "./productAudits.dto.js";

export class AuditError extends Error { constructor(message: string, public statusCode = 400) { super(message); } }
const positive = (v: unknown, max = 2147483647) => typeof v === "string" && /^[1-9]\d*$/.test(v) && Number(v) <= max ? Number(v) : null;
export function validateAuditQuery(input: Record<string, unknown>) {
  if (Object.keys(input).some(k => !["operation", "productId", "familyId", "from", "to", "limit", "cursor"].includes(k))) throw new AuditError("Filtro de auditoría desconocido");
  const operation = input.operation === undefined ? null : typeof input.operation === "string" && Object.hasOwn(auditOperations, input.operation) ? input.operation : undefined;
  if (operation === undefined) throw new AuditError("Operación de auditoría inválida");
  const number = (key: string, max?: number) => { if (input[key] === undefined) return null; const n = positive(input[key], max); if (!n) throw new AuditError(`${key} inválido`); return n; };
  const date = (key: string) => { const v = input[key]; if (v === undefined) return null;
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v.startsWith("0000") || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) throw new AuditError("Fecha inválida; utilice AAAA-MM-DD (UTC)"); return v; };
  const from = date("from"), to = date("to");
  if (from && to && from > to) throw new AuditError("El inicio no puede ser posterior al fin");
  let cursor: { at: string; id: number } | null = null;
  if (input.cursor !== undefined) {
    try {
      if (typeof input.cursor !== "string" || input.cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw Error();
      const c = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
      if (!c || Object.keys(c).sort().join() !== "at,id" || typeof c.at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(c.at) || !Number.isFinite(Date.parse(c.at)) || new Date(c.at).toISOString().slice(0, 19) !== c.at.slice(0, 19) || typeof c.id !== "number" || !positive(String(c.id))) throw Error();
      cursor = { at: c.at, id: c.id };
    } catch { throw new AuditError("Cursor de auditoría inválido"); }
  }
  return { operation, productId: number("productId"), familyId: number("familyId"), from, to, limit: number("limit", 100) ?? 25, cursor };
}

export async function listProductAudits(actorId: number, input: Record<string, unknown>) {
  return db.transaction(async tx => {
    const actor = await tx.execute<{ allowed: boolean }>(sql`select exists(select 1 from users u join roles r on r.id=u.role_id where u.id=${actorId} and u.status='ACTIVE' and r.name='ADMIN') allowed`);
    if (!actor.rows[0]?.allowed) throw new AuditError("Solo ADMIN puede consultar los cambios administrativos", 403);
    const q = validateAuditQuery(input);
    // No advisory/row locks, writes, audit inserts or operational side effects.
    // Group only explicitly linked authorizations/command keys. Unlinked events remain visible.
    const rows = await tx.execute<AuditRow>(sql`
      with raw as (
        select e.*, coalesce(e.next->>'operation', 'ASSOCIATION') operation
        from product_family_events e
      ), visible as (
        select e.* from raw e where not exists (
          select 1 from raw result where result.next->>'authorizationId'=e.id::text
            and result.family_id=e.family_id and result.user_id=e.user_id
            and result.next->>'operationKey'=e.next->>'operationKey'
            and (e.operation,result.operation) in (('FAMILY_BRAND_AUTHORIZATION','FAMILY_BRAND_CORRECTION'),('OPTION_LABEL_AUTHORIZATION','OPTION_LABEL_CORRECTION'),('DIMENSION_ADD_AUTHORIZATION','DIMENSION_ADD'))
        ) and not (e.operation='BUNDLE_SAVE' and exists (
          select 1 from raw conversion where conversion.operation='CONVERT_SIMPLE'
            and conversion.family_id=e.family_id and conversion.user_id=e.user_id
            and conversion.next->>'operationKey'=e.next->>'operationKey'
        ))
      ), page as (
        select e.* from visible e
        where (${q.operation}::text is null or case when e.operation in (${sql.join(Object.keys(auditOperations).filter(k => k !== "OTHER").map(k => sql`${k}`), sql`,`)}) then e.operation else 'OTHER' end=${q.operation})
          and (${q.familyId}::integer is null or e.family_id=${q.familyId})
          and (${q.productId}::integer is null or e.product_id=${q.productId} or e.next->'productIds' @> jsonb_build_array(${q.productId}::integer)
            or (e.operation='CONVERT_SIMPLE' and exists(select 1 from raw b where b.operation='BUNDLE_SAVE' and b.family_id=e.family_id and b.user_id=e.user_id and b.next->>'operationKey'=e.next->>'operationKey' and b.next->'productIds' @> jsonb_build_array(${q.productId}::integer))))
          and (${q.from}::text is null or e.created_at >= ${q.from}::date::timestamp at time zone 'UTC')
          and (${q.to}::text is null or e.created_at < (${q.to}::date + 1)::timestamp at time zone 'UTC')
          and (${q.cursor?.at ?? null}::text is null or (e.created_at,e.id)<(${q.cursor?.at ?? null}::timestamptz,${q.cursor?.id ?? null}::integer))
        order by e.created_at desc,e.id desc limit ${q.limit + 1}
      )
      select p.id,p.product_id,p.family_id,p.user_id,p.previous,p.next,p.reason,p.operation,
        to_char(p.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_at,
        case when u.id is not null then concat_ws(' ',u.names,u.surnames) else null end actor_name,
        (select jsonb_build_object('previous',a.previous,'next',a.next) from raw a where a.id::text=p.next->>'authorizationId' and a.family_id=p.family_id and a.user_id=p.user_id and a.next->>'operationKey'=p.next->>'operationKey' limit 1) authorization,
        (select b.next from raw b where p.operation='CONVERT_SIMPLE' and b.operation='BUNDLE_SAVE' and b.family_id=p.family_id and b.user_id=p.user_id and b.next->>'operationKey'=p.next->>'operationKey' limit 1) companion,
        coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'type',r.operation) order by r.id) from raw r where r.id<>p.id and (
          (r.id::text=p.next->>'authorizationId' and r.family_id=p.family_id and r.user_id=p.user_id and r.next->>'operationKey'=p.next->>'operationKey')
          or (p.operation='CONVERT_SIMPLE' and r.operation='BUNDLE_SAVE' and r.family_id=p.family_id and r.user_id=p.user_id and r.next->>'operationKey'=p.next->>'operationKey')
        )), '[]'::jsonb) related
      from page p left join users u on u.id=p.user_id order by p.created_at desc,p.id desc
    `);
    const hasMore = rows.rows.length > q.limit, page = rows.rows.slice(0, q.limit), last = page.at(-1);
    return { items: page.map(auditDTO), nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ at: last.created_at, id: last.id })).toString("base64url") : null,
      limit: q.limit, operations: auditOperations };
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}
