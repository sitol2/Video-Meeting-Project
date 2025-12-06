const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { spawn } = require('child_process');

// Track notified interviews to prevent duplicate notifications
const notifiedInterviews = new Set();
// Clear old notifications every hour to allow re-notification
setInterval(() => {
    notifiedInterviews.clear();
    console.log('Cleared notified interviews cache');
}, 3600000);

// Configure ffmpeg to use local installation
const ffmpegPath = path.join(__dirname, 'ffmpeg-2025-11-27-git-61b034a47c-essentials_build', 'bin', 'ffmpeg.exe');
const ffprobePath = path.join(__dirname, 'ffmpeg-2025-11-27-git-61b034a47c-essentials_build', 'bin', 'ffprobe.exe');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

console.log('✅ FFmpeg configured at:', ffmpegPath);

const app = express();
const PORT = 3000;

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `temp-${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage: storage });

// Database Setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Database opening error: ', err);
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT UNIQUE,
        name TEXT,
        course TEXT,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'student'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT,
        name TEXT,
        uploaded_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        path_wav TEXT,
        path_mp3 TEXT,
        path_transcript TEXT,
        classification_data TEXT,
        is_archived INTEGER DEFAULT 0,
        archived_at DATETIME,
        FOREIGN KEY(uploaded_by) REFERENCES users(id)
    )`);

    // Check if classification_data column exists in recordings table
    db.all("PRAGMA table_info(recordings)", (err, columns) => {
        if (err) {
            console.error('Error checking recordings table:', err);
            return;
        }
        const hasClassificationData = columns.some(col => col.name === 'classification_data');
        if (!hasClassificationData) {
            console.log('Adding classification_data column to recordings table...');
            db.run("ALTER TABLE recordings ADD COLUMN classification_data TEXT", (err) => {
                if (err) console.error('Error adding classification_data column:', err);
                else console.log('✅ classification_data column added successfully');
            });
        }
    });


    // Check if meetings table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='meetings'", (err, row) => {
        if (!row) {
            createMeetingsTable();
        } else {
            // Check if is_active column exists
            db.all("PRAGMA table_info(meetings)", (err, columns) => {
                const hasIsActive = columns.some(col => col.name === 'is_active');
                if (!hasIsActive) {
                    console.log('Adding is_active column to meetings table...');
                    db.run("ALTER TABLE meetings ADD COLUMN is_active INTEGER DEFAULT 1");
                }
            });
        }
    });

    function createMeetingsTable() {
        db.run(`CREATE TABLE IF NOT EXISTS meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            host_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            is_active INTEGER DEFAULT 1,
            FOREIGN KEY(host_id) REFERENCES users(id)
        )`, (err) => {
            if (err) console.error('Error creating meetings table:', err.message);
            else console.log('Meetings table ready');
        });
    }

    // Create activity_log table
    db.run(`CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        action_type TEXT,
        description TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        target_user_id INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(target_user_id) REFERENCES users(id)
    )`, (err) => {
        if (err) console.error('Error creating activity_log table:', err.message);
        else console.log('Activity log table ready');
    });

    // Create interview_schedules table
    db.run(`CREATE TABLE IF NOT EXISTS interview_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instructor_name TEXT NOT NULL,
        student_id INTEGER NOT NULL,
        interview_date DATETIME NOT NULL,
        interview_type TEXT NOT NULL CHECK(interview_type IN ('Entrance', 'Exit')),
        created_by INTEGER NOT NULL, -- admin ID who created the schedule
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(student_id) REFERENCES users(id),
        FOREIGN KEY(created_by) REFERENCES users(id)
    )`, (err) => {
        if (err) console.error('Error creating interview_schedules table:', err.message);
        else console.log('Interview schedules table ready');
    });

    // Function to log activities
    global.logActivity = (userId, userName, actionType, description, targetUserId = null) => {
        db.run(`INSERT INTO activity_log (user_id, user_name, action_type, description, target_user_id) VALUES (?, ?, ?, ?, ?)`,
            [userId, userName, actionType, description, targetUserId],
            (err) => {
                if (err) {
                    console.error('Error logging activity:', err.message);
                } else {
                    console.log(`Activity logged: ${actionType} - ${description}`);
                }
            }
        );
    };
});

