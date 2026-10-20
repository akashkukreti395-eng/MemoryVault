const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const path = require("path");
const dotenv = require("dotenv");
const crypto = require("node:crypto");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const { Resend } = require("resend");
const nodemailer = require("nodemailer");
dotenv.config();


const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_FROM =
    process.env.EMAIL_FROM || "MemoryVault <onboarding@resend.dev>";

const smtpTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});


function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3001;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;


 // ============================================
 // DATABASE
 // ============================================

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true }
});

/*
 * Private media storage uses Supabase Storage.
 * Keep the bucket private; uploads and downloads are mediated by this backend.
 */
const supabaseConfigured = Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_STORAGE_BUCKET
);

const supabaseStorage = supabaseConfigured
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    }).storage.from(process.env.SUPABASE_STORAGE_BUCKET)
    : null;

const MEDIA_MAX_FILE_BYTES = 25 * 1024 * 1024;
const MEDIA_MAX_FILES_PER_MEMORY = 5;
const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MEDIA_MAX_FILE_BYTES,
        files: MEDIA_MAX_FILES_PER_MEMORY,
        fields: 10,
        parts: MEDIA_MAX_FILES_PER_MEMORY + 10
    },
    fileFilter: (req, file, callback) => {
        const allowedMimeTypes = new Set([
            "image/jpeg", "image/png", "image/webp", "image/gif",
            "video/mp4", "video/webm", "video/quicktime",
            "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav",
            "audio/x-wav", "audio/ogg", "audio/webm"
        ]);
        if (!allowedMimeTypes.has(file.mimetype)) {
            return callback(new Error("Unsupported media type. Upload an image, video, or audio file in a supported format."));
        }
        callback(null, true);
    }
});

function mediaKind(mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    return null;
}

function safeMediaName(name) {
    return String(name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
}

function requireMediaStorage(req, res, next) {
    if (!supabaseConfigured) {
        return res.status(503).json({
            error: "Media uploads are not configured yet. Set the Supabase Storage environment variables and redeploy."
        });
    }
    next();
}


pgPool.query("SELECT 1")
    .then(() => {
        console.log("[PostgreSQL] Connection successful");
    })
    .catch((error) => {
        console.error("[PostgreSQL] Connection failed:", error.message);
    });

const adminEmail = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

if (adminEmail) {
    pgPool.query(
        "UPDATE users SET role = 'admin' WHERE lower(email) = $1",
        [adminEmail]
    )
    .then(async (result) => {
        const adminUser = await pgPool.query(
            "SELECT role FROM users WHERE lower(email) = $1",
            [adminEmail]
        );

        console.log("[admin setup]", {
            accountFound: adminUser.rows.length > 0,
            role: adminUser.rows[0]?.role ?? "not found",
            rowsUpdated: result.rowCount
        });
    })
    .catch((error) => {
        console.error("[admin setup] PostgreSQL error:", error.message);
    });
} else {
    console.log("[admin setup] ADMIN_EMAIL is not configured");
}

// ============================================
// MIDDLEWARE
// ============================================

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));
if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be configured.");
}
app.use(
    session({
       secret: process.env.SESSION_SECRET,

        resave: false,

        saveUninitialized: false,

cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
}

    })
);


// ============================================
// STATIC FRONTEND
// ============================================

app.use(
    express.static(
        path.join(__dirname, ".")
    )
);


// ============================================
// AUTH MIDDLEWARE
// ============================================

function requireLogin(req, res, next) {

    if (!req.session.userId) {

        return res.status(401).json({
            error: "Please log in first."
        });

    }

    next();
}


async function requireAdmin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            error: "Please log in first."
        });
    }

    try {
        const result = await pgPool.query(
            "SELECT role FROM users WHERE id = $1",
            [req.session.userId]
        );

        const user = result.rows[0];

        if (!user || user.role !== "admin") {
            return res.status(403).json({
                error: "Admin access required."
            });
        }

        next();
    } catch (error) {
        console.error("Admin authentication error:", error);

        res.status(500).json({
            error: "Could not verify admin access."
        });
    }
}



