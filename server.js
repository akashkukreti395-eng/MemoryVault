const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const path = require("path");
const dotenv = require("dotenv");
const crypto = require("node:crypto");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

// Resend email integration

// Mailjet email integration
async function sendAppEmail({ to, subject, html }) {
    const apiKey = process.env.MAILJET_API_KEY;
    const secretKey = process.env.MAILJET_SECRET_KEY;
    const fromEmail = process.env.MAILJET_FROM_EMAIL;
    const fromName = process.env.MAILJET_FROM_NAME || "MemoryVault";

    if (!apiKey || !secretKey) {
        throw new Error("Mailjet API credentials are missing.");
    }

    if (!fromEmail) {
        throw new Error("MAILJET_FROM_EMAIL is not configured.");
    }

    const auth = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");

    const response = await fetch("https://api.mailjet.com/v3.1/send", {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            Messages: [{
                From: { Email: fromEmail, Name: fromName },
                To: [{ Email: to }],
                Subject: subject,
                HTMLPart: html
            }]
        })
    });

    const result = await response.json().catch(() => ({}));
    const message = result.Messages?.[0];

    if (!response.ok || message?.Status !== "success") {
        const detail = message?.Errors?.map(
            item => item.ErrorMessage
        ).join("; ") || result.ErrorMessage ||
            `Mailjet request failed: HTTP ${response.status}`;

        throw new Error(detail);
    }

    return {
        provider: "mailjet",
        messageId: message.To?.[0]?.MessageID || "accepted"
    };
}



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
                ) AS revealed_memories,

                (SELECT COUNT(*)::int
                 FROM family_accounts) AS family_total_accounts,

                (SELECT COUNT(*)::int
                 FROM family_accounts
                 WHERE email_verified = TRUE) AS family_verified_accounts,

                (SELECT COUNT(*)::int
                 FROM family_accounts
                 WHERE email_verified = FALSE) AS family_unverified_accounts,

                (SELECT COUNT(*)::int
                 FROM family_members) AS family_total_members,

                (SELECT COUNT(*)::int
                 FROM family_memories) AS family_total_memories,

                (SELECT COUNT(*)::int
                 FROM family_attachments) AS family_total_attachments,

                (SELECT COUNT(*)::int
                 FROM family_memories
                 WHERE reveal_at > NOW()) AS family_locked_memories,

                (SELECT COUNT(*)::int
                 FROM family_memories
                 WHERE reveal_at <= NOW()) AS family_revealed_memories
        `);

        res.json({ stats: result.rows[0] });
    } catch (error) {
        console.error("Admin statistics error:", error);
        res.status(500).json({ error: "Unable to load admin statistics." });
    }
});

app.get("/api/admin/families", requireAdmin, async (req, res) => {
    try {
        const search = String(req.query.search || "").trim();
        const pageValue = String(req.query.page || "1");
        const pageSizeValue = String(req.query.pageSize || "8");
        if (!/^\d+$/.test(pageValue) || !/^\d+$/.test(pageSizeValue)) {
            return res.status(400).json({ error: "Invalid pagination values." });
        }

        const page = Number(pageValue);
        const pageSize = Number(pageSizeValue);
        if (!Number.isSafeInteger(page) || page < 1 ||
            !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
            return res.status(400).json({ error: "Invalid pagination values." });
        }

        const searchPattern = `%${search}%`;
        const countResult = await pgPool.query(`
            SELECT COUNT(*)::int AS total
            FROM family_accounts fa
            WHERE $1 = ''
               OR fa.family_name ILIKE $2
               OR fa.owner_name ILIKE $2
               OR fa.owner_username ILIKE $2
               OR fa.owner_email ILIKE $2
        `, [search, searchPattern]);
        const familyResult = await pgPool.query(`
            SELECT
                fa.id,
                fa.family_name,
                fa.owner_name,
                fa.owner_username,
                fa.owner_email,
                fa.email_verified,
                fa.created_at,
                (SELECT COUNT(*)::int
                 FROM family_members fm
                 WHERE fm.family_id = fa.id) AS member_count,
                (SELECT COUNT(*)::int
                 FROM family_memories fmem
                 WHERE fmem.family_id = fa.id) AS memory_count
            FROM family_accounts fa
            WHERE $1 = ''
               OR fa.family_name ILIKE $2
               OR fa.owner_name ILIKE $2
               OR fa.owner_username ILIKE $2
               OR fa.owner_email ILIKE $2
            ORDER BY fa.created_at DESC, fa.id DESC
            LIMIT $3 OFFSET $4
        `, [search, searchPattern, pageSize, (page - 1) * pageSize]);

        res.json({
            families: familyResult.rows,
            total: countResult.rows[0].total,
            page,
            pageSize
        });
    } catch (error) {
        console.error("Admin family directory error:", error);
        res.status(500).json({ error: "Could not load family accounts." });
    }
});

app.get("/api/admin/families/:familyId", requireAdmin, async (req, res) => {
    try {
        const familyId = Number(req.params.familyId);
        if (!Number.isSafeInteger(familyId) || familyId <= 0) {
            return res.status(400).json({ error: "Invalid family ID." });
        }

        const familyResult = await pgPool.query(`
            SELECT id, family_name, owner_name, owner_username, owner_email,
                   email_verified, created_at
            FROM family_accounts
            WHERE id = $1
        `, [familyId]);
        const family = familyResult.rows[0];
        if (!family) return res.status(404).json({ error: "Family account not found." });

        const [membersResult, memoriesResult] = await Promise.all([
            pgPool.query(`
                SELECT id, family_id, name, username, status, created_at
                FROM family_members
                WHERE family_id = $1
                ORDER BY created_at, id
            `, [familyId]),
            pgPool.query(`
                SELECT id, family_id, title, message, category, reveal_at, created_at
                FROM family_memories
                WHERE family_id = $1
                ORDER BY created_at DESC, id DESC
            `, [familyId])
        ]);
        const memoryIds = memoriesResult.rows.map(memory => memory.id);
        const attachmentsResult = memoryIds.length
            ? await pgPool.query(`
                SELECT id, family_id, memory_id, object_key, original_name,
                       mime_type, media_type, size_bytes, created_at
                FROM family_attachments
                WHERE family_id = $1 AND memory_id = ANY($2::bigint[])
                ORDER BY created_at, id
            `, [familyId, memoryIds])
            : { rows: [] };

        const attachments = await Promise.all(attachmentsResult.rows.map(async attachment => {
            if (!supabaseConfigured) {
                throw new Error("Family media storage is not configured.");
            }
            const { data, error } = await supabaseStorage.createSignedUrl(
                attachment.object_key,
                60,
                { download: false }
            );
            if (error || !data?.signedUrl) {
                throw error || new Error("Could not create a signed family media URL.");
            }
            const { object_key, ...metadata } = attachment;
            return { ...metadata, signed_url: data.signedUrl };
        }));

        const attachmentsByMemory = new Map();
        attachments.forEach(attachment => {
            const items = attachmentsByMemory.get(String(attachment.memory_id)) || [];
            items.push(attachment);
            attachmentsByMemory.set(String(attachment.memory_id), items);
        });

        res.json({
            family,
            members: membersResult.rows,
            memories: memoriesResult.rows.map(memory => ({
                ...memory,
                media: attachmentsByMemory.get(String(memory.id)) || []
            }))
        });
    } catch (error) {
        console.error("Admin family inspection error:", error);
        res.status(500).json({ error: "Could not load this family or create its private media links." });
    }
});

app.get("/api/admin/family-attachments/:id/access", requireAdmin, requireMediaStorage, async (req, res) => {
    try {
        const attachmentId = Number(req.params.id);
        if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
            return res.status(400).json({ error: "Invalid attachment ID." });
        }
        const result = await pgPool.query(`
            SELECT a.object_key, a.mime_type, a.original_name, a.media_type, a.size_bytes
            FROM family_attachments a
            JOIN family_memories fm
              ON fm.id = a.memory_id AND fm.family_id = a.family_id
            WHERE a.id = $1
        `, [attachmentId]);
        const attachment = result.rows[0];
        if (!attachment) return res.status(404).json({ error: "Family attachment not found." });
        const { data, error } = await supabaseStorage.createSignedUrl(
            attachment.object_key,
            60,
            { download: false }
        );
        if (error || !data?.signedUrl) throw error || new Error("Could not create signed URL.");
        res.json({
            url: data.signedUrl,
            mimeType: attachment.mime_type,
            name: attachment.original_name,
            type: attachment.media_type,
            size: Number(attachment.size_bytes)
        });
    } catch (error) {
        console.error("Admin family media access error:", error);
        res.status(500).json({ error: "Could not create a private media link." });
    }
});

async function removeFamilyStorageObjects(objectKeys) {
    if (!objectKeys.length) return;
    if (!supabaseConfigured) {
        throw new Error("Family media storage is not configured; no database records were deleted.");
    }
    for (let index = 0; index < objectKeys.length; index += 100) {
        const { error } = await supabaseStorage.remove(objectKeys.slice(index, index + 100));
        if (error) throw new Error(`Could not remove family media from private storage: ${error.message}`);
    }
}

app.delete("/api/admin/families/:familyId/members/:memberId", requireAdmin, async (req, res) => {
    const familyId = Number(req.params.familyId);
    const memberId = Number(req.params.memberId);
    if (!Number.isSafeInteger(familyId) || familyId <= 0 ||
        !Number.isSafeInteger(memberId) || memberId <= 0) {
        return res.status(400).json({ error: "Invalid family or member ID." });
    }

    const client = await pgPool.connect();
    try {
        await client.query("BEGIN");
        const family = await client.query("SELECT id FROM family_accounts WHERE id = $1 FOR UPDATE", [familyId]);
        if (!family.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Family account not found." });
        }
        const member = await client.query(
            "SELECT id FROM family_members WHERE id = $1 AND family_id = $2 FOR UPDATE",
            [memberId, familyId]
        );
        if (!member.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Family member not found." });
        }
        await client.query(
            "DELETE FROM family_username_registry WHERE account_type = 'member' AND account_id = $1 AND family_id = $2",
            [memberId, familyId]
        );
        await client.query("DELETE FROM family_members WHERE id = $1 AND family_id = $2", [memberId, familyId]);
        await client.query("COMMIT");
        res.json({ success: true });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("Admin family member deletion error:", error);
        res.status(500).json({ error: "Could not delete the family member." });
    } finally {
        client.release();
    }
});

app.delete("/api/admin/families/:familyId/memories/:memoryId", requireAdmin, async (req, res) => {
    const familyId = Number(req.params.familyId);
    const memoryId = Number(req.params.memoryId);
    if (!Number.isSafeInteger(familyId) || familyId <= 0 ||
        !Number.isSafeInteger(memoryId) || memoryId <= 0) {
        return res.status(400).json({ error: "Invalid family or memory ID." });
    }

    const client = await pgPool.connect();
    try {
        await client.query("BEGIN");
        const memory = await client.query(
            "SELECT id FROM family_memories WHERE id = $1 AND family_id = $2 FOR UPDATE",
            [memoryId, familyId]
        );
        if (!memory.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Family memory not found." });
        }
        const attachments = await client.query(
            "SELECT object_key FROM family_attachments WHERE family_id = $1 AND memory_id = $2 FOR UPDATE",
            [familyId, memoryId]
        );
        await removeFamilyStorageObjects(attachments.rows.map(row => row.object_key));
        await client.query(
            "DELETE FROM family_attachments WHERE family_id = $1 AND memory_id = $2",
            [familyId, memoryId]
        );
        await client.query("DELETE FROM family_memories WHERE id = $1 AND family_id = $2", [memoryId, familyId]);
        await client.query("COMMIT");
        res.json({ success: true });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("Admin family memory deletion error:", error);
        res.status(500).json({ error: error.message || "Could not delete the family memory." });
    } finally {
        client.release();
    }
});

app.delete("/api/admin/families/:familyId", requireAdmin, async (req, res) => {
    const familyId = Number(req.params.familyId);
    if (!Number.isSafeInteger(familyId) || familyId <= 0) {
        return res.status(400).json({ error: "Invalid family ID." });
    }

    const client = await pgPool.connect();
    try {
        await client.query("BEGIN");
        const family = await client.query(
            "SELECT id FROM family_accounts WHERE id = $1 FOR UPDATE",
            [familyId]
        );
        if (!family.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Family account not found." });
        }
        const attachments = await client.query(
            "SELECT object_key FROM family_attachments WHERE family_id = $1 FOR UPDATE",
            [familyId]
        );
        await removeFamilyStorageObjects(attachments.rows.map(row => row.object_key));
        await client.query("DELETE FROM family_username_registry WHERE family_id = $1", [familyId]);
        await client.query("DELETE FROM family_accounts WHERE id = $1", [familyId]);
        await client.query("COMMIT");
        res.json({ success: true });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("Admin family account deletion error:", error);
        res.status(500).json({ error: error.message || "Could not delete the family account." });
    } finally {
        client.release();
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

        await sendAppEmail({
            to: normalizedEmail,
            subject: "Verify your MemoryVault email",
            html: verificationHtml
        });

        res.status(201).json({
            success: true,
            message: "Account created successfully! We've sent a verification link to your email. Please check your inbox, and also check your Spam or Junk folder if you don't see it."
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

        if (
            user.email_verified === true ||
            user.email_verified === 1 ||
            user.email_verified === "1"
        ) {
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

        await sendAppEmail({
            to: email,
            subject: "Verify your MemoryVault email",
            html: verificationHtml
        });

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
                        const emailResult = await sendAppEmail({
    to: user.email,
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

if (emailResult.messageId) {
    await pgPool.query(`
        UPDATE memories
        SET reveal_email_sent = 1
        WHERE id = $1
          AND user_id = $2
          AND reveal_email_sent = 0
    `, [memory.id, req.session.userId]);
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
// FAMILY ACCOUNTS (separate from personal auth)
// ============================================

async function requireFamilyLogin(req, res, next) {
    if (!req.session.familyAccountId) {
        return res.status(401).json({ error: "Please log in to your family account." });
    }
    try {
        const family = await pgPool.query("SELECT id FROM family_accounts WHERE id = $1 AND email_verified = TRUE", [req.session.familyAccountId]);
        if (!family.rowCount) return res.status(401).json({ error: "Family account is unavailable. Please log in again." });
        if (req.session.familyRole === "member") {
            const member = await pgPool.query("SELECT id FROM family_members WHERE id = $1 AND family_id = $2 AND status = 'active'", [req.session.familyMemberId, req.session.familyAccountId]);
            if (!member.rowCount) {
                delete req.session.familyAccountId;
                delete req.session.familyRole;
                delete req.session.familyMemberId;
                return res.status(403).json({ error: "Your family membership is disabled." });
            }
        }
        next();
    } catch (error) {
        console.error("Family session check error:", error);
        return res.status(500).json({ error: "Could not verify family access." });
    }
}

async function requireFamilyOwner(req, res, next) {
    if (!req.session.familyAccountId || req.session.familyRole !== "owner") {
        return res.status(403).json({ error: "Family owner access required." });
    }
    next();
}

const familyVerificationRequests = new Map();
const FAMILY_VERIFICATION_WINDOW_MS = 15 * 60 * 1000;
const FAMILY_VERIFICATION_MAX_REQUESTS = 3;

function allowFamilyVerificationRequest(keys) {
    const now = Date.now();
    for (const [key, entry] of familyVerificationRequests) {
        if (entry.resetAt <= now) familyVerificationRequests.delete(key);
    }
    let allowed = true;
    for (const key of keys) {
        const entry = familyVerificationRequests.get(key);
        if (entry && entry.count >= FAMILY_VERIFICATION_MAX_REQUESTS) {
            allowed = false;
        }
    }
    for (const key of keys) {
        const entry = familyVerificationRequests.get(key);
        if (!entry || entry.resetAt <= now) {
            familyVerificationRequests.set(key, {
                count: 1,
                resetAt: now + FAMILY_VERIFICATION_WINDOW_MS
            });
        } else {
            entry.count += 1;
        }
    }
    while (familyVerificationRequests.size > 10000) {
        familyVerificationRequests.delete(familyVerificationRequests.keys().next().value);
    }
    return allowed;
}

app.post("/api/family/resend-verification", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const emailKey = crypto.createHash("sha256").update(email).digest("hex");
    const ipKey = String(req.ip || req.socket.remoteAddress || "unknown");
    const allowed = allowFamilyVerificationRequest([`ip:${ipKey}`, `email:${emailKey}`]);
    const response = {
        success: true,
        message: "If an unverified family account exists for that email, a verification link will be sent."
    };

    if (!allowed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(202).json(response);
    }

    try {
        const result = await pgPool.query(`
            SELECT id, family_name, owner_email
            FROM family_accounts
            WHERE owner_email = $1 AND email_verified = FALSE
        `, [email]);
        const family = result.rows[0];
        if (family) {
            const token = crypto.randomBytes(32).toString("hex");
            await pgPool.query(
                "UPDATE family_accounts SET verification_token = $1 WHERE id = $2",
                [token, family.id]
            );
            const link = `${APP_URL}/api/family/verify-email?token=${token}`;
            await sendAppEmail({
                to: family.owner_email,
                subject: "Verify your MemoryVault Family account",
                html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;line-height:1.6"><h2>Verify your MemoryVault Family account</h2><p>Confirm the email for ${escapeHtml(family.family_name)}.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#222;color:#fff;text-decoration:none;border-radius:6px">Verify family email</a></p><p>If you did not request this, you can ignore this email.</p></div>`
            });
        }
    } catch (error) {
        console.error("Family verification resend error:", error);
    }

    return res.status(202).json(response);
});

