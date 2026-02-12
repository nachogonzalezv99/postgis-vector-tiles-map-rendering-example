import maplibregl, { Map, Popup } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'

const POLYGON_SOURCE = 'polygons'

const COLORS = {
  selected: {
    fill: '#ADD8E6', // azul claro
    line: '#0000FF' // azul fuerte
  }
}

function App() {
  const mapRef = useRef<Map | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<Popup | null>(null)
  const [showAllNames, setShowAllNames] = useState(false)
  const [selectedFeatureId, setSelectedFeatureId] = useState<null | string>(null)
  const [statuses, setStatuses] = useState<{ id: number; name: string; color: string }[]>([])
  const statusMap = Object.fromEntries(statuses.map(s => [s.id, s.color]))
  console.log(statusMap, statuses)

  useEffect(() => {
    fetch('http://localhost:5000/statuses')
      .then(res => res.json())
      .then(data => setStatuses(data))
      .catch(err => console.error('Error fetching statuses', err))
  }, [])

  // Inicializar mapa solo una vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-3.7, 40.4],
      zoom: 12
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-left')
    map.addControl(new maplibregl.FullscreenControl(), 'top-left')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')

    mapRef.current = map

    map.on('load', () => {
      // Fuente de polígonos
      map.addSource(POLYGON_SOURCE, {
        type: 'vector',
        tiles: ['http://localhost:5000/tiles/{z}/{x}/{y}.mvt'],
        minzoom: 0,
        maxzoom: 20
      })

      map.addLayer({
        id: 'polygon-layer',
        type: 'fill',
        source: POLYGON_SOURCE,
        'source-layer': 'default',
        filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.5 }
      })

      // Borde de los polígonos
      map.addLayer({
        id: 'polygon-border-layer',
        type: 'line',
        source: POLYGON_SOURCE,
        'source-layer': 'default',
        filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 }
      })

      // Líneas
      map.addLayer({
        id: 'line-layer',
        type: 'line',
        source: POLYGON_SOURCE,
        'source-layer': 'default',
        filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
        paint: { 'line-color': ['get', 'color'], 'line-width': 3 }
      })

      // Puntos
      map.addLayer({
        id: 'point-layer',
        type: 'circle',
        source: POLYGON_SOURCE,
        'source-layer': 'default',
        filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.5,
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': 2
        }
      })
      // Popup para hover
      popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false })

      // Hover dinámico (solo si showAllNames=false)
      map.on('mousemove', e => {
        if (showAllNames) {
          popupRef.current?.remove()
          return
        }

        const features = map.queryRenderedFeatures(e.point, {
          layers: ['polygon-layer', 'line-layer', 'point-layer']
        })

        if (features.length) {
          const feature = features[0]
          const name = feature.properties?.name || 'Sin nombre'
          popupRef.current?.setLngLat(e.lngLat).setHTML(`<strong>${name}</strong>`).addTo(map)
          map.getCanvas().style.cursor = 'pointer'
        } else {
          popupRef.current?.remove()
          map.getCanvas().style.cursor = ''
        }
      })

      // Click siempre activo
      map.on('click', ['polygon-layer', 'line-layer', 'point-layer'], e => {
        if (!e.features || !e.features.length) return
        const feature = e.features[0]
        console.log(feature)
        setSelectedFeatureId(feature.properties.id)
        const name = feature.properties?.name || 'Sin nombre'
        console.log('Clicked feature:', name)
      })
    })
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    // Update layers' paint dynamically
    map.setPaintProperty('polygon-layer', 'fill-color', [
      'case',
      ['==', ['get', 'id'], selectedFeatureId],
      COLORS.selected.fill,
      ['get', 'color']
    ])
    map.setPaintProperty('polygon-border-layer', 'line-color', [
      'case',
      ['==', ['get', 'id'], selectedFeatureId],
      COLORS.selected.line,
      ['get', 'color']
    ])
    map.setPaintProperty('line-layer', 'line-color', [
      'case',
      ['==', ['get', 'id'], selectedFeatureId],
      COLORS.selected.line,
      ['get', 'color']
    ])
    map.setPaintProperty('point-layer', 'circle-color', [
      'case',
      ['==', ['get', 'id'], selectedFeatureId],
      COLORS.selected.fill,
      ['get', 'color']
    ])
    map.setPaintProperty('point-layer', 'circle-stroke-color', [
      'case',
      ['==', ['get', 'id'], selectedFeatureId],
      COLORS.selected.line,
      ['get', 'color']
    ])
  }, [selectedFeatureId])

  // Actualiza labels cuando cambia showAllNames
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    if (map.getLayer('label-layer')) map.removeLayer('label-layer')

    if (!showAllNames) return

    map.addLayer({
      id: 'label-layer',
      type: 'symbol',
      source: POLYGON_SOURCE,
      'source-layer': 'default',
      filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon', 'Point', 'MultiPoint'], true, false],
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 12,
        'text-anchor': 'center',
        'text-allow-overlap': false
      },
      paint: { 'text-color': '#000000' }
    })
  }, [showAllNames])

  return (
    <div>
      {/* Panel de opciones */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          zIndex: 10,
          background: 'white',
          padding: 10,
          margin: 10,
          borderRadius: 5
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={showAllNames}
            onChange={e => setShowAllNames(e.target.checked)}
            style={{ marginRight: 5 }}
          />
          Enseñar todos los nombres
        </label>
      </div>

      <div ref={containerRef} style={{ width: '100vw', height: '100vh' }} />
    </div>
  )
}

export default App
