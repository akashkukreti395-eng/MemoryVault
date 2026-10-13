const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const dotenv = require("dotenv");
const crypto = require("node:crypto");

const { Resend } = require("resend");
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_FROM =
    process.env.EMAIL_FROM || "MemoryVault <onboarding@resend.dev>";

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

const db = new Database(
    path.join(__dirname, "memoryvault.db")
);
console.log(
    `[database setup] directory=${__dirname} databasePath=${path.join(__dirname, "memoryvault.db")} adminEmailConfigured=${Boolean(process.env.ADMIN_EMAIL)}`
);

db.pragma("foreign_keys = ON");





// ============================================
// DATABASE TABLES
// ============================================

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        reveal_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revealed INTEGER NOT NULL DEFAULT 0,

        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    );
`);

/* Add email verification support to existing users */
const verificationColumns = db
    .prepare("PRAGMA table_info(users)")
    .all();

if (!verificationColumns.some((column) => column.name === "email_verified")) {
    db.exec(`
        ALTER TABLE users
        ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0
    `);
}

if (!verificationColumns.some((column) => column.name === "verification_token")) {
    db.exec(`
        ALTER TABLE users
        ADD COLUMN verification_token TEXT
    `);
}

/* Track memory reveal email notifications */
const revealTrackingColumns = db
    .prepare("PRAGMA table_info(memories)")
    .all();

if (!revealTrackingColumns.some((column) => column.name === "reveal_email_sent")) {
    db.exec(`
        ALTER TABLE memories
        ADD COLUMN reveal_email_sent INTEGER NOT NULL DEFAULT 0
    `);
}


/* Add admin role support to existing users */
const userColumns = db
    .prepare("PRAGMA table_info(users)")
    .all();

if (!userColumns.some((column) => column.name === "role")) {
    db.exec(`
        ALTER TABLE users
        ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
    `);
}
const adminEmail = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

if (adminEmail) {
    const result = db.prepare(
        "UPDATE users SET role = 'admin' WHERE lower(email) = ?"
    ).run(adminEmail);

    const adminUser = db.prepare(
        "SELECT role FROM users WHERE lower(email) = ?"
    ).get(adminEmail);

    console.log("[admin setup]", {
        accountFound: Boolean(adminUser),
        role: adminUser?.role ?? "not found",
        rowsUpdated: result.changes
    });
} else {
    console.log("[admin setup] ADMIN_EMAIL is not configured");
}
// Add the category column to existing databases safely.
const memoryColumns = db
  .prepare("PRAGMA table_info(memories)")
  .all();

if (!memoryColumns.some((column) => column.name === "category")) {
  db.exec(`
    ALTER TABLE memories
    ADD COLUMN category TEXT NOT NULL DEFAULT 'Personal'
  `);
}



// ============================================
// MIDDLEWARE
// ============================================

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "memoryvault-development-secret",

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

function requireAdmin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            error: "Please log in first."
        });
    }

    const user = db.prepare(
        "SELECT role FROM users WHERE id = ?"
    ).get(req.session.userId);

    if (!user || user.role !== "admin") {
        return res.status(403).json({
            error: "Admin access required."
        });
    }

    next();
}

app.get("/api/admin/users", requireAdmin, (req, res) => {
    try {
        const users = db.prepare(`
            SELECT id, name, email, role, created_at
            FROM users
            ORDER BY created_at DESC
        `).all();

        res.json({ users });
    } catch (error) {
        console.error("Admin users error:", error);
        res.status(500).json({
            error: "Could not load user accounts."
        });
    }
});

app.get(
    "/api/admin/users/:id/memories",
    requireAdmin,
    (req, res) => {
        try {
            const userId = Number(req.params.id);

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    error: "Invalid user ID."
                });
            }

            const user = db.prepare(`
                SELECT id, name, email
                FROM users
                WHERE id = ?
            `).get(userId);

            if (!user) {
                return res.status(404).json({
                    error: "User not found."
                });
            }

            const memories = db.prepare(`
                SELECT id, title, message, category,
                       reveal_at, created_at, revealed
                FROM memories
                WHERE user_id = ?
                ORDER BY created_at DESC
            `).all(userId);

            res.json({
                user,
                memories
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
    (req, res) => {
        try {
            const userId = Number(req.params.id);

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    error: "Invalid user ID."
                });
            }

            if (userId === req.session.userId) {
                return res.status(400).json({
                    error: "You cannot delete your own admin account."
                });
            }

            const result = db.prepare(
                "DELETE FROM users WHERE id = ?"
            ).run(userId);

            if (result.changes === 0) {
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

        if (!normalizedName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({
                error: "Enter a valid name and email address."
            });
        }

        const existingUser = db.prepare(`
            SELECT id, email_verified
            FROM users
            WHERE email = ?
        `).get(normalizedEmail);

        if (existingUser) {
            return res.status(409).json({
                error: "An account with this email already exists. Please log in or contact support."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const verificationToken = crypto.randomBytes(32).toString("hex");

        db.prepare(`
            INSERT INTO users (
                name,
                email,
                password_hash,
                email_verified,
                verification_token
            )
            VALUES (?, ?, ?, 0, ?)
        `).run(
            normalizedName,
            normalizedEmail,
            passwordHash,
            verificationToken
        );

        const verificationLink =
            `${APP_URL}/api/verify-email?token=${verificationToken}`;


const emailResult = await resend.emails.send({
    from: EMAIL_FROM,
    to: [normalizedEmail],
    subject: "Verify your MemoryVault email",
    html: `
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
    `
});


        if (emailResult.error || !emailResult.data?.id) {
            console.error("Verification email was not confirmed.");

            db.prepare(`
                DELETE FROM users
                WHERE email = ? AND email_verified = 0
            `).run(normalizedEmail);

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
app.get("/api/verify-email", (req, res) => {
    try {
        const token = String(req.query.token || "").trim();

        if (!token) {
            return res.status(400).send("Verification link is invalid.");
        }

        const user = db.prepare(`
            SELECT id
            FROM users
            WHERE verification_token = ?
        `).get(token);

        if (!user) {
            return res.status(400).send(
                "This verification link is invalid or has already been used."
            );
        }

        db.prepare(`
            UPDATE users
            SET email_verified = 1,
                verification_token = NULL
            WHERE id = ?
        `).run(user.id);

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

        const user = db.prepare(`
            SELECT id, email_verified
            FROM users
            WHERE email = ?
        `).get(email);

        if (!user) {
            return res.status(404).json({
                error: "Account not found."
            });
        }

        if (user.email_verified) {
            return res.json({
                success: true,
                message: "Your email is already verified."
            });
        }

        const token = crypto.randomBytes(32).toString("hex");

        db.prepare(`
            UPDATE users
            SET verification_token = ?
            WHERE id = ?
        `).run(token, user.id);

        const verificationLink =
            `${APP_URL}/api/verify-email?token=${token}`;


const result = await resend.emails.send({
    from: EMAIL_FROM,
    to: [email],
    subject: "Verify your MemoryVault email",
    html: `
        <h2>Verify your MemoryVault account</h2>
        <p>Click the link below to verify your email:</p>
        <p><a href="${verificationLink}">Verify my email</a></p>
    `
});


       if (result.error || !result.data?.id) {
    console.error("Resend did not confirm the verification email.");
    return res.status(502).json({
        error: "Could not confirm that the email was sent."
    });
}
        res.json({
            success: true,
            message: "Verification email sent successfully."
        });
    } catch (error) {
        console.error("Gmail verification failed:", error);
       res.status(500).json({
    error: "Could not resend verification email. Please try again later."
});
    }
});




// ============================================
// LOGIN
// ============================================

app.post("/api/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        if (!email || !password) {

            return res.status(400).json({
                error:
                    "Email and password are required."
            });

        }


        const normalizedEmail =
            String(email)
                .trim()
                .toLowerCase();


        const user =
            db.prepare(`
                SELECT *
                FROM users
                WHERE email = ?
            `).get(normalizedEmail);


        if (!user) {

            return res.status(401).json({
                error:
                    "Invalid email or password."
            });

        }


        const validPassword =
            await bcrypt.compare(
                password,
                user.password_hash
            );


        if (!validPassword) {

            return res.status(401).json({
                error:
                    "Invalid email or password."
            });

        }

if (!user.email_verified) {
    return res.status(403).json({
        error: "Please verify your email before logging in. Check your inbox."
    });
}

console.log("[admin login check]", {
    accountEmailMatches: user.email.toLowerCase() ===
        String(process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
    role: user.role || "user"
});
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

        console.error(
            "Login error:",
            error
        );

        res.status(500).json({
            error:
                "Could not log in."
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

app.get(
    "/api/me",
    requireLogin,
    (req, res) => {

        const user =
            db.prepare(`

