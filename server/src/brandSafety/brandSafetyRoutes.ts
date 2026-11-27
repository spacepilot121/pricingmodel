import express from 'express';
const router=express.Router();
router.all('*',(_req,res)=>res.status(410).json({error:'The legacy server brand safety engine has been retired. Use the current Brand Safety tab, which runs the maintained browser engine.'}));
export default router;
