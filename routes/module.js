const express = require('express');
const router = express.Router();
const { verifyToken, verifyLecturer } = require('../middleware/auth');
const { generateInviteCode } = require('../utils/helpers');

// Create a new module
router.post('/create', verifyToken, verifyLecturer, (req, res) => {
  try {
    const { code, name } = req.body;
    const lecturerId = req.user.id;
    
    if (!code || !name) {
      return res.status(400).json({ message: 'Module code and name are required' });
    }
    
    // Check if module code already exists
    db.query('SELECT * FROM modules WHERE code = ?', [code], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
      
      if (results.length > 0) {
        return res.status(400).json({ message: 'Module code already exists' });
      }
      
      // Generate invite code
      const inviteCode = generateInviteCode();
      
      // Insert module
      const newModule = {
        code,
        name,
        invite_code: inviteCode,
        lecturer_id: lecturerId
      };
      
      db.query('INSERT INTO modules SET ?', newModule, (err, result) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Server error' });
        }
        
        res.status(201).json({
          message: 'Module created successfully',
          module: {
            id: result.insertId,
            ...newModule
          }
        });
      });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get module list
router.get('/list', verifyToken, (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    let query;
    let params;
    
    if (userRole === 'lecturer') {
      query = 'SELECT * FROM modules WHERE lecturer_id = ?';
      params = [userId];
    } else if (userRole === 'student') {
      query = `
        SELECT m.* 
        FROM modules m
        JOIN module_registrations mr ON m.id = mr.module_id
        WHERE mr.student_id = ?
      `;
      params = [userId];
    } else {
      return res.status(403).json({ message: 'Unauthorized role' });
    }
    
    db.query(query, params, (err, modules) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
      
      res.json(modules);
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get module details
router.get('/:id', verifyToken, (req, res) => {
  try {
    const moduleId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Check if user has access to this module
    let accessQuery;
    let accessParams;
    
    if (userRole === 'lecturer') {
      accessQuery = 'SELECT * FROM modules WHERE id = ? AND lecturer_id = ?';
      accessParams = [moduleId, userId];
    } else if (userRole === 'student') {
      accessQuery = `
        SELECT m.* 
        FROM modules m
        JOIN module_registrations mr ON m.id = mr.module_id
        WHERE m.id = ? AND mr.student_id = ?
      `;
      accessParams = [moduleId, userId];
    } else {
      return res.status(403).json({ message: 'Unauthorized role' });
    }
    
    db.query(accessQuery, accessParams, (err, modules) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
      
      if (modules.length === 0) {
        return res.status(404).json({ message: 'Module not found or access denied' });
      }
      
      const module = modules[0];
      
      // Get additional module data if lecturer
      if (userRole === 'lecturer') {
        // Get student count
        const countQuery = `
          SELECT COUNT(*) as student_count
          FROM module_registrations
          WHERE module_id = ?
        `;
        
        db.query(countQuery, [moduleId], (err, countResult) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Server error' });
          }
          
          module.studentCount = countResult[0].student_count;
          
          // Get active session code if any
          const sessionQuery = `
            SELECT * FROM session_codes
            WHERE module_id = ? AND active = 1 AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 1
          `;
          
          db.query(sessionQuery, [moduleId], (err, sessions) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ message: 'Server error' });
            }
            
            module.activeSession = sessions.length > 0 ? sessions[0] : null;
            
            res.json(module);
          });
        });
      } else {
        // For students, just return the module
        res.json(module);
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;