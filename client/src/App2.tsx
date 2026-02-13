import React, { useState, useCallback, useRef, useEffect } from 'react'
import { ReactFlow, applyNodeChanges, applyEdgeChanges, Background } from '@xyflow/react'
import type { ReactFlowInstance, NodeChange, EdgeChange, Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

type Node = { id: string; position: { x: number; y: number }; data: { label: string } }
type Edge = { id: string; source: string; target: string; label?: string; relation?: string; logic?: 'AND' | 'OR' }

type RelationType = 'one_from_one' | 'one_from_many' | 'many_from_one'
type LogicType = 'AND' | 'OR'

const createsCycle = (sourceId: string, targetId: string, edges: Edge[], nodes: Node[]) => {
  const adjacency: Record<string, string[]> = {}
  edges.forEach(e => {
    if (!adjacency[e.source]) adjacency[e.source] = []
    adjacency[e.source].push(e.target)
  })
  if (!adjacency[sourceId]) adjacency[sourceId] = []
  adjacency[sourceId].push(targetId)

  const visited: Record<string, boolean> = {}
  const recStack: Record<string, boolean> = {}
  const dfs = (node: string): boolean => {
    if (!visited[node]) {
      visited[node] = true
      recStack[node] = true
      const neighbors = adjacency[node] || []
      for (const neighbor of neighbors) {
        if (!visited[neighbor] && dfs(neighbor)) return true
        else if (recStack[neighbor]) return true
      }
    }
    recStack[node] = false
    return false
  }
  return nodes.some(n => dfs(n.id))
}

type DependencyGroupEntry = {
  edges: Set<string>
  logic: 'AND' | 'OR' | null
}

export default function App() {
  const [availableActivities, setAvailableActivities] = useState([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [newActivityName, setNewActivityName] = useState('')
  const [dependencyGroups2, setDependencyGroups2] = useState<Map<string, DependencyGroupEntry>>(new Map())
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)

  const createActivity = async () => {
    if (!newActivityName.trim()) return

    try {
      // 2️⃣ Llamada POST al backend
      const res = await fetch('http://localhost:5000/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newActivityName })
      })

      if (!res.ok) throw new Error('Error creando actividad')


      // 3️⃣ Actualizar listado
      await fetchActivities()
      setNewActivityName('') // limpiar input
    } catch (err) {
      console.error(err)
      alert('No se pudo crear la actividad')
    }
  }
  const fetchActivities = async () => {
    try {
      const res = await fetch('http://localhost:5000/activities')
      const data = await res.json()
      setAvailableActivities(data)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchActivities()
  }, [])

  // Añadir actividad al canvas
  const addActivityToCanvas = (activity: { id: string; name: string }) => {
    if (nodes.find(n => n.id === activity.id)) return
    setNodes(ns => [
      ...ns,
      { id: activity.id, position: { x: 50 + ns.length * 150, y: 50 }, data: { label: activity.name } }
    ])
    setAvailableActivities(acts => acts.filter(a => a.id !== activity.id))
  }

  const onNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    setNodes(currentNodes => {
      // 1️⃣ detectar nodos eliminados
      const removedNodeIds = changes.filter(c => c.type === 'remove').map(c => c.id)

      if (removedNodeIds.length > 0) {
        // 2️⃣ nodos eliminados
        const removedNodes = currentNodes.filter(n => removedNodeIds.includes(n.id))

        // 3️⃣ eliminar edges relacionados
        setEdges(es => {
          const toRemove = es
            .filter(e => removedNodeIds.includes(e.source) || removedNodeIds.includes(e.target))
            .map(e => e.id)

          return es.filter(e => !toRemove.includes(e.id))
        })

        // 4️⃣ devolver nodos eliminados al sidebar (solo una vez)
        setAvailableActivities(acts => {
          const newActs = removedNodes.map(n => ({ id: n.id, name: n.data.label }))
          // evitar duplicados
          const existingIds = new Set(acts.map(a => a.id))
          return [...acts, ...newActs.filter(a => !existingIds.has(a.id))]
        })
      }

      // 5️⃣ aplicar cambios a nodos
      return applyNodeChanges(changes, currentNodes)
    })
  }, [])

  // DELETE
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    setEdges(es => {
      const updatedEdges = applyEdgeChanges(changes, es)

      // Actualizar dependencyGroups2
      setDependencyGroups2(prev => {
        const newMap = new Map(prev)

        // Revisar los edges eliminados
        changes.forEach(change => {
          if (change.type === 'remove') {
            const edgeId = change.id

            newMap.forEach((group, targetId) => {
              if (group.edges.has(edgeId)) {
                const newEdges = new Set(group.edges)
                newEdges.delete(edgeId)

                if (newEdges.size <= 1) {
                  // Solo queda 1 o 0 edge → poner lógica a null
                  newMap.set(targetId, { edges: newEdges, logic: null })
                } else {
                  newMap.set(targetId, { edges: newEdges, logic: group.logic })
                }
              }
            })
          }
        })

        return newMap
      })

      return updatedEdges
    })
  }, [])

  //CREATE
  const onConnect = useCallback(
    (params: Connection) => {
      if (createsCycle(params.source, params.target, edges, nodes)) {
        alert('No se puede crear ciclos')
        return
      }

      // --- Preguntar tipo de relación individual ---
      const relationType = prompt(
        "Tipo de relación: 'one_from_one', 'one_from_many', 'many_from_one'",
        'one_from_one'
      ) as RelationType

      let logic: LogicType | undefined
      if (relationType === 'one_from_many') {
        logic = prompt('Lógica de esta relación (AND/OR)', 'AND') as LogicType
      }

      const newEdge: Edge = {
        id: `${params.source}-${params.target}-${Date.now()}`,
        source: params.source,
        target: params.target,
        relation: relationType as string,
        logic,
        label: relationType === 'one_from_many' ? `${relationType} (${logic})` : relationType
      }

      setEdges(es => [...es, newEdge])

      const existingGroup = dependencyGroups2.get(params.target)

      let groupLogic: LogicType | null = null

      if (existingGroup && existingGroup.edges.size > 0) {
        groupLogic = prompt(`Múltiples padres. Define la lógica del grupo (AND/OR)`, 'AND') as LogicType
      }

      setDependencyGroups2(prev => {
        const newMap = new Map(prev)
        const existing = newMap.get(params.target)

        const edgesSet = existing ? new Set(existing.edges) : new Set<string>()
        edgesSet.add(newEdge.id)

        // Si ya existía, mantenemos la lógica; si no existía, ponemos la del prompt
        // const logicToSet = groupLogic ? groupLogic :

        newMap.set(params.target, { edges: edgesSet, logic: groupLogic })
        return newMap
      })
    },
    [edges, dependencyGroups2, nodes]
  )

  // Mostrar lógica de grupo en labels de los nodos
  const nodesWithGroupLabel = nodes.map(n => {
    const group = dependencyGroups2.get(n.id)
    const label =
      group && group.edges.size > 1 ? `${n.data.label} [${group.logic} de ${group.edges.size} padres]` : n.data.label
    return { ...n, data: { ...n.data, label } }
  })

  useEffect(() => {
    if (reactFlowInstance) reactFlowInstance.fitView()
  }, [nodes, reactFlowInstance])

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <div style={{ width: '200px', padding: '10px', borderRight: '1px solid #ccc' }}>
        <div style={{ marginBottom: '10px' }}>
          <input
            type="text"
            value={newActivityName}
            onChange={e => setNewActivityName(e.target.value)}
            placeholder="Nueva actividad"
            style={{ width: '100%', marginBottom: '5px' }}
          />
          <button onClick={createActivity} style={{ width: '100%' }}>
            Crear
          </button>
        </div>

        <h3>Actividades</h3>
        {availableActivities.map(act => (
          <div
            key={act.id}
            style={{
              margin: '5px 0',
              padding: '5px',
              border: '1px solid #333',
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'center',
              backgroundColor: '#f0f0f0'
            }}
            onClick={() => addActivityToCanvas(act)}
          >
            {act.name}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, position: 'relative' }} ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodesWithGroupLabel}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          deleteKeyCode="Delete"
          onInit={setReactFlowInstance}
          fitView
        >
          <Background color="#aaa" gap={16} />
        </ReactFlow>
      </div>
    </div>
  )
}
