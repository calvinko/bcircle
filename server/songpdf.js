import express from 'express';

const router = express.Router();

router.get('/getindex', async (_req, res) => {
  res.json({
    ok: true,
    route: 'songpdf/getindex',
    placeholder: true,
    message: 'Placeholder endpoint for song PDF index.'
  });
});

router.get('/check', async (_req, res) => {
  res.json({
    ok: true,
    route: 'songpdf/check',
    placeholder: true,
    message: 'Placeholder endpoint for song PDF check.'
  });
});

export default router;
