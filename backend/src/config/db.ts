// src/config/db.ts
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set in .env");
}

// Kết nối tới Neon Postgres
export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // thường cần với Neon / cloud Postgres
  },
});
