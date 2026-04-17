import { useState, useEffect } from 'react'
import { PlusSquare, MinusSquare, Braces, List } from 'lucide-react'

const JsonTreeNode = ({ label, value, depth = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(depth < 1)
  const isObject = value !== null && typeof value === 'object'
  const isArray = Array.isArray(value)

  const toggleExpand = (e) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  if (!isObject) {
    return (
      <div className="json-tree-node leaf">
        <span className="json-key">{label}:</span>
        <span className={`json-value ${typeof value}`}>
          {typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    )
  }

  return (
    <div className="json-tree-node branch">
      <div className="json-node-header" onClick={toggleExpand}>
        <span className="expand-icon">
          {isExpanded ? <MinusSquare size={14} /> : <PlusSquare size={14} />}
        </span>
        <span className="node-icon">
          {isArray ? <List size={14} /> : <Braces size={14} />}
        </span>
        <span className="json-key">{label}</span>
        <span className="node-summary">
          {isArray ? `[${value.length}]` : '{...}'}
        </span>
      </div>
      {isExpanded && (
        <div className="json-node-children">
          {Object.entries(value).map(([key, val]) => (
            <JsonTreeNode key={key} label={key} value={val} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default JsonTreeNode
