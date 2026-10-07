import { useEffect, useRef } from 'react'
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets'
import { UniverDocsCorePreset } from '@univerjs/preset-docs-core'
import UniverPresetDocsCoreEsES from '@univerjs/preset-docs-core/locales/es-ES'
import '@univerjs/preset-docs-core/lib/index.css'

export default function UniverDocEditor({ onReady, initialDocument = null, initialText = '' }) {
  const hostRef = useRef(null)

  useEffect(() => {
    if (!hostRef.current) return undefined
    let instance
    try {
      instance = createUniver({
        locale: LocaleType.ES_ES,
        locales: { [LocaleType.ES_ES]: mergeLocales(UniverPresetDocsCoreEsES) },
        presets: [UniverDocsCorePreset({ container: hostRef.current })],
      })
      const document = instance.univerAPI.createDocument(initialDocument || {})
      if (!initialDocument && initialText) document.insertText(0, initialText.replace(/\r?\n/g, '\r\n'))
      onReady({ save: () => instance?.univerAPI.getActiveDocument()?.save() || null })
    } catch (error) {
      onReady({ error: error instanceof Error ? error.message : 'No se pudo iniciar Univer Docs.' })
    }

    return () => {
      onReady(null)
      instance?.univer.dispose()
    }
  }, [initialDocument, initialText, onReady])

  return <div className="univer-doc-host" ref={hostRef} aria-label="Editor de documentos Word" />
}