// Auto-deletion Task
function runAutoDeletion() {
    console.log('Running auto-deletion task...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    db.all('SELECT * FROM recordings WHERE is_archived = 1 AND archived_at < ?', [thirtyDaysAgo.toISOString()], (err, rows) => {
        if (err) return console.error('Auto-deletion query failed:', err);

        rows.forEach(rec => {
            // Delete files
            [rec.path_wav, rec.path_mp3, rec.path_transcript].forEach(filePath => {
                if (filePath) {
                    const fullPath = path.join(__dirname, 'public', filePath);
                    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                }
            });

            // Delete from DB
            db.run('DELETE FROM recordings WHERE id = ?', [rec.id], (err) => {
                if (err) console.error(`Failed to delete recording ${rec.id}:`, err);
                else console.log(`Auto-deleted recording ${rec.id}`);
            });
        });
    });
}

runAutoDeletion();
setInterval(runAutoDeletion, 24 * 60 * 60 * 1000); // Run every 24 hours

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    store: new SQLiteStore({ db: 'sessions.db' }),
    secret: 'your-secret-key', // In production, use a secure random string
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // Secure cookies for HTTPS
        httpOnly: true, // Prevent XSS attacks
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// CSRF Protection
const csrfProtection = csrf({ cookie: true });

// Serve static files
app.use(express.static('public'));

// SSL Certificate
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 365 });

const server = https.createServer({
    key: pems.private,
    cert: pems.cert
}, app);

const io = require('socket.io')(server);

// Socket.IO - WebRTC Signaling and Real-time Features
const rooms = new Map(); // roomId -> Set of socket IDs
const userSockets = new Map(); // userId -> socket ID for invitations

io.on('connection', (socket) => {
    console.log('✓ Socket connected:', socket.id);

    // Register user for meeting invitations
    socket.on('register-user', (userId) => {
        userSockets.set(userId, socket.id);
        console.log(`User ${userId} registered for invitations`);
    });

    // Meeting invitation
    socket.on('invite-to-meeting', ({ studentId, adminName, roomCode }) => {
        const studentSocketId = userSockets.get(studentId);
        if (studentSocketId) {
            io.to(studentSocketId).emit('meeting-invitation', {
                adminName,
                roomCode,
                timestamp: new Date().toISOString()
            });
            console.log(`Invitation sent to student ${studentId} for room ${roomCode}`);
        }
    });

    // Join meeting room
    socket.on('join-room', (roomId, userId, userName) => {
        console.log(`User ${userName} (${userId}) joining room ${roomId}`);

        // Initialize room if it doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }

        const room = rooms.get(roomId);

        // Check if room is full (max 2 users)
        if (room.size >= 2) {
            socket.emit('full-room');
            console.log(`Room ${roomId} is full`);
            return;
        }

        // Join the room
        socket.join(roomId);
        room.add(socket.id);
        socket.roomId = roomId;
        socket.userName = userName;

        console.log(`✓ User ${userName} joined room ${roomId}. Room size: ${room.size}`);

        // Notify other users in the room
        socket.to(roomId).emit('user-connected', userId, userName);

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User ${userName} disconnected from room ${roomId}`);
            if (room) {
                room.delete(socket.id);
                if (room.size === 0) {
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted (empty)`);
                } else {
                    socket.to(roomId).emit('user-disconnected');
                }
            }
        });
    });

    // WebRTC Signaling - Offer
    socket.on('offer', (offer) => {
        if (socket.roomId) {
            console.log(`Relaying offer in room ${socket.roomId}`);
            socket.to(socket.roomId).emit('offer', offer);
        }
    });

    // WebRTC Signaling - Answer
    socket.on('answer', (answer) => {
        if (socket.roomId) {
            console.log(`Relaying answer in room ${socket.roomId}`);
            socket.to(socket.roomId).emit('answer', answer);
        }
    });

    // WebRTC Signaling - ICE Candidate
    socket.on('ice-candidate', (candidate) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('ice-candidate', candidate);
        }
    });

    // Exchange user names
    socket.on('send-name', (name) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('update-peer-name', name);
        }
    });

    // Live transcription/subtitles
    socket.on('subtitle', (text) => {
        if (socket.roomId && socket.userName) {
            socket.to(socket.roomId).emit('subtitle', {
                text,
                userName: socket.userName
            });
        }
    });

    // Leave room explicitly
    socket.on('leave-room', () => {
        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.delete(socket.id);
                socket.to(socket.roomId).emit('user-disconnected');
                if (room.size === 0) {
                    rooms.delete(socket.roomId);
                }
            }
            socket.leave(socket.roomId);
            socket.roomId = null;
        }
    });
});

