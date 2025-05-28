const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { verifyToken, verifyStudent } = require('../middleware/auth');

// Register a new student
router.post('/register', async (req, res) => {
  try {
    const { reg_number, name, email, password, invite_code } = req.body;
    
    if (!reg_number || !name || !email || !password || !invite_code) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Check if email already exists
    db.query('SELECT * FROM students WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
      
      if (results.length > 0) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      
      // Check if reg_number already exists
      db.query('SELECT * FROM students WHERE reg_number = ?', [reg_number], async (err, results) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Server error' });
        }
        
        if (results.length > 0) {
          return res.status(400).json({ message: 'Registration number already exists' });
        }
        
        // Check if invite code exists
        db.query('SELECT * FROM modules WHERE invite_code = ?', [invite_code], async (err, modules) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Server error' });
          }
          
          if (modules.length === 0) {
            return res.status(400).json({ message: 'Invalid invite code' });
          }
          
          const moduleId = modules[0].id;
          
          // Hash password
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(password, salt);
          
          // Insert student
          const newStudent = {
            reg_number,
            name,
            email,
            password: hashedPassword
          };
          
          db.query('INSERT INTO students SET ?', newStudent, (err, result) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ message: 'Server error' });
            }
            
            const studentId = result.insertId;
            
            // Register student to module
            const moduleRegistration = {
              student_id: studentId,
              module_id: moduleId
            };
            
            db.query('INSERT INTO module_registrations SET ?', moduleRegistration, (err) => {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ message: 'Server error' });
              }
              
              // Generate JWT
              const token = jwt.sign(
                { id: studentId, reg_number, name, role: 'student' },
                config.jwtSecret,
                { expiresIn: config.jwtExpiration }
              );
              
              res.status(201).json({
                message: 'Student registered successfully',
                token
              });
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

// Login student
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    db.query('SELECT * FROM students WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
      
      if (results.length === 0) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      const student = results[0];
      
      // Compare password
      const isMatch = await bcrypt.compare(password, student.password);
      
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Generate JWT
      const token = jwt.sign(
        { id: student.id, reg_number: student.reg_number, name: student.name, role: 'student' },
        config.jwtSecret,
        { expiresIn: config.jwtExpiration }
      );
      
      res.json({
        message: 'Login successful',
        token
      });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Join a module
router.post('/join-module', verifyToken, verifyStudent, (req, res) => {
  try {
    const { invite_code } = req.body;
    const studentId = req.user.id;
    
    if (!invite_code) {
      return res.status(400).json({ message: 'Invite code is required' });
    }
    
    // Check if invite code exists
    db.query('SELECT * FROM modules WHERE invite_code = ?', [invite_code], (err, modules) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
      
      if (modules.length === 0) {
        return res.status(400).json({ message: 'Invalid invite code' });
      }
      
      const moduleId = modules[0].id;
      
      // Check if already registered
      db.query(
        'SELECT * FROM module_registrations WHERE student_id = ? AND module_id = ?',
        [studentId, moduleId],
        (err, registrations) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Server error' });
          }
          
          if (registrations.length > 0) {
            return res.status(400).json({ message: 'Already registered for this module' });
          }
          
          // Register student to module
          const moduleRegistration = {
            student_id: studentId,
            module_id: moduleId
          };
          
          db.query('INSERT INTO module_registrations SET ?', moduleRegistration, (err) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ message: 'Server error' });
            }
            
            res.status(201).json({
              message: 'Successfully joined module',
              module: modules[0]
            });
          });
        }
      );
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get student modules
router.get('/modules', verifyToken, verifyStudent, (req, res) => {
  try {
    const studentId = req.user.id;
    
    const query = `
      SELECT m.* 
      FROM modules m
      JOIN module_registrations mr ON m.id = mr.module_id
      WHERE mr.student_id = ?
    `;
    
    db.query(query, [studentId], (err, modules) => {
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

module.exports = router;