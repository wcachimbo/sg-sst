import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { downloadCompanyFileBlob } from './documentService'
import { listDocumentSignatures } from './signatureService'
import { supabase } from '../../lib/supabase'

if (pdfjsLib?.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const SUPPORTED_SIGNATURE_MIMES = [DOCX_MIME, XLSX_MIME, 'application/pdf']

export function signatureTagFor(index) {
  return `[firm${String(index + 1).padStart(2, '0')}]`
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function removeTagFromRuns(paragraphXml, tag) {
  const runRegex = /<w:r\b[^>]*>[\s\S]*?<\/w:r>|<w:r\b[^>]*\/>/g
  const runs = [...paragraphXml.matchAll(runRegex)]
  if (!runs.length) return { xml: paragraphXml, found: false }
  const texts = runs.map((run) => {
    const joined = [...run[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXmlEntities(m[1])).join('')
    return joined
  })
  const fullText = texts.join('')
  const tagIndex = fullText.indexOf(tag)
  if (tagIndex < 0) return { xml: paragraphXml, found: false }

  let cursor = 0
  const newRuns = runs.map((run, runIndex) => {
    const runText = texts[runIndex]
    const runStart = cursor
    cursor += runText.length
    const tagStart = Math.max(tagIndex, runStart)
    const tagEnd = Math.min(tagIndex + tag.length, runStart + runText.length)
    let keptText = runText
    if (tagEnd > tagStart) {
      keptText = runText.slice(0, Math.max(0, tagIndex - runStart)) + runText.slice(Math.max(0, tagIndex + tag.length - runStart))
    }
    if (runText !== keptText) {
      const replaced = run[0].replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/, (_m, open, _t, close) => `${open}${escapeXml(keptText)}${close}`)
      return replaced
    }
    return run[0]
  })

  const drawingRun = '@@DRAWING_RUN@@'
  // El dibujo se inserta justo después del run donde empezaba el tag.
  let offset = 0
  let startRunIndex = runs.findIndex((_run, i) => {
    const start = texts.slice(0, i).join('').length
    const end = start + texts[i].length
    return tagIndex >= start && tagIndex < end
  })
  if (startRunIndex < 0) startRunIndex = 0
  let xml = paragraphXml
  runs.forEach((run, i) => {
    xml = xml.replace(run[0], newRuns[i])
  })
  xml = xml.replace(newRuns[startRunIndex], `${newRuns[startRunIndex]}${drawingRun}`)
  return { xml, found: true, offset }
}

function drawingRunXml(rId, widthEmu, heightEmu, docPrId, name) {
  return `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:docPr id="${docPrId}" name="${name}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}

async function embedInDocx(blob, signatures) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  let documentXml = await zip.file('word/document.xml').async('string')
  const relsPath = 'word/_rels/document.xml.rels'
  let relsXml = await zip.file(relsPath).async('string')
  let contentTypes = await zip.file('[Content_Types].xml').async('string')
  let relIdCounter = 100
  let docPrId = 100

  if (!/Extension="png"/.test(contentTypes)) {
    contentTypes = contentTypes.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>')
  }

  const EMU_PER_PX = 9525
  const widthEmu = 160 * EMU_PER_PX
  const heightEmu = 70 * EMU_PER_PX

  for (const [index, signature] of signatures.entries()) {
    const tag = signatureTagFor(index)
    const paragraphs = [...documentXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)]
    const target = paragraphs.find((match) => decodeXmlEntities(match[0].replace(/<[^>]+>/g, '')).includes(tag))
    if (!target) continue
    const { xml: cleanedParagraph, found } = removeTagFromRuns(target[0], tag)
    if (!found) continue
    const rId = `rIdFirmaEmbed${relIdCounter++}`
    const mediaName = `word/media/firma-embed-${index + 1}-${crypto.randomUUID()}.png`
    zip.file(mediaName, await signature.png.arrayBuffer())
    relsXml = relsXml.replace('</Relationships>', `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${mediaName.replace(/^word\//, '')}"/></Relationships>`)
    const finalParagraph = cleanedParagraph.replace('@@DRAWING_RUN@@', drawingRunXml(rId, widthEmu, heightEmu, docPrId++, `firma${index + 1}.png`))
    documentXml = documentXml.replace(target[0], finalParagraph)
  }

  zip.file('word/document.xml', documentXml)
  zip.file(relsPath, relsXml)
  zip.file('[Content_Types].xml', contentTypes)
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME })
}

async function embedInXlsx(blob, signatures) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const images = []
  for (const [index, signature] of signatures.entries()) {
    const tag = signatureTagFor(index)
    let placed = false
    workbook.eachSheet((worksheet) => {
      if (placed) return
      worksheet.eachRow((row, rowNumber) => {
        if (placed) return
        row.eachCell((cell, colNumber) => {
          if (placed) return
          const value = typeof cell.value === 'string' ? cell.value : cell.value?.richText?.map((part) => part.text).join('') || ''
          if (!value.includes(tag)) return
          cell.value = value.replaceAll(tag, '')
          placed = { worksheet, colNumber: colNumber - 1, rowNumber: rowNumber - 1 }
        })
      })
    })
    const pngBuffer = await signature.png.arrayBuffer()
    const imageId = workbook.addImage({ buffer: pngBuffer, extension: 'png' })
    if (placed) {
      placed.worksheet.addImage(imageId, { tl: { col: placed.colNumber, row: placed.rowNumber }, ext: { width: 160, height: 70 }, editAs: 'oneCell' })
    } else {
      const sheet = workbook.worksheets[0]
      sheet.addImage(imageId, { tl: { col: 1, row: sheet.rowCount + 1 }, ext: { width: 160, height: 70 }, editAs: 'oneCell' })
    }
  }
  return workbook.xlsx.writeBuffer().then((buffer) => new Blob([buffer], { type: XLSX_MIME }))
}

