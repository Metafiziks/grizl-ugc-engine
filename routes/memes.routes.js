const router = require('express').Router();
const { listMemes, getMemeShareStats, registerMeme } = require('../controllers/memes.controller');

router.get('/', listMemes);
router.get('/:id/shares', getMemeShareStats);
router.post('/', registerMeme);

module.exports = router;
