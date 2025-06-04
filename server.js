const express = require('express');
const path = require('path');
const mysql = require('mysql');
require('dotenv').config();

const app = express();

// === MySQL Auto-Reconnect Setup ===
let connection;

function handleDisconnect() {
  connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  connection.connect(err => {
    if (err) {
      console.error('❌ Error connecting to MySQL:', err);
      setTimeout(handleDisconnect, 2000); // retry after 2 sec
    } else {
      console.log('✅ Connected to MySQL database');
    }
  });

  connection.on('error', err => {
    console.error('❌ MySQL error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      console.log('🔄 Reconnecting to MySQL...');
      handleDisconnect();
    } else {
      throw err;
    }
  });
}

handleDisconnect();

// === Serve Frontend ===
app.use(express.static(path.join(__dirname, '../dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// === Start Server ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