app.post("/api/family/register", async (req, res) => {
    const client = await pgPool.connect();
    try {
        const familyName = String(req.body?.familyName || "").trim();
        const ownerName = String(req.body?.ownerName || "").trim();
        const username = String(req.body?.username || "").trim();
        const email = String(req.body?.email || "").trim().toLowerCase();
        const password = String(req.body?.password || "");
        if (!familyName || !ownerName || !username || !email || !password) {
            return res.status(400).json({ error: "Complete all fields to create your family account." });
        }
        if (familyName.length > 100 || ownerName.length > 80 || username.length < 3 || username.length > 30 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
            return res.status(400).json({ error: "Check the family name, owner name and username. Usernames must be 3–30 characters and use letters, numbers, dots, underscores or hyphens." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
            return res.status(400).json({ error: "Enter a valid email and a password with at least 8 characters." });
        }
        const usernameCollision = await pgPool.query(`SELECT 1 FROM family_accounts WHERE LOWER(owner_username) = LOWER($1) UNION ALL SELECT 1 FROM family_members WHERE LOWER(username) = LOWER($1) LIMIT 1`, [username]);
        if (usernameCollision.rowCount) return res.status(409).json({ error: "That username is already in use. Choose another." });
        const hash = await bcrypt.hash(password, 12);
        const token = crypto.randomBytes(32).toString("hex");
        await client.query("BEGIN");
        const created = await client.query(`
            INSERT INTO family_accounts
                (family_name, owner_name, owner_username, owner_email, owner_password_hash, verification_token)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [familyName, ownerName, username, email, hash, token]);
        await client.query("COMMIT");
        const link = `${APP_URL}/api/family/verify-email?token=${token}`;
        await sendAppEmail({
            to: email,
            subject: "Verify your MemoryVault Family account",
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;line-height:1.6"><h2>Welcome to MemoryVault Family</h2><p>Verify the family owner's email to activate your family account.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#222;color:#fff;text-decoration:none;border-radius:6px">Verify family email</a></p><p>If you don't see this email, check Spam or Junk.</p></div>`
        });
        return res.status(201).json({ success: true, message: "Family account created. Check your email (including Spam or Junk) to verify it before logging in." });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("Family registration error:", error);
        if (error.code === "23505") return res.status(409).json({ error: "That family owner email or username is already registered." });
        return res.status(500).json({ error: "Could not create the family account." });
    } finally { client.release(); }
});

app.get("/api/family/verify-email", async (req, res) => {
    try {
        const token = String(req.query.token || "").trim();
        if (!token) return res.status(400).send("Invalid family verification link.");
        const result = await pgPool.query(`UPDATE family_accounts SET email_verified = TRUE, verification_token = NULL WHERE verification_token = $1 RETURNING id`, [token]);
        if (!result.rowCount) return res.status(400).send("This family verification link is invalid or already used.");
        return res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Family verified</title></head><body style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px"><h1>Family email verified!</h1><p>Your MemoryVault Family account is ready. You can now log in.</p><a href="${APP_URL}/family.html">Open FamilyVault</a></body></html>`);
    } catch (error) {
        console.error("Family verification error:", error);
        return res.status(500).send("Could not verify the family account.");
    }
});

app.post("/api/family/login", async (req, res) => {
    try {
        const username = String(req.body?.username || "").trim();
        const password = String(req.body?.password || "");
        if (!username || !password) return res.status(400).json({ error: "Username and password are required." });
        const ownerResult = await pgPool.query(`SELECT id, family_name, owner_name AS name, owner_username AS username, owner_password_hash AS password_hash, email_verified, 'owner' AS member_role FROM family_accounts WHERE LOWER(owner_username) = LOWER($1)`, [username]);
        let account = ownerResult.rows[0];
        if (account) {
            if (!account.email_verified) return res.status(403).json({ error: "Please verify the family owner's email before logging in." });
            if (!await bcrypt.compare(password, account.password_hash)) return res.status(401).json({ error: "Invalid username or password." });
            req.session.familyAccountId = account.id;
            req.session.familyRole = "owner";
            req.session.familyMemberId = null;
            return res.json({ success: true, family: { id: account.id, name: account.family_name }, user: { name: account.name, username: account.username, role: "owner" } });
        }
        const memberResult = await pgPool.query(`SELECT fm.id, fm.family_id, fm.name, fm.username, fm.password_hash, fm.status, fa.family_name FROM family_members fm JOIN family_accounts fa ON fa.id = fm.family_id WHERE LOWER(fm.username) = LOWER($1)`, [username]);
        account = memberResult.rows[0];
        if (!account || account.status !== "active" || !await bcrypt.compare(password, account.password_hash)) {
            return res.status(401).json({ error: "Invalid username or password." });
        }
        const verified = await pgPool.query("SELECT email_verified FROM family_accounts WHERE id = $1", [account.family_id]);
        if (!verified.rows[0]?.email_verified) return res.status(403).json({ error: "This family account is not verified yet." });
        req.session.familyAccountId = account.family_id;
        req.session.familyRole = "member";
        req.session.familyMemberId = account.id;
        return res.json({ success: true, family: { id: account.family_id, name: account.family_name }, user: { name: account.name, username: account.username, role: "member" } });
    } catch (error) {
        console.error("Family login error:", error);
        return res.status(500).json({ error: "Could not log in to the family account." });
    }
});

app.get("/api/family/me", requireFamilyLogin, async (req, res) => {
    try {
        const family = await pgPool.query("SELECT id, family_name, owner_name, owner_username FROM family_accounts WHERE id = $1 AND email_verified = TRUE", [req.session.familyAccountId]);
        if (!family.rowCount) return res.status(404).json({ error: "Family account not found." });
        let user;
        if (req.session.familyRole === "owner") {
            user = { name: family.rows[0].owner_name, username: family.rows[0].owner_username, role: "owner" };
        } else {
            const member = await pgPool.query("SELECT name, username FROM family_members WHERE id = $1 AND family_id = $2 AND status = 'active'", [req.session.familyMemberId, req.session.familyAccountId]);
            if (!member.rowCount) return res.status(403).json({ error: "Family membership is inactive." });
            user = { ...member.rows[0], role: "member" };
        }
        const members = await pgPool.query("SELECT id, name, username, status, created_at FROM family_members WHERE family_id = $1 ORDER BY id", [req.session.familyAccountId]);
        res.json({ family: family.rows[0], user, members: members.rows });
    } catch (error) {
        console.error("Family profile error:", error);
        res.status(500).json({ error: "Could not load family account." });
    }
});

app.post("/api/family/members", requireFamilyLogin, requireFamilyOwner, async (req, res) => {
    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    if (members.length !== 2) return res.status(400).json({ error: "Create exactly two family member accounts." });
    const cleaned = members.map(m => ({ name: String(m?.name || "").trim(), username: String(m?.username || "").trim(), password: String(m?.password || "") }));
    if (cleaned.some(m => !m.name || m.name.length > 80 || m.username.length < 3 || m.username.length > 30 || !/^[a-zA-Z0-9_.-]+$/.test(m.username) || m.password.length < 8)) {
        return res.status(400).json({ error: "Each member needs a name, a valid 3–30 character username and a password of at least 8 characters." });
    }
    if (cleaned[0].username.toLowerCase() === cleaned[1].username.toLowerCase()) return res.status(400).json({ error: "The two member usernames must be different." });
    if (cleaned.some(m => m.username.toLowerCase() === String(req.body.ownerUsername || "").toLowerCase())) return res.status(400).json({ error: "Member usernames must be different from the owner username." });
    const client = await pgPool.connect();
    try {
        await client.query("BEGIN");
        const familyLock = await client.query("SELECT owner_username FROM family_accounts WHERE id = $1 FOR UPDATE", [req.session.familyAccountId]);
        if (!familyLock.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Family account not found." }); }
        if (cleaned.some(m => m.username.toLowerCase() === familyLock.rows[0].owner_username.toLowerCase())) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Member usernames must be different from the owner username." }); }
        const collision = await client.query(`SELECT 1 FROM family_accounts WHERE LOWER(owner_username) = ANY($1::text[]) UNION ALL SELECT 1 FROM family_members WHERE LOWER(username) = ANY($1::text[]) LIMIT 1`, [cleaned.map(m => m.username.toLowerCase())]);
        if (collision.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "A username is already in use. Choose different usernames." }); }
        const count = await client.query("SELECT COUNT(*)::int AS count FROM family_members WHERE family_id = $1", [req.session.familyAccountId]);
        if (count.rows[0].count !== 0) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Family member accounts have already been created. Contact support to change them." }); }
        for (const member of cleaned) {
            const hash = await bcrypt.hash(member.password, 12);
            await client.query("INSERT INTO family_members (family_id, name, username, password_hash) VALUES ($1, $2, $3, $4)", [req.session.familyAccountId, member.name, member.username, hash]);
        }
        await client.query("COMMIT");
        res.status(201).json({ success: true, message: "Both family member accounts have been created." });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("Family member creation error:", error);
        if (error.code === "23505") return res.status(409).json({ error: "A username is already in use. Choose different usernames." });
        res.status(500).json({ error: "Could not create family member accounts." });
    } finally { client.release(); }
});

