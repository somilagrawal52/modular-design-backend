import express, { Request, Response } from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();

/* =========================================================
   CORS
========================================================= */

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://192.168.1.9:3000",
  "https://modular-design-flax.vercel.app",
  "https://www.rpexotichomes.com",
  "https://rpexotichomes.com",
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));

const isAllowedOrigin = (origin: string): boolean => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  if (
    /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
      origin
    )
  )
    return true;
  if (/^https?:\/\/([a-z0-9-]+\.)*rpexotichomes\.com$/.test(origin)) return true;
  if (/^https:\/\/([a-z0-9-]+)\.vercel\.app$/.test(origin)) return true;
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman/curl/server-to-server requests with no Origin
      if (!origin || isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      console.warn(`Blocked CORS origin: ${origin}`);
      return callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
  })
);

/* =========================================================
   BODY PARSER
========================================================= */

app.use(
  express.json({
    limit: "25kb",
  })
);

/* =========================================================
   TYPES
========================================================= */

interface ContactRequestBody {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  projectType?: string;
  estimatedUnits?: string;
  projectTimeline?: string;
  preferredContactMethod?: string;
  brief?: string;
  message?: string;

  // Honeypot
  website?: string;
}

/* =========================================================
   ALLOWED VALUES & NORMALIZATION
========================================================= */

const projectTypeNormalizationMap: Record<string, string> = {
  // Capsule
  "modular space capsule": "Space Capsule",
  "space capsule": "Space Capsule",
  "capsule": "Space Capsule",
  // Hospitality
  "resort & hospitality enclave": "Hotel or Retreat",
  "hotel or retreat": "Hotel or Retreat",
  "modular hotel or retreat": "Hotel or Retreat",
  "hospitality": "Hotel or Retreat",
  // Private
  "private estate retreat": "Private Project",
  "private project": "Private Project",
  "modular home": "Private Project",
  "private": "Private Project",
  // Commercial
  "commercial & wellness space": "Commercial Space",
  "commercial space": "Commercial Space",
  "café, bar, or restaurant": "Commercial Space",
  "cafe, bar, or restaurant": "Commercial Space",
  "retail or pop-up": "Commercial Space",
  // Workplace
  "workplace": "Workplace",
  "modular office": "Workplace",
  "office": "Workplace",
  // Community
  "community amenity": "Community Amenity",
  "masterplan community amenity": "Community Amenity",
  "pool or outdoor amenity": "Community Amenity",
  // Partnerships
  "architectural partnership": "Architectural Partnership",
  "partnership": "Architectural Partnership",
};

const allowedProjectTypes = [
  "Space Capsule",
  "Modular Space Capsule",
  "Hotel or Retreat",
  "Modular Hotel or Retreat",
  "Resort & Hospitality Enclave",
  "Private Project",
  "Modular Home",
  "Private Estate Retreat",
  "Commercial Space",
  "Commercial & Wellness Space",
  "Workplace",
  "Modular Office",
  "Community Amenity",
  "Masterplan Community Amenity",
  "Architectural Partnership",
  "Café, Bar, or Restaurant",
  "Retail or Pop-Up",
  "Pool or Outdoor Amenity",
];

function normalizeProjectType(input: string): string {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  if (projectTypeNormalizationMap[lower]) {
    return projectTypeNormalizationMap[lower];
  }
  return trimmed;
}

const allowedUnitValues = [
  "1",
  "2-5",
  "6-10",
  "11-25",
  "26-50",
  "50-plus",
  "not-sure",
];

const allowedTimelineValues = [
  "exploring",
  "within-3-months",
  "3-6-months",
  "6-12-months",
  "12-plus-months",
];

const allowedContactMethods = ["Email", "Phone", "WhatsApp"];

/* =========================================================
   HELPERS
========================================================= */

function cleanText(value: unknown, maxLength = 500): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char
  );
}

function displayValue(value: string): string {
  return value || "Not provided";
}

/* =========================================================
   EMAIL TRANSPORTER CONFIGURATION
========================================================= */

const gmailUser = process.env.GMAIL_USER;
const gmailPassword = process.env.GMAIL_APP_PASSWORD;

const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT
  ? parseInt(process.env.SMTP_PORT, 10)
  : 465;
const smtpSecure =
  process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE === "true"
    : smtpPort === 465;
const smtpUser = process.env.SMTP_USER || gmailUser;
const smtpPass = process.env.SMTP_PASS || gmailPassword;

const createMailTransporter = () => {
  if (smtpHost && smtpHost !== "smtp.gmail.com") {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPassword,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
};

const transporter = createMailTransporter();

/* =========================================================
   HEALTH ENDPOINT
========================================================= */

app.get("/api/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    ok: true,
    service: "RP Exotic Homes contact API",
    timestamp: new Date().toISOString(),
  });
});

/* =========================================================
   CONTACT ENDPOINT
========================================================= */

