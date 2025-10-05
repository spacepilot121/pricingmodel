const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, '[]', 'utf8');
  }
}

function readUsers() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(usersFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to read user store', err);
    return [];
  }
}

function writeUsers(users) {
  ensureDataDir();
  const payload = Array.isArray(users) ? users : [];
  fs.writeFileSync(usersFile, JSON.stringify(payload, null, 2), 'utf8');
}

function findUserByEmail(email) {
  if (!email) return null;
  const users = readUsers();
  return users.find(user => user.email.toLowerCase() === email.toLowerCase()) || null;
}

function findUserById(id) {
  if (!id) return null;
  const users = readUsers();
  return users.find(user => user.id === id) || null;
}

function createUser(user) {
  const users = readUsers();
  users.push(user);
  writeUsers(users);
  return user;
}

function updateUser(user) {
  if (!user || !user.id) return null;
  const users = readUsers();
  const idx = users.findIndex(entry => entry.id === user.id);
  if (idx === -1) {
    return null;
  }
  users[idx] = user;
  writeUsers(users);
  return user;
}

module.exports = {
  readUsers,
  writeUsers,
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
};
