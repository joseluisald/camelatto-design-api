import mysql from "mysql2/promise";

export const db = mysql.createPool({
  host: process.env.DB_HOST || "",
  user: process.env.DB_USER || "",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "",
  port: Number(process.env.DB_PORT || 3306),
  connectTimeout: 5000,
  timezone: "Z",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 100,
});

db.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});
