import { kml as kmlToGeoJSON } from '@tmcw/togeojson'
import express from 'express'
import fs from 'fs'
import { DOMParser } from 'xmldom'
import { pool } from '../db'
import multer from 'multer'

export const upload = multer({ dest: 'uploads/' })

const router = express.Router()

router.post('/api/polygons/upload-kml', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    // Leer archivo KML
    const kmlText = fs.readFileSync(req.file.path, 'utf8')

    // Convertir a GeoJSON
    const kmlDom = new DOMParser().parseFromString(kmlText)
    const geojson = kmlToGeoJSON(kmlDom)

    const client = await pool.connect()
    await client.query('BEGIN')

    let i = 0
    for (const feature of geojson.features) {
      console.log(feature)
      if (!feature.geometry) continue

      const name = feature.properties?.name || feature.properties?.Layer || `kml_polygon_${i}`
      i++

      await client.query(
        `
          INSERT INTO polygons (name, geom)
          VALUES (
            $1,
            ST_Multi(
              ST_SetSRID(
                ST_GeomFromGeoJSON($2),
                4326
              )
            )
          )
          `,
        [name, JSON.stringify(feature.geometry)]
      )
    }

    await client.query('COMMIT')
    client.release()

    // borrar archivo temporal
    fs.unlinkSync(req.file.path)

    res.json({
      message: 'KML cargado correctamente',
      features: geojson.features.length
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error procesando KML' })
  }
})

router.get('/api/polygons', async (req, res) => {
  try {
    const { bbox } = req.query

    if (!bbox) {
      return res.status(400).json({ error: 'bbox is required' })
    }

    const [minLng, minLat, maxLng, maxLat] = (bbox as string).split(',').map(Number)

    const query = `
        SELECT id,
               name,
               ST_AsGeoJSON(geom) as geometry
        FROM polygons
        WHERE geom && ST_MakeEnvelope($1,$2,$3,$4,4326)
      `

    const { rows } = await pool.query(query, [minLng, minLat, maxLng, maxLat])

    const geojson = {
      type: 'FeatureCollection',
      features: rows.map(row => ({
        type: 'Feature',
        geometry: JSON.parse(row.geometry),
        properties: {
          id: row.id,
          name: row.name
        }
      }))
    }

    res.json({ count: rows.length, data: geojson })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/api/polygons/generate', async (req, res) => {
  try {
    const numX = 500
    const numY = 300
    const step = 0.01
    const startLng = -3.75
    const startLat = 40.35

    // Limpiar tabla
    await pool.query('TRUNCATE TABLE polygons')
    const client = await pool.connect()
    await client.query('BEGIN')

    const batchSize = 1000
    let batch: [string, string][] = []

    for (let i = 0; i < numX; i++) {
      for (let j = 0; j < numY; j++) {
        const lng = startLng + i * step
        const lat = startLat + j * step
        const coords = [
          [lng, lat],
          [lng + step, lat],
          [lng + step, lat + step],
          [lng, lat + step],
          [lng, lat]
        ]
        const wkt = `POLYGON((${coords.map(c => c.join(' ')).join(',')}))`
        batch.push([`poly_${i}_${j}`, wkt])

        if (batch.length >= batchSize) {
          // Crear valores para batch insert
          const values = batch.map((_, idx) => `($${idx * 2 + 1}, ST_GeomFromText($${idx * 2 + 2},4326))`).join(',')
          const params = batch.flatMap(([name, wkt]) => [name, wkt])
          await client.query(`INSERT INTO polygons (name, geom) VALUES ${values}`, params)
          batch = []
        }
      }
    }

    // Insertar el resto
    if (batch.length > 0) {
      const values = batch.map((_, idx) => `($${idx * 2 + 1}, ST_GeomFromText($${idx * 2 + 2},4326))`).join(',')
      const params = batch.flatMap(([name, wkt]) => [name, wkt])
      await client.query(`INSERT INTO polygons (name, geom) VALUES ${values}`, params)
    }

    await client.query('COMMIT')
    client.release()

    res.json({ message: 'Polígonos generados y guardados en DB correctamente' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error generando polígonos' })
  }
})

async function getPolygonTile(z: number, x: number, y: number) {
  const query = `
      WITH tile_bounds AS (
        SELECT
          ST_TileEnvelope($1, $2, $3) AS geom_3857,
          ST_Transform(ST_TileEnvelope($1, $2, $3), 4326) AS geom_4326
      ),
      mvtgeom AS (
        SELECT
          ST_AsMVTGeom(
            ST_Transform(polygons.geom, 3857),
            tile_bounds.geom_3857
          ) AS geom,
          id,
          name,
          (SELECT color FROM statuses WHERE statuses.id = polygons.status_id) AS color
        FROM polygons, tile_bounds
        WHERE ST_Intersects(polygons.geom, tile_bounds.geom_4326)
      )
      SELECT ST_AsMVT(mvtgeom.*) AS tile FROM mvtgeom;
    `

  const { rows } = await pool.query(query, [z, x, y])
  return rows[0]?.tile
}

router.get('/tiles/:z/:x/:y.mvt', async (req, res) => {
  try {
    const { z, x, y } = req.params

    const tile = await getPolygonTile(parseInt(z), parseInt(x), parseInt(y))

    console.log('called')

    res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile')
    if (!tile) return res.send(Buffer.from(''))
    res.send(tile)
  } catch (err) {
    console.error(err)
    res.status(500).send('Tile error')
  }
})

router.get('/statuses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, color FROM statuses ORDER BY id')
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).send('Error fetching statuses')
  }
})

export default router