console.log('✓ Socket.IO event handlers initialized');


// Routes

// CSRF Token Endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

app.post('/api/register', csrfProtection, async (req, res) => {
    const { studentId, name, course, email, password } = req.body;

    // Validation
    if (!email || !email.endsWith('@gmail.com')) {
        return res.status(400).json({ error: 'Email must be a valid @gmail.com address' });
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    if (!password || !passwordRegex.test(password)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters, contain one uppercase letter and one special character' });
    }

    if (!studentId || !name || !course) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            `INSERT INTO users (student_id, name, course, email, password, role) VALUES (?, ?, ?, ?, ?, 'student')`,
            [studentId, name, course, email, hashedPassword],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        if (err.message.includes('users.email')) return res.status(400).json({ error: 'Email already exists' });
                        if (err.message.includes('users.student_id')) return res.status(400).json({ error: 'Student ID already exists' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ message: 'Student registered successfully', userId: this.lastID });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Error registering student' });
    }
});

app.post('/api/login', csrfProtection, (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: 'Identifier and password are required' });
    }

    db.get(
        `SELECT * FROM users WHERE email = ? OR student_id = ?`,
        [identifier, identifier],
        async (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(401).json({ error: 'Invalid credentials' });

            const match = await bcrypt.compare(password, row.password);
            if (match) {
                req.session.userId = row.id;
                req.session.email = row.email;
                req.session.name = row.name;
                req.session.role = row.role;
                req.session.studentId = row.student_id;
                req.session.course = row.course;
                res.json({ message: 'Logged in successfully' });
            } else {
                res.status(401).json({ error: 'Invalid credentials' });
            }
        }
    );
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: 'Could not log out' });
        res.json({ message: 'Logged out successfully' });
    });
});

