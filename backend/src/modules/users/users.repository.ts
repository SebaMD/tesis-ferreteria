import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { rolesTable, usersTable, type NewUser } from "../../db/schema/index.js";

const publicUserColumns = {
    id: usersTable.id,
    roleId: usersTable.roleId,
    roleName: rolesTable.name,
    rut: usersTable.rut,
    names: usersTable.names,
    surnames: usersTable.surnames,
    correo: usersTable.correo,
    phone: usersTable.phone,
    status: usersTable.status,
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

export async function findUserById(id: number) {
    const [user] = await db
        .select(publicUserColumns)
        .from(usersTable)
        .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
        .where(eq(usersTable.id, id))
        .limit(1);

    return user;
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
