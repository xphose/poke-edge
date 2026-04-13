import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BookOpenText, CircleHelp, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { HELP_SECTIONS } from '@/lib/help-content'
import { cn } from '@/lib/utils'

type HelpCenterContextValue = {
  open: (sectionId?: string) => void
}

const HelpCenterContext = createContext<HelpCenterContextValue | null>(null)

export function HelpCenterProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeSectionId, setActiveSectionId] = useState<string>(HELP_SECTIONS[0]?.id ?? '')
  const [view, setView] = useState<'menu' | 'detail'>('menu')

  const sectionsByPage = useMemo(() => {
    const grouped = new Map<string, typeof HELP_SECTIONS>()
    for (const section of HELP_SECTIONS) {
      const list = grouped.get(section.page) ?? []
      list.push(section)
      grouped.set(section.page, list)
    }
    return grouped
  }, [])

  const ctx = useMemo<HelpCenterContextValue>(
    () => ({
      open: (sectionId?: string) => {
        if (sectionId) {
          setActiveSectionId(sectionId)
          setView('detail')
        } else {
          setView('menu')
        }
        setIsOpen(true)
      },
    }),
    [],
  )

  const active = HELP_SECTIONS.find((s) => s.id === activeSectionId) ?? HELP_SECTIONS[0]
  const activeIndex = Math.max(0, HELP_SECTIONS.findIndex((s) => s.id === active.id))
  const prevSection = activeIndex > 0 ? HELP_SECTIONS[activeIndex - 1] : null
  const nextSection = activeIndex < HELP_SECTIONS.length - 1 ? HELP_SECTIONS[activeIndex + 1] : null
  const sectionNumber = Math.max(
    1,
    HELP_SECTIONS.findIndex((s) => s.id === active.id) + 1,
  )

  return (
    <HelpCenterContext.Provider value={ctx}>
      {children}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          className="w-screen sm:max-w-none data-[side=right]:w-[100vw] sm:data-[side=right]:w-[42rem] md:data-[side=right]:w-[48rem]"
        >
          <SheetHeader className="border-b border-border bg-gradient-to-r from-muted/50 to-background">
            <SheetTitle className="flex items-center gap-2">
              <BookOpenText className="size-5 text-primary" />
              Help Center
            </SheetTitle>
            <SheetDescription>
              Definitions, formulas, and how each component works across every tab.
            </SheetDescription>
          </SheetHeader>
          {view === 'menu' ? (
            <div className="overflow-y-auto bg-muted/15 p-4 sm:p-5">
              {[...sectionsByPage.entries()].map(([page, sections]) => (
                <section key={page} className="mb-4 rounded-xl border border-border/80 bg-background/90 p-3">
                  <p className="mb-2 px-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {page}
                  </p>
                  <div className="space-y-2">
                    {sections.map((section) => {
                      const absoluteIndex = HELP_SECTIONS.findIndex((s) => s.id === section.id) + 1
                      return (
                        <button
                          key={section.id}
                          type="button"
                          className="w-full rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted"
                          onClick={() => {
                            setActiveSectionId(section.id)
                            setView('detail')
                          }}
                        >
                          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary/90">
                            Topic {absoluteIndex}
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-foreground">{section.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{section.summary}</p>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="overflow-y-auto bg-background p-4 sm:p-6">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setView('menu')}
                >
                  <Home className="size-4" />
                  All topics
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!prevSection}
                  onClick={() => {
                    if (!prevSection) return
                    setActiveSectionId(prevSection.id)
                  }}
                >
                  <ArrowLeft className="size-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!nextSection}
                  onClick={() => {
                    if (!nextSection) return
                    setActiveSectionId(nextSection.id)
                  }}
                >
                  Next
                  <ArrowRight className="size-4" />
                </Button>
              </div>

              <div className="mx-auto w-full rounded-xl border border-border/80 bg-gradient-to-b from-background to-muted/20 p-4 sm:p-5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-primary">
                  Topic {sectionNumber}
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{active.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{active.summary}</p>
              </div>

              <div className="mx-auto mt-4 w-full space-y-3 sm:space-y-4">
                {active.details.map((d, idx) => (
                  <article
                    key={d}
                    className="rounded-lg border border-border/80 bg-card/80 px-3 py-3 shadow-sm sm:px-4 sm:py-4"
                  >
                    <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      Key Point {idx + 1}
                    </p>
                    <p className="text-sm leading-relaxed text-foreground/90 sm:text-base">{d}</p>
                  </article>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setView('menu')}
                >
                  <ArrowLeft className="size-4" />
                  Back to topics
                </Button>
                {nextSection && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveSectionId(nextSection.id)}
                  >
                    Continue: {nextSection.title}
                    <ArrowRight className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </HelpCenterContext.Provider>
  )
}

export function useHelpCenter() {
  const ctx = useContext(HelpCenterContext)
  if (!ctx) {
    return {
      open: () => {
        /* no-op outside provider */
      },
    }
  }
  return ctx
}

export function HelpButton({ sectionId, className }: { sectionId: string; className?: string }) {
  const { open } = useHelpCenter()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn('text-muted-foreground', className)}
      title="Open help for this section"
      aria-label="Open help for this section"
      onClick={() => open(sectionId)}
    >
      <CircleHelp />
    </Button>
  )
}

export function HelpMenuButton({ className }: { className?: string }) {
  const { open } = useHelpCenter()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => open()}
      title="Open help center"
    >
      <CircleHelp />
      Help
    </Button>
  )
}
