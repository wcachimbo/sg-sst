import { useEffect, useRef } from 'react'
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import UniverPresetSheetsCoreEsES from '@univerjs/preset-sheets-core/locales/es-ES'
import '@univerjs/preset-sheets-core/lib/index.css'

function columnName(index) {
  let name = ''
  let value = index + 1
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

export default function UniverSheetEditor({ onReady, initialHeaders = true, initialWorkbook = null, initialSheets = null }) {
  const hostRef = useRef(null)

  useEffect(() => {
    if (!hostRef.current) return undefined
    let instance
    try {
      instance = createUniver({
        locale: LocaleType.ES_ES,
        locales: { [LocaleType.ES_ES]: mergeLocales(UniverPresetSheetsCoreEsES) },
        presets: [UniverSheetsCorePreset({ container: hostRef.current })],
      })
      const workbook = instance.univerAPI.createWorkbook(initialWorkbook || {})
      const firstSheet = workbook.getActiveSheet()
      if (!initialWorkbook && initialSheets?.length) {
        initialSheets.forEach((sourceSheet, index) => {
          const sheet = index === 0 ? firstSheet : workbook.insertSheet(sourceSheet.name || `Hoja ${index + 1}`)
          if (!sheet) return
          sheet.setName(sourceSheet.name || `Hoja ${index + 1}`)
          const rows = sourceSheet.rows || []
          const columnCount = Math.max(0, ...rows.map((row) => row.length))
          if (rows.length && columnCount) sheet.getRange(`A1:${columnName(columnCount - 1)}${rows.length}`).setValues(rows.map((row) => Array.from({ length: columnCount }, (_, cellIndex) => row[cellIndex] ?? '')))
        })
      } else if (!initialWorkbook) {
        firstSheet?.setName('Hoja 1')
        if (initialHeaders) firstSheet?.getRange('A1:C1').setValues([['Columna 1', 'Columna 2', 'Columna 3']])
      }
      onReady({ save: () => instance?.univerAPI.getActiveWorkbook()?.save() || null })
    } catch (error) {
      onReady({ error: error instanceof Error ? error.message : 'No se pudo iniciar Univer.' })
    }

    return () => {
      onReady(null)
      instance?.univer.dispose()
    }
  }, [initialHeaders, initialSheets, initialWorkbook, onReady])

  return <div className="univer-sheet-host" ref={hostRef} aria-label="Editor de hojas de cálculo" />
}
