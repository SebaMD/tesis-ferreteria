"use strict";

import { User } from "../entities/user.entity.js";
import { AppDataSource } from "./configDb.js";
import bcrypt from "bcrypt";

export async function createInitialUsers() {
    try{
        const userRepository = AppDataSource.getRepository(User);

        const userCount = await userRepository.count();
        if(userCount > 0) return;

        const users = [
            {
                username: "Administrador",
                email: "admin@gmail.com",
                rut: "12345678-9",
                password: await bcrypt.hash("@dmin.2026", 10),
                role: "administrador",
            },
            {
                username: "Fernanda Fernandez",
                email: "fafernandez@gmail.com",
                rut: "11222333-4",
                password: await bcrypt.hash("Fernanda123.", 10),
                role: "cajero",
            },
            {
                username: "Fernando Fernandez",
                email: "fofernandez@gmail.com",
                rut: "55666777-8",
                password: await bcrypt.hash("Fernando123.", 10),
                role: "bodeguero",
            },
            {
                username: "Sebastian Medina",
                email: "smedina@gmail.com",
                rut: "98765432-1",
                password: await bcrypt.hash("Sebastian123.", 10),
                role: "cliente",
            },
        ];

        for (const user of users) {
            await userRepository.save(userRepository.create(user));
        }
        console.log("=> Usuario iniciales creados exitosamente");
    } catch (error){
        console.error("Error al crear usuarios iniciales:", error);
        process.exit(1);
    }
}