app.patch("/api/family/members/:id/status", requireFamilyLogin, requireFamilyOwner, async (req, res) => {
    const id = Number(req.params.id);
    const status = req.body?.status;
    if (!Number.isSafeInteger(id) || id <= 0 || !["active", "disabled"].includes(status)) return res.status(400).json({ error: "Invalid member or status." });
    try {
        const result = await pgPool.query("UPDATE family_members SET status = $1 WHERE id = $2 AND family_id = $3 RETURNING id", [status, id, req.session.familyAccountId]);
        if (!result.rowCount) return res.status(404).json({ error: "Family member not found." });
        res.json({ success: true });
    } catch (error) { console.error("Family member update error:", error); res.status(500).json({ error: "Could not update member." }); }
});

app.post("/api/family/memories", requireFamilyLogin, async (req, res) => {
    try {
        const title = String(req.body?.title || "").trim();
        const message = String(req.body?.message || "").trim();
        const revealAt = new Date(req.body?.revealAt);
        const category = String(req.body?.category || "Family").trim() || "Family";
        if (!title || !message || Number.isNaN(revealAt.getTime()) || revealAt <= new Date()) return res.status(400).json({ error: "Enter a title, message and a future reveal date." });
        const result = await pgPool.query("INSERT INTO family_memories (family_id, created_by_member_id, title, message, reveal_at, category) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", [req.session.familyAccountId, req.session.familyMemberId, title, message, revealAt.toISOString(), category]);
        res.status(201).json({ success: true, memoryId: result.rows[0].id });
    } catch (error) { console.error("Family memory creation error:", error); res.status(500).json({ error: "Could not create family memory." }); }
});