app.post("/api/contact", async (req: Request, res: Response) => {
  try {
    const body = req.body as ContactRequestBody;

    /* -----------------------------------------
       Honeypot anti-spam
    ----------------------------------------- */

    if (body.website && body.website.trim().length > 0) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: "Invalid submission.",
      });
    }

    /* -----------------------------------------
       Clean incoming values
    ----------------------------------------- */

    const name = cleanText(body.name, 100);

    const email = cleanText(body.email, 200).toLowerCase();

    const phone = cleanText(body.phone, 50);

    const company = cleanText(body.company, 150);

    const rawProjectType = cleanText(body.projectType, 100);
    const projectType = normalizeProjectType(rawProjectType);

    const estimatedUnits = cleanText(body.estimatedUnits, 50);

    const projectTimeline = cleanText(body.projectTimeline, 100);

    const preferredContactMethod = cleanText(
      body.preferredContactMethod,
      30
    );

    const rawBrief = body.brief || body.message || "";
    const brief = cleanText(rawBrief, 5000);

    /* -----------------------------------------
       Required fields
    ----------------------------------------- */

    if (!name || !email || !projectType || !brief) {
      return res.status(400).json({
        ok: false,
        success: false,
        message:
          "Please complete your name, email, project type, and project brief.",
      });
    }

    /* -----------------------------------------
       Email validation
    ----------------------------------------- */

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    /* -----------------------------------------
       Project type validation
    ----------------------------------------- */

    if (
      !allowedProjectTypes.includes(rawProjectType) &&
      !allowedProjectTypes.includes(projectType)
    ) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: "Please select a valid project type.",
      });
    }

    if (
      estimatedUnits &&
      !allowedUnitValues.includes(estimatedUnits)
    ) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: "Please select a valid estimated number of units.",
      });
    }

    if (
      projectTimeline &&
      !allowedTimelineValues.includes(projectTimeline)
    ) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: "Please select a valid project timeline.",
      });
    }

    if (
      preferredContactMethod &&
      !allowedContactMethods.includes(preferredContactMethod)
    ) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: "Please select a valid contact method.",
      });
    }

    /* -----------------------------------------
       Environment validation
    ----------------------------------------- */

    const fromName =
      process.env.CONTACT_FROM_NAME || "RP Exotic Homes Website";
    const senderEmail =
      process.env.CONTACT_FROM_EMAIL || smtpUser || gmailUser || "";
    const recipientEmail =
      process.env.CONTACT_TO_EMAIL || senderEmail;

    const hasAuth = Boolean(
      (gmailUser && gmailPassword) || (smtpUser && smtpPass)
    );

    if (!hasAuth || !recipientEmail) {
      console.error(
        "Email configuration missing: check GMAIL_USER, GMAIL_APP_PASSWORD or SMTP settings, and CONTACT_TO_EMAIL."
      );

      return res.status(500).json({
        ok: false,
        success: false,
        message:
          "Email service is temporarily unavailable. Please try again later.",
      });
    }

    /* -----------------------------------------
       Sanitize values used in headers
    ----------------------------------------- */

    const safeName = safeHeader(name);
    const safeEmail = safeHeader(email);
    const safeProjectType = safeHeader(projectType);

    const emailSubject = safeHeader(
      `New RP Exotic Homes Project Enquiry — ${safeProjectType} — ${safeName}`
    );

    const submittedAt = new Date().toISOString();

    /* =====================================================
       PLAIN TEXT EMAIL
    ===================================================== */

    const textContent = `
NEW RP EXOTIC HOMES PROJECT ENQUIRY
===================================

CUSTOMER DETAILS

Name:
${safeName}

Email:
${safeEmail}

Phone / WhatsApp:
${displayValue(phone)}

Company / Organization:
${displayValue(company)}


PROJECT DETAILS

Project Type:
${safeProjectType}

Estimated Number of Units:
${displayValue(estimatedUnits)}

Project Timeline:
${displayValue(projectTimeline)}

Preferred Contact Method:
${displayValue(preferredContactMethod)}


PROJECT BRIEF

${brief}


SUBMISSION INFORMATION

Submitted:
${submittedAt}

Source:
RP Exotic Homes Website
    `.trim();

    /* =====================================================
       HTML EMAIL
    ===================================================== */

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  />
</head>

<body
  style="
    margin:0;
    padding:24px;
    background:#f4f2ec;
    font-family:Arial,Helvetica,sans-serif;
    color:#171717;
  "
