import nodemailer from "nodemailer";
import { env } from "./env.ts";

/** MOCK_MODE: emails land here instead of SMTP (tests read it). */
export const mockMail: { to: string; subject: string; text: string }[] = [];

/** Platform emails (alerts, limit notices, pilot reports) via ALERT_SMTP_URL. */
export async function sendMail(to: string, subject: string, text: string) {
  if (env().MOCK_MODE) return void mockMail.push({ to, subject, text });
  const url = process.env.ALERT_SMTP_URL;
  if (!url) throw new Error("ALERT_SMTP_URL is not set");
  await nodemailer.createTransport(url).sendMail({ from: process.env.ALERT_FROM ?? "no-reply@chattybomb.local", to, subject, text });
}
