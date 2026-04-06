const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const { Client } = require('pg');
const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3');
// tedious is for SQL Server if needed

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.js')
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#38bdf8',
      height: 30
    }
  });

  const startUrl = process.env.ELECTRON_START_URL || url.format({
    pathname: path.join(__dirname, 'dist/dbgeek/browser/index.html'),
    protocol: 'file:',
    slashes: true
  });

  win.loadURL(startUrl);

  if (process.env.ELECTRON_START_URL) {
    win.webContents.openDevTools();
  } else {
    // If we're not using a start URL, we might still want to debug
    // win.webContents.openDevTools();
  }

  win.on('closed', () => {
    win = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});

// IPC Handlers for Database Operations
ipcMain.handle('db-connect', async (event, config) => {
  try {
    console.log('Attempting to connect to database:', config.type, '-', config.connection.host || config.connection.database);
    if (config.type === 'postgresql') {
      const client = new Client(config.connection);
      await client.connect();
      await client.end();
      console.log('PostgreSQL connection successful.');
      return { success: true };
    } else if (config.type === 'mysql') {
      const connection = await mysql.createConnection(config.connection);
      await connection.end();
      console.log('MySQL connection successful.');
      return { success: true };
    } else if (config.type === 'sqlite') {
      return new Promise((resolve) => {
        const db = new sqlite3.Database(config.connection.database, (err) => {
          if (err) {
            console.error('SQLite connection error:', err);
            resolve({ success: false, error: err.message });
          } else {
            db.close();
            console.log('SQLite connection successful.');
            resolve({ success: true });
          }
        });
      });
    }
    console.warn('Database type not supported for connection test:', config.type);
    return { success: false, error: 'Database type not supported yet' };
  } catch (error) {
    console.error('db-connect handler caught an error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-tables', async (event, config) => {
  try {
    if (config.type === 'postgresql') {
      const client = new Client(config.connection);
      await client.connect();
      const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
      await client.end();
      return { success: true, data: res.rows.map(r => r.table_name) };
    } else if (config.type === 'mysql') {
      const connection = await mysql.createConnection(config.connection);
      const [rows] = await connection.execute('SHOW TABLES');
      await connection.end();
      // MySQL returns rows as objects where the key is "Tables_in_databaseName"
      return { success: true, data: rows.map(r => Object.values(r)[0]) };
    } else if (config.type === 'sqlite') {
      return new Promise((resolve) => {
        const db = new sqlite3.Database(config.connection.database, (err) => {
          if (err) resolve({ success: false, error: err.message });
          else {
            db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name", [], (err, rows) => {
              db.close();
              if (err) resolve({ success: false, error: err.message });
              else resolve({ success: true, data: rows.map(r => r.name) });
            });
          }
        });
      });
    }
    return { success: false, error: 'Database type not supported yet' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-columns', async (event, { config, table }) => {
  try {
    if (config.type === 'postgresql') {
      const client = new Client(config.connection);
      await client.connect();
      const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [table]);
      await client.end();
      return { success: true, data: res.rows };
    } else if (config.type === 'mysql') {
      const connection = await mysql.createConnection(config.connection);
      const [rows] = await connection.execute(`DESCRIBE ${table}`);
      await connection.end();
      return { success: true, data: rows.map(r => ({ column_name: r.Field, data_type: r.Type })) };
    } else if (config.type === 'sqlite') {
      return new Promise((resolve) => {
        const db = new sqlite3.Database(config.connection.database, (err) => {
          if (err) resolve({ success: false, error: err.message });
          else {
            db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
              db.close();
              if (err) resolve({ success: false, error: err.message });
              else resolve({ success: true, data: rows.map(r => ({ column_name: r.name, data_type: r.type })) });
            });
          }
        });
      });
    }
    return { success: false, error: 'Database type not supported yet' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-query', async (event, { config, query }) => {
  try {
    if (config.type === 'postgresql') {
      const client = new Client(config.connection);
      await client.connect();
      const res = await client.query(query);
      await client.end();
      return { success: true, data: res.rows };
    } else if (config.type === 'mysql') {
      const connection = await mysql.createConnection(config.connection);
      const [rows] = await connection.execute(query);
      await connection.end();
      return { success: true, data: rows };
    } else if (config.type === 'sqlite') {
      return new Promise((resolve) => {
        const db = new sqlite3.Database(config.connection.database, (err) => {
          if (err) resolve({ success: false, error: err.message });
          else {
            db.all(query, [], (err, rows) => {
              db.close();
              if (err) resolve({ success: false, error: err.message });
              else resolve({ success: true, data: rows });
            });
          }
        });
      });
    }
    return { success: false, error: 'Database type not supported yet' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-drop-table', async (event, { config, table }) => {
  try {
    if (!table || typeof table !== 'string') {
      return { success: false, error: 'Invalid table name provided.' };
    }

    // Basic validation: table name should only contain alphanumeric characters and underscores
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
        return { success: false, error: 'Invalid table name format.' };
    }

    if (config.type === 'postgresql') {
      const client = new Client(config.connection);
      await client.connect();
      const res = await client.query(`DROP TABLE IF EXISTS "${table}"`);
      await client.end();
      return { success: true, data: res };
    } else if (config.type === 'mysql') {
      const connection = await mysql.createConnection(config.connection);
      const [rows] = await connection.execute(`DROP TABLE IF EXISTS ??`, [table]);
      await connection.end();
      return { success: true, data: rows };
    } else if (config.type === 'sqlite') {
      return new Promise((resolve) => {
        const db = new sqlite3.Database(config.connection.database, (err) => {
          if (err) resolve({ success: false, error: err.message });
          else {
            db.run(`DROP TABLE IF EXISTS "${table}"`, (errRun) => {
              db.close();
              if (errRun) resolve({ success: false, error: errRun.message });
              else resolve({ success: true });
            });
          }
        });
      });
    }
    return { success: false, error: 'Database type not supported for table deletion yet' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});