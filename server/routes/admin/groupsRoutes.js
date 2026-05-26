const express = require('express');
const { db } = require('../../config/database');
const { ok, fail } = require('../../utils/httpResponse');

const router = express.Router();

router.get('/groups', async (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT g.*, COUNT(m.user_id) as member_count
      FROM user_groups g
      LEFT JOIN user_group_members m ON g.id = m.group_id
      GROUP BY g.id
      ORDER BY g.name
    `).all();
    return ok(res, { groups });
  } catch (error) {
    return fail(res, 'Ошибка получения групп', 500);
  }
});

router.post('/groups', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) return fail(res, 'Название обязательно', 400);

    const groupColor = color || '#888888';
    const stmt = db.prepare('INSERT INTO user_groups (name, color) VALUES (?, ?)');
    const result = stmt.run(name.trim(), groupColor);

    const group = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(result.lastInsertRowid);
    return ok(res, group, 201);
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint')) {
      return fail(res, 'Группа с таким названием уже существует', 409);
    }
    return fail(res, 'Ошибка создания группы', 500);
  }
});

router.put('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    const group = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(id);
    if (!group) return fail(res, 'Группа не найдена', 404);

    const newName = name !== undefined ? name : group.name;
    const newColor = color !== undefined ? color : group.color;

    db.prepare('UPDATE user_groups SET name = ?, color = ? WHERE id = ?').run(newName, newColor, id);

    const updated = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(id);
    return ok(res, updated);
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint')) {
      return fail(res, 'Группа с таким названием уже существует', 409);
    }
    return fail(res, 'Ошибка обновления группы', 500);
  }
});

router.delete('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const group = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(id);
    if (!group) return fail(res, 'Группа не найдена', 404);

    db.prepare('DELETE FROM user_group_members WHERE group_id = ?').run(id);
    db.prepare('DELETE FROM user_groups WHERE id = ?').run(id);

    return ok(res, { message: 'Группа удалена' });
  } catch (error) {
    return fail(res, 'Ошибка удаления группы', 500);
  }
});

router.post('/groups/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    const group = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(id);
    if (!group) return fail(res, 'Группа не найдена', 404);
    if (!Array.isArray(userIds) || userIds.length === 0) return fail(res, 'Укажите пользователей', 400);

    const User = require('../../models/User');
    const insertStmt = db.prepare('INSERT OR IGNORE INTO user_group_members (user_id, group_id) VALUES (?, ?)');

    for (const publicId of userIds) {
      const user = User.getByPublicId(publicId);
      if (user) {
        insertStmt.run(user.id, id);
      }
    }

    return ok(res, { message: 'Пользователи добавлены в группу' });
  } catch (error) {
    return fail(res, 'Ошибка добавления пользователей', 500);
  }
});

router.delete('/groups/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    const group = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(id);
    if (!group) return fail(res, 'Группа не найдена', 404);
    if (!Array.isArray(userIds) || userIds.length === 0) return fail(res, 'Укажите пользователей', 400);

    const User = require('../../models/User');
    const deleteStmt = db.prepare('DELETE FROM user_group_members WHERE user_id = ? AND group_id = ?');

    for (const publicId of userIds) {
      const user = User.getByPublicId(publicId);
      if (user) {
        deleteStmt.run(user.id, id);
      }
    }

    return ok(res, { message: 'Пользователи удалены из группы' });
  } catch (error) {
    return fail(res, 'Ошибка удаления пользователей из группы', 500);
  }
});

router.get('/groups/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const group = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(id);
    if (!group) return fail(res, 'Группа не найдена', 404);

    const members = db.prepare(`
      SELECT u.id, u.user_uuid, u.email, u.unlimited_balance
      FROM users u
      INNER JOIN user_group_members m ON u.id = m.user_id
      WHERE m.group_id = ?
    `).all(id);

    return ok(res, members);
  } catch (error) {
    return fail(res, 'Ошибка получения участников группы', 500);
  }
});

module.exports = router;