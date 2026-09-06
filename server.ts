import express, { Request, Response } from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();

// 1. CORS Setup - Allows requests from your frontend applications
const allowedOrigins = [
  'http://localhost:5173', // Vite default port
  'http://localhost:3000', 
  'http://192.168.1.9:3000', // Next.js / React default port
  process.env.FRONTEND_URL, // Production frontend domain
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman) or allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Middleware to parse incoming JSON request bodies
app.use(express.json());

// 2. Nodemailer Transporter Configuration (Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Helper: Escape HTML to protect against basic HTML injection in email clients
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char] ?? char)
  );

// Helper: Clean multiline input to prevent email header injection
const safeHeader = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

interface ContactRequestBody {
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message?: string;
}

// 3. Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 4. Contact Route Definition
app.post('/contact', async (req: Request<{}, {}, ContactRequestBody>, res: Response) => {
  const { name, email, phone, subject, message } = req.body;

  // Basic Payload Validation
  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: name, email, and message are required.',
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address.',
    });
  }

  // Validate Server Configuration
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const recipientEmail = process.env.CONTACT_TO_EMAIL || gmailUser;

  if (!gmailUser || !gmailPass) {
    console.error('CRITICAL: Server environment error - GMAIL_USER or GMAIL_APP_PASSWORD is missing.');
    return res.status(500).json({
      success: false,
      message: 'Email service configuration error on server.',
    });
  }

  // Sanitize Inputs
  const safeName = safeHeader(name);
  const safeEmail = safeHeader(email);
  const safePhone = phone ? safeHeader(phone) : 'Not provided';
  const safeSubject = subject ? safeHeader(subject) : `New Contact Enquiry from ${safeName}`;
  const htmlMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');

  // Construct Email Body Variants
  const textContent = `
NEW CONTACT SUBMISSION
======================
Name: ${safeName}
Email: ${safeEmail}
Phone: ${safePhone}

Message:
${message}
  `.trim();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f5; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e4e4e7; padding: 24px;">
          <h2 style="color: #2563eb; margin-top: 0;">New Contact Form Message</h2>
          <p><strong>Name:</strong> ${escapeHtml(safeName)}</p>
          <p><strong>Email:</strong> <a href="mailto:${escapeHtml(safeEmail)}" style="color: #2563eb;">${escapeHtml(safeEmail)}</a></p>
          <p><strong>Phone:</strong> ${escapeHtml(safePhone)}</p>
          
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
          
          <p><strong>Message:</strong></p>
          <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 12px 16px; margin-bottom: 20px; border-radius: 0 4px 4px 0;">
            ${htmlMessage}
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    // Send Email
    await transporter.sendMail({
      from: `"Contact Form" <${gmailUser}>`,
      to: recipientEmail,
      replyTo: safeEmail,
      subject: safeSubject,
      text: textContent,
      html: htmlContent,
    });

    return res.status(200).json({
      ok: true,
  success: true,
  message: 'Your message has been sent successfully.',
    });
  } catch (error) {
    console.error('Nodemailer Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send email. Check server logs.',
    });
  }
});

// 5. Start Express Server
const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});