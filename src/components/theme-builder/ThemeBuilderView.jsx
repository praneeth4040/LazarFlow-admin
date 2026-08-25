import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Palette, Image as ImageIcon, Save, Play, Square, Circle,
  MousePointer2, FileJson, LayoutGrid, PlusSquare, MinusSquare,
  Braces, List, Eye, RefreshCcw, ChevronLeft, CheckCircle2, XCircle,
  Info, Users, Trophy, Upload,
} from 'lucide-react'
import { FONT_OPTIONS, EMPTY_MAPPING_CONFIG, DUMMY_TEAMS } from '../../constants/themeConstants'
import ClientPreviewOverlay from './ClientPreviewOverlay'
import GridGuideOverlay from './GridGuideOverlay'
import NormalModeOverlay from './NormalModeOverlay'
import JsonTreeNode from './JsonTreeNode'
const ThemeBuilderView = ({ addLog }) => {
  const [themeName, setThemeName] = useState('Default Theme')
  const [imageUrl, setImageUrl] = useState('https://xsxwzwcfaflzynsyryzq.supabase.co/storage/v1/object/public/themes/optimized/design1_base.png?')
  const [mappingConfig, setMappingConfig] = useState(JSON.stringify(EMPTY_MAPPING_CONFIG, null, 2))
  const [previewImage, setPreviewImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [imageError, setImageError] = useState(false)
  const [showJsonViewer, setShowJsonViewer] = useState(false)
  const [previewMode, setPreviewMode] = useState('image') // 'image' for picker, 'result' for rendered preview
  const [showLiveOverlay, setShowLiveOverlay] = useState(true)
  const [pendingThemes, setPendingThemes] = useState([])
  const [showPendingDropdown, setShowPendingDropdown] = useState(false)
  const [fetchingPending, setFetchingPending] = useState(false)
  
  // Upload Theme States
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadThemeName, setUploadThemeName] = useState('')
  const fileInputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState(null)
  
  // Update Config States
  const [selectedCellIdx, setSelectedCellIdx] = useState(0)
  const [selectedField, setSelectedField] = useState('team')
  const [tempFontSize, setTempFontSize] = useState(130)
  const [tempFontPath, setTempFontPath] = useState('Anton-Regular.ttf')
  const [tempColor, setTempColor] = useState('#ffffff')
  const CONFIG_FIELDS = ['rank', 'team', 'w', 'pp', 'kp', 'total', 'tournament_name']
  const FONT_OPTIONS = ['Anton-Regular.ttf', 'Roboto-Bold.ttf', 'Montserrat-Bold.ttf', 'BebasNeue-Regular.ttf']
  
  // Coordinate Picker States
  const [clickedCoord, setClickedCoord] = useState(null)
  const [selectionMode, setSelectionMode] = useState('point') // 'point', 'rect', 'circle'
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPos, setStartPos] = useState(null)
  const [currentPos, setCurrentPos] = useState(null)
  const imageRef = useRef(null)

  // Grid Mode States
  const GRID_FIELDS = ['rank', 'team', 'w', 'pp', 'kp', 'total']
  const [gridMode, setGridMode] = useState(false)
  const [gridStep, setGridStep] = useState('columns') // 'columns' | 'rows' | 'styles'
  const [gridActiveField, setGridActiveField] = useState('rank')
  const [columnX, setColumnX] = useState({ rank: null, team: null, w: null, pp: null, kp: null, total: null })
  const [rowYFirst, setRowYFirst] = useState(null)
  const [rowYLast, setRowYLast] = useState(null)
  const [rowYClickStep, setRowYClickStep] = useState('first') // 'first' | 'last'
  // Row range: apply grid only to rows gridRowStart..gridRowEnd (1-indexed, both inclusive)
  const [gridRowStart, setGridRowStart] = useState(1)
  const [gridRowEnd, setGridRowEnd] = useState(12)
  const [gridFieldStyles, setGridFieldStyles] = useState({
    rank:  { font_size: 130, font_path: 'Anton-Regular.ttf', color_hex: '#ffffff', alignment: 'center' },
    team:  { font_size: 130, font_path: 'Anton-Regular.ttf', color_hex: '#ffffff', alignment: 'left' },
    w:     { font_size: 130, font_path: 'Anton-Regular.ttf', color_hex: '#ffffff', alignment: 'center' },
    pp:    { font_size: 130, font_path: 'Anton-Regular.ttf', color_hex: '#ffffff', alignment: 'center' },
    kp:    { font_size: 130, font_path: 'Anton-Regular.ttf', color_hex: '#ffffff', alignment: 'center' },
    total: { font_size: 130, font_path: 'Anton-Regular.ttf', color_hex: '#ffffff', alignment: 'center' },
  })

  // ── Undo History for Normal Mode ─────────────────────────────────────────
  const [configHistory, setConfigHistory] = useState([])

  const pushHistory = (snapshot) => {
    setConfigHistory(prev => [...prev.slice(-29), snapshot]) // keep last 30 states
  }

  const handleUndo = () => {
    setConfigHistory(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setMappingConfig(last)
      addLog('info', `↩ Undo: restored previous config (${prev.length - 1} step${prev.length - 1 !== 1 ? 's' : ''} remaining)`)
      return prev.slice(0, -1)
    })
  }

  // Ctrl+Z shortcut — only fires when NOT focused on a text input/textarea
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // intentionally empty — handleUndo reads latest state via functional updater

  // ── Upload Theme Handler ────────────────────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    const previewUrl = URL.createObjectURL(file)
    setUploadPreviewUrl(previewUrl)
    if (!uploadThemeName) {
      const nameFromFile = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ')
      setUploadThemeName(nameFromFile)
    }
    addLog('info', `Selected file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`)
  }

  const handleLoadLocalTheme = () => {
    if (!selectedFile) {
      setStatus({ type: 'error', message: 'Please select an image file first' })
      return
    }
    if (!uploadThemeName.trim()) {
      setStatus({ type: 'error', message: 'Please enter a theme name' })
      return
    }

    // Just load the local file into the builder — NO upload yet
    const localUrl = URL.createObjectURL(selectedFile)
    setThemeName(uploadThemeName.trim())
    setImageUrl(localUrl)
    setMappingConfig(JSON.stringify(EMPTY_MAPPING_CONFIG, null, 2))
    setImageError(false)

    // Close upload panel but keep the file reference for later upload on Verify & Save
    setShowUploadPanel(false)
    addLog('info', `Loaded local theme "${uploadThemeName}" into builder. Configure the mapping, then click "Verify & Save" to upload.`)
    setStatus({ type: 'success', message: `Theme "${uploadThemeName}" loaded locally. Configure mapping, then click "Verify & Save" to upload to database.` })
  }

  const fetchPendingThemes = async () => {
    // Toggle the dropdown
    const willOpen = !showPendingDropdown;
    setShowPendingDropdown(willOpen);
    
    if (willOpen) {
      setFetchingPending(true)
      try {
        // Fetch themes to find those without config or empty config
        const { data, error } = await supabase
          .from('themes')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error
        
        // Filter themes that are truly "pending" (null config, or config missing cells)
        const pending = (data || []).filter(t => {
          if (!t.mapping_config) return true;
          const config = t.mapping_config;
          return !config.cells || config.cells.length === 0;
        })
        
        setPendingThemes(pending)
        addLog('info', `Fetched ${pending.length} pending themes out of ${data?.length || 0} total`)
      } catch (err) {
        console.error('Error fetching themes:', err)
        addLog('error', 'Failed to fetch themes', err.message)
      } finally {
        setFetchingPending(false)
      }
    }
  }

  // Fetch themes on component mount
  useEffect(() => {
    fetchPendingThemes()
  }, [])

  const handleSelectPendingTheme = (theme) => {
     setImageUrl(theme.url)
     setThemeName(theme.name || 'Default Theme')
     
     // Use existing config if it has cells, otherwise use empty template
     if (theme.mapping_config && theme.mapping_config.cells && theme.mapping_config.cells.length > 0) {
       setMappingConfig(JSON.stringify(theme.mapping_config, null, 2))
       addLog('info', `Loaded existing config for: ${theme.name || theme.url}`)
     } else {
       setMappingConfig(JSON.stringify(EMPTY_MAPPING_CONFIG, null, 2))
       addLog('info', `Loaded empty template for: ${theme.name || theme.url}`)
     }
     
     setShowPendingDropdown(false)
     setImageError(false)
   }

  const handleUpdateMappingConfig = () => {
    if (!clickedCoord) return
    // Snapshot current state before applying change (enables undo)
    pushHistory(mappingConfig)
    
    try {
      const config = JSON.parse(mappingConfig)
      if (!config.cells || !config.cells[selectedCellIdx]) {
        throw new Error(`Cell ${selectedCellIdx + 1} not found in config`)
      }

      const newX = clickedCoord.type && clickedCoord.type !== 'point' ? clickedCoord.centerX : clickedCoord.x
      const newY = clickedCoord.type && clickedCoord.type !== 'point' ? clickedCoord.centerY : clickedCoord.y
      
      const updatedConfig = { ...config }
      
      // Convert hex to [R, G, B]
      const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16)
        ] : [255, 255, 255];
      };
      const rgb = hexToRgb(tempColor);

      if (selectedField === 'tournament_name') {
        if (!updatedConfig.extra_fields) updatedConfig.extra_fields = {};
        updatedConfig.extra_fields.tournament_name = {
          ...updatedConfig.extra_fields.tournament_name,
          x: newX,
          y: newY,
          alignment: "center", // Forced center for tournament name
          font_size: tempFontSize,
          color_rgb: rgb,
          font_path: tempFontPath
        };
      } else {
        if (!updatedConfig.cells || !updatedConfig.cells[selectedCellIdx]) {
          throw new Error(`Cell ${selectedCellIdx + 1} not found in config`)
        }
        const currentCell = { ...updatedConfig.cells[selectedCellIdx] }
        currentCell[selectedField] = {
          ...currentCell[selectedField],
          x: newX,
          y: newY,
          alignment: selectedField === 'team' ? "left" : "center", // Auto-alignment based on field
          font_size: tempFontSize,
          color_rgb: rgb,
          font_path: tempFontPath
        }
        updatedConfig.cells[selectedCellIdx] = currentCell
      }
      
      const finalAlign = selectedField === 'tournament_name' || selectedField !== 'team' ? "center" : "left";
      
      setMappingConfig(JSON.stringify(updatedConfig, null, 2))
      addLog('success', `Updated ${selectedField === 'tournament_name' ? 'Extra' : 'Row ' + (selectedCellIdx + 1)} -> ${selectedField} to X:${newX}, Y:${newY}, Size:${tempFontSize}, Align:${finalAlign}`)
    } catch (e) {
      addLog('error', `Update failed: ${e.message}`)
      setStatus({ type: 'error', message: `Update failed: ${e.message}` })
    }
  }

  const handleFormatJson = () => {
    try {
      const obj = JSON.parse(mappingConfig)
      setMappingConfig(JSON.stringify(obj, null, 2))
      addLog('success', 'JSON formatted successfully')
    } catch (e) {
      addLog('error', 'Cannot format: Invalid JSON')
      setStatus({ type: 'error', message: 'Cannot format: Invalid JSON in editor' })
    }
  }

  const getRelativePos = (e) => {
    if (!imageRef.current) return null
    const rect = imageRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    // Scale to original image size
    const scaleX = imageRef.current.naturalWidth / rect.width
    const scaleY = imageRef.current.naturalHeight / rect.height
    
    return {
      x: Math.round(x * scaleX),
      y: Math.round(y * scaleY),
      screenX: x,
      screenY: y
    }
  }

  const handleMouseDown = (e) => {
    // â”€â”€ Grid Mode intercepts all clicks â”€â”€
    if (gridMode && (gridStep === 'columns' || gridStep === 'rows')) {
      const pos = getRelativePos(e)
      if (!pos) return

      if (gridStep === 'columns') {
        setColumnX(prev => ({ ...prev, [gridActiveField]: pos.x }))
        addLog('info', `Set ${gridActiveField.toUpperCase()} column X â†’ ${pos.x}`)
        const currentIdx = GRID_FIELDS.indexOf(gridActiveField)
        if (currentIdx < GRID_FIELDS.length - 1) {
          setGridActiveField(GRID_FIELDS[currentIdx + 1])
        } else {
          // All columns done â†’ move to rows step
          setGridStep('rows')
          setRowYClickStep('first')
          addLog('info', 'All columns set! Now click Row 1 on the image.')
        }
      } else if (gridStep === 'rows') {
        if (rowYClickStep === 'first') {
          setRowYFirst(pos.y)
          setRowYClickStep('last')
          addLog('info', `Set Row 1 Y â†’ ${pos.y}. Now click Row 12.`)
        } else {
          setRowYLast(pos.y)
          addLog('info', `Set Row 12 Y â†’ ${pos.y}. Move to Styles & Generate!`)
          setGridStep('styles')
        }
      }
      return
    }

    // â”€â”€ Normal mode â”€â”€
    if (selectionMode === 'point') {
      const pos = getRelativePos(e)
      if (pos) {
        setClickedCoord({ x: pos.x, y: pos.y, type: 'point' })
        addLog('info', `Picked coordinate: X:${pos.x}, Y:${pos.y}`)
      }
      return
    }

    const pos = getRelativePos(e)
    if (pos) {
      setIsDrawing(true)
      setStartPos(pos)
      setCurrentPos(pos)
    }
  }

  const handleMouseMove = (e) => {
    if (!isDrawing) return
    const pos = getRelativePos(e)
    if (pos) {
      setCurrentPos(pos)
    }
  }

  const handleMouseUp = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    
    if (startPos && currentPos) {
      const width = Math.abs(currentPos.x - startPos.x)
      const height = Math.abs(currentPos.y - startPos.y)
      const centerX = Math.round((startPos.x + currentPos.x) / 2)
      const centerY = Math.round((startPos.y + currentPos.y) / 2)
      
      const selectionInfo = {
        type: selectionMode,
        x: Math.min(startPos.x, currentPos.x),
        y: Math.min(startPos.y, currentPos.y),
        width,
        height,
        centerX,
        centerY
      }
      
      setClickedCoord(selectionInfo)
      addLog('info', `Area selected (${selectionMode}): X:${selectionInfo.x}, Y:${selectionInfo.y}, W:${width}, H:${height}, Center:${centerX},${centerY}`)
    }
  }

  const hexToRgbArray = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : [255, 255, 255]
  }

  const handleGenerateGridConfig = () => {
    const missingX = GRID_FIELDS.filter(f => columnX[f] === null)
    if (missingX.length > 0) {
      setStatus({ type: 'error', message: `Missing column X for: ${missingX.join(', ')}` })
      return
    }
    if (rowYFirst === null || rowYLast === null) {
      setStatus({ type: 'error', message: `Set both Row ${gridRowStart} and Row ${gridRowEnd} Y positions first.` })
      return
    }

    // Validate range
    const startIdx = gridRowStart - 1  // 0-indexed
    const endIdx   = gridRowEnd - 1    // 0-indexed
    const rangeLen = endIdx - startIdx + 1

    if (rangeLen < 2) {
      setStatus({ type: 'error', message: 'Row range must span at least 2 rows.' })
      return
    }

    // Y values evenly spaced only across the selected range
    const rowYValues = Array.from({ length: rangeLen }, (_, i) =>
      Math.round(rowYFirst + (rowYLast - rowYFirst) * (i / (rangeLen - 1)))
    )

    // Parse existing config to preserve cells outside the range
    let baseConfig
    try {
      baseConfig = JSON.parse(mappingConfig)
    } catch (_) {
      baseConfig = {}
    }

    // Ensure we have exactly 12 cells (preserve existing or create empty)
    const NUM_ROWS = 12
    const existingCells = baseConfig.cells && baseConfig.cells.length === NUM_ROWS
      ? baseConfig.cells
      : Array(NUM_ROWS).fill(null).map(() => ({}))

    // Merge: only overwrite cells in the chosen range
    const mergedCells = existingCells.map((existingCell, i) => {
      if (i < startIdx || i > endIdx) {
        // Outside range — keep exactly as-is
        return existingCell
      }
      // Inside range — fill with evenly-spaced grid values
      const y = rowYValues[i - startIdx]
      const cell = { ...existingCell }
      GRID_FIELDS.forEach(field => {
        const s = gridFieldStyles[field]
        cell[field] = {
          x: columnX[field],
          y,
          alignment: s.alignment,
          font_size: s.font_size,
          font_path: s.font_path,
          color_rgb: hexToRgbArray(s.color_hex),
        }
      })
      return cell
    })

    const merged = {
      ...baseConfig,
      cells: mergedCells,
      scoreboard: baseConfig.scoreboard || {
        color_rgb: [255, 255, 255],
        font_path: 'Anton-Regular.ttf',
        font_size: 130,
      },
      extra_fields: baseConfig.extra_fields || {
        tournament_name: {
          x: 0, y: 0, alignment: 'center',
          font_size: 200, color_rgb: [255, 255, 255],
          font_path: 'Anton-Regular.ttf'
        }
      }
    }

    const filledCount = rangeLen * GRID_FIELDS.length
    setMappingConfig(JSON.stringify(merged, null, 2))
    addLog('success', `Grid applied to rows ${gridRowStart}–${gridRowEnd} (${rangeLen} rows × ${GRID_FIELDS.length} fields = ${filledCount} entries). Rows outside range preserved.`)
    setStatus({ type: 'success', message: `✅ Grid applied to rows ${gridRowStart}–${gridRowEnd}. Rows outside range kept intact. Review JSON then click Verify & Save.` })
    // Exit grid mode
    setGridMode(false)
    setGridStep('columns')
    setGridActiveField('rank')
    setGridRowStart(1)
    setGridRowEnd(12)
  }

  const handleGeneratePreview = async () => {
    if (!imageUrl || !mappingConfig) {
      setStatus({ type: 'error', message: 'Image URL and Mapping Config are required' })
      return
    }

    setLoading(true)
    setStatus({ type: '', message: '' })
    setPreviewImage(null)

    try {
      const configToRender = JSON.parse(mappingConfig);
      
      // Clean up the config: remove fields that have x:0 and y:0
       if (configToRender.cells) {
         configToRender.cells = configToRender.cells.map(cell => {
           const cleanedCell = { ...cell };
           Object.keys(cleanedCell).forEach(field => {
             if (field !== 'id' && cleanedCell[field] && cleanedCell[field].x === 0 && cleanedCell[field].y === 0) {
               delete cleanedCell[field];
             }
           });
           return cleanedCell;
         });
       }
       
       if (configToRender.extra_fields) {
         Object.keys(configToRender.extra_fields).forEach(field => {
           if (configToRender.extra_fields[field].x === 0 && configToRender.extra_fields[field].y === 0) {
             delete configToRender.extra_fields[field];
           }
         });
       }

      const payload = {
        imageUrl: imageUrl,
        mappingConfig: configToRender
      }

      console.log('--- GENERATING PREVIEW ---')
      console.log('Payload:', payload)
      addLog('request', 'POST /api/render/preview-render', payload)

      const response = await fetch('http://localhost:10000/api/render/preview-render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'image/png'
        },
        body: JSON.stringify(payload),
      })

      console.log('Response Status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Preview error details:', errorText)
        throw new Error(`Server Error (${response.status}): ${errorText}`)
      }

      const blob = await response.blob()
      console.log('Blob size:', blob.size)
      const objectUrl = URL.createObjectURL(blob)
      setPreviewImage(objectUrl)
      setPreviewMode('result') // Automatically switch to result view
      addLog('success', 'Preview generated successfully')
    } catch (err) {
      console.error('Full catch error:', err)
      setStatus({ type: 'error', message: err.message })
      addLog('error', 'Preview failed', err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!imageUrl || !mappingConfig) {
      setStatus({ type: 'error', message: 'Image URL and Mapping Config are required to update' })
      return
    }

    setSaving(true)
    setStatus({ type: '', message: '' })

    const cleanConfig = (configObj) => {
      const cleaned = JSON.parse(JSON.stringify(configObj)); // Deep clone
      const Y_OFFSET = 25; // Adjusting 25px up for server alignment
      
      if (cleaned.cells) {
        cleaned.cells = cleaned.cells.map(cell => {
          const cleanedCell = { ...cell };
          Object.keys(cleanedCell).forEach(field => {
            if (field !== 'id' && cleanedCell[field] && (cleanedCell[field].x !== 0 || cleanedCell[field].y !== 0)) {
              // Apply Y offset for server-side vertical alignment
              cleanedCell[field].y = Math.max(0, cleanedCell[field].y - Y_OFFSET);
            } else if (field !== 'id' && cleanedCell[field] && cleanedCell[field].x === 0 && cleanedCell[field].y === 0) {
              delete cleanedCell[field];
            }
          });
          return cleanedCell;
        });
      }
      
      if (cleaned.extra_fields) {
        Object.keys(cleaned.extra_fields).forEach(field => {
          if (cleaned.extra_fields[field].x !== 0 || cleaned.extra_fields[field].y !== 0) {
            // Apply Y offset for extra fields as well
            cleaned.extra_fields[field].y = Math.max(0, cleaned.extra_fields[field].y - Y_OFFSET);
          } else {
            delete cleaned.extra_fields[field];
          }
        });
        // Remove extra_fields if it's now empty
        if (Object.keys(cleaned.extra_fields).length === 0) {
          delete cleaned.extra_fields;
        }
      }
      
      return cleaned;
    };

    try {
      let config;
      try {
        config = cleanConfig(JSON.parse(mappingConfig));
      } catch (e) {
        throw new Error('Invalid JSON in Mapping Config')
      }

      // Check if this is a locally uploaded theme (blob URL) that needs uploading first
      const isLocalFile = imageUrl.startsWith('blob:')

      if (isLocalFile && selectedFile) {
        // ── NEW THEME: Upload to storage, then insert into DB ──
        addLog('info', 'Uploading local theme to storage...')

        // 1. Upload file to Supabase Storage
        const fileExt = selectedFile.name.split('.').pop()
        const fileName = `${Date.now()}_${themeName.replace(/\s+/g, '_').toLowerCase()}.${fileExt}`
        const storagePath = `optimized/${fileName}`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('themes')
          .upload(storagePath, selectedFile, {
            contentType: selectedFile.type,
            upsert: false
          })

        if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

        // 2. Get the public URL
        const { data: { publicUrl } } = supabase.storage
          .from('themes')
          .getPublicUrl(storagePath)

        addLog('success', `Uploaded to storage: ${publicUrl}`)

        // 3. Insert into themes table with user_id: null and verified config
        const { data: themeData, error: dbError } = await supabase
          .from('themes')
          .insert({
            name: themeName.trim(),
            url: publicUrl,
            user_id: null,
            status: 'verified',
            mapping_config: config,
          })
          .select()

        if (dbError) throw new Error(`Database insert failed: ${dbError.message}`)

        // 4. Update the builder to use the real URL now
        setImageUrl(publicUrl)

        // 5. Clean up local file references
        setSelectedFile(null)
        setUploadPreviewUrl(null)
        setUploadThemeName('')
        if (fileInputRef.current) fileInputRef.current.value = ''

        setStatus({ type: 'success', message: `Theme "${themeName}" uploaded & saved with verified config!` })
        addLog('success', `Theme "${themeName}" uploaded to storage & saved to DB (user_id: null, status: verified)`, themeData)

      } else {
        // ── EXISTING THEME: Update config by matching URL ──
        const { data, error } = await supabase
          .from('themes')
          .update({
            mapping_config: config,
            status: 'verified',
            updated_at: new Date().toISOString()
          })
          .eq('url', imageUrl)
          .select()

        if (error) throw error

        if (!data || data.length === 0) {
          throw new Error('No theme found with this Image URL. Make sure the URL matches exactly.')
        }

        setStatus({ type: 'success', message: 'Theme config updated successfully!' })
        addLog('success', 'Theme updated in database', data)
      }
      
    } catch (err) {
      console.error('Update error:', err)
      setStatus({ type: 'error', message: err.message })
      addLog('error', 'Update failed', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="theme-builder">
      <div className="section-header">
        <div className="header-title-group">
          <h2><Palette size={20} /> Theme Builder</h2>
          <p className="subtitle">Design and verify custom leaderboard themes</p>
        </div>
        
        <div className="header-actions-group">          
          <button
            type="button"
            className={`upload-theme-btn ${showUploadPanel ? 'active' : ''}`}
            onClick={() => setShowUploadPanel(!showUploadPanel)}
            title="Upload a theme image from your local machine"
          >
            <Upload size={16} />
            Upload Theme
          </button>
          <button
            type="button"
            className={`grid-mode-btn ${gridMode ? 'active' : ''}`}
            onClick={() => {
              const entering = !gridMode
              setGridMode(entering)
              if (entering) {
                // â”€â”€ Pre-populate from existing config if available â”€â”€
                let newColX = { rank: null, team: null, w: null, pp: null, kp: null, total: null }
                let newRowYFirst = null
                let newRowYLast = null
                let newStyles = { ...gridFieldStyles }
                let hasExisting = false

                try {
                  const config = JSON.parse(mappingConfig)
                  if (config.cells && config.cells.length > 0) {
                    const first = config.cells[0]
                    const last = config.cells[config.cells.length - 1]
                    const rgb2hex = (rgb) => rgb ? '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('') : '#ffffff'

                    GRID_FIELDS.forEach(field => {
                      if (first[field] && (first[field].x !== 0 || first[field].y !== 0)) {
                        newColX[field] = first[field].x
                        newStyles[field] = {
                          font_size: first[field].font_size || 130,
                          font_path: first[field].font_path || 'Anton-Regular.ttf',
                          color_hex: rgb2hex(first[field].color_rgb),
                          alignment: first[field].alignment || 'center',
                        }
                        hasExisting = true
                      }
                    })

                    const ff = GRID_FIELDS.find(f => first[f] && first[f].y !== 0)
                    const lf = GRID_FIELDS.find(f => last[f] && last[f].y !== 0)
                    if (ff) newRowYFirst = first[ff].y
                    if (lf) newRowYLast = last[lf].y
                  }
                } catch (_) {}

                setColumnX(newColX)
                setRowYFirst(newRowYFirst)
                setRowYLast(newRowYLast)
                setGridFieldStyles(newStyles)
                setGridStep('columns')
                // Point active field to first un-set column, or rank if all set
                setGridActiveField(GRID_FIELDS.find(f => newColX[f] === null) || 'rank')
                setRowYClickStep(newRowYFirst === null ? 'first' : 'last')
                setPreviewMode('image')

                if (hasExisting) {
                  addLog('info', 'âš¡ Grid Mode â€” existing config pre-loaded. Click chips to adjust, then re-generate.')
                } else {
                  addLog('info', 'âš¡ Grid Mode started â€” click each column on the image.')
                }
              }
            }}
            title="âš¡ Smart Grid Mode: set all 72 entries in ~8 clicks"
          >
            <LayoutGrid size={16} />
            {gridMode ? 'Exit Grid Mode' : 'âš¡ Grid Mode'}
          </button>
          <div className="pending-themes-container">
            <button 
              type="button"
              className={`pending-themes-btn ${showPendingDropdown ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                fetchPendingThemes();
              }}
              disabled={fetchingPending}
              title="View themes with missing configuration"
            >
              {fetchingPending ? <RefreshCcw size={16} className="spin" /> : <List size={16} />}
              Pending Themes
              {pendingThemes.length > 0 && <span className="pending-count">{pendingThemes.length}</span>}
            </button>
            
            {showPendingDropdown && (
              <div className="pending-dropdown">
                <div className="dropdown-header">
                  <span>Pending Themes</span>
                  <button onClick={() => setShowPendingDropdown(false)}><XCircle size={14} /></button>
                </div>
                <div className="dropdown-list">
                  {pendingThemes.length === 0 ? (
                    <div className="dropdown-empty">No pending themes found</div>
                  ) : (
                    pendingThemes.map(theme => (
                      <div 
                        key={theme.id} 
                        className="dropdown-item"
                        onClick={() => handleSelectPendingTheme(theme)}
                      >
                        <div className="item-info">
                          <span className="item-name">{theme.name || 'Unnamed Theme'}</span>
                          <span className="item-url">{theme.url}</span>
                        </div>
                        <ChevronLeft size={14} className="item-arrow" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Upload Theme Panel ── */}
      {showUploadPanel && (
        <div className="upload-panel">
          <div className="upload-panel-header">
            <h3><Upload size={18} /> Upload Local Theme</h3>
            <button className="upload-panel-close" onClick={() => setShowUploadPanel(false)}>
              <XCircle size={18} />
            </button>
          </div>
          <p className="upload-description">
            Select a theme image from your local machine to load into the builder. Configure the mapping 
            config with demo data, then click <code>Verify & Save</code> to upload to storage and save 
            to the database with <code>user_id: null</code>.
          </p>
          
          <div className="upload-form-row">
            <div className="upload-name-group">
              <label className="form-label">Theme Name</label>
              <input
                type="text"
                className="builder-input"
                placeholder="e.g. Neon Galaxy Theme"
                value={uploadThemeName}
                onChange={(e) => setUploadThemeName(e.target.value)}
              />
            </div>
            <div className="upload-file-group">
              <label className="form-label">Theme Image</label>
              <div className="upload-dropzone" onClick={() => fileInputRef.current?.click()}>
                {selectedFile ? (
                  <div className="upload-file-info">
                    <CheckCircle2 size={16} />
                    <span>{selectedFile.name}</span>
                    <span className="upload-file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <Upload size={20} />
                    <span>Click to select image</span>
                    <span className="upload-formats">PNG, JPG, WebP</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          </div>

          {uploadPreviewUrl && (
            <div className="upload-preview-container">
              <img src={uploadPreviewUrl} alt="Upload preview" className="upload-preview-img" />
            </div>
          )}

          <div className="upload-actions">
            <button
              className="upload-submit-btn"
              onClick={handleLoadLocalTheme}
              disabled={!selectedFile || !uploadThemeName.trim()}
            >
              <ImageIcon size={16} />
              Load into Builder
            </button>
            <button
              className="upload-cancel-btn"
              onClick={() => {
                setShowUploadPanel(false)
                setSelectedFile(null)
                setUploadPreviewUrl(null)
                setUploadThemeName('')
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="builder-container">

        {/* â”€â”€ Grid Mode Wizard â”€â”€ */}
        {gridMode ? (
          <div className="builder-form grid-wizard">

            {/* Step indicator */}
            <div className="grid-steps-indicator">
              <div className={`grid-step-pill ${gridStep === 'columns' ? 'active' : 'done'}`}>
                <span className="step-num">1</span> Columns
              </div>
              <div className="step-arrow">â†’</div>
              <div className={`grid-step-pill ${gridStep === 'rows' ? 'active' : gridStep === 'styles' ? 'done' : ''}`}>
                <span className="step-num">2</span> Rows
              </div>
              <div className="step-arrow">â†’</div>
              <div className={`grid-step-pill ${gridStep === 'styles' ? 'active' : ''}`}>
                <span className="step-num">3</span> Styles
              </div>
            </div>

            {/* â”€â”€ Step 1: Columns â”€â”€ */}
            {gridStep === 'columns' && (
              <div className="grid-step-content">
                <div className="grid-instruction">
                  <span className="instruction-icon">ðŸ‘†</span>
                  <div>
                    <strong>Click on the image</strong> where the
                    <span className="highlight-field"> {gridActiveField.toUpperCase()} </span>
                    column is. Auto-advances to next field.
                  </div>
                </div>

                <div className="grid-field-chips">
                  {GRID_FIELDS.map(field => (
                    <button
                      key={field}
                      className={`field-chip ${
                        gridActiveField === field ? 'active' :
                        columnX[field] !== null ? 'done' : ''
                      }`}
                      onClick={() => setGridActiveField(field)}
                      title={`Click to re-select ${field}`}
                    >
                      {columnX[field] !== null ? 'âœ“ ' : ''}{field.toUpperCase()}
                      {columnX[field] !== null && (
                        <span className="chip-x">x={columnX[field]}</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="grid-progress-bar">
                  <div
                    className="grid-progress-fill"
                    style={{ width: `${(GRID_FIELDS.filter(f => columnX[f] !== null).length / GRID_FIELDS.length) * 100}%` }}
                  />
                  <span>{GRID_FIELDS.filter(f => columnX[f] !== null).length} / {GRID_FIELDS.length} columns set</span>
                </div>

                {GRID_FIELDS.every(f => columnX[f] !== null) && (
                  <button className="grid-next-btn" onClick={() => { setGridStep('rows'); setRowYClickStep('first') }}>
                    Next: Set Rows →
                  </button>
                )}
              </div>
            )}

            {/* ── Step 2: Rows ── */}
            {gridStep === 'rows' && (
              <div className="grid-step-content">

                {/* Row Range Selector */}
                <div className="grid-range-selector">
                  <span className="range-label">Apply grid to rows:</span>
                  <div className="range-inputs">
                    <label>From row</label>
                    <input
                      type="number"
                      min={1}
                      max={gridRowEnd - 1}
                      value={gridRowStart}
                      onChange={e => {
                        const v = Math.max(1, Math.min(parseInt(e.target.value) || 1, gridRowEnd - 1))
                        setGridRowStart(v)
                        setRowYFirst(null)
                        setRowYLast(null)
                        setRowYClickStep('first')
                      }}
                      className="range-number-input"
                    />
                    <label>to row</label>
                    <input
                      type="number"
                      min={gridRowStart + 1}
                      max={12}
                      value={gridRowEnd}
                      onChange={e => {
                        const v = Math.min(12, Math.max(parseInt(e.target.value) || 12, gridRowStart + 1))
                        setGridRowEnd(v)
                        setRowYFirst(null)
                        setRowYLast(null)
                        setRowYClickStep('first')
                      }}
                      className="range-number-input"
                    />
                    <span className="range-hint">
                      {gridRowStart === 1 && gridRowEnd === 12
                        ? '(all rows)'
                        : `(${gridRowEnd - gridRowStart + 1} rows — rows outside range kept as-is)`}
                    </span>
                  </div>
                </div>

                <div className="grid-instruction">
                  <span className="instruction-icon">👆</span>
                  <div>
                    <strong>Click on the image</strong> at the vertical center of
                    <span className="highlight-field"> {rowYClickStep === 'first' ? `ROW ${gridRowStart} (first in range)` : `ROW ${gridRowEnd} (last in range)`}</span>.
                    Y for all rows in between will be auto-spaced.
                  </div>
                </div>

                <div className="grid-row-status">
                  <div className={`row-status-item ${rowYFirst !== null ? 'done' : rowYClickStep === 'first' ? 'active' : ''}`}>
                    <span className="row-label">Row {gridRowStart} {gridRowStart === 1 ? '(top)' : '(range start)'}</span>
                    <span className="row-value">{rowYFirst !== null ? `Y = ${rowYFirst}` : 'click image ↗'}</span>
                  </div>
                  <div className="row-spacer">
                    ⋮ {gridRowEnd - gridRowStart - 1} rows auto-spaced ⋮
                  </div>
                  <div className={`row-status-item ${rowYLast !== null ? 'done' : rowYClickStep === 'last' ? 'active' : ''}`}>
                    <span className="row-label">Row {gridRowEnd} {gridRowEnd === 12 ? '(bottom)' : '(range end)'}</span>
                    <span className="row-value">{rowYLast !== null ? `Y = ${rowYLast}` : 'click image ↗'}</span>
                  </div>
                </div>

                <div className="grid-nav-actions">
                  <button className="grid-back-btn" onClick={() => setGridStep('columns')}>← Back</button>
                  {rowYFirst !== null && rowYLast !== null && (
                    <button className="grid-next-btn" onClick={() => setGridStep('styles')}>Next: Styles →</button>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 3: Styles & Generate ── */}
            {gridStep === 'styles' && (
              <div className="grid-step-content">
                <div className="grid-instruction">
                  <span className="instruction-icon">🎨</span>
                  <div><strong>Set font, size & color</strong> once per column — applies to rows {gridRowStart}–{gridRowEnd} ({gridRowEnd - gridRowStart + 1} rows) automatically.</div>
                </div>

                <div className="grid-styles-table">
                  <div className="styles-row-header">
                    <span>Field</span><span>Font</span><span>Size</span><span>Color</span>
                  </div>
                  {GRID_FIELDS.map(field => (
                    <div key={field} className="styles-row">
                      <span className="field-label-cell">{field.toUpperCase()}</span>
                      <select
                        value={gridFieldStyles[field].font_path}
                        onChange={e => setGridFieldStyles(prev => ({ ...prev, [field]: { ...prev[field], font_path: e.target.value } }))}
                        className="coord-selector"
                      >
                        {FONT_OPTIONS.map(f => <option key={f} value={f}>{f.split('-')[0]}</option>)}
                      </select>
                      <input
                        type="number"
                        value={gridFieldStyles[field].font_size}
                        onChange={e => setGridFieldStyles(prev => ({ ...prev, [field]: { ...prev[field], font_size: parseInt(e.target.value) } }))}
                        className="coord-selector"
                        style={{ width: '65px' }}
                      />
                      <input
                        type="color"
                        value={gridFieldStyles[field].color_hex}
                        onChange={e => setGridFieldStyles(prev => ({ ...prev, [field]: { ...prev[field], color_hex: e.target.value } }))}
                        className="grid-color-input"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid-summary-box">
                  <div className="summary-line">ðŸ“ Rows: Y={rowYFirst} (row 1) â†’ Y={rowYLast} (row 12), evenly spaced</div>
                  <div className="summary-line">ðŸ“Š Columns: {GRID_FIELDS.map(f => `${f.toUpperCase()}@x=${columnX[f]}`).join(' Â· ')}</div>
                  <div className="summary-line">âš¡ Will generate <strong>72 entries</strong> (12 rows Ã— 6 fields)</div>
                </div>

                <div className="grid-nav-actions">
                  <button className="grid-back-btn" onClick={() => setGridStep('rows')}>â† Back</button>
                  <button className="grid-generate-btn" onClick={handleGenerateGridConfig}>
                    <LayoutGrid size={16} /> Generate Config
                  </button>
                </div>
              </div>
            )}

            {/* Always show theme name + image URL even in grid mode */}
            <div className="grid-mode-meta">
              <div className="form-section">
                <label className="form-label">Theme Name</label>
                <input type="text" value={themeName} onChange={e => setThemeName(e.target.value)} className="builder-input" />
              </div>
              <div className="form-section">
                <label className="form-label">Background Image URL</label>
                <div className="input-with-icon">
                  <ImageIcon size={16} className="input-icon" />
                  <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="builder-input" placeholder="https://..." />
                </div>
              </div>
            </div>
          </div>

        ) : (

        /* â”€â”€ Normal Form â”€â”€ */
        <div className="builder-form">
          <div className="form-section">
            <label className="form-label">Theme Name</label>
            <input
              type="text"
              placeholder="e.g. Modern Dark Tournament"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              className="builder-input"
            />
          </div>

          <div className="form-section">
            <label className="form-label">Background Image URL</label>
            <div className="input-with-icon">
              <ImageIcon size={16} className="input-icon" />
              <input
                type="text"
                placeholder="https://example.com/theme.png"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="builder-input"
              />
            </div>
          </div>

          <div className="form-section">
            <div className="label-with-actions">
              <label className="form-label">Mapping Config (JSON)</label>
              <div className="json-actions">
                <button 
                  className={`json-view-toggle ${!showJsonViewer ? 'active' : ''}`}
                  onClick={() => setShowJsonViewer(false)}
                  title="Editor Mode"
                >
                  Edit
                </button>
                <button 
                  className={`json-view-toggle ${showJsonViewer ? 'active' : ''}`}
                  onClick={() => setShowJsonViewer(true)}
                  title="Viewer Mode"
                >
                  <FileJson size={14} /> View
                </button>
                <button 
                  className="json-action-btn"
                  onClick={handleFormatJson}
                  title="Auto Format JSON"
                >
                  <LayoutGrid size={14} /> Format
                </button>
              </div>
            </div>

            {showJsonViewer ? (
              <div className="json-viewer-container">
                {(() => {
                  try {
                    const parsed = JSON.parse(mappingConfig);
                    return (
                      <div className="json-tree-root">
                        <JsonTreeNode label="JSON" value={parsed} />
                      </div>
                    );
                  } catch (e) {
                    return (
                      <div className="json-error">
                        <XCircle size={16} />
                        <span>Invalid JSON - please switch back to edit mode to fix it.</span>
                      </div>
                    );
                  }
                })()}
              </div>
            ) : (
              <textarea
                placeholder="Enter JSON mapping config..."
                value={mappingConfig}
                onChange={(e) => setMappingConfig(e.target.value)}
                className="builder-textarea large-editor"
                rows="35"
              ></textarea>
            )}
          </div>

          {status.message && (
            <div className={`notification-status ${status.type}`}>
              {status.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <div className="status-content">{status.message}</div>
            </div>
          )}

          <div className="builder-actions">
            {imageUrl.startsWith('blob:') && selectedFile && (
              <div className="local-file-banner">
                <Upload size={14} />
                <span>Local file loaded — <strong>Verify &amp; Save</strong> will upload to storage &amp; save to DB</span>
              </div>
            )}
            <div className="builder-action-btns">
              <button 
                className="preview-btn" 
                onClick={handleGeneratePreview}
                disabled={loading || imageUrl.startsWith('blob:')}
                title={imageUrl.startsWith('blob:') ? 'Preview requires a hosted image URL — save first' : ''}
              >
                {loading ? <RefreshCcw size={18} className="spin" /> : <Play size={18} />}
                Generate Live Preview
              </button>
              <button 
                className={`save-btn ${imageUrl.startsWith('blob:') && selectedFile ? 'save-btn-upload' : ''}`}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <RefreshCcw size={18} className="spin" /> : <Save size={18} />}
                {imageUrl.startsWith('blob:') && selectedFile ? 'Upload & Save to DB' : 'Verify & Save'}
              </button>
            </div>
          </div>
        </div>
        )}

        <div className="builder-preview">
          <div className="preview-header-with-toggle">
            <h3>Live Preview</h3>
            <div className="preview-mode-toggle">
              <button 
                className={`mode-toggle-btn ${previewMode === 'image' ? 'active' : ''}`}
                onClick={() => setPreviewMode('image')}
              >
                <ImageIcon size={14} /> Background / Picker
              </button>
              <button 
                className={`mode-toggle-btn ${previewMode === 'client' ? 'active' : ''}`}
                onClick={() => setPreviewMode('client')}
              >
                <Eye size={14} /> Client Preview
              </button>
              <button 
                className={`mode-toggle-btn ${previewMode === 'result' ? 'active' : ''}`}
                onClick={() => setPreviewMode('result')}
                disabled={!previewImage}
              >
                <Play size={14} /> Server Result
              </button>
            </div>
          </div>
          
          {previewMode === 'image' && (
            <>
              <div className="selection-toolbar">
                <button 
                  className={`toolbar-btn ${selectionMode === 'point' ? 'active' : ''}`}
                  onClick={() => setSelectionMode('point')}
                  title="Pick Point"
                >
                  <MousePointer2 size={16} /> Point
                </button>
                <button 
                  className={`toolbar-btn ${selectionMode === 'rect' ? 'active' : ''}`}
                  onClick={() => setSelectionMode('rect')}
                  title="Draw Rectangle"
                >
                  <Square size={16} /> Rectangle
                </button>
                <button 
                  className={`toolbar-btn ${selectionMode === 'circle' ? 'active' : ''}`}
                  onClick={() => setSelectionMode('circle')}
                  title="Draw Circle"
                >
                  <Circle size={16} /> Circle
                </button>
                
                <div className="toolbar-divider" />
                
                <button 
                  className={`toolbar-btn overlay-toggle ${showLiveOverlay ? 'active' : ''}`}
                  onClick={() => setShowLiveOverlay(!showLiveOverlay)}
                  title="Toggle Instant Visibility"
                >
                  <Eye size={16} /> {showLiveOverlay ? 'Overlay: ON' : 'Overlay: OFF'}
                </button>
              </div>

              {clickedCoord && (
                <div className="coordinate-display">
                  <div className="coord-info">
                    {clickedCoord.type && clickedCoord.type !== 'point' ? (
                      <div className="shape-info">
                        <span><strong>{clickedCoord.type.toUpperCase()}</strong> Area:</span>
                        <span>X: {clickedCoord.x}, Y: {clickedCoord.y}</span>
                        <span>W: {clickedCoord.width}, H: {clickedCoord.height}</span>
                        <span>Center: <strong>{clickedCoord.centerX}, {clickedCoord.centerY}</strong></span>
                      </div>
                    ) : (
                      <span>Last Click: <strong>X: {clickedCoord.x}, Y: {clickedCoord.y}</strong></span>
                    )}
                  </div>

                  <div className="coord-implement-section">
                    <div className="selector-group">
                      {selectedField !== 'tournament_name' && (
                        <select 
                          value={selectedCellIdx} 
                          onChange={(e) => {
                            const newIdx = parseInt(e.target.value);
                            setSelectedCellIdx(newIdx);
                            // Auto-load current settings for this field
                            try {
                              const config = JSON.parse(mappingConfig);
                              const cell = config.cells?.[newIdx];
                              const fieldData = cell?.[selectedField];
                              if (fieldData) {
                                if (fieldData.font_size) setTempFontSize(fieldData.font_size);
                                if (fieldData.alignment) setTempAlignment(fieldData.alignment);
                                if (fieldData.color_rgb) {
                                  const hex = '#' + fieldData.color_rgb.map(x => x.toString(16).padStart(2, '0')).join('');
                                  setTempColor(hex);
                                }
                              }
                            } catch (e) {}
                          }}
                          className="coord-selector"
                          title="Select Row"
                        >
                          {(() => {
                            try {
                              const config = JSON.parse(mappingConfig);
                              const cells = config.cells || [];
                              return cells.map((_, idx) => (
                                <option key={idx} value={idx}>Row {idx + 1}</option>
                              ));
                            } catch (e) {
                              return <option value={0}>Row 1</option>;
                            }
                          })()}
                        </select>
                      )}
                      <select 
                        value={selectedField} 
                        onChange={(e) => {
                          const newField = e.target.value;
                          setSelectedField(newField);
                          // Auto-load current settings for this field
                          try {
                            const config = JSON.parse(mappingConfig);
                            let fieldData;
                            if (newField === 'tournament_name') {
                              fieldData = config.extra_fields?.tournament_name;
                            } else {
                              fieldData = config.cells?.[selectedCellIdx]?.[newField];
                            }
                            
                            if (fieldData) {
                              if (fieldData.font_size) setTempFontSize(fieldData.font_size);
                              if (fieldData.font_path) setTempFontPath(fieldData.font_path);
                              if (fieldData.color_rgb) {
                                const hex = '#' + fieldData.color_rgb.map(x => x.toString(16).padStart(2, '0')).join('');
                                setTempColor(hex);
                              }
                            }
                          } catch (e) {}
                        }}
                        className="coord-selector"
                        title="Select Field"
                      >
                        {CONFIG_FIELDS.map(field => (
                          <option key={field} value={field}>{field.toUpperCase()}</option>
                        ))}
                      </select>
                      <select 
                        value={tempFontPath} 
                        onChange={(e) => setTempFontPath(e.target.value)}
                        className="coord-selector"
                        title="Select Font"
                      >
                        {FONT_OPTIONS.map(font => (
                          <option key={font} value={font}>{font.split('-')[0]}</option>
                        ))}
                      </select>
                      <input 
                          type="number" 
                          value={tempFontSize} 
                          onChange={(e) => setTempFontSize(parseInt(e.target.value))}
                          className="coord-selector font-size-input"
                          style={{ width: '70px' }}
                          title="Font Size for this field (px)"
                        />
                        <div className="color-picker-container" title="Pick Color">
                          <div 
                            className="color-preview" 
                            style={{ backgroundColor: tempColor }}
                            onClick={() => document.getElementById('hidden-color-picker').click()}
                          >
                            <Palette size={14} style={{ color: tempColor === '#ffffff' ? '#000' : '#fff' }} />
                          </div>
                          <input 
                            id="hidden-color-picker"
                            type="color" 
                            value={tempColor} 
                            onChange={(e) => setTempColor(e.target.value)}
                            className="hidden-color-input"
                          />
                        </div>
                      </div>
                      <div className="implement-btn-group">
                        <button className="implement-btn" onClick={handleUpdateMappingConfig}>
                          <Save size={14} /> Update Config
                        </button>
                        <button
                          className={`undo-coord-btn ${configHistory.length === 0 ? 'disabled' : ''}`}
                          onClick={handleUndo}
                          disabled={configHistory.length === 0}
                          title={configHistory.length > 0 ? `Undo last apply (Ctrl+Z) — ${configHistory.length} step${configHistory.length !== 1 ? 's' : ''} available` : 'Nothing to undo'}
                        >
                          ↩ Undo
                          {configHistory.length > 0 && (
                            <span className="undo-count">{configHistory.length}</span>
                          )}
                        </button>
                      </div>
                  </div>

                  <div className="coord-actions">
                    <button className="copy-coord-btn" onClick={() => {
                      const textToCopy = clickedCoord.type && clickedCoord.type !== 'point'
                        ? `"x": ${clickedCoord.centerX}, "y": ${clickedCoord.centerY}, "width": ${clickedCoord.width}, "height": ${clickedCoord.height}`
                        : `"x": ${clickedCoord.x}, "y": ${clickedCoord.y}`;
                      navigator.clipboard.writeText(textToCopy)
                      addLog('info', 'Coordinates copied to clipboard')
                    }}>
                      Copy JSON
                    </button>
                    <button className="clear-coord-btn" onClick={() => {
                      setClickedCoord(null)
                      setStartPos(null)
                      setCurrentPos(null)
                    }}>
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div 
            className="image-preview-area"
            onMouseMove={previewMode === 'image' ? handleMouseMove : undefined}
            onMouseUp={previewMode === 'image' ? handleMouseUp : undefined}
            onMouseLeave={() => setIsDrawing(false)}
          >
            {previewMode === 'result' && previewImage ? (
              <img src={previewImage} alt="Theme Preview" className="preview-rendered-img" />
            ) : (imageUrl && !imageError) ? (
              <div className="preview-relative-container" style={{ position: 'relative', display: 'inline-block' }}>
                <img 
                  ref={imageRef}
                  src={imageUrl} 
                  alt="Background Preview" 
                  className={`preview-rendered-img raw-bg ${previewMode === 'image' ? (selectionMode !== 'point' ? 'drawing-active' : 'picker-active') : ''}`} 
                  onMouseDown={previewMode === 'image' ? handleMouseDown : undefined}
                  draggable="false"
                  onError={() => {
                    setImageError(true)
                    addLog('error', 'Failed to load background image from URL', imageUrl)
                  }}
                />
                
                {/* Client-Side Preview Overlay */}
                {((previewMode === 'image' && showLiveOverlay) || previewMode === 'client') && (
                    <ClientPreviewOverlay 
                    config={(() => {
                      try {
                        return JSON.parse(mappingConfig);
                      } catch (e) {
                        return null;
                      }
                    })()} 
                    imageRef={imageRef}
                    imageUrl={imageUrl}
                    selectedCellIdx={selectedCellIdx}
                  />
                )}

                {/* âš¡ Grid Guide Lines â€” Canva-style alignment overlay */}
                {gridMode && (
                  <GridGuideOverlay
                    imageRef={imageRef}
                    imageUrl={imageUrl}
                    columnX={columnX}
                    rowYFirst={rowYFirst}
                    rowYLast={rowYLast}
                  />
                )}
                
                {/* Normal Mode: Canva-style crosshair and placed-point dots */}
                {!gridMode && previewMode === 'image' && selectionMode === 'point' && (
                  <NormalModeOverlay
                    imageRef={imageRef}
                    imageUrl={imageUrl}
                    clickedCoord={clickedCoord}
                    mappingConfig={mappingConfig}
                  />
                )}
{/* Drawing Overlay */}
                {previewMode === 'image' && isDrawing && startPos && currentPos && (
                  <div 
                    className={`selection-overlay ${selectionMode}`}
                    style={{
                      position: 'absolute',
                      left: Math.min(startPos.screenX, currentPos.screenX),
                      top: Math.min(startPos.screenY, currentPos.screenY),
                      width: Math.abs(currentPos.screenX - startPos.screenX),
                      height: Math.abs(currentPos.screenY - startPos.screenY),
                      pointerEvents: 'none',
                      border: '2px solid var(--primary)',
                      background: 'rgba(99, 102, 241, 0.2)',
                      borderRadius: selectionMode === 'circle' ? '50%' : '4px'
                    }}
                  />
                )}
                
                {/* Persistent Selection Highlight */}
                {previewMode === 'image' && !isDrawing && clickedCoord && imageRef.current && (
                  clickedCoord.type === 'point' ? (
                    <div 
                      className="selection-highlight point"
                      style={{
                        position: 'absolute',
                        left: (clickedCoord.x / imageRef.current.naturalWidth) * imageRef.current.clientWidth,
                        top: (clickedCoord.y / imageRef.current.naturalHeight) * imageRef.current.clientHeight,
                        width: '12px',
                        height: '12px',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                        border: '2px solid #ffeb3b',
                        borderRadius: '50%',
                        background: 'rgba(255, 235, 59, 0.5)',
                        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
                        zIndex: 20
                      }}
                    >
                      {/* Crosshair lines for the point */}
                      <div style={{ position: 'absolute', top: '50%', left: '-5px', width: '22px', height: '1px', background: '#ffeb3b', transform: 'translateY(-50%)' }} />
                      <div style={{ position: 'absolute', left: '50%', top: '-5px', width: '1px', height: '22px', background: '#ffeb3b', transform: 'translateX(-50%)' }} />
                    </div>
                  ) : (
                    <div 
                      className={`selection-highlight ${clickedCoord.type}`}
                      style={{
                        position: 'absolute',
                        left: (clickedCoord.x / imageRef.current.naturalWidth) * imageRef.current.clientWidth,
                        top: (clickedCoord.y / imageRef.current.naturalHeight) * imageRef.current.clientHeight,
                        width: (clickedCoord.width / imageRef.current.naturalWidth) * imageRef.current.clientWidth,
                        height: (clickedCoord.height / imageRef.current.naturalHeight) * imageRef.current.clientHeight,
                        pointerEvents: 'none',
                        border: '2px dashed var(--primary)',
                        background: 'rgba(99, 102, 241, 0.1)',
                        borderRadius: clickedCoord.type === 'circle' ? '50%' : '4px'
                      }}
                    />
                  )
                )}
              </div>
            ) : (
              <div className="preview-placeholder">
                <ImageIcon size={48} />
                <p>{imageError ? 'Invalid Image URL or Access Denied' : 'Enter an image URL and click "Generate Live Preview"'}</p>
              </div>
            )}
          </div>
          <div className="preview-hint">
            <Info size={14} /> 
            {previewMode === 'result' ? 'Showing rendered preview with dummy data.' : 
             selectionMode === 'point' ? 'Interactive Mode: Click anywhere on the background image to get X and Y coordinates.' :
             `Interactive Mode: Click and drag on the image to draw a ${selectionMode}.`}
          </div>
        </div>
      </div>
    </div>
  )
}


export default ThemeBuilderView
