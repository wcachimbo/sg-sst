import ExcelJS from 'exceljs'
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function printableValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function makeWordTable(field, rows = []) {
  const columns = field.columns || []
  const header = new TableRow({
    tableHeader: true,
    children: columns.map((column) => new TableCell({
      children: [new Paragraph({ text: column.label })],
    })),
  })
  const body = rows.map((row) => new TableRow({
    children: columns.map((column) => new TableCell({
      children: [new Paragraph({ text: printableValue(row[column.id]) })],
    })),
  }))

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...body],
  })
}

export async function generateWordFile({ template, company, values }) {
  const documentSnapshot = template.formato?.document
  if (documentSnapshot?.body) {
    const fieldsByLabel = new Map((template.formato.fields || []).map((field) => [field.label.trim().toLocaleLowerCase('es-CO'), values[field.id] || '']))
    const date = new Date().toLocaleDateString('es-CO')
    const body = documentSnapshot.body
    const stream = (body.dataStream || '').replace(/\0/g, '')
    const replacePlaceholder = (rawLabel) => {
        const label = rawLabel.trim()
        const normalized = label.toLocaleLowerCase('es-CO')
        if (normalized === 'empresa') return company.name
        if (normalized === 'fecha') return date
        return fieldsByLabel.get(normalized) || ''
      }
    const toTextRun = (text, style = {}) => new TextRun({
      text,
      ...(style.bl === 1 ? { bold: true } : {}),
      ...(style.it === 1 ? { italics: true } : {}),
      ...(style.ul ? { underline: {} } : {}),
      ...(style.ff ? { font: style.ff } : {}),
      ...(Number(style.fs) > 0 ? { size: Math.round(style.fs * 2) } : {}),
      ...(style.cl?.rgb ? { color: style.cl.rgb.replace('#', '') } : {}),
    })
    const makeStyledRuns = (line, lineStart) => {
      const runs = body.textRuns || []
      const result = []
      const appendStyled = (start, end, replacement) => {
        if (replacement !== undefined) {
          const style = runs.find((run) => run.st <= lineStart + start && run.ed > lineStart + start)?.ts || {}
          if (replacement) result.push(toTextRun(replacement, style))
          return
        }
        const boundaries = new Set([start, end])
        for (const run of runs) {
          if (run.ed <= lineStart + start || run.st >= lineStart + end) continue
          boundaries.add(Math.max(start, run.st - lineStart))
          boundaries.add(Math.min(end, run.ed - lineStart))
        }
        const positions = [...boundaries].sort((a, b) => a - b)
        for (let index = 0; index < positions.length - 1; index += 1) {
          const segmentStart = positions[index]
          const segmentEnd = positions[index + 1]
          const style = runs.find((run) => run.st <= lineStart + segmentStart && run.ed > lineStart + segmentStart)?.ts || {}
          const text = line.slice(segmentStart, segmentEnd).replace(/[\f\v]/g, ' ')
          if (text) result.push(toTextRun(text, style))
        }
      }
      const placeholderPattern = /\{\{\s*([^{}]+?)\s*\}\}/g
      let cursor = 0
      for (const match of line.matchAll(placeholderPattern)) {
        const start = match.index
        appendStyled(cursor, start)
        appendStyled(start, start + match[0].length, replacePlaceholder(match[1]))
        cursor = start + match[0].length
      }
      appendStyled(cursor, line.length)
      return result.length ? result : [new TextRun('')]
    }
    const paragraphs = []
    let offset = 0
    for (const line of stream.split(/\r\n|\n/)) {
      paragraphs.push(new Paragraph({ children: makeStyledRuns(line, offset) }))
      offset += line.length + (stream.slice(offset + line.length, offset + line.length + 2) === '\r\n' ? 2 : 1)
    }
    const document = new Document({ sections: [{ children: paragraphs.length ? paragraphs : [new Paragraph({ text: '' })] }] })
    return Packer.toBlob(document)
  }

  const children = [
    new Paragraph({ text: template.nombre, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Empresa: ${company.name}` }),
    new Paragraph({ text: `Fecha de creación: ${new Date().toLocaleDateString('es-CO')}` }),
    new Paragraph({ text: '' }),
  ]

  for (const field of template.formato?.fields || []) {
    children.push(new Paragraph({ text: field.label, heading: HeadingLevel.HEADING_2 }))
    if (field.type === 'table') {
      children.push(makeWordTable(field, values[field.id] || []))
      children.push(new Paragraph({ text: '' }))
    } else {
      children.push(new Paragraph({ text: printableValue(values[field.id]) }))
    }
  }

  const document = new Document({ sections: [{ children }] })
  return Packer.toBlob(document)
}

function safeSheetName(name, usedNames) {
  const base = (name || 'Datos').replace(/[\\/*?:\[\]]/g, ' ').slice(0, 31) || 'Datos'
  let candidate = base
  let suffix = 2
  while (usedNames.has(candidate.toLowerCase())) {
    const ending = ` ${suffix++}`
    candidate = `${base.slice(0, 31 - ending.length)}${ending}`
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}

export async function generateExcelFile({ template, company, values }) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SG-SST Platform'
  workbook.created = new Date()
  workbook.subject = company.name
  const usedNames = new Set()

  if (Array.isArray(template.formato?.sheets) && template.formato.sheets.length) {
    for (const templateSheet of template.formato.sheets) {
      const columns = templateSheet.columns || []
      const rows = values[templateSheet.id] || []
      const worksheet = workbook.addWorksheet(safeSheetName(templateSheet.name, usedNames))
      worksheet.addRow(columns.map((column) => column.label))
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176749' } }
      worksheet.getRow(1).alignment = { vertical: 'middle', wrapText: true }
      worksheet.columns = columns.map(() => ({ width: 24 }))
      worksheet.views = [{ state: 'frozen', ySplit: 1 }]
      const rowCount = Math.max(Number(templateSheet.rowCount) || 1, rows.length)
      for (let index = 0; index < rowCount; index += 1) {
        const row = rows[index] || {}
        worksheet.addRow(columns.map((column) => row[column.id] || ''))
      }
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: rowCount + 1, column: columns.length },
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return new Blob([buffer], { type: XLSX_MIME })
  }

  const generalFields = (template.formato?.fields || []).filter((field) => field.type !== 'table')
  const generalSheet = workbook.addWorksheet(safeSheetName('Información general', usedNames))

  generalSheet.addRow([template.nombre])
  generalSheet.addRow(['Empresa', company.name])
  generalSheet.addRow(['Fecha de creación', new Date().toLocaleDateString('es-CO')])
  generalSheet.addRow([])
  generalSheet.addRow(['Campo', 'Información'])
  for (const field of generalFields) generalSheet.addRow([field.label, printableValue(values[field.id])])
  generalSheet.columns = [{ width: 32 }, { width: 60 }]
  generalSheet.getRow(1).font = { bold: true, size: 16, color: { argb: 'FF176749' } }
  generalSheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  generalSheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176749' } }

  for (const field of (template.formato?.fields || []).filter((item) => item.type === 'table')) {
    const sheet = workbook.addWorksheet(safeSheetName(field.label, usedNames))
    sheet.addRow((field.columns || []).map((column) => column.label))
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176749' } }
    for (const row of values[field.id] || []) {
      sheet.addRow((field.columns || []).map((column) => printableValue(row[column.id])))
    }
    sheet.columns = (field.columns || []).map(() => ({ width: 24 }))
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME })
}

export async function generateBlankExcelFile(workbookSnapshot) {
  if (!workbookSnapshot?.sheetOrder?.length) throw new Error('No se encontró ninguna hoja de cálculo para guardar.')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SG-SST Platform'
  const usedNames = new Set()

  for (const sheetId of workbookSnapshot.sheetOrder) {
    const sourceSheet = workbookSnapshot.sheets?.[sheetId]
    if (!sourceSheet) continue
    const worksheet = workbook.addWorksheet(safeSheetName(sourceSheet.name, usedNames))
    const cells = sourceSheet.cellData || {}
    const rowIndexes = Object.keys(cells).map(Number).filter(Number.isInteger)
    const lastRow = rowIndexes.length ? Math.max(...rowIndexes) : -1
    for (let rowIndex = 0; rowIndex <= lastRow; rowIndex += 1) {
      const rowCells = cells[rowIndex] || {}
      const columnIndexes = Object.keys(rowCells).map(Number).filter(Number.isInteger)
      const lastColumn = columnIndexes.length ? Math.max(...columnIndexes) : -1
      const values = Array.from({ length: lastColumn + 1 }, (_, columnIndex) => {
        const cell = rowCells[columnIndex]
        if (cell?.f) return { formula: String(cell.f).replace(/^=/, ''), result: cell.v ?? undefined }
        return cell?.v ?? ''
      })
      worksheet.addRow(values)
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME })
}

export async function generateTemplateFile(options) {
  if (options.template.formato?.fileType === 'xlsx') return generateExcelFile(options)
  return generateWordFile(options)
}
