import nodemailer from "nodemailer";

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const SMTP_HOST = process.env.SMTP_HOST;
  const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const FROM_EMAIL = process.env.FROM_EMAIL || process.env.VITE_ADMIN_EMAIL;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !FROM_EMAIL) {
    return json(500, {
      error:
        "SMTP config incomplete. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL.",
    });
  }

  let payload;
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: "Invalid JSON payload" });
  }

  const { bcc, subject, text } = payload;
  if (!bcc || (Array.isArray(bcc) && bcc.length === 0)) {
    return json(400, { error: "No recipients (bcc) provided" });
  }

  const recipients = Array.isArray(bcc) ? bcc : [String(bcc)];
  const validRecipients = recipients
    .map((email) => String(email || "").trim())
    .filter(Boolean);

  if (validRecipients.length === 0) {
    return json(400, { error: "No valid email addresses provided" });
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    const results = [];
    for (const recipient of validRecipients) {
      const info = await transporter.sendMail({
        from: FROM_EMAIL,
        to: recipient,
        subject: subject || "(no subject)",
        text: text || "",
      });
      results.push({ recipient, messageId: info.messageId });
    }

    return json(200, { ok: true, count: results.length, results });
  } catch (err) {
    console.error("Send mail error:", err);
    return json(500, { error: String(err) });
  }
};