async function embedInPdf(blob, signatures) {
  const pdfBytes = await blob.arrayBuffer()
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise
  const positions = new Map()

  for (let pageIndex = 0; pageIndex < pdfJsDoc.numPages; pageIndex += 1) {
    const page = await pdfJsDoc.getPage(pageIndex + 1)
    const textContent = await page.getTextContent()
    for (const item of textContent.items) {
      signatures.forEach((signature, index) => {
        const tag = signatureTagFor(index)
        if (!item.str.includes(tag) || positions.has(index)) return
        const [scaleX, , , scaleY, x, y] = item.transform
        positions.set(index, { pageIndex, x, y, width: item.width || Math.abs(scaleX) * tag.length * 0.5, height: item.height || Math.abs(scaleY) || 12 })
      })
    }
  }

  const pages = pdfDoc.getPages()
  for (const [index, signature] of signatures.entries()) {
    const position = positions.get(index)
    if (!position) continue
    const page = pages[position.pageIndex]
    const pngImage = await pdfDoc.embedPng(await signature.png.arrayBuffer())
    const width = 150
    const height = (pngImage.height / pngImage.width) * width
    page.drawRectangle({ x: position.x, y: position.y - 2, width: position.width || width * 0.5, height: position.height + 4, color: rgb(1, 1, 1) })
    page.drawImage(pngImage, { x: position.x, y: position.y - 4, width, height })
  }

  // Los marcadores no encontrados se agrupan en una página final de firmas.
  const missing = signatures.filter((_signature, index) => !positions.has(index))
  if (missing.length) {
    const page = pdfDoc.addPage()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    let y = page.getHeight() - 60
    page.drawText('Firmas electrónicas', { x: 50, y, size: 16, font })
    y -= 30
    for (const signature of missing) {
      const pngImage = await pdfDoc.embedPng(await signature.png.arrayBuffer())
      const width = 150
      const height = (pngImage.height / pngImage.width) * width
      page.drawText(signature.signerName || '', { x: 50, y, size: 11, font })
      page.drawImage(pngImage, { x: 50, y: y - height - 6, width, height })
      y -= height + 40
    }
  }
  const bytes = await pdfDoc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

export async function buildSignedDocument({ file, signatures }) {
  const mime = file.mime_type || ''
  const original = await downloadCompanyFileBlob(file)
  if (!signatures.length) return { blob: original, changed: false }
  if (mime === DOCX_MIME || /\.docx$/i.test(file.nombre || '')) {
    return { blob: await embedInDocx(original, signatures), changed: true, extension: 'docx' }
  }
  if (mime === XLSX_MIME || /\.xlsx$/i.test(file.nombre || '')) {
    return { blob: await embedInXlsx(original, signatures), changed: true, extension: 'xlsx' }
  }
  if (mime === 'application/pdf' || /\.pdf$/i.test(file.nombre || '')) {
    return { blob: await embedInPdf(original, signatures), changed: true, extension: 'pdf' }
  }
  return { blob: original, changed: false }
}

async function downloadSignaturePng(firmaPath) {
  const { data, error } = await supabase.storage.from('firmas-documentos').download(firmaPath)
  if (error) throw new Error(error.message)
  return data
}

export async function buildSignedFileForRow(file) {
  const rows = (await listDocumentSignatures([file.id]))
    .filter((row) => row.estado === 'firmado')
    .sort((a, b) => new Date(a.solicitada_en) - new Date(b.solicitada_en))
  if (!rows.length) throw new Error('Este documento todavía no tiene firmas registradas.')
  const signatures = []
  for (const row of rows) {
    if (!row.firma_path) continue
    signatures.push({ png: await downloadSignaturePng(row.firma_path), signerName: row.firmante_nombre })
  }
  if (!signatures.length) throw new Error('No se encontraron imágenes de firma para incrustar.')
  return buildSignedDocument({ file, signatures })
}
