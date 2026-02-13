import express from 'express'

import { pool } from '../db'

const router = express.Router()

router.get('', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name FROM activities ORDER BY id')
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).send('Error fetching statuses')
  }
})

router.post('', async (req, res) => {
  try {
    const { name } = req.body
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Nombre inválido' })
    }

    const queryText = 'INSERT INTO activities (name) VALUES ($1) RETURNING id'
    const values = [name]

    const { rows } = await pool.query(queryText, values)

    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error creating activity' })
  }
})

export default router