app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
        const result = await pgPool.query(`
            SELECT id, name, email, role, created_at
            FROM users
            ORDER BY created_at DESC
        `);

        res.json({ users: result.rows });
    } catch (error) {
        console.error("Admin users error:", error);

        res.status(500).json({
            error: "Could not load user accounts."
        });
    }
});

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
        const result = await pgPool.query(`
            SELECT
                (SELECT COUNT(*)::int
                 FROM users) AS total_users,

                (SELECT COUNT(*)::int
                 FROM memories) AS total_memories,

                (SELECT COUNT(*)::int
                 FROM memory_attachments) AS total_attachments,

                (SELECT COUNT(*)::int
                 FROM memories
                 WHERE NULLIF(reveal_at, '')::timestamptz > NOW()
                ) AS locked_memories,

                (SELECT COUNT(*)::int
                 FROM memories
                 WHERE NULLIF(reveal_at, '')::timestamptz <= NOW()
                ) AS revealed_memories
        `);

        res.json({ stats: result.rows[0] });
    } catch (error) {
        console.error("Admin statistics error:", error);
        res.status(500).json({ error: "Unable to load admin statistics." });
    }
});




app.get(
    "/api/admin/users/:id/memories",
    requireAdmin,
    async (req, res) => {
        try {
            const userId = Number(req.params.id);

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    error: "Invalid user ID."
                });
            }

            const userResult = await pgPool.query(
                `SELECT id, name, email
                 FROM users
                 WHERE id = $1`,
                [userId]
            );

            const user = userResult.rows[0];

            if (!user) {
                return res.status(404).json({
                    error: "User not found."
                });
            }

           
const memoriesResult = await pgPool.query(
    `SELECT
        m.id,
        m.title,
        m.message,
        m.category,
        m.reveal_at,
        m.created_at,
        m.revealed,
        COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', a.id,
                        'original_name', a.original_name,
                        'mime_type', a.mime_type,
                        'media_type', a.media_type,
                        'size_bytes', a.size_bytes
                    )
                    ORDER BY a.created_at
                )
                FROM memory_attachments a
                WHERE a.memory_id = m.id
                  AND a.user_id = m.user_id
            ),
            '[]'::json
        ) AS media
     FROM memories m
     WHERE m.user_id = $1
     ORDER BY m.created_at DESC`,
    [userId]
);


            res.json({
                user,
                memories: memoriesResult.rows
            });
        } catch (error) {
            console.error("Admin memories error:", error);

            res.status(500).json({
                error: "Could not load user memories."
            });
        }
    }
);



app.delete(
    "/api/admin/users/:id",
    requireAdmin,
    async (req, res) => {
        try {
            const userId = Number(req.params.id);

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    error: "Invalid user ID."
                });
            }

            if (userId === Number(req.session.userId)) {
                return res.status(400).json({
                    error: "You cannot delete your own admin account."
                });
            }

            const result = await pgPool.query(
                "DELETE FROM users WHERE id = $1",
                [userId]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({
                    error: "User not found."
                });
            }

            res.json({
                success: true,
                message: "Account and associated memories deleted."
            });
        } catch (error) {
            console.error("Admin deletion error:", error);

            res.status(500).json({
                error: "Could not delete the account."
            });
        }
    }
);



// ============================================
// REGISTER
// ============================================



