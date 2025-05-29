const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql');
const config = require('./config');

// Create Express app
const app = express();

// Database connection
const db = mysql.createConnection(config.database);

// Connect to database
db.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    process.exit(1);
  }
  console.log('Connected to MySQL database');
});

// Make db available globally
global.db = db;

// Middleware
app.use(cors({ origin: 'https://donias12.github.io' }));
app.use(express.json());

// Authentication middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Generate random string for invite codes
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Student Login
app.post('/api/auth/student/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  db.query(
    'SELECT * FROM users WHERE email = ? AND userType = ?',
    [email, 'student'],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      if (results.length === 0) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }
      const user = results[0];
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err || !isMatch) {
          return res.status(400).json({ message: 'Invalid credentials' });
        }
        const token = jwt.sign(
          { userId: user.id, userType: 'student' },
          config.jwtSecret,
          { expiresIn: config.jwtExpiration }
        );
        res.json({ token, userType: 'student' });
      });
    }
  );
});

// Lecturer Login
app.post('/api/auth/lecturer/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  db.query(
    'SELECT * FROM users WHERE email = ? AND userType = ?',
    [email, 'lecturer'],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      if (results.length === 0) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }
      const user = results[0];
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err || !isMatch) {
          return res.status(400).json({ message: 'Invalid credentials' });
        }
        const token = jwt.sign(
          { userId: user.id, userType: 'lecturer' },
          config.jwtSecret,
          { expiresIn: config.jwtExpiration }
        );
        res.json({ token, userType: 'lecturer' });
      });
    }
  );
});

// Student Register
app.post('/api/auth/student/register', (req, res) => {
  const { registrationNumber, fullName, email, password, moduleInviteCode } = req.body;
  if (!registrationNumber || !fullName || !email || !password || !moduleInviteCode) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    db.query(
      'SELECT id FROM modules WHERE inviteCode = ?',
      [moduleInviteCode],
      (err, moduleResults) => {
        if (err || moduleResults.length === 0) {
          return res.status(400).json({ message: 'Invalid module invite code' });
        }
        const moduleId = moduleResults[0].id;
        db.query(
          'INSERT INTO users (registrationNumber, fullName, email, password, userType) VALUES (?, ?, ?, ?, ?)',
          [registrationNumber, fullName, email, hashedPassword, 'student'],
          (err, result) => {
            if (err) {
              if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ message: 'Email or registration number already exists' });
              }
              return res.status(500).json({ message: 'Server error', error: err.message });
            }
            const userId = result.insertId;
            db.query(
              'INSERT INTO module_students (moduleId, studentId) VALUES (?, ?)',
              [moduleId, userId],
              (err) => {
                if (err) {
                  return res.status(500).json({ message: 'Failed to join module', error: err.message });
                }
                const token = jwt.sign(
                  { userId, userType: 'student' },
                  config.jwtSecret,
                  { expiresIn: config.jwtExpiration }
                );
                res.json({ token, userType: 'student' });
              }
            );
          }
        );
      }
    );
  });
});

// Lecturer Register
app.post('/api/auth/lecturer/register', (req, res) => {
  const { fullName, email, password, classYear } = req.body;
  if (!fullName || !email || !password || !classYear) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    db.query(
      'INSERT INTO users (fullName, email, password, userType, classYear) VALUES (?, ?, ?, ?, ?)',
      [fullName, email, hashedPassword, 'lecturer', classYear],
      (err, result) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Email already exists' });
          }
          return res.status(500).json({ message: 'Server error', error: err.message });
        }
        const userId = result.insertId;
        const token = jwt.sign(
          { userId, userType: 'lecturer' },
          config.jwtSecret,
          { expiresIn: config.jwtExpiration }
        );
        res.json({ token, userType: 'lecturer' });
      }
    );
  });
});

// Create Module (Lecturer only)
app.post('/api/modules/create', authMiddleware, (req, res) => {
  if (req.user.userType !== 'lecturer') {
    return res.status(403).json({ message: 'Access denied' });
  }
  const { moduleCode, moduleName } = req.body;
  if (!moduleCode || !moduleName) {
    return res.status(400).json({ message: 'Module code and name are required' });
  }
  const inviteCode = generateRandomString(8);
  db.query(
    'INSERT INTO modules (moduleCode, moduleName, lecturerId, inviteCode) VALUES (?, ?, ?, ?)',
    [moduleCode, moduleName, req.user.userId, inviteCode],
    (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ message: 'Module code or invite code already exists' });
        }
        return res.status(500).json({ message: 'Server error', error: err.message });
      }
      res.json({
        message: 'Module created',
        module: { id: result.insertId, moduleCode, moduleName, inviteCode }
      });
    }
  );
});

// Join Module (Student only)
app.post('/api/modules/join', authMiddleware, (req, res) => {
  if (req.user.userType !== 'student') {
    return res.status(403).json({ message: 'Access denied' });
  }
  const { moduleInviteCode } = req.body;
  if (!moduleInviteCode) {
    return res.status(400).json({ message: 'Invite code is required' });
  }
  db.query(
    'SELECT id FROM modules WHERE inviteCode = ?',
    [moduleInviteCode],
    (err, results) => {
      if (err || results.length === 0) {
        return res.status(400).json({ message: 'Invalid invite code' });
      }
      const moduleId = results[0].id;
      db.query(
        'INSERT INTO module_students (moduleId, studentId) VALUES (?, ?)',
        [moduleId, req.user.userId],
        (err) => {
          if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
              return res.status(400).json({ message: 'Already enrolled in this module' });
            }
            return res.status(500).json({ message: 'Server error', error: err.message });
          }
          res.json({ message: 'Joined module successfully' });
        }
      );
    }
  );
});

