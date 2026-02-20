require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || process.env.VITE_ADMIN_EMAIL;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !FROM_EMAIL) {
  console.warn('SMTP config incomplete. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and FROM_EMAIL in environment.');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: SMTP_USER
    ? {
        user: SMTP_USER,
        pass: SMTP_PASS,
      }
    : undefined,
});

app.post('/api/send-mail', async (req, res) => {
  const { bcc, subject, text } = req.body;
  if (!bcc || (Array.isArray(bcc) && bcc.length === 0)) {
    return res.status(400).json({ error: 'No recipients (bcc) provided' });
  }

  const recipients = Array.isArray(bcc) ? bcc : [String(bcc)];
  const validRecipients = recipients.filter(email => email && email.trim());

  if (validRecipients.length === 0) {
    return res.status(400).json({ error: 'No valid email addresses provided' });
  }

  try {
    // Odoslať jednotlivý email každému príjemcovi (bez toho aby videli ostatných)
    const results = [];
    for (const recipient of validRecipients) {
      const info = await transporter.sendMail({
        from: FROM_EMAIL,
        to: recipient,
        subject: subject || '(no subject)',
        text: text || '',
      });
      results.push({ recipient, status: 'sent', info });
    }
    res.json({ ok: true, count: results.length, results });
  } catch (err) {
    console.error('Send mail error:', err);
    res.status(500).json({ error: String(err) });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`dst-crm server listening on ${port}`));