app.post("/api/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                error: "All fields are required."
            });
        }

        if (String(password).length < 6) {
            return res.status(400).json({
                error: "Password must be at least 6 characters."
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedName = String(name).trim();

        if (
            !normalizedName ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return res.status(400).json({
                error: "Enter a valid name and email address."
            });
        }

        const existingResult = await pgPool.query(
            `SELECT id, email_verified
             FROM users
             WHERE email = $1`,
            [normalizedEmail]
        );

        if (existingResult.rows.length > 0) {
            return res.status(409).json({
                error: "An account with this email already exists. Please log in or contact support."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const verificationToken = crypto.randomBytes(32).toString("hex");

        await pgPool.query(
            `INSERT INTO users (
                name, email, password_hash,
                email_verified, verification_token
            )
            VALUES ($1, $2, $3, 0, $4)`,
            [
                normalizedName,
                normalizedEmail,
                passwordHash,
                verificationToken
            ]
        );

        const verificationLink =
            `${APP_URL}/api/verify-email?token=${verificationToken}`;
let emailResult;

const verificationHtml = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;line-height:1.6">
        <h2>Welcome to MemoryVault!</h2>
        <p>Click the button below to verify your email address and activate your account.</p>
        <p>
            <a href="${verificationLink}"
               style="display:inline-block;padding:12px 20px;background:#222;color:#fff;text-decoration:none;border-radius:6px">
               Verify my email
            </a>
        </p>
        <p>If the button doesn't work, open this link:</p>
        <p><a href="${verificationLink}">${verificationLink}</a></p>
        <p>If you didn't create a MemoryVault account, you can ignore this email.</p>
    </div>
`;

if (process.env.RENDER) {
    emailResult = await resend.emails.send({
        from: EMAIL_FROM,
        to: [normalizedEmail],
        subject: "Verify your MemoryVault email",
        html: verificationHtml
    });
} else {
    emailResult = await smtpTransporter.sendMail({
        from: `"MemoryVault" <${process.env.GMAIL_USER}>`,
        to: normalizedEmail,
        subject: "Verify your MemoryVault email",
        html: verificationHtml
    });
}


       console.log(
    "[Registration email result]",
    JSON.stringify(emailResult)
);

const emailFailed = process.env.RENDER
    ? Boolean(emailResult.error || !emailResult.data?.id)
    : !emailResult.messageId;

if (emailFailed) {
    console.error("Verification email was not confirmed.");

            await pgPool.query(
                `DELETE FROM users
                 WHERE email = $1 AND email_verified = 0`,
                [normalizedEmail]
            );

            return res.status(502).json({
                error: "We couldn't send the verification email. Please try registering again."
            });
        }

        res.status(201).json({
            success: true,
            message: "Account created. Please check your email and click the verification link before logging in."
        });
    } catch (error) {
        console.error("Registration error:", error);

        res.status(500).json({
            error: "Could not create account. Please try again."
        });
    }
});



/* Verify a user's email address */

app.get("/api/verify-email", async (req, res) => {
    try {
        const token = String(req.query.token || "").trim();

        if (!token) {
            return res.status(400).send("Verification link is invalid.");
        }

        const result = await pgPool.query(
            `SELECT id
             FROM users
             WHERE verification_token = $1`,
            [token]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(400).send(
                "This verification link is invalid or has already been used."
            );
        }

        await pgPool.query(
            `UPDATE users
             SET email_verified = 1,
                 verification_token = NULL
             WHERE id = $1`,
            [user.id]
        );

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Email Verified | MemoryVault</title>
            </head>
            <body style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px">
                <h1>Email verified successfully!</h1>
                <p>Your MemoryVault account is ready. You can now log in.</p>
                <a href="${APP_URL}">Return to MemoryVault</a>
            </body>
            </html>
        `);
    } catch (error) {
        console.error("Email verification error:", error);
        res.status(500).send("Could not verify your email. Please try again.");
    }
});


/* Temporary endpoint to resend a verification email */


app.post("/api/resend-verification", async (req, res) => {
    try {
        const email = String(req.body?.email || "")
            .trim()
            .toLowerCase();

        if (!email) {
            return res.status(400).json({
                error: "Email is required."
            });
        }

        const userResult = await pgPool.query(
            `SELECT id, email_verified
             FROM users
             WHERE email = $1`,
            [email]
        );

        const user = userResult.rows[0];

        if (!user) {
            return res.status(404).json({
                error: "Account not found."
            });
        }

        if (user.email_verified === true ||
            user.email_verified === 1 ||
            user.email_verified === "1") {
            return res.json({
                success: true,
                message: "Your email is already verified."
            });
        }

        const token = crypto.randomBytes(32).toString("hex");

        const verificationLink =
            `${APP_URL}/api/verify-email?token=${token}`;

        const verificationHtml = `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;line-height:1.6">
                <h2>Verify your MemoryVault account</h2>
                <p>Click below to activate your account.</p>
                <p>
                    <a href="${verificationLink}"
                       style="display:inline-block;padding:12px 20px;background:#222;color:#fff;text-decoration:none;border-radius:6px">
                       Verify my email
                    </a>
                </p>
                <p>If the button doesn't work, open this link:</p>
                <p><a href="${verificationLink}">${verificationLink}</a></p>
                <p>If you didn't request this email, you can ignore it.</p>
            </div>
        `;

        let emailSent = false;

        if (process.env.RENDER) {
            const result = await resend.emails.send({
                from: EMAIL_FROM,
                to: [email],
                subject: "Verify your MemoryVault email",
                html: verificationHtml
            });

            emailSent = Boolean(result.data?.id && !result.error);
        } else {
            const result = await smtpTransporter.sendMail({
                from: `"MemoryVault" <${process.env.GMAIL_USER}>`,
                to: email,
                subject: "Verify your MemoryVault email",
                html: verificationHtml
            });

            emailSent = Boolean(result.messageId);
        }

        if (!emailSent) {
            console.error("Verification email sending was not confirmed.");

            return res.status(502).json({
                error: "Could not send the verification email. Please try again."
            });
        }

        await pgPool.query(
            `UPDATE users
             SET verification_token = $1
             WHERE id = $2`,
            [token, user.id]
        );

        return res.json({
            success: true,
            message: "Verification email sent successfully."
        });
    } catch (error) {
        console.error("Resend verification error:", error);

        return res.status(500).json({
            error: "Could not resend verification email. Please try again later."
        });
    }
});





// ============================================
// LOGIN
// ============================================


app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "Email and password are required."
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        const result = await pgPool.query(
            `SELECT *
             FROM users
             WHERE email = $1`,
            [normalizedEmail]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!validPassword) {
            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        if (!user.email_verified) {
            return res.status(403).json({
                error: "Please verify your email before logging in. Check your inbox."
            });
        }

        const configuredAdminEmail = String(
            process.env.ADMIN_EMAIL || ""
        ).trim().toLowerCase();

        if (
            configuredAdminEmail &&
            user.email.toLowerCase() === configuredAdminEmail
        ) {
            await pgPool.query(
                "UPDATE users SET role = 'admin' WHERE id = $1",
                [user.id]
            );

            user.role = "admin";
        }

        req.session.userId = user.id;

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role || "user"
            }
        });
    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            error: "Could not log in."
        });
    }
});



