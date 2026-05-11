import sqlite3
import bcrypt

path = 'database/pcb_vision.db'
conn = sqlite3.connect(path)
cur = conn.cursor()
cur.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT)')
email = 'testuser@example.com'
cur.execute('SELECT id FROM users WHERE email = ?', (email,))
r = cur.fetchone()
if r is None:
    pw = bcrypt.hashpw(b'Test1234', bcrypt.gensalt()).decode('utf-8')
    cur.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', ('Test User', email, pw))
    print('user created')
else:
    print('user exists')
conn.commit()
conn.close()
