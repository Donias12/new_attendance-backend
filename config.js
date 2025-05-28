require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  database: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'new_attendance'
  },
  jwtSecret: process.env.JWT_SECRET || 'new_attendance_secure_jwt_secret_2025',
  jwtExpiration: '24h'
};