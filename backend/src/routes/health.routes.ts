import { Router } from 'express';
import * as health from '../controllers/health.controller.js';

const router = Router();

router.get('/health', health.getHealth);
router.get('/hello', health.getHello);

export default router;
