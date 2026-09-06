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
  "http://192.168.1.9:3000",
  "https://modular-design-flax.vercel.app",
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman/curl/server-to-server requests with no Origin
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`Blocked CORS origin: ${origin}`);
      return callback(new Error("Blocked by CORS policy"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
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

  // Honeypot
  website?: string;
}

/* =========================================================
   ALLOWED VALUES
========================================================= */

const allowedProjectTypes = [
  "Space Capsule",
  "Hotel or Retreat",
  "Private Project",
  "Commercial Space",
  "Workplace",
  "Community Amenity",
];

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
   NODEMAILER / GMAIL
========================================================= */

const gmailUser = process.env.GMAIL_USER;
const gmailPassword = process.env.GMAIL_APP_PASSWORD;

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: gmailUser,
    pass: gmailPassword,
  },

  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
});

/* =========================================================
   HEALTH ENDPOINT
========================================================= */

app.get("/api/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    ok: true,
    service: "DVR contact API",
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

    const projectType = cleanText(body.projectType, 100);

    const estimatedUnits = cleanText(body.estimatedUnits, 50);

    const projectTimeline = cleanText(body.projectTimeline, 100);

    const preferredContactMethod = cleanText(
      body.preferredContactMethod,
      30
    );

    const brief = cleanText(body.brief, 5000);

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

       If your frontend uses slightly different
       exact values, update this array accordingly.
    ----------------------------------------- */

    if (!allowedProjectTypes.includes(projectType)) {
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

    const recipientEmail =
      process.env.CONTACT_TO_EMAIL || gmailUser;

    if (!gmailUser || !gmailPassword || !recipientEmail) {
      console.error(
        "Email configuration missing: check GMAIL_USER, GMAIL_APP_PASSWORD and CONTACT_TO_EMAIL."
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
      `New DVR Project Enquiry — ${safeProjectType} — ${safeName}`
    );

    const submittedAt = new Date().toISOString();

    /* =====================================================
       PLAIN TEXT EMAIL
    ===================================================== */

    const textContent = `
NEW DREAM VENTURES REALTY PROJECT ENQUIRY
=========================================

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
Dream Ventures Realty Website
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
        DREAM VENTURES REALTY
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
        Dream Ventures Realty Website

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
      from: `"Dream Ventures Realty Website" <${gmailUser}>`,

      to: recipientEmail,

      // When you click Reply in Gmail,
      // it replies directly to the customer.
      replyTo: safeEmail,

      subject: emailSubject,

      text: textContent,

      html: htmlContent,
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
   EXPORT EXPRESS APP FOR VERCEL
========================================================= */

export default app;