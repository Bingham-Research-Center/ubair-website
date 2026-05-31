import express from 'express';
import FireRestrictionsService from '../fireRestrictionsService.js';

const router = express.Router();
let fireRestrictionsService = new FireRestrictionsService();

export function setFireRestrictionsService(service) {
    fireRestrictionsService = service;
}

router.get('/fire-restrictions', async (req, res) => {
    try {
        const restrictions = await fireRestrictionsService.fetchActiveRestrictions();
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            totalRestrictions: restrictions.length,
            restrictions
        });
    } catch (error) {
        console.error('Error in /fire-restrictions endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch fire restrictions',
            message: error.message
        });
    }
});

export default router;