// Generate Session (Lecturer only)
app.post('/api/sessions/generate', authMiddleware, (req, res) => {
  if (req.user.userType !== 'lecturer') {
    return res.status(403).json({ message: 'Access denied' });
  }
  const { moduleId, expirationTime } = req.body;
  if (!moduleId || !expirationTime) {
    return res.status(400).json({ message: 'Module ID and expiration time are required' });
  }
  db.query(
    'SELECT id FROM modules WHERE id = ? AND lecturerId = ?',
    [moduleId, req.user.userId],
    (err, results) => {
      if (err || results.length === 0) {
        return res.status(400).json({ message: 'Invalid module or access denied' });
      }
      const sessionCode = generateRandomString(6);
      const expiresAt = new Date(Date.now() + expirationTime * 60 * 1000);
      db.query(
        'INSERT INTO sessions (moduleId, sessionCode, expiresAt) VALUES (?, ?, ?)',
        [moduleId, sessionCode, expiresAt],
        (err, result) => {
          if (err) {
            return res.status(500).json({ message: 'Server error', error: err.message });
          }
          res.json({
            message: 'Session generated',
            session: { id: result.insertId, sessionCode, expiresAt }
          });
        }
      );
    }
  );
});

// Sign Session (Student only)
app.post('/api/sessions/sign', authMiddleware, (req, res) => {
  if (req.user.userType !== 'student') {
    return res.status(403).json({ message: 'Access denied' });
  }
  const { sessionCode } = req.body;
  if (!sessionCode) {
    return res.status(400).json({ message: 'Session code is required' });
  }
  db.query(
    'SELECT s.id, s.moduleId FROM sessions s JOIN module_students ms ON s.moduleId = ms.moduleId WHERE s.sessionCode = ? AND ms.studentId = ? AND s.expiresAt > NOW()',
    [sessionCode, req.user.userId],
    (err, results) => {
      if (err || results.length === 0) {
        return res.status(400).json({ message: 'Invalid or expired session code' });
      }
      const { id: sessionId, moduleId } = results[0];
      db.query(
        'INSERT INTO attendance (moduleId, studentId, date, status) VALUES (?, ?, NOW(), ?)',
        [moduleId, req.user.userId, 'present'],
        (err) => {
          if (err) {
            return res.status(500).json({ message: 'Server error', error: err.message });
          }
          res.json({ message: 'Attendance recorded' });
        }
      );
    }
  );
});

// Get Modules (Authenticated users)
app.get('/api/modules', authMiddleware, (req, res) => {
  let query = '';
  let params = [];
  if (req.user.userType === 'lecturer') {
    query = 'SELECT id, moduleCode, moduleName, inviteCode FROM modules WHERE lecturerId = ?';
    params = [req.user.userId];
  } else {
    query = 'SELECT m.id, m.moduleCode, m.moduleName, m.inviteCode FROM modules m JOIN module_students ms ON m.id = ms.moduleId WHERE ms.studentId = ?';
    params = [req.user.userId];
  }
  db.query(query, params, (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    res.json(results);
  });
});

// Get Sessions (Authenticated users)
app.get('/api/sessions', authMiddleware, (req, res) => {
  let query = '';
  let params = [];
  if (req.user.userType === 'lecturer') {
    query = 'SELECT s.id, s.moduleId, s.sessionCode, s.expiresAt FROM sessions s JOIN modules m ON s.moduleId = m.id WHERE m.lecturerId = ?';
    params = [req.user.userId];
  } else {
    query = 'SELECT s.id, s.moduleId, s.sessionCode, s.expiresAt FROM sessions s JOIN module_students ms ON s.moduleId = ms.moduleId WHERE ms.studentId = ?';
    params = [req.user.userId];
  }
  db.query(query, params, (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    res.json(results);
  });
});

// Get Attendance (Authenticated users)
app.get('/api/attendance', authMiddleware, (req, res) => {
  const moduleId = req.query.moduleId;
  let query = '';
  let params = [];
  if (req.user.userType === 'lecturer') {
    query = 'SELECT a.id, a.moduleId, a.studentId, a.date, a.status, u.fullName FROM attendance a JOIN users u ON a.studentId = u.id JOIN modules m ON a.moduleId = m.id WHERE m.lecturerId = ?';
    params = [req.user.userId];
    if (moduleId) {
      query += ' AND a.moduleId = ?';
      params.push(moduleId);
    }
  } else {
    query = 'SELECT a.id, a.moduleId, a.date, a.status FROM attendance a JOIN module_students ms ON a.moduleId = ms.moduleId WHERE ms.studentId = ?';
    params = [req.user.userId];
    if (moduleId) {
      query += ' AND a.moduleId = ?';
      params.push(moduleId);
    }
  }
  db.query(query, params, (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Server error', error: err.message });
    }
    res.json(results);
  });
});

// Get Module by ID (Authenticated users)
app.get('/api/modules/:id', authMiddleware, (req, res) => {
  const moduleId = req.params.id;
  let query = '';
  let params = [moduleId];
  if (req.user.userType === 'lecturer') {
    query = 'SELECT id, moduleCode, moduleName, inviteCode FROM modules WHERE id = ? AND lecturerId = ?';
    params.push(req.user.userId);
  } else {
    query = 'SELECT m.id, m.moduleCode, m.moduleName, m.inviteCode FROM modules m JOIN module_students ms ON m.id = ms.moduleId WHERE m.id = ? AND ms.studentId = ?';
    params.push(req.user.userId);
  }
  db.query(query, params, (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ message: 'Module not found or access denied' });
    }
    res.json(results[0]);
  });
});

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the New Attendance System API' });
});

// Start server
app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});