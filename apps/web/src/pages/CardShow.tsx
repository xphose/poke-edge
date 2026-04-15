import { Button } from '@/components/ui/button'
import { HelpButton } from '@/components/help-center'

export function CardShowPage() {
  const download = async () => {
    const res = await fetch('/api/export/card-show')
    const html = await res.text()
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pokegrails-card-show-${new Date().toISOString().slice(0, 10)}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const openPreview = async () => {
    const res = await fetch('/api/export/card-show')
    const html = await res.text()
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-start gap-1">
        <p className="text-muted-foreground">
          Export a print-friendly single page for offline floor usage.
        </p>
        <HelpButton sectionId="card-show-overview" className="mt-[-2px]" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={download}>
          Download HTML
        </Button>
        <Button type="button" variant="secondary" onClick={openPreview}>
          Preview in new tab
        </Button>
      </div>
    </div>
  )
}
