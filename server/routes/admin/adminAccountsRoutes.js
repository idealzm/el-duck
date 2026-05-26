const express = require('express');
const { createValidator } = require('../../middleware/validate');
const { ok, fail } = require('../../utils/httpResponse');
const Admin = require('../../models/Admin');

const router = express.Router();

const validateCreateAdmin = createValidator({
  nickname: { required: true, type: 'string', minLength: 2, maxLength: 32 },
  email: { required: true, type: 'email' },
  password: { required: true, type: 'string', minLength: 8 }
});

function getAdminByPublicId(id) {
  const raw = String(id || '').trim();
  if (!raw) return null;
  const byUuid = Admin.getByUuid(raw);
  if (byUuid) return byUuid;
  if (/^\d+$/.test(raw)) return Admin.getById(Number(raw));
  return null;
}

router.get('/admins', async (req, res) => {
  const admins = Admin.listAll();
  return ok(res, {
    admins: admins.map((item) => ({
      id: item.admin_uuid,
      uuid: item.admin_uuid,
      nickname: item.nickname || null,
      email: item.email,
      isActive: !!item.is_active,
      createdByAdminId: item.created_by_admin_id || null,
      createdAt: item.created_at
    }))
  });
});

router.post('/admins', validateCreateAdmin, async (req, res) => {
  try {
    const nickname = String(req.body.nickname || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (nickname.length < 2 || nickname.length > 32) {
      return fail(res, 'Никнейм должен быть от 2 до 32 символов', 400);
    }
    if (Admin.getByNickname(nickname)) {
      return fail(res, 'Админ с таким никнеймом уже существует', 400);
    }
    if (Admin.getByEmail(email)) {
      return fail(res, 'Админ с таким email уже существует', 400);
    }
    const created = Admin.create({ nickname, email, password, createdByAdminId: req.admin.id });
    return ok(res, {
      message: 'Администратор создан',
      admin: {
        id: created.admin_uuid,
        uuid: created.admin_uuid,
        nickname: created.nickname || null,
        email: created.email,
        isActive: !!created.is_active,
        createdAt: created.created_at
      }
    });
  } catch (error) {
    return fail(res, `Ошибка создания администратора: ${error.message}`, 500);
  }
});

router.put('/admins/:id/active', async (req, res) => {
  try {
    const target = getAdminByPublicId(req.params.id);
    if (!target) return fail(res, 'Администратор не найден', 404);

    const nextActive = !!req.body.isActive;
    if (!nextActive && target.id === req.admin.id) {
      return fail(res, 'Нельзя деактивировать себя', 400);
    }

    const updated = Admin.setActive(target.id, nextActive);
    if (!nextActive) {
      Admin.incrementTokenVersion(updated.id);
    }

    return ok(res, {
      message: nextActive ? 'Администратор активирован' : 'Администратор деактивирован',
      admin: {
        id: updated.admin_uuid,
        uuid: updated.admin_uuid,
        nickname: updated.nickname || null,
        email: updated.email,
        isActive: !!updated.is_active,
        createdAt: updated.created_at
      }
    });
  } catch (error) {
    return fail(res, `Ошибка обновления администратора: ${error.message}`, 500);
  }
});

module.exports = router;
