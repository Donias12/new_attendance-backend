const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { verifyToken, verifyLecturer } = require('../middleware/auth');

// Register a new lecturer
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, class_year } = req.body;
    
    if (!name || !email || !password || !class_year) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Check if email already exists
    db.query('SELECT * FROM lecturers WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
      
      if (results.length > 0) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      // Insert lecturer
      const newLecturer = {
        name,
        email,
        password: hashedPassword,
        class_year
      };
      
      db.query('INSERT INTO lecturers SET ?', newLecturer, (err, result) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Server error' });
        }
        
        const lecturerId = result.insertId;
        
        // Generate JWT
        const token = jwt.sign(
          { id: lecturerId, name, role: 'lecturer' },
          config.jwtSecret,
          { expiresIn: config.jwtExpiration }
        );
        
        res.status(201).json({
          message: 'Lecturer registered successfully',
          token
        });
      });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login lecturer
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    db.query('SELECT * FROM lecturers WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error' });
      }
      
      if (results.length === 0) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      const lecturer = results[0];
      
      // Compare password
      const isMatch = await bcrypt.compare(password, lecturer.password);
      
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Generate JWT
      const token = jwt.sign(
        { id: lecturer.id, name: lecturer.name, role: 'lecturer' },
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

// Get lecturer modules
router.get('/modules', verifyToken, verifyLecturer, (req, res) => {
  try {
    const lecturerId = req.user.id;
    
    db.query('SELECT * FROM modules WHERE lecturer_id = ?', [lecturerId], (err, modules) => {
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