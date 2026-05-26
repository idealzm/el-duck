const express = require('express');
const adminMiddleware = require('../middleware/admin');

const usersRoutes = require('./admin/usersRoutes');
const settingsRoutes = require('./admin/settingsRoutes');
const promosRoutes = require('./admin/promosRoutes');
const billingRoutes = require('./admin/billingRoutes');
const notificationsRoutes = require('./admin/notificationsRoutes');
const adminAccountsRoutes = require('./admin/adminAccountsRoutes');
const supportRoutes = require('./admin/supportRoutes');
const groupsRoutes = require('./admin/groupsRoutes');

const router = express.Router();

router.use(adminMiddleware);
router.use(usersRoutes);
router.use(settingsRoutes);
router.use(promosRoutes);
router.use(billingRoutes);
router.use(notificationsRoutes);
router.use(adminAccountsRoutes);
router.use(supportRoutes);
router.use(groupsRoutes);

module.exports = router;