SELECT
    id,
    name,
    email,
    created_at,
    role
FROM users
WHERE id = ?

            `).get(req.session.userId);


        if (!user) {

            return res.status(404).json({
                error:
                    "User not found."
            });

        }


        res.json({
            user
        });

    }
);


// ============================================
// CREATE MEMORY
// ============================================


app.post(
    "/api/memories",
    requireLogin,
    async (req, res) => {
        try {
            const {
                title,
                message,
                revealAt,
                category = "Personal"
            } = req.body;

            if (!title || !message || !revealAt) {
                return res.status(400).json({
                    error: "Title, message and reveal date are required."
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
            const cleanMessage = String(message).trim();
            const cleanCategory = String(category).trim() || "Personal";

            if (!cleanTitle || !cleanMessage) {
                return res.status(400).json({
                    error: "Title and message cannot be empty."
                });
            }

            const result = db.prepare(`
                INSERT INTO memories (
                    user_id,
                    title,
                    message,
                    reveal_at,
                    category
                )
                VALUES (?, ?, ?, ?, ?)
            `).run(
                req.session.userId,
                cleanTitle,
                cleanMessage,
                revealDate.toISOString(),
                cleanCategory
            );

            const user = db.prepare(`
                SELECT name, email
                FROM users
                WHERE id = ?
            `).get(req.session.userId);

            if (user) {
                try {


const emailResult = await resend.emails.send({
    from: EMAIL_FROM,
    to: [normalizedEmail],
    subject: "Verify your MemoryVault email",
    html: `
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
    `
});





if (emailResult.error || !emailResult.data?.id) {
    console.error("Memory confirmation email was not confirmed.");
}
} catch (emailError) {
    console.error("Memory confirmation email error:", emailError);
}
}

res.status(201).json({
    success: true,
    memoryId: result.lastInsertRowid,
    message: "Memory created successfully."
});

} catch (error) {
    console.error("Memory creation error:", error);

    res.status(500).json({
        error: "Could not create memory."
    });
}
}
);



// ============================================
// GET USER MEMORIES
// ============================================


app.get(
    "/api/memories",
    requireLogin,
    async (req, res) => {
        try {
            const now = new Date();

const dueMemories = db.prepare(`
    SELECT
        id,
        title,
        reveal_at,
        reveal_email_sent
    FROM memories
    WHERE user_id = ?
      AND reveal_at <= ?
      AND reveal_email_sent = 0
`).all(
    req.session.userId,
    now.toISOString()
);

const user = db.prepare(`
    SELECT name, email
    FROM users
    WHERE id = ?
`).get(req.session.userId);

for (const memory of dueMemories) {
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
            db.prepare(`
                UPDATE memories
                SET reveal_email_sent = 1
                WHERE id = ?
                  AND user_id = ?
                  AND reveal_email_sent = 0
            `).run(memory.id, req.session.userId);
        } else {
            console.error("Reveal notification was not confirmed.");
        }
    } catch (emailError) {
        console.error("Reveal notification error:", emailError);
    }
}

            const memories = db.prepare(`
                SELECT
                    id,
                    title,
                    message,
                    reveal_at,
                    created_at,
                    revealed,
                    category
                FROM memories
                WHERE user_id = ?
                ORDER BY reveal_at ASC
            `).all(req.session.userId);

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
    (req, res) => {

        const result =
            db.prepare(`
                DELETE FROM memories
                WHERE id = ?
                AND user_id = ?
            `).run(
                Number(req.params.id),
                req.session.userId
            );


        if (result.changes === 0) {

            return res.status(404).json({
                error:
                    "Memory not found."
            });

        }


        res.json({
            success: true
        });

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