app.get('/api/me', (req, res) => {
    if (req.session.userId) {
        res.json({
            loggedIn: true,
            email: req.session.email,
            name: req.session.name,
            role: req.session.role,
            studentId: req.session.studentId,
            course: req.session.course,
            id: req.session.userId // Added ID for socket registration
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Recording Routes
app.post('/api/recordings/upload', upload.single('audio'), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const tempPath = req.file.path;
    const baseName = `rec-${Date.now()}`;
    const wavPath = path.join(uploadDir, `${baseName}.wav`);
    const mp3Path = path.join(uploadDir, `${baseName}.mp3`);
    const recordingName = req.body.name || 'Untitled Recording';

    ffmpeg(tempPath)
        .toFormat('wav')
        .audioFrequency(16000)
        .audioChannels(1)
        .on('error', (err) => {
            console.error('An error occurred: ' + err.message);
            res.status(500).json({ error: 'Conversion failed' });
        })
        .on('end', () => {
            ffmpeg(tempPath)
                .toFormat('mp3')
                .on('error', (err) => console.error('An error occurred: ' + err.message))
                .on('end', () => {
                    db.run(`INSERT INTO recordings (filename, name, uploaded_by, path_wav, path_mp3) VALUES (?, ?, ?, ?, ?)`,
                        [baseName, recordingName, req.session.userId, `/uploads/${baseName}.wav`, `/uploads/${baseName}.mp3`],
                        function (err) {
                            if (err) {
                                console.error(err);
                                return res.status(500).json({ error: 'Database error' });
                            }
                            // Log the activity
                            logActivity(req.session.userId, req.session.name, 'recording_saved', `Admin saved recording "${recordingName}"`);

                            fs.unlink(tempPath, (err) => {
                                if (err) console.error('Failed to delete temp file:', err);
                            });
                            res.json({ message: 'Recording saved successfully' });
                        }
                    );
                })
                .save(mp3Path);
        })
        .save(wavPath);
});

app.get('/api/recordings', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    const showArchived = req.query.archived === 'true';
    const { startDate, endDate, sort, hasTranscript } = req.query;

    let sql = `SELECT * FROM recordings WHERE is_archived = ?`;
    const params = [showArchived ? 1 : 0];

    // Date Filters
    if (startDate) {
        sql += ` AND created_at >= ?`;
        params.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
        sql += ` AND created_at <= ?`;
        params.push(`${endDate} 23:59:59`);
    }

    // Transcript Filter
    if (hasTranscript === 'true') {
        sql += ` AND path_transcript IS NOT NULL`;
    } else if (hasTranscript === 'false') {
        sql += ` AND path_transcript IS NULL`;
    }

    // Sorting
    switch (sort) {
        case 'created_asc':
            sql += ` ORDER BY created_at ASC`;
            break;
        case 'name_asc':
            sql += ` ORDER BY name ASC`;
            break;
        case 'name_desc':
            sql += ` ORDER BY name DESC`;
            break;
        case 'created_desc':
        default:
            sql += ` ORDER BY created_at DESC`;
            break;
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/recordings/:id/transcribe', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    const recordingId = req.params.id;

    db.get(`SELECT * FROM recordings WHERE id = ?`, [recordingId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Recording not found' });

        const wavPath = path.join(__dirname, 'public', row.path_wav);
        const transcriptFilename = `${row.filename}.txt`;
        const transcriptPath = path.join(uploadDir, transcriptFilename);
        const publicTranscriptPath = `/uploads/${transcriptFilename}`;

        const localFfmpegPath = path.join(__dirname, 'ffmpeg-2025-11-27-git-61b034a47c-essentials_build', 'bin');
        const env = { ...process.env };
        const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'Path';
        env[pathKey] = `${localFfmpegPath}${path.delimiter}${env[pathKey]}`;

        // Log transcription start
        logActivity(req.session.userId, req.session.name, 'transcription_started', `Admin started transcription of recording \"${row.name}\"`);

        // Try to detect Python command (python or python3)
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

        console.log(`Starting transcription for recording ${recordingId}`);
        console.log(`WAV path: ${wavPath}`);
        console.log(`Python command: ${pythonCmd}`);

        const pythonProcess = spawn(pythonCmd, ['transcribe.py', wavPath], { env });

        let transcriptData = '';
        let errorData = '';

        pythonProcess.on('error', (err) => {
            console.error('Failed to start Python process:', err);
            logActivity(req.session.userId, req.session.name, 'transcription_failed', `Failed to start Python: ${err.message}`);
            return res.status(500).json({
                error: 'Failed to start transcription process',
                details: `Could not start Python. Make sure Python and Whisper are installed. Error: ${err.message}`
            });
        });

        pythonProcess.stdout.on('data', (data) => transcriptData += data.toString('utf8'));
        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString('utf8');
            console.error('Python stderr:', data.toString('utf8'));
        });

        pythonProcess.on('close', (code) => {
            console.log(`Python process exited with code ${code}`);

            if (code !== 0) {
                console.error(`Transcription failed: ${errorData}`);
                logActivity(req.session.userId, req.session.name, 'transcription_failed', `Admin transcription failed for recording \"${row.name}\": ${errorData}`);
                return res.status(500).json({ error: 'Transcription failed', details: errorData });
            }

            fs.writeFile(transcriptPath, transcriptData, 'utf8', (err) => {
                if (err) {
                    console.error('Error saving transcript:', err);
                    return res.status(500).json({ error: 'Failed to save transcript' });
                }

                db.run(`UPDATE recordings SET path_transcript = ? WHERE id = ?`, [publicTranscriptPath, recordingId], (err) => {
                    if (err) {
                        console.error('Error updating DB:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    logActivity(req.session.userId, req.session.name, 'transcription_completed', `Admin completed transcription of recording \"${row.name}\"`);
                    res.json({ message: 'Transcription successful', path_transcript: publicTranscriptPath });
                });
            });
        });
    });
});

// Classify transcript using ML model
app.post('/api/recordings/:id/classify', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    const recordingId = req.params.id;

    db.get(`SELECT * FROM recordings WHERE id = ?`, [recordingId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Recording not found' });

        // Check if transcript exists
        if (!row.path_transcript) {
            return res.status(400).json({ error: 'No transcript available. Please transcribe first.' });
        }

        const transcriptPath = path.join(__dirname, 'public', row.path_transcript);

        // Check if transcript file exists
        if (!fs.existsSync(transcriptPath)) {
            return res.status(404).json({ error: 'Transcript file not found' });
        }

        // Log classification start
        logActivity(req.session.userId, req.session.name, 'classification_started', `Admin started classification of recording "${row.name}"`);

        // Run classify.py
        const pythonProcess = spawn('python', ['classify.py', transcriptPath]);

        let classificationData = '';
        let errorData = '';

        pythonProcess.on('error', (err) => {
            console.error('Failed to start classification process:', err);
            logActivity(req.session.userId, req.session.name, 'classification_failed', `Classification failed for recording "${row.name}": ${err.message}`);
            return res.status(500).json({ error: 'Failed to start classification process' });
        });

        pythonProcess.stdout.on('data', (data) => classificationData += data.toString());
        pythonProcess.stderr.on('data', (data) => errorData += data.toString());

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`Classification failed: ${errorData}`);
                logActivity(req.session.userId, req.session.name, 'classification_failed', `Classification failed for recording "${row.name}": ${errorData}`);
                return res.status(500).json({ error: 'Classification failed', details: errorData });
            }

            try {
                // Parse the JSON output from classify.py
                const classificationResults = JSON.parse(classificationData);

                // Store classification results in database
                db.run(
                    `UPDATE recordings SET classification_data = ? WHERE id = ?`,
                    [JSON.stringify(classificationResults), recordingId],
                    (err) => {
                        if (err) {
                            console.error('Error updating classification data:', err);
                            return res.status(500).json({ error: 'Failed to save classification results' });
                        }

                        // Log classification completion
                        logActivity(req.session.userId, req.session.name, 'classification_completed', `Admin completed classification of recording "${row.name}"`);

                        res.json({
                            message: 'Classification successful',
                            classification: classificationResults
                        });
                    }
                );
            } catch (parseError) {
                console.error('Error parsing classification results:', parseError);
                console.error('Raw output:', classificationData);
                logActivity(req.session.userId, req.session.name, 'classification_failed', `Classification parsing failed for recording "${row.name}"`);
                return res.status(500).json({ error: 'Failed to parse classification results' });
            }
        });
    });
});

