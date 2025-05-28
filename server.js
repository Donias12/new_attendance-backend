const express = require('express');
const cors = require('cors');
const config = require('./config');
const mysql = require('mysql');

// Import routes
const studentRoutes = require('./routes/student');
const lecturerRoutes = require('./routes/lecturer');
const moduleRoutes = require('./routes/module');
const attendanceRoutes = require('./routes/attendance');

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
app.use(cors());
app.use(express.json());

// Routes
app.use('/student', studentRoutes);
app.use('/lecturer', lecturerRoutes);
app.use('/module', moduleRoutes);
app.use('/attendance', attendanceRoutes);

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the New Attendance System API' });
});

// Start server
app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});