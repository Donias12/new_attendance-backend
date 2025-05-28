const express = require('express');
const router = express.Router();
const { verifyToken, verifyStudent, verifyLecturer } = require('../middleware/auth');
const { generateSessionCode, calculateExpiryTime } = require('../utils/helpers');

// Create new session code (lecturer only)
router.post('/session', verifyToken, verifyLecturer, (req, res) => {
  try {
    const { module_id, expiration_minutes } = req.body;
    const lecturerId = req.user.id;
    
    if (!module_id || !expiration_minutes) {
      return res.status(400).json({ message: 'Module ID and expiration time are required' });
    }
    
    // Check if lecturer owns this module
    db.query(
      'SELECT * FROM modules WHERE id = ? AND lecturer_id = ?',
      [module_id, lecturerId],
      (err, modules) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Server error' });
        }
        
        if (modules.length === 0) {
          return res.status(403).json({ message: 'Not authorized to create session for this module' });
        }
        
        // Deactivate any active session codes for this module
        db.query(
          'UPDATE session_codes SET active = 0 WHERE module_id = ? AND active = 1',
          [module_id],
          (err) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ message: 'Server error' });
            }
            
            // Generate new session code
            const code = generateSessionCode();
            const expiresAt = calculateExpiryTime(parseInt(expiration_minutes));
            
            const newSession = {
              module_id,
              code,
              expires_at: expiresAt,
              active: 1
            };
            
            db.query('INSERT INTO session_codes SET ?', newSession, (err, result) => {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ message: 'Server error' });
              }
              
              res.status(201).json({
                message: 'Session code created successfully',
                session: {
                  id: result.insertId,
                  ...newSession,
                  expires_at: expiresAt
                }
              });
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Sign attendance (student only)
router.post('/sign', verifyToken, verifyStudent, (req, res) => {
  try {
    const { session_code } = req.body;
    const studentId = req.user.id;
    
    if (!session_code) {
      return res.status(400).json({ message: 'Session code is required' });
    }
    
    // Validate session code
    const sessionQuery = `
      SELECT sc.*, m.id as module_id
      FROM session_codes sc
      JOIN modules m ON sc.module_id = m.id
      WHERE sc.code = ? AND sc.active = 1 AND sc.expires_at > NOW()
    `;
    
    db.query(sessionQuery, [session_code], (err, sessions) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
      
      if (sessions.length === 0) {
        return res.status(400).json({ message: 'Invalid or expired session code' });
      }
      
      const session = sessions[0];
      
      // Check if student is registered for this module
      const registrationQuery = `
        SELECT * FROM module_registrations
        WHERE student_id = ? AND module_id = ?
      `;
      
      db.query(registrationQuery, [studentId, session.module_id], (err, registrations) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Server error' });
        }
        
        if (registrations.length === 0) {
          return res.status(403).json({ message: 'You are not registered for this module' });
        }
        
        // Check if already signed attendance for this session
        const attendanceQuery = `
          SELECT * FROM attendance
          WHERE student_id = ? AND session_code_id = ?
        `;
        
        db.query(attendanceQuery, [studentId, session.id], (err, attendances) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Server error' });
          }
          
          if (attendances.length > 0) {
            return res.status(400).json({ message: 'Already signed attendance for this session' });
          }
          
          // Record attendance
          const newAttendance = {
            student_id: studentId,
            session_code_id: session.id,
            module_id: session.module_id
          };
          
          db.query('INSERT INTO attendance SET ?', newAttendance, (err) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ message: 'Server error' });
            }
            
            res.status(201).json({
              message: 'Attendance signed successfully'
            });
          });
        });
      });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get attendance report for a module (lecturer only)
router.get('/report/:module_code', verifyToken, verifyLecturer, (req, res) => {
  try {
    const moduleCode = req.params.module_code;
    const lecturerId = req.user.id;
    
    // Check if lecturer owns this module
    db.query(
      'SELECT * FROM modules WHERE code = ? AND lecturer_id = ?',
      [moduleCode, lecturerId],
      (err, modules) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Server error' });
        }
        
        if (modules.length === 0) {
          return res.status(403).json({ message: 'Not authorized to view report for this module' });
        }
        
        const moduleId = modules[0].id;
        
        // Get overall statistics
        const statsQuery = `
          SELECT 
            COUNT(DISTINCT a.student_id) as total_students,
            COUNT(DISTINCT a.session_code_id) as total_sessions,
            COUNT(*) as total_attendances
          FROM attendance a
          WHERE a.module_id = ?
        `;
        
        db.query(statsQuery, [moduleId], (err, stats) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Server error' });
          }
          
          // Get attendance by student
          const studentQuery = `
            SELECT 
              s.id, s.reg_number, s.name, s.email,
              COUNT(a.id) as attendance_count,
              (
                SELECT COUNT(*) 
                FROM session_codes 
                WHERE module_id = ?
              ) as total_sessions
            FROM students s
            JOIN module_registrations mr ON s.id = mr.student_id
            LEFT JOIN attendance a ON s.id = a.student_id AND a.module_id = ?
            WHERE mr.module_id = ?
            GROUP BY s.id
            ORDER BY attendance_count DESC
          `;
          
          db.query(studentQuery, [moduleId, moduleId, moduleId], (err, students) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ message: 'Server error' });
            }
            
            // Get attendance by date
            const dateQuery = `
              SELECT 
                DATE(sc.created_at) as date,
                COUNT(DISTINCT a.student_id) as student_count
              FROM session_codes sc
              LEFT JOIN attendance a ON sc.id = a.session_code_id
              WHERE sc.module_id = ?
              GROUP BY DATE(sc.created_at)
              ORDER BY date DESC
            `;
            
            db.query(dateQuery, [moduleId], (err, dates) => {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ message: 'Server error' });
              }
              
              // Format the response
              const report = {
                module: modules[0],
                statistics: stats[0],
                students,
                attendanceByDate: dates
              };
              
              res.json(report);
            });
          });
        });
      }
    );
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get student's attendance for a module (student only)
router.get('/student/:module_code', verifyToken, verifyStudent, (req, res) => {
  try {
    const moduleCode = req.params.module_code;
    const studentId = req.user.id;
    
    // Check if student is registered for this module
    const moduleQuery = `
      SELECT m.*
      FROM modules m
      JOIN module_registrations mr ON m.id = mr.module_id
      WHERE m.code = ? AND mr.student_id = ?
    `;
    
    db.query(moduleQuery, [moduleCode, studentId], (err, modules) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
      
      if (modules.length === 0) {
        return res.status(403).json({ message: 'You are not registered for this module' });
      }
      
      const moduleId = modules[0].id;
      
      // Get attendance statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as attended,
          (
            SELECT COUNT(*) 
            FROM session_codes 
            WHERE module_id = ?
          ) as total_sessions
        FROM attendance
        WHERE student_id = ? AND module_id = ?
      `;
      
      db.query(statsQuery, [moduleId, studentId, moduleId], (err, stats) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Server error' });
        }
        
        // Get attendance details
        const detailsQuery = `
          SELECT 
            sc.code as session_code,
            a.signed_at,
            sc.created_at as session_created_at
          FROM attendance a
          JOIN session_codes sc ON a.session_code_id = sc.id
          WHERE a.student_id = ? AND a.module_id = ?
          ORDER BY a.signed_at DESC
        `;
        
        db.query(detailsQuery, [studentId, moduleId], (err, attendances) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Server error' });
          }
          
          // Format the response
          const report = {
            module: modules[0],
            statistics: stats[0],
            attendances
          };
          
          res.json(report);
        });
      });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;