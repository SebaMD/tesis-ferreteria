import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, type DbTransaction } from "../../db/index.js";
import {
    emailVerificationChallengesTable,
    onlineOrdersTable,
    onlinePaymentsTable,
    passwordResetTokensTable,
    rolesTable,
    usersTable,
    type NewUser,
} from "../../db/schema/index.js";
import { compactRut } from "../../utils/rut.js";

const publicUserColumns = {
    id: usersTable.id,
    roleId: usersTable.roleId,
    roleName: rolesTable.name,
    rut: usersTable.rut,
    names: usersTable.names,
    surnames: usersTable.surnames,
    correo: usersTable.correo,
    emailVerifiedAt: usersTable.emailVerifiedAt,
    phone: usersTable.phone,
    status: usersTable.status,
    selfDeactivatedAt: usersTable.selfDeactivatedAt,
    authVersion: usersTable.authVersion,
    workShift: usersTable.workShift,
    shiftStartTime: usersTable.shiftStartTime,
    shiftEndTime: usersTable.shiftEndTime,
    shiftNote: usersTable.shiftNote,
    createdAt: usersTable.createdAt,
    updatedAt: usersTable.updatedAt,
};

export async function findUsers() {
    return db
        .select(publicUserColumns)
        .from(usersTable)
        .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id));
}

export async function findRoleById(id: number) {
    const [role] = await db
        .select({
        id: rolesTable.id,
        name: rolesTable.name,
        })
        .from(rolesTable)
        .where(eq(rolesTable.id, id))
        .limit(1);

    return role;
}

export async function findRoles() {
    return db
        .select({
        id: rolesTable.id,
        name: rolesTable.name,
        description: rolesTable.description,
        })
        .from(rolesTable);
}

export async function findUserById(id: number) {
    const [user] = await db
        .select(publicUserColumns)
        .from(usersTable)
        .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
        .where(eq(usersTable.id, id))
        .limit(1);

    return user;
}

export async function findOtherUserByRut(rut: string, excludedUserId?: number) {
    const normalizedCondition = eq(
        sql<string>`regexp_replace(upper(${usersTable.rut}), '[.\\s-]', '', 'g')`,
        compactRut(rut),
    );
    const [user] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(excludedUserId ? and(normalizedCondition, ne(usersTable.id, excludedUserId)) : normalizedCondition)
        .limit(1);
    return user ?? null;
}

export async function createUser(data: NewUser) {
    const [createdUser] = await db
        .insert(usersTable)
        .values(data)
        .returning({
        id: usersTable.id,
        });

    return findUserById(createdUser.id);
}

export async function updateUserById(id: number, data: Partial<NewUser>) {
    const [updatedUser] = await db
        .update(usersTable)
        .set({
        ...data,
        updatedAt: new Date(),
        })
        .where(eq(usersTable.id, id))
        .returning({
        id: usersTable.id,
        });

    if (!updatedUser) return null;

    return findUserById(updatedUser.id);
}

export async function updateUserByIdAndInvalidateSessions(
    id: number,
    data: Partial<NewUser>,
) {
    const [updatedUser] = await db
        .update(usersTable)
        .set({
        ...data,
        authVersion: sql`${usersTable.authVersion} + 1`,
        updatedAt: new Date(),
        })
        .where(eq(usersTable.id, id))
        .returning({ id: usersTable.id });

    if (!updatedUser) return null;
    return findUserById(updatedUser.id);
}

export async function findClientForDeactivation(tx: DbTransaction, userId: number) {
    const [user] = await tx.select({
        id: usersTable.id,
        role: rolesTable.name,
        status: usersTable.status,
        password: usersTable.password,
        selfDeactivatedAt: usersTable.selfDeactivatedAt,
        authVersion: usersTable.authVersion,
    }).from(usersTable)
        .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
        .where(eq(usersTable.id, userId))
        .limit(1)
        .for("update");
    return user ?? null;
}

const BLOCKING_ORDER_STATUSES = [
    "PENDING_PAYMENT",
    "PAYMENT_REVIEW",
    "PAID",
    "PREPARING",
    "READY_FOR_PICKUP",
    "READY_FOR_DELIVERY",
    "OUT_FOR_DELIVERY",
] as const;

export async function findBlockingClientCommerce(tx: DbTransaction, clientId: number) {
    const [row] = await tx.select({
        orderId: onlineOrdersTable.id,
        orderStatus: onlineOrdersTable.status,
        paymentStatus: onlinePaymentsTable.status,
    }).from(onlineOrdersTable)
        .leftJoin(onlinePaymentsTable, eq(onlinePaymentsTable.orderId, onlineOrdersTable.id))
        .where(and(
            eq(onlineOrdersTable.clientId, clientId),
            or(
                inArray(onlineOrdersTable.status, [...BLOCKING_ORDER_STATUSES]),
                inArray(onlinePaymentsTable.status, ["CREATED", "PROCESSING"]),
            ),
        ))
        .limit(1);
    return row ?? null;
}

export async function markClientSelfDeactivated(tx: DbTransaction, userId: number, now: Date) {
    const [updated] = await tx.update(usersTable).set({
        status: "INACTIVE",
        selfDeactivatedAt: now,
        authVersion: sql`${usersTable.authVersion} + 1`,
        updatedAt: now,
    }).where(and(
        eq(usersTable.id, userId),
        eq(usersTable.status, "ACTIVE"),
        isNull(usersTable.selfDeactivatedAt),
    )).returning({ id: usersTable.id, authVersion: usersTable.authVersion });
    return updated ?? null;
}

export async function invalidateClientTemporaryCredentials(
    tx: DbTransaction,
    userId: number,
    now: Date,
) {
    await tx.update(emailVerificationChallengesTable).set({ consumedAt: now, updatedAt: now })
        .where(and(
            eq(emailVerificationChallengesTable.userId, userId),
            isNull(emailVerificationChallengesTable.consumedAt),
        ));
    await tx.update(passwordResetTokensTable).set({ consumedAt: now })
        .where(and(
            eq(passwordResetTokensTable.userId, userId),
            isNull(passwordResetTokensTable.consumedAt),
        ));
}

export async function updateUserWorkScheduleById(
    id: number,
    data: Pick<NewUser, "workShift" | "shiftStartTime" | "shiftEndTime" | "shiftNote">,
) {
    return updateUserById(id, data);
}

export async function countActiveAdminUsers() {
    const admins = await db
        .select({
        id: usersTable.id,
        })
        .from(usersTable)
        .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
        .where(and(eq(rolesTable.name, "ADMIN"), eq(usersTable.status, "ACTIVE")));

    return admins.length;
}

export async function deleteUserById(id: number) {
    const [deletedUser] = await db
        .delete(usersTable)
        .where(eq(usersTable.id, id))
        .returning({
        id: usersTable.id,
        });

    return deletedUser ?? null;
}