>

  <div
    style="
      max-width:680px;
      margin:0 auto;
      background:#ffffff;
      border:1px solid #dedbd2;
    "
  >

    <div
      style="
        background:#202020;
        color:#ffffff;
        padding:28px 32px;
      "
    >

      <div
        style="
          color:#d2ad43;
          font-size:12px;
          letter-spacing:2px;
          margin-bottom:10px;
        "
      >
        RP EXOTIC HOMES
      </div>

      <h1
        style="
          margin:0;
          font-size:25px;
          line-height:1.3;
          font-weight:600;
        "
      >
        New Project Enquiry
      </h1>

    </div>


    <div style="padding:32px;">

      <h2
        style="
          margin:0 0 20px;
          font-size:16px;
          text-transform:uppercase;
          letter-spacing:1px;
        "
      >
        Customer Details
      </h2>

      <table
        width="100%"
        cellpadding="0"
        cellspacing="0"
        style="border-collapse:collapse;"
      >

        <tr>
          <td
            style="
              padding:10px 0;
              color:#777;
              width:190px;
            "
          >
            Name
          </td>

          <td style="padding:10px 0;">
            ${escapeHtml(safeName)}
          </td>
        </tr>


        <tr>
          <td
            style="
              padding:10px 0;
              color:#777;
            "
          >
            Email
          </td>

          <td style="padding:10px 0;">

            <a
              href="mailto:${escapeHtml(safeEmail)}"
              style="
                color:#b89226;
                text-decoration:none;
              "
            >
              ${escapeHtml(safeEmail)}
            </a>

          </td>
        </tr>


        <tr>
          <td
            style="
              padding:10px 0;
              color:#777;
            "
          >
            Phone / WhatsApp
          </td>

          <td style="padding:10px 0;">
            ${escapeHtml(displayValue(phone))}
          </td>
        </tr>


        <tr>
          <td
            style="
              padding:10px 0;
              color:#777;
            "
          >
            Company
          </td>

          <td style="padding:10px 0;">
            ${escapeHtml(displayValue(company))}
          </td>
        </tr>

      </table>


      <hr
        style="
          border:0;
          border-top:1px solid #dedbd2;
          margin:28px 0;
        "
      />


      <h2
        style="
          margin:0 0 20px;
          font-size:16px;
          text-transform:uppercase;
          letter-spacing:1px;
        "
      >
        Project Details
      </h2>


      <table
        width="100%"
        cellpadding="0"
        cellspacing="0"
        style="border-collapse:collapse;"
      >

        <tr>

          <td
            style="
              padding:10px 0;
              color:#777;
              width:190px;
            "
          >
            Project Type
          </td>

          <td style="padding:10px 0;">
            ${escapeHtml(safeProjectType)}
          </td>

        </tr>


        <tr>

          <td
            style="
              padding:10px 0;
              color:#777;
            "
          >
            Estimated Units
          </td>

          <td style="padding:10px 0;">
            ${escapeHtml(displayValue(estimatedUnits))}
          </td>

        </tr>


        <tr>

          <td
            style="
              padding:10px 0;
              color:#777;
            "
          >
            Project Timeline
          </td>

          <td style="padding:10px 0;">
            ${escapeHtml(displayValue(projectTimeline))}
          </td>

        </tr>


        <tr>

          <td
            style="
              padding:10px 0;
              color:#777;
            "
          >
            Preferred Contact
          </td>

          <td style="padding:10px 0;">
            ${escapeHtml(
              displayValue(preferredContactMethod)
            )}
          </td>

        </tr>

      </table>


      <hr
        style="
          border:0;
          border-top:1px solid #dedbd2;
          margin:28px 0;
        "
      />


      <h2
        style="
          margin:0 0 14px;
          font-size:16px;
          text-transform:uppercase;
          letter-spacing:1px;
        "
      >
        Project Brief
      </h2>


      <div
        style="
          background:#f6f4ee;
          border-left:4px solid #d2ad43;
          padding:18px 20px;
          line-height:1.7;
        "
      >
        ${escapeHtml(brief).replace(/\r?\n/g, "<br>")}
      </div>


      <div
        style="
          margin-top:30px;
          padding-top:20px;
          border-top:1px solid #dedbd2;
          font-size:12px;
          color:#888;
          line-height:1.6;
        "
      >

        Submitted:
        ${escapeHtml(submittedAt)}

        <br />

        Source:
        RP Exotic Homes Website

      </div>

    </div>

  </div>

</body>
</html>
    `.trim();

    /* =====================================================
       SEND EMAIL
    ===================================================== */

    await transporter.sendMail({
      from: `"${fromName}" <${senderEmail}>`,

      to: recipientEmail,

      // When you click Reply in Gmail,
      // it replies directly to the customer.
      replyTo: safeEmail,

      subject: emailSubject,

      text: textContent,

      html: htmlContent,

      headers: {
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All",
      },
    });

    return res.status(200).json({
      ok: true,
      success: true,
      message:
        "Thank you. Your project enquiry has been sent successfully.",
    });
  } catch (error) {
    console.error("Nodemailer contact error:", error);

    return res.status(500).json({
      ok: false,
      success: false,
      message:
        "We couldn't send your enquiry right now. Please try again.",
    });
  }
});

/* =========================================================
   404 FOR BACKEND
========================================================= */

app.use((_req: Request, res: Response) => {
  return res.status(404).json({
    ok: false,
    message: "API route not found.",
  });
});

/* =========================================================
   LOCAL SERVER LISTENER (WHEN NOT ON VERCEL SERVERLESS)
========================================================= */

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(
      `RP Exotic Homes Backend API running on http://localhost:${PORT}`
    );
  });
}

/* =========================================================
   EXPORT EXPRESS APP FOR VERCEL
========================================================= */

export default app;