// ============================================
// LOGOUT
// ============================================

app.post("/api/logout", (req, res) => {

    req.session.destroy(() => {

        res.json({
            success: true
        });

    });

});


// ============================================
// CURRENT USER
// ============================================


app.get("/api/me", requireLogin, async (req, res) => {
    try {
        const result = await pgPool.query(
            `SELECT id, name, email, created_at, role
             FROM users
             WHERE id = $1`,
            [req.session.userId]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({
                error: "User not found."
            });
        }

        res.json({ user });
    } catch (error) {
        console.error("Current user error:", error);

        res.status(500).json({
            error: "Could not load user."
        });
    }
});



// ============================================
// CREATE MEMORY
// ============================================


app.post("/api/memories", requireLogin, async (req, res) => {
    try {
        const {
            title,
            message,
            revealAt,
            category = "Personal"
        } = req.body;

        if (!title || !revealAt) {
            return res.status(400).json({
                error: "Title and reveal date are required."
            });
        }

        

const revealDate = new Date(revealAt);



        if (Number.isNaN(revealDate.getTime())) {
            return res.status(400).json({
                error: "Invalid reveal date."
            });
        }

        if (revealDate <= new Date()) {
            return res.status(400).json({
                error: "Reveal date must be in the future."
            });
        }

        const cleanTitle = String(title).trim();
        const cleanMessage = String(message || "").trim();
        const cleanCategory = String(category).trim() || "Personal";

        if (!cleanTitle) {
            return res.status(400).json({
                error: "Title cannot be empty."
            });
        }
        // Existing text-only memories remain supported. Media-only memories
        // are allowed because attachments are uploaded immediately afterward.
        if (!cleanMessage && req.body.allowMediaOnly !== true && req.body.allowMediaOnly !== "true") {
            return res.status(400).json({
                error: "Add a message or choose at least one media attachment."
            });
        }

        const result = await pgPool.query(
            `INSERT INTO memories (
                user_id, title, message, reveal_at, category
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id`,
            [
                req.session.userId,
                cleanTitle,
                cleanMessage,
                revealDate.toISOString(),
                cleanCategory
            ]
        );

        res.status(201).json({
            success: true,
            memoryId: result.rows[0].id,
            message: "Memory created successfully."
        });
    } catch (error) {
        console.error("Memory creation error:", error);

        res.status(500).json({
            error: "Could not create memory."
        });
    }
});




