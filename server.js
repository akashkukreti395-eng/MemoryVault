const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3001;

// ============================================
// DATABASE
// ============================================

const db = new Database("memoryvault.db");

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
            sameSite: "lax"
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

        const {
            name,
            email,
            password
        } = req.body;


        if (!name || !email || !password) {

            return res.status(400).json({
                error: "All fields are required."
            });

        }


        if (password.length < 6) {

            return res.status(400).json({
                error:
                    "Password must be at least 6 characters."
            });

        }


        const normalizedEmail =
            String(email)
                .trim()
                .toLowerCase();


        const existingUser =
            db.prepare(`
                SELECT id
                FROM users
                WHERE email = ?
            `).get(normalizedEmail);


        if (existingUser) {

            return res.status(409).json({
                error:
                    "An account with this email already exists."
            });

        }


        const passwordHash =
            await bcrypt.hash(password, 12);


        const result =
            db.prepare(`
                INSERT INTO users
                (
                    name,
                    email,
                    password_hash
                )
                VALUES (?, ?, ?)
            `).run(
                String(name).trim(),
                normalizedEmail,
                passwordHash
            );


        req.session.userId =
            result.lastInsertRowid;


        res.status(201).json({
            success: true,
            message:
                "Account created successfully."
        });

    } catch (error) {

        console.error(
            "Registration error:",
            error
        );

        res.status(500).json({
            error:
                "Could not create account."
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
    (req, res) => {

        try {

        
const {
    title,
    message,
    revealAt,
    category = "Personal"
} = req.body;



            if (
                !title ||
                !message ||
                !revealAt
            ) {

                return res.status(400).json({
                    error:
                        "Title, message and reveal date are required."
                });

            }


            const revealDate =
                new Date(revealAt);


            if (
                Number.isNaN(
                    revealDate.getTime()
                )
            ) {

                return res.status(400).json({
                    error:
                        "Invalid reveal date."
                });

            }


            if (
                revealDate <= new Date()
            ) {

                return res.status(400).json({
                    error:
                        "Reveal date must be in the future."
                });

            }


            const result =
                db.prepare(`
                    
INSERT INTO memories
(
    user_id,
    title,
    message,
    reveal_at,
    category
)
VALUES (?, ?, ?, ?, ?)

                `).run(
                  
req.session.userId,
String(title).trim(),
String(message).trim(),
revealDate.toISOString(),
String(category).trim() || "Personal"

                );


            res.status(201).json({
                success: true,
                memoryId:
                    result.lastInsertRowid
            });

        } catch (error) {

            console.error(
                "Memory creation error:",
                error
            );

            res.status(500).json({
                error:
                    "Could not create memory."
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
    (req, res) => {

        const memories =
            db.prepare(`
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
            `).all(
                req.session.userId
            );


        const now = new Date();


        const result =
            memories.map(memory => {

                const isRevealed =
                    new Date(
                        memory.reveal_at
                    ) <= now;

                return {
                    ...memory,

                    revealed:
                        Boolean(
                            memory.revealed ||
                            isRevealed
                        ),

                    message:
                        isRevealed
                            ? memory.message
                            : null
                };

            });


        res.json({
            memories: result
        });

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

app.use((req, res) => {
    res.sendFile(
        path.join(__dirname, "index.html")
    );
});


// ============================================
// START SERVER
// ============================================

app.listen(
    PORT,
    () => {

        console.log(
            `MemoryVault running at http://localhost:${PORT}`
        );

    }
);