app.post('/api/recordings/:id/archive', (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const id = req.params.id;
    // Get recording info to include in activity log
    db.get('SELECT name FROM recordings WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Recording not found' });

        db.run('UPDATE recordings SET is_archived = 1, archived_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            // Log the activity
            logActivity(req.session.userId, req.session.name, 'recording_archived', `Admin archived recording "${row.name}"`);
            res.json({ message: 'Recording archived' });
        });
    });
});

app.post('/api/recordings/:id/restore', (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const id = req.params.id;
    // Get recording info to include in activity log
    db.get('SELECT name FROM recordings WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Recording not found' });

        db.run('UPDATE recordings SET is_archived = 0, archived_at = NULL WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            // Log the activity
            logActivity(req.session.userId, req.session.name, 'recording_restored', `Admin restored recording "${row.name}"`);
            res.json({ message: 'Recording restored' });
        });
    });
});

// Meeting API Endpoints
app.post('/api/meeting/create', csrfProtection, (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const code = Math.random().toString(36).substring(2, 5).toUpperCase() + '-' +
        Math.random().toString(36).substring(2, 5).toUpperCase() + '-' +
        Math.random().toString(36).substring(2, 5).toUpperCase();

    // Set expiration to 24 hours from now
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.run(`INSERT INTO meetings (code, host_id, expires_at) VALUES (?, ?, ?)`,
        [code, req.session.userId, expiresAt],
        function (err) {
            if (err) {
                console.error('Error creating meeting:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            // Log the activity
            logActivity(req.session.userId, req.session.name, 'meeting_created', `Admin generated code "${code}"`);
            res.json({ code: code });
        }
    );
});

app.post('/api/meeting/validate', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ valid: false, error: 'Code required' });

    db.get('SELECT * FROM meetings WHERE code = ? AND is_active = 1', [code], (err, meeting) => {
        if (err || !meeting) {
            return res.json({ valid: false, error: 'Invalid code' });
        }

        const now = new Date();
        const expiresAt = new Date(meeting.expires_at);
        if (now > expiresAt) {
            return res.json({ valid: false, error: 'Code expired' });
        }

        res.json({ valid: true });
    });
});

// Search Students Endpoint
app.get('/api/students/search', (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const query = req.query.q;
    if (!query || query.length < 2) {
        return res.json([]);
    }

    const sql = `
        SELECT id, name, email, student_id 
        FROM users 
        WHERE role = 'student' 
        AND (name LIKE ? OR email LIKE ? OR student_id LIKE ?)
        LIMIT 10
    `;
    const searchParam = `%${query}%`;

    db.all(sql, [searchParam, searchParam, searchParam], (err, rows) => {
        if (err) {
            console.error('Search error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});



// Get Local IP Address
const { networkInterfaces } = require('os');

function getLocalIp() {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

app.get('/api/server-ip', (req, res) => {
    res.json({ ip: getLocalIp(), port: PORT });
});

// Activity Log API Endpoints
app.get('/api/activity-log', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

    const userId = req.session.userId;
    const role = req.session.role;

    let sql;
    let params = [];

    if (role === 'admin') {
        // Admins see all activities
        sql = `SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 50`;
    } else {
        // Students see only their own activities and activities where they are the target
        sql = `SELECT * FROM activity_log WHERE user_id = ? OR target_user_id = ? ORDER BY timestamp DESC LIMIT 50`;
        params = [userId, userId];
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/activity-log/user/:targetUserId', (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const targetUserId = req.params.targetUserId;
    const sql = `SELECT * FROM activity_log WHERE user_id = ? OR target_user_id = ? ORDER BY timestamp DESC LIMIT 50`;

    db.all(sql, [targetUserId, targetUserId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Scheduling API Endpoints

// Get upcoming interviews for admin
app.get('/api/schedule/admin', (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const sql = `
        SELECT s.*, u.name AS student_name
        FROM interview_schedules s
        JOIN users u ON s.student_id = u.id
        WHERE s.interview_date > datetime('now')
        ORDER BY s.interview_date ASC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get interviews for student
app.get('/api/schedule/student', (req, res) => {
    if (!req.session.userId || req.session.role !== 'student') return res.status(403).json({ error: 'Unauthorized' });

    const sql = `
        SELECT s.*, u.name AS instructor_name
        FROM interview_schedules s
        JOIN users u ON s.created_by = u.id
        WHERE s.student_id = ? AND s.interview_date > datetime('now')
        ORDER BY s.interview_date ASC
    `;

    db.all(sql, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create new interview schedule with validation
app.post('/api/schedule/create', csrfProtection, async (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

    const { instructorName, studentIdentifier, interviewDate, interviewType } = req.body;

    // Validate inputs
    if (!instructorName || !studentIdentifier || !interviewDate || !interviewType) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (!['Entrance', 'Exit'].includes(interviewType)) {
        return res.status(400).json({ error: 'Interview type must be "Entrance" or "Exit"' });
    }

    try {
        // Find student by identifier (could be ID or email)
        const studentSql = `SELECT id, name FROM users WHERE student_id = ? OR email = ?`;
        const student = await new Promise((resolve, reject) => {
            db.get(studentSql, [studentIdentifier, studentIdentifier], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Check for instructor conflicts (30-minute window)
        const conflictSql = `
            SELECT id FROM interview_schedules
            WHERE instructor_name = ?
            AND interview_date < datetime(?, '+30 minutes')
            AND datetime(?, '+30 minutes') > interview_date
        `;

        const instructorConflict = await new Promise((resolve, reject) => {
            db.get(conflictSql, [instructorName, interviewDate, interviewDate], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (instructorConflict) {
            return res.status(409).json({ error: `Instructor ${instructorName} is not available at this time. They have an interview within the next 30 minutes.` });
        }

        // Check for student conflicts (exact time)
        const studentConflictSql = `SELECT id FROM interview_schedules WHERE student_id = ? AND interview_date = ?`;
        const studentConflict = await new Promise((resolve, reject) => {
            db.get(studentConflictSql, [student.id, interviewDate], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (studentConflict) {
            return res.status(409).json({ error: `Student ${student.name} already has an interview scheduled at this time.` });
        }

        // Insert the new schedule
        const insertSql = `
            INSERT INTO interview_schedules (instructor_name, student_id, interview_date, interview_type, created_by)
            VALUES (?, ?, ?, ?, ?)
        `;

        db.run(insertSql, [instructorName, student.id, interviewDate, interviewType, req.session.userId], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // Log the activity with local time display
            const localTime = new Date(interviewDate + 'Z').toLocaleString('en-PH', {
                timeZone: 'Asia/Manila',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            logActivity(req.session.userId, req.session.name, 'interview_scheduled', `Admin scheduled ${interviewType} interview for ${student.name} with ${instructorName} on ${localTime}`);

            // Check if interview is within 10 minutes and send immediate notification
            const interviewTime = new Date(interviewDate + 'Z');
            const minutesUntil = Math.round((interviewTime - Date.now()) / 60000);

            if (minutesUntil > 0 && minutesUntil <= 10) {
                const displayTime = new Date(interviewDate + 'Z').toLocaleTimeString('en-PH', {
                    timeZone: 'Asia/Manila',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                // Notify admin immediately
                logActivity(
                    req.session.userId,
                    req.session.name,
                    'notification',
                    `Upcoming ${interviewType} interview with ${student.name} at ${displayTime} (in ${minutesUntil} minutes). Please prepare.`
                );

                // Notify student immediately
                logActivity(
                    student.id,
                    student.name,
                    'notification',
                    `Upcoming ${interviewType} interview with ${instructorName} at ${displayTime} (in ${minutesUntil} minutes). Please prepare.`
                );

                console.log(`✓ Immediate notification sent for interview ${this.lastID} - starts in ${minutesUntil} minutes`);
            }

            res.json({ message: 'Interview scheduled successfully', id: this.lastID });
        });

    } catch (error) {
        console.error('Error scheduling interview:', error);
        res.status(500).json({ error: 'Failed to schedule interview' });
    }
});

// Delete interview
app.delete('/api/schedule/:id', csrfProtection, (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const interviewId = req.params.id;

    // Get interview details before deletion for logging
    db.get('SELECT * FROM interview_schedules WHERE id = ?', [interviewId], (err, interview) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!interview) return res.status(404).json({ error: 'Interview not found' });

        // Delete the interview
        db.run('DELETE FROM interview_schedules WHERE id = ?', [interviewId], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // Log the deletion
            const localTime = new Date(interview.interview_date + 'Z').toLocaleString('en-PH', {
                timeZone: 'Asia/Manila',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            logActivity(
                req.session.userId,
                req.session.name,
                'interview_deleted',
                `Deleted ${interview.interview_type} interview with ${interview.instructor_name} scheduled for ${localTime}`
            );

            res.json({ message: 'Interview deleted successfully' });
        });
    });
});

// Update interview
app.put('/api/schedule/:id', csrfProtection, async (req, res) => {
    if (!req.session.userId || req.session.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const interviewId = req.params.id;
    const { instructorName, studentIdentifier, interviewDate, interviewType } = req.body;

    if (!instructorName || !studentIdentifier || !interviewDate || !interviewType) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        // Get student ID
        const student = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id, name FROM users WHERE student_id = ? OR email = ?',
                [studentIdentifier, studentIdentifier],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        // Check if interview exists
        const interview = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM interview_schedules WHERE id = ?', [interviewId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!interview) {
            return res.status(404).json({ error: 'Interview not found' });
        }

        // Update the interview
        db.run(
            `UPDATE interview_schedules 
             SET instructor_name = ?, student_id = ?, interview_date = ?, interview_type = ?
             WHERE id = ?`,
            [instructorName, student.id, interviewDate, interviewType, interviewId],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });

                // Log the update
                const localTime = new Date(interviewDate + 'Z').toLocaleString('en-PH', {
                    timeZone: 'Asia/Manila',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });

                logActivity(
                    req.session.userId,
                    req.session.name,
                    'interview_updated',
                    `Updated ${interviewType} interview with ${student.name} on ${localTime}`
                );

                res.json({ message: 'Interview updated successfully' });
            }
        );
    } catch (error) {
        console.error('Error updating interview:', error);
        res.status(500).json({ error: 'Failed to update interview' });
    }
});

// Get interviews for a specific date
app.get('/api/schedule/date/:date', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

    const date = req.params.date;
    const sql = `
        SELECT s.*, u.name AS student_name
        FROM interview_schedules s
        JOIN users u ON s.student_id = u.id
        WHERE date(s.interview_date) = date(?) AND s.created_by = ?
        ORDER BY s.interview_date ASC
    `;

    db.all(sql, [date, req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get calendar data for a month
app.get('/api/schedule/calendar/:year/:month', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

    const year = req.params.year;
    const month = req.params.month;
    const sql = `
        SELECT s.*, u.name AS student_name
        FROM interview_schedules s
        JOIN users u ON s.student_id = u.id
        WHERE strftime('%Y', s.interview_date) = ? AND strftime('%m', s.interview_date) = ?
        AND (s.created_by = ? OR s.student_id = ?)
        ORDER BY s.interview_date ASC
    `;

    const userId = req.session.userId;
    db.all(sql, [year, String(month).padStart(2, '0'), userId, userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Notification system for upcoming interviews (runs every minute)
function checkUpcomingInterviews() {
    const now = new Date();
    const nowUTC = now.toISOString().slice(0, 19).replace('T', ' ');
    const tenMinLater = new Date(now.getTime() + 10 * 60000);
    const elevenMinLater = new Date(now.getTime() + 11 * 60000);
    const tenMinUTC = tenMinLater.toISOString().slice(0, 19).replace('T', ' ');
    const elevenMinUTC = elevenMinLater.toISOString().slice(0, 19).replace('T', ' ');

    const sql = `
        SELECT s.*, u.name AS student_name, admin.name AS admin_name
        FROM interview_schedules s
        JOIN users u ON s.student_id = u.id
        JOIN users admin ON s.created_by = admin.id
        WHERE s.interview_date BETWEEN ? AND ?
    `;

    db.all(sql, [tenMinUTC, elevenMinUTC], (err, rows) => {
        if (err) {
            console.error('Error checking upcoming interviews:', err);
            return;
        }

        rows.forEach(schedule => {
            // Check if already notified to prevent duplicates
            if (notifiedInterviews.has(schedule.id)) {
                return;
            }

            // Format time correctly with timezone
            const interviewTime = new Date(schedule.interview_date + 'Z').toLocaleTimeString('en-PH', {
                timeZone: 'Asia/Manila',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Notify admin
            logActivity(
                schedule.created_by,
                schedule.admin_name,
                'notification',
                `You have a scheduled ${schedule.interview_type} interview with ${schedule.student_name} today at ${interviewTime}. Please prepare.`
            );

            // Notify student
            logActivity(
                schedule.student_id,
                schedule.student_name,
                'notification',
                `You have a scheduled ${schedule.interview_type} interview with ${schedule.instructor_name} today at ${interviewTime}. Please prepare.`
            );

            // Mark as notified
            notifiedInterviews.add(schedule.id);

            console.log(`✓ Notified about interview ${schedule.id} - ${schedule.interview_type} at ${interviewTime}`);
        });
    });
}

// Check for upcoming interviews every minute
setInterval(checkUpcomingInterviews, 60000);

server.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIp();
    console.log(`\n✅ Server running!`);
    console.log(`   Local:   https://localhost:${PORT}`);
    console.log(`   Network: https://${ip}:${PORT}\n`);
    console.log(`   Note: Accept the self-signed certificate warning on other devices.`);
});