// ============================================
// MEMORY MEDIA
// ============================================

// Apply migrations/multimedia.sql to the production PostgreSQL database
// before using these routes.
app.post(
    "/api/memories/:id/media",
    requireLogin,
    requireMediaStorage,
    (req, res, next) => mediaUpload.array("media", MEDIA_MAX_FILES_PER_MEMORY)(req, res, (error) => {
        if (error) {
            if (error instanceof multer.MulterError) {
                const message = error.code === "LIMIT_FILE_SIZE"
                    ? "Each file must be 25 MB or smaller."
                    : error.code === "LIMIT_FILE_COUNT"
                        ? `Upload no more than ${MEDIA_MAX_FILES_PER_MEMORY} files per memory.`
                        : "The upload exceeded an allowed limit.";
                return res.status(400).json({ error: message });
            }
            return res.status(400).json({ error: error.message || "Invalid media upload." });
        }
        next();
    }),
    async (req, res) => {
        const memoryId = Number(req.params.id);
        if (!Number.isSafeInteger(memoryId) || memoryId <= 0) {
            return res.status(400).json({ error: "Invalid memory ID." });
        }
        const files = req.files || [];
        if (!files.length) {
            return res.status(400).json({ error: "Choose at least one media file." });
        }

        const ownerResult = await pgPool.query(
            "SELECT id FROM memories WHERE id = $1 AND user_id = $2",
            [memoryId, req.session.userId]
        );
        if (!ownerResult.rowCount) {
            return res.status(404).json({ error: "Memory not found." });
        }

        const uploadedKeys = [];
        const client = await pgPool.connect();
        try {
            await client.query("BEGIN");
            for (const file of files) {
                const kind = mediaKind(file.mimetype);
                if (!kind) throw new Error("Unsupported media type.");
                const objectKey = `users/${req.session.userId}/memories/${memoryId}/${crypto.randomUUID()}-${safeMediaName(file.originalname)}`;
                const { error: storageError } = await supabaseStorage.upload(objectKey, file.buffer, {
                    contentType: file.mimetype,
                    upsert: false,
                    cacheControl: "60"
                });
                if (storageError) throw storageError;
                uploadedKeys.push(objectKey);
                await client.query(`
                    INSERT INTO memory_attachments
                        (memory_id, user_id, object_key, original_name, mime_type, media_type, size_bytes)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    memoryId, req.session.userId, objectKey,
                    safeMediaName(file.originalname), file.mimetype, kind, file.size
                ]);
            }
            await client.query("COMMIT");
            res.status(201).json({ success: true, uploaded: files.length });
        } catch (error) {
            await client.query("ROLLBACK").catch(() => {});
            await supabaseStorage.remove(uploadedKeys).catch(() => {});
            console.error("Media upload error:", error);
            res.status(500).json({ error: "Could not save all media files. Please try again." });
        } finally {
            client.release();
        }
    }
);

app.get("/api/media/:id/access", requireLogin, requireMediaStorage, async (req, res) => {
    try {
        const attachmentId = Number(req.params.id);
        if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
            return res.status(400).json({ error: "Invalid media ID." });
        }
        const result = await pgPool.query(`
            SELECT a.object_key, a.mime_type, a.original_name
            FROM memory_attachments a
            JOIN memories m ON m.id = a.memory_id
            WHERE a.id = $1
              AND a.user_id = $2
              AND m.user_id = $2
              AND NULLIF(m.reveal_at, '')::timestamptz <= NOW()
        `, [attachmentId, req.session.userId]);

        const attachment = result.rows[0];
        if (!attachment) {
            return res.status(404).json({ error: "Media not found or its memory is still locked." });
        }

        const { data, error } = await supabaseStorage.createSignedUrl(
            attachment.object_key,
            60,
            { download: false }
        );
        if (error || !data?.signedUrl) throw error || new Error("Could not create signed URL.");

        res.json({ url: data.signedUrl, mimeType: attachment.mime_type, name: attachment.original_name });
    } catch (error) {
        console.error("Media access error:", error);
        res.status(500).json({ error: "Could not open this media file." });
    }
});

app.get("/api/admin/media/:id/access", requireAdmin, requireMediaStorage, async (req, res) => {
    try {
        const attachmentId = Number(req.params.id);

        if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
            return res.status(400).json({ error: "Invalid attachment ID." });
        }

        const result = await pgPool.query(
            `SELECT object_key
             FROM memory_attachments
             WHERE id = $1`,
            [attachmentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Attachment not found." });
        }

       const { data, error } = await supabaseStorage
    .createSignedUrl(result.rows[0].object_key, 60);

        if (error || !data?.signedUrl) {
            console.error("Admin media access error:", error);
            return res.status(500).json({ error: "Unable to access this attachment." });
        }

        return res.json({ url: data.signedUrl });
    } catch (error) {
        console.error("Admin media access error:", error);
        return res.status(500).json({ error: "Unable to access this attachment." });
    }
});



// ============================================
// GET USER MEMORIES
// ============================================



app.get(
    "/api/memories",
    requireLogin,
    async (req, res) => {
        try {
            const now = new Date();

            const dueMemoriesResult = await pgPool.query(`
                SELECT
                    id,
                    title,
                    reveal_at,
                    reveal_email_sent
                FROM memories
                WHERE user_id = $1
                  AND reveal_at <= $2
                  AND reveal_email_sent = 0
            `, [
                req.session.userId,
                now.toISOString()
            ]);

            const userResult = await pgPool.query(`
                SELECT name, email
                FROM users
                WHERE id = $1
            `, [req.session.userId]);

            const user = userResult.rows[0];

            if (user) {
                for (const memory of dueMemoriesResult.rows) {
                    try {
                        const emailResult = await resend.emails.send({
                            from: EMAIL_FROM,
                            to: [user.email],
                            subject: `A MemoryVault memory is ready to reveal: ${memory.title}`,
                            html: `
                                <div style="font-family:Arial,sans-serif;line-height:1.6">
                                    <h2>Your memory is ready!</h2>
                                    <p>Hello ${escapeHtml(user.name)},</p>
                                    <p>Your memory "<strong>${escapeHtml(memory.title)}</strong>" has reached its reveal time.</p>
                                    <p>Log in to MemoryVault to view it.</p>
                                    <p><a href="${APP_URL}">Open MemoryVault</a></p>
                                </div>
                            `
                        });

                        if (!emailResult.error && emailResult.data?.id) {
                            await pgPool.query(`
                                UPDATE memories
                                SET reveal_email_sent = 1
                                WHERE id = $1
                                  AND user_id = $2
                                  AND reveal_email_sent = 0
                            `, [
                                memory.id,
                                req.session.userId
                            ]);
                        } else {
                            console.error("Reveal notification was not confirmed.");
                        }
                    } catch (emailError) {
                        console.error("Reveal notification error:", emailError);
                    }
                }
            }

            const memoriesResult = await pgPool.query(`
                SELECT
                    id,
                    title,
                    message,
                    reveal_at,
                    created_at,
                    revealed,
                    category,
                    (SELECT COUNT(*)::int FROM memory_attachments a WHERE a.memory_id = memories.id AND a.user_id = $1) AS media_count,
                    CASE WHEN NULLIF(reveal_at, '')::timestamptz <= NOW() THEN
                        COALESCE((
                            SELECT json_agg(json_build_object(
                                'id', a.id,
                                'original_name', a.original_name,
                                'mime_type', a.mime_type,
                                'media_type', a.media_type,
                                'size_bytes', a.size_bytes
                            ) ORDER BY a.created_at)
                            FROM memory_attachments a
                            WHERE a.memory_id = memories.id AND a.user_id = $1
                        ), '[]'::json)
                    ELSE '[]'::json END AS media
                FROM memories
                WHERE user_id = $1
                ORDER BY reveal_at ASC
            `, [req.session.userId]);

            const memories = memoriesResult.rows;

            const result = memories.map(memory => {
                const isRevealed =
                    new Date(memory.reveal_at) <= now;

                return {
                    ...memory,
                    revealed: Boolean(memory.revealed || isRevealed),
                    message: isRevealed ? memory.message : null
                };
            });

            res.json({ memories: result });

        } catch (error) {
            console.error("Memory retrieval error:", error);

            res.status(500).json({
                error: "Could not load memories."
            });
        }
    }
);


// ============================================
// DELETE MEMORY
// ============================================


app.delete(
    "/api/memories/:id",
    requireLogin,
    async (req, res) => {
        try {
            const result = await pgPool.query(`
                DELETE FROM memories
                WHERE id = $1
                  AND user_id = $2
            `, [
                Number(req.params.id),
                req.session.userId
            ]);

            if (result.rowCount === 0) {
                return res.status(404).json({
                    error: "Memory not found."
                });
            }

            res.json({
                success: true
            });

        } catch (error) {
            console.error("Memory deletion error:", error);

            res.status(500).json({
                error: "Could not delete memory."
            });
        }
    }
);



// ============================================
// HOME PAGE
// ============================================




// ============================================
// START SERVER
// ============================================

app.post("/api/test-email", async (req, res) => {
    try {
        if (process.env.NODE_ENV === "production") {
            return res.status(403).json({
                error: "Test endpoint is disabled in production."
            });
        }

        const recipient = String(req.body?.email || "")
            .trim()
            .toLowerCase();

        if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
            return res.status(400).json({
                error: "Enter a valid recipient email."
            });
        }

const result = await resend.emails.send({
    from: EMAIL_FROM,
    to: [recipient],
    subject: "MemoryVault email test",
    html: "<h2>MemoryVault email test</h2><p>If you received this email, your Resend connection is working.</p>"
});


        if (result.error) {
            console.error("Resend test failed:", result.error);
            return res.status(502).json({
                error: "Email provider rejected the test email."
            });
        }

        res.json({
            success: true,
            message: "Email accepted by Resend.",
            id: result.data?.id
        });
    } catch (error) {
        console.error("Test email error:", error);
        res.status(500).json({
            error: "Could not send test email."
        });
    }
});
app.use((req, res) => {
    res.sendFile(
        path.join(__dirname, "index.html")
    );
});

app.listen(
    PORT,
    () => {

        console.log(
            `MemoryVault running at http://localhost:${PORT}`
        );

    }
);