app.get("/api/family/memories", requireFamilyLogin, async (req, res) => {
    try {
        const result = await pgPool.query(`SELECT fm.id, fm.title, fm.message, fm.reveal_at, fm.created_at, fm.category, COALESCE((SELECT json_agg(json_build_object('id', a.id, 'original_name', a.original_name, 'mime_type', a.mime_type, 'media_type', a.media_type, 'size_bytes', a.size_bytes) ORDER BY a.created_at) FROM family_attachments a WHERE a.memory_id = fm.id AND a.family_id = fm.family_id), '[]'::json) AS media FROM family_memories fm WHERE fm.family_id = $1 ORDER BY fm.reveal_at ASC`, [req.session.familyAccountId]);
        const now = new Date();
        res.json({ memories: result.rows.map(m => ({ ...m, revealed: new Date(m.reveal_at) <= now, message: new Date(m.reveal_at) <= now ? m.message : null })) });
    } catch (error) { console.error("Family memory retrieval error:", error); res.status(500).json({ error: "Could not load family memories." }); }
});


app.post("/api/family/memories/:id/media", requireFamilyLogin, requireMediaStorage,
    (req, res, next) => mediaUpload.array("media", MEDIA_MAX_FILES_PER_MEMORY)(req, res, error => {
        if (error) return res.status(400).json({ error: error.message || "Invalid media upload." });
        next();
    }), async (req, res) => {
        const memoryId = Number(req.params.id);
        if (!Number.isSafeInteger(memoryId) || memoryId <= 0) return res.status(400).json({ error: "Invalid memory ID." });
        const files = req.files || [];
        if (!files.length) return res.status(400).json({ error: "Choose at least one file." });
        const memory = await pgPool.query("SELECT id FROM family_memories WHERE id = $1 AND family_id = $2", [memoryId, req.session.familyAccountId]);
        if (!memory.rowCount) return res.status(404).json({ error: "Family memory not found." });
        const client = await pgPool.connect();
        const uploaded = [];
        try {
            await client.query("BEGIN");
            for (const file of files) {
                const kind = mediaKind(file.mimetype);
                if (!kind) throw new Error("Unsupported media type.");
                const key = `families/${req.session.familyAccountId}/memories/${memoryId}/${crypto.randomUUID()}-${safeMediaName(file.originalname)}`;
                const { error: storageError } = await supabaseStorage.upload(key, file.buffer, { contentType: file.mimetype, upsert: false, cacheControl: "60" });
                if (storageError) throw storageError;
                uploaded.push(key);
                await client.query(`INSERT INTO family_attachments (family_id, memory_id, uploaded_by_member_id, object_key, original_name, mime_type, media_type, size_bytes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [req.session.familyAccountId, memoryId, req.session.familyMemberId, key, safeMediaName(file.originalname), file.mimetype, kind, file.size]);
            }
            await client.query("COMMIT");
            res.status(201).json({ success: true, uploaded: files.length });
        } catch (error) {
            await client.query("ROLLBACK").catch(() => {});
            if (uploaded.length) await supabaseStorage.remove(uploaded).catch(() => {});
            console.error("Family media upload error:", error);
            res.status(500).json({ error: "Could not save family media." });
        } finally { client.release(); }
    }
);

app.get("/api/family/media/:id/access", requireFamilyLogin, requireMediaStorage, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid media ID." });
        const result = await pgPool.query(`SELECT a.object_key, a.mime_type, a.original_name FROM family_attachments a JOIN family_memories m ON m.id = a.memory_id AND m.family_id = a.family_id WHERE a.id = $1 AND a.family_id = $2 AND m.reveal_at <= NOW()`, [id, req.session.familyAccountId]);
        const attachment = result.rows[0];
        if (!attachment) return res.status(404).json({ error: "Media not found or memory is still locked." });
        const { data, error } = await supabaseStorage.createSignedUrl(attachment.object_key, 60, { download: false });
        if (error || !data?.signedUrl) throw error || new Error("Could not create signed URL.");
        res.json({ url: data.signedUrl, mimeType: attachment.mime_type, name: attachment.original_name });
    } catch (error) { console.error("Family media access error:", error); res.status(500).json({ error: "Could not open family media." }); }
});

app.post("/api/family/logout", (req, res) => {
    delete req.session.familyAccountId;
    delete req.session.familyRole;
    delete req.session.familyMemberId;
    res.json({ success: true });
});


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

        const result = await sendAppEmail({
            to: recipient,
            subject: "MemoryVault email test",
            html: "<h2>MemoryVault email test</h2><p>Your Resend connection is working!</p>"
        });

        res.json({
            success: true,
            message: "Email accepted by Resend.",
            id: result.messageId
        });

    } catch (error) {
        console.error("Resend test failed:", error);

        res.status(500).json({
            error: error.message || "Could not send